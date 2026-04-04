# Claude Notes

Use this file as the short orientation guide for working in this repo with Claude or any other coding assistant.

## Start Here

1. Read `README.md`.
2. Identify the target subproject.
3. Read that subproject's `README.md`.
4. Change only the files needed for that task.

## Repo Map

| Directory | Description |
|-----------|-------------|
| `engine/` | Python audit pipeline (Temporal orchestrator), LLM-backed checks |
| `cli/` | TypeScript CLI — check packages against ENS audits, install audited artifacts |
| `npmguard/` | ENS/IPFS demo publisher, demo packages, `sginstall` |
| `chainlink/` | CRE workflow — monitors npm registry, triggers audits |
| `sandbox/` | Dynamic runtime exploitation harness and test fixtures |
| `contracts/` | On-chain and ENS-related scripts |
| `docs/` | Architecture docs, research notes, production guides |
| `artifacts/` | Cached tarballs, reports, npm-cache (gitignored payloads) |
| `test-package-install/` | Minimal workspace for testing package installation |

## Integration Shape

1. `chainlink/` triggers audits on new npm releases.
2. `engine/` performs analysis and LLM-backed reasoning.
3. `npmguard/` publishes source/report CIDs to IPFS and audit metadata to ENS.
4. `cli/` and `npmguard/packages/sginstall` consume ENS metadata and retrieve audited code.

## Project-Specific Notes

### `engine/`

- Python project managed with `uv`.
- LLM backends are intentionally simple:
  - `anthropic`
  - `openai_compatible`
- 0G is configured as `openai_compatible` through env vars only.
- Preferred local validation:

```bash
cd engine
uv run pytest tests/test_llm.py -v
uv run pytest tests/test_0g_integration.py -m integration -v
```

### `npmguard/`

- Demo publishing workspace for ENS + IPFS.
- The current naming model is package subdomains under a parent ENS name, for example:
  - `axios.npmguard.eth`
  - `1-8-0.axios.npmguard.eth`
- Keep gateway secrets out of user-facing logs.
- When debugging downloads, distinguish:
  - wrong ENS CID
  - missing Pinata artifact
  - CID verification mismatch

### `cli/`

- Treat this as the user-facing layer.
- Reuse working ENS/IPFS logic from `npmguard/` instead of re-implementing it in parallel.

## Practical Advice

- Avoid broad repo-wide edits unless the task really requires them.
- Keep README and env examples aligned with the code.
- When a service is just OpenAI-compatible, prefer configuration over new abstraction.
- If a flow depends on onchain or gateway state, verify the external state before blaming the code.
- Update this file and `Agent.md` whenever repo structure, standard commands, or core integration assumptions change.
- Update `CLAUDE.md` (not `Claude.md`) — the uppercase filename is the convention.
