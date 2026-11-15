from fastapi.testclient import TestClient

from app.config import Settings, get_settings
from app.main import app

client = TestClient(app)


def _with_key(key: str):
    app.dependency_overrides[get_settings] = lambda: Settings(_env_file=None, gemini_api_key=key)


def teardown_function():
    app.dependency_overrides.clear()


def test_health_ok():
    _with_key("")
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok", "version": "0.1.0", "ai_assistant_configured": False}


def test_health_reports_key_presence_without_echoing_it():
    _with_key("secret-test-value")
    r = client.get("/api/health")
    assert r.json()["ai_assistant_configured"] is True
    assert "secret-test-value" not in r.text


def test_unknown_route_is_json_404():
    r = client.get("/api/nope")
    assert r.status_code == 404
    assert r.headers["content-type"].startswith("application/json")
    assert "Traceback" not in r.text
