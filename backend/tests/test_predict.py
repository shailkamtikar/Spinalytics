import json
from pathlib import Path

import pytest

from app import anatomy
from app.ml import predict as P
from app.schemas.analysis import AnalyzeRequest

ARTIFACTS = Path(__file__).resolve().parents[1] / "app" / "artifacts"
ROOT = Path(__file__).resolve().parents[2]


def test_t_3_3_01_healthy_case(case_request):
    r = P.predict(case_request(1))
    assert r.status == "ok" and r.label in ("within_reference", "indeterminate") and 0 <= r.score <= 1 and r.person_context_used


def test_t_3_3_02_unusual_case(case_request):
    r = P.predict(case_request(2))
    assert r.status == "ok" and r.label == "unusual_pattern"


def test_t_3_3_03_missing_input(case_request):
    r = P.predict(case_request(8))
    assert r.status == "insufficient_data" and r.score is None and r.label is None and r.missing_count == 151


def test_t_3_3_04_one_field_missing(case_request, cases):
    m = {k: v for k, v in cases[0]["measurements"].items() if k != "T5_vertebral_body_depth_mm"}
    r = P.predict(case_request(1, measurements=m))
    assert r.status == "insufficient_data" and r.missing_count == 1 and r.score is None


def test_t_3_3_05_out_of_distribution(case_request, cases):
    m = {k: (v * 1.6 if k.endswith("_mm") else v) for k, v in cases[0]["measurements"].items()}
    r = P.predict(case_request(1, measurements=m))
    assert r.status == "out_of_distribution" and r.label is None and r.score is None and r.out_of_range_count > P.OOD_MAX_COLUMNS


def test_t_3_3_06_indeterminate_band(case_request):
    assert P.label_for(0.5) == "indeterminate" and P.label_for(0.39) == "within_reference" and P.label_for(0.61) == "unusual_pattern"
    assert P.predict(case_request(7), band=(0.0, 1.0)).label == "indeterminate"


def test_t_3_3_07_explanation_localises(case_request):
    top = P.predict(case_request(2)).contributors[0]
    assert "heights" in top.group and top.level == "C3" and top.change > 0


def test_t_3_3_08_explanation_shape(case_request):
    for n in (1, 3, 4):
        c = P.predict(case_request(n)).contributors
        assert 1 <= len(c) <= 5
        assert [abs(x.logit_change) for x in c] == sorted((abs(x.logit_change) for x in c), reverse=True)
        assert all(isinstance(x.change, float) for x in c)


def test_t_3_3_09_calibration():
    cal = json.loads((ARTIFACTS / "model_metrics.json").read_text(encoding="utf-8"))["calibration"]
    assert cal["full"]["max_bin_gap"] <= 0.10 and cal["spine_only"]["max_bin_gap"] <= 0.10
    assert len(cal["full"]["reliability_before"]["bins"]) == 10


def test_t_3_3_10_model_file_missing(tmp_path, monkeypatch, case_request):
    monkeypatch.setattr(P, "MODEL_PATH", tmp_path / "missing.joblib")
    P.load_bundle.cache_clear()
    try:
        r = P.predict(case_request(1))
    finally:
        P.load_bundle.cache_clear()
    assert r.status == "unavailable" and r.score is None


def test_t_3_3_11_deterministic(case_request):
    assert P.predict(case_request(3)) == P.predict(case_request(3))


def test_t_3_3_12_model_card_complete():
    card = (ROOT / "docs" / "MODEL_CARD.md").read_text(encoding="utf-8")
    metrics = json.loads((ARTIFACTS / "model_metrics.json").read_text(encoding="utf-8"))
    for heading in ("Data origin", "Intended use", "Method", "Validation results", "Held-out test results", "Calibration and abstention", "Explanation", "Statistical engine", "Limitations", "Non-diagnostic statement"):
        assert f"## {heading}" in card
    assert "Synthetic, development-only" in card and "does not provide a diagnosis" in card
    assert f"{metrics['test']['full']['roc_auc']:.3f}" in card and f"{metrics['candidates_validation']['gradient_boosting']['roc_auc']:.3f}" in card
    rule = json.loads((ARTIFACTS / "reference_stats.json").read_text(encoding="utf-8"))["overall_rule"]
    assert f"{100 * rule['validation_false_flag_rate']:.1f}%" in card


def test_spine_only_fallback_when_person_fields_missing(case_request):
    r = P.predict(case_request(1, person={"age_years": 40}))
    assert r.status == "ok" and r.person_context_used is False
    assert all(c.target_type != "person" for c in r.contributors)


def test_all_sample_cases_never_raise(case_request):
    out = [P.predict(case_request(i)).status for i in range(1, 9)]
    assert out == ["ok"] * 7 + ["insufficient_data"]


def test_input_errors_still_raise():
    from app.analysis.validation import InputValidationError

    with pytest.raises(InputValidationError):
        P.predict(AnalyzeRequest(measurements={"L3_vertebral_body_width_mm": "abc"}))


def test_no_value_is_imputed():
    r = P.predict(AnalyzeRequest(measurements={c: 10.0 for c in anatomy.spine_columns()[:100]}))
    assert r.status == "insufficient_data" and r.missing_count == len(anatomy.spine_columns()) - 100
