"""
NpmGuard configuration via pydantic-settings.

Validates all configuration at startup. Load precedence: env vars > .env file > defaults.
"""

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_prefix="NPMGUARD_",
        case_sensitive=False,
    )

    # Temporal
    temporal_host: str = "localhost"
    temporal_port: int = Field(default=7233, gt=0, le=65535)

    # API Server
    api_host: str = "0.0.0.0"  # noqa: S104
    api_port: int = Field(default=8000, gt=0, le=65535)

    # Worker
    task_queue: str = "npmguard-task-queue"

    # LLM (static analysis layer)
    llm_model: str = "claude-sonnet-4-6"
    llm_base_url: str | None = None  # For 0G Compute or other OpenAI-compatible endpoint

    @property
    def temporal_address(self) -> str:
        return f"{self.temporal_host}:{self.temporal_port}"
