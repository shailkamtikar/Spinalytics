"""Input validation: classify every submitted value as usable, missing, excluded or invalid.

Nothing is silently changed. A missing value stays missing (never defaulted), an unknown
column is reported and never re-interpreted, and a value outside the supported range is
excluded with a warning.
"""
from __future__ import annotations

import math
import re
from dataclasses import dataclass, field

from app import anatomy
from app.schemas.analysis import AnalyzeRequest, IssueModel, UnrecognisedColumn

_SPINE_COLUMNS = frozenset(anatomy.spine_columns())
_LEVEL_IN_NAME = re.compile(r"^([A-Z]\d{1,2})(?:_([A-Z]\d{1,2}))?_")
EXPECTED_SPINE_COUNT = len(_SPINE_COLUMNS)


class InputValidationError(ValueError):
    """Raised by the engine when the request contains errors (not just warnings)."""

    def __init__(self, errors: list[IssueModel]):
        self.errors = errors
        super().__init__("; ".join(e.message for e in errors))


@dataclass
class ValidatedInput:
    values: dict[str, float]  # usable spine measurements only
    person: dict[str, float]  # person fields that were supplied
    missing: list[str]  # spine columns with no usable value
    warnings: list[IssueModel] = field(default_factory=list)
    errors: list[IssueModel] = field(default_factory=list)
    unrecognised: list[UnrecognisedColumn] = field(default_factory=list)

    @property
    def completeness(self) -> float:
        return len(self.values) / EXPECTED_SPINE_COUNT

    @property
    def ok(self) -> bool:
        return not self.errors


def _unrecognised_reason(column: str) -> str:
    if column in anatomy.PERSON_FIELDS:
        return "person field: send it under 'person', not 'measurements'"
    try:
        info = anatomy.parse_column(column)
        if info.derived:
            return "derived value: it is calculated by the application and cannot be supplied"
        return "not a measurement column"
    except anatomy.UnknownColumnError:
        m = _LEVEL_IN_NAME.match(column)
        if m:
            levels = [g for g in m.groups() if g]
            unsupported = [lv for lv in levels if lv not in anatomy.VERTEBRAE and lv not in ("S1",)]
            if unsupported or (len(levels) == 2 and "-".join(levels) not in anatomy.DISCS):
                return "level not supported: vertebral measurements cover C3 to L5 and discs C2-C3 to L5-S1"
        return "not a recognised Spinalytics column"


def validate_request(request: AnalyzeRequest) -> ValidatedInput:
    """Validate a parsed request. Schema-level problems (extra fields, wrong unit, person range)
    are already rejected by pydantic when the request is built."""
    out = ValidatedInput(values={}, person=request.person.model_dump(exclude_none=True), missing=[])
    present: set[str] = set()

    for column, raw in request.measurements.items():
        if column not in _SPINE_COLUMNS:
            out.unrecognised.append(UnrecognisedColumn(column=column, reason=_unrecognised_reason(column)))
            continue
        if raw is None:
            continue  # explicit missing value
        if isinstance(raw, bool) or not isinstance(raw, (int, float)):
            out.errors.append(IssueModel(code="not_numeric", field=column, message=f"{column}: value must be a number or null, got {raw!r}"))
            continue
        value = float(raw)
        if not math.isfinite(value):
            out.errors.append(IssueModel(code="not_finite", field=column, message=f"{column}: value must be a finite number"))
            continue
        info = anatomy.parse_column(column)
        if info.kind == "length" and value < 0:
            out.warnings.append(IssueModel(code="negative_length", field=column, message=f"{column}: a length cannot be negative; value excluded from the analysis"))
            continue
        lo, hi = _supported_range(column)
        if not (lo <= value <= hi):
            out.warnings.append(IssueModel(
                code="out_of_supported_range", field=column,
                message=f"{column}: {value:g} is outside the supported range {lo:g} to {hi:g} {info.unit}; value excluded from the analysis",
            ))
            continue
        out.values[column] = value
        present.add(column)

    out.missing = [c for c in anatomy.spine_columns() if c not in present]
    return out


_RANGES: dict[str, tuple[float, float]] | None = None


def _supported_range(column: str) -> tuple[float, float]:
    global _RANGES
    if _RANGES is None:
        import json
        from pathlib import Path

        catalog = json.loads((Path(__file__).resolve().parents[1] / "artifacts" / "feature_catalog.json").read_text(encoding="utf-8"))
        _RANGES = {f["column"]: (f["min_supported"], f["max_supported"]) for f in catalog["features"] if "min_supported" in f}
    return _RANGES[column]
