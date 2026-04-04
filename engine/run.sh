#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

npm install --silent

# Run in its own process group so we can kill the entire tree
set -m

cleanup() {
  echo -e "\nShutting down engine..."
  # Kill the entire process group (npx -> tsx -> node)
  kill -- -"$PID" 2>/dev/null
  wait "$PID" 2>/dev/null
  echo "Done."
}
trap cleanup INT TERM EXIT

npx tsx src/index.ts &
PID=$!
wait "$PID"
