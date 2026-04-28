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

EXPOSE 5000

CMD ["uv", "run", "python", "app.py"]