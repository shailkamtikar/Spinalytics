"""Combine the statistical engine and the model into one response. Never calls Gemini."""
from __future__ import annotations

import logging
import uuid

from app.analysis.engine import run_statistical_analysis
from app.analysis.reference import get_reference
from app.ml.predict import load_bundle, predict
from app.schemas.analysis import AnalyzeRequest, AnalyzeResponse, ModelResult, OverallResult, StatisticalResult

log = logging.getLogger("spinalytics.analysis")


def warm_up() -> dict[str, bool]:
    """Load the artifacts once at start-up so the first request is not slow."""
    return {"reference": get_reference() is not None, "model": load_bundle() is not None}


def combine(stat: StatisticalResult, model: ModelResult) -> OverallResult:
    """Indeterminate if statistics say so; unusual if either source says so; within only if both agree
    or the model gave no score and statistics are within."""
    s, m = stat.overall_state, model.label if model.status == "ok" else None
    base = dict(statistics_state=s, model_status=model.status, model_label=m)
    if s == "indeterminate":
        return OverallResult(state="indeterminate", reason=stat.reason, **base)
    if s == "unusual_pattern" and m == "unusual_pattern":
        return OverallResult(state="unusual_pattern", reason="The statistical comparison and the model both show an unusual pattern.", **base)
    if s == "unusual_pattern":
        return OverallResult(state="unusual_pattern", reason=f"The statistical comparison shows an unusual pattern. {stat.reason}", **base)
    if m == "unusual_pattern":
        return OverallResult(state="unusual_pattern", reason="Individual measurements stay within the reference range, but the overall pattern resembles the unusual examples the model was trained on.", **base)
    if m == "indeterminate":
        return OverallResult(state="indeterminate", reason="The statistical comparison is within the reference range, but the model score is in its uncertain band, so no overall statement is made.", **base)
    if m == "within_reference":
        return OverallResult(state="within_reference", reason="The statistical comparison and the model both lie within the reference pattern.", **base)
    return OverallResult(state="within_reference", reason="The statistical comparison lies within the reference pattern. The model gave no score for this input.", **base)


def analyze(request: AnalyzeRequest) -> AnalyzeResponse:
    stat = run_statistical_analysis(request)
    model = predict(request)
    overall = combine(stat, model)
    analysis_id = str(uuid.uuid4())
    # metadata only: never measurement values
    log.info("analysis %s source=%s completeness=%.2f state=%s model=%s", analysis_id, request.source, stat.completeness, overall.state, model.status)
    return AnalyzeResponse(analysis_id=analysis_id, overall=overall, statistical=stat, model=model)
