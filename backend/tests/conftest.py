import copy
import json
from pathlib import Path

import numpy as np
import pytest

from app.analysis.reference import Reference
from app.schemas.analysis import AnalyzeRequest

ARTIFACTS = Path(__file__).resolve().parents[1] / "app" / "artifacts"


@pytest.fixture(scope="session")
def cases() -> list[dict]:
    return json.loads((ARTIFACTS / "sample_cases.json").read_text(encoding="utf-8"))


@pytest.fixture
def case_request(cases):
    def build(number: int, **overrides) -> AnalyzeRequest:
        c = copy.deepcopy(cases[number - 1])
        return AnalyzeRequest(source="sample", units=c["units"], person=overrides.pop("person", c["person"]), measurements=overrides.pop("measurements", c["measurements"]))

    return build


def fake_reference(column: str, mean: float, sd: float, quantiles: list[float] | None = None) -> Reference:
    """A one-column reference with a known mean and SD (cohort 'all')."""
    q = quantiles or list(np.linspace(mean - 3 * sd, mean + 3 * sd, 201))
    stats = {"n": 100, "mean": mean, "sd": sd, "median": mean, "q1": mean, "q3": mean, "p01": q[2], "p02_5": q[5], "p05": q[10], "p95": q[190], "p97_5": q[195], "p99": q[198], "quantiles": q}
    return Reference({
        "provenance": {"data_origin": "synthetic"},
        "quantile_probabilities": {"start": 0, "stop": 100, "count": 201},
        "cohorts": {"all": {"n_rows": 100, "columns": {column: stats}}},
    })
