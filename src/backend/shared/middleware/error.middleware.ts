import { Request, Response, NextFunction } from 'express'; // ^4.18.2
import { ApiError } from '../errors/api.error';
import { Logger } from '../utils/logger';

// Initialize logger for error middleware
const logger = new Logger('ErrorMiddleware');

// Error rate tracking for DOS protection
const errorRateTracker = new Map<string, { count: number; timestamp: number }>();
const ERROR_RATE_WINDOW = 60000; // 1 minute
const ERROR_RATE_LIMIT = 100; // Max errors per window

// Circuit breaker state
let circuitBreakerTripped = false;
let lastCircuitBreakerCheck = Date.now();
const CIRCUIT_BREAKER_TIMEOUT = 300000; // 5 minutes

/**
 * Centralized error handling middleware for Express applications
 * Implements comprehensive error processing, logging, and system protection
 */
export const errorMiddleware = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Generate unique correlation ID for error tracking
  const correlationId = `err-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  logger.setCorrelationId(correlationId);

  // Check error rate for DOS protection
  const clientIp = req.ip;
  const now = Date.now();
  const clientErrors = errorRateTracker.get(clientIp) || { count: 0, timestamp: now };

  if (now - clientErrors.timestamp > ERROR_RATE_WINDOW) {
    clientErrors.count = 1;
    clientErrors.timestamp = now;
  } else {
    clientErrors.count++;
  }
  errorRateTracker.set(clientIp, clientErrors);

  // Check if client has exceeded error rate limit
  if (clientErrors.count > ERROR_RATE_LIMIT) {
    logger.warn('Error rate limit exceeded', { clientIp, correlationId });
    res.status(429).json({
      statusCode: 429,
      errorCode: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many errors. Please try again later.',
      correlationId
    });
    return;
  }

  // Check circuit breaker status
  if (now - lastCircuitBreakerCheck > CIRCUIT_BREAKER_TIMEOUT) {
    circuitBreakerTripped = false;
    lastCircuitBreakerCheck = now;
  }

  if (circuitBreakerTripped) {
    logger.error('Circuit breaker active', { correlationId });
    res.status(503).json({
      statusCode: 503,
      errorCode: 'SERVICE_UNAVAILABLE',
      message: 'Service temporarily unavailable',
      correlationId
    });
    return;
  }

  // Convert error to ApiError if needed
  const apiError = error instanceof ApiError
    ? error
    : ApiError.internal(
        'An unexpected error occurred',
        { originalError: error.message }
      );

  // Log error with request context
  logger.error(
    apiError.message,
    error,
    {
      correlationId,
      path: req.path,
      method: req.method,
      query: req.query,
      body: req.body,
      isOperational: apiError.isOperational,
      statusCode: apiError.statusCode
    }
  );

  // Trip circuit breaker for critical errors
  if (!apiError.isOperational && error.stack?.includes('FATAL')) {
    circuitBreakerTripped = true;
    lastCircuitBreakerCheck = now;
  }

  // Send error response
  const errorResponse = apiError.toJSON();
  errorResponse.correlationId = correlationId;

  res.status(apiError.statusCode).json(errorResponse);
  logger.clearCorrelationId();
};

/**
 * Global handler for unhandled promise rejections
 * Implements enhanced error tracking and system protection
 */
export const handleUnhandledRejection = (error: Error): void => {
  const correlationId = `unhandled-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  logger.setCorrelationId(correlationId);

  logger.error(
    'Unhandled Promise Rejection',
    error,
    {
      correlationId,
      type: 'UnhandledRejection',
      timestamp: new Date().toISOString()
    }
  );

  // Check if error is critical
  if (error.stack?.includes('FATAL')) {
    circuitBreakerTripped = true;
    lastCircuitBreakerCheck = Date.now();
    
    // Initiate graceful shutdown
    process.exit(1);
  }

  logger.clearCorrelationId();
};

/**
 * Global handler for uncaught exceptions
 * Implements system protection measures and graceful shutdown
 */
export const handleUncaughtException = (error: Error): void => {
  const correlationId = `uncaught-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  logger.setCorrelationId(correlationId);

  logger.error(
    'Uncaught Exception',
    error,
    {
      correlationId,
      type: 'UncaughtException',
      timestamp: new Date().toISOString(),
      pid: process.pid
    }
  );

  // Trip circuit breaker
  circuitBreakerTripped = true;
  lastCircuitBreakerCheck = Date.now();

  // Initiate graceful shutdown
  logger.info('Initiating graceful shutdown due to uncaught exception');
  
  // Allow pending requests to complete (30 second timeout)
  setTimeout(() => {
    process.exit(1);
  }, 30000);

  logger.clearCorrelationId();
};

// Register global handlers
process.on('unhandledRejection', handleUnhandledRejection);
process.on('uncaughtException', handleUncaughtException);