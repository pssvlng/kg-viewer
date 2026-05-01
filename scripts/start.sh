#!/bin/bash

# Start Knowledge Graph Viewer
#
# Usage:
#   ./scripts/start.sh              # start with defaults (good for local dev)
#   source config/setup-env.sh && ./scripts/start.sh   # start with production env vars
#
# To stop: docker compose down

set -e

echo "Building and starting Knowledge Graph Viewer..."
docker compose pull --ignore-pull-failures 2>/dev/null || true
docker compose up --build -d

echo ""
echo "App is running at http://$(hostname -f 2>/dev/null || echo localhost)"
echo "Check status : docker compose ps"
echo "Follow logs  : docker compose logs -f"
echo "Stop         : docker compose down"
