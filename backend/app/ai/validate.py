"""Checks on model output before it reaches the user: unknown citations are removed, diagnostic or treatment wording is replaced."""
from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path

SOURCES_PATH = Path(__file__).with_name("sources.json")
NO_SOURCE_NOTE = "No reliable source is available for that reference, so it was removed."
SAFE_FALLBACK = (
    "I can describe what the measurements show and what general factors can be associated with such patterns, "
    "but I cannot diagnose or recommend treatment. Please discuss this result with a qualified clinician."
)

_URL = re.compile(r"https?://[^\s)>\]]+|www\.[^\s)>\]]+", re.IGNORECASE)
_DOI = re.compile(r"\b10\.\d{4,9}/[^\s)>\]]+", re.IGNORECASE)
_PMID = re.compile(r"\bPMID:?\s*\d{4,9}\b", re.IGNORECASE)
_DIAGNOSTIC = [
    re.compile(r"\byou (have|suffer from|are suffering from|definitely have|probably have|likely have|are diagnosed)\b", re.IGNORECASE),
    re.compile(r"\bthis (confirms|proves|means you have|indicates that you have)\b", re.IGNORECASE),
    re.compile(r"\byour (spine|vertebra|disc)s? (is|are) (broken|fractured|damaged|diseased)\b", re.IGNORECASE),
    re.compile(r"\bdiagnos(is|ed) (of|with)\b", re.IGNORECASE),
]
_TREATMENT = [
    re.compile(r"\b(you should|you must|i recommend|i suggest|try|start|begin|stop|take)\b.{0,40}\b(\d+\s*mg|medication|painkillers?|ibuprofen|surgery|injections?|physio\w*|brace|treatment)\b", re.IGNORECASE),
]


@lru_cache
def approved_sources() -> list[dict]:
    return json.loads(SOURCES_PATH.read_text(encoding="utf-8")).get("sources", [])


def _allowed_identifiers(sources: list[dict]) -> set[str]:
    return {str(s.get("identifier", "")).strip().lower() for s in sources if s.get("identifier")}


def validate_answer(text: str, sources: list[dict] | None = None) -> tuple[str, list[str]]:
    """Return (safe_text, flags). Flags name what was changed: ``removed_citation``, ``diagnostic_wording``."""
    sources = approved_sources() if sources is None else sources
    allowed = _allowed_identifiers(sources)
    flags: list[str] = []
    out = text or ""

    if any(rx.search(out) for rx in _DIAGNOSTIC + _TREATMENT):
        return SAFE_FALLBACK, ["diagnostic_wording"]

    def drop(m: re.Match) -> str:
        if m.group(0).strip().lower().rstrip(".,;") in allowed:
            return m.group(0)
        if "removed_citation" not in flags:
            flags.append("removed_citation")
        return ""

    for rx in (_URL, _DOI, _PMID):
        out = rx.sub(drop, out)
    out = re.sub(r"\(\s*\)", "", out)
    out = re.sub(r"[ \t]{2,}", " ", out).strip()
    if "removed_citation" in flags:
        out = f"{out}\n\n{NO_SOURCE_NOTE}"
    return out, flags
