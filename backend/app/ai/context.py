"""Minimal context for the assistant.

A whitelist: only the fields named here are copied, so a field added to the response later (or an
identifier injected by a client) cannot reach the model by default. Numbers are copied, never recalculated.
"""
from __future__ import annotations

import json
from typing import Any

from app.ai.scope import levels_mentioned

MAX_CONTEXT_BYTES = 4000
MAX_LEVELS = 3
MAX_FINDINGS_PER_LEVEL = 6
FINDING_KEYS = ("feature", "unit", "value", "status", "z_score", "percentile", "delta", "pct_difference")


def _r(v: Any, digits: int = 2):
    return round(v, digits) if isinstance(v, (int, float)) else v


def _finding(f: dict) -> dict:
    out = {k: _r(f.get(k)) for k in FINDING_KEYS if f.get(k) is not None}
    ref = f.get("reference") or {}
    if ref:
        out["reference"] = {"mean": _r(ref.get("mean")), "interval_95": [_r(ref.get("interval_low")), _r(ref.get("interval_high"))]}
    return out


def _related(level: str, all_levels: set[str]) -> list[str]:
    """The level itself plus, for a vertebra, the discs that touch it."""
    related = [level]
    if "-" not in level:
        related += sorted(l for l in all_levels if "-" in l and level in l.split("-"))
    return related


def _choose_levels(result: dict, question: str) -> list[str]:
    levels = result["statistical"]["levels"]
    known = {l["level"] for l in levels}
    named = [l for l in levels_mentioned(question) if l in known]
    if named:
        return named[:MAX_LEVELS]
    flagged = sorted((l for l in levels if l["status"] in ("review", "large_deviation")), key=lambda l: -(l.get("worst_abs_z") or 0))
    return [l["level"] for l in flagged[:MAX_LEVELS]]


def build_context(result: dict, question: str) -> dict:
    """``result`` is an AnalyzeResponse as a dict. Returns a compact, identifier-free context."""
    stat = result["statistical"]
    model = result.get("model") or {}
    by_level: dict[str, list[dict]] = {}
    for f in stat["findings"]:
        by_level.setdefault(f["level"], []).append(f)
    status_of = {l["level"]: l["status"] for l in stat["levels"]}
    all_levels = set(status_of)

    chosen = _choose_levels(result, question)
    ordered: list[str] = []
    for level in chosen:
        for rel in _related(level, all_levels):
            if rel not in ordered:
                ordered.append(rel)

    def build(per_level: int) -> dict:
        blocks = []
        for level in ordered:
            rows = [f for f in by_level.get(level, []) if f.get("value") is not None]
            rows.sort(key=lambda f: -abs(f.get("z_score") or 0))
            blocks.append({"level": level, "status": status_of.get(level), "findings": [_finding(f) for f in rows[:per_level]]})
        return {
            "overall": {"state": result["overall"]["state"], "reason": result["overall"]["reason"]},
            "statistics": {"state": stat["overall_state"], "completeness": _r(stat["completeness"]), "outliers": stat["outlier_count"], "expected_by_chance_up_to": stat.get("chance_outlier_limit")},
            "model": {
                "status": model.get("status"), "label": model.get("label"), "score": _r(model.get("score")),
                "top_contributors": [{"group": c["group"], "change": _r(c["change"])} for c in (model.get("contributors") or [])[:3]],
            },
            "thresholds": {"within_max_abs_z": stat["thresholds"]["within_max_abs_z"], "large_min_abs_z": stat["thresholds"]["large_min_abs_z"], "note": "demonstration, non-clinical"},
            "warnings": [w["message"] for w in stat.get("warnings", [])[:3]],
            "reference": {"data_origin": "synthetic", "cohort": stat["cohort"], "limitation": stat["provenance"].get("limitation")},
            "levels": blocks,
        }

    per_level = MAX_FINDINGS_PER_LEVEL
    ctx = build(per_level)
    while len(json.dumps(ctx, separators=(",", ":")).encode()) > MAX_CONTEXT_BYTES and per_level > 1:
        per_level -= 1
        ctx = build(per_level)
    while len(json.dumps(ctx, separators=(",", ":")).encode()) > MAX_CONTEXT_BYTES and len(ordered) > 1:
        ordered.pop()
        ctx = build(per_level)
    return ctx


def context_json(ctx: dict) -> str:
    return json.dumps(ctx, separators=(",", ":"), ensure_ascii=False)
