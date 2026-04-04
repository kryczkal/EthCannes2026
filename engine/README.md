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

## Analysis Pipeline

The engine runs four phases in sequence. Phases 1 and 2 run in parallel.

### Phase 0 — Inventory (`inventory/`)

Fast deterministic structural triage. No JS execution, no LLM.

| Check | What it detects |
|---|---|
| Shell pipe dealbreaker | `curl … | sh` / `wget … | bash` in lifecycle scripts |
| Missing install file | `postinstall` references a file not present in the package |
| Binary files | ELF / PE / Mach-O binaries shipped in the package |
| Executable permissions | Files with `+x` outside `bin/` |
| Unusual extensions | `.enc`, `.bin`, `.exe`, etc. |
| Encoded content | Long base64/hex blobs in non-JS files |
| Minified install scripts | Lifecycle scripts with lines > 500 chars |
| Hidden dotfiles | Non-standard dotfiles (`.hidden-config`, etc.) |

A *dealbreaker* finding short-circuits the pipeline immediately and returns `DANGEROUS`.

### Layer 1 — Static Analysis (`activities/static_analysis.py`)

Pure heuristic/AST scanning. No code execution.

| Check | What it detects |
|---|---|
| Anti-AI prompt detection | Strings designed to hijack LLM-based analysis (tier-0 gate) |
| Lifecycle hook analysis | Malicious `preinstall`/`postinstall` scripts |
| Network exfiltration | Regex signals confirmed by LLM — `fetch`, DNS lookups, IMDS probes, etc. |

### Layer 2 — Sandbox Execution (`activities/sandbox.py`)

Runs the package in a controlled environment using pre-written Vitest exploit harnesses.

For `test-pkg-*` packages the harness lives in `sandbox/exploits/`. For real npm packages a Docker-based harness would be wired here.

| Signal | What it proves |
|---|---|
| Lifecycle hook + binary download | `LIFECYCLE_HOOK`, `BINARY_DOWNLOAD`, `PROCESS_SPAWN`, `NETWORK` |
| Env/credential exfiltration | `ENV_VARS`, `CREDENTIAL_THEFT`, `NETWORK` |
| Encrypted payload | `ENCRYPTED_PAYLOAD`, `NETWORK` |
| Filesystem wiper | `FILESYSTEM`, `NETWORK`, `GEO_GATING` |
| Infinite loop | `DOS_LOOP` |
| Obfuscated dropper | `OBFUSCATION`, `BINARY_DOWNLOAD`, `NETWORK` |
| DNS exfiltration | `DNS_EXFIL`, `ENV_VARS`, `CREDENTIAL_THEFT`, `ANTI_AI_PROMPT`, `ENCRYPTED_PAYLOAD` |
| DOM injection | `DOM_INJECT`, `NETWORK` |

### Layer 3 — Adversarial Fuzzing (`activities/fuzzing.py`)

Simulates a malicious environment (mitmproxy-style response injection, time-bomb emulation) to trigger conditional payloads. Currently a placeholder.

## Configuration

Settings are loaded from environment variables with the `NPMGUARD_` prefix (or a `.env` file):

| Variable | Default | Description |
|---|---|---|
| `NPMGUARD_TEMPORAL_HOST` | `localhost` | Temporal server host |
| `NPMGUARD_TEMPORAL_PORT` | `7233` | Temporal server port |
| `NPMGUARD_API_HOST` | `0.0.0.0` | API listen host |
| `NPMGUARD_API_PORT` | `8000` | API listen port |
| `NPMGUARD_TASK_QUEUE` | `npmguard-task-queue` | Temporal task queue name |
| `NPMGUARD_LLM_MODEL` | `claude-sonnet-4-6` | LLM model for static analysis |
| `NPMGUARD_LLM_BASE_URL` | _(unset)_ | OpenAI-compatible endpoint (e.g. 0G Compute) |
