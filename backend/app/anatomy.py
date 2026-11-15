"""Single source of truth for spinal levels and dataset column names.

Every column is mapped to (level, feature, unit, kind) here. Nothing else in the
code base parses column names, and an unknown name is rejected, never guessed.
"""
from __future__ import annotations

import re
from dataclasses import asdict, dataclass

REGIONS = ("cervical", "thoracic", "lumbar")
_REGION_BY_LETTER = {"C": "cervical", "T": "thoracic", "L": "lumbar"}

# Vertebral-body measurements cover C3-L5. C1 has no vertebral body and the body
# of C2 carries the dens, so the same measurements do not apply to them.
VERTEBRAE = tuple([f"C{i}" for i in range(3, 8)] + [f"T{i}" for i in range(1, 13)] + [f"L{i}" for i in range(1, 6)])
UNMEASURED_VERTEBRAE = ("C1", "C2")
_CHAIN = ("C2",) + VERTEBRAE + ("S1",)
DISCS = tuple(f"{a}-{b}" for a, b in zip(_CHAIN[:-1], _CHAIN[1:]))  # "C2-C3" ... "L5-S1"

LABEL = "is_healthy"

VERTEBRA_FEATURES = {
    "vertebral_body_height_anterior_mm": "Vertebral body height at the front (anterior) margin",
    "vertebral_body_height_posterior_mm": "Vertebral body height at the back (posterior) margin",
    "vertebral_body_height_left_mm": "Vertebral body height at the left lateral margin",
    "vertebral_body_height_right_mm": "Vertebral body height at the right lateral margin",
    "vertebral_body_width_mm": "Side-to-side (transverse) width of the vertebral body",
    "vertebral_body_depth_mm": "Front-to-back (anteroposterior) depth of the vertebral body",
}
DISC_FEATURES = {
    "disc_height_mm": "Height of the intervertebral disc between the two named vertebrae",
    "segmental_sagittal_angle_deg": "Sagittal angle between the superior endplates of the two named vertebrae; lordosis positive, kyphosis negative",
    "segmental_coronal_angle_deg": "Coronal (side-bending) angle between the same endplates; signed, baseline near zero",
}
REGIONAL_FEATURES = {
    "cervical_sagittal_angle_C2_C7_deg": ("cervical", "Sagittal angle from the superior endplate of C2 to that of C7; lordosis positive"),
    "thoracic_sagittal_angle_T1_T12_deg": ("thoracic", "Sagittal angle from the superior endplate of T1 to that of T12; negative means kyphosis"),
    "lumbar_sagittal_angle_L1_S1_deg": ("lumbar", "Sagittal angle from the superior endplate of L1 to that of S1; lordosis positive"),
}
DERIVED_VERTEBRA_FEATURES = {
    "vertebral_body_height_mm": ("mm", "length", "Mean of anterior and posterior body height"),
    "vertebral_body_wedge_ratio": ("ratio", "ratio", "Anterior height divided by posterior height"),
    "vertebral_body_lateral_height_difference_mm": ("mm", "difference", "Left height minus right height"),
}

# name: (unit, value type, minimum, maximum, description). Ranges are input limits, not clinical ranges.
PERSON_FIELDS: dict[str, tuple[str, str, float, float, str]] = {
    "age_years": ("years", "int", 18, 110, "Age in whole years"),
    "sex_male": ("0/1", "int", 0, 1, "1 = male, 0 = female; used to choose a sex-specific reference"),
    "height_cm": ("cm", "float", 120, 220, "Standing height; body size scales vertebral dimensions"),
    "weight_kg": ("kg", "float", 30, 250, "Body weight"),
    "bmi": ("kg/m2", "float", 10, 70, "Body-mass index"),
    "smoker": ("0/1", "int", 0, 1, "1 = currently smokes"),
    "physical_activity_level": ("0-3", "int", 0, 3, "0 sedentary, 1 light, 2 moderate, 3 very active"),
    "heavy_lifting_occupation": ("0/1", "int", 0, 1, "1 = work involves regular heavy lifting"),
    "family_history_spinal_condition": ("0/1", "int", 0, 1, "1 = a close relative has a spinal condition"),
    "prior_spinal_injury": ("0/1", "int", 0, 1, "1 = a previous spinal injury is reported"),
    "prior_spinal_surgery": ("0/1", "int", 0, 1, "1 = previous spinal surgery is reported"),
    "bone_density_t_score": ("T-score", "float", -6, 6, "Bone-density T-score; lower means lower density"),
    "osteoporosis_diagnosis": ("0/1", "int", 0, 1, "1 = an osteoporosis diagnosis is reported"),
    "back_pain_score_0_10": ("0-10", "int", 0, 10, "Self-rated back pain, 0 none to 10 worst"),
    "neck_pain_score_0_10": ("0-10", "int", 0, 10, "Self-rated neck pain, 0 none to 10 worst"),
    "limb_numbness_or_tingling": ("0/1", "int", 0, 1, "1 = numbness or tingling in an arm or leg is reported"),
}

_VERTEBRA_RE = re.compile(r"^([A-Z]\d{1,2})_(vertebral_body_\w+)$")
_DISC_RE = re.compile(r"^([A-Z]\d{1,2})_([A-Z]\d{1,2})_(\w+)$")


class UnknownColumnError(ValueError):
    """Raised when a column name is not part of the Spinalytics schema."""


@dataclass(frozen=True)
class FeatureInfo:
    column: str
    target_type: str  # person | vertebra | disc | region
    level: str | None  # "L3", "L4-L5", "lumbar", or None for person columns
    region: str | None
    feature: str
    unit: str
    kind: str  # person | length | angle | ratio | difference
    description: str
    derived: bool = False

    @property
    def percentage_allowed(self) -> bool:
        """Percentage difference is meaningful only for ratio-scale lengths."""
        return self.kind == "length"

    def to_dict(self) -> dict:
        return {**asdict(self), "percentage_allowed": self.percentage_allowed}


def region_of(level: str) -> str:
    """Region of a vertebra ("L3") or disc ("T12-L1"; a disc belongs to its upper vertebra's region)."""
    return _REGION_BY_LETTER[level[0]]


def _unit_and_kind(feature: str) -> tuple[str, str]:
    if feature.endswith("_mm"):
        return "mm", "length"
    if feature.endswith("_deg"):
        return "deg", "angle"
    raise UnknownColumnError(f"feature '{feature}' has no recognised unit suffix")


def parse_column(column: str) -> FeatureInfo:
    """Map a dataset column name to its anatomical meaning, or raise UnknownColumnError."""
    if column in PERSON_FIELDS:
        unit, _, _, _, description = PERSON_FIELDS[column]
        return FeatureInfo(column, "person", None, None, column, unit, "person", description)
    if column in REGIONAL_FEATURES:
        region, description = REGIONAL_FEATURES[column]
        return FeatureInfo(column, "region", region, region, column, "deg", "angle", description)
    m = _DISC_RE.match(column)
    if m and m.group(3) in DISC_FEATURES:
        level = f"{m.group(1)}-{m.group(2)}"
        if level not in DISCS:
            raise UnknownColumnError(f"'{column}': disc level {level} is not supported")
        unit, kind = _unit_and_kind(m.group(3))
        return FeatureInfo(column, "disc", level, region_of(level), m.group(3), unit, kind, DISC_FEATURES[m.group(3)])
    m = _VERTEBRA_RE.match(column)
    if m and (m.group(2) in VERTEBRA_FEATURES or m.group(2) in DERIVED_VERTEBRA_FEATURES):
        level, feature = m.group(1), m.group(2)
        if level not in VERTEBRAE:
            raise UnknownColumnError(f"'{column}': vertebral level {level} is not supported")
        if feature in VERTEBRA_FEATURES:
            unit, kind = _unit_and_kind(feature)
            return FeatureInfo(column, "vertebra", level, region_of(level), feature, unit, kind, VERTEBRA_FEATURES[feature])
        unit, kind, description = DERIVED_VERTEBRA_FEATURES[feature]
        return FeatureInfo(column, "vertebra", level, region_of(level), feature, unit, kind, description, derived=True)
    raise UnknownColumnError(f"'{column}' is not a recognised Spinalytics column")


def person_columns() -> list[str]:
    return list(PERSON_FIELDS)


def spine_columns() -> list[str]:
    """The 204 directly measured spine columns, in dataset order."""
    cols = [f"{lv}_{f}" for lv in VERTEBRAE for f in VERTEBRA_FEATURES]
    cols += [f"{d.replace('-', '_')}_{f}" for d in DISCS for f in DISC_FEATURES]
    return cols + list(REGIONAL_FEATURES)


def derived_columns() -> list[str]:
    return [f"{lv}_{f}" for lv in VERTEBRAE for f in DERIVED_VERTEBRA_FEATURES]


def feature_columns() -> list[str]:
    """All 220 input columns: person columns followed by spine columns."""
    return person_columns() + spine_columns()
