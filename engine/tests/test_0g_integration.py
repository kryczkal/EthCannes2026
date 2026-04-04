"""Live 0G/OpenAI-compatible integration test driven by engine/.env.test."""

from __future__ import annotations

import json
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

import pytest

ENGINE_DIR = Path(__file__).resolve().parents[1]
ENV_TEST_PATH = ENGINE_DIR / ".env.test"
REQUIRED_KEYS = (
    "NPMGUARD_LLM_MODEL",
    "NPMGUARD_LLM_BASE_URL",
    "NPMGUARD_LLM_API_KEY",
)


def _read_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip()

    return values


def _load_test_config() -> tuple[dict[str, str], list[str]]:
    env = _read_env_file(ENV_TEST_PATH)
    missing = [key for key in REQUIRED_KEYS if not env.get(key)]
    return env, missing


@pytest.mark.integration
def test_openai_compatible_inference_from_env_test():
    env, missing = _load_test_config()
    if missing:
        pytest.skip(
            f"Fill engine/.env.test before running this live integration test. Missing: {', '.join(missing)}"
        )

    base_url = env["NPMGUARD_LLM_BASE_URL"].rstrip("/")
    timeout_seconds = float(env.get("NPMGUARD_LLM_TIMEOUT_SECONDS", "60"))
    payload = {
        "model": env["NPMGUARD_LLM_MODEL"],
        "messages": [
            {"role": "system", "content": "You are a concise assistant."},
            {"role": "user", "content": "Reply with exactly OK."},
        ],
        "temperature": 0,
        "max_tokens": 8,
    }

    request = Request(
        url=f"{base_url}/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {env['NPMGUARD_LLM_API_KEY']}",
        },
        method="POST",
    )

    try:
        with urlopen(request, timeout=timeout_seconds) as response:  # noqa: S310
            body = response.read().decode("utf-8")
    except HTTPError as exc:  # pragma: no cover - exercised manually
        body = exc.read().decode("utf-8", errors="replace")
        pytest.fail(f"0G inference returned HTTP {exc.code}: {body}")
    except URLError as exc:  # pragma: no cover - exercised manually
        pytest.fail(f"0G inference request failed: {exc}")

    data = json.loads(body)
    assert "choices" in data and data["choices"], data
    message = data["choices"][0]["message"]["content"]
    assert isinstance(message, str) and message.strip(), data
