"""Deterministic topic gate for the optional assistant.

Rule based on purpose: it costs no model call. It is imperfect (a keyword filter is a cost-control and
product-scope measure, not a security boundary), so a question it cannot place is ``uncertain`` and the
user is asked to rephrase instead of being sent to the model.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

MAX_QUESTION_CHARS = 500
MAX_HISTORY_TURNS = 6

REFUSAL = "This assistant is limited to explaining spinal anatomy, spinal measurements, and your current Spinalytics result. Please ask a question related to those topics."
REPHRASE = "I could not tell what you are asking about. Please rephrase your question so it names a vertebra, a measurement, or part of your result, for example: Why is C3 flagged?"

_BLOCK = [
    # coding and unrelated programming
    r"\b(python|javascript|typescript|java|c\+\+|html|css|sql|regex|bash|powershell|golang|rust|coding|compile|debug)\b",
    r"\b(write|create|generate|give|show|make|build)\b.{0,24}\b(code|function|script|program|algorithm|app|website)\b",
    # changing the role or ignoring rules
    r"\b(ignore|disregard|forget|override|bypass)\b.{0,40}\b(rules?|instructions?|restrictions?|prompt|previous|above|system)\b",
    r"\b(act|behave|respond|answer) as\b",
    r"\bpretend\b|\byou are now\b|\bjailbreak\b|\bsystem prompt\b|\bdeveloper mode\b|\bgeneral[- ]purpose\b",
    # entertainment, trivia, general knowledge
    r"\b(world cup|football|cricket|soccer|movie|film|song|lyrics|celebrity|recipe|weather|joke|poem|stock|bitcoin|crypto|election|president|capital of|who won|who is the|translate)\b",
    # unrelated mathematics
    r"\b(integral|derivative of|solve for|equation|prime number|factorial|square root of)\b|\bwhat is \d+\s*[-+*/x]\s*\d+\b",
    # medicines, dosing, treatment requests
    r"\b(dose|dosage|ibuprofen|paracetamol|acetaminophen|aspirin|opioid|painkiller|medication|prescri\w+|antibiotic|supplement|diet)\b",
    r"\b(how (do|can|should) i (treat|cure|fix|heal)|treatment plan|exercises? to (cure|fix))\b",
    # unrelated medical conditions
    r"\b(diabetes|cancer|covid|flu|asthma|depression|anxiety|migraine|heart|kidney|liver|pregnan\w+|skin|dental|tooth|eye)\b",
]
_ALLOW = [
    r"\b[CTLS]\d{1,2}(-[CTLS]\d{1,2})?\b",
    r"\b(spine|spinal|vertebra\w*|disc|discs|disk|disks|intervertebral|lordosis|kyphosis|scoliosis|cervical|thoracic|lumbar|sacr\w+|endplate|curvature|anatomy|anatomical|spondyl\w+)\b",
    r"\b(measure\w*|z-?score|percentile|deviation|percentage|reference|interval|standard deviation|reference mean|median|average|angle|height|width|depth|wedge|asymmetr\w+|difference|threshold|calibrat\w+)\b",
    r"\b(result|results|flag\w*|indeterminate|unusual|within reference|model score|abstain\w*|complete\w*|missing|status|finding\w*|analysis|spinalytics|score)\b",
    r"\b(injury|fracture|degenerat\w+|osteoporo\w+|genetic|posture|bone density)\b",
    r"\b(sources?|evidence|literature|studies|clinician|doctor|explanations?)\b.{0,60}\b(pattern|result|finding|measurement|flag\w*|spine|spinal)\b",
    r"\b(pattern|result|finding|measurement|flag\w*)\b.{0,60}\b(sources?|evidence|literature|studies|clinician|doctor|explanations?)\b",
    r"\bwhat (information|data|tests?) (might|could|would) help\b",
    r"\b(sources?|evidence|literature)\b.{0,50}\b(support|explanations?)\b",
]
_BLOCK_RE = [re.compile(p, re.IGNORECASE) for p in _BLOCK]
_ALLOW_RE = [re.compile(p, re.IGNORECASE) for p in _ALLOW]
_LEVEL_RE = re.compile(r"\b([CTL]\d{1,2}(?:-[CTLS]\d{1,2})?)\b", re.IGNORECASE)


@dataclass(frozen=True)
class ScopeResult:
    verdict: str  # in_scope | out_of_scope | uncertain | rejected
    reason: str = ""


def classify(question: str) -> ScopeResult:
    q = (question or "").strip()
    if not q:
        return ScopeResult("rejected", "The question is empty.")
    if len(q) > MAX_QUESTION_CHARS:
        return ScopeResult("rejected", f"The question is longer than {MAX_QUESTION_CHARS} characters.")
    for rx in _BLOCK_RE:
        if rx.search(q):
            return ScopeResult("out_of_scope", "blocked topic")
    if any(rx.search(q) for rx in _ALLOW_RE):
        return ScopeResult("in_scope", "allowed topic")
    return ScopeResult("uncertain", "no recognised topic")


def levels_mentioned(question: str) -> list[str]:
    """Levels named in the question, normalised to the data form (``L4``, ``L4-L5``), in order, de-duplicated."""
    seen: list[str] = []
    for m in _LEVEL_RE.finditer(question or ""):
        level = m.group(1).upper()
        if level not in seen:
            seen.append(level)
    return seen
