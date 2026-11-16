from fastapi import APIRouter, Request

from app.limiter import analyze_limit, limiter
from app.schemas.analysis import AnalyzeRequest, AnalyzeResponse
from app.services import analysis_service

router = APIRouter(prefix="/api", tags=["analysis"])


@router.post("/analyze", response_model=AnalyzeResponse)
@limiter.limit(analyze_limit)
def analyze(request: Request, body: AnalyzeRequest) -> AnalyzeResponse:
    """Compare measurements with the synthetic reference and score the overall pattern.

    Results are not stored. This route never calls an external AI service.
    """
    return analysis_service.analyze(body)
