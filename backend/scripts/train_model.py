"""Train the Spinalytics SYNTHETIC-data model and write its artifacts and model card.

Usage (from backend/):  python scripts/train_model.py [--out-dir app/artifacts]
Writes model.joblib, model_metrics.json and ../docs/MODEL_CARD.md. Every number in the card is read from
the metrics file, so the two cannot disagree. Run after build_reference.py and calibrate_overall_rule.py.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import anatomy  # noqa: E402
from app.ml import dataset as D  # noqa: E402
from app.ml.predict import BAND_HIGH, BAND_LOW, OOD_MARGIN, OOD_MAX_COLUMNS, count_out_of_distribution  # noqa: E402
from app.ml.train import DEFAULT_SEED, train_all  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
ARTIFACTS = ROOT / "backend" / "app" / "artifacts"
CARD = ROOT / "docs" / "MODEL_CARD.md"


def ood_rate(df: pd.DataFrame, split: pd.Series, bundle, name: str, healthy_only: bool) -> float:
    mask = (split == name).to_numpy() & ((df[anatomy.LABEL] == 1).to_numpy() if healthy_only else True)
    sub = df.loc[mask, anatomy.feature_columns()].reset_index(drop=True)
    return float(np.mean([count_out_of_distribution(sub.iloc[[i]], bundle) > OOD_MAX_COLUMNS for i in range(len(sub))]))


def pct(x: float) -> str:
    return f"{100 * x:.1f}%"


def render_card(m: dict, rule: dict, dataset_sha: str) -> str:
    sel = m["selected_model"].replace("_", " ")
    c = m["candidates_validation"]
    ab = m["ablations_validation"]
    t = m["test"]["full"]
    ts = m["test"]["spine_only"]
    cal = m["calibration"]["full"]
    rows = "\n".join(f"| {k.replace('_', ' ')} | {v['roc_auc']:.3f} | {v['pr_auc']:.3f} | {v['sensitivity']:.3f} | {v['specificity']:.3f} | {v['precision']:.3f} | {v['f1']:.3f} |" for k, v in c.items())
    abl = "\n".join(f"| {k.replace('_', ' ')} | {v['roc_auc']:.3f} |" for k, v in ab.items())
    return f"""# Model card: Spinalytics pattern model

> **Synthetic, development-only.** The model was trained and evaluated on generated data. It has never seen a real patient, it is not a medical device and it does not provide a diagnosis.

## Data origin

- Source: the synthetic Spinalytics dataset ({m['split_sizes']['train'] + m['split_sizes']['validation'] + m['split_sizes']['test']:,} rows, generator `generate_dataset.py`, dataset SHA-256 `{dataset_sha}`).
- Label: `is_healthy` (1 = healthy-like profile, 0 = an artificial deviation pattern was added). The pattern type is not given to the model.
- Split: {m['split_sizes']['train']:,} train, {m['split_sizes']['validation']:,} validation, {m['split_sizes']['test']:,} test, stratified on the label, one row per person.

## Intended use

Show an additional, clearly labelled signal beside the statistical comparison in a research and education demo. It answers one question only: does the overall pattern of measurements resemble the unusual training examples? It does not say which level is different (the statistical engine does), and it never replaces the statistical result.

## Method

- Features: each spine measurement as a z-score against the healthy-like training rows, minus the person's own median across levels (so overall body size does not look unusual), summarised per measurement type, plus the person columns. The reference is learned inside the pipeline on training rows only.
- Candidates compared on validation: logistic regression, random forest, histogram gradient boosting. Selected: **{sel}** (highest validation ROC-AUC; ties go to the simpler model).
- Two variants of the selected model: **full** (spine and person columns) and **spine only**, used when the person fields are not all supplied.
- Positive class for every metric: unusual pattern.

## Validation results (threshold 0.5, raw scores)

| Model | ROC-AUC | PR-AUC | Sensitivity | Specificity | Precision | F1 |
|---|---|---|---|---|---|---|
{rows}

Ablation for the selected model:

| Inputs | ROC-AUC |
|---|---|
{abl}

Control: with the training labels shuffled, validation ROC-AUC is {m['shuffled_label_control_validation_roc_auc']:.3f} (chance is 0.5), which shows the pipeline does not leak the label.

## Held-out test results (evaluated once, after selection)

