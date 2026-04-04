"""
NpmGuard configuration via pydantic-settings.

Validates all configuration at startup. Load precedence: env vars > .env file > defaults.
"""

from enum import Enum
from pathlib import Path
from urllib.parse import urlparse, urlunparse

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Root of the monorepo (engine/ is one level down from repo root)
REPO_ROOT = Path(__file__).parent.parent.parent.parent

# Directories to skip when walking package trees
SKIP_DIRS = frozenset(("node_modules", ".git", ".svn"))

ZERO_G_MODEL = "qwen/qwen-2.5-7b-instruct"


class LLMBackend(str, Enum):
    """Supported model backend modes."""

    ANTHROPIC = "anthropic"
    OPENAI_COMPATIBLE = "openai_compatible"


class ZeroGNetwork(str, Enum):
    """Named 0G network targets for configuration and logs."""

    TESTNET = "testnet"
    MAINNET = "mainnet"


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
    llm_backend: LLMBackend = LLMBackend.ANTHROPIC
    llm_model: str = "claude-sonnet-4-6"
    llm_base_url: str | None = None  # For 0G Compute or other OpenAI-compatible endpoint
    llm_api_key: SecretStr | None = None
    llm_timeout_seconds: float = Field(default=60.0, gt=0)
    zero_g_network: ZeroGNetwork = ZeroGNetwork.TESTNET
    zero_g_service_url: str | None = None

    @property
    def temporal_address(self) -> str:
        return f"{self.temporal_host}:{self.temporal_port}"

    @property
    def effective_llm_model(self) -> str:
        if self.zero_g_service_url is not None:
            return ZERO_G_MODEL
        return self.llm_model

    @staticmethod
    def _validate_url(raw_url: str, env_name: str) -> str:
        parsed = urlparse(raw_url)
        if not parsed.scheme or not parsed.netloc:
            raise ValueError(f"{env_name} must be a valid URL.")
        return raw_url

    @classmethod
    def _normalize_zero_g_url(cls, raw_url: str) -> str:
        validated = cls._validate_url(raw_url, "NPMGUARD_ZERO_G_SERVICE_URL")
        parsed = urlparse(validated)
        normalized_path = parsed.path.rstrip("/")
        if not normalized_path.endswith("/v1/proxy"):
            normalized_path = f"{normalized_path}/v1/proxy" if normalized_path else "/v1/proxy"

        return urlunparse(parsed._replace(path=normalized_path, params="", query="", fragment=""))

    @property
    def effective_llm_base_url(self) -> str | None:
        if self.llm_backend == LLMBackend.OPENAI_COMPATIBLE:
            if self.zero_g_service_url is not None:
                return self._normalize_zero_g_url(self.zero_g_service_url)
            if self.llm_base_url is None:
                return None
            return self._validate_url(self.llm_base_url, "NPMGUARD_LLM_BASE_URL")

        return None

    @model_validator(mode="after")
    def validate_llm_settings(self) -> "Settings":
        if self.llm_backend == LLMBackend.OPENAI_COMPATIBLE:
            if self.zero_g_service_url is None and self.llm_base_url is None:
                raise ValueError(
                    "NPMGUARD_LLM_BASE_URL or NPMGUARD_ZERO_G_SERVICE_URL is required when "
                    "NPMGUARD_LLM_BACKEND=openai_compatible."
                )
            if self.zero_g_service_url is not None:
                _ = self.effective_llm_base_url
            elif self.llm_base_url is not None:
                self._validate_url(self.llm_base_url, "NPMGUARD_LLM_BASE_URL")

            if self.zero_g_service_url is not None and self.llm_api_key is None:
                raise ValueError(
                    "NPMGUARD_LLM_API_KEY is required when NPMGUARD_ZERO_G_SERVICE_URL is set."
                )

        return self
