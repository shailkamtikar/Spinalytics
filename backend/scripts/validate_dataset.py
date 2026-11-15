"""Data-quality gate for the Spinalytics SYNTHETIC dataset.

Exits 0 when every check passes and 1 otherwise, so later steps can depend on it.

Usage (from backend/):
    python scripts/validate_dataset.py [--data ../data/spinalytics_dataset.csv] [--report ../data/reports/data_quality_report.md]
"""
from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import rankdata

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import anatomy  # noqa: E402
from scripts import generate_dataset as G  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
CATALOG = ROOT / "backend" / "app" / "artifacts" / "feature_catalog.json"
MAX_SINGLE_COLUMN_AUC = 0.70
BALANCE_TOLERANCE = 0.01
TYPICAL_MEDIAN_FACTOR = (0.6, 1.6)  # a length column's median must sit near the generator baseline


@dataclass
class Check:
    name: str
    passed: bool
    detail: str = ""


def _auc(values: np.ndarray, positive: np.ndarray) -> float:
    """ROC-AUC of one column against a binary label, via the rank-sum identity."""
    n1, n0 = int(positive.sum()), int((~positive).sum())
    if n1 == 0 or n0 == 0:
        return 0.5
    ranks = rankdata(values)
    return float((ranks[positive].sum() - n1 * (n1 + 1) / 2) / (n1 * n0))


def validate(df: pd.DataFrame, catalog: dict) -> list[Check]:
    checks: list[Check] = []
    expected = [f["column"] for f in catalog["features"]] + [catalog["label"]]
    missing = [c for c in expected if c not in df.columns]
    extra = [c for c in df.columns if c not in expected]
    checks.append(Check("schema matches the feature catalog", not missing and not extra, f"missing={missing[:5]} extra={extra[:5]}" if missing or extra else f"{len(expected)} columns"))
    if missing:
        return checks  # nothing else is meaningful without the columns
    label = catalog["label"]
    feats = catalog["features"]
    checks.append(Check("label is the last column", df.columns[-1] == label, str(df.columns[-1])))

    bad_units = [f["column"] for f in feats if f["kind"] == "length" and not f["column"].endswith("_mm") or f["kind"] == "angle" and not f["column"].endswith("_deg")]
    checks.append(Check("units: lengths end in _mm, angles in _deg", not bad_units, str(bad_units[:5])))

    numeric = df[expected].apply(pd.to_numeric, errors="coerce")
    blanks = numeric.isna().sum()
    blank_cols = blanks[blanks > 0]
    checks.append(Check("no blank or non-numeric cells", blank_cols.empty, f"{int(blanks.sum())} cells in {list(blank_cols.index[:5])}" if not blank_cols.empty else "0 cells"))
    arr = numeric.to_numpy(dtype=float)
    checks.append(Check("no infinite values", not np.isinf(arr).any()))
    dups = int(df.duplicated().sum())
    checks.append(Check("no duplicate rows", dups == 0, f"{dups} duplicates"))

    labels = set(pd.unique(numeric[label].dropna()))
    checks.append(Check("label values are 0 or 1", labels <= {0, 1}, str(sorted(labels))))
    share = float((numeric[label] == 1).mean())
    checks.append(Check("classes balanced (50% +/- 1 point)", abs(share - 0.5) <= BALANCE_TOLERANCE, f"healthy share = {share:.4f}"))

    out_of_range = []
    for f in feats:
        col = numeric[f["column"]]
        n_bad = int(((col < f["min_supported"]) | (col > f["max_supported"])).sum())
        if n_bad:
            out_of_range.append(f"{f['column']} ({n_bad})")
    checks.append(Check("values inside supported (generator) ranges", not out_of_range, ", ".join(out_of_range[:5])))

    typical = G.typical_values()
    off_scale = []
    for col, base in typical.items():
        med = float(numeric[col].median())
        if not (TYPICAL_MEDIAN_FACTOR[0] * base <= med <= TYPICAL_MEDIAN_FACTOR[1] * base):
            off_scale.append(f"{col} (median {med:.2f}, expected near {base:.2f})")
    checks.append(Check("length columns are on the millimetre scale", not off_scale, ", ".join(off_scale[:5])))

    nunique = numeric[[f["column"] for f in feats]].nunique()
    constant = list(nunique[nunique < 2].index)
    checks.append(Check("no constant columns", not constant, str(constant[:5])))

    positive = (numeric[label] == 0).to_numpy()
    best_col, best_auc = "", 0.5
    for f in feats:
        v = numeric[f["column"]].to_numpy()
        if np.isnan(v).any():
            continue
        a = _auc(v, positive)
        a = max(a, 1 - a)
        if a > best_auc:
            best_col, best_auc = f["column"], a
    checks.append(Check(f"no single-column shortcut to the label (best ROC-AUC < {MAX_SINGLE_COLUMN_AUC})", best_auc < MAX_SINGLE_COLUMN_AUC, f"{best_col}: {best_auc:.3f}"))
    return checks


def render_report(checks: list[Check], df: pd.DataFrame, source: str) -> str:
    failed = [c for c in checks if not c.passed]
    lines = [
        "# Spinalytics dataset: data-quality report",
        "",
        "> **Synthetic, development-only.** Every number below describes generated data, not real patients.",
        "",
        f"- Source: `{source}`",
        f"- Rows: {len(df):,} · Columns: {df.shape[1]}",
        f"- Checks: {len(checks) - len(failed)} passed, {len(failed)} failed",
        "",
        "| Check | Status | Detail |",
        "|---|---|---|",
    ]
    lines += [f"| {c.name} | {'PASS' if c.passed else 'FAIL'} | {c.detail} |" for c in checks]
    if failed:
        lines += ["", "## Warnings", ""] + [f"- {c.name}: {c.detail}" for c in failed]
    return "\n".join(lines) + "\n"


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Validate the Spinalytics synthetic dataset.")
    ap.add_argument("--data", type=Path, default=ROOT / "data" / "spinalytics_dataset.csv")
    ap.add_argument("--report", type=Path, default=ROOT / "data" / "reports" / "data_quality_report.md")
    a = ap.parse_args(argv)
    if not a.data.exists():
        print(f"error: dataset not found at {a.data}. Run scripts/generate_dataset.py first.", file=sys.stderr)
        return 2
    df = pd.read_csv(a.data)
    checks = validate(df, json.loads(CATALOG.read_text(encoding="utf-8")))
    a.report.parent.mkdir(parents=True, exist_ok=True)
    a.report.write_text(render_report(checks, df, a.data.name), encoding="utf-8")
    for c in checks:
        print(f"{'PASS' if c.passed else 'FAIL'}  {c.name}  {c.detail}")
    failed = sum(not c.passed for c in checks)
    print(f"{len(checks) - failed} passed, {failed} failed; report: {a.report}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
