#!/bin/bash

# Production deployment script
echo "Starting Knowledge Graph Viewer in production mode..."

# Load production environment
set -a
source config/.env.production
set +a

# Build and start services in detached mode
docker-compose --env-file config/.env.production down
docker-compose --env-file config/.env.production up --build -d

echo "Services started in background. Check status with: docker-compose ps"