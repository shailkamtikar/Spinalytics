"""Model bundle: fitted pipelines, optional isotonic calibrators and the context needed to abstain and explain."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import numpy as np
import pandas as pd
from sklearn.isotonic import IsotonicRegression
from sklearn.pipeline import Pipeline


def raw_unusual_score(pipeline: Pipeline, X: pd.DataFrame) -> np.ndarray:
    """Model output for the class 'unusual pattern' (is_healthy == 0)."""
    proba = pipeline.predict_proba(X)
    return proba[:, list(pipeline.classes_).index(0)]


@dataclass
class Variant:
    """One trained pipeline with its (optional) calibrator."""

    pipeline: Pipeline
    calibrator: IsotonicRegression | None = None

    def score(self, X: pd.DataFrame) -> np.ndarray:
        raw = raw_unusual_score(self.pipeline, X)
        return raw if self.calibrator is None else np.clip(self.calibrator.predict(raw), 0.0, 1.0)


@dataclass
class ModelBundle:
    """Everything ``predict`` needs, saved as one joblib file."""

    full: Variant  # uses spine + person columns
    spine_only: Variant  # fallback when person fields are incomplete
    train_min: pd.Series  # per spine column, training rows
    train_max: pd.Series
    ref_median: pd.Series  # healthy-like training medians of all 220 columns (used by occlusion)
    kind: str
    seed: int
    sklearn_version: str
    meta: dict[str, Any] = field(default_factory=dict)


def fit_isotonic(raw: np.ndarray, y_unusual: np.ndarray) -> IsotonicRegression:
    return IsotonicRegression(y_min=0.0, y_max=1.0, out_of_bounds="clip").fit(raw, np.asarray(y_unusual).astype(float))
