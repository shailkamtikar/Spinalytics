"""Generate the Spinalytics SYNTHETIC development dataset.

Every number here is a generator setting chosen to give varied, coherent test
patterns. Nothing is taken from a clinical cohort, and nothing produced is a
reference range, a normal range or a diagnostic cutoff.

Usage (from backend/):
    python scripts/generate_dataset.py --n 50000 --seed 20261115 --out ../data/spinalytics_dataset.csv
    python scripts/generate_dataset.py --sample-cases app/artifacts/sample_cases.json

The same --n and --seed always give the same file.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

GENERATOR_VERSION = "2.0.0"
DEFAULT_N = 50_000
DEFAULT_SEED = 20261115
ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUT = ROOT / "data" / "spinalytics_dataset.csv"
LABEL = "is_healthy"

# ---------------- anatomy ----------------
VERT = [f"C{i}" for i in range(3, 8)] + [f"T{i}" for i in range(1, 13)] + [f"L{i}" for i in range(1, 6)]
CHAIN = ["C2"] + VERT + ["S1"]
DISCS = [f"{a}_{b}" for a, b in zip(CHAIN[:-1], CHAIN[1:])]
NV, ND = len(VERT), len(DISCS)
REG = {"C": 0, "T": 1, "L": 2}
VR = np.array([REG[v[0]] for v in VERT])
DR = np.array([REG[d[0]] for d in DISCS])
VERT_MEASURES = ["height_anterior_mm", "height_posterior_mm", "height_left_mm", "height_right_mm", "width_mm", "depth_mm"]
DISC_MEASURES = ["disc_height_mm", "segmental_sagittal_angle_deg", "segmental_coronal_angle_deg"]
REGIONAL = ["cervical_sagittal_angle_C2_C7_deg", "thoracic_sagittal_angle_T1_T12_deg", "lumbar_sagittal_angle_L1_S1_deg"]
PERSON = [
    "age_years", "sex_male", "height_cm", "weight_kg", "bmi", "smoker", "physical_activity_level",
    "heavy_lifting_occupation", "family_history_spinal_condition", "prior_spinal_injury", "prior_spinal_surgery",
    "bone_density_t_score", "osteoporosis_diagnosis", "back_pain_score_0_10", "neck_pain_score_0_10",
    "limb_numbness_or_tingling",
]

# ---------------- baseline level means (generator settings, not clinical values) ----------------
H_MEAN = np.array([14.0, 13.8, 13.6, 13.8, 14.8] + list(np.linspace(16.5, 24.5, 12)) + [26.0, 27.0, 27.5, 27.5, 27.0])
W_MEAN = np.array([16.0, 17.0, 18.0, 19.5, 21.0, 27.0, 26.0, 25.5, 25.5, 26.5, 27.5, 29.0, 30.5, 32.0, 34.0, 36.5, 39.5, 41.0, 43.0, 45.0, 47.5, 50.0])
D_MEAN = np.array([15.5, 15.6, 15.8, 16.4, 16.8] + list(np.linspace(17.5, 30.0, 12)) + [31.0, 32.5, 33.5, 34.0, 34.0])
WEDGE = np.array([0, 0, .01, .01, .02, .03, .04, .05, .06, .06, .06, .06, .06, .05, .05, .04, .04, .03, .01, 0, -.04, -.10])
DISC_MEAN = np.array([4.6, 4.9, 5.1, 5.2, 5.1, 4.6] + list(np.linspace(3.6, 6.0, 11)) + [7.2, 8.2, 9.4, 10.4, 11.0, 9.8])
SAG_MEAN = np.array([3, 4, 4.5, 4, 3, 0, -2, -3, -4, -4.5, -5, -5, -4.5, -4, -3, -2, -1, 0, 3, 7, 11, 18, 22.0])
SPANS = [(0, 4), (6, 16), (18, 22)]  # disc index ranges summed into the three regional angles
CV_BODY = float(np.sqrt(.055**2 + .02**2 + .025**2 + .02**2 + .015**2))
CV_DISC = float(np.sqrt(.04**2 + .08**2 + .05**2 + .05**2 + .05**2))
SD_SAG, SD_COR = float(np.hypot(1.2, 2.0)), float(np.hypot(0.8, 1.0))
DISC_FLOOR_MM = 0.3

# Supported value ranges, used by validation as generator bounds (NOT clinical cutoffs).
BODY_BOUNDS_FACTOR = (0.10, 2.50)   # x level mean
DISC_BOUNDS_FACTOR = (0.05, 3.00)   # x level mean
SAG_BOUNDS_DEG = 45.0               # +/- around the level mean
COR_BOUNDS_DEG = 40.0               # +/- around zero
REGIONAL_BOUNDS_DEG = 90.0          # +/- around the summed mean

# ---------------- deviation patterns: artificial measurement patterns, not diagnoses ----------------
FAMILIES = ["localized_height", "multi_level_height", "disc", "alignment", "asymmetry", "mixed", "borderline"]
BASE = FAMILIES[:5]
TIER_NAMES = ["subtle", "moderate", "obvious"]
TIERS = [(2.0, 3.0), (3.0, 4.5), (4.5, 7.0)]  # nominal effect size in SD units
TIER_P = [0.35, 0.40, 0.25]


def generate(n: int, seed: int) -> tuple[pd.DataFrame, dict]:
    """Return (dataset, meta). meta holds generator-internal ground truth aligned with the rows."""
    if n < 2:
        raise ValueError("--n must be at least 2")
    N = int(n)
    rng = np.random.default_rng(seed)

    def ar1(L, rho=0.7):
        x = np.empty((N, L)); x[:, 0] = rng.standard_normal(N)
        for j in range(1, L):
            x[:, j] = rho * x[:, j - 1] + np.sqrt(1 - rho**2) * rng.standard_normal(N)
        return x

    def heavy(shape):
        return rng.standard_t(5, size=shape) / np.sqrt(5 / 3)

    # ---- person-level features ----
    is_male = rng.integers(0, 2, N)
    age = rng.integers(20, 81, N)
    height = np.where(is_male == 1, 176.0, 162.5) + 6.5 * rng.standard_normal(N) - 0.04 * np.clip(age - 50, 0, None)
    bmi = np.exp(np.log(25.0) + 0.0015 * (age - 45) + 0.15 * rng.standard_normal(N))
    weight = bmi * (height / 100) ** 2
    smoker = (rng.random(N) < 0.22).astype(int)
    activity = rng.choice(4, N, p=[0.25, 0.35, 0.28, 0.12])  # 0 sedentary .. 3 very active
    heavy_job = (rng.random(N) < 0.20).astype(int)
    family_hist = (rng.random(N) < 0.15).astype(int)
    prior_injury = (rng.random(N) < 0.08 + 0.04 * heavy_job + 0.03 * (activity == 3)).astype(int)
    prior_surgery = (rng.random(N) < 0.02 + 0.12 * prior_injury).astype(int)
    t_score = -0.3 - 0.035 * (age - 50) - 0.35 * ((is_male == 0) & (age > 50)) - 0.2 * smoker + 0.1 * activity + 0.9 * rng.standard_normal(N)
    osteo = ((t_score <= -2.5) & (rng.random(N) < 0.7)).astype(int)

    # ---- label: risk-weighted, exactly balanced ----
    risk = (0.03 * (age - 50) + 0.5 * smoker + 0.4 * heavy_job + 1.0 * prior_injury + 0.7 * prior_surgery + 0.6 * family_hist
            + 0.5 * np.clip(-t_score - 1, 0, None) + 0.05 * (bmi - 25) - 0.2 * (activity - 1.4))
    latent = risk + 1.6 * rng.logistic(size=N)
    unhealthy = np.zeros(N, bool)
    unhealthy[np.argsort(-latent)[: N // 2]] = True

    # ---- deviation patterns (nominal SD units) ----
    e_ant, e_post, e_asym = np.zeros((N, NV)), np.zeros((N, NV)), np.zeros((N, NV))
    e_disc, e_sag, e_cor = np.zeros((N, ND)), np.zeros((N, ND)), np.zeros((N, ND))
    family = np.full(N, "none", dtype=object)
    tier = np.full(N, "none", dtype=object)
    natural = np.zeros(N, bool)

    def height_fx(i, lv, k, mode):
        a, p = {"wedge": (-k, -0.3 * k), "uniform": (-k, -k), "increase": (min(k, 3.0),) * 2}[mode]
        e_ant[i, lv] += a; e_post[i, lv] += p

    def apply(i, sub, k):
        if sub == "localized_height":
            height_fx(i, rng.integers(NV), k, rng.choice(["wedge", "uniform", "increase"], p=[.5, .4, .1]))
        elif sub == "multi_level_height":
            m = rng.integers(2, 6); s = rng.integers(0, NV - m + 1); mode = rng.choice(["wedge", "uniform"])
            for lv in range(s, s + m):
                height_fx(i, lv, k * rng.uniform(0.6, 1.0), mode)
        elif sub == "disc":
            m = rng.integers(1, 4)
            idx = np.arange(m) + rng.integers(0, ND - m + 1) if rng.random() < 0.6 else rng.choice(ND, m, replace=False)
            inc = rng.random() < 0.15
            for d in idx:
                e_disc[i, d] += min(k, 3.0) if inc else -min(k, 5.5) * rng.uniform(0.7, 1.0)
        elif sub == "alignment":
            sign = rng.choice([-1.0, 1.0])
            if rng.random() < 0.5:
                mem = np.flatnonzero(DR == rng.integers(3)); m = rng.integers(3, min(5, len(mem)) + 1); s = rng.integers(0, len(mem) - m + 1)
                e_sag[i, mem[s:s + m]] += sign * k * 0.8
            else:
                m = rng.integers(4, 9); s = rng.integers(0, ND - m + 1)
                e_cor[i, s:s + m] += sign * k * 0.9 * np.sin(np.pi * (np.arange(m) + 0.5) / m)
        else:  # asymmetry
            m = rng.integers(1, 5); s = rng.integers(0, NV - m + 1); sign = rng.choice([-1.0, 1.0])
            for lv in range(s, s + m):
                e_asym[i, lv] += sign * k * rng.uniform(0.7, 1.0)
                e_cor[i, lv + 1] += sign * k * 0.5

    low_bone = np.clip(-t_score - 1, 0, 2.5)
    for i in np.flatnonzero(unhealthy):
        # person-level history tilts WHICH kind of deviation appears (invented associations)
        w = np.array([
            1 + 0.8 * low_bone[i] + 1.5 * prior_injury[i],                                                  # localized height
            1 + 1.0 * low_bone[i],                                                                          # multi-level height
            1 + 0.03 * (age[i] - 20) + 0.6 * smoker[i] + 0.6 * heavy_job[i] + 0.05 * max(bmi[i] - 25, 0),   # disc
            1 + 1.5 * family_hist[i],                                                                       # alignment
            1 + 1.5 * family_hist[i],                                                                       # asymmetry
            1 + 1.5 * prior_surgery[i],                                                                     # mixed
            1.3,                                                                                            # borderline
        ])
        fam = rng.choice(FAMILIES, p=w / w.sum())
        family[i] = fam
        if fam == "borderline":
            tier[i] = "borderline"
            apply(i, rng.choice(BASE), rng.uniform(1.0, 2.0))
            continue
        t = rng.choice(3, p=TIER_P)
        tier[i] = TIER_NAMES[t]
        k = rng.uniform(*TIERS[t])
        if fam == "mixed":
            for sub in rng.choice(BASE, size=rng.integers(2, 4), replace=False):
                apply(i, sub, 0.75 * k)
        else:
            apply(i, fam, k)
    for i in np.flatnonzero(rng.random(N) < 0.06):  # one-off natural outliers in anyone -> class overlap
        natural[i] = True
        k = rng.uniform(1.5, 2.8) * rng.choice([-1.0, 1.0]); which = rng.integers(4)
        if which == 0:
            lv = rng.integers(NV); e_ant[i, lv] += k; e_post[i, lv] += k
        else:
            (e_disc, e_sag, e_cor)[which - 1][i, rng.integers(ND)] += k

    # ---- anatomy driven by the person ----
    g = 0.85 * (height - height.mean()) / height.std() + 0.53 * rng.standard_normal(N)  # body-size factor follows height
    reg, feat = rng.standard_normal((N, 3)), rng.standard_normal((N, 3))
    bone = 0.012 * np.clip(t_score, -4, 2)  # lower bone density -> slightly shorter bodies

    def body(mean, f, extra=0.0):
        return mean * np.exp(.055 * g[:, None] + .02 * reg[:, VR] + .025 * feat[:, [f]] + .02 * ar1(NV) + .015 * heavy((N, NV)) + extra)

    H, W, D = body(H_MEAN, 0, bone[:, None]), body(W_MEAN, 1), body(D_MEAN, 2)
    wedge = WEDGE + .015 * rng.standard_normal((N, 3))[:, VR] + .025 * rng.standard_normal((N, NV))
    asym = .015 * rng.standard_normal((N, NV)) + .03 * e_asym
    f_ant, f_post = np.clip(1 + e_ant * CV_BODY, .3, None), np.clip(1 + e_post * CV_BODY, .3, None)
    f_lat = (f_ant + f_post) / 2
    ant, post = H * (1 - wedge / 2) * f_ant, H * (1 + wedge / 2) * f_post
    left, right = H * f_lat * (1 + asym / 2), H * f_lat * (1 - asym / 2)
    disc = DISC_MEAN * np.exp(.04 * g[:, None] + .08 * rng.standard_normal((N, 1)) + .05 * rng.standard_normal((N, 3))[:, DR]
                              + .05 * ar1(ND) + .05 * heavy((N, ND)) - .003 * (age[:, None] - 50) - .02 * smoker[:, None]
                              - .004 * np.clip(bmi[:, None] - 25, 0, None)) * np.clip(1 + e_disc * CV_DISC, .25, None)
    sag = SAG_MEAN + 1.2 * rng.standard_normal((N, 3))[:, DR] + 2.0 * heavy((N, ND)) + e_sag * SD_SAG
    sag[:, DR == 1] -= 0.04 * np.clip(age[:, None] - 50, 0, None)  # a little more thoracic kyphosis with age
    cor = 0.8 * ar1(ND) + 1.0 * heavy((N, ND)) + e_cor * SD_COR
    regional = np.stack([sag[:, a:b + 1].sum(1) for a, b in SPANS], 1) + 2.5 * rng.standard_normal((N, 3))

    # ---- measurement noise (three precision grades mixed per row; not exported) ----
    NB, NDm, NS, NC = np.array([.25, .45, .8]), np.array([.2, .35, .6]), np.array([1, 1.5, 2.5]), np.array([.7, 1, 1.6])
    qv = rng.choice(3, (N, NV), p=[.7, .22, .08]); qd = rng.choice(3, (N, ND), p=[.7, .22, .08])
    vert = np.stack([ant, post, left, right, W, D], 2)
    vert = np.round(vert + NB[qv][:, :, None] * rng.standard_normal(vert.shape), 2)
    disc = np.round(np.clip(disc + NDm[qd] * rng.standard_normal(disc.shape), DISC_FLOOR_MM, None), 2)
    sag = np.round(sag + NS[qd] * rng.standard_normal(sag.shape), 1)
    cor = np.round(cor + NC[qd] * rng.standard_normal(cor.shape), 1)

    # ---- symptoms follow the spine, with a lot of overlap ----
    mag_v = np.maximum(np.abs(e_ant), np.abs(e_asym))
    mag_d = np.maximum(np.maximum(np.abs(e_disc), np.abs(e_sag)), np.abs(e_cor))
    neck_load = np.maximum(mag_v[:, VR == 0].max(1), mag_d[:, DR == 0].max(1))
    back_load = np.maximum(mag_v[:, VR > 0].max(1), mag_d[:, DR > 0].max(1))
    back_pain = np.clip(np.round(2.0 + 0.02 * (age - 50) + 0.6 * heavy_job + 0.04 * (bmi - 25) + 0.32 * back_load + 2.0 * rng.standard_normal(N)), 0, 10).astype(int)
    neck_pain = np.clip(np.round(1.5 + 0.01 * (age - 50) + 0.32 * neck_load + 1.8 * rng.standard_normal(N)), 0, 10).astype(int)
    numb = (rng.random(N) < 0.07 + 0.035 * np.clip(np.abs(e_disc).max(1), 0, 5) + 0.03 * unhealthy).astype(int)

    # ---- assemble ----
    cols = dict(zip(PERSON, [
        age, is_male, np.round(height, 1), np.round(weight, 1), np.round(bmi, 1), smoker, activity, heavy_job, family_hist,
        prior_injury, prior_surgery, np.round(t_score, 2), osteo, back_pain, neck_pain, numb,
    ]))
    for i, lv in enumerate(VERT):
        for j, nm in enumerate(VERT_MEASURES):
            cols[f"{lv}_vertebral_body_{nm}"] = vert[:, i, j]
    for i, d in enumerate(DISCS):
        cols[f"{d}_disc_height_mm"] = disc[:, i]
        cols[f"{d}_segmental_sagittal_angle_deg"] = sag[:, i]
        cols[f"{d}_segmental_coronal_angle_deg"] = cor[:, i]
    for j, nm in enumerate(REGIONAL):
        cols[nm] = np.round(regional[:, j], 1)
    cols[LABEL] = (~unhealthy).astype(int)
    df = pd.DataFrame(cols).sample(frac=1.0, random_state=seed)
    order = df.index.to_numpy()
    df = df.reset_index(drop=True)
    meta = {
        "family": family[order], "tier": tier[order], "natural_variant": natural[order],
        "vertebra_effect": np.maximum(np.maximum(np.abs(e_ant), np.abs(e_post)), np.abs(e_asym))[order],
        "disc_effect": mag_d[order],
    }
    return df, meta


def bounds() -> dict[str, tuple[float, float]]:
    """Supported value range per spine column: the generator's own limits, not clinical cutoffs."""
    out: dict[str, tuple[float, float]] = {}
    for i, lv in enumerate(VERT):
        for nm in VERT_MEASURES:
            mean = W_MEAN[i] if nm == "width_mm" else D_MEAN[i] if nm == "depth_mm" else H_MEAN[i]
            out[f"{lv}_vertebral_body_{nm}"] = (round(BODY_BOUNDS_FACTOR[0] * mean, 2), round(BODY_BOUNDS_FACTOR[1] * mean, 2))
    for i, d in enumerate(DISCS):
        out[f"{d}_disc_height_mm"] = (round(DISC_BOUNDS_FACTOR[0] * DISC_MEAN[i], 2), round(DISC_BOUNDS_FACTOR[1] * DISC_MEAN[i], 2))
        out[f"{d}_segmental_sagittal_angle_deg"] = (float(SAG_MEAN[i] - SAG_BOUNDS_DEG), float(SAG_MEAN[i] + SAG_BOUNDS_DEG))
        out[f"{d}_segmental_coronal_angle_deg"] = (-COR_BOUNDS_DEG, COR_BOUNDS_DEG)
    for (a, b), nm in zip(SPANS, REGIONAL):
        centre = float(SAG_MEAN[a:b + 1].sum())
        out[nm] = (centre - REGIONAL_BOUNDS_DEG, centre + REGIONAL_BOUNDS_DEG)
    return out


