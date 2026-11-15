"""Fixed, stratified train/validation/test split of the Spinalytics SYNTHETIC dataset.

One row is one person, so a row-level split is a subject-level split.

Usage (from backend/):  python scripts/make_splits.py [--data ...] [--out ../data/splits.csv] [--seed 20261122]
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
SPLIT_SEED = 20261122
FRACTIONS = {"train": 0.70, "validation": 0.15, "test": 0.15}
LABEL = "is_healthy"


def make_splits(labels: np.ndarray, seed: int = SPLIT_SEED) -> np.ndarray:
    """Return an array of "train" / "validation" / "test", stratified on the label."""
    labels = np.asarray(labels)
    rng = np.random.default_rng(seed)
    split = np.empty(len(labels), dtype=object)
    for value in np.unique(labels):
        idx = rng.permutation(np.flatnonzero(labels == value))
        n_train = int(round(len(idx) * FRACTIONS["train"]))
        n_val = int(round(len(idx) * FRACTIONS["validation"]))
        split[idx[:n_train]] = "train"
        split[idx[n_train:n_train + n_val]] = "validation"
        split[idx[n_train + n_val:]] = "test"
    return split


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Create the fixed dataset split.")
    ap.add_argument("--data", type=Path, default=ROOT / "data" / "spinalytics_dataset.csv")
    ap.add_argument("--out", type=Path, default=ROOT / "data" / "splits.csv")
    ap.add_argument("--seed", type=int, default=SPLIT_SEED)
    a = ap.parse_args(argv)
    if not a.data.exists():
        print(f"error: dataset not found at {a.data}", file=sys.stderr)
        return 2
    labels = pd.read_csv(a.data, usecols=[LABEL])[LABEL].to_numpy()
    split = make_splits(labels, a.seed)
    a.out.parent.mkdir(parents=True, exist_ok=True)
    pd.DataFrame({"row_index": np.arange(len(split)), "split": split}).to_csv(a.out, index=False, lineterminator="\n")
    print(pd.Series(split).value_counts().to_dict(), "->", a.out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
