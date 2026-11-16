"""Loader for the healthy-like reference distributions (synthetic, development only)."""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

import numpy as np

REFERENCE_PATH = Path(__file__).resolve().parents[1] / "artifacts" / "reference_stats.json"


class Reference:
    def __init__(self, data: dict[str, Any]):
        self.data = data
        q = data["quantile_probabilities"]
        self.probabilities = np.linspace(q["start"], q["stop"], q["count"])
        self._quantile_cache: dict[tuple[str, str], np.ndarray] = {}

    @property
    def provenance(self) -> dict[str, Any]:
        return self.data["provenance"]

    @property
    def chance_outlier_limit(self) -> int | None:
        return (self.data.get("overall_rule") or {}).get("chance_outlier_limit")

    @property
    def overall_rule(self) -> dict[str, Any]:
        return self.data.get("overall_rule") or {}

    @staticmethod
    def cohort_name(sex_male: int | float | None) -> str:
        if sex_male is None:
            return "all"
        return "sex_male_1" if int(sex_male) == 1 else "sex_male_0"

    def stats(self, cohort: str, column: str) -> dict[str, Any] | None:
        return self.data["cohorts"][cohort]["columns"].get(column)

    def quantiles(self, cohort: str, column: str) -> np.ndarray | None:
        key = (cohort, column)
        if key not in self._quantile_cache:
            s = self.stats(cohort, column)
            if s is None:
                return None
            self._quantile_cache[key] = np.asarray(s["quantiles"], dtype=float)
        return self._quantile_cache[key]

    def n_rows(self, cohort: str) -> int:
        return self.data["cohorts"][cohort]["n_rows"]


@lru_cache
def get_reference() -> Reference:
    return Reference(json.loads(REFERENCE_PATH.read_text(encoding="utf-8")))
