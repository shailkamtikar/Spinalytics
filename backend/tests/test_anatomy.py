import json

import pytest

from app import anatomy
from scripts import build_catalog
from scripts import generate_dataset as G


def test_parse_vertebra_column():
    f = anatomy.parse_column("L3_vertebral_body_width_mm")
    assert (f.target_type, f.level, f.region, f.unit, f.kind) == ("vertebra", "L3", "lumbar", "mm", "length")
    assert f.percentage_allowed and not f.derived


def test_parse_disc_column():
    f = anatomy.parse_column("C7_T1_disc_height_mm")
    assert (f.target_type, f.level, f.region, f.kind) == ("disc", "C7-T1", "cervical", "length")


def test_parse_angle_column_forbids_percentage():
    f = anatomy.parse_column("T4_T5_segmental_coronal_angle_deg")
    assert (f.unit, f.kind, f.percentage_allowed) == ("deg", "angle", False)


def test_parse_regional_and_person_and_derived():
    assert anatomy.parse_column("lumbar_sagittal_angle_L1_S1_deg").target_type == "region"
    assert anatomy.parse_column("age_years").kind == "person"
    d = anatomy.parse_column("L3_vertebral_body_wedge_ratio")
    assert d.derived and d.kind == "ratio" and not d.percentage_allowed


@pytest.mark.parametrize(
    "column",
    [
        "C1_vertebral_body_width_mm",  # unsupported level
        "C2_vertebral_body_depth_mm",
        "S1_vertebral_body_width_mm",
        "C3_disc_height_mm",  # a disc needs two levels
        "C3_C5_disc_height_mm",  # not adjacent
        "L5_L4_disc_height_mm",  # wrong order
        "L3_vertebral_body_width_cm",  # wrong unit
        "L3_vertebral_body_volume_mm",
        "l3_vertebral_body_width_mm",  # case is not silently fixed here
        "foo",
        "",
        "is_healthy",
    ],
)
def test_unknown_columns_are_rejected_not_guessed(column):
    with pytest.raises(anatomy.UnknownColumnError):
        anatomy.parse_column(column)


def test_level_lists():
    assert len(anatomy.VERTEBRAE) == 22 and anatomy.VERTEBRAE[0] == "C3" and anatomy.VERTEBRAE[-1] == "L5"
    assert len(anatomy.DISCS) == 23 and anatomy.DISCS[0] == "C2-C3" and anatomy.DISCS[-1] == "L5-S1"
    assert anatomy.region_of("T12-L1") == "thoracic" and anatomy.region_of("L5-S1") == "lumbar"


def test_columns_agree_with_generator():
    df, _ = G.generate(50, 1)
    assert anatomy.feature_columns() + [anatomy.LABEL] == list(df.columns)
    assert len(anatomy.spine_columns()) == 204 and len(anatomy.derived_columns()) == 66


def test_committed_catalog_is_current_and_complete():
    committed = json.loads(build_catalog.OUT.read_text(encoding="utf-8"))
    assert committed == json.loads(json.dumps(build_catalog.build()))
    assert len(committed["features"]) == 220 and committed["label"] == "is_healthy"
    for f in committed["features"]:
        assert f["min_supported"] < f["max_supported"]
        assert f["kind"] in {"person", "length", "angle"}
        assert f["percentage_allowed"] == (f["kind"] == "length")
