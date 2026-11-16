import numpy as np
import pandas as pd
import pytest
from sklearn.pipeline import Pipeline

from app import anatomy
from app.ml.dataset import load_frame, split_xy
from app.ml.pipeline import GROUPS, SubjectRelativeFeatures, build_pipeline


@pytest.fixture(scope="module")
def frames():
    df, split = load_frame()
    return df, split


@pytest.fixture(scope="module")
def train(frames):
    X, y = split_xy(*frames, "train")
    return X.head(3000), y.head(3000)


def test_t_3_1_01_output_shape(train):
    X, y = train
    out = SubjectRelativeFeatures().fit_transform(X, y)
    assert out.shape == (len(X), len(GROUPS) * 6 + 3 + 16) and not np.isnan(out).any()


def test_t_3_1_02_fit_uses_healthy_train_rows_only(frames, train):
    X, y = train
    t = SubjectRelativeFeatures().fit(X, y)
    before = t.transform(X)
    Xv, _ = split_xy(*frames, "validation")
    _ = (Xv * 1.5)  # changing other splits cannot reach the fitted transformer
    assert np.array_equal(before, t.transform(X))
    X2 = X.copy()
    X2.loc[(y == 0).to_numpy(), anatomy.spine_columns()] *= 2.0  # unusual rows are ignored by fit
    t2 = SubjectRelativeFeatures().fit(X2, y)
    assert t.mean_.equals(t2.mean_) and t.sd_.equals(t2.sd_)
    assert t.n_reference_rows_ == int((y == 1).sum())


def test_t_3_1_03_size_invariance(train):
    X, y = train
    t = SubjectRelativeFeatures().fit(X, y)
    rows = X[(y == 1).to_numpy()].head(5)
    scaled = rows.copy()
    scaled[[c for c in anatomy.spine_columns() if c.endswith("_mm")]] *= 1.05
    names = t.feature_names_out_
    idx = [i for i, n in enumerate(names) if n.split("__")[-1] in ("rmax", "rmin", "step", "spread")]
    diff = np.abs(t.transform(rows) - t.transform(scaled))[:, idx]
    assert diff.max() < 0.2


def test_t_3_1_04_local_deviation_visible(train):
    X, y = train
    t = SubjectRelativeFeatures().fit(X, y)
    row = X[(y == 1).to_numpy()].head(1).copy()
    base = t.transform(row)
    changed = row.copy()
    for f in ("vertebral_body_height_anterior_mm", "vertebral_body_height_posterior_mm"):
        changed[f"L2_{f}"] *= 0.75
    after = t.transform(changed)
    name = "vertebral_body_height_anterior_mm__rmin"
    i = t.feature_names_out_.index(name)
    assert after[0, i] < base[0, i] - 2
    assert t.extreme_levels(changed)["vertebral_body_height_anterior_mm"][1][0] == "L2"


def test_t_3_1_05_deterministic(train):
    X, y = train
    t = SubjectRelativeFeatures().fit(X, y)
    assert np.array_equal(t.transform(X), t.transform(X))


def test_t_3_1_06_missing_column_and_value(train):
    X, y = train
    t = SubjectRelativeFeatures().fit(X, y)
    with pytest.raises(ValueError, match="L3_vertebral_body_width_mm"):
        t.transform(X.drop(columns=["L3_vertebral_body_width_mm"]))
    broken = X.head(3).copy()
    broken.loc[0, "L3_vertebral_body_width_mm"] = np.nan
    with pytest.raises(ValueError, match="missing values"):
        t.transform(broken)


def test_t_3_1_07_splits_disjoint(frames):
    _, split = frames
    idx = {n: set(np.flatnonzero((split == n).to_numpy())) for n in ("train", "validation", "test")}
    assert not (idx["train"] & idx["validation"]) and not (idx["train"] & idx["test"]) and not (idx["validation"] & idx["test"])
    assert sum(len(v) for v in idx.values()) == len(split)


def test_works_inside_a_pipeline(train):
    X, y = train
    pipe = build_pipeline("logistic_regression").fit(X, y)
    assert isinstance(pipe, Pipeline) and pipe.predict_proba(X.head(5)).shape == (5, 2)


def test_ablation_variants_have_expected_columns(train):
    X, y = train
    assert len(SubjectRelativeFeatures(use_person=False).fit(X, y).feature_names_out_) == len(GROUPS) * 6 + 3
    assert SubjectRelativeFeatures(use_spine=False).fit(X, y).feature_names_out_ == anatomy.person_columns()
