# Build stage
FROM node:18-alpine AS builder
LABEL maintainer="platform-team"
LABEL service="payment-service"

# Set working directory
WORKDIR /app

# Install build dependencies with security flags
RUN apk add --no-cache --update \
    python3 \
    make \
    g++ \
    && rm -rf /var/cache/apk/*

# Copy package files with strict permissions
COPY --chown=node:node package*.json ./
COPY --chown=node:node tsconfig*.json ./

# Install dependencies with integrity check and security audit
RUN npm ci --audit=true \
    && npm audit fix \
    && npm cache clean --force

# Copy source code with appropriate permissions
COPY --chown=node:node ./src ./src

# Build TypeScript to JavaScript
RUN npm run build

# Run security scanning on built code
RUN npm audit \
    && rm -rf node_modules \
    && npm ci --production \
    && npm cache clean --force

# Production stage
FROM node:18-alpine
LABEL maintainer="platform-team"
LABEL service="payment-service"
LABEL version="1.0.0"

# Set environment variables
ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=2048 --max-http-header-size=16384 --no-experimental-fetch"
ENV TZ=UTC

# Create non-root user
RUN addgroup -g 1001 nodejs \
    && adduser -u 1001 -G nodejs -s /bin/sh -D nodejs

# Set working directory
WORKDIR /app

# Install production dependencies
RUN apk add --no-cache --update \
    curl \
    tzdata \
    && rm -rf /var/cache/apk/*

# Copy package files and install production dependencies
COPY --chown=nodejs:nodejs package*.json ./
RUN npm ci --production --ignore-scripts \
    && npm cache clean --force

# Copy compiled code from builder
COPY --chown=nodejs:nodejs --from=builder /app/dist ./dist

# Security hardening
RUN chmod -R 550 /app/dist \
    && chmod -R 550 /app/node_modules \
    && chown -R nodejs:nodejs /app

# Configure monitoring and logging
RUN mkdir -p /app/logs \
    && chown -R nodejs:nodejs /app/logs \
    && chmod 750 /app/logs

# Switch to non-root user
USER nodejs

# Health check configuration
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3003/health || exit 1

# Expose service port
EXPOSE 3003

# Set resource limits
ENV NODE_OPTIONS="--max-old-space-size=2048"

# Start application with security flags
CMD ["node", "--no-deprecation", "--no-warnings", "dist/app.js"]