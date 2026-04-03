# Full-stack devcontainer: Python 3.12 + Node 22 for backend & frontend dev
FROM python:3.12-slim

# ---- System packages ----
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    git \
    gnupg \
    apt-transport-https \
    zsh \
    procps \
    build-essential \
    libpq-dev \
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# ---- Google Cloud CLI (gcloud) ----
RUN curl -fsSL https://packages.cloud.google.com/apt/doc/apt-key.gpg \
      | gpg --dearmor -o /usr/share/keyrings/cloud.google.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] https://packages.cloud.google.com/apt cloud-sdk main" \
      > /etc/apt/sources.list.d/google-cloud-sdk.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends google-cloud-cli \
    && rm -rf /var/lib/apt/lists/*

# ---- Cloud SQL Auth Proxy (cloud-sql-proxy) ----
ARG CLOUD_SQL_PROXY_VERSION=2.21.0
RUN curl -fsSL -o /usr/local/bin/cloud-sql-proxy \
      "https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v${CLOUD_SQL_PROXY_VERSION}/cloud-sql-proxy.linux.amd64" \
    && chmod +x /usr/local/bin/cloud-sql-proxy

# ---- Node.js 22 (LTS) ----
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# ---- Python tooling ----
RUN pip install --no-cache-dir --upgrade pip

WORKDIR /workspace

# ---- Backend dependencies (installed in postCreateCommand too, but cache here) ----
COPY backend/pyproject.toml /tmp/backend-pyproject.toml
RUN pip install --no-cache-dir -e "/tmp/.[dev]" 2>/dev/null || true

# ---- Frontend dependencies (installed in postCreateCommand too) ----
COPY frontend/package.json frontend/package-lock.json* /tmp/frontend/
RUN cd /tmp/frontend && npm install 2>/dev/null || true

# Keep container running
CMD ["sleep", "infinity"]
