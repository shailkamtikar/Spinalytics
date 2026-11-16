"""Build the healthy-like reference distributions used by the comparison engine.

Only TRAIN rows with is_healthy == 1 are used, so validation and test rows never
influence the reference. SYNTHETIC development reference; not a clinical range.

Usage (from backend/):  python scripts/build_reference.py [--data ...] [--splits ../data/splits.csv] [--out app/artifacts/reference_stats.json]
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import anatomy  # noqa: E402
from app.features import add_derived_features  # noqa: E402
from scripts import generate_dataset as G  # noqa: E402
from scripts.make_splits import SPLIT_SEED  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "backend" / "app" / "artifacts" / "reference_stats.json"
QUANTILE_PROBABILITIES = np.linspace(0, 100, 201)  # every 0.5 percentile, for percentile lookup
COHORTS = {"all": None, "sex_male_0": 0, "sex_male_1": 1}
MIN_ROWS = 30
LIMITATION = "Synthetic development reference. Not a clinical reference range."


def _r(value) -> float:
    return round(float(value), 4)


def _stats(x: np.ndarray) -> dict:
    p = np.percentile(x, [1, 2.5, 5, 25, 50, 75, 95, 97.5, 99])
    return {
        "n": int(len(x)), "mean": _r(x.mean()), "sd": _r(x.std(ddof=1)), "median": _r(p[4]), "q1": _r(p[3]), "q3": _r(p[5]),
        "p01": _r(p[0]), "p02_5": _r(p[1]), "p05": _r(p[2]), "p95": _r(p[6]), "p97_5": _r(p[7]), "p99": _r(p[8]),
        "quantiles": [_r(v) for v in np.percentile(x, QUANTILE_PROBABILITIES)],
    }


def build_reference(df: pd.DataFrame, split: np.ndarray, provenance_extra: dict | None = None) -> dict:
    base = (np.asarray(split) == "train") & (df[anatomy.LABEL].to_numpy() == 1)
    columns = anatomy.spine_columns() + anatomy.derived_columns()
    values = pd.concat([df[anatomy.spine_columns()].astype(float), add_derived_features(df)], axis=1)[columns]
    cohorts = {}
    for name, sex in COHORTS.items():
        mask = base if sex is None else base & (df["sex_male"].to_numpy() == sex)
        if int(mask.sum()) < MIN_ROWS:
            raise ValueError(f"cohort {name} has only {int(mask.sum())} rows; at least {MIN_ROWS} are required")
        sub = values.loc[mask]
        cohorts[name] = {"n_rows": int(mask.sum()), "columns": {c: _stats(sub[c].dropna().to_numpy()) for c in columns}}
    return {
        "provenance": {
            "data_origin": "synthetic",
            "limitation": LIMITATION,
            "cohort_rule": "training rows with a healthy-like profile",
            "cohorts": {"all": "both sexes pooled", "sex_male_0": "sex_male == 0", "sex_male_1": "sex_male == 1"},
            "reference_interval_method": "nonparametric central 95% (2.5th to 97.5th percentile)",
            "measurement_method": "simulated measurements with added noise",
            "generator_version": G.GENERATOR_VERSION,
            "split_seed": SPLIT_SEED,
            "dataset_rows": int(len(df)),
            **(provenance_extra or {}),
        },
        "quantile_probabilities": {"start": 0, "stop": 100, "count": len(QUANTILE_PROBABILITIES)},
        "cohorts": cohorts,
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Build reference distributions.")
    ap.add_argument("--data", type=Path, default=ROOT / "data" / "spinalytics_dataset.csv")
    ap.add_argument("--splits", type=Path, default=ROOT / "data" / "splits.csv")
    ap.add_argument("--out", type=Path, default=OUT)
    a = ap.parse_args(argv)
    for p in (a.data, a.splits):
        if not p.exists():
            print(f"error: {p} not found. Run generate_dataset.py and make_splits.py first.", file=sys.stderr)
            return 2
    df = pd.read_csv(a.data)
    split = pd.read_csv(a.splits)["split"].to_numpy()
    if len(split) != len(df):
        print("error: splits file does not match the dataset length", file=sys.stderr)
        return 2
    extra = {"dataset_sha256": hashlib.sha256(a.data.read_bytes()).hexdigest(), "generator_seed": G.DEFAULT_SEED}
    ref = build_reference(df, split, extra)
    a.out.parent.mkdir(parents=True, exist_ok=True)
    a.out.write_text(json.dumps(ref, separators=(",", ":")) + "\n", encoding="utf-8")
    sizes = {k: v["n_rows"] for k, v in ref["cohorts"].items()}
    print(sizes, f"{len(ref['cohorts']['all']['columns'])} columns ->", a.out, f"({a.out.stat().st_size / 1e6:.2f} MB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
