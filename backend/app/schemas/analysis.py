"""Request and result models for the statistical analysis engine.

The request is deliberately flat: measurements are keyed by the catalog column
names so that manual entry, CSV upload and sample cases share one code path.
"""
from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, create_model, field_validator

from app import anatomy

DISCLAIMER = (
    "Educational and research prototype on synthetic data. It is not a medical device and "
    "does not provide a diagnosis; a qualified clinician must interpret any real measurement."
)

# ---------------------------------------------------------------- request


def _person_model() -> type[BaseModel]:
    fields: dict[str, Any] = {}
    for name, (_unit, value_type, lo, hi, description) in anatomy.PERSON_FIELDS.items():
        py_type = int if value_type == "int" else float
        fields[name] = (Optional[py_type], Field(default=None, ge=lo, le=hi, allow_inf_nan=False, description=description))
    return create_model("PersonInput", __config__=ConfigDict(extra="forbid"), **fields)


PersonInput = _person_model()
PersonInput.__doc__ = "Optional person-level context. None of these fields identifies a person."


class Units(BaseModel):
    model_config = ConfigDict(extra="forbid")

    length: str = "mm"
    angle: str = "deg"

    @field_validator("length")
    @classmethod
    def _length_unit(cls, v: str) -> str:
        if v != "mm":
            raise ValueError(f"length unit must be 'mm', got '{v}'. Convert the values before sending them.")
        return v

    @field_validator("angle")
    @classmethod
    def _angle_unit(cls, v: str) -> str:
        if v != "deg":
            raise ValueError(f"angle unit must be 'deg', got '{v}'. Convert the values before sending them.")
        return v


class AnalyzeRequest(BaseModel):
    """Everything the engine accepts. Unknown top-level fields are rejected so that a name or
    e-mail address cannot be sent by accident."""

    model_config = ConfigDict(extra="forbid")

    source: Literal["manual", "csv", "sample"] = "manual"
    units: Units = Field(default_factory=Units)
    person: PersonInput = Field(default_factory=PersonInput)  # type: ignore[valid-type]
    measurements: dict[str, Any] = Field(default_factory=dict)


# ---------------------------------------------------------------- validation output


class IssueModel(BaseModel):
    code: str
    field: Optional[str] = None
    message: str


class UnrecognisedColumn(BaseModel):
    column: str
    reason: str


# ---------------------------------------------------------------- results

Status = Literal["within", "review", "large_deviation", "missing", "no_reference"]
OverallState = Literal["within_reference", "unusual_pattern", "indeterminate"]


class ReferenceSummary(BaseModel):
    cohort: str
    n: int
    mean: float
    median: float
    q1: float
    q3: float
    sd: float
    interval_low: float  # 2.5th percentile
    interval_high: float  # 97.5th percentile


class Finding(BaseModel):
    column: str
    target_type: Literal["vertebra", "disc", "region"]
    level: str
    region: str
    feature: str
    unit: str
    derived: bool = False
    value: Optional[float] = None
    status: Status
    delta: Optional[float] = None
    pct_difference: Optional[float] = None
    z_score: Optional[float] = None
    percentile: Optional[float] = None
    reference: Optional[ReferenceSummary] = None
    flags: list[str] = Field(default_factory=list)


class LevelStatus(BaseModel):
    level: str
    target_type: Literal["vertebra", "disc", "region"]
    region: str
    status: Status
    n_findings: int
    n_present: int
    worst_column: Optional[str] = None
    worst_abs_z: Optional[float] = None


class Thresholds(BaseModel):
    within_max_abs_z: float
    large_min_abs_z: float
    min_completeness: float
    note: str = "Demonstration thresholds for a synthetic reference. They are not clinical cut-offs."


class StatisticalResult(BaseModel):
    overall_state: OverallState
    reason: str
    completeness: float
    n_present: int
    n_expected: int
    cohort: str
    n_review: int
    n_large: int
    outlier_count: int
    chance_outlier_limit: Optional[int] = None
    flagged_levels: list[LevelStatus]
    levels: list[LevelStatus]
    findings: list[Finding]
    warnings: list[IssueModel]
    unrecognised_columns: list[UnrecognisedColumn]
    thresholds: Thresholds
    provenance: dict[str, Any]
    disclaimer: str = DISCLAIMER


class Contributor(BaseModel):
    group: str
    target_type: Literal["vertebra", "disc", "region", "person"]
    level: Optional[str] = None
    columns: list[str] = Field(default_factory=list)
    logit_change: float = 0.0  # same comparison on the log-odds scale; used for ranking
    change: float  # score with the group as measured minus score with the group replaced by a typical value


class ModelResult(BaseModel):
    status: Literal["ok", "insufficient_data", "out_of_distribution", "unavailable"]
    label: Optional[Literal["within_reference", "unusual_pattern", "indeterminate"]] = None
    score: Optional[float] = None
    band_low: Optional[float] = None
    band_high: Optional[float] = None
    person_context_used: Optional[bool] = None
    missing_count: Optional[int] = None
    out_of_range_count: Optional[int] = None
    contributors: list[Contributor] = Field(default_factory=list)
    message: str = ""


class OverallResult(BaseModel):
    state: OverallState
    reason: str
    statistics_state: OverallState
    model_status: str
    model_label: Optional[str] = None


class AnalyzeResponse(BaseModel):
    analysis_id: str  # random, never stored
    data_origin: Literal["synthetic"] = "synthetic"
    disclaimer: str = DISCLAIMER
    overall: OverallResult
    statistical: StatisticalResult
    model: ModelResult
