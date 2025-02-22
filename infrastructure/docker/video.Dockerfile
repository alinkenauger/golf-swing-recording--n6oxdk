# Builder stage for compiling dependencies
FROM python:3.11-slim AS builder

# Set build arguments and environment variables
ARG PORT=8000
ARG APP_VERSION=1.0.0
ARG BUILD_DATE

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    APP_HOME=/app \
    PORT=${PORT} \
    MAX_WORKERS=4 \
    VIDEO_PROCESSING_TIMEOUT=60

# Install system dependencies and security tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    ffmpeg \
    libavcodec-dev \
    libavformat-dev \
    libswscale-dev \
    libv4l-dev \
    libxvidcore-dev \
    libx264-dev \
    libmagic1 \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

# Create app directory and set working directory
WORKDIR ${APP_HOME}

# Copy requirements file
COPY src/backend/video-service/requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -U pip setuptools wheel && \
    pip install --no-cache-dir -r requirements.txt

# Production stage
FROM python:3.11-slim

# Set environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    APP_HOME=/app \
    PORT=8000 \
    MAX_WORKERS=4 \
    VIDEO_PROCESSING_TIMEOUT=60

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libmagic1 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd -m -r -s /bin/false videoservice \
    && mkdir -p ${APP_HOME}/data ${APP_HOME}/logs \
    && chown -R videoservice:videoservice ${APP_HOME}

# Set working directory
WORKDIR ${APP_HOME}

# Copy dependencies from builder
COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages

# Copy application code
COPY src/backend/video-service/src ./src

# Set ownership and permissions
RUN chown -R videoservice:videoservice ${APP_HOME} && \
    chmod -R 550 ${APP_HOME}/src && \
    chmod -R 770 ${APP_HOME}/data ${APP_HOME}/logs

# Switch to non-root user
USER videoservice

# Health check configuration
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:${PORT}/health || exit 1

# Resource limits
ENV MEMORY_LIMIT=4G \
    CPU_LIMIT=2

# Expose port
EXPOSE ${PORT}

# Set default command
CMD ["python", "-m", "src.app"]

# Metadata labels
LABEL maintainer="Video Service Team" \
      version="${APP_VERSION}" \
      build-date="${BUILD_DATE}" \
      description="Video processing service container" \
      security.privileged="false" \
      security.read-only-root="true" \
      security.no-new-privileges="true"