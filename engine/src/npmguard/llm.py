"""LLM model factory — reads from Settings, supports Anthropic and OpenAI-compatible endpoints."""

from __future__ import annotations

from functools import lru_cache

from pydantic_ai.models.anthropic import AnthropicModel
from pydantic_ai.models.openai import OpenAIModel
from pydantic_ai.providers.openai import OpenAIProvider

from npmguard.config import Settings


@lru_cache(maxsize=1)
def make_model() -> AnthropicModel | OpenAIModel:
    """Build a PydanticAI model from current settings.

    If ``llm_base_url`` is set the model is created via the OpenAI-compatible
    provider (for 0G Compute / vLLM / etc.), otherwise we default to the
    native Anthropic provider.
    """
    settings = Settings()
    if settings.llm_base_url:
        provider = OpenAIProvider(base_url=settings.llm_base_url)
        return OpenAIModel(settings.llm_model, provider=provider)
    return AnthropicModel(settings.llm_model)
