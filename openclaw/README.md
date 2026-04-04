# openclaw verifier

Prototype vulnerability verifier that uses the OpenClaw CLI as the reasoning runtime and `verifier-core` for Docker/tool execution.

## Env

```bash
OPENCLAW_CMD=openclaw
# optional:
# OPENCLAW_ARGS=--local --json
# OPENCLAW_MAX_TURNS=16
```

## Usage

```bash
npm run dev -- --input ./candidates.json --output ./verified.json
```
