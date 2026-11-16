import json
from functools import lru_cache
from pathlib import Path

from fastapi import APIRouter, HTTPException, Response

router = APIRouter(prefix="/api", tags=["samples"])
_PATH = Path(__file__).resolve().parents[1] / "artifacts" / "sample_cases.json"
CACHE = "public, max-age=3600"
_PUBLIC_KEYS = ("case_id", "title", "description", "data_origin", "notice")


@lru_cache
def _cases() -> dict[str, dict]:
    return {c["case_id"]: c for c in json.loads(_PATH.read_text(encoding="utf-8"))}


def _summary(c: dict) -> dict:
    return {k: c[k] for k in _PUBLIC_KEYS}


@router.get("/sample-cases")
def list_cases(response: Response) -> list[dict]:
    response.headers["Cache-Control"] = CACHE
    return [_summary(c) for c in _cases().values()]


@router.get("/sample-cases/{case_id}")
def get_case(case_id: str, response: Response) -> dict:
    """A ready-to-post analysis request. The hidden pattern information of the generator is never included."""
    case = _cases().get(case_id)
    if case is None:
        raise HTTPException(status_code=404, detail="Sample case not found.")
    response.headers["Cache-Control"] = CACHE
    return {
        **_summary(case),
        "request": {"source": "sample", "units": case["units"], "person": case["person"], "measurements": case["measurements"]},
        "incomplete_note": case.get("blanked_fields_note"),
    }
