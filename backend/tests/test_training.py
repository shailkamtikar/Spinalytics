import json
import re
from pathlib import Path

import joblib
import numpy as np
import pytest

from app.ml import train as T
from app.ml.dataset import load_frame, split_xy
from app.ml.evaluate import confusion_metrics, evaluate_scores
from scripts import train_model as S

ARTIFACTS = Path(__file__).resolve().parents[1] / "app" / "artifacts"
SRC = Path(__file__).resolve().parents[1] / "app" / "ml" / "train.py"


@pytest.fixture(scope="module")
def metrics():
    return json.loads((ARTIFACTS / "model_metrics.json").read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def small():
    df, split = load_frame()
    keep = np.random.default_rng(1).choice(len(df), 4000, replace=False)
    keep.sort()
    return df.iloc[keep].reset_index(drop=True), split.iloc[keep].reset_index(drop=True)


def test_t_3_2_01_training_script_runs_and_is_reproducible(tmp_path, metrics):
    assert S.main(["--out-dir", str(tmp_path), "--card", str(tmp_path / "card.md")]) == 0
    assert (tmp_path / "model.joblib").exists() and (tmp_path / "model_metrics.json").exists()
    new = json.loads((tmp_path / "model_metrics.json").read_text(encoding="utf-8"))
    assert new["candidates_validation"] == metrics["candidates_validation"]
    assert new["test"] == metrics["test"]
    assert (tmp_path / "card.md").read_text(encoding="utf-8") == (Path(__file__).resolve().parents[2] / "docs" / "MODEL_CARD.md").read_text(encoding="utf-8")


def test_t_3_2_02_reproducible_on_subsample(small):
    a = T.train_all(*small, n_boot=10)[1]
    b = T.train_all(*small, n_boot=10)[1]
    assert a["candidates_validation"] == b["candidates_validation"] and a["selected_model"] == b["selected_model"]


def test_t_3_2_03_04_learnable_not_perfect(metrics):
    auc = metrics["validation_selected"]["full"]["roc_auc"]
    assert 0.82 <= auc <= 0.98


def test_t_3_2_05_shuffled_label_control(metrics):
    assert 0.47 <= metrics["shuffled_label_control_validation_roc_auc"] <= 0.53


def test_t_3_2_06_ablation_order(metrics):
    a = metrics["ablations_validation"]
    assert a["all"]["roc_auc"] > a["spine_only"]["roc_auc"] > a["person_only"]["roc_auc"]


def test_t_3_2_07_metrics_arithmetic():
    y = np.array([1, 1, 0, 0, 1, 0])
    s = np.array([0.9, 0.4, 0.6, 0.1, 0.8, 0.2])
    m = confusion_metrics(y, s, 0.5)
    assert (m["tp"], m["fn"], m["fp"], m["tn"]) == (2, 1, 1, 2)
    assert m["sensitivity"] == pytest.approx(2 / 3) and m["specificity"] == pytest.approx(2 / 3) and m["precision"] == pytest.approx(2 / 3)
    assert evaluate_scores(y, s)["roc_auc"] == pytest.approx(8 / 9)


def test_t_3_2_08_model_reloads():
    df, split = load_frame()
    X, _ = split_xy(df, split, "validation")
    bundle = joblib.load(ARTIFACTS / "model.joblib")
    first = bundle.full.score(X.head(5))
    again = joblib.load(ARTIFACTS / "model.joblib").full.score(X.head(5))
    assert np.array_equal(first, again) and ((first >= 0) & (first <= 1)).all()


def test_t_3_2_09_artifact_size():
    assert (ARTIFACTS / "model.joblib").stat().st_size < 10_000_000


def test_t_3_2_10_test_split_used_once():
    code = SRC.read_text(encoding="utf-8")
    assert len(re.findall(r'split_xy\([^)]*"test"\)', code)) == 1
    assert code.index('"test"') > code.index("final evaluation")


def test_t_3_2_11_metrics_labelled(metrics):
    assert "synthetic, development-only" in metrics["note"]
    assert set(metrics["split_sizes"]) == {"train", "validation", "test"}
    assert metrics["test"]["full"]["roc_auc_ci95"][0] < metrics["test"]["full"]["roc_auc"] < metrics["test"]["full"]["roc_auc_ci95"][1]


def test_selection_prefers_simpler_model_on_ties():
    cands = {"logistic_regression": {"roc_auc": 0.850}, "gradient_boosting": {"roc_auc": 0.8505}, "random_forest": {"roc_auc": 0.84}}
    assert T.select_model(cands) == "logistic_regression"
    cands["gradient_boosting"]["roc_auc"] = 0.86
    assert T.select_model(cands) == "gradient_boosting"


def test_scikit_learn_version_is_pinned(metrics):
    req = (Path(__file__).resolve().parents[1] / "requirements.txt").read_text(encoding="utf-8")
    assert f"scikit-learn=={metrics['sklearn_version']}" in req
