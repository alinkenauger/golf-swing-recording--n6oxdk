import { Request, Response, NextFunction } from 'express'; // ^4.18.2
import { ApiError } from '../../shared/errors/api.error';
import { Logger } from '../../shared/utils/logger';

// Initialize logger for API Gateway error handling
const logger = new Logger('ApiGateway');

/**
 * Centralized error handling middleware for API Gateway
 * Processes all errors with comprehensive error categorization, security controls,
 * and standardized response formatting
 */
export const errorMiddleware = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Extract request context for error tracking
  const requestContext = {
    path: req.path,
    method: req.method,
    correlationId: req.headers['x-correlation-id'] as string,
    userAgent: req.headers['user-agent'],
    clientIp: req.ip
  };

  // Set correlation ID for request tracking
  if (requestContext.correlationId) {
    logger.setCorrelationId(requestContext.correlationId);
  }

  try {
    // Convert to ApiError if not already an instance
    let apiError: ApiError;
    if (error instanceof ApiError) {
      apiError = error;
    } else {
      // Handle special error types
      if (error.name === 'RateLimitError') {
        apiError = ApiError.badRequest('Rate limit exceeded', {
          retryAfter: error.message
        });
      } else if (error.name === 'CircuitBreakerError') {
        apiError = ApiError.internal('Service temporarily unavailable', {
          service: error.message
        });
      } else {
        // Convert unknown errors to internal server error
        apiError = ApiError.internal(
          'An unexpected error occurred',
          process.env.NODE_ENV === 'development' ? { originalError: error.message } : undefined
        );
      }
    }

    // Add request context to error
    apiError.path = requestContext.path;

    // Log error with appropriate severity
    const errorMetadata = {
      ...requestContext,
      errorCode: apiError.errorCode,
      statusCode: apiError.statusCode
    };

    if (ApiError.isOperationalError(apiError)) {
      logger.warn('Operational error occurred', errorMetadata);
    } else {
      logger.error('Programming error occurred', error, errorMetadata);
    }

    // Format error response
    const errorResponse = apiError.toJSON();

    // Add security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'none'");

    // Send error response
    res.status(apiError.statusCode).json(errorResponse);
  } catch (err) {
    // Failsafe error handling
    logger.error('Error in error handling middleware', err as Error);
    res.status(500).json({
      statusCode: 500,
      errorCode: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
      timestamp: new Date().toISOString()
    });
  } finally {
    // Clean up correlation ID
    logger.clearCorrelationId();
  }
};