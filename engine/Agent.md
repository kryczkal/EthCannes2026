# engine — Agent.md

- Managed with `uv`. Run `uv sync` before testing.
- Two LLM backends only: `anthropic` and `openai_compatible`. Don't add more.
- 0G = `openai_compatible` via env vars. No separate backend.
- `.env` is runtime config; `.env.test` is live integration-test config.

## Test

```bash
uv sync
uv run pytest tests/ -v
uv run pytest tests/test_0g_integration.py -m integration -v
```
