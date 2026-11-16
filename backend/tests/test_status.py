import json
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from app.analysis.engine import run_statistical_analysis
from app.analysis.reference import get_reference
from app.analysis.status import roll_up, status_for_z
from app.config import AnalysisConfig
from app.schemas.analysis import AnalyzeRequest, Finding
from scripts.calibrate_overall_rule import flagged, row_features, z_matrix

ROOT = Path(__file__).resolve().parents[2]


def _finding(column, level, target, status, z):
    return Finding(column=column, target_type=target, level=level, region="lumbar", feature="f", unit="mm", status=status, z_score=z)


def test_t_2_3_01_threshold_edges():
    got = [status_for_z(z) for z in (2.0, 2.01, 3.5, 3.51, -3.51)]
    assert got == ["within", "review", "review", "large_deviation", "large_deviation"]


def test_t_2_3_02_missing_is_grey():
    r = run_statistical_analysis(AnalyzeRequest(measurements={"L3_vertebral_body_width_mm": None}))
    assert all(f.status == "missing" for f in r.findings) and all(lv.status == "missing" for lv in r.levels)


def test_t_2_3_03_level_roll_up():
    levels = roll_up([_finding("L3_a", "L3", "vertebra", "review", 2.5), _finding("L3_b", "L3", "vertebra", "large_deviation", 4.0), _finding("L3_c", "L3", "vertebra", "within", 0.1)])
    l3 = next(lv for lv in levels if lv.level == "L3")
    assert l3.status == "large_deviation" and l3.worst_column == "L3_b"


def test_t_2_3_04_disc_mapping():
    levels = roll_up([_finding("L4_L5_disc_height_mm", "L4-L5", "disc", "large_deviation", 5.0), _finding("L4_w", "L4", "vertebra", "within", 0.0), _finding("L5_w", "L5", "vertebra", "within", 0.0)])
    by = {lv.level: lv.status for lv in levels}
    assert by["L4-L5"] == "large_deviation" and by["L4"] == "within" and by["L5"] == "within"


def test_t_2_3_05_indeterminate(case_request):
    r = run_statistical_analysis(case_request(8))
    assert r.overall_state == "indeterminate" and "completeness" not in r.reason.lower() and "%" in r.reason


def test_t_2_3_06_within_reference(case_request):
    assert run_statistical_analysis(case_request(1)).overall_state == "within_reference"


@pytest.mark.parametrize("n", [2, 3, 4])
def test_t_2_3_07_unusual(case_request, n):
    r = run_statistical_analysis(case_request(n))
    assert r.overall_state == "unusual_pattern" and r.flagged_levels


def test_t_2_3_08_chance_outliers_tolerated():
    ref = get_reference()
    cols = [c for c in ref.data["cohorts"]["all"]["columns"] if c.endswith("_disc_height_mm")]
    from app import anatomy

    values = {c: ref.stats("all", c)["mean"] for c in anatomy.spine_columns()}
    for c in cols[:5]:
        s = ref.stats("all", c)
        values[c] = s["mean"] + 2.1 * s["sd"]
    r = run_statistical_analysis(AnalyzeRequest(measurements=values))
    assert r.outlier_count == 5 <= ref.chance_outlier_limit and r.overall_state == "within_reference"


def _validation_frames():
    data, splits = ROOT / "data" / "spinalytics_dataset.csv", ROOT / "data" / "splits.csv"
    if not data.exists():
        pytest.fail("dataset not generated; run backend/scripts/generate_dataset.py first")
    return pd.read_csv(data), pd.read_csv(splits)["split"].to_numpy()


def test_t_2_3_09_false_flag_rate():
    rule = get_reference().overall_rule
    assert rule["validation_false_flag_rate"] <= 0.10
    df, split = _validation_frames()
    ref = get_reference()
    rows = df[(split == "validation") & (df.is_healthy == 1)].head(250)
    rates = []
    for _, row in rows.iterrows():
        req = AnalyzeRequest(person={"sex_male": int(row.sex_male)}, measurements={k: float(row[k]) for k in __import__("app.anatomy", fromlist=["x"]).spine_columns()})
        rates.append(run_statistical_analysis(req).overall_state == "unusual_pattern")
    # engine and the vectorised calibration agree row by row
    vec = flagged(row_features(z_matrix(rows, ref)), rule)
    assert list(vec) == rates
    assert np.mean(rates) <= 0.10


def test_t_2_3_10_detection_rate_recorded():
    rule = get_reference().overall_rule
    assert 0.0 < rule["validation_detection_rate"] <= 1.0 and rule["n_validation_unusual_rows"] > 0


def test_calibration_uses_validation_rows_only():
    rule = get_reference().overall_rule
    assert "validation" in rule["calibrated_on"] and "test" not in rule["calibrated_on"].replace("healthy", "")
    df, split = _validation_frames()
    assert rule["n_calibration_rows"] == int(((split == "validation") & (df.is_healthy == 1)).sum())


def test_t_2_3_11_thresholds_configurable(case_request):
    strict = AnalysisConfig(within_max_abs_z=1.5, large_min_abs_z=3.0)
    base = run_statistical_analysis(case_request(1))
    tight = run_statistical_analysis(case_request(1), cfg=strict)
    assert tight.n_review + tight.n_large > base.n_review + base.n_large
    assert tight.thresholds.within_max_abs_z == 1.5


def test_all_sample_cases_return_complete_results(case_request, cases):
    expected = {1: "within_reference", 2: "unusual_pattern", 3: "unusual_pattern", 4: "unusual_pattern", 8: "indeterminate"}
    for i in range(1, 9):
        r = run_statistical_analysis(case_request(i))
        assert len(r.levels) == 22 + 23 + 3 and r.provenance["data_origin"] == "synthetic"
        if i in expected:
            assert r.overall_state == expected[i], (i, r.overall_state)


def test_wording_has_no_clinical_claims(case_request):
    text = json.dumps(run_statistical_analysis(case_request(2)).model_dump()).lower()
    for word in ("abnormal", "severe", "is_healthy"):
        assert word not in text
