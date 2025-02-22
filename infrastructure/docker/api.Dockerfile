# Builder stage
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Install build dependencies and security tools
RUN apk add --no-cache python3 make g++ curl \
    && addgroup -g 1000 node \
    && adduser -u 1000 -G node -s /bin/sh -D node

# Copy package files with correct ownership
COPY --chown=node:node package*.json ./
COPY --chown=node:node tsconfig*.json ./

# Install dependencies with security checks
RUN npm ci --frozen-lockfile \
    && npm audit \
    && npm run security-audit

# Copy source code with strict permissions
COPY --chown=node:node . .

# Build TypeScript code
RUN npm run build \
    && npm prune --production \
    && npm cache clean --force

# Production stage
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Install production dependencies and security updates
RUN apk add --no-cache curl tini \
    && addgroup -g 1000 node \
    && adduser -u 1000 -G node -s /bin/sh -D node \
    && mkdir -p /app/node_modules /app/dist \
    && chown -R node:node /app

# Copy package files and built artifacts
COPY --from=builder --chown=node:node /app/package*.json ./
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/node_modules ./node_modules

# Configure security headers and hardening
RUN echo "kernel.unprivileged_userns_clone=1" >> /etc/sysctl.conf \
    && echo "net.core.somaxconn=65535" >> /etc/sysctl.conf

# Set up monitoring and health checks
COPY --chown=node:node health-check.sh /app/health-check.sh
RUN chmod +x /app/health-check.sh

# Set environment variables
ENV NODE_ENV=production \
    PORT=3000 \
    SECURITY_HEADERS=true \
    MAX_OLD_SPACE_SIZE=2048 \
    GRACEFUL_SHUTDOWN_TIMEOUT=30

# Configure resource limits
ENV NODE_OPTIONS="--max-old-space-size=2048 --max-http-header-size=16384"

# Expose API port
EXPOSE 3000

# Set up volumes
VOLUME ["/app/node_modules", "/tmp"]

# Switch to non-root user
USER node

# Health check configuration
HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=60s \
    CMD ["./health-check.sh"]

# Set security options
SECURITY_OPT ["no-new-privileges=true", "seccomp=unconfined"]

# Use tini as init process
ENTRYPOINT ["/sbin/tini", "--"]

# Start the application
CMD ["node", "dist/server.js"]