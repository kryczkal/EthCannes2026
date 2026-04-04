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

## Manual verifier test

Once the Docker gateway is up, the `verifier` agent exists, and model auth is configured, run:

```bash
cd /Users/piotrtyrakowski/repos/EthCannes2026/openclaw
OPENCLAW_CMD=/Users/piotrtyrakowski/repos/EthCannes2026/openclaw/docker-openclaw.sh \
OPENCLAW_ARGS="--json --agent verifier" \
npm run dev -- --input ./fixtures/axios-1.8.0.candidates.json --output ./fixtures/axios-1.8.0.output.json
```
