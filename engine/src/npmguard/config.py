"""
NpmGuard configuration via pydantic-settings.

Validates all configuration at startup. Load precedence: env vars > .env file > defaults.
"""

from enum import Enum
from pathlib import Path
from urllib.parse import urlparse

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Root of the monorepo (engine/ is one level down from repo root)
REPO_ROOT = Path(__file__).parent.parent.parent.parent

# Directories to skip when walking package trees
SKIP_DIRS = frozenset(("node_modules", ".git", ".svn"))


class LLMBackend(str, Enum):
    """Supported model backend modes."""

    ANTHROPIC = "anthropic"
    OPENAI_COMPATIBLE = "openai_compatible"


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_prefix="NPMGUARD_",
        case_sensitive=False,
        env_file=".env",
        env_file_encoding="utf-8",
    )

    # Temporal
    temporal_host: str = "localhost"
    temporal_port: int = Field(default=7233, gt=0, le=65535)

    # API Server
    api_host: str = "0.0.0.0"  # noqa: S104
    api_port: int = Field(default=8000, gt=0, le=65535)

    # Worker
    task_queue: str = "npmguard-task-queue"

    # LLM provider (shared across all phases)
    llm_backend: LLMBackend = LLMBackend.ANTHROPIC
    llm_base_url: str | None = None  # For 0G Compute or other OpenAI-compatible endpoint
    llm_api_key: SecretStr | None = None
    llm_timeout_seconds: float = Field(default=60.0, gt=0)

    # Phase 1a: Triage
    triage_model: str = "claude-haiku-4-5-20251001"
    triage_risk_threshold: int = Field(default=3, ge=0, le=10)

    # Phase 1b: Investigation
    investigation_model: str = "claude-sonnet-4-6"
    max_agent_turns: int = Field(default=30, ge=1, le=200)

    # Phase 1c: Test generation
    test_gen_model: str = "claude-sonnet-4-6"

    # Docker sandbox
    sandbox_backend: str = "docker"  # "docker" | "ebpf" (future)
    sandbox_image: str = "node:22-slim"
    sandbox_memory_mb: int = Field(default=512, ge=64, le=4096)
    sandbox_cpus: float = Field(default=1.0, gt=0, le=4.0)
    sandbox_network: str = "none"  # "none" | "intercepted" (future mitmproxy)
    max_docker_exec_timeout_sec: int = Field(default=30, ge=5, le=300)

    # Investigation agent toggle
    investigation_enabled: bool = True

    @property
    def temporal_address(self) -> str:
        return f"{self.temporal_host}:{self.temporal_port}"

    @staticmethod
    def _validate_url(raw_url: str, env_name: str) -> str:
        parsed = urlparse(raw_url)
        if not parsed.scheme or not parsed.netloc:
            raise ValueError(f"{env_name} must be a valid URL.")
        return raw_url

    @property
    def effective_llm_base_url(self) -> str | None:
        if self.llm_backend == LLMBackend.OPENAI_COMPATIBLE:
            if self.llm_base_url is None:
                return None
            return self._validate_url(self.llm_base_url, "NPMGUARD_LLM_BASE_URL")

        return None

    @model_validator(mode="after")
    def validate_llm_settings(self) -> "Settings":
        if self.llm_backend == LLMBackend.OPENAI_COMPATIBLE:
            if self.llm_base_url is None:
                raise ValueError(
                    "NPMGUARD_LLM_BASE_URL is required when NPMGUARD_LLM_BACKEND=openai_compatible."
                )
            self._validate_url(self.llm_base_url, "NPMGUARD_LLM_BASE_URL")

        return self
