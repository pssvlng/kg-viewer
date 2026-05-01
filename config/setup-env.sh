#!/bin/bash
# =============================================================================
# Knowledge Graph Viewer — Production Environment Setup
# =============================================================================
# Run this script on your production server to set all required environment
# variables, then deploy with:
#
#   source config/setup-env.sh
#   ./scripts/prod.sh
#
# Or add the exports permanently to ~/.bashrc / /etc/environment.
# =============================================================================

# ---- Security ---------------------------------------------------------------
# Virtuoso database admin password. Change this to a strong unique password.
export DBA_PASSWORD="change-me-to-a-strong-password"

# ---- Domain -----------------------------------------------------------------
# Your server's public domain name (hostname only — no protocol prefix).
# DNS A/AAAA records for this domain must point to this server before running
# scripts/init-letsencrypt.sh.
export NGINX_DOMAIN="your-domain.com"

# Enable HTTPS via Let's Encrypt. Set to "false" for plain HTTP (e.g. LAN/testing).
export SSL_ENABLED="true"

# Email used for Let's Encrypt certificate registration and expiry alerts.
export CERT_EMAIL="admin@your-domain.com"

# Full URL prefix used by the backend to build self-referencing URLs.
export DOMAIN="https://${NGINX_DOMAIN}"

export EXTERNAL_FRONTEND_URL="${DOMAIN}"
export EXTERNAL_BACKEND_URL="${DOMAIN}/api"
export EXTERNAL_VIRTUOSO_URL="${DOMAIN}/virtuoso"
export EXTERNAL_LODVIEW_URL="${DOMAIN}/lodview"

# ---- Graph configuration ----------------------------------------------------
# Base URI used when constructing named graph URIs.
export GRAPH_BASE_URI="${DOMAIN}/graph"
export DEFAULT_GRAPH_NAME="default"

# ---- Ports ------------------------------------------------------------------
# Port nginx listens on. Change to 8080 if 80 is already in use.
export HTTP_PORT="80"
export HTTPS_PORT="443"

# ---- SPARQL -----------------------------------------------------------------
# Internal Virtuoso endpoint (container-to-container — do not change unless
# you are running Virtuoso outside Docker).
export VIRTUOSO_URL="http://virtuoso:8890"
export SPARQL_ENDPOINT="http://virtuoso:8890/sparql"

# ---- SPARQL write access ----------------------------------------------------
# Whether anonymous SPARQL UPDATE is allowed via the public endpoint.
# Keep false in production unless you understand the implications.
export SPARQL_UPDATE="false"

# ---- Flask ------------------------------------------------------------------
export FLASK_ENV="production"
export FLASK_DEBUG="false"

# ---- Upload -----------------------------------------------------------------
# Maximum file size (bytes). Default: 1 GB.
export MAX_CONTENT_LENGTH="1073741824"

# Where to persist upload job state: "file" (survives restarts) or "memory".
export UPLOAD_JOBS_STORAGE="file"

echo "Environment variables set for Knowledge Graph Viewer production deployment."
echo "Run: ./scripts/prod.sh"
