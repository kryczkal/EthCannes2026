#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

npm install --silent

set -m

cleanup() {
  echo -e "\nShutting down frontend..."
  kill -- -"$PID" 2>/dev/null
  wait "$PID" 2>/dev/null
  echo "Done."
}
trap cleanup INT TERM EXIT

npx vite &
PID=$!
wait "$PID"