def typical_values() -> dict[str, float]:
    """Generator baseline per spine column, used only for coarse unit checks."""
    out: dict[str, float] = {}
    for i, lv in enumerate(VERT):
        for nm in VERT_MEASURES:
            out[f"{lv}_vertebral_body_{nm}"] = float(W_MEAN[i] if nm == "width_mm" else D_MEAN[i] if nm == "depth_mm" else H_MEAN[i])
    for i, d in enumerate(DISCS):
        out[f"{d}_disc_height_mm"] = float(DISC_MEAN[i])
    return out


# ---------------- demonstration fixtures ----------------
SAMPLE_POPULATION_N = 6000
SAMPLE_POPULATION_SEED = 4242
SAMPLE_NOTICE = "SYNTHETIC measurement-pattern test fixture. Not a simulation of any clinical condition."


def build_sample_cases() -> list[dict]:
    """Eight deterministic demo cases (titles follow the product specification)."""
    df, meta = generate(SAMPLE_POPULATION_N, SAMPLE_POPULATION_SEED)
    spine = [c for c in df.columns if c not in PERSON and c != LABEL]
    fam, tier, nat = meta["family"], meta["tier"], meta["natural_variant"]
    healthy = df[LABEL].to_numpy() == 1
    z = (df[spine] - df.loc[healthy, spine].mean()) / df.loc[healthy, spine].std()
    zmax = z.abs().max(axis=1).to_numpy()
    v_eff, d_eff = meta["vertebra_effect"], meta["disc_effect"]
    thoracic_only = (v_eff[:, VR != 1].sum(1) == 0) & (v_eff[:, VR == 1].sum(1) > 0) & (d_eff.sum(1) == 0)

    def first(mask):
        idx = np.flatnonzero(mask & ~nat)
        if len(idx) == 0:
            raise RuntimeError("no row matches a sample-case rule; adjust SAMPLE_POPULATION_N")
        return int(idx[0])

    typical = int(np.flatnonzero(healthy & ~nat)[np.argmin(zmax[healthy & ~nat])])
    picks = [
        ("case_01_healthy_like_profile", "Synthetic healthy-like measurement profile", "All measurements sit close to the synthetic reference.", typical),
        ("case_02_localized_height_deviation", "Localized vertebral-height deviation", "One vertebral level differs clearly in body height.", first((fam == "localized_height") & (tier == "obvious") & (v_eff.max(1) > 5) & (d_eff.sum(1) == 0))),
        ("case_03_disc_height_deviation", "Disc-height measurement deviation", "One or more disc heights differ from the reference.", first((fam == "disc") & (tier == "obvious"))),
        ("case_04_multi_level_alignment_variation", "Multi-level alignment measurement variation", "Angle measurements differ across several neighbouring levels.", first((fam == "alignment") & (tier == "obvious"))),
        ("case_05_thoracic_measurement_variation", "Thoracic measurement variation", "Several thoracic levels differ in body height.", first((fam == "multi_level_height") & thoracic_only & (tier != "subtle"))),
        ("case_06_mixed_feature_deviation", "Mixed feature deviation", "More than one kind of measurement differs.", first((fam == "mixed") & (tier == "moderate"))),
        ("case_07_borderline", "Borderline case", "A small deviation close to the edge of the reference interval.", first(fam == "borderline")),
        ("case_08_incomplete_data", "Missing/incomplete data case", "Most measurements are missing, so the result should be indeterminate.", first((fam == "disc") & (tier == "moderate"))),
    ]
    cases = []
    for case_id, title, description, i in picks:
        row = df.iloc[i]
        person = {c: (float(row[c]) if c in ("height_cm", "weight_kg", "bmi", "bone_density_t_score") else int(row[c])) for c in PERSON}
        measurements: dict[str, float | None] = {c: float(row[c]) for c in spine}
        blanked = None
        if case_id.startswith("case_08"):
            # documented blanking: all thoracic and lumbar vertebra measurements and every angle
            for c in spine:
                if c.endswith("_deg") or (c[0] in "TL" and "vertebral_body" in c):
                    measurements[c] = None
            blanked = "All thoracic and lumbar vertebral-body measurements and all angle measurements were removed."
        perturbed = [VERT[j] for j in np.flatnonzero(v_eff[i] > 0)] + [DISCS[j].replace("_", "-") for j in np.flatnonzero(d_eff[i] > 0)]
        cases.append({
            "case_id": case_id, "title": title, "description": description, "data_origin": "synthetic", "notice": SAMPLE_NOTICE,
            "source": "sample", "units": {"length": "mm", "angle": "deg"}, "person": person, "measurements": measurements,
            "blanked_fields_note": blanked,
            # generator-internal truth for automated tests; never shown to users
            "ground_truth": {"is_healthy": int(row[LABEL]), "pattern_family": str(fam[i]), "effect_tier": str(tier[i]), "perturbed_levels": perturbed},
        })
    return cases


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Generate the Spinalytics synthetic dataset.")
    ap.add_argument("--n", type=int, default=DEFAULT_N, help="number of rows (people)")
    ap.add_argument("--seed", type=int, default=DEFAULT_SEED)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    ap.add_argument("--sample-cases", type=Path, default=None, help="write the eight demo fixtures to this JSON file and exit")
    a = ap.parse_args(argv)
    if a.sample_cases is not None:
        a.sample_cases.parent.mkdir(parents=True, exist_ok=True)
        a.sample_cases.write_text(json.dumps(build_sample_cases(), indent=1) + "\n", encoding="utf-8")
        print(f"wrote 8 sample cases to {a.sample_cases}")
        return 0
    if a.n < 2:
        print(f"error: --n must be at least 2 (got {a.n})", file=sys.stderr)
        return 2
    df, _ = generate(a.n, a.seed)
    a.out.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(a.out, index=False, lineterminator="\n")
    counts = df[LABEL].value_counts().to_dict()
    print(f"wrote {len(df)} rows x {df.shape[1]} columns to {a.out} (is_healthy counts: {counts}); synthetic, development-only")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
