# Engine

Python (Temporal) orchestrator and workers that govern the 5-step security analysis pipeline.

## Prerequisites

- [Temporal Server](https://docs.temporal.io/cli) running locally on port `7233`
- Python 3.11+
- [uv](https://github.com/astral-sh/uv) (recommended) or pip

## Installation

1. Create a virtual environment and install dependencies:

```bash
# Using uv (recommended)
uv sync

# Or using pip
pip install -e .
```

## Usage

1. Start the local Temporal server (in a separate terminal):
   ```bash
   temporal server start-dev
   ```

2. Run the engine (Worker and Orchestrator):
   ```bash
   # If using uv
   uv run python src/npmguard/main.py
   
   # Or using a standard venv
   source .venv/bin/activate
   python src/npmguard/main.py
   ```

The engine connects to the local Temporal server at `localhost:7233` and starts a worker listening on the `npmguard-task-queue` task queue. It registers the orchestrator workflow and the security analysis activities (static analysis, sandboxing, and adversarial fuzzing).

## Analysis Pipeline

The engine runs three layers in sequence. Each layer returns `(capabilities, proofs)` that are merged into the final `AuditReport`.

### Layer 1 — Static Analysis (`activities/static_analysis.py`)

Runs without executing any code. Pure heuristic/AST scanning.

| Sub-check | What it detects |
|---|---|
| Anti-AI prompt detection | Embedded text trying to hijack LLM-based analysis |
| Capability detection | `child_process`, `eval`, `fetch`, DNS lookups, crypto, etc. |
| Lifecycle hook analysis | Malicious `preinstall`/`postinstall` scripts in `package.json` |
| Obfuscation detection | Base64 blobs, XOR patterns, reversed strings, hex encoding |

### Layer 2 — Sandbox Execution (`activities/sandbox.py`)

Runs the package in a controlled environment and records what actually happens.

| Sub-check | What it detects |
|---|---|
| Network log | All outbound URLs contacted |
| Filesystem log | Files read/written/deleted |
| Process monitoring | Spawned subprocesses and their arguments |
| Env var access log | Which `process.env` keys were read |
| Cloud metadata probing | Requests to IMDS endpoints (`169.254.169.254`, etc.) |
| Infinite loop detection | Packages that block/spin on require (timeout → `DOS_LOOP`) |

For `test-pkg-*` packages the sandbox runs the pre-written Vitest exploit harness in `sandbox/exploits/`. For real npm packages a Docker-based harness would be wired here.

### Layer 3 — Adversarial Fuzzing (`activities/fuzzing.py`)

Simulates a malicious environment to trigger conditional payloads.

| Sub-check | What it detects |
|---|---|
| Malicious server simulation | Serves attacker-controlled responses to see if the package changes behaviour |

3. Start the API endpoint (in a third terminal):
   ```bash
   # If using uv
   uv run python src/npmguard/api.py
   ```
   The API will listen on `http://localhost:8000`. You can trigger an audit with:
   ```bash
   curl -X POST http://localhost:8000/audit \
        -H "Content-Type: application/json" \
        -d '{"package_name": "serialize-javascript"}'
   ```
   You can also visit `http://localhost:8000/docs` to see the interactive Swagger UI.
