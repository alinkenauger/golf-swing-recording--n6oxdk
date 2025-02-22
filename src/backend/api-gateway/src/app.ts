import express, { Application } from 'express'; // ^4.18.2
import helmet from 'helmet'; // ^7.0.0
import cors from 'cors'; // ^2.8.5
import compression from 'compression'; // ^1.7.4
import correlator from 'express-correlation-id'; // ^2.0.1
import Redis from 'ioredis'; // ^5.3.0
import CircuitBreaker from 'circuit-breaker-js'; // ^0.0.1
import { createClient } from 'redis'; // ^4.6.7

import { config } from './config';
import router from './routes';
import { Logger } from '../../shared/utils/logger';
import { errorMiddleware } from './middleware/error.middleware';
import { createRateLimitMiddleware } from './middleware/ratelimit.middleware';
import { requestLoggingMiddleware } from './middleware/logging.middleware';
import { authenticate } from './middleware/auth.middleware';

// Initialize Express application
const app: Application = express();

// Initialize logger
const logger = new Logger('ApiGateway');

// Initialize Redis client for rate limiting
const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  socket: {
    reconnectStrategy: (retries: number) => {
      if (retries > 10) return new Error('Redis connection failed');
      return Math.min(retries * 100, 3000);
    }
  }
});

redisClient.on('error', (err) => logger.error('Redis client error', err));
redisClient.connect().catch(err => logger.error('Redis connection failed', err));

/**
 * Configure application middleware chain
 */
const setupMiddleware = async (app: Application): Promise<void> => {
  // Security headers
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"]
      }
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    }
  }));

  // CORS configuration
  app.use(cors({
    origin: config.server.cors.origins,
    methods: config.server.cors.methods,
    credentials: config.server.cors.credentials,
    maxAge: 86400 // 24 hours
  }));

  // Request parsing
  app.use(express.json({ limit: '100mb' }));
  app.use(express.urlencoded({ extended: true, limit: '100mb' }));

  // Compression
  app.use(compression({
    filter: (req, res) => {
      if (req.headers['x-no-compression']) return false;
      return compression.filter(req, res);
    },
    level: 6
  }));

  // Request correlation
  app.use(correlator());

  // Request logging
  app.use(requestLoggingMiddleware);

  // Rate limiting
  const rateLimitMiddleware = createRateLimitMiddleware(redisClient as any, {
    cleanupInterval: 60000 // 1 minute
  });
  app.use(rateLimitMiddleware);

  // Circuit breaker for downstream services
  const breaker = new CircuitBreaker({
    windowDuration: 10000,
    numBuckets: 10,
    timeoutDuration: 3000,
    errorThreshold: 50,
    volumeThreshold: 10
  });

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: config.app.version,
      environment: config.app.env
    });
  });

  // API routes
  app.use('/api/v1', router);

  // Error handling
  app.use(errorMiddleware);
};

/**
 * Start server with proper error handling and graceful shutdown
 */
const startServer = async (): Promise<void> => {
  try {
    await setupMiddleware(app);

    const server = app.listen(config.server.port, () => {
      logger.info('API Gateway started', {
        port: config.server.port,
        env: config.app.env,
        version: config.app.version
      });
    });

    // Configure server timeouts
    server.keepAliveTimeout = config.server.timeout;
    server.headersTimeout = config.server.timeout + 1000;

    // Graceful shutdown
    const shutdown = async () => {
      logger.info('Shutting down API Gateway...');
      
      server.close(async () => {
        try {
          await redisClient.quit();
          logger.info('Server shutdown complete');
          process.exit(0);
        } catch (error) {
          logger.error('Error during shutdown', error as Error);
          process.exit(1);
        }
      });

      // Force shutdown after timeout
      setTimeout(() => {
        logger.error('Forced shutdown due to timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

  } catch (error) {
    logger.error('Failed to start server', error as Error);
    process.exit(1);
  }
};

// Start server if not in test environment
if (process.env.NODE_ENV !== 'test') {
  startServer().catch(error => {
    logger.error('Server startup failed', error as Error);
    process.exit(1);
  });
}

export { app, startServer };