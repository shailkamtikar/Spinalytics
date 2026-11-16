"""Train, compare, select, calibrate and evaluate the models (synthetic development data)."""
from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
import sklearn

from app import anatomy
from app.ml.calibration import ModelBundle, Variant, fit_isotonic, raw_unusual_score
from app.ml.dataset import split_xy
from app.ml.evaluate import bootstrap_auc_ci, evaluate_scores, reliability_table
from app.ml.pipeline import MODEL_KINDS, build_pipeline

DEFAULT_SEED = 20261201
TIE_TOLERANCE = 0.001
BAND = (0.40, 0.60)
NOTE = "synthetic, development-only: measured on generated data, not on patients"


def round_floats(obj, digits: int = 6):
    """Round every float so that last-digit differences from parallel summation never change the report."""
    if isinstance(obj, float):
        return round(obj, digits)
    if isinstance(obj, dict):
        return {k: round_floats(v, digits) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [round_floats(v, digits) for v in obj]
    return obj


def _unusual(y: pd.Series) -> np.ndarray:
    return (y.to_numpy() == 0).astype(int)


def select_model(candidates: dict[str, dict]) -> str:
    """Highest validation ROC-AUC; a gap under ``TIE_TOLERANCE`` goes to the simpler model."""
    best = None
    for kind in MODEL_KINDS:  # simplest first
        if kind not in candidates:
            continue
        if best is None or candidates[kind]["roc_auc"] > candidates[best]["roc_auc"] + TIE_TOLERANCE:
            best = kind
    return best  # type: ignore[return-value]


def _calibrate(raw_val: np.ndarray, y_val: np.ndarray, seed: int) -> tuple[dict, Any]:
    """Cross-fitted check on the validation split, then a calibrator fitted on all of it."""
    rng = np.random.default_rng(seed)
    fold = rng.permutation(len(y_val)) % 2
    crossfit = np.empty_like(raw_val)
    for k in (0, 1):
        cal = fit_isotonic(raw_val[fold != k], y_val[fold != k])
        crossfit[fold == k] = cal.predict(raw_val[fold == k])
    before = reliability_table(y_val, raw_val)
    after = reliability_table(y_val, crossfit)
    from sklearn.metrics import brier_score_loss

    brier_raw, brier_cal = brier_score_loss(y_val, raw_val), brier_score_loss(y_val, crossfit)
    use = brier_cal < brier_raw
    info = {
        "method": "isotonic" if use else "none",
        "reliability_before": before,
        "reliability_after_crossfit": after,
        "brier_before": float(brier_raw),
        "brier_after_crossfit": float(brier_cal),
        "max_bin_gap": (after if use else before)["max_gap"],
    }
    return info, (fit_isotonic(raw_val, y_val) if use else None)


def train_all(df: pd.DataFrame, split: pd.Series, seed: int = DEFAULT_SEED, n_boot: int = 1000) -> tuple[ModelBundle, dict]:
    Xtr, ytr = split_xy(df, split, "train")
    Xva, yva = split_xy(df, split, "validation")
    y_val = _unusual(yva)

    comparison: dict[str, dict] = {}
    for kind in MODEL_KINDS:
        pipe = build_pipeline(kind, seed).fit(Xtr, ytr)
        comparison[kind] = evaluate_scores(y_val, raw_unusual_score(pipe, Xva))
    chosen = select_model(comparison)

    ablations = {}
    for name, (up, us) in {"all": (True, True), "spine_only": (False, True), "person_only": (True, False)}.items():
        pipe = build_pipeline(chosen, seed, use_person=up, use_spine=us).fit(Xtr, ytr)
        ablations[name] = evaluate_scores(y_val, raw_unusual_score(pipe, Xva))

    rng = np.random.default_rng(seed)
    shuffled = build_pipeline(chosen, seed).fit(Xtr, pd.Series(rng.permutation(ytr.to_numpy())))
    shuffled_auc = evaluate_scores(y_val, raw_unusual_score(shuffled, Xva))["roc_auc"]

    variants, calibration, val_scores = {}, {}, {}
    for name, (up, us) in {"full": (True, True), "spine_only": (False, True)}.items():
        pipe = build_pipeline(chosen, seed, use_person=up, use_spine=us).fit(Xtr, ytr)
        raw = raw_unusual_score(pipe, Xva)
        calibration[name], cal = _calibrate(raw, y_val, seed)
        variants[name] = Variant(pipe, cal)
        val_scores[name] = variants[name].score(Xva)

    healthy_train = Xtr[ytr.to_numpy() == 1]
    spine = anatomy.spine_columns()
    bundle = ModelBundle(
        full=variants["full"], spine_only=variants["spine_only"],
        train_min=Xtr[spine].min(), train_max=Xtr[spine].max(), ref_median=healthy_train.median(),
        kind=chosen, seed=seed, sklearn_version=sklearn.__version__,
    )

    in_band = {k: float(((v >= BAND[0]) & (v <= BAND[1])).mean()) for k, v in val_scores.items()}
    outside = {k: (v < BAND[0]) | (v > BAND[1]) for k, v in val_scores.items()}
    band_accuracy = {k: float(((val_scores[k][m] >= 0.5) == y_val[m].astype(bool)).mean()) for k, m in outside.items()}

    # ---- final evaluation: the held-out test split is read here, once, and nowhere else
    Xte, yte = split_xy(df, split, "test")
    y_test = _unusual(yte)
    test = {}
    for name, v in variants.items():
        s = v.score(Xte)
        ev = evaluate_scores(y_test, s)
        ev["roc_auc_ci95"] = list(bootstrap_auc_ci(y_test, s, n_boot=n_boot, seed=seed))
        test[name] = ev

    metrics = {
        "note": NOTE,
        "positive_class": "unusual pattern (is_healthy == 0)",
        "seed": seed,
        "sklearn_version": sklearn.__version__,
        "split_sizes": {"train": int(len(ytr)), "validation": int(len(yva)), "test": int(len(yte))},
        "candidates_validation": comparison,
        "selected_model": chosen,
        "selection_rule": "highest validation ROC-AUC; differences under 0.001 go to the simpler model",
        "ablations_validation": ablations,
        "shuffled_label_control_validation_roc_auc": shuffled_auc,
        "calibration": calibration,
        "indeterminate_band": {"low": BAND[0], "high": BAND[1], "validation_share_in_band": in_band, "validation_accuracy_outside_band": band_accuracy},
        "validation_selected": {k: evaluate_scores(y_val, v) for k, v in val_scores.items()},
        "test": test,
        "feature_count": {"full": len(variants["full"].pipeline[0].feature_names_out_), "spine_only": len(variants["spine_only"].pipeline[0].feature_names_out_)},
    }
    return bundle, round_floats(metrics)
