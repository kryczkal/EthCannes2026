"""LLM model factory — reads from Settings, supports Anthropic and OpenAI-compatible endpoints."""

from __future__ import annotations

from functools import lru_cache
from urllib.parse import urlparse

import structlog
from pydantic_ai.models.anthropic import AnthropicModel
from pydantic_ai.models.openai import OpenAIModel
from pydantic_ai.providers.openai import OpenAIProvider

from npmguard.config import LLMBackend, Settings

log = structlog.get_logger()


@lru_cache(maxsize=1)
def make_model() -> AnthropicModel | OpenAIModel:
    """Build a PydanticAI model from current settings.

    OpenAI-compatible providers are configured through the explicit backend
    selection. 0G Compute is treated as a specialized OpenAI-compatible setup.
    """
    settings = Settings()
    if settings.llm_backend == LLMBackend.ANTHROPIC:
        log.info(
            "llm_backend_selected",
            backend=settings.llm_backend.value,
            model=settings.effective_llm_model,
        )
        return AnthropicModel(settings.effective_llm_model)

    base_url = settings.effective_llm_base_url
    assert base_url is not None  # validated by Settings

    provider_kwargs: dict[str, str] = {"base_url": base_url}
    if settings.llm_api_key is not None:
        provider_kwargs["api_key"] = settings.llm_api_key.get_secret_value()

    log_payload = {
        "backend": settings.llm_backend.value,
        "model": settings.effective_llm_model,
        "base_url_host": urlparse(base_url).netloc,
    }
    if settings.zero_g_service_url is not None:
        log_payload["zero_g_network"] = settings.zero_g_network.value

    log.info("llm_backend_selected", **log_payload)

    provider = OpenAIProvider(**provider_kwargs)
    return OpenAIModel(settings.effective_llm_model, provider=provider)
