"""Tests for backend-aware LLM configuration and model construction."""

from __future__ import annotations

from unittest.mock import patch

import pytest
from pydantic import ValidationError

from npmguard.config import LLMBackend, Settings
from npmguard.llm import make_model

LLM_ENV_KEYS = (
    "NPMGUARD_LLM_BACKEND",
    "NPMGUARD_LLM_MODEL",
    "NPMGUARD_LLM_BASE_URL",
    "NPMGUARD_LLM_API_KEY",
)


@pytest.fixture(autouse=True)
def reset_llm_env(monkeypatch: pytest.MonkeyPatch):
    for key in LLM_ENV_KEYS:
        monkeypatch.delenv(key, raising=False)
    make_model.cache_clear()
    yield
    make_model.cache_clear()


class TestSettingsValidation:
    def test_defaults_to_anthropic_backend(self):
        settings = Settings()

        assert settings.llm_backend == LLMBackend.ANTHROPIC
        assert settings.llm_model == "claude-sonnet-4-6"
        assert settings.effective_llm_base_url is None

    def test_openai_compatible_requires_base_url(self, monkeypatch: pytest.MonkeyPatch):
        monkeypatch.setenv("NPMGUARD_LLM_BACKEND", "openai_compatible")

        with pytest.raises(
            ValidationError,
            match="NPMGUARD_LLM_BASE_URL is required when NPMGUARD_LLM_BACKEND=openai_compatible.",
        ):
            Settings()

    def test_openai_compatible_rejects_malformed_url(self, monkeypatch: pytest.MonkeyPatch):
        monkeypatch.setenv("NPMGUARD_LLM_BACKEND", "openai_compatible")
        monkeypatch.setenv("NPMGUARD_LLM_BASE_URL", "not-a-url")

        with pytest.raises(ValidationError, match="NPMGUARD_LLM_BASE_URL must be a valid URL."):
            Settings()

    def test_api_key_is_masked_in_repr(self, monkeypatch: pytest.MonkeyPatch):
        monkeypatch.setenv("NPMGUARD_LLM_BACKEND", "openai_compatible")
        monkeypatch.setenv("NPMGUARD_LLM_BASE_URL", "https://compute-network-6.integratenetwork.work/v1/proxy")
        monkeypatch.setenv("NPMGUARD_LLM_API_KEY", "app-sk-super-secret")

        settings = Settings()

        assert "app-sk-super-secret" not in repr(settings)


class TestMakeModel:
    def test_make_model_uses_anthropic_backend(self):
        with patch("npmguard.llm.AnthropicModel") as anthropic_model:
            anthropic_model.return_value = object()

            model = make_model()

        anthropic_model.assert_called_once_with("claude-sonnet-4-6")
        assert model is anthropic_model.return_value

    def test_make_model_uses_openai_compatible_backend(self, monkeypatch: pytest.MonkeyPatch):
        monkeypatch.setenv("NPMGUARD_LLM_BACKEND", "openai_compatible")
        monkeypatch.setenv("NPMGUARD_LLM_MODEL", "qwen/qwen-2.5-7b-instruct")
        monkeypatch.setenv(
            "NPMGUARD_LLM_BASE_URL", "https://compute-network-6.integratenetwork.work/v1/proxy"
        )
        monkeypatch.setenv("NPMGUARD_LLM_API_KEY", "app-sk-test")

        with (
            patch("npmguard.llm.OpenAIProvider") as provider_cls,
            patch("npmguard.llm.OpenAIModel") as model_cls,
        ):
            provider_cls.return_value = object()
            model_cls.return_value = object()

            model = make_model()

        provider_cls.assert_called_once_with(
            base_url="https://compute-network-6.integratenetwork.work/v1/proxy",
            api_key="app-sk-test",
        )
        model_cls.assert_called_once_with(
            "qwen/qwen-2.5-7b-instruct",
            provider=provider_cls.return_value,
        )
        assert model is model_cls.return_value
