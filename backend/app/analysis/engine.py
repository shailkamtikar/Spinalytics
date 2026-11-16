"""The statistical analysis engine: one function from request to StatisticalResult.

This module never calls Gemini or any network service.
"""
from __future__ import annotations

import math

import pandas as pd

from app import anatomy
from app.analysis.deviation import make_finding
from app.analysis.reference import Reference, get_reference
from app.analysis.status import apply_status, roll_up
from app.analysis.validation import EXPECTED_SPINE_COUNT, InputValidationError, ValidatedInput, validate_request
from app.config import DEFAULT_ANALYSIS_CONFIG, AnalysisConfig
from app.features import add_derived_features
from app.schemas.analysis import AnalyzeRequest, Finding, StatisticalResult, Thresholds


def compute_findings(v: ValidatedInput, reference: Reference, cohort: str, cfg: AnalysisConfig) -> list[Finding]:
    """One finding per measured column and per derived column; missing values give ``missing`` findings."""
    derived = add_derived_features(pd.DataFrame([v.values])).iloc[0]
    findings: list[Finding] = []
    for column in anatomy.spine_columns():
        findings.append(make_finding(column, v.values.get(column), reference, cohort, cfg))
    for column in anatomy.derived_columns():
        d = derived[column]
        findings.append(make_finding(column, None if (d is None or math.isnan(d)) else float(d), reference, cohort, cfg))
    return [apply_status(f, cfg) for f in findings]


def overall_state(completeness: float, findings: list[Finding], reference: Reference, cfg: AnalysisConfig) -> tuple[str, str, dict]:
    """Return (state, reason, counts)."""
    n_large = sum(f.status == "large_deviation" for f in findings)
    n_review = sum(f.status == "review" for f in findings)
    outliers = n_large + n_review
    counts = {"n_large": n_large, "n_review": n_review, "outlier_count": outliers}
    if completeness < cfg.min_completeness:
        return "indeterminate", f"Only {completeness:.0%} of the {EXPECTED_SPINE_COUNT} spine measurements were provided; at least {cfg.min_completeness:.0%} are needed for an overall statement.", counts
    rule = reference.overall_rule
    limit = rule.get("chance_outlier_limit")
    large_limit = rule.get("large_count_limit", 0)
    extreme = rule.get("extreme_abs_z")
    max_z = max((abs(f.z_score) for f in findings if f.z_score is not None), default=0.0)
    if extreme is not None and max_z > extreme:
        return "unusual_pattern", f"One measurement lies very far from the reference (|z| = {max_z:.1f}, beyond {extreme:.1f}, the limit seen in reference-like profiles).", counts
    if n_large > large_limit:
        return "unusual_pattern", f"{n_large} measurements lie far from the reference (|z| above {cfg.large_min_abs_z:g}); up to {large_limit} are expected by chance in a reference-like profile.", counts
    if limit is not None and outliers > limit:
        return "unusual_pattern", f"{outliers} measurements lie outside the central reference range; up to {limit} are expected by chance in a reference-like profile.", counts
    return "within_reference", "No measurement lies far from the reference and the number of measurements outside the central range is within what chance would produce.", counts


def run_statistical_analysis(request: AnalyzeRequest, reference: Reference | None = None, cfg: AnalysisConfig = DEFAULT_ANALYSIS_CONFIG) -> StatisticalResult:
    reference = reference or get_reference()
    v = validate_request(request)
    if v.errors:
        raise InputValidationError(v.errors)
    cohort = Reference.cohort_name(v.person.get("sex_male"))
    findings = compute_findings(v, reference, cohort, cfg)
    levels = roll_up(findings)
    state, reason, counts = overall_state(v.completeness, findings, reference, cfg)
    return StatisticalResult(
        overall_state=state,
        reason=reason,
        completeness=round(v.completeness, 4),
        n_present=len(v.values),
        n_expected=EXPECTED_SPINE_COUNT,
        cohort=cohort,
        chance_outlier_limit=reference.chance_outlier_limit,
        flagged_levels=[lv for lv in levels if lv.status in ("review", "large_deviation")],
        levels=levels,
        findings=findings,
        warnings=v.warnings,
        unrecognised_columns=v.unrecognised,
        thresholds=Thresholds(within_max_abs_z=cfg.within_max_abs_z, large_min_abs_z=cfg.large_min_abs_z, min_completeness=cfg.min_completeness),
        provenance={k: reference.provenance[k] for k in ("data_origin", "limitation", "cohort_rule", "reference_interval_method", "generator_version") if k in reference.provenance},
        **counts,
    )
