import json

import numpy as np
import pandas as pd
import pytest

from app import anatomy
from app.features import add_derived_features
from scripts import build_reference as B
from scripts import generate_dataset as G
from scripts.make_splits import make_splits

DATASET = B.ROOT / "data" / "spinalytics_dataset.csv"
SPLITS = B.ROOT / "data" / "splits.csv"


@pytest.fixture(scope="module")
def small():
    df = G.generate(6000, 5)[0]
    split = make_splits(df["is_healthy"].to_numpy())
    return df, split, B.build_reference(df, split)


@pytest.fixture(scope="module")
def committed():
    return json.loads(B.OUT.read_text(encoding="utf-8"))


# ---- splits ----
def test_split_sizes_for_the_full_dataset_shape():
    labels = np.array([0, 1] * 25_000)
    counts = pd.Series(make_splits(labels)).value_counts().to_dict()
    assert counts == {"train": 35_000, "validation": 7_500, "test": 7_500}


def test_split_is_disjoint_and_complete(small):
    _, split, _ = small
    assert set(split) == {"train", "validation", "test"}
    assert sum((split == s).sum() for s in ("train", "validation", "test")) == len(split)


def test_split_is_stratified(small):
    df, split, _ = small
    for s in ("train", "validation", "test"):
        assert abs(df.loc[split == s, "is_healthy"].mean() - 0.5) <= 0.005


def test_split_is_reproducible_and_seed_dependent():
    labels = np.array([0, 1] * 500)
    assert (make_splits(labels, 1) == make_splits(labels, 1)).all()
    assert (make_splits(labels, 1) != make_splits(labels, 2)).any()


# ---- derived features ----
def test_derived_formulas():
    row = pd.DataFrame([{
        "L3_vertebral_body_height_anterior_mm": 20.0, "L3_vertebral_body_height_posterior_mm": 25.0,
        "L3_vertebral_body_height_left_mm": 22.0, "L3_vertebral_body_height_right_mm": 23.5,
    }])
    d = add_derived_features(row).iloc[0]
    assert d["L3_vertebral_body_height_mm"] == 22.5
    assert d["L3_vertebral_body_wedge_ratio"] == pytest.approx(0.8)
    assert d["L3_vertebral_body_lateral_height_difference_mm"] == -1.5


def test_derived_is_missing_when_an_input_is_missing():
    row = pd.DataFrame([{"L3_vertebral_body_height_anterior_mm": 20.0, "L3_vertebral_body_height_posterior_mm": None}])
    d = add_derived_features(row).iloc[0]
    assert np.isnan(d["L3_vertebral_body_height_mm"]) and np.isnan(d["L3_vertebral_body_wedge_ratio"])
    assert np.isnan(d["C5_vertebral_body_height_mm"])  # inputs absent altogether
    assert add_derived_features(row).shape == (1, 66)


# ---- reference content ----
def test_reference_uses_only_train_healthy_rows(small):
    df, split, ref = small
    n_allowed = int(((split == "train") & (df["is_healthy"] == 1)).sum())
    assert ref["cohorts"]["all"]["n_rows"] == n_allowed
    assert max(c["n"] for c in ref["cohorts"]["all"]["columns"].values()) <= n_allowed
    assert ref["cohorts"]["sex_male_0"]["n_rows"] + ref["cohorts"]["sex_male_1"]["n_rows"] == n_allowed


def test_changing_validation_or_test_rows_does_not_change_the_reference(small):
    df, split, ref = small
    tampered = df.copy()
    other = split != "train"
    tampered.loc[other, anatomy.spine_columns()] = tampered.loc[other, anatomy.spine_columns()] * 3
    assert B.build_reference(tampered, split)["cohorts"] == ref["cohorts"]


def test_changing_unhealthy_train_rows_does_not_change_the_reference(small):
    df, split, ref = small
    tampered = df.copy()
    rows = (split == "train") & (df["is_healthy"] == 0)
    tampered.loc[rows, anatomy.spine_columns()] = tampered.loc[rows, anatomy.spine_columns()] * 3
    assert B.build_reference(tampered, split)["cohorts"] == ref["cohorts"]


