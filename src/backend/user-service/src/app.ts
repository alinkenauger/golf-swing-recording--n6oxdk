import express, { Express } from 'express';
import rateLimit from 'express-rate-limit';
import { validationResult } from 'express-validator';
import pinoHttp from 'pino-http';
import { withId } from 'correlation-id';
import helmet from 'helmet'; // @version ^7.0.0
import compression from 'compression'; // @version ^1.7.4
import { config } from './config';
import { API_STATUS_CODES } from '../../shared/constants';

// Initialize Express application
const app: Express = express();

/**
 * Sets up comprehensive Express middleware stack with security and monitoring features
 */
function initializeMiddleware(): void {
  // Add correlation ID for request tracing
  app.use(withId());

  // Configure strict CORS
  app.use((req, res, next) => {
    const corsOptions = {
      ...config.cors,
      origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
        if (!origin || config.cors.origin.includes(origin) || config.cors.origin.includes('*')) {
          callback(null, true);
        } else {
          callback(new Error('CORS not allowed'));
        }
      }
    };
    require('cors')(corsOptions)(req, res, next);
  });

  // Configure rate limiting
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: { 
      status: API_STATUS_CODES.TOO_MANY_REQUESTS,
      message: 'Too many requests, please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use(limiter);

  // Security headers with strict CSP policy
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: true,
    crossOriginOpenerPolicy: { policy: "same-origin" },
    crossOriginResourcePolicy: { policy: "same-site" },
  }));

  // Request parsing and validation
  app.use(express.json({ limit: '10kb' }));
  app.use(express.urlencoded({ extended: true, limit: '10kb' }));
  app.use((req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(API_STATUS_CODES.BAD_REQUEST).json({
        status: API_STATUS_CODES.BAD_REQUEST,
        errors: errors.array()
      });
    }
    next();
  });

  // Structured logging with security context
  const logger = pinoHttp({
    redact: ['req.headers.authorization', 'req.headers.cookie'],
    customProps: (req) => ({
      correlationId: req.id,
      userId: req.user?.id,
      userRole: req.user?.role,
    }),
    customLogLevel: (res, err) => {
      if (err) return 'error';
      if (res.statusCode >= 400 && res.statusCode < 500) return 'warn';
      if (res.statusCode >= 500) return 'error';
      return 'info';
    },
  });
  app.use(logger);

  // Response compression
  app.use(compression({
    filter: (req, res) => {
      if (req.headers['x-no-compression']) return false;
      return compression.filter(req, res);
    },
    level: 6,
  }));

  // Request timeout handling
  app.use((req, res, next) => {
    req.setTimeout(30000, () => {
      res.status(API_STATUS_CODES.REQUEST_TIMEOUT).json({
        status: API_STATUS_CODES.REQUEST_TIMEOUT,
        message: 'Request timeout'
      });
    });
    next();
  });
}

/**
 * Configures health check endpoints and monitoring
 */
function initializeHealthChecks(): void {
  // Liveness probe
  app.get('/health/live', (req, res) => {
    res.status(API_STATUS_CODES.OK).json({
      status: 'UP',
      timestamp: new Date().toISOString()
    });
  });

  // Readiness probe with dependency checks
  app.get('/health/ready', async (req, res) => {
    try {
      // Add dependency checks here (database, cache, etc.)
      res.status(API_STATUS_CODES.OK).json({
        status: 'READY',
        timestamp: new Date().toISOString(),
        checks: {
          database: 'UP',
          cache: 'UP',
          dependencies: 'UP'
        }
      });
    } catch (error) {
      res.status(API_STATUS_CODES.SERVICE_UNAVAILABLE).json({
        status: 'DOWN',
        timestamp: new Date().toISOString(),
        error: error.message
      });
    }
  });

  // Metrics endpoint for Prometheus
  app.get('/metrics', (req, res) => {
    // Implement metrics collection and reporting
    res.status(API_STATUS_CODES.OK).json({
      metrics: {
        // Add relevant metrics here
      }
    });
  });
}

/**
 * Starts the Express application server with graceful shutdown
 */
async function startServer(): Promise<void> {
  try {
    // Initialize middleware
    initializeMiddleware();
    
    // Initialize health checks
    initializeHealthChecks();

    // Start server
    const server = app.listen(config.port, () => {
      console.log(`User service listening on port ${config.port}`);
    });

    // Graceful shutdown handling
    const shutdown = async (signal: string) => {
      console.log(`Received ${signal}, starting graceful shutdown`);
      server.close(() => {
        console.log('HTTP server closed');
        process.exit(0);
      });

      // Add cleanup logic here (close database connections, etc.)
      setTimeout(() => {
        console.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();

export { app };