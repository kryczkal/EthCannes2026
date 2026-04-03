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
