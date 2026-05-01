FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install uv
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:${PATH}"

# Copy dependency metadata first for better caching
COPY pyproject.toml uv.lock* ./

# Install project dependencies from pyproject/lock
RUN uv sync --frozen --no-dev || uv sync --no-dev

# Copy application code
COPY . .

# Run as non-root for security
RUN useradd -m -u 1001 appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 5000

# Use gunicorn for production; number of workers configurable via GUNICORN_WORKERS
CMD ["uv", "run", "gunicorn", \
    "--workers", "1", \
    "--worker-class", "gthread", \
    "--threads", "4", \
    "--bind", "0.0.0.0:5000", \
    "--timeout", "120", \
    "--access-logfile", "-", \
    "--error-logfile", "-", \
    "--log-level", "info", \
    "app:app"]