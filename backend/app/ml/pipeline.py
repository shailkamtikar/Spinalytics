"""Subject-relative feature engineering as a scikit-learn transformer.

Every spine measurement is converted to a z-score against the healthy-like TRAINING rows
(learned in ``fit`` only). Within each measurement type the person's own median z across
levels is then removed, so a body that is simply larger or smaller overall does not look
unusual, while one level that departs from the rest does. Group summaries (largest and
smallest residual, biggest step between neighbouring levels, spread, count of large
residuals) plus the person columns are the model inputs.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.base import BaseEstimator, TransformerMixin
from sklearn.ensemble import HistGradientBoostingClassifier, RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from app import anatomy

SUMMARY_STATS = ("shift", "rmax", "rmin", "step", "spread", "nbig")
BIG_RESIDUAL = 2.5


def _groups() -> dict[str, tuple[list[str], list[str]]]:
    """group name -> (columns in level order, level names)."""
    groups: dict[str, tuple[list[str], list[str]]] = {}
    for feat in anatomy.VERTEBRA_FEATURES:
        groups[feat] = ([f"{lv}_{feat}" for lv in anatomy.VERTEBRAE], list(anatomy.VERTEBRAE))
    for feat in anatomy.DISC_FEATURES:
        groups[feat] = ([f"{d.replace('-', '_')}_{feat}" for d in anatomy.DISCS], list(anatomy.DISCS))
    return groups


GROUPS = _groups()


class SubjectRelativeFeatures(BaseEstimator, TransformerMixin):
    """Fit on healthy-like training rows only; ``transform`` reuses the learned means and SDs."""

    def __init__(self, use_person: bool = True, use_spine: bool = True):
        self.use_person = use_person
        self.use_spine = use_spine

    # ------------------------------------------------------------ helpers
    @staticmethod
    def _check(X) -> pd.DataFrame:
        if not isinstance(X, pd.DataFrame):
            raise TypeError("SubjectRelativeFeatures expects a pandas DataFrame with named columns")
        missing = [c for c in anatomy.feature_columns() if c not in X.columns]
        if missing:
            raise ValueError(f"missing required column(s): {missing[:5]}{' ...' if len(missing) > 5 else ''}")
        used = X[anatomy.feature_columns()]
        if used.isna().any().any():
            bad = used.columns[used.isna().any()].tolist()
            raise ValueError(f"missing values in column(s): {bad[:5]}; the model needs a complete row")
        return used.astype(float)

    def _z(self, X: pd.DataFrame, columns: list[str]) -> np.ndarray:
        return (X[columns].to_numpy() - self.mean_[columns].to_numpy()) / self.sd_[columns].to_numpy()

    # ------------------------------------------------------------ sklearn API
    def fit(self, X, y=None):
        X = self._check(X)
        mask = np.ones(len(X), dtype=bool) if y is None else (np.asarray(y) == 1)
        if mask.sum() < 30:
            raise ValueError("at least 30 healthy-like rows are needed to learn the reference")
        spine = X.loc[mask, anatomy.spine_columns()]
        self.mean_ = spine.mean()
        self.sd_ = spine.std(ddof=1).clip(lower=1e-6)
        self.n_reference_rows_ = int(mask.sum())
        self.feature_names_out_ = self._names()
        return self

    def _names(self) -> list[str]:
        names: list[str] = []
        if self.use_spine:
            for g in GROUPS:
                names += [f"{g}__{s}" for s in SUMMARY_STATS]
            names += [f"z__{c}" for c in anatomy.REGIONAL_FEATURES]
        if self.use_person:
            names += anatomy.person_columns()
        return names

    def get_feature_names_out(self, input_features=None):
        return np.asarray(self.feature_names_out_, dtype=object)

    def _group_summary(self, X: pd.DataFrame, group: str) -> tuple[np.ndarray, np.ndarray]:
        cols, _ = GROUPS[group]
        z = self._z(X, cols)
        shift = np.median(z, axis=1)
        r = z - shift[:, None]
        step = np.abs(np.diff(r, axis=1)).max(axis=1)
        stats = np.column_stack([shift, r.max(axis=1), r.min(axis=1), step, r.std(axis=1), (np.abs(r) > BIG_RESIDUAL).sum(axis=1)])
        return stats, r

    def transform(self, X):
        if not hasattr(self, "mean_"):
            raise RuntimeError("transformer is not fitted")
        X = self._check(X)
        parts: list[np.ndarray] = []
        if self.use_spine:
            for g in GROUPS:
                parts.append(self._group_summary(X, g)[0])
            parts.append(self._z(X, list(anatomy.REGIONAL_FEATURES)))
        if self.use_person:
            parts.append(X[anatomy.person_columns()].to_numpy())
        return np.hstack(parts)

    def extreme_levels(self, X) -> dict[str, tuple[np.ndarray, np.ndarray]]:
        """For each group, the level with the largest and the smallest residual in every row."""
        X = self._check(X)
        out = {}
        for g, (_, levels) in GROUPS.items():
            _, r = self._group_summary(X, g)
            lv = np.asarray(levels)
            out[g] = (lv[r.argmax(axis=1)], lv[r.argmin(axis=1)])
        return out


def make_classifier(kind: str, seed: int = 20261201):
    if kind == "logistic_regression":
        return Pipeline([("scale", StandardScaler()), ("clf", LogisticRegression(max_iter=3000, C=0.5, random_state=seed))])
    if kind == "random_forest":
        return RandomForestClassifier(n_estimators=150, max_depth=10, min_samples_leaf=20, n_jobs=-1, random_state=seed)
    if kind == "gradient_boosting":
        return HistGradientBoostingClassifier(max_iter=200, learning_rate=0.08, max_depth=6, min_samples_leaf=30, l2_regularization=1.0, early_stopping=False, random_state=seed)
    raise ValueError(f"unknown model kind '{kind}'")


MODEL_KINDS = ("logistic_regression", "gradient_boosting", "random_forest")  # simplest first (tie-break order)


def build_pipeline(kind: str, seed: int = 20261201, use_person: bool = True, use_spine: bool = True) -> Pipeline:
    return Pipeline([("features", SubjectRelativeFeatures(use_person=use_person, use_spine=use_spine)), ("model", make_classifier(kind, seed))])
