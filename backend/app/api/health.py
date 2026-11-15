from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.config import APP_VERSION, Settings, get_settings

router = APIRouter(prefix="/api", tags=["health"])


class HealthResponse(BaseModel):
    status: str
    version: str
    ai_assistant_configured: bool


@router.get("/health", response_model=HealthResponse)
def health(settings: Settings = Depends(get_settings)) -> HealthResponse:
    """Service health. Reports only whether an AI key exists, never the key."""
    return HealthResponse(status="ok", version=APP_VERSION, ai_assistant_configured=settings.ai_assistant_configured)
