import { HttpStatus } from '@nestjs/common'; // v10.0.0

/**
 * Standardized error codes for consistent error categorization across the application
 */
export enum ERROR_CODES {
  BAD_REQUEST = 'BAD_REQUEST',
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED'
}

/**
 * Base error class for standardized API error handling across all microservices
 * Implements comprehensive error tracking and secure error information exposure
 */
export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly errorCode: string;
  public readonly timestamp: string;
  public readonly path?: string;
  public readonly traceId: string;
  public readonly details?: Record<string, any>;
  public readonly isOperational: boolean;

  /**
   * Creates a new API error instance with comprehensive error details
   * @param message - Human readable error message
   * @param statusCode - HTTP status code
   * @param errorCode - Standardized error code from ERROR_CODES enum
   * @param details - Additional error context (will be filtered for sensitive data)
   * @param isOperational - Indicates if error is operational (true) or programming error (false)
   */
  constructor(
    message: string,
    statusCode: number,
    errorCode: string,
    details?: Record<string, any>,
    isOperational: boolean = true
  ) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.timestamp = new Date().toISOString();
    this.traceId = this.generateTraceId();
    this.isOperational = isOperational;

    if (details) {
      this.details = this.filterSensitiveData(details);
    }

    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Converts error instance to a standardized JSON response format
   * Ensures proper filtering of sensitive information
   */
  public toJSON(): Record<string, any> {
    const errorResponse: Record<string, any> = {
      statusCode: this.statusCode,
      errorCode: this.errorCode,
      message: this.message,
      timestamp: this.timestamp,
      traceId: this.traceId
    };

    if (this.path) {
      errorResponse.path = this.path;
    }

    if (this.details) {
      errorResponse.details = this.details;
    }

    // Include stack trace only in development environment
    if (process.env.NODE_ENV === 'development') {
      errorResponse.stack = this.stack;
    }

    return errorResponse;
  }

  /**
   * Creates a bad request error with validation details
   */
  public static badRequest(message: string, details?: Record<string, any>): ApiError {
    return new ApiError(
      message,
      HttpStatus.BAD_REQUEST,
      ERROR_CODES.BAD_REQUEST,
      details,
      true
    );
  }

  /**
   * Creates an unauthorized error with security context
   */
  public static unauthorized(message: string, details?: Record<string, any>): ApiError {
    return new ApiError(
      message,
      HttpStatus.UNAUTHORIZED,
      ERROR_CODES.UNAUTHORIZED,
      details,
      true
    );
  }

  /**
   * Creates a forbidden error with permission context
   */
  public static forbidden(message: string, details?: Record<string, any>): ApiError {
    return new ApiError(
      message,
      HttpStatus.FORBIDDEN,
      ERROR_CODES.FORBIDDEN,
      details,
      true
    );
  }

  /**
   * Creates a not found error with resource context
   */
  public static notFound(message: string, details?: Record<string, any>): ApiError {
    return new ApiError(
      message,
      HttpStatus.NOT_FOUND,
      ERROR_CODES.NOT_FOUND,
      details,
      true
    );
  }

  /**
   * Creates an internal server error with safe error details
   */
  public static internal(message: string, details?: Record<string, any>): ApiError {
    // Log full error details securely before filtering
    console.error('Internal Server Error:', {
      message,
      details,
      timestamp: new Date().toISOString()
    });

    return new ApiError(
      message,
      HttpStatus.INTERNAL_SERVER_ERROR,
      ERROR_CODES.INTERNAL_ERROR,
      details,
      false
    );
  }

  /**
   * Generates a unique trace ID for error tracking
   */
  private generateTraceId(): string {
    return `err-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Filters sensitive information from error details
   */
  private filterSensitiveData(data: Record<string, any>): Record<string, any> {
    const sensitiveFields = [
      'password',
      'token',
      'secret',
      'apiKey',
      'creditCard',
      'ssn',
      'authorization'
    ];

    return Object.entries(data).reduce((filtered, [key, value]) => {
      if (!sensitiveFields.includes(key.toLowerCase())) {
        filtered[key] = value;
      }
      return filtered;
    }, {} as Record<string, any>);
  }
}