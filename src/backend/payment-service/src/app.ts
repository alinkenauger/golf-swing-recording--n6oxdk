import express, { Express, Request, Response, NextFunction } from 'express'; // ^4.18.2
import cors from 'cors'; // ^2.8.5
import helmet from 'helmet'; // ^7.0.0
import morgan from 'morgan'; // ^1.10.0
import mongoose from 'mongoose'; // ^7.5.0
import { Container } from 'inversify'; // ^6.0.1
import { Registry } from 'prom-client'; // ^14.2.0
import rateLimit from 'express-rate-limit'; // ^6.9.0

import { config } from './config';
import { PaymentController } from './controllers/payment.controller';
import { authenticate } from '../../shared/middleware/auth.middleware';
import { ApiError } from '../../shared/errors/api.error';
import { Logger } from '../../shared/utils/logger';

// Initialize logger
const logger = new Logger('PaymentService');

// Initialize Prometheus registry
const metrics = new Registry();
metrics.setDefaultLabels({ service: 'payment-service' });

/**
 * Initialize Express application with comprehensive security measures
 */
function initializeApp(): Express {
  const app = express();

  // Security middleware configuration
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    },
    frameguard: { action: 'deny' },
    noSniff: true,
    xssFilter: true,
    hidePoweredBy: true
  }));

  // CORS configuration with strict options
  app.use(cors({
    origin: config.server.corsOrigin,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['X-Total-Count'],
    credentials: true,
    maxAge: 600 // 10 minutes
  }));

  // Request logging with correlation IDs
  app.use(morgan(':method :url :status :response-time ms - :res[content-length]', {
    stream: {
      write: (message: string) => logger.info('HTTP Request', { message })
    }
  }));

  // Rate limiting configuration
  app.use(rateLimit({
    windowMs: config.server.rateLimiting.windowMs,
    max: config.server.rateLimiting.max,
    message: 'Too many requests from this IP, please try again later'
  }));

  // Body parsing with size limits
  app.use(express.json({ limit: '10kb' }));
  app.use(express.urlencoded({ extended: true, limit: '10kb' }));

  // Metrics endpoint
  app.get('/metrics', async (req: Request, res: Response) => {
    res.set('Content-Type', metrics.contentType);
    res.end(await metrics.metrics());
  });

  // Health check endpoint
  app.get('/health', (req: Request, res: Response) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version
    });
  });

  // Authentication middleware
  app.use(authenticate);

  // Error handling middleware
  app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    if (err instanceof ApiError) {
      logger.error('API Error', err, { path: req.path });
      return res.status(err.statusCode).json(err.toJSON());
    }

    logger.error('Unhandled Error', err, { path: req.path });
    const internalError = ApiError.internal('Internal server error');
    return res.status(500).json(internalError.toJSON());
  });

  return app;
}

/**
 * Initialize database connection with enhanced security
 */
async function connectDatabase(): Promise<void> {
  try {
    const options = {
      ...config.database.options,
      ssl: process.env.NODE_ENV === 'production',
      authSource: 'admin',
      retryWrites: true
    };

    await mongoose.connect(config.database.url, options);
    logger.info('Database connected successfully');
  } catch (error) {
    logger.error('Database connection failed', error as Error);
    process.exit(1);
  }
}

/**
 * Configure dependency injection container
 */
function setupDependencyInjection(): Container {
  const container = new Container();

  // Bind services and controllers
  container.bind<PaymentController>(PaymentController).toSelf();

  return container;
}

/**
 * Start the HTTP server with monitoring
 */
async function startServer(app: Express): Promise<void> {
  try {
    const server = app.listen(config.server.port, () => {
      logger.info('Server started', {
        port: config.server.port,
        environment: process.env.NODE_ENV
      });
    });

    // Graceful shutdown handler
    process.on('SIGTERM', () => {
      logger.info('Received SIGTERM signal, initiating graceful shutdown');
      server.close(() => {
        logger.info('Server closed');
        process.exit(0);
      });
    });
  } catch (error) {
    logger.error('Server startup failed', error as Error);
    process.exit(1);
  }
}

// Initialize and export application
const app = initializeApp();
const container = setupDependencyInjection();

// Start application if not in test environment
if (process.env.NODE_ENV !== 'test') {
  Promise.all([
    connectDatabase(),
    startServer(app)
  ]).catch(error => {
    logger.error('Application startup failed', error as Error);
    process.exit(1);
  });
}

export { app };