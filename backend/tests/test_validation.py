import math

import pytest
from pydantic import ValidationError

from app import anatomy
from app.analysis.engine import run_statistical_analysis
from app.analysis.validation import InputValidationError, validate_request
from app.schemas.analysis import AnalyzeRequest


def test_t_2_1_01_valid_complete_input(case_request):
    v = validate_request(case_request(1))
    assert v.ok and not v.errors and v.completeness == 1.0 and not v.unrecognised


def test_t_2_1_02_missing_vs_zero():
    v = validate_request(AnalyzeRequest(measurements={"L3_vertebral_body_width_mm": None, "L3_L4_segmental_coronal_angle_deg": 0}))
    assert "L3_vertebral_body_width_mm" in v.missing and "L3_vertebral_body_width_mm" not in v.values
    assert v.values["L3_L4_segmental_coronal_angle_deg"] == 0.0


def test_t_2_1_03_unknown_column():
    v = validate_request(AnalyzeRequest(measurements={"C3_disc_height_mm": 5.0}))
    assert [u.column for u in v.unrecognised] == ["C3_disc_height_mm"] and not v.values


def test_t_2_1_04_unsupported_level():
    v = validate_request(AnalyzeRequest(measurements={"C1_vertebral_body_width_mm": 30.0}))
    assert "level not supported" in v.unrecognised[0].reason and not v.values


def test_t_2_1_05_wrong_unit():
    with pytest.raises(ValidationError, match="length unit must be 'mm', got 'cm'"):
        AnalyzeRequest(units={"length": "cm", "angle": "deg"})
    with pytest.raises(ValidationError, match="angle unit"):
        AnalyzeRequest(units={"length": "mm", "angle": "rad"})


def test_t_2_1_06_non_numeric():
    v = validate_request(AnalyzeRequest(measurements={"L3_vertebral_body_width_mm": "abc"}))
    assert v.errors and v.errors[0].field == "L3_vertebral_body_width_mm" and v.errors[0].code == "not_numeric"
    with pytest.raises(InputValidationError):
        run_statistical_analysis(AnalyzeRequest(measurements={"L3_vertebral_body_width_mm": "abc"}))


@pytest.mark.parametrize("bad", [math.nan, math.inf, -math.inf])
def test_t_2_1_07_non_finite(bad):
    v = validate_request(AnalyzeRequest(measurements={"L3_vertebral_body_width_mm": bad}))
    assert v.errors and v.errors[0].code == "not_finite"


def test_t_2_1_08_out_of_supported_range(case_request, cases):
    m = dict(cases[0]["measurements"])
    m["L3_vertebral_body_width_mm"] = 440.0
    v = validate_request(case_request(1, measurements=m))
    assert [w.code for w in v.warnings] == ["out_of_supported_range"]
    assert "L3_vertebral_body_width_mm" not in v.values and v.completeness < 1.0


def test_t_2_1_09_negative_length():
    v = validate_request(AnalyzeRequest(measurements={"L4_L5_disc_height_mm": -2.0}))
    assert v.warnings[0].code == "negative_length" and not v.values


def test_t_2_1_10_empty_measurements():
    v = validate_request(AnalyzeRequest(measurements={}))
    assert v.ok and v.completeness == 0.0 and len(v.missing) == len(anatomy.spine_columns())


def test_t_2_1_11_extra_top_level_field():
    with pytest.raises(ValidationError, match="Extra inputs are not permitted"):
        AnalyzeRequest(measurements={}, name="x")  # type: ignore[call-arg]
    with pytest.raises(ValidationError):
        AnalyzeRequest(person={"email": "a@b.c"})


def test_t_2_1_12_person_field_range():
    with pytest.raises(ValidationError):
        AnalyzeRequest(person={"age_years": 300})
    with pytest.raises(ValidationError):
        AnalyzeRequest(person={"sex_male": 2})


def test_person_and_derived_columns_are_not_measurements():
    v = validate_request(AnalyzeRequest(measurements={"age_years": 40, "L3_vertebral_body_height_mm": 25.0}))
    assert {u.column for u in v.unrecognised} == {"age_years", "L3_vertebral_body_height_mm"} and not v.values


def test_no_value_is_defaulted(case_request, cases):
    m = {k: v for k, v in cases[0]["measurements"].items() if k != "T5_vertebral_body_depth_mm"}
    v = validate_request(case_request(1, measurements=m))
    assert "T5_vertebral_body_depth_mm" in v.missing and "T5_vertebral_body_depth_mm" not in v.values
