#!/bin/sh
set -eu

: "${OPENCLAW_GATEWAY_TOKEN:?OPENCLAW_GATEWAY_TOKEN is required}"

STATE_DIR="${HOME}/.openclaw"
WORKSPACE_DIR="${OPENCLAW_WORKSPACE:-/workspace}"
CONFIG_FILE="${STATE_DIR}/openclaw.json"

mkdir -p "${STATE_DIR}" "${WORKSPACE_DIR}"

if [ ! -f "${CONFIG_FILE}" ]; then
  cat > "${CONFIG_FILE}" <<EOF
{
  "gateway": {
    "mode": "local"
  },
  "agents": {
    "defaults": {
      "workspace": "${WORKSPACE_DIR}"
    }
  }
}
EOF
fi

exec openclaw gateway run \
  --bind "${OPENCLAW_GATEWAY_BIND:-lan}" \
  --auth token \
  --token "${OPENCLAW_GATEWAY_TOKEN}" \
  --port "${OPENCLAW_GATEWAY_PORT:-18789}"
