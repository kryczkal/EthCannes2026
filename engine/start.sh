#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

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
    kill $API_PID 2>/dev/null || true
    kill $WORKER_PID 2>/dev/null || true
    kill $TEMPORAL_PID 2>/dev/null || true
    
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
