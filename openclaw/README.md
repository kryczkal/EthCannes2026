# openclaw verifier

Prototype vulnerability verifier that uses the OpenClaw CLI as the reasoning runtime and owns its Docker/tool execution stack locally.

## Env

```bash
OPENCLAW_CMD=openclaw
OPENCLAW_ARGS=--local --json --agent verifier
# OPENCLAW_MAX_TURNS=16
```

## Isolated agent setup

Use a dedicated OpenClaw agent for this verifier instead of your normal `main` agent.

```bash
openclaw agents add verifier --workspace /Users/piotrtyrakowski/repos/EthCannes2026/openclaw/agent-workspace
```

This follows OpenClaw's documented isolated-agent pattern: one agent id, one workspace, separate from your normal assistant context.

After that, the default `OPENCLAW_ARGS` above should work.

## Usage

```bash
npm run dev -- --input ./candidates.json --output ./verified.json
```

## Terminal access

Open the OpenClaw terminal UI against the Dockerized gateway:

```bash
source /Users/piotrtyrakowski/repos/EthCannes2026/openclaw/.env.gateway
docker compose \
  -f /Users/piotrtyrakowski/repos/EthCannes2026/openclaw/docker-compose.gateway.yml \
  --env-file /Users/piotrtyrakowski/repos/EthCannes2026/openclaw/.env.gateway \
  exec gateway openclaw tui \
    --url ws://127.0.0.1:18789 \
    --token "$OPENCLAW_GATEWAY_TOKEN"
```

Run a one-shot agent call from the terminal:

```bash
/Users/piotrtyrakowski/repos/EthCannes2026/openclaw/docker-openclaw.sh \
  agent --agent verifier --json --message "hello"
```

## Docker gateway

If you want a long-running OpenClaw instance in Docker that the host CLI can connect to, use the compose file in this folder.

1. Create the env file:

```bash
cp openclaw/.env.gateway.example openclaw/.env.gateway
```

2. Set `OPENCLAW_GATEWAY_TOKEN` in `openclaw/.env.gateway`.

3. Start the gateway:

```bash
docker compose \
  -f openclaw/docker-compose.gateway.yml \
  --env-file openclaw/.env.gateway \
  up --build -d
```

4. Open it in the browser:

```bash
source openclaw/.env.gateway
open "http://127.0.0.1:${OPENCLAW_GATEWAY_PORT}/#token=${OPENCLAW_GATEWAY_TOKEN}"
```

The first browser connection may show `pairing required`. That is expected for this Docker setup because the gateway sees the browser through the Docker bridge. Approve the pending Control UI device once, then reload.

5. Optional: verify the container health without any host OpenClaw install:

```bash
docker compose \
  -f openclaw/docker-compose.gateway.yml \
  --env-file openclaw/.env.gateway \
  exec gateway openclaw health --json
```

6. If you want this verifier to use the Docker gateway instead of `openclaw agent --local`, remove `--local` from `OPENCLAW_ARGS`:

```bash
OPENCLAW_ARGS="--json --agent verifier"
```

7. Use the Docker wrapper script as the `OPENCLAW_CMD`:

```bash
OPENCLAW_CMD=/Users/piotrtyrakowski/repos/EthCannes2026/openclaw/docker-openclaw.sh
```

8. Create the isolated verifier agent inside Docker:

```bash
docker compose \
  -f openclaw/docker-compose.gateway.yml \
  --env-file openclaw/.env.gateway \
  exec gateway openclaw agents add verifier \
    --workspace /workspace/EthCannes2026/openclaw/agent-workspace \
    --non-interactive --json
```

9. Configure model auth for that agent.

Anthropic subscription tokens work with OpenClaw, but auth is per agent. Configure the `verifier` agent, not just `main`.

- easiest path: do it in the dashboard UI and select `verifier`
- CLI path: use `openclaw models auth --agent verifier ...`

Notes:

- The Docker image installs OpenClaw inside the image, so you can uninstall the host CLI after the container is working.
- The container keeps its state in a Docker volume named `openclaw_state`.
- The published port is pinned to `127.0.0.1` by default, matching the OpenClaw container docs for local browser access.
- The dashboard URL uses `#token=...` because token-auth gateways need the browser UI to receive the gateway token explicitly.
- The helper script [`docker-openclaw.sh`](/Users/piotrtyrakowski/repos/EthCannes2026/openclaw/docker-openclaw.sh) forwards `openclaw ...` commands into the running Docker container.

## Switching models

Check the current model for the verifier agent:

```bash
/Users/piotrtyrakowski/repos/EthCannes2026/openclaw/docker-openclaw.sh \
  models status --agent verifier --json
```

Set the verifier agent to Haiku:

```bash
/Users/piotrtyrakowski/repos/EthCannes2026/openclaw/docker-openclaw.sh \
  models --agent verifier set anthropic/claude-haiku-4-5
```

Set the verifier agent back to Opus:

```bash
/Users/piotrtyrakowski/repos/EthCannes2026/openclaw/docker-openclaw.sh \
  models --agent verifier set anthropic/claude-opus-4-6
```

You can list or probe model availability from the same wrapper:

```bash
/Users/piotrtyrakowski/repos/EthCannes2026/openclaw/docker-openclaw.sh \
  models status --agent verifier --probe --probe-provider anthropic
```

## Verifier session reset

The verifier CLI now resets `agent:verifier:main` before each run when you use the gateway-backed Docker setup. This keeps the visible verifier session the same in the UI while clearing prior model context before a new package analysis.

Disable that behavior for a run:

```bash
OPENCLAW_RESET_BEFORE_RUN=0
```

Override the session key to reset:

```bash
OPENCLAW_RESET_SESSION_KEY=agent:verifier:main
```

Reset the verifier session manually from the terminal:

```bash
/Users/piotrtyrakowski/repos/EthCannes2026/openclaw/docker-openclaw.sh \
  gateway call sessions.reset \
  --params '{"key":"agent:verifier:main"}' \
  --json
```

## Manual verifier test

Once the Docker gateway is up, the `verifier` agent exists, and model auth is configured, run:

```bash
cd /Users/piotrtyrakowski/repos/EthCannes2026/openclaw
OPENCLAW_CMD=/Users/piotrtyrakowski/repos/EthCannes2026/openclaw/docker-openclaw.sh \
OPENCLAW_ARGS="--json --agent verifier" \
npm run dev -- --input ./fixtures/axios-1.8.0.candidates.json --output ./fixtures/axios-1.8.0.output.json
```
