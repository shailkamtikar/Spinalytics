"""Per-IP rate limiting (in memory: the free hosting tier runs a single instance)."""
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.config import get_settings

limiter = Limiter(key_func=get_remote_address)


def analyze_limit() -> str:
    return get_settings().analyze_rate_limit


def ai_limit() -> str:
    return get_settings().ai_rate_limit
