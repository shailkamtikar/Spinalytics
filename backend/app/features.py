"""Derived spine features shared by the reference builder, the analysis engine and the model."""
from __future__ import annotations

import numpy as np
import pandas as pd

from app.anatomy import VERTEBRAE


def add_derived_features(df: pd.DataFrame) -> pd.DataFrame:
    """Return the 66 derived per-vertebra columns for the rows of ``df``.

    A derived value is missing whenever either of its two inputs is missing or
    absent; nothing is filled in. Formulas are documented in docs/DATA_DICTIONARY.md.
    """
    nan = pd.Series(np.nan, index=df.index, dtype=float)

    def col(name: str) -> pd.Series:
        return pd.to_numeric(df[name], errors="coerce").astype(float) if name in df.columns else nan

    out: dict[str, pd.Series] = {}
    for lv in VERTEBRAE:
        ant, post = col(f"{lv}_vertebral_body_height_anterior_mm"), col(f"{lv}_vertebral_body_height_posterior_mm")
        left, right = col(f"{lv}_vertebral_body_height_left_mm"), col(f"{lv}_vertebral_body_height_right_mm")
        out[f"{lv}_vertebral_body_height_mm"] = (ant + post) / 2
        out[f"{lv}_vertebral_body_wedge_ratio"] = (ant / post).where(post != 0)
        out[f"{lv}_vertebral_body_lateral_height_difference_mm"] = left - right
    return pd.DataFrame(out, index=df.index)
