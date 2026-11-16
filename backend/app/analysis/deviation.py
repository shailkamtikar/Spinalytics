"""Per-measurement comparison with the matching reference. Pure functions: no network, no file writes."""
from __future__ import annotations

import numpy as np

from app import anatomy
from app.analysis.reference import Reference
from app.config import DEFAULT_ANALYSIS_CONFIG, AnalysisConfig
from app.schemas.analysis import Finding, ReferenceSummary


def percentile_from_grid(value: float, quantiles: np.ndarray, probabilities: np.ndarray) -> float:
    """Empirical percentile by interpolating the stored quantile grid. Clamped to 0..100."""
    return float(np.clip(np.interp(value, quantiles, probabilities), 0.0, 100.0))


def compute_stats(value: float, mean: float, sd: float, kind: str, cfg: AnalysisConfig = DEFAULT_ANALYSIS_CONFIG) -> dict:
    """delta, percentage difference (lengths only) and z-score for one value."""
    delta = value - mean
    pct = None
    if kind == "length" and abs(mean) >= cfg.pct_epsilon:
        pct = delta / mean * 100.0
    z = None if sd < cfg.sd_epsilon else delta / sd
    return {"delta": delta, "pct_difference": pct, "z_score": z}


def _info(column: str) -> anatomy.FeatureInfo:
    return anatomy.parse_column(column)


def make_finding(column: str, value: float | None, reference: Reference, cohort: str, cfg: AnalysisConfig = DEFAULT_ANALYSIS_CONFIG) -> Finding:
    """Compare one measurement (or a missing value) with the same column's reference."""
    info = _info(column)
    base = dict(column=column, target_type=info.target_type, level=info.level, region=info.region, feature=info.feature, unit=info.unit, derived=info.derived)
    if value is None:
        return Finding(**base, status="missing")
    ref = reference.stats(cohort, column)
    if ref is None:
        return Finding(**base, value=value, status="no_reference", flags=["no_reference"])
    summary = ReferenceSummary(cohort=cohort, n=ref["n"], mean=ref["mean"], median=ref["median"], sd=ref["sd"], interval_low=ref["p02_5"], interval_high=ref["p97_5"])
    s = compute_stats(value, ref["mean"], ref["sd"], info.kind, cfg)
    flags = ["reference_unusable"] if s["z_score"] is None else []
    percentile = percentile_from_grid(value, reference.quantiles(cohort, column), reference.probabilities)
    # status is assigned later by app.analysis.status; "within" is a placeholder for unusable references
    return Finding(**base, value=value, status="no_reference" if flags else "within", percentile=percentile, reference=summary, flags=flags, **s)
