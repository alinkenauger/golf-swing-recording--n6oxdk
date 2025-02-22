import winston from 'winston'; // ^3.11.0
import morgan from 'morgan'; // ^1.10.0
import { Logger } from '../../shared/utils/logger';
import { API_STATUS_CODES } from '../../shared/constants';

// Initialize base logger with API Gateway context
const baseLogger = new Logger('ApiGateway');

// Performance monitoring thresholds (ms)
const PERFORMANCE_THRESHOLDS = {
  slow: 1000,    // 1 second
  critical: 5000 // 5 seconds
} as const;

// Headers that should be masked in logs
const SENSITIVE_HEADERS = [
  'authorization',
  'cookie',
  'x-api-key',
  'x-session-id',
  'x-access-token'
] as const;

// Custom log format for structured API logging
const LOG_FORMAT = winston.format.combine(
  winston.format.timestamp(),
  winston.format.json(),
  winston.format.metadata({
    fillWith: ['timestamp', 'correlationId', 'method', 'path', 'status', 'duration']
  })
);

/**
 * Enhanced API Gateway logger with request tracing and performance monitoring
 */
class ApiGatewayLogger {
  private performanceMetrics: Map<string, number>;
  private rateLimitMetrics: Map<string, number>;

  constructor() {
    this.performanceMetrics = new Map();
    this.rateLimitMetrics = new Map();
  }

  /**
   * Logs incoming API request with correlation tracking
   * @param request - Express/Fastify request object
   * @param correlationId - Request correlation ID
   */
  public logApiRequest(request: any, correlationId: string): void {
    const startTime = Date.now();
    this.performanceMetrics.set(correlationId, startTime);

    const maskedHeaders = this.maskSensitiveData(request.headers, SENSITIVE_HEADERS);
    const maskedQuery = this.maskSensitiveData(request.query, ['token', 'key']);

    baseLogger.info('API Request', {
      correlationId,
      method: request.method,
      path: request.path,
      query: maskedQuery,
      headers: maskedHeaders,
      clientIp: request.ip,
      userAgent: request.headers['user-agent']
    });
  }

  /**
   * Logs API response with performance metrics
   * @param response - Express/Fastify response object
   * @param correlationId - Request correlation ID
   * @param duration - Request duration in milliseconds
   */
  public logApiResponse(response: any, correlationId: string, duration: number): void {
    const startTime = this.performanceMetrics.get(correlationId);
    if (!startTime) return;

    const responseTime = Date.now() - startTime;
    this.performanceMetrics.delete(correlationId);

    // Track rate limiting metrics
    const remainingRequests = response.headers['x-ratelimit-remaining'];
    if (remainingRequests) {
      this.rateLimitMetrics.set(correlationId, parseInt(remainingRequests));
    }

    // Performance categorization
    let performanceLevel = 'normal';
    if (responseTime > PERFORMANCE_THRESHOLDS.critical) {
      performanceLevel = 'critical';
    } else if (responseTime > PERFORMANCE_THRESHOLDS.slow) {
      performanceLevel = 'slow';
    }

    baseLogger.info('API Response', {
      correlationId,
      status: response.statusCode,
      duration: responseTime,
      performanceLevel,
      size: response.headers['content-length'],
      rateLimit: {
        remaining: remainingRequests,
        limit: response.headers['x-ratelimit-limit']
      }
    });

    // Alert on slow responses
    if (performanceLevel !== 'normal') {
      baseLogger.warn('Slow API Response', {
        correlationId,
        duration: responseTime,
        threshold: performanceLevel === 'critical' ? 
          PERFORMANCE_THRESHOLDS.critical : 
          PERFORMANCE_THRESHOLDS.slow
      });
    }
  }

  /**
   * Logs API errors with security context
   * @param error - Error object
   * @param correlationId - Request correlation ID
   * @param context - Additional error context
   */
  public logApiError(error: Error, correlationId: string, context: any = {}): void {
    const errorContext = {
      correlationId,
      errorCode: error.name,
      errorMessage: error.message,
      stackTrace: error.stack,
      ...context
    };

    // Enhance security-related errors
    if (error.name === 'AuthenticationError' || error.name === 'AuthorizationError') {
      errorContext.securityEvent = true;
      errorContext.severity = 'high';
      
      if (context.user) {
        errorContext.userId = context.user.id;
        errorContext.userRole = context.user.role;
      }
    }

    baseLogger.error('API Error', error, errorContext);

    // Track error metrics
    if (errorContext.securityEvent) {
      // Additional security monitoring could be added here
      baseLogger.warn('Security Event Detected', {
        correlationId,
        type: error.name,
        path: context.path
      });
    }
  }

  /**
   * Masks sensitive data in objects
   * @param data - Object containing potentially sensitive data
   * @param fieldsToMask - Array of field names to mask
   * @returns Masked copy of the data
   */
  public maskSensitiveData(data: any, fieldsToMask: readonly string[]): any {
    if (!data || typeof data !== 'object') {
      return data;
    }

    const maskedData = Array.isArray(data) ? [...data] : { ...data };

    for (const [key, value] of Object.entries(maskedData)) {
      if (fieldsToMask.includes(key.toLowerCase())) {
        maskedData[key] = '***MASKED***';
      } else if (typeof value === 'object') {
        maskedData[key] = this.maskSensitiveData(value, fieldsToMask);
      }
    }

    return maskedData;
  }

  /**
   * Creates a morgan middleware instance with correlation tracking
   */
  public createRequestLogger(): any {
    return morgan((tokens: any, req: any, res: any) => {
      const correlationId = req.headers['x-correlation-id'];
      const duration = tokens['response-time'](req, res);
      
      this.logApiResponse(res, correlationId, parseInt(duration));
      
      return null; // Prevent morgan from logging to console
    });
  }
}

// Export singleton instance
export const apiLogger = new ApiGatewayLogger();