# Stage 1: Builder
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy package files
COPY src/backend/chat-service/package*.json ./
COPY src/backend/chat-service/tsconfig.json ./
COPY src/backend/tsconfig.json ../tsconfig.json

# Install all dependencies including dev dependencies
RUN npm ci

# Copy source code
COPY src/backend/chat-service/src ./src

# Build TypeScript code
RUN npm run build

# Prune dev dependencies
RUN npm prune --production

# Stage 2: Production
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Create non-root user/group
RUN addgroup -S chatapp && adduser -S chatapp -G chatapp

# Install production dependencies
RUN apk add --no-cache tini

# Set environment variables
ENV NODE_ENV=production \
    PORT=3000 \
    SOCKET_TIMEOUT=30000 \
    MAX_CONNECTIONS=1000

# Copy built artifacts and dependencies from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Set proper permissions
RUN chown -R chatapp:chatapp /app && \
    chmod -R 755 /app

# Configure security
RUN mkdir -p /app/logs && \
    chown -R chatapp:chatapp /app/logs && \
    chmod -R 755 /app/logs

# Set resource limits
RUN ulimit -n 65536

# Add labels
LABEL maintainer="DevOps Team" \
      service="chat-service" \
      version="1.0.0"

# Switch to non-root user
USER chatapp

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Use tini as init
ENTRYPOINT ["/sbin/tini", "--"]

# Start the application
CMD ["node", "dist/app.js"]

# Security options
SECURITY_OPT ["no-new-privileges:true"]

# Drop all capabilities except what's needed
CAPABILITY_DROP ALL
CAPABILITY_ADD NET_BIND_SERVICE

# Set read-only root filesystem
VOLUME ["/app/logs"]
READONLY_ROOTFS true

# Clean up
RUN npm cache clean --force && \
    rm -rf /tmp/* ~/.npm