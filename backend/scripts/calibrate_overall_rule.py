"""Calibrate the overall statistical rule on VALIDATION healthy-like rows only.

A reference-like profile has ~270 comparisons, so some land outside the central range by chance
and body size shifts many of them together. The limits below are the 97.5th percentile of how many
such measurements validation healthy rows show (and the 99th percentile of their largest |z|),
so the rule is not tripped by chance. Test rows are never touched.

Writes the ``overall_rule`` block into app/artifacts/reference_stats.json.
Usage (from backend/):  python scripts/calibrate_overall_rule.py
Run after build_reference.py (which rewrites the file without this block).
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import anatomy  # noqa: E402
from app.analysis.reference import Reference  # noqa: E402
from app.config import DEFAULT_ANALYSIS_CONFIG  # noqa: E402
from app.features import add_derived_features  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
REFERENCE = ROOT / "backend" / "app" / "artifacts" / "reference_stats.json"
LIMITATION = "Synthetic development calibration. Not a clinical rule."


def z_matrix(df: pd.DataFrame, reference: Reference) -> np.ndarray:
    """z-scores of every spine and derived column against each row's own-sex reference (vectorised)."""
    cols = anatomy.spine_columns() + anatomy.derived_columns()
    values = pd.concat([df[anatomy.spine_columns()].astype(float), add_derived_features(df)], axis=1)[cols].to_numpy()
    z = np.full(values.shape, np.nan)
    for sex in (0, 1):
        mask = (df["sex_male"].to_numpy() == sex)
        cohort = Reference.cohort_name(sex)
        mean = np.array([reference.stats(cohort, c)["mean"] for c in cols])
        sd = np.array([reference.stats(cohort, c)["sd"] for c in cols])
        z[mask] = (values[mask] - mean) / sd
    return z


def row_features(z: np.ndarray, cfg=DEFAULT_ANALYSIS_CONFIG) -> dict[str, np.ndarray]:
    a = np.abs(z)
    return {
        "outliers": (a > cfg.within_max_abs_z).sum(axis=1),
        "large": (a > cfg.large_min_abs_z).sum(axis=1),
        "max_z": np.nanmax(a, axis=1),
    }


def flagged(feats: dict[str, np.ndarray], rule: dict) -> np.ndarray:
    return (feats["max_z"] > rule["extreme_abs_z"]) | (feats["large"] > rule["large_count_limit"]) | (feats["outliers"] > rule["chance_outlier_limit"])


def calibrate(df: pd.DataFrame, split: np.ndarray, reference: Reference, cfg=DEFAULT_ANALYSIS_CONFIG) -> dict:
    val = np.asarray(split) == "validation"
    healthy = df[anatomy.LABEL].to_numpy() == 1
    h_mask, u_mask = val & healthy, val & ~healthy
    feats_h = row_features(z_matrix(df.loc[h_mask], reference), cfg)
    rule = {
        "chance_outlier_limit": int(np.percentile(feats_h["outliers"], 97.5, method="higher")),
        "large_count_limit": int(np.percentile(feats_h["large"], 97.5, method="higher")),
        "extreme_abs_z": round(float(np.percentile(feats_h["max_z"], 99, method="higher")), 4),
        "z_within_max": cfg.within_max_abs_z,
        "z_large_min": cfg.large_min_abs_z,
        "calibrated_on": "validation split, healthy-like rows only",
        "n_calibration_rows": int(h_mask.sum()),
        "limitation": LIMITATION,
    }
    rule["validation_false_flag_rate"] = round(float(flagged(feats_h, rule).mean()), 4)
    feats_u = row_features(z_matrix(df.loc[u_mask], reference), cfg)
    rule["validation_detection_rate"] = round(float(flagged(feats_u, rule).mean()), 4)
    rule["n_validation_unusual_rows"] = int(u_mask.sum())
    return rule


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Calibrate the overall statistical rule.")
    ap.add_argument("--data", type=Path, default=ROOT / "data" / "spinalytics_dataset.csv")
    ap.add_argument("--splits", type=Path, default=ROOT / "data" / "splits.csv")
    ap.add_argument("--reference", type=Path, default=REFERENCE)
    a = ap.parse_args(argv)
    for p in (a.data, a.splits, a.reference):
        if not p.exists():
            print(f"error: {p} not found", file=sys.stderr)
            return 2
    data = json.loads(a.reference.read_text(encoding="utf-8"))
    reference = Reference(data)
    rule = calibrate(pd.read_csv(a.data), pd.read_csv(a.splits)["split"].to_numpy(), reference)
    data["overall_rule"] = rule
    a.reference.write_text(json.dumps(data, separators=(",", ":")) + "\n", encoding="utf-8")
    print(json.dumps(rule, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
