import json

import numpy as np
import pandas as pd
import pytest

from scripts import build_catalog
from scripts import generate_dataset as G
from scripts import validate_dataset as V

CATALOG = json.loads(build_catalog.OUT.read_text(encoding="utf-8"))
DATASET = V.ROOT / "data" / "spinalytics_dataset.csv"


@pytest.fixture()
def good():
    return G.generate(4000, 11)[0]


def failed(checks):
    return [c.name for c in checks if not c.passed]


def test_good_data_passes(good):
    assert failed(V.validate(good, CATALOG)) == []


def test_blank_cells_are_caught(good):
    good = good.astype({"L3_vertebral_body_width_mm": float})
    good.loc[good.index[:10], "L3_vertebral_body_width_mm"] = np.nan
    checks = V.validate(good, CATALOG)
    assert "no blank or non-numeric cells" in failed(checks)
    assert "L3_vertebral_body_width_mm" in next(c.detail for c in checks if c.name.startswith("no blank"))


def test_imbalance_is_caught(good):
    drop = good.index[good["is_healthy"] == 1][:400]
    assert "classes balanced (50% +/- 1 point)" in failed(V.validate(good.drop(drop), CATALOG))


def test_unit_error_is_caught(good):
    good["L3_vertebral_body_width_mm"] = good["L3_vertebral_body_width_mm"] / 10  # centimetres by mistake
    checks = V.validate(good, CATALOG)
    assert "length columns are on the millimetre scale" in failed(checks)
    assert "L3_vertebral_body_width_mm" in next(c.detail for c in checks if "millimetre" in c.name)


def test_out_of_range_value_is_caught(good):
    good.loc[good.index[0], "L4_L5_disc_height_mm"] = 110.0  # decimal slip
    assert "values inside supported (generator) ranges" in failed(V.validate(good, CATALOG))


def test_missing_and_extra_columns_are_caught(good):
    assert "schema matches the feature catalog" in failed(V.validate(good.drop(columns=["age_years"]), CATALOG))
    assert "schema matches the feature catalog" in failed(V.validate(good.assign(patient_name="x"), CATALOG))


def test_duplicates_are_caught(good):
    doubled = pd.concat([good, good.iloc[:3]], ignore_index=True)
    assert "no duplicate rows" in failed(V.validate(doubled, CATALOG))


def test_label_leak_is_caught(good):
    good["bmi"] = np.where(good["is_healthy"] == 1, 22.0, 31.0) + np.random.default_rng(0).normal(0, 0.5, len(good))
    assert any("single-column shortcut" in n for n in failed(V.validate(good, CATALOG)))


def test_constant_column_is_caught(good):
    good["smoker"] = 0
    assert "no constant columns" in failed(V.validate(good, CATALOG))


def test_cli_exit_codes_and_report(tmp_path, good):
    ok, bad, report = tmp_path / "ok.csv", tmp_path / "bad.csv", tmp_path / "r.md"
    good.to_csv(ok, index=False)
    good.drop(good.index[good["is_healthy"] == 1][:400]).to_csv(bad, index=False)
    assert V.main(["--data", str(ok), "--report", str(report)]) == 0
    text = report.read_text(encoding="utf-8")
    assert "Synthetic" in text.splitlines()[2] and "0 failed" in text
    assert V.main(["--data", str(bad), "--report", str(report)]) == 1
    assert "FAIL" in report.read_text(encoding="utf-8")
    assert V.main(["--data", str(tmp_path / "missing.csv"), "--report", str(report)]) == 2


@pytest.mark.skipif(not DATASET.exists(), reason="full dataset not generated")
def test_full_dataset_passes_the_gate(tmp_path):
    assert V.main(["--data", str(DATASET), "--report", str(tmp_path / "r.md")]) == 0
