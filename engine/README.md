# Engine

TypeScript audit pipeline — inventory, LLM static analysis, agentic investigation, and sandbox execution.

## Prerequisites

- Node.js 20+
- Docker (for sandbox execution)
- API key for Anthropic or OpenAI-compatible LLM provider

## Installation

```bash
npm install
```

## Usage

```bash
npx tsx src/index.ts              # dev server on :8000
npm run build && npm start        # production
```

Trigger an audit:

```bash
curl -X POST http://localhost:8000/audit \
     -H "Content-Type: application/json" \
     -d '{"packageName": "serialize-javascript"}'
```

Health check at `http://localhost:8000/health`.

### Use 0G Compute

```bash
export NPMGUARD_LLM_BACKEND=openai_compatible
export NPMGUARD_LLM_MODEL=qwen/qwen-2.5-7b-instruct
export NPMGUARD_LLM_API_KEY=app-sk-...
export NPMGUARD_LLM_BASE_URL=https://compute-network-6.integratenetwork.work/v1/proxy
```

Anthropic remains available with `NPMGUARD_LLM_BACKEND=anthropic` (default).

## Analysis Pipeline

See [`docs/architecture-v2.md`](../docs/architecture-v2.md) for the full pipeline design.

```
npm package → Phase 0: Inventory → Phase 1a: Triage → Phase 1b: Investigation → Phase 1c: Test gen → Phase 2: Verify → AuditReport
```

## Configuration

Settings are loaded from environment variables with the `NPMGUARD_` prefix (or a `.env` file):

| Variable | Default | Description |
|---|---|---|
| `NPMGUARD_API_HOST` | `0.0.0.0` | API listen host |
| `NPMGUARD_API_PORT` | `8000` | API listen port |
| `NPMGUARD_LLM_BACKEND` | `anthropic` | LLM backend: `anthropic` or `openai_compatible` |
| `NPMGUARD_LLM_MODEL` | — | LLM model (per-phase overrides below) |
| `NPMGUARD_LLM_BASE_URL` | _(unset)_ | OpenAI-compatible endpoint |
| `NPMGUARD_LLM_API_KEY` | _(unset)_ | API key for OpenAI-compatible backend |
| `NPMGUARD_LLM_TIMEOUT_SECONDS` | `60` | Request timeout for LLM calls |
| `NPMGUARD_TRIAGE_MODEL` | `claude-haiku-4-5-20251001` | Model for triage phase |
| `NPMGUARD_TRIAGE_RISK_THRESHOLD` | `3` | Risk score below this skips investigation |
| `NPMGUARD_INVESTIGATION_MODEL` | `claude-sonnet-4-6` | Model for investigation phase |
| `NPMGUARD_INVESTIGATION_ENABLED` | `true` | Set `false` to skip LLM investigation |
| `NPMGUARD_MAX_AGENT_TURNS` | `30` | Max tool-call turns for investigation agent |
| `NPMGUARD_TEST_GEN_MODEL` | `claude-sonnet-4-6` | Model for test generation |
| `NPMGUARD_SANDBOX_IMAGE` | `node:22-slim` | Docker image for sandbox |
| `NPMGUARD_SANDBOX_MEMORY_MB` | `512` | Sandbox memory limit |
| `NPMGUARD_SANDBOX_CPUS` | `1` | Sandbox CPU quota |
| `NPMGUARD_SANDBOX_NETWORK` | `none` | Sandbox network mode |
| `NPMGUARD_CRE_API_KEY` | _(unset)_ | API key for Chainlink CRE (bypasses payment) |
| `NPMGUARD_CONTRACT_ADDRESS` | _(unset)_ | NpmGuardAuditRequest contract address |
| `NPMGUARD_OG_RPC_URL` | `https://evmrpc-testnet.0g.ai` | 0G Galileo Testnet RPC endpoint |

## Deploy to DigitalOcean

### 1. Create a Droplet

- Image: **Docker on Ubuntu** (Marketplace)
- Size: **$16/mo** (2GB / 1 CPU) or higher
- Region: **Amsterdam**
- Auth: Password or SSH key

### 2. Setup

```bash
ssh root@<DROPLET_IP>
git clone https://github.com/kryczkal/EthCannes2026.git
cd EthCannes2026/engine
bash setup-droplet.sh
```

### 3. Configure

```bash
nano .env
# Set ANTHROPIC_API_KEY=sk-ant-...
```

### 4. Run

```bash
npx tsx src/index.ts
```

### 5. Verify

```bash
curl http://<DROPLET_IP>:8000/health
# {"status":"ok"}
```

If the port is blocked:
```bash
ufw allow 8000
```

### Production (keep running after SSH disconnect)

```bash
nohup npx tsx src/index.ts > engine.log 2>&1 &
```

Check logs: `tail -f engine.log`
