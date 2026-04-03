#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

# Use process groups so we can kill the entire tree (uv + child python)
set -m

echo "Starting Temporal Server..."
temporal server start-dev > /dev/null 2>&1 &
TEMPORAL_PID=$!

echo "Waiting for Temporal Server to turn up..."
sleep 3

echo "Starting NpmGuard Engine Worker..."
uv run python src/npmguard/main.py &
WORKER_PID=$!

echo "Starting NpmGuard API Server..."
uv run python src/npmguard/api.py &
API_PID=$!

cleanup() {
    echo ""
    echo "Shutting down all services..."

    # Kill entire process groups (uv wrappers + their child python processes)
    kill -- -$API_PID 2>/dev/null || kill $API_PID 2>/dev/null || true
    kill -- -$WORKER_PID 2>/dev/null || kill $WORKER_PID 2>/dev/null || true
    kill -- -$TEMPORAL_PID 2>/dev/null || kill $TEMPORAL_PID 2>/dev/null || true

    # Also kill any orphaned children by name as a safety net
    pkill -f "src/npmguard/api.py" 2>/dev/null || true
    pkill -f "src/npmguard/main.py" 2>/dev/null || true

    # Wait for processes to exit
    wait $API_PID $WORKER_PID $TEMPORAL_PID 2>/dev/null || true
    echo "Done!"
    exit 0
}

# Trap CTRL-C (SIGINT) and termination (SIGTERM)
trap cleanup SIGINT SIGTERM

echo ""
echo "🚀 All services are running! Press Ctrl-C to stop."
echo "   - API Endpoint:    http://localhost:8000"
echo "   - API Docs:        http://localhost:8000/docs"
echo "   - Temporal Web UI: http://localhost:8233"
echo ""

# Keep the script running nicely
wait
