#!/bin/bash

# Development deployment script
echo "Starting Knowledge Graph Viewer in development mode..."

# Load development environment
set -a
source config/.env.development
set +a

# Build and start services
docker-compose --env-file config/.env.development down
docker-compose --env-file config/.env.development up --build -d

echo "Services started in detached mode:"
echo "- Frontend: http://localhost:4200"
echo "- Backend API: http://localhost:5000"
echo "- Virtuoso SPARQL: http://localhost:8890"
echo "- LODView: http://localhost:8080"
echo ""
echo "To view logs, run: docker-compose logs -f"
echo "To stop services, run: docker-compose down"