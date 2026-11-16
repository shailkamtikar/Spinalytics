import json
from pathlib import Path

from app.schemas.analysis import AnalyzeRequest

ARTIFACTS = Path(__file__).resolve().parents[1] / "app" / "artifacts"


def test_t_4_2_01_list_cases(client):
    r = client.get("/api/sample-cases")
    items = r.json()
    assert r.status_code == 200 and len(items) == 8 and all(i["data_origin"] == "synthetic" for i in items)
    assert r.headers["cache-control"] == "public, max-age=3600"


def test_t_4_2_02_get_case(client):
    cid = client.get("/api/sample-cases").json()[0]["case_id"]
    body = client.get(f"/api/sample-cases/{cid}").json()
    AnalyzeRequest.model_validate(body["request"])
    assert body["request"]["source"] == "sample"


def test_t_4_2_03_round_trip(client):
    for item in client.get("/api/sample-cases").json():
        req = client.get(f"/api/sample-cases/{item['case_id']}").json()["request"]
        assert client.post("/api/analyze", json=req).status_code == 200


def test_t_4_2_04_unknown_case(client):
    r = client.get("/api/sample-cases/nope")
    assert r.status_code == 404 and r.json()["error"]["code"] == "not_found"


def test_t_4_2_05_no_hidden_label(client):
    for item in client.get("/api/sample-cases").json():
        text = json.dumps(client.get(f"/api/sample-cases/{item['case_id']}").json()).lower()
        for hidden in ("ground_truth", "is_healthy", "pattern_family", "perturbed_levels", "effect_tier"):
            assert hidden not in text


def test_t_4_2_06_reference_info(client):
    body = client.get("/api/reference-info").json()
    assert "Not a clinical reference range" in body["provenance"]["limitation"]
    assert "Non-clinical" in body["thresholds"]["label"] and body["cohorts"]["all"]["n_rows"] > 0
    assert len(body["level_sizes"]["vertebrae"]) == 22 and len(body["level_sizes"]["discs"]) == 23
    assert all({"height_mm", "sagittal_angle_deg"} <= d.keys() for d in body["level_sizes"]["discs"].values())


def test_t_4_2_07_model_info(client):
    body = client.get("/api/model-info").json()
    assert body["metrics"] == json.loads((ARTIFACTS / "model_metrics.json").read_text(encoding="utf-8"))
    assert body["data_origin"] == "synthetic" and "synthetic" in body["training_data"].lower() or "Generated" in body["training_data"]


def test_t_4_2_08_catalog(client):
    body = client.get("/api/feature-catalog").json()
    assert len([f for f in body["features"] if not f["derived"]]) == 220
    assert all({"level", "unit", "kind"} <= f.keys() for f in body["features"])


def test_t_4_2_09_path_traversal(client):
    for path in ("/api/sample-cases/..%2F..%2F.env", "/api/sample-cases/../../.env", "/api/sample-cases/%2e%2e%2f.env"):
        r = client.get(path)
        assert r.status_code == 404 and "GEMINI" not in r.text


def test_endpoints_visible_in_docs(client):
    paths = client.get("/openapi.json").json()["paths"]
    for p in ("/api/analyze", "/api/sample-cases", "/api/sample-cases/{case_id}", "/api/reference-info", "/api/model-info", "/api/feature-catalog", "/api/health"):
        assert p in paths
