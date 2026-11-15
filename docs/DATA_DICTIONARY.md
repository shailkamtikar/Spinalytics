# Data dictionary

> **Synthetic, development-only.** These definitions describe the generated Spinalytics dataset. Supported ranges are the generator's own limits and are not clinical ranges.

The machine-readable version of this page is `backend/app/artifacts/feature_catalog.json`, built from `backend/app/anatomy.py` by `backend/scripts/build_catalog.py`. That file also carries the supported range of every column.

## Layout

One row is one simulated person. Columns appear in this order:

| Block | Count | Example |
|---|---|---|
| Person | 16 | `age_years` |
| Vertebral body | 132 (22 levels × 6) | `L3_vertebral_body_width_mm` |
| Disc and segment | 69 (23 levels × 3) | `L4_L5_disc_height_mm` |
| Regional angle | 3 | `lumbar_sagittal_angle_L1_S1_deg` |
| Label | 1 | `is_healthy` |

All lengths are millimetres and end in `_mm`. All angles are degrees and end in `_deg`.

## Spinal levels

The spine is divided into the neck (cervical, C), upper and middle back (thoracic, T) and lower back (lumbar, L). Vertebrae are numbered from the top of each region.

| Region | Vertebrae measured | Discs measured |
|---|---|---|
| Cervical | C3, C4, C5, C6, C7 | C2-C3, C3-C4, C4-C5, C5-C6, C6-C7, C7-T1 |
| Thoracic | T1 to T12 | T1-T2 to T11-T12, T12-L1 |
| Lumbar | L1 to L5 | L1-L2 to L4-L5, L5-S1 |

A disc sits between two vertebrae and is always named by both, upper first. In column names the hyphen is written as an underscore: disc C3-C4 is `C3_C4_…`. A disc is counted in the region of its upper vertebra.

C1 and C2 have no vertebral-body columns. C1 has no vertebral body and the body of C2 carries the dens, so these measurements do not apply to them.

## Vertebral-body measurements

Column name: `<level>_<measurement>`, for example `T7_vertebral_body_depth_mm`.

| Measurement | Meaning |
|---|---|
| `vertebral_body_height_anterior_mm` | Height of the body at its front edge |
| `vertebral_body_height_posterior_mm` | Height of the body at its back edge |
| `vertebral_body_height_left_mm` | Height of the body at its left edge |
| `vertebral_body_height_right_mm` | Height of the body at its right edge |
| `vertebral_body_width_mm` | Side-to-side width of the body |
| `vertebral_body_depth_mm` | Front-to-back depth of the body |

## Disc and segment measurements

Column name: `<upper>_<lower>_<measurement>`, for example `L4_L5_disc_height_mm`.

| Measurement | Meaning |
|---|---|
| `disc_height_mm` | Height of the disc between the two named vertebrae |
| `segmental_sagittal_angle_deg` | Forward/backward angle between the top surfaces (superior endplates) of the two named vertebrae. Positive is lordosis (curving inward, as in the neck and lower back); negative is kyphosis (curving outward, as in the upper back). |
| `segmental_coronal_angle_deg` | Side-bending angle between the same two surfaces. Signed, and close to zero in a straight spine. |

## Regional angles

| Column | Meaning |
|---|---|
| `cervical_sagittal_angle_C2_C7_deg` | Angle from the top surface of C2 to the top surface of C7; positive is lordosis |
| `thoracic_sagittal_angle_T1_T12_deg` | Angle from the top surface of T1 to the top surface of T12; negative is kyphosis |
| `lumbar_sagittal_angle_L1_S1_deg` | Angle from the top surface of L1 to the top surface of S1; positive is lordosis |

In this dataset each regional angle equals the sum of the segmental sagittal angles inside its span plus measurement noise.

## Derived measurements

These are not in the dataset. The application calculates them from the columns above when both inputs are present.

| Derived column | Formula |
|---|---|
| `<level>_vertebral_body_height_mm` | (anterior height + posterior height) ÷ 2 |
| `<level>_vertebral_body_wedge_ratio` | anterior height ÷ posterior height |
| `<level>_vertebral_body_lateral_height_difference_mm` | left height − right height |

## Person columns

None of these identifies a person. Each is included because the generator links it to the spine measurements or the label (see `DATA_GENERATION.md`).

| Column | Values | Meaning |
|---|---|---|
| `age_years` | 20–80 | Age in whole years |
| `sex_male` | 0 / 1 | 1 = male, 0 = female. Used to choose a sex-specific reference. |
| `height_cm` | number | Standing height |
| `weight_kg` | number | Body weight |
| `bmi` | number | Body-mass index: weight ÷ height² |
| `smoker` | 0 / 1 | Currently smokes |
| `physical_activity_level` | 0–3 | 0 sedentary, 1 light, 2 moderate, 3 very active |
| `heavy_lifting_occupation` | 0 / 1 | Work involves regular heavy lifting |
| `family_history_spinal_condition` | 0 / 1 | A close relative has a spinal condition |
| `prior_spinal_injury` | 0 / 1 | A previous spinal injury is reported |
| `prior_spinal_surgery` | 0 / 1 | Previous spinal surgery is reported |
| `bone_density_t_score` | number | Bone-density T-score; lower means lower density |
| `osteoporosis_diagnosis` | 0 / 1 | An osteoporosis diagnosis is reported |
| `back_pain_score_0_10` | 0–10 | Self-rated back pain |
| `neck_pain_score_0_10` | 0–10 | Self-rated neck pain |
| `limb_numbness_or_tingling` | 0 / 1 | Numbness or tingling in an arm or leg |

## Label

| Column | Values | Meaning |
|---|---|---|
| `is_healthy` | 1 / 0 | 1 = healthy-like synthetic profile. 0 = an artificial deviation pattern was added. |

The label is a property of the generator. It is not a diagnosis, and the application never shows it as "healthy" or "unhealthy"; it reports "within reference pattern" or "unusual pattern detected".

## Percentage difference

Percentage difference is reported only for length measurements. Angles have baselines at or near zero, so a percentage would be misleading; the catalog marks them `percentage_allowed: false`.
