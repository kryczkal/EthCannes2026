# Engine

Python (Temporal) orchestrator and workers that govern the 4-phase security analysis pipeline.

## Prerequisites

- [Temporal Server](https://docs.temporal.io/cli) running locally on port `7233`
- Python 3.11+
- [uv](https://github.com/astral-sh/uv) (recommended) or pip

## Installation

```bash
uv sync
```

## Usage

1. Start the local Temporal server (in a separate terminal):
   ```bash
   temporal server start-dev
   ```

2. Run the worker:
   ```bash
   uv run python src/npmguard/main.py
   ```

3. Start the API (in a third terminal):
   ```bash
   uv run python src/npmguard/api.py
   ```
   The API listens on `http://localhost:8000`. Trigger an audit with:
   ```bash
   curl -X POST http://localhost:8000/audit \
        -H "Content-Type: application/json" \
        -d '{"package_name": "serialize-javascript"}'
   ```
   Interactive docs at `http://localhost:8000/docs`.

### Use 0G Compute

For 0G Compute, use the standard OpenAI-compatible backend configuration.

Recommended first setup: 0G testnet.

```bash
export NPMGUARD_LLM_BACKEND=openai_compatible
export NPMGUARD_LLM_MODEL=qwen/qwen-2.5-7b-instruct
export NPMGUARD_LLM_API_KEY=app-sk-...
export NPMGUARD_LLM_BASE_URL=https://compute-network-6.integratenetwork.work/v1/proxy
```

Notes:

- Anthropic remains available as a fallback with `NPMGUARD_LLM_BACKEND=anthropic`.
- Generic OpenAI-compatible providers are also supported:

```bash
export NPMGUARD_LLM_BACKEND=openai_compatible
export NPMGUARD_LLM_MODEL=your-model
export NPMGUARD_LLM_BASE_URL=https://your-provider.example/v1
export NPMGUARD_LLM_API_KEY=...
```

This v1 integration does not use a JS SDK sidecar or TEE verification. Those can be added later if
you want broker-native verification flows.

## Smoke Test (no Temporal required)

Run static checks against all test fixtures locally:

```bash
uv run python smoke_test.py            # all fixtures, all checks
uv run python smoke_test.py --no-llm  # skip LLM-backed checks
uv run python smoke_test.py test-pkg-dns-exfil  # single package
```

## Tests

```bash
uv run pytest tests/ -v
```

Live OpenAI-compatible / 0G connectivity check:

```bash
cp .env.test.example .env.test
# fill in real values in .env.test
uv run pytest tests/test_0g_integration.py -m integration -v
```

## Analysis Pipeline

See [`docs/architecture-v2.md`](../docs/architecture-v2.md) for the full pipeline design.

## Configuration

Settings are loaded from environment variables with the `NPMGUARD_` prefix (or a `.env` file):

| Variable | Default | Description |
|---|---|---|
| `NPMGUARD_TEMPORAL_HOST` | `localhost` | Temporal server host |
| `NPMGUARD_TEMPORAL_PORT` | `7233` | Temporal server port |
| `NPMGUARD_API_HOST` | `0.0.0.0` | API listen host |
| `NPMGUARD_API_PORT` | `8000` | API listen port |
| `NPMGUARD_TASK_QUEUE` | `npmguard-task-queue` | Temporal task queue name |
| `NPMGUARD_LLM_BACKEND` | `anthropic` | LLM backend: `anthropic` or `openai_compatible` |
| `NPMGUARD_LLM_MODEL` | `claude-sonnet-4-6` | LLM model for static analysis |
| `NPMGUARD_LLM_BASE_URL` | _(unset)_ | OpenAI-compatible endpoint (0G or other provider) |
| `NPMGUARD_LLM_API_KEY` | _(unset)_ | API key for the OpenAI-compatible backend |
| `NPMGUARD_LLM_TIMEOUT_SECONDS` | `60.0` | Request timeout budget for LLM calls |
