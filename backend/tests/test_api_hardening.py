import logging
import time

from app.config import get_settings


def test_t_4_3_01_allowed_origin(client):
    r = client.options("/api/analyze", headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type"})
    assert r.headers.get("access-control-allow-origin") == "http://localhost:5173"


def test_t_4_3_02_disallowed_origin(client):
    r = client.options("/api/analyze", headers={"Origin": "http://evil.example", "Access-Control-Request-Method": "POST"})
    assert "access-control-allow-origin" not in r.headers
    r = client.post("/api/analyze", json={}, headers={"Origin": "http://evil.example"})
    assert "access-control-allow-origin" not in r.headers


def test_no_wildcard_origin_ever(monkeypatch):
    monkeypatch.setenv("ALLOWED_ORIGINS", "*, https://app.example")
    get_settings.cache_clear()
    try:
        assert get_settings().origins == ["https://app.example"]
    finally:
        get_settings.cache_clear()


def test_t_4_3_03_oversized_body(client):
    big = {"measurements": {"x": "a" * 1_000_000}}
    r = client.post("/api/analyze", json=big)
    assert r.status_code == 413 and r.json()["error"]["code"] == "payload_too_large"


def test_oversized_body_without_content_length(client):
    def chunks():
        for _ in range(40):
            yield b"a" * 10_000

    r = client.post("/api/analyze", content=chunks(), headers={"Content-Type": "application/json"})
    assert r.status_code == 413


def test_t_4_3_04_and_05_rate_limit_and_recovery(monkeypatch, client):
    monkeypatch.setenv("ANALYZE_RATE_LIMIT", "2/second")
    get_settings.cache_clear()
    try:
        codes = [client.post("/api/analyze", json={}).status_code for _ in range(4)]
        assert codes[:2] == [200, 200] and codes[2:] == [429, 429]
        limited = client.post("/api/analyze", json={})
        assert limited.json()["error"]["code"] == "rate_limited" and "retry-after" in limited.headers
        time.sleep(1.2)
        assert client.post("/api/analyze", json={}).status_code == 200
    finally:
        get_settings.cache_clear()


def test_t_4_3_06_malformed_json(client):
    r = client.post("/api/analyze", content=b"{bad", headers={"Content-Type": "application/json"})
    assert r.status_code == 422 and "Traceback" not in r.text and r.json()["error"]["code"] == "validation_error"


def test_t_4_3_07_wrong_method(client):
    r = client.get("/api/analyze")
    assert r.status_code == 405 and r.json()["error"]["code"] == "method_not_allowed"


def test_t_4_3_08_logs_are_clean(monkeypatch, client, caplog, cases):
    secret = "sk-test-secret-key-98765"
    monkeypatch.setenv("GEMINI_API_KEY", secret)
    get_settings.cache_clear()
    body = {"source": "sample", "units": cases[0]["units"], "person": cases[0]["person"], "measurements": cases[0]["measurements"]}
    try:
        with caplog.at_level(logging.DEBUG):
            assert client.post("/api/analyze", json=body).status_code == 200
    finally:
        get_settings.cache_clear()
    logged = "\n".join(r.getMessage() for r in caplog.records)
    assert secret not in logged
    for value in list(cases[0]["measurements"].values())[:30]:
        assert repr(value) not in logged.replace("completeness=1.00", "")
    assert "analysis" in logged


def test_t_4_3_09_security_headers(client):
    for path, method in (("/api/health", "get"), ("/api/analyze", "get"), ("/nope", "get")):
        r = getattr(client, method)(path)
        assert r.headers["x-content-type-options"] == "nosniff" and r.headers["referrer-policy"] == "no-referrer"
    r = client.post("/api/analyze", json={"measurements": {"x": "a" * 1_000_000}})
    assert r.headers["x-content-type-options"] == "nosniff"


def test_health_still_ok(client):
    r = client.get("/api/health")
    assert r.status_code == 200 and r.json()["status"] == "ok"
