import sys
import time

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.schemas.analysis import AnalyzeResponse
from app.services import analysis_service

EXPECTED = {1: "within_reference", 2: "unusual_pattern", 3: "unusual_pattern", 4: "unusual_pattern", 5: "unusual_pattern", 6: "unusual_pattern", 7: "unusual_pattern", 8: "indeterminate"}


def test_t_4_1_01_valid_request(client, case_body):
    r = client.post("/api/analyze", json=case_body(1))
    assert r.status_code == 200
    body = AnalyzeResponse.model_validate(r.json())
    assert len(body.statistical.findings) >= 204 and body.data_origin == "synthetic" and "not a medical device" in body.disclaimer


def test_t_4_1_02_unusual_case(client, case_body):
    body = client.post("/api/analyze", json=case_body(2)).json()
    assert body["overall"]["state"] == "unusual_pattern"
    c3 = next(lv for lv in body["statistical"]["levels"] if lv["level"] == "C3")
    assert c3["status"] in ("review", "large_deviation")


def test_t_4_1_03_incomplete_case(client, case_body):
    body = client.post("/api/analyze", json=case_body(8)).json()
    assert body["overall"]["state"] == "indeterminate" and body["model"]["status"] == "insufficient_data"


def test_t_4_1_04_missing_body(client):
    r = client.post("/api/analyze")
    assert r.status_code == 422 and r.json()["error"]["code"] == "validation_error"
    assert r.json()["error"]["fields"]
    assert client.post("/api/analyze", json={}).status_code == 200  # an empty object is a valid, empty request


def test_t_4_1_05_bad_unit(client):
    r = client.post("/api/analyze", json={"units": {"length": "cm", "angle": "deg"}, "measurements": {}})
    assert r.status_code == 422 and "'cm'" in r.text


def test_t_4_1_06_unknown_column(client, case_body):
    body = case_body(1)
    body["measurements"]["foo"] = 1
    data = client.post("/api/analyze", json=body).json()
    assert [u["column"] for u in data["statistical"]["unrecognised_columns"]] == ["foo"]


def test_t_4_1_07_no_stack_trace(monkeypatch, case_body):
    def boom(_):
        raise RuntimeError("secret internal detail")

    monkeypatch.setattr(analysis_service, "analyze", boom)
    with TestClient(app, raise_server_exceptions=False) as c:
        r = c.post("/api/analyze", json=case_body(1))
    assert r.status_code == 500 and r.json()["error"]["code"] == "internal_error"
    assert "secret internal detail" not in r.text and "Traceback" not in r.text


def test_t_4_1_08_gemini_isolation(monkeypatch, client, case_body):
    monkeypatch.setenv("GEMINI_API_KEY", "")
    from app.config import get_settings

    get_settings.cache_clear()
    try:
        assert client.post("/api/analyze", json=case_body(1)).status_code == 200
    finally:
        get_settings.cache_clear()
    assert not [m for m in sys.modules if m == "google" or m.startswith("google.genai")]
    import inspect

    from app.api import analyze

    src = inspect.getsource(analyze) + inspect.getsource(analysis_service)
    assert "genai" not in src and "app.ai" not in src


def test_t_4_1_09_schema_in_openapi(client):
    schemas = client.get("/openapi.json").json()["components"]["schemas"]
    assert "AnalyzeRequest" in schemas and "AnalyzeResponse" in schemas


def test_t_4_1_10_unique_ids(client, case_body):
    a = client.post("/api/analyze", json=case_body(1)).json()
    b = client.post("/api/analyze", json=case_body(1)).json()
    assert a["analysis_id"] != b["analysis_id"] and a["statistical"] == b["statistical"]


def test_t_4_1_11_speed(client, case_body):
    client.post("/api/analyze", json=case_body(1))
    start = time.perf_counter()
    client.post("/api/analyze", json=case_body(2))
    assert time.perf_counter() - start < 0.5


@pytest.mark.parametrize("number", range(1, 9))
def test_all_eight_cases_have_expected_overall_state(client, case_body, number):
    r = client.post("/api/analyze", json=case_body(number))
    assert r.status_code == 200 and r.json()["overall"]["state"] == EXPECTED[number]


def test_invalid_number_returns_field_list(client):
    r = client.post("/api/analyze", json={"measurements": {"L3_vertebral_body_width_mm": "abc"}})
    assert r.status_code == 422 and r.json()["error"]["fields"][0]["field"] == "L3_vertebral_body_width_mm"


def test_extra_top_level_field_is_rejected(client):
    r = client.post("/api/analyze", json={"measurements": {}, "name": "Jane"})
    assert r.status_code == 422 and "name" in r.text


def test_combine_rules():
    from app.schemas.analysis import ModelResult, StatisticalResult

    def stat(state):
        return StatisticalResult.model_construct(overall_state=state, reason="r")

    ok = lambda label: ModelResult(status="ok", label=label, score=0.5)  # noqa: E731
    abstain = ModelResult(status="insufficient_data")
    c = analysis_service.combine
    assert c(stat("indeterminate"), ok("unusual_pattern")).state == "indeterminate"
    assert c(stat("within_reference"), ok("unusual_pattern")).state == "unusual_pattern"
    assert c(stat("unusual_pattern"), ok("within_reference")).state == "unusual_pattern"
    assert c(stat("within_reference"), ok("within_reference")).state == "within_reference"
    assert c(stat("within_reference"), abstain).state == "within_reference"
    assert c(stat("within_reference"), ok("indeterminate")).state == "indeterminate"