| Variant | ROC-AUC (95% interval) | PR-AUC | Sensitivity | Specificity | Brier |
|---|---|---|---|---|---|
| full | {t['roc_auc']:.3f} ({t['roc_auc_ci95'][0]:.3f} to {t['roc_auc_ci95'][1]:.3f}) | {t['pr_auc']:.3f} | {t['sensitivity']:.3f} | {t['specificity']:.3f} | {t['brier']:.3f} |
| spine only | {ts['roc_auc']:.3f} ({ts['roc_auc_ci95'][0]:.3f} to {ts['roc_auc_ci95'][1]:.3f}) | {ts['pr_auc']:.3f} | {ts['sensitivity']:.3f} | {ts['specificity']:.3f} | {ts['brier']:.3f} |

The data contain borderline patterns on purpose, so a ROC-AUC far above these values would point to leakage.

## Calibration and abstention

- Calibration: {cal['method']} (fitted on validation; the check below is cross-fitted on validation halves). Largest gap between predicted and observed rate in any bin of at least {cal['reliability_after_crossfit']['min_bin_n']} rows: {cal['max_bin_gap']:.3f}. Brier score {cal['brier_before']:.3f} before, {cal['brier_after_crossfit']:.3f} after.
- Scores between {BAND_LOW:.2f} and {BAND_HIGH:.2f} are reported as **indeterminate**. On validation, {pct(m['indeterminate_band']['validation_share_in_band']['full'])} of rows fall in the band; outside it, accuracy is {pct(m['indeterminate_band']['validation_accuracy_outside_band']['full'])}.
- No score is produced when any spine measurement is missing (`insufficient_data`), or when more than {OOD_MAX_COLUMNS} measurements lie more than {int(OOD_MARGIN * 100)}% of the training range beyond its minimum or maximum (`out_of_distribution`). Share of validation healthy-like rows treated as out of distribution: {pct(m['out_of_distribution_validation_healthy_rate'])}.
- If the model file cannot be loaded the application returns `unavailable` and still shows the statistical result.

## Explanation

Occlusion: each group (a vertebra's heights, a vertebra's width and depth, a disc's height, a disc's angles, a regional angle, the person columns) is replaced by the healthy-like training median and the row is scored again. The signed change in score is shown for the five largest groups. It describes the model, not the anatomy.

## Statistical engine (for comparison)

The comparison engine flags a profile with limits calibrated on validation healthy-like rows. Its false-flag rate there is {pct(rule['validation_false_flag_rate'])} and its detection rate on validation unusual rows is {pct(rule['validation_detection_rate'])}.

## Limitations

- Trained on synthetic data with invented effect sizes; results say nothing about real patients or real conditions.
- The unusual pattern is an arithmetic perturbation, not a simulated disease. A score is not a diagnosis and not the probability of disease.
- Only C3 to L5 vertebral bodies, C2-C3 to L5-S1 discs and three regional angles are modelled; C1 and C2 are not.
- The model needs complete measurements. It was never trained with missing values and does not impute them.
- Person columns carry information only because the generator was built that way.

## Non-diagnostic statement

This project is an educational and research prototype. Nothing it produces is medical advice. A qualified clinician must interpret any real measurement.
"""


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Train and evaluate the Spinalytics model.")
    ap.add_argument("--out-dir", type=Path, default=ARTIFACTS)
    ap.add_argument("--card", type=Path, default=CARD)
    ap.add_argument("--seed", type=int, default=DEFAULT_SEED)
    a = ap.parse_args(argv)
    try:
        df, split = D.load_frame()
    except FileNotFoundError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    bundle, metrics = train_all(df, split, seed=a.seed)
    metrics["out_of_distribution_validation_healthy_rate"] = ood_rate(df, split, bundle, "validation", True)
    metrics["dataset_sha256"] = hashlib.sha256(D.DATA_PATH.read_bytes()).hexdigest()
    a.out_dir.mkdir(parents=True, exist_ok=True)
    model_path = a.out_dir / "model.joblib"
    joblib.dump(bundle, model_path, compress=3)
    metrics["model_file_bytes"] = model_path.stat().st_size
    (a.out_dir / "model_metrics.json").write_text(json.dumps(metrics, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    rule = json.loads((ARTIFACTS / "reference_stats.json").read_text(encoding="utf-8"))["overall_rule"]
    a.card.parent.mkdir(parents=True, exist_ok=True)
    a.card.write_text(render_card(metrics, rule, metrics["dataset_sha256"]), encoding="utf-8")
    t = metrics["test"]["full"]
    print(f"selected={metrics['selected_model']} val_auc={metrics['validation_selected']['full']['roc_auc']:.4f} test_auc={t['roc_auc']:.4f} size={model_path.stat().st_size / 1e6:.2f} MB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
