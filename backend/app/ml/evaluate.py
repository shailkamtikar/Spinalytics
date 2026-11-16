"""Evaluation helpers. The positive class is "unusual pattern" (is_healthy == 0)."""
from __future__ import annotations

import numpy as np
from sklearn.metrics import average_precision_score, brier_score_loss, roc_auc_score


def confusion_metrics(y_unusual: np.ndarray, score: np.ndarray, threshold: float = 0.5) -> dict:
    y = np.asarray(y_unusual).astype(bool)
    pred = np.asarray(score) >= threshold
    tp, fp = int((pred & y).sum()), int((pred & ~y).sum())
    tn, fn = int((~pred & ~y).sum()), int((~pred & y).sum())
    sens = tp / (tp + fn) if tp + fn else float("nan")
    spec = tn / (tn + fp) if tn + fp else float("nan")
    prec = tp / (tp + fp) if tp + fp else float("nan")
    f1 = 2 * prec * sens / (prec + sens) if tp else 0.0
    return {"tp": tp, "fp": fp, "tn": tn, "fn": fn, "sensitivity": sens, "specificity": spec, "precision": prec, "f1": f1}


def evaluate_scores(y_unusual: np.ndarray, score: np.ndarray, threshold: float = 0.5) -> dict:
    y = np.asarray(y_unusual).astype(int)
    return {
        "n": int(len(y)),
        "roc_auc": float(roc_auc_score(y, score)),
        "pr_auc": float(average_precision_score(y, score)),
        "brier": float(brier_score_loss(y, score)),
        "threshold": threshold,
        **confusion_metrics(y, score, threshold),
    }


def bootstrap_auc_ci(y_unusual: np.ndarray, score: np.ndarray, n_boot: int = 1000, seed: int = 20261201) -> tuple[float, float]:
    y, s = np.asarray(y_unusual).astype(int), np.asarray(score)
    rng = np.random.default_rng(seed)
    aucs = []
    for _ in range(n_boot):
        idx = rng.integers(0, len(y), len(y))
        if y[idx].min() == y[idx].max():
            continue
        aucs.append(roc_auc_score(y[idx], s[idx]))
    return float(np.percentile(aucs, 2.5)), float(np.percentile(aucs, 97.5))


def reliability_table(y_unusual: np.ndarray, prob: np.ndarray, bins: int = 10, min_bin_n: int = 20) -> dict:
    """Mean predicted vs observed rate in equal-width probability bins; max gap over bins with enough rows."""
    y, p = np.asarray(y_unusual).astype(float), np.asarray(prob)
    edges = np.linspace(0, 1, bins + 1)
    idx = np.clip(np.digitize(p, edges[1:-1]), 0, bins - 1)
    rows, gaps = [], []
    for b in range(bins):
        m = idx == b
        n = int(m.sum())
        row = {"bin_low": round(edges[b], 2), "bin_high": round(edges[b + 1], 2), "n": n, "mean_predicted": float(p[m].mean()) if n else None, "observed_rate": float(y[m].mean()) if n else None}
        rows.append(row)
        if n >= min_bin_n:
            gaps.append(abs(row["mean_predicted"] - row["observed_rate"]))
    return {"bins": rows, "max_gap": float(max(gaps)) if gaps else None, "min_bin_n": min_bin_n}
