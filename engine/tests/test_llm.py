"""Tests for backend-aware LLM configuration and model construction."""

from __future__ import annotations

from unittest.mock import patch

import pytest
from pydantic import ValidationError

from npmguard.config import LLMBackend, Settings, ZERO_G_MODEL, ZeroGNetwork
from npmguard.llm import make_model

LLM_ENV_KEYS = (
    "NPMGUARD_LLM_BACKEND",
    "NPMGUARD_LLM_MODEL",
    "NPMGUARD_LLM_BASE_URL",
    "NPMGUARD_LLM_API_KEY",
    "NPMGUARD_ZERO_G_NETWORK",
    "NPMGUARD_ZERO_G_SERVICE_URL",
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
        assert settings.effective_llm_model == "claude-sonnet-4-6"
        assert settings.effective_llm_base_url is None

    def test_openai_compatible_requires_base_url(self, monkeypatch: pytest.MonkeyPatch):
        monkeypatch.setenv("NPMGUARD_LLM_BACKEND", "openai_compatible")

        with pytest.raises(
            ValidationError,
            match="NPMGUARD_LLM_BASE_URL is required when NPMGUARD_LLM_BACKEND=openai_compatible.",
        ):
            Settings()

    def test_zero_g_requires_api_key(self, monkeypatch: pytest.MonkeyPatch):
        monkeypatch.setenv("NPMGUARD_LLM_BACKEND", "zero_g")
        monkeypatch.setenv("NPMGUARD_ZERO_G_SERVICE_URL", "https://compute.example")

        with pytest.raises(
            ValidationError,
            match="NPMGUARD_LLM_API_KEY is required when NPMGUARD_LLM_BACKEND=zero_g.",
        ):
            Settings()

    def test_zero_g_requires_service_url(self, monkeypatch: pytest.MonkeyPatch):
        monkeypatch.setenv("NPMGUARD_LLM_BACKEND", "zero_g")
        monkeypatch.setenv("NPMGUARD_LLM_API_KEY", "app-sk-test")

        with pytest.raises(
            ValidationError,
            match=(
                "NPMGUARD_ZERO_G_SERVICE_URL or NPMGUARD_LLM_BASE_URL is required when "
                "NPMGUARD_LLM_BACKEND=zero_g."
            ),
        ):
            Settings()

    def test_zero_g_normalizes_service_url(self, monkeypatch: pytest.MonkeyPatch):
        monkeypatch.setenv("NPMGUARD_LLM_BACKEND", "zero_g")
        monkeypatch.setenv("NPMGUARD_LLM_API_KEY", "app-sk-test")
        monkeypatch.setenv("NPMGUARD_ZERO_G_SERVICE_URL", "https://compute-network.example")
        monkeypatch.setenv("NPMGUARD_ZERO_G_NETWORK", "mainnet")

        settings = Settings()

        assert settings.llm_backend == LLMBackend.ZERO_G
        assert settings.zero_g_network == ZeroGNetwork.MAINNET
        assert settings.effective_llm_model == ZERO_G_MODEL
        assert settings.effective_llm_base_url == "https://compute-network.example/v1/proxy"

    def test_zero_g_keeps_existing_proxy_path(self, monkeypatch: pytest.MonkeyPatch):
        monkeypatch.setenv("NPMGUARD_LLM_BACKEND", "zero_g")
        monkeypatch.setenv("NPMGUARD_LLM_API_KEY", "app-sk-test")
        monkeypatch.setenv(
            "NPMGUARD_ZERO_G_SERVICE_URL", "https://compute-network.example/custom/v1/proxy"
        )

        settings = Settings()

        assert settings.effective_llm_base_url == "https://compute-network.example/custom/v1/proxy"

    def test_zero_g_rejects_malformed_service_url(self, monkeypatch: pytest.MonkeyPatch):
        monkeypatch.setenv("NPMGUARD_LLM_BACKEND", "zero_g")
        monkeypatch.setenv("NPMGUARD_LLM_API_KEY", "app-sk-test")
        monkeypatch.setenv("NPMGUARD_ZERO_G_SERVICE_URL", "not-a-url")

        with pytest.raises(ValidationError, match="NPMGUARD_ZERO_G_SERVICE_URL must be a valid URL."):
            Settings()

    def test_api_key_is_masked_in_repr(self, monkeypatch: pytest.MonkeyPatch):
        monkeypatch.setenv("NPMGUARD_LLM_BACKEND", "zero_g")
        monkeypatch.setenv("NPMGUARD_LLM_API_KEY", "app-sk-super-secret")
        monkeypatch.setenv("NPMGUARD_ZERO_G_SERVICE_URL", "https://compute-network.example")

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
        monkeypatch.setenv("NPMGUARD_LLM_MODEL", "gpt-4o-mini")
        monkeypatch.setenv("NPMGUARD_LLM_BASE_URL", "https://llm.example/v1")
        monkeypatch.setenv("NPMGUARD_LLM_API_KEY", "sk-test")

        with (
            patch("npmguard.llm.OpenAIProvider") as provider_cls,
            patch("npmguard.llm.OpenAIModel") as model_cls,
        ):
            provider_cls.return_value = object()
            model_cls.return_value = object()

            model = make_model()

        provider_cls.assert_called_once_with(base_url="https://llm.example/v1", api_key="sk-test")
        model_cls.assert_called_once_with("gpt-4o-mini", provider=provider_cls.return_value)
        assert model is model_cls.return_value

    def test_make_model_uses_zero_g_backend(self, monkeypatch: pytest.MonkeyPatch):
        monkeypatch.setenv("NPMGUARD_LLM_BACKEND", "zero_g")
        monkeypatch.setenv("NPMGUARD_LLM_API_KEY", "app-sk-test")
        monkeypatch.setenv("NPMGUARD_ZERO_G_SERVICE_URL", "https://compute-network.example")

        with (
            patch("npmguard.llm.OpenAIProvider") as provider_cls,
            patch("npmguard.llm.OpenAIModel") as model_cls,
        ):
            provider_cls.return_value = object()
            model_cls.return_value = object()

            model = make_model()

        provider_cls.assert_called_once_with(
            base_url="https://compute-network.example/v1/proxy",
            api_key="app-sk-test",
        )
        model_cls.assert_called_once_with(
            ZERO_G_MODEL,
            provider=provider_cls.return_value,
        )
        assert model is model_cls.return_value
