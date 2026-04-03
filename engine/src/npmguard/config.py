"""
NpmGuard configuration via pydantic-settings.

Validates all configuration at startup per PRODUCTION_PYTHON_GUIDE §9.
Load precedence: Environment variables > .env file > Defaults.
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

    @property
    def temporal_address(self) -> str:
        return f"{self.temporal_host}:{self.temporal_port}"
