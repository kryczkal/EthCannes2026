#!/bin/sh
set -eu

: "${OPENCLAW_GATEWAY_TOKEN:?OPENCLAW_GATEWAY_TOKEN is required}"

STATE_DIR="${HOME}/.openclaw"
WORKSPACE_DIR="${OPENCLAW_WORKSPACE:-/workspace}"
CONFIG_FILE="${STATE_DIR}/openclaw.json"
PORT="${OPENCLAW_GATEWAY_PORT:-18789}"

mkdir -p "${STATE_DIR}" "${WORKSPACE_DIR}"

CONFIG_FILE="${CONFIG_FILE}" WORKSPACE_DIR="${WORKSPACE_DIR}" PORT="${PORT}" node <<'EOF'
const fs = require("node:fs");

const configFile = process.env.CONFIG_FILE;
const workspaceDir = process.env.WORKSPACE_DIR;
const port = process.env.PORT;

let config = {};
if (fs.existsSync(configFile)) {
  config = JSON.parse(fs.readFileSync(configFile, "utf8"));
}

config.gateway ??= {};
config.gateway.mode = "local";
config.gateway.controlUi ??= {};
const origins = new Set(
  Array.isArray(config.gateway.controlUi.allowedOrigins)
    ? config.gateway.controlUi.allowedOrigins.filter((value) => typeof value === "string" && value.length > 0)
    : [],
);
origins.add(`http://127.0.0.1:${port}`);
origins.add(`http://localhost:${port}`);
config.gateway.controlUi.allowedOrigins = [...origins];

config.agents ??= {};
config.agents.defaults ??= {};
config.agents.defaults.workspace = workspaceDir;

fs.writeFileSync(configFile, `${JSON.stringify(config, null, 2)}\n`, "utf8");
EOF

exec openclaw gateway run \
  --bind "${OPENCLAW_GATEWAY_BIND:-lan}" \
  --auth token \
  --token "${OPENCLAW_GATEWAY_TOKEN}" \
  --port "${PORT}"
