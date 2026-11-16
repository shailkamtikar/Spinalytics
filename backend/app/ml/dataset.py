"""Load the synthetic dataset and the fixed split as (X, y) pairs. Development only."""
from __future__ import annotations

from pathlib import Path

import pandas as pd

from app import anatomy

ROOT = Path(__file__).resolve().parents[3]
DATA_PATH = ROOT / "data" / "spinalytics_dataset.csv"
SPLITS_PATH = ROOT / "data" / "splits.csv"
SPLIT_NAMES = ("train", "validation", "test")


def load_frame(data: Path = DATA_PATH, splits: Path = SPLITS_PATH) -> tuple[pd.DataFrame, pd.Series]:
    if not data.exists() or not splits.exists():
        raise FileNotFoundError(f"{data} or {splits} not found. Run scripts/generate_dataset.py and scripts/make_splits.py first.")
    df = pd.read_csv(data)
    split = pd.read_csv(splits)["split"]
    if len(split) != len(df):
        raise ValueError("splits file does not match the dataset length")
    return df, split


def split_xy(df: pd.DataFrame, split: pd.Series, name: str) -> tuple[pd.DataFrame, pd.Series]:
    """Features (220 input columns) and the label ``is_healthy`` for one split."""
    if name not in SPLIT_NAMES:
        raise ValueError(f"unknown split '{name}'")
    mask = (split == name).to_numpy()
    return df.loc[mask, anatomy.feature_columns()].reset_index(drop=True), df.loc[mask, anatomy.LABEL].reset_index(drop=True)
