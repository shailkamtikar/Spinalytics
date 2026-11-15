import hashlib
import json

import numpy as np
import pytest

from scripts import generate_dataset as G

ARTIFACT = G.ROOT / "backend" / "app" / "artifacts" / "sample_cases.json"


@pytest.fixture(scope="module")
def small():
    return G.generate(2000, 1)[0]


def _sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def test_shape_and_label_last(small):
    assert small.shape == (2000, 221)
    assert small.columns[-1] == "is_healthy"
    assert list(small.columns[:16]) == G.PERSON


def test_same_seed_gives_identical_file(tmp_path):
    a, b = tmp_path / "a.csv", tmp_path / "b.csv"
    assert G.main(["--n", "2000", "--seed", "1", "--out", str(a)]) == 0
    assert G.main(["--n", "2000", "--seed", "1", "--out", str(b)]) == 0
    assert _sha(a) == _sha(b)


def test_different_seed_gives_different_file(tmp_path):
    a, b = tmp_path / "a.csv", tmp_path / "b.csv"
    G.main(["--n", "2000", "--seed", "1", "--out", str(a)])
    G.main(["--n", "2000", "--seed", "2", "--out", str(b)])
    assert _sha(a) != _sha(b)


def test_exact_balance(small):
    assert small["is_healthy"].value_counts().to_dict() == {0: 1000, 1: 1000}


def test_no_blanks_duplicates_or_non_finite(small):
    assert int(small.isna().sum().sum()) == 0
    assert int(small.duplicated().sum()) == 0
    assert np.isfinite(small.to_numpy(dtype=float)).all()


def test_odd_n_is_balanced_within_one():
    df, _ = G.generate(1001, 3)
    counts = df["is_healthy"].value_counts()
    assert len(df) == 1001 and abs(int(counts[0]) - int(counts[1])) <= 1


@pytest.mark.parametrize("n", ["0", "-5", "1"])
def test_bad_n_is_rejected_without_writing(tmp_path, n, capsys):
    out = tmp_path / "x.csv"
    assert G.main(["--n", n, "--out", str(out)]) != 0
    assert not out.exists()
    assert "--n must be at least 2" in capsys.readouterr().err


def test_values_inside_generator_bounds(small):
    for col, (lo, hi) in G.bounds().items():
        assert small[col].min() >= lo and small[col].max() <= hi, col


def test_meta_is_aligned_with_rows():
    df, meta = G.generate(2000, 1)
    healthy = df["is_healthy"].to_numpy() == 1
    assert (meta["family"][healthy] == "none").all()
    assert (meta["family"][~healthy] != "none").all()


def test_sample_cases_artifact_matches_generator():
    cases = json.loads(ARTIFACT.read_text(encoding="utf-8"))
    assert cases == json.loads(json.dumps(G.build_sample_cases()))


def test_sample_cases_content():
    cases = json.loads(ARTIFACT.read_text(encoding="utf-8"))
    assert [c["title"] for c in cases] == [
        "Synthetic healthy-like measurement profile",
        "Localized vertebral-height deviation",
        "Disc-height measurement deviation",
        "Multi-level alignment measurement variation",
        "Thoracic measurement variation",
        "Mixed feature deviation",
        "Borderline case",
        "Missing/incomplete data case",
    ]
    forbidden = ("genetic", "fracture", "scoliosis", "diagnos", "degenerat")
    for c in cases:
        assert c["data_origin"] == "synthetic"
        assert len(c["measurements"]) == 204 and len(c["person"]) == 16
        assert not any(w in (c["title"] + c["description"]).lower() for w in forbidden)
    assert cases[0]["ground_truth"]["is_healthy"] == 1
    assert all(v is not None for v in cases[0]["measurements"].values())


def test_incomplete_case_is_mostly_missing():
    case = json.loads(ARTIFACT.read_text(encoding="utf-8"))[7]
    missing = sum(v is None for v in case["measurements"].values())
    assert missing >= 102 and case["blanked_fields_note"]
