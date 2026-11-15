# Data generation

> **Synthetic, development-only.** The Spinalytics dataset is produced by a random generator. It is not a clinical cohort, it is not medically representative, and it is not a source of normal ranges or diagnostic cutoffs. Results obtained on it say nothing about real patients.

## Regenerate

From `backend/`:

```bash
.venv/Scripts/python scripts/generate_dataset.py --n 50000 --seed 20261115 --out ../data/spinalytics_dataset.csv
```

The same `--n` and `--seed` always give a byte-identical file. The default run takes a few seconds. `data/` is git-ignored; the generator is the source of truth.

The eight demonstration cases used by the app are rebuilt with:

```bash
.venv/Scripts/python scripts/generate_dataset.py --sample-cases app/artifacts/sample_cases.json
```

## What one row is

One row is one simulated person: 16 person-level columns, 204 spine measurements, and the label `is_healthy` (1 = healthy-like, 0 = an artificial deviation pattern was added). Classes are exactly balanced. See `DATA_DICTIONARY.md` for every column.

## How a person is simulated

1. **Person.** Age, sex, height, BMI and weight are drawn first, then lifestyle (smoking, activity, heavy lifting), history (family history, prior injury, prior surgery) and a bone-density score that falls with age.
2. **Label.** A risk score is built from those columns plus a large random term. The half of the population with the highest score receives a deviation pattern. This makes the person columns informative without making them decisive.
3. **Healthy-like spine.** Each vertebral dimension is a level-specific baseline multiplied by a body-size factor that follows height, a per-region factor, a per-measurement factor, a smooth along-spine component and heavy-tailed noise. Discs and angles are built the same way. Disc height falls slightly with age, smoking and higher BMI.
4. **Deviation pattern.** One of seven artificial patterns is added, with an effect size drawn from a subtle, moderate or obvious tier.
5. **Measurement noise** of three precision grades is added, and values are rounded to 0.01 mm and 0.1°.
6. **Symptoms.** Pain scores and numbness follow the size and location of any deviation, with wide overlap between the classes.

| Pattern | What changes |
|---|---|
| Localized height | One level: front-dominant or uniform height loss, occasionally a gain |
| Multi-level height | Two to five neighbouring levels |
| Disc | One to three discs, mostly reduced height |
| Alignment | A run of sagittal angles in one region, or a bell-shaped run of coronal angles |
| Asymmetry | Left/right height difference at one to four levels with a coupled coronal tilt |
| Mixed | Two or three of the above at reduced strength |
| Borderline | One of the above at a small effect size |

These are arithmetic perturbations. They are not simulations of fractures, degeneration, scoliosis or any other condition, and the pattern name is not exported in the dataset.

## Invented associations

The links below are generator settings. They are loosely plausible but are not taken from medical studies.

| Person column | Effect in the generator |
|---|---|
| Height, sex | Larger vertebral bodies |
| Age, smoking, higher BMI | Slightly thinner discs |
| Lower bone-density score | Slightly shorter vertebral bodies; height patterns more likely |
| Prior spinal injury | Localized height pattern more likely |
| Family history | Alignment and asymmetry patterns more likely |
| Heavy lifting, age | Disc pattern more likely |
| Prior spinal surgery | Mixed pattern more likely |

## Why the classes overlap

Six percent of all rows, healthy-like or not, receive one unrelated single-measurement outlier, noise is heavy-tailed, and some deviation patterns are deliberately small. A model that separates the classes perfectly on this data should be treated as a sign of leakage.

## Limitations

- Baselines, variances, effect sizes and associations are invented.
- The 50/50 balance is a development convenience and says nothing about prevalence.
- C1 and C2 are not simulated: C1 has no vertebral body and the body of C2 carries the dens, so the same measurements do not apply.
- Every row is complete. Real data will have missing values, which the application handles separately.
