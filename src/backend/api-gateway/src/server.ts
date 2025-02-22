import http from 'http';
import app from './app';
import { config } from './config';
import { Logger } from '../../shared/utils/logger';
import { metrics } from '../../shared/utils/metrics';

// Initialize logger
const logger = new Logger('ApiGateway');

// Track active connections for graceful shutdown
const activeConnections = new Map<string, http.Socket>();
let isShuttingDown = false;

/**
 * Initialize and start HTTP server with retry logic
 */
async function startServer(): Promise<void> {
  try {
    // Create HTTP server instance
    const server = http.createServer(app);

    // Configure server timeouts
    server.timeout = config.server.timeout;
    server.keepAliveTimeout = config.server.timeout;
    server.headersTimeout = config.server.timeout + 1000;
    server.maxConnections = config.server.maxConnections;

    // Track connections for graceful shutdown
    server.on('connection', (socket: http.Socket) => {
      const id = `${socket.remoteAddress}:${socket.remotePort}`;
      activeConnections.set(id, socket);

      socket.on('close', () => {
        activeConnections.delete(id);
        metrics.recordMetric('active_connections', activeConnections.size);
      });

      metrics.recordMetric('active_connections', activeConnections.size);
    });

    // Start server with retry logic
    let retries = 0;
    const maxRetries = 5;

    while (retries < maxRetries) {
      try {
        await new Promise<void>((resolve, reject) => {
          server.listen(config.server.port, config.server.host, () => {
            logger.info('API Gateway server started', {
              port: config.server.port,
              host: config.server.host,
              env: config.app.env,
              version: config.app.version
            });
            resolve();
          });

          server.once('error', (error: NodeJS.ErrnoException) => {
            if (error.code === 'EADDRINUSE') {
              logger.warn(`Port ${config.server.port} is in use, retrying...`);
              reject(error);
            } else {
              logger.error('Server startup error', error);
              reject(error);
            }
          });
        });
        break;
      } catch (error) {
        retries++;
        if (retries === maxRetries) {
          throw new Error(`Failed to start server after ${maxRetries} attempts`);
        }
        await new Promise(resolve => setTimeout(resolve, 1000 * retries));
      }
    }

    // Initialize health monitoring
    if (config.services.healthCheck.enabled) {
      setInterval(() => {
        const healthStatus = {
          status: 'ok',
          timestamp: new Date().toISOString(),
          connections: activeConnections.size,
          uptime: process.uptime()
        };
        metrics.recordMetric('health_check', healthStatus);
      }, config.services.healthCheck.interval);
    }

  } catch (error) {
    logger.error('Failed to start API Gateway server', error as Error);
    process.exit(1);
  }
}

/**
 * Graceful shutdown handler
 */
async function handleShutdown(signal: string): Promise<void> {
  try {
    if (isShuttingDown) {
      logger.warn('Shutdown already in progress');
      return;
    }

    isShuttingDown = true;
    logger.info(`Received ${signal}, starting graceful shutdown`);

    // Stop accepting new connections
    server.close(() => {
      logger.info('HTTP server closed');
    });

    // Set connection draining timeout
    const drainTimeout = setTimeout(() => {
      logger.warn('Connection draining timeout reached, forcing shutdown');
      process.exit(1);
    }, config.server.timeout);

    // Close all active connections
    for (const [id, socket] of activeConnections) {
      socket.destroy();
      activeConnections.delete(id);
      metrics.recordMetric('active_connections', activeConnections.size);
    }

    clearTimeout(drainTimeout);
    logger.info('Graceful shutdown completed');
    process.exit(0);

  } catch (error) {
    logger.error('Error during shutdown', error as Error);
    process.exit(1);
  }
}

/**
 * Setup process event handlers
 */
function setupProcessHandlers(): void {
  // Handle uncaught exceptions
  process.on('uncaughtException', (error: Error) => {
    logger.error('Uncaught exception', error);
    metrics.recordMetric('uncaught_exceptions', 1);
    handleShutdown('SIGTERM').catch(() => process.exit(1));
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason: any) => {
    logger.error('Unhandled rejection', reason);
    metrics.recordMetric('unhandled_rejections', 1);
  });

  // Handle shutdown signals
  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));
}

// Initialize server if not in test environment
if (process.env.NODE_ENV !== 'test') {
  setupProcessHandlers();
  startServer().catch(error => {
    logger.error('Server initialization failed', error as Error);
    process.exit(1);
  });
}

// Export server instance for testing
export const server = http.createServer(app);