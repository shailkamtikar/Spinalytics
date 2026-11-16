"""Model prediction that knows when not to answer.

Statuses: ``ok``, ``insufficient_data``, ``out_of_distribution``, ``unavailable``. The score is shown as a
"model score" and is not the probability of any disease. The model never replaces the statistical result.
"""
from __future__ import annotations

import logging
from functools import lru_cache
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from app import anatomy
from app.analysis.validation import InputValidationError, validate_request
from app.ml.calibration import ModelBundle
from app.ml.explain import explain
from app.schemas.analysis import AnalyzeRequest, ModelResult

log = logging.getLogger(__name__)

MODEL_PATH = Path(__file__).resolve().parents[1] / "artifacts" / "model.joblib"
BAND_LOW, BAND_HIGH = 0.40, 0.60  # score inside this band is "indeterminate"
OOD_MARGIN = 0.10  # fraction of the training range allowed beyond min and max
OOD_MAX_COLUMNS = 10  # more columns than this outside the margin means out of distribution
SCORE_NOTE = "Model score between 0 and 1: how much the overall pattern resembles the unusual examples the model was trained on. It is not the probability of disease."


@lru_cache
def load_bundle(path: str | None = None) -> ModelBundle | None:
    p = Path(path) if path else MODEL_PATH
    try:
        return joblib.load(p)
    except Exception as exc:  # missing, corrupt or version-incompatible file
        log.warning("model could not be loaded from %s: %s", p, exc)
        return None


def count_out_of_distribution(values: pd.DataFrame, bundle: ModelBundle) -> int:
    span = (bundle.train_max - bundle.train_min).clip(lower=1e-9)
    lo, hi = bundle.train_min - OOD_MARGIN * span, bundle.train_max + OOD_MARGIN * span
    v = values[anatomy.spine_columns()]
    return int(((v.iloc[0] < lo) | (v.iloc[0] > hi)).sum())


def label_for(score: float, low: float = BAND_LOW, high: float = BAND_HIGH) -> str:
    if score < low:
        return "within_reference"
    if score > high:
        return "unusual_pattern"
    return "indeterminate"


def predict(request: AnalyzeRequest, bundle: ModelBundle | None = None, band: tuple[float, float] = (BAND_LOW, BAND_HIGH)) -> ModelResult:
    """Never raises for model problems; input errors raise ``InputValidationError`` like the engine."""
    v = validate_request(request)
    if v.errors:
        raise InputValidationError(v.errors)
    bundle = bundle or load_bundle()
    if bundle is None:
        return ModelResult(status="unavailable", message="The model file could not be loaded. The statistical result is still available.")

    n_missing = len(v.missing)
    if n_missing:
        return ModelResult(status="insufficient_data", missing_count=n_missing, message=f"The model needs all {len(anatomy.spine_columns())} spine measurements; {n_missing} are missing or were excluded. No score was produced and nothing was filled in.")

    person_complete = all(c in v.person for c in anatomy.person_columns())
    row = pd.DataFrame([{**v.person, **v.values}])
    if not person_complete:
        row = row.reindex(columns=anatomy.feature_columns())
        row[anatomy.person_columns()] = bundle.ref_median[anatomy.person_columns()].to_numpy()  # unused by the spine-only variant
    n_ood = count_out_of_distribution(row, bundle)
    if n_ood > OOD_MAX_COLUMNS:
        return ModelResult(status="out_of_distribution", out_of_range_count=n_ood, message=f"{n_ood} measurements lie well outside the range the model was trained on, so it does not give a score.")

    variant = bundle.full if person_complete else bundle.spine_only
    try:
        score = float(variant.score(row)[0])
        contributors = explain(variant, bundle, row, include_person=person_complete)
    except Exception as exc:  # defensive: a model failure must not break the statistical result
        log.warning("model prediction failed: %s", exc)
        return ModelResult(status="unavailable", message="The model could not score this input. The statistical result is still available.")
    return ModelResult(
        status="ok", label=label_for(score, *band), score=round(score, 4), band_low=band[0], band_high=band[1],
        person_context_used=person_complete, contributors=contributors, message=SCORE_NOTE,
    )