def test_reference_matches_a_direct_calculation(small):
    df, split, ref = small
    x = df.loc[(split == "train") & (df["is_healthy"] == 1), "L3_vertebral_body_width_mm"].to_numpy()
    s = ref["cohorts"]["all"]["columns"]["L3_vertebral_body_width_mm"]
    assert s["mean"] == pytest.approx(x.mean(), abs=1e-4)
    assert s["sd"] == pytest.approx(x.std(ddof=1), abs=1e-4)
    assert s["p02_5"] == pytest.approx(np.percentile(x, 2.5), abs=1e-4)
    assert s["quantiles"][100] == s["median"] and len(s["quantiles"]) == 201
    assert s["quantiles"] == sorted(s["quantiles"])


def test_too_small_cohort_is_refused():
    df = G.generate(60, 1)[0]
    with pytest.raises(ValueError, match="at least"):
        B.build_reference(df, make_splits(df["is_healthy"].to_numpy()))


# ---- committed artifact ----
def test_committed_reference_covers_every_column_and_cohort(committed):
    expected = set(anatomy.spine_columns() + anatomy.derived_columns())
    assert set(committed["cohorts"]) == {"all", "sex_male_0", "sex_male_1"}
    for cohort in committed["cohorts"].values():
        assert set(cohort["columns"]) == expected


def test_committed_reference_excludes_validation_and_test(committed):
    assert committed["cohorts"]["all"]["n_rows"] == 17_500
    assert max(c["n"] for c in committed["cohorts"]["all"]["columns"].values()) <= 17_500


def test_levels_have_their_own_statistics(committed):
    cols = committed["cohorts"]["all"]["columns"]
    assert cols["L3_vertebral_body_width_mm"]["mean"] > 2 * cols["C3_vertebral_body_width_mm"]["mean"]
    widths = [(cols[f"{lv}_vertebral_body_width_mm"]["mean"], cols[f"{lv}_vertebral_body_width_mm"]["sd"]) for lv in anatomy.VERTEBRAE]
    assert len(set(widths)) == len(widths)


def test_sex_cohorts_differ(committed):
    c = committed["cohorts"]
    col = "L3_vertebral_body_width_mm"
    assert c["sex_male_1"]["columns"][col]["mean"] > c["all"]["columns"][col]["mean"] > c["sex_male_0"]["columns"][col]["mean"]


def test_derived_features_are_in_the_reference(committed):
    wedge = committed["cohorts"]["all"]["columns"]["L3_vertebral_body_wedge_ratio"]
    assert 0.9 < wedge["mean"] < 1.1


def test_no_zero_standard_deviation(committed):
    for cohort in committed["cohorts"].values():
        assert min(c["sd"] for c in cohort["columns"].values()) > 0


def test_provenance_block(committed):
    p = committed["provenance"]
    assert p["data_origin"] == "synthetic"
    assert p["limitation"] == "Synthetic development reference. Not a clinical reference range."
    assert p["cohort_rule"] == "training rows with a healthy-like profile"
    assert p["dataset_rows"] == 50_000 and len(p["dataset_sha256"]) == 64


def test_artifact_size_is_deployable():
    assert B.OUT.stat().st_size < 2_000_000


@pytest.mark.skipif(not (DATASET.exists() and SPLITS.exists()), reason="full dataset or splits not generated")
def test_committed_reference_is_reproducible_from_the_dataset(committed, tmp_path):
    out = tmp_path / "ref.json"
    assert B.main(["--out", str(out)]) == 0
    rebuilt = json.loads(out.read_text(encoding="utf-8"))
    # the overall_rule block is added afterwards by calibrate_overall_rule.py
    assert rebuilt == {k: v for k, v in committed.items() if k != "overall_rule"}
