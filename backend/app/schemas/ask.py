from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.ai.scope import MAX_HISTORY_TURNS, MAX_QUESTION_CHARS
from app.schemas.analysis import AnalyzeResponse


class Turn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: Literal["user", "assistant"]
    text: str = Field(max_length=2000)


class AskRequest(BaseModel):
    """The browser sends the current result back (the server stores nothing); only a minimal context is derived from it."""

    model_config = ConfigDict(extra="forbid")

    question: str = Field(min_length=1, max_length=MAX_QUESTION_CHARS)
    history: list[Turn] = Field(default_factory=list, max_length=MAX_HISTORY_TURNS)
    result: AnalyzeResponse


class AskResponse(BaseModel):
    answer: str
    ai_generated: bool
    refused: bool = False
    needs_rephrase: bool = False
    sources: list[dict] = Field(default_factory=list)
    label: str = "AI-generated educational explanation. Not a diagnosis."
