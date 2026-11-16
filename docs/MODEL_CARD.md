# Model card: Spinalytics pattern model

> **Synthetic, development-only.** The model was trained and evaluated on generated data. It has never seen a real patient, it is not a medical device and it does not provide a diagnosis.

## Data origin

- Source: the synthetic Spinalytics dataset (50,000 rows, generator `generate_dataset.py`, dataset SHA-256 `999819b0fc9696e8dd9e20bd23066185a1594b117df4e62d0520be0fc17590a2`).
- Label: `is_healthy` (1 = healthy-like profile, 0 = an artificial deviation pattern was added). The pattern type is not given to the model.
- Split: 35,000 train, 7,500 validation, 7,500 test, stratified on the label, one row per person.

## Intended use

Show an additional, clearly labelled signal beside the statistical comparison in a research and education demo. It answers one question only: does the overall pattern of measurements resemble the unusual training examples? It does not say which level is different (the statistical engine does), and it never replaces the statistical result.

## Method

- Features: each spine measurement as a z-score against the healthy-like training rows, minus the person's own median across levels (so overall body size does not look unusual), summarised per measurement type, plus the person columns. The reference is learned inside the pipeline on training rows only.
- Candidates compared on validation: logistic regression, random forest, histogram gradient boosting. Selected: **gradient boosting** (highest validation ROC-AUC; ties go to the simpler model).
- Two variants of the selected model: **full** (spine and person columns) and **spine only**, used when the person fields are not all supplied.
- Positive class for every metric: unusual pattern.

## Validation results (threshold 0.5, raw scores)

| Model | ROC-AUC | PR-AUC | Sensitivity | Specificity | Precision | F1 |
|---|---|---|---|---|---|---|
| logistic regression | 0.855 | 0.881 | 0.716 | 0.842 | 0.819 | 0.764 |
| gradient boosting | 0.862 | 0.889 | 0.713 | 0.867 | 0.843 | 0.772 |
| random forest | 0.847 | 0.875 | 0.636 | 0.909 | 0.875 | 0.736 |

Ablation for the selected model:

| Inputs | ROC-AUC |
|---|---|
| all | 0.862 |
| spine only | 0.842 |
| person only | 0.677 |

Control: with the training labels shuffled, validation ROC-AUC is 0.495 (chance is 0.5), which shows the pipeline does not leak the label.

## Held-out test results (evaluated once, after selection)

| Variant | ROC-AUC (95% interval) | PR-AUC | Sensitivity | Specificity | Brier |
|---|---|---|---|---|---|
| full | 0.872 (0.865 to 0.880) | 0.894 | 0.710 | 0.875 | 0.142 |
| spine only | 0.852 (0.844 to 0.861) | 0.881 | 0.681 | 0.876 | 0.151 |

The data contain borderline patterns on purpose, so a ROC-AUC far above these values would point to leakage.

## Calibration and abstention

- Calibration: none (fitted on validation; the check below is cross-fitted on validation halves). Largest gap between predicted and observed rate in any bin of at least 20 rows: 0.031. Brier score 0.146 before, 0.146 after.
- Scores between 0.40 and 0.60 are reported as **indeterminate**. On validation, 13.9% of rows fall in the band; outside it, accuracy is 82.7%.
- No score is produced when any spine measurement is missing (`insufficient_data`), or when more than 10 measurements lie more than 10% of the training range beyond its minimum or maximum (`out_of_distribution`). Share of validation healthy-like rows treated as out of distribution: 0.0%.
- If the model file cannot be loaded the application returns `unavailable` and still shows the statistical result.

## Explanation

Occlusion: each group (a vertebra's heights, a vertebra's width and depth, a disc's height, a disc's angles, a regional angle, the person columns) is replaced by the healthy-like training median and the row is scored again. The signed change in score is shown for the five largest groups. It describes the model, not the anatomy.

## Statistical engine (for comparison)

The comparison engine flags a profile with limits calibrated on validation healthy-like rows. Its false-flag rate there is 4.7% and its detection rate on validation unusual rows is 29.6%.

## Limitations

- Trained on synthetic data with invented effect sizes; results say nothing about real patients or real conditions.
- The unusual pattern is an arithmetic perturbation, not a simulated disease. A score is not a diagnosis and not the probability of disease.
- Only C3 to L5 vertebral bodies, C2-C3 to L5-S1 discs and three regional angles are modelled; C1 and C2 are not.
- The model needs complete measurements. It was never trained with missing values and does not impute them.
- Person columns carry information only because the generator was built that way.

## Non-diagnostic statement

This project is an educational and research prototype. Nothing it produces is medical advice. A qualified clinician must interpret any real measurement.
