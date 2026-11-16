"""Optional assistant. The only route that may contact Gemini; analysis never depends on it."""
import logging
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeout

from fastapi import APIRouter, Request

from app.ai import client as ai
from app.ai.context import build_context, context_json
from app.ai.prompt import SYSTEM_INSTRUCTION
from app.ai.scope import REFUSAL, REPHRASE, classify
from app.ai.validate import approved_sources, validate_answer
from app.config import get_settings
from app.errors import ApiException
from app.limiter import ai_limit, limiter
from app.schemas.ask import AskRequest, AskResponse

router = APIRouter(prefix="/api", tags=["assistant"])
log = logging.getLogger("spinalytics.ask")
_pool = ThreadPoolExecutor(max_workers=2, thread_name_prefix="ask")


def _call(system: str, ctx: str, history: list[dict], question: str, settings) -> str:
    """Run the Gemini call with a hard timeout and no retry. ``ai.ask`` is looked up at call time so tests can replace it."""
    future = _pool.submit(ai.ask, system, ctx, history, question, api_key=settings.gemini_api_key, model=settings.ai_model, timeout=ai.ASK_TIMEOUT_SECONDS)
    try:
        return future.result(timeout=ai.ASK_TIMEOUT_SECONDS)
    except FutureTimeout:
        future.cancel()
        raise ai.AiTimeout("timeout")


@router.post("/ask-result", response_model=AskResponse)
@limiter.limit(ai_limit)
def ask_result(request: Request, body: AskRequest) -> AskResponse:
    scope = classify(body.question)
    if scope.verdict == "out_of_scope":
        return AskResponse(answer=REFUSAL, ai_generated=False, refused=True)
    if scope.verdict in ("uncertain", "rejected"):
        return AskResponse(answer=REPHRASE, ai_generated=False, needs_rephrase=True)

    settings = get_settings()
    if not settings.ai_assistant_configured:
        raise ApiException(503, "ai_not_configured", "The optional AI assistant is not set up on this server.")

    sources = approved_sources()
    ctx = build_context(body.result.model_dump(mode="json"), body.question)
    ctx["approved_sources"] = [{k: s.get(k) for k in ("title", "authors_or_organisation", "year", "identifier")} for s in sources]
    history = [t.model_dump() for t in body.history]
    try:
        text = _call(SYSTEM_INSTRUCTION, context_json(ctx), history, body.question, settings)
    except ai.AiNotConfigured:
        raise ApiException(503, "ai_not_configured", "The optional AI assistant is not set up on this server.")
    except ai.AiQuota:
        raise ApiException(503, "ai_quota", "The optional AI assistant is temporarily unavailable (usage limit reached). Your results are unaffected.")
    except ai.AiTimeout:
        raise ApiException(504, "ai_timeout", "The optional AI assistant took too long to answer. Your results are unaffected.")
    except ai.AiError:
        raise ApiException(502, "ai_error", "The optional AI assistant is temporarily unavailable. Your results are unaffected.")

    answer, flags = validate_answer(text, sources)
    if flags:
        log.info("assistant answer adjusted: %s", ",".join(flags))
    return AskResponse(answer=answer, ai_generated=True, sources=[])
