// External dependencies
import express, { Application } from 'express'; // v4.18.2
import cors from 'cors'; // v2.8.5
import helmet from 'helmet'; // v7.0.0
import morgan from 'morgan'; // v1.10.0
import { Container } from 'inversify'; // v6.0.1
import { InversifyExpressServer } from 'inversify-express-utils'; // v6.3.2
import pino from 'pino'; // v8.16.0
import { expressjwt } from 'express-jwt'; // v8.4.1
import { createTerminus } from '@godaddy/terminus'; // v4.12.1
import promClient from 'prom-client'; // v14.2.0
import CircuitBreaker from 'opossum'; // v7.1.0

// Internal imports
import { config } from './config';
import { CoachController } from './controllers/coach.controller';
import { authenticate, authorize } from '../../shared/middleware/auth.middleware';
import { errorMiddleware, handleUnhandledRejection, handleUncaughtException } from '../../shared/middleware/error.middleware';
import { validateSchema } from '../../shared/middleware/validation.middleware';
import { ROLES } from '../../shared/constants';

// Initialize metrics
const metrics = new promClient.Registry();
metrics.setDefaultLabels({ service: 'coach-service' });
promClient.collectDefaultMetrics({ register: metrics });

// Initialize logger
const logger = pino({
  name: 'coach-service',
  level: config.logging.level,
  timestamp: pino.stdTimeFunctions.isoTime
});

/**
 * Configure comprehensive middleware stack
 */
function setupMiddleware(app: Application): void {
  // Security middleware
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"]
      }
    },
    xssFilter: true,
    noSniff: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    }
  }));

  // CORS configuration
  app.use(cors({
    origin: config.service.env === 'production' ? 
      [/\.video-coaching-platform\.com$/] : '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    maxAge: 86400
  }));

  // Request parsing
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // Logging
  app.use(morgan('combined'));

  // Metrics endpoint
  app.get('/metrics', async (req, res) => {
    res.set('Content-Type', metrics.contentType);
    res.end(await metrics.metrics());
  });

  // Authentication middleware
  app.use(expressjwt({
    secret: config.security.jwt.secret,
    algorithms: ['HS256'],
    requestProperty: 'user'
  }).unless({ path: ['/health', '/metrics'] }));
}

/**
 * Configure dependency injection container
 */
function setupContainer(): Container {
  const container = new Container();

  // Bind configuration
  container.bind('Config').toConstantValue(config);
  container.bind('Logger').toConstantValue(logger);

  // Bind controllers
  container.bind(CoachController).toSelf();

  return container;
}

/**
 * Configure health checks
 */
function setupHealthChecks(app: Application): void {
  const healthCheck = async () => {
    // Add service-specific health checks here
    return {
      uptime: process.uptime(),
      timestamp: Date.now(),
      status: 'healthy'
    };
  };

  createTerminus(app, {
    healthChecks: {
      '/health': healthCheck,
      '/health/liveness': async () => Promise.resolve(),
      '/health/readiness': healthCheck
    },
    timeout: 5000,
    signal: 'SIGTERM'
  });
}

/**
 * Configure circuit breaker for external service calls
 */
function setupCircuitBreaker(): CircuitBreaker {
  return new CircuitBreaker(async (request: any) => request, {
    timeout: 3000,
    errorThresholdPercentage: 50,
    resetTimeout: 30000,
    name: 'external-services'
  });
}

/**
 * Initialize and start the application
 */
async function startServer(): Promise<void> {
  try {
    // Create Express application
    const container = setupContainer();
    const server = new InversifyExpressServer(container);

    server.setConfig((app) => {
      setupMiddleware(app);
      setupHealthChecks(app);
    });

    const app = server.build();

    // Error handling middleware
    app.use(errorMiddleware);

    // Global error handlers
    process.on('unhandledRejection', handleUnhandledRejection);
    process.on('uncaughtException', handleUncaughtException);

    // Start server
    const port = config.service.port;
    app.listen(port, () => {
      logger.info(`Coach service started on port ${port}`, {
        env: config.service.env,
        nodeVersion: process.version
      });
    });
  } catch (error) {
    logger.error('Failed to start server', error);
    process.exit(1);
  }
}

// Start the server
startServer();

// Export for testing
export { setupContainer, setupMiddleware, setupHealthChecks };