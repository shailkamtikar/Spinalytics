"""Application settings, read from environment variables or the root .env file."""
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_DIR = Path(__file__).resolve().parents[2]
APP_VERSION = "0.1.0"


@dataclass(frozen=True)
class AnalysisConfig:
    """Demonstration thresholds for the statistical engine. Not clinical cut-offs."""

    within_max_abs_z: float = 2.0  # |z| <= this -> within
    large_min_abs_z: float = 3.5  # |z| > this -> large_deviation (between: review)
    min_completeness: float = 0.5  # below this the overall state is indeterminate
    pct_epsilon: float = 0.01  # reference means smaller than this give no percentage
    sd_epsilon: float = 1e-6  # reference SDs smaller than this give no z-score


DEFAULT_ANALYSIS_CONFIG = AnalysisConfig()


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT_DIR / ".env", env_file_encoding="utf-8", extra="ignore")

    gemini_api_key: str = ""
    gemini_model: str = ""

    @property
    def ai_assistant_configured(self) -> bool:
        return bool(self.gemini_api_key.strip())


@lru_cache
def get_settings() -> Settings:
    return Settings()
