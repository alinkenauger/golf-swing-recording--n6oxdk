# Build stage
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY src/backend/user-service/package*.json ./
COPY src/backend/user-service/tsconfig.json ./
COPY src/backend/tsconfig.json ../tsconfig.json

# Install dependencies including dev dependencies for build
RUN npm ci

# Copy source code
COPY src/backend/user-service/src ./src
COPY src/backend/shared ../shared

# Build TypeScript code
RUN npm run build

# Prune dev dependencies
RUN npm prune --production

# Production stage
FROM node:18-alpine

# Set production environment
ENV NODE_ENV=production
ENV PORT=3000
ENV USER_SERVICE_PORT=3000
ENV NODE_OPTIONS="--max-old-space-size=4096"

# Set working directory
WORKDIR /app

# Create non-root user and group
RUN addgroup -S nodegroup && adduser -S nodeuser -G nodegroup

# Copy built artifacts and dependencies from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Set up security configurations
RUN chown -R nodeuser:nodegroup /app && \
    chmod -R 444 /app && \
    chmod -R 555 /app/dist && \
    chmod -R 555 /app/node_modules

# Create and configure volumes
RUN mkdir -p /tmp && \
    chown -R nodeuser:nodegroup /tmp && \
    chmod -R 755 /tmp

# Switch to non-root user
USER nodeuser

# Configure read-only root filesystem and security options
RUN mkdir -p /app/node_modules/.cache && \
    chown -R nodeuser:nodegroup /app/node_modules/.cache

# Expose service port
EXPOSE 3000

# Health check configuration
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Set resource limits
LABEL maintainer="VideoCoach Platform Team" \
      service="user-service" \
      version="1.0.0" \
      environment="production" \
      security.scan-required="true"

# Drop all capabilities and set security options
RUN apk add --no-cache dumb-init

# Start the service using dumb-init as PID 1
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/app.js"]

# Apply security options at runtime
STOPSIGNAL SIGTERM