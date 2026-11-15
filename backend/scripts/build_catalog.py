"""Write backend/app/artifacts/feature_catalog.json from app.anatomy and the generator's bounds.

Usage (from backend/):  python scripts/build_catalog.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import anatomy  # noqa: E402
from scripts import generate_dataset as G  # noqa: E402

OUT = Path(__file__).resolve().parents[1] / "app" / "artifacts" / "feature_catalog.json"


def build() -> dict:
    spine_bounds = G.bounds()
    features = []
    for col in anatomy.feature_columns():
        entry = anatomy.parse_column(col).to_dict()
        if col in anatomy.PERSON_FIELDS:
            _, value_type, lo, hi, _ = anatomy.PERSON_FIELDS[col]
            entry.update(value_type=value_type, min_supported=lo, max_supported=hi)
        else:
            lo, hi = spine_bounds[col]
            entry.update(value_type="float", min_supported=lo, max_supported=hi)
        features.append(entry)
    return {
        "data_origin": "synthetic",
        "notice": "Supported ranges are the synthetic generator's own limits. They are not clinical ranges.",
        "label": anatomy.LABEL,
        "vertebrae": list(anatomy.VERTEBRAE),
        "unmeasured_vertebrae": list(anatomy.UNMEASURED_VERTEBRAE),
        "discs": list(anatomy.DISCS),
        "features": features,
        "derived": [anatomy.parse_column(c).to_dict() for c in anatomy.derived_columns()],
    }


def main() -> int:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    catalog = build()
    OUT.write_text(json.dumps(catalog, indent=1) + "\n", encoding="utf-8")
    print(f"wrote {len(catalog['features'])} features and {len(catalog['derived'])} derived features to {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
