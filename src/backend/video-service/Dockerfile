# Build stage
FROM python:3.11-slim AS builder

# Set build arguments
ARG BUILD_VERSION=latest
ARG BUILD_DATE

# Set Python environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Install system build dependencies with version pinning
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential=12.9 \
    ffmpeg=7:4.* \
    libsm6 \
    libxext6 \
    libgl1-mesa-glx \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user and group
RUN groupadd -r videoservice && useradd -r -g videoservice videoservice

# Set up working directory
WORKDIR /build
COPY requirements.txt .

# Install Python dependencies with pip optimization flags
RUN pip install --no-cache-dir -r requirements.txt

# Runtime stage
FROM python:3.11-slim AS runtime

# Set runtime environment variables
ENV APP_HOME=/app \
    PORT=8000 \
    WORKER_CLASS=uvicorn.workers.UvicornWorker \
    WORKER_CONNECTIONS=1000 \
    TIMEOUT=120 \
    KEEP_ALIVE=5 \
    MAX_REQUESTS=10000 \
    MAX_REQUESTS_JITTER=1000 \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# Install runtime system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg=7:4.* \
    libsm6 \
    libxext6 \
    libgl1-mesa-glx \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user and set up working directory
RUN groupadd -r videoservice && \
    useradd -r -g videoservice videoservice && \
    mkdir -p ${APP_HOME} && \
    chown videoservice:videoservice ${APP_HOME}

WORKDIR ${APP_HOME}

# Copy Python packages from builder
COPY --from=builder /usr/local/lib/python3.11/site-packages/ /usr/local/lib/python3.11/site-packages/
COPY --from=builder /usr/local/bin/ /usr/local/bin/

# Copy application code
COPY --chown=videoservice:videoservice . ${APP_HOME}

# Set OpenContainers labels
LABEL org.opencontainers.image.source="https://github.com/organization/video-coaching-platform" \
      org.opencontainers.image.description="Video processing service container" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.version="${BUILD_VERSION}" \
      org.opencontainers.image.created="${BUILD_DATE}"

# Configure health check
HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=40s \
    CMD curl -f http://localhost:${PORT}/health || exit 1

# Switch to non-root user
USER videoservice

# Expose service port
EXPOSE ${PORT}

# Set entrypoint with optimized worker settings
ENTRYPOINT ["uvicorn", "main:app", \
    "--host", "0.0.0.0", \
    "--port", "8000", \
    "--workers", "4", \
    "--worker-class", "uvicorn.workers.UvicornWorker", \
    "--limit-concurrency", "1000", \
    "--timeout-keep-alive", "5", \
    "--log-level", "info"]