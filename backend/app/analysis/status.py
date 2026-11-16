"""Colour status per measurement and per level (demonstration thresholds, non-clinical)."""
from __future__ import annotations

from app import anatomy
from app.config import DEFAULT_ANALYSIS_CONFIG, AnalysisConfig
from app.schemas.analysis import Finding, LevelStatus

_RANK = {"missing": -1, "no_reference": -1, "within": 0, "review": 1, "large_deviation": 2}


def status_for_z(z: float | None, cfg: AnalysisConfig = DEFAULT_ANALYSIS_CONFIG) -> str:
    """Map a z-score to ``within`` / ``review`` / ``large_deviation``. The input must be present."""
    if z is None:
        return "no_reference"
    a = abs(z)
    if a <= cfg.within_max_abs_z:
        return "within"
    if a <= cfg.large_min_abs_z:
        return "review"
    return "large_deviation"


def apply_status(finding: Finding, cfg: AnalysisConfig = DEFAULT_ANALYSIS_CONFIG) -> Finding:
    if finding.status in ("missing", "no_reference"):
        return finding
    return finding.model_copy(update={"status": status_for_z(finding.z_score, cfg)})


def level_keys() -> list[tuple[str, str, str]]:
    """Every level the application reports: (level, target_type, region)."""
    keys = [(lv, "vertebra", anatomy.region_of(lv)) for lv in anatomy.VERTEBRAE]
    keys += [(d, "disc", anatomy.region_of(d)) for d in anatomy.DISCS]
    keys += [(r, "region", r) for r in anatomy.REGIONS]
    return keys


def roll_up(findings: list[Finding]) -> list[LevelStatus]:
    """Worst status per level. A disc finding colours its own disc entry only, never the adjacent bodies."""
    grouped: dict[tuple[str, str], list[Finding]] = {}
    for f in findings:
        grouped.setdefault((f.level, f.target_type), []).append(f)
    out: list[LevelStatus] = []
    for level, target, region in level_keys():
        group = grouped.get((level, target), [])
        usable = [f for f in group if f.status in ("within", "review", "large_deviation")]
        if usable:
            worst = max(usable, key=lambda f: (_RANK[f.status], abs(f.z_score or 0.0)))
            out.append(LevelStatus(level=level, target_type=target, region=region, status=worst.status, n_findings=len(group), n_present=len(usable), worst_column=worst.column, worst_abs_z=abs(worst.z_score or 0.0)))
        else:
            out.append(LevelStatus(level=level, target_type=target, region=region, status="missing", n_findings=len(group), n_present=0))
    return out
