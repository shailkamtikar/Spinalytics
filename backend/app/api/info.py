import json
from functools import lru_cache
from pathlib import Path

from fastapi import APIRouter, Response

from app import anatomy
from app.analysis.reference import get_reference
from app.config import APP_VERSION, DEFAULT_ANALYSIS_CONFIG
from app.ml.predict import BAND_HIGH, BAND_LOW, OOD_MARGIN, OOD_MAX_COLUMNS
from app.schemas.analysis import DISCLAIMER

router = APIRouter(prefix="/api", tags=["info"])
ARTIFACTS = Path(__file__).resolve().parents[1] / "artifacts"
CACHE = "public, max-age=3600"


@lru_cache
def _json(name: str) -> dict:
    return json.loads((ARTIFACTS / name).read_text(encoding="utf-8"))


@router.get("/feature-catalog")
def feature_catalog(response: Response) -> dict:
    """Every accepted input column with its level, unit and kind. Drives manual entry and CSV mapping."""
    response.headers["Cache-Control"] = CACHE
    cat = _json("feature_catalog.json")
    keys = ("data_origin", "notice", "vertebrae", "unmeasured_vertebrae", "discs", "features", "derived")
    return {k: cat[k] for k in keys}


@router.get("/reference-info")
def reference_info(response: Response) -> dict:
    response.headers["Cache-Control"] = CACHE
    ref = get_reference()
    cfg = DEFAULT_ANALYSIS_CONFIG
    sizes = {}
    for lv in anatomy.VERTEBRAE:
        mean = lambda f: ref.stats("all", f"{lv}_{f}")["mean"]  # noqa: E731
        sizes[lv] = {
            "height_mm": round((mean("vertebral_body_height_anterior_mm") + mean("vertebral_body_height_posterior_mm")) / 2, 2),
            "width_mm": round(mean("vertebral_body_width_mm"), 2),
            "depth_mm": round(mean("vertebral_body_depth_mm"), 2),
        }
    discs = {
        d: {
            "height_mm": round(ref.stats("all", f"{d.replace('-', '_')}_disc_height_mm")["mean"], 2),
            "sagittal_angle_deg": round(ref.stats("all", f"{d.replace('-', '_')}_segmental_sagittal_angle_deg")["mean"], 2),
        }
        for d in anatomy.DISCS
    }
    rule = ref.overall_rule
    rule_keys = ("chance_outlier_limit", "large_count_limit", "extreme_abs_z", "calibrated_on", "validation_false_flag_rate", "validation_detection_rate", "limitation")
    return {
        "provenance": ref.provenance,
        "cohorts": {name: {"description": ref.provenance["cohorts"][name], "n_rows": ref.n_rows(name)} for name in ref.data["cohorts"]},
        "thresholds": {
            "within_max_abs_z": cfg.within_max_abs_z,
            "large_min_abs_z": cfg.large_min_abs_z,
            "min_completeness": cfg.min_completeness,
            "label": "Demonstration thresholds on a synthetic reference. Non-clinical.",
        },
        "overall_rule": {k: rule.get(k) for k in rule_keys},
        "level_sizes": {"vertebrae": sizes, "discs": discs},
        "disclaimer": DISCLAIMER,
    }


@router.get("/model-info")
def model_info(response: Response) -> dict:
    response.headers["Cache-Control"] = CACHE
    metrics = _json("model_metrics.json")
    return {
        "version": APP_VERSION,
        "data_origin": "synthetic",
        "training_data": "Generated measurements; the model has never seen a real patient.",
        "selected_model": metrics["selected_model"],
        "score_note": "The model score is not the probability of disease.",
        "abstention": {
            "indeterminate_band": [BAND_LOW, BAND_HIGH],
            "out_of_distribution_margin": OOD_MARGIN,
            "out_of_distribution_max_columns": OOD_MAX_COLUMNS,
            "requires_all_spine_measurements": True,
        },
        "metrics": metrics,
        "limitations": [
            "Trained on synthetic data with invented effect sizes.",
            "Not a medical device and not a diagnosis.",
            "Needs all 204 spine measurements; it never fills in missing values.",
            "Covers C3 to L5 vertebral bodies and C2-C3 to L5-S1 discs only.",
        ],
        "disclaimer": DISCLAIMER,
    }
