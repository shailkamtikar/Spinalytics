import pytest

from app import anatomy
from app.analysis.deviation import make_finding, percentile_from_grid
from app.analysis.engine import run_statistical_analysis
from app.analysis.reference import Reference, get_reference
from app.schemas.analysis import AnalyzeRequest
from tests.conftest import fake_reference

COL = "L3_vertebral_body_width_mm"


def test_t_2_2_01_to_03_delta_percent_z():
    f = make_finding(COL, 17.0, fake_reference(COL, 20.0, 2.0), "all")
    assert f.delta == pytest.approx(-3.0, abs=1e-4)
    assert f.pct_difference == pytest.approx(-15.0, abs=1e-4)
    assert f.z_score == pytest.approx(-1.5, abs=1e-4)


def test_t_2_2_04_percentile_at_median():
    ref = get_reference()
    s = ref.stats("all", COL)
    assert percentile_from_grid(s["median"], ref.quantiles("all", COL), ref.probabilities) == pytest.approx(50, abs=1)


def test_t_2_2_05_percentile_clamps():
    ref = get_reference()
    q, p = ref.quantiles("all", COL), ref.probabilities
    lo, hi = percentile_from_grid(q.min() - 100, q, p), percentile_from_grid(q.max() + 100, q, p)
    assert 0 <= lo < 0.5 and 99.5 < hi <= 100


def test_t_2_2_06_angle_has_no_percentage():
    col = "L3_L4_segmental_coronal_angle_deg"
    f = make_finding(col, 3.0, fake_reference(col, 0.0, 1.0), "all")
    assert f.pct_difference is None and f.z_score == pytest.approx(3.0)


def test_t_2_2_07_near_zero_mean():
    f = make_finding(COL, 5.0, fake_reference(COL, 0.001, 1.0), "all")
    assert f.pct_difference is None and f.delta is not None


def test_t_2_2_08_zero_sd():
    f = make_finding(COL, 5.0, fake_reference(COL, 20.0, 0.0), "all")
    assert f.z_score is None and "reference_unusable" in f.flags


def test_t_2_2_09_missing_reference():
    f = make_finding(COL, 5.0, fake_reference("T1_vertebral_body_width_mm", 20.0, 2.0), "all")
    assert f.status == "no_reference" and f.reference is None


def test_t_2_2_10_level_matching():
    ref = get_reference()
    c3 = make_finding("C3_vertebral_body_width_mm", 40.0, ref, "all")
    l3 = make_finding("L3_vertebral_body_width_mm", 40.0, ref, "all")
    assert c3.z_score != l3.z_score and c3.reference.mean != l3.reference.mean


def test_t_2_2_11_cohort_selection():
    means = []
    for person in ({"sex_male": 0}, {"sex_male": 1}, {}):
        r = run_statistical_analysis(AnalyzeRequest(person=person, measurements={COL: 40.0}))
        means.append(next(f for f in r.findings if f.column == COL).reference.mean)
    assert len(set(means)) == 3
    assert Reference.cohort_name(None) == "all"


def test_t_2_2_12_derived_partial():
    r = run_statistical_analysis(AnalyzeRequest(measurements={"L3_vertebral_body_height_anterior_mm": 28.0}))
    wedge = next(f for f in r.findings if f.column == "L3_vertebral_body_wedge_ratio")
    assert wedge.status == "missing" and wedge.value is None


def test_derived_computed_when_inputs_present():
    r = run_statistical_analysis(AnalyzeRequest(measurements={"L3_vertebral_body_height_anterior_mm": 30.0, "L3_vertebral_body_height_posterior_mm": 25.0}))
    wedge = next(f for f in r.findings if f.column == "L3_vertebral_body_wedge_ratio")
    mean_h = next(f for f in r.findings if f.column == "L3_vertebral_body_height_mm")
    assert wedge.value == pytest.approx(1.2) and mean_h.value == pytest.approx(27.5)


def test_t_2_2_13_healthy_sample_sanity(case_request):
    r = run_statistical_analysis(case_request(1))
    present = [f for f in r.findings if f.z_score is not None]
    assert sum(abs(f.z_score) <= 2 for f in present) / len(present) >= 0.90


def test_t_2_2_14_unusual_sample_sanity(case_request):
    r = run_statistical_analysis(case_request(2))
    heights = [f for f in r.findings if f.target_type == "vertebra" and "height" in f.feature and f.z_score is not None]
    assert max(heights, key=lambda f: abs(f.z_score)).level == "C3"


def test_determinism(case_request):
    assert run_statistical_analysis(case_request(3)) == run_statistical_analysis(case_request(3))


def test_every_finding_uses_its_own_column_reference(case_request):
    r = run_statistical_analysis(case_request(1))
    ref = get_reference()
    for f in r.findings[:40]:
        assert f.reference.mean == ref.stats("sex_male_0", f.column)["mean"]
    assert len(r.findings) == len(anatomy.spine_columns()) + len(anatomy.derived_columns())
