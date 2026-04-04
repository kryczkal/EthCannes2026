#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

set -m

ENGINE_PID=
FRONTEND_PID=

cleanup() {
  echo -e "\nShutting down..."
  [ -n "$ENGINE_PID" ] && kill -- -"$ENGINE_PID" 2>/dev/null
  [ -n "$FRONTEND_PID" ] && kill -- -"$FRONTEND_PID" 2>/dev/null
  wait 2>/dev/null
  echo "Done."
}
trap cleanup INT TERM EXIT

./engine/run.sh &
ENGINE_PID=$!

./frontend/run.sh &
FRONTEND_PID=$!

wait
