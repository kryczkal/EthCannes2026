#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

exec docker compose \
  -f "${SCRIPT_DIR}/docker-compose.gateway.yml" \
  --env-file "${SCRIPT_DIR}/.env.gateway" \
  exec -T gateway openclaw "$@"
