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


_model_cache: dict[str, AnthropicModel | OpenAIModel] = {}


def make_model(model_name: str | None = None) -> AnthropicModel | OpenAIModel:
    """Build a PydanticAI model from current settings.

    *model_name* overrides the default (``investigation_model``).
    OpenAI-compatible providers are configured through the explicit backend
    selection. 0G Compute is treated as a specialized OpenAI-compatible setup.
    """
    settings = Settings()
    model = model_name or settings.investigation_model

    if model in _model_cache:
        return _model_cache[model]

    if settings.llm_backend == LLMBackend.ANTHROPIC:
        log.info(
            "llm_backend_selected",
            backend=settings.llm_backend.value,
            model=model,
        )
        result = AnthropicModel(model)
    else:
        base_url = settings.effective_llm_base_url
        assert base_url is not None  # validated by Settings

        provider_kwargs: dict[str, str] = {"base_url": base_url}
        if settings.llm_api_key is not None:
            provider_kwargs["api_key"] = settings.llm_api_key.get_secret_value()

        log.info(
            "llm_backend_selected",
            backend=settings.llm_backend.value,
            model=model,
            base_url_host=urlparse(base_url).netloc,
        )

        provider = OpenAIProvider(**provider_kwargs)
        result = OpenAIModel(model, provider=provider)

    _model_cache[model] = result
    return result
