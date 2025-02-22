import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { Logger } from '../../../shared/utils/logger';

// Initialize logger with service context
const logger = new Logger('ApiGateway');

// Headers that should be masked in logs
const SENSITIVE_HEADERS = ['authorization', 'cookie', 'x-api-key'];

/**
 * Express middleware for comprehensive request/response logging with ELK Stack integration
 * Provides request correlation, timing, and detailed metadata for monitoring
 * @version 1.0.0
 */
export const requestLoggingMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Generate unique request ID for correlation
  const requestId = uuidv4();
  
  // Add correlation ID to response headers
  res.setHeader('x-request-id', requestId);
  
  // Set correlation ID in logger
  logger.setCorrelationId(requestId);
  
  // Record request start time with high precision
  const startTime = process.hrtime();

  // Log initial request
  logger.info('Incoming request', formatRequestLog(req, requestId));

  // Intercept response finish event
  res.on('finish', () => {
    // Calculate request duration in milliseconds
    const [seconds, nanoseconds] = process.hrtime(startTime);
    const duration = seconds * 1000 + nanoseconds / 1000000;

    // Log response details
    logger.info(
      'Request completed',
      formatResponseLog(res, requestId, duration)
    );

    // Clear correlation ID
    logger.clearCorrelationId();
  });

  // Error handling
  res.on('error', (error: Error) => {
    logger.error(
      'Request failed',
      error,
      {
        requestId,
        path: req.path,
        method: req.method,
        duration: process.hrtime(startTime)[0] * 1000
      }
    );
    logger.clearCorrelationId();
  });

  next();
};

/**
 * Formats request details into structured log object for ELK
 */
const formatRequestLog = (req: Request, requestId: string): object => {
  const { method, path, ip, headers, query, body } = req;

  return {
    requestId,
    timestamp: new Date().toISOString(),
    type: 'request',
    http: {
      method,
      path,
      query,
      headers: sanitizeHeaders(headers)
    },
    client: {
      ip,
      userAgent: headers['user-agent']
    },
    user: req.user ? {
      id: (req.user as any).id,
      role: (req.user as any).role
    } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    service: {
      name: 'api-gateway',
      environment: process.env.NODE_ENV,
      version: process.env.npm_package_version
    }
  };
};

/**
 * Formats response details into structured log object for ELK
 */
const formatResponseLog = (
  res: Response,
  requestId: string,
  duration: number
): object => {
  const { statusCode, getHeaders } = res;

  return {
    requestId,
    timestamp: new Date().toISOString(),
    type: 'response',
    http: {
      statusCode,
      status: statusCode < 400 ? 'success' : 'error',
      headers: sanitizeHeaders(getHeaders()),
    },
    performance: {
      duration: Math.round(duration),
      durationUnit: 'ms'
    },
    error: statusCode >= 400 ? {
      code: statusCode,
      type: getErrorType(statusCode)
    } : undefined,
    service: {
      name: 'api-gateway',
      environment: process.env.NODE_ENV,
      version: process.env.npm_package_version
    }
  };
};

/**
 * Sanitizes headers by masking sensitive values
 */
const sanitizeHeaders = (headers: any): object => {
  const sanitized = { ...headers };

  SENSITIVE_HEADERS.forEach(header => {
    if (sanitized[header]) {
      sanitized[header] = '***MASKED***';
    }
  });

  return sanitized;
};

/**
 * Maps HTTP status codes to error types
 */
const getErrorType = (statusCode: number): string => {
  switch (statusCode) {
    case 400:
      return 'BAD_REQUEST';
    case 401:
      return 'UNAUTHORIZED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 429:
      return 'RATE_LIMITED';
    default:
      return statusCode >= 500 ? 'SERVER_ERROR' : 'CLIENT_ERROR';
  }
};