"""Occlusion explanation: how much does the model score move if one group of measurements looked typical?

Works with any model and needs no extra package. For each group (a vertebra's heights, a vertebra's
width and depth, a disc's height, a disc's angles, one regional angle, the person columns) the group's
values are replaced by the healthy-like training median and the row is scored again. Changes are reported as a score difference and as a log-odds difference (which stays informative when the score is near 0 or 1). A positive change
means the group is pushing the score toward "unusual pattern".
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from app import anatomy
from app.ml.calibration import ModelBundle, Variant

_HEIGHTS = ("vertebral_body_height_anterior_mm", "vertebral_body_height_posterior_mm", "vertebral_body_height_left_mm", "vertebral_body_height_right_mm")
_BODY_SIZE = ("vertebral_body_width_mm", "vertebral_body_depth_mm")


@dataclass(frozen=True)
class Group:
    key: str
    target_type: str  # vertebra | disc | region | person
    level: str | None
    label: str
    columns: tuple[str, ...]


def occlusion_groups(include_person: bool) -> list[Group]:
    groups: list[Group] = []
    for lv in anatomy.VERTEBRAE:
        groups.append(Group(f"{lv}:heights", "vertebra", lv, f"{lv} vertebral body heights", tuple(f"{lv}_{f}" for f in _HEIGHTS)))
        groups.append(Group(f"{lv}:size", "vertebra", lv, f"{lv} vertebral body width and depth", tuple(f"{lv}_{f}" for f in _BODY_SIZE)))
    for d in anatomy.DISCS:
        col = d.replace("-", "_")
        groups.append(Group(f"{d}:disc_height", "disc", d, f"{d} disc height", (f"{col}_disc_height_mm",)))
        groups.append(Group(f"{d}:disc_angles", "disc", d, f"{d} segmental angles", (f"{col}_segmental_sagittal_angle_deg", f"{col}_segmental_coronal_angle_deg")))
    for col, (region, _) in anatomy.REGIONAL_FEATURES.items():
        groups.append(Group(f"{region}:regional_angle", "region", region, f"{region} regional angle", (col,)))
    if include_person:
        groups.append(Group("person", "person", None, "person-level context", tuple(anatomy.person_columns())))
    return groups


def explain(variant: Variant, bundle: ModelBundle, row: pd.DataFrame, include_person: bool, top: int = 5) -> list[dict]:
    """Return up to ``top`` groups sorted by absolute change, each with a signed score change."""
    groups = occlusion_groups(include_person)
    base = row[anatomy.feature_columns()].astype(float).reset_index(drop=True)
    batch = pd.concat([base] * (len(groups) + 1), ignore_index=True)
    for i, g in enumerate(groups, start=1):
        batch.loc[i, list(g.columns)] = bundle.ref_median[list(g.columns)].to_numpy()
    scores = variant.score(batch)
    original = float(scores[0])
    def logit(p: float) -> float:
        p = min(max(p, 1e-4), 1 - 1e-4)
        return float(np.log(p / (1 - p)))

    out = [
        {"group": g.label, "target_type": g.target_type, "level": g.level, "columns": list(g.columns),
         "change": round(original - float(s), 4), "logit_change": round(logit(original) - logit(float(s)), 3)}
        for g, s in zip(groups, scores[1:])
    ]
    out.sort(key=lambda c: abs(c["logit_change"]), reverse=True)
    return out[:top]
