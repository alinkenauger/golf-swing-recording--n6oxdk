# Build stage
FROM node:18-alpine AS builder

# Install build dependencies
RUN apk add --no-cache \
    git \
    python3 \
    make \
    g++ \
    && rm -rf /var/cache/apk/*

# Set working directory
WORKDIR /app

# Copy package files
COPY src/backend/coach-service/package*.json ./

# Install all dependencies including dev dependencies
RUN npm ci

# Copy TypeScript config and source code
COPY src/backend/coach-service/tsconfig.json ./
COPY src/backend/tsconfig.json ../tsconfig.json
COPY src/backend/coach-service/src ./src

# Build TypeScript code
RUN npm run build

# Run tests and linting
RUN npm run test && npm run lint

# Clean dev dependencies
RUN npm prune --production

# Production stage
FROM node:18-alpine

# Create non-root user/group
RUN addgroup -g 1001 -S node && \
    adduser -u 1001 -S node -G node

# Set working directory
WORKDIR /app

# Copy package files
COPY --chown=node:node src/backend/coach-service/package*.json ./

# Install production dependencies only
RUN npm ci --production && \
    npm cache clean --force

# Copy built files from builder stage
COPY --chown=node:node --from=builder /app/dist ./dist
COPY --chown=node:node --from=builder /app/node_modules ./node_modules

# Security configurations
RUN apk add --no-cache dumb-init && \
    rm -rf /var/cache/apk/* && \
    mkdir -p /app/tmp && \
    chown -R node:node /app && \
    chmod -R 755 /app

# Set environment variables
ENV NODE_ENV=production \
    PORT=3000 \
    GRPC_PORT=50051 \
    LOG_LEVEL=info \
    METRICS_PORT=9090

# Expose ports
EXPOSE 3000 50051 9090

# Configure health checks
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health/live || exit 1

# Set resource limits
LABEL com.kubernetes.resource.cpu="2" \
      com.kubernetes.resource.memory="4Gi" \
      com.kubernetes.resource.ephemeral-storage="1Gi"

# Set security options
RUN chmod a-w /app/dist && \
    chmod a-w /app/node_modules

# Set user
USER node

# Mount points
VOLUME ["/app/node_modules", "/app/tmp"]

# Set read-only filesystem
RUN chmod 755 /app/tmp

# Define entry point
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "dist/app.js"]

# Additional security configurations
LABEL org.opencontainers.image.vendor="VideoCoach" \
      org.opencontainers.image.title="Coach Service" \
      org.opencontainers.image.description="Coach service for managing coach profiles and training programs" \
      org.opencontainers.image.version="1.0.0" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.source="https://github.com/videocoach/coach-service" \
      org.opencontainers.image.licenses="Private"

# Drop all capabilities except those needed
RUN setcap 'cap_net_bind_service=+ep' /usr/local/bin/node

# Set security options
SECURITY_OPT="no-new-privileges:true"