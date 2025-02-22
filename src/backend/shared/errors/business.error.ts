import { HttpStatus } from '@nestjs/common'; // v10.0.0
import { ApiError } from './api.error';

/**
 * Standardized business error codes for domain-specific error categorization
 */
export enum BUSINESS_ERROR_CODES {
  INVALID_OPERATION = 'INVALID_OPERATION',
  INSUFFICIENT_FUNDS = 'INSUFFICIENT_FUNDS',
  RESOURCE_LOCKED = 'RESOURCE_LOCKED',
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
  DUPLICATE_ENTRY = 'DUPLICATE_ENTRY',
  INVALID_STATE = 'INVALID_STATE',
  DEPENDENCY_ERROR = 'DEPENDENCY_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  PERMISSION_ERROR = 'PERMISSION_ERROR',
  BUSINESS_RULE_VIOLATION = 'BUSINESS_RULE_VIOLATION'
}

/**
 * Comprehensive error class for handling business logic and domain rule violations
 * Extends ApiError to provide standardized error handling with business context
 */
export class BusinessError extends ApiError {
  public readonly businessCode: string;
  public readonly domain: string;
  public readonly context: Record<string, any>;
  public readonly errorId: string;
  public readonly timestamp: Date;

  /**
   * Creates a new business error instance with comprehensive error context
   * @param message - Human readable error message
   * @param businessCode - Business-specific error code from BUSINESS_ERROR_CODES
   * @param domain - Domain/service where the error occurred
   * @param context - Additional business context (will be sanitized)
   */
  constructor(
    message: string,
    businessCode: string,
    domain: string,
    context?: Record<string, any>
  ) {
    // Map business error to appropriate HTTP status
    const httpStatus = BusinessError.mapToHttpStatus(businessCode);
    
    super(message, httpStatus, businessCode, context);
    
    this.name = 'BusinessError';
    this.businessCode = this.validateBusinessCode(businessCode);
    this.domain = domain;
    this.errorId = this.generateErrorId();
    this.timestamp = new Date();
    this.context = this.sanitizeContext(context || {});
  }

  /**
   * Converts business error to JSON format with secure error exposure
   */
  public toJSON(): Record<string, any> {
    const baseError = super.toJSON();
    
    return {
      ...baseError,
      businessCode: this.businessCode,
      domain: this.domain,
      errorId: this.errorId,
      timestamp: this.timestamp.toISOString(),
      context: this.context
    };
  }

  /**
   * Creates error for invalid business operations
   */
  public static invalidOperation(
    message: string,
    domain: string,
    context?: Record<string, any>
  ): BusinessError {
    return new BusinessError(
      message,
      BUSINESS_ERROR_CODES.INVALID_OPERATION,
      domain,
      context
    );
  }

  /**
   * Creates error for exceeded usage quotas
   */
  public static quotaExceeded(
    message: string,
    domain: string,
    context?: Record<string, any>
  ): BusinessError {
    return new BusinessError(
      message,
      BUSINESS_ERROR_CODES.QUOTA_EXCEEDED,
      domain,
      {
        ...context,
        retryAfter: this.calculateRetryAfter()
      }
    );
  }

  /**
   * Creates error for duplicate resource creation attempts
   */
  public static duplicateEntry(
    message: string,
    domain: string,
    context?: Record<string, any>
  ): BusinessError {
    return new BusinessError(
      message,
      BUSINESS_ERROR_CODES.DUPLICATE_ENTRY,
      domain,
      context
    );
  }

  /**
   * Validates that the business code is defined in BUSINESS_ERROR_CODES
   */
  private validateBusinessCode(code: string): string {
    if (!Object.values(BUSINESS_ERROR_CODES).includes(code as BUSINESS_ERROR_CODES)) {
      throw new Error(`Invalid business error code: ${code}`);
    }
    return code;
  }

  /**
   * Generates a unique error ID for tracking
   */
  private generateErrorId(): string {
    return `biz-${this.domain}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Sanitizes business context to remove sensitive information
   */
  private sanitizeContext(context: Record<string, any>): Record<string, any> {
    const sensitiveFields = [
      'password',
      'token',
      'secret',
      'apiKey',
      'creditCard',
      'ssn',
      'authorization',
      'bankAccount',
      'personalId'
    ];

    return Object.entries(context).reduce((filtered, [key, value]) => {
      if (!sensitiveFields.includes(key.toLowerCase())) {
        filtered[key] = value;
      }
      return filtered;
    }, {} as Record<string, any>);
  }

  /**
   * Maps business error codes to appropriate HTTP status codes
   */
  private static mapToHttpStatus(businessCode: string): number {
    const statusMap: Record<string, number> = {
      [BUSINESS_ERROR_CODES.INVALID_OPERATION]: HttpStatus.BAD_REQUEST,
      [BUSINESS_ERROR_CODES.INSUFFICIENT_FUNDS]: HttpStatus.PAYMENT_REQUIRED,
      [BUSINESS_ERROR_CODES.RESOURCE_LOCKED]: HttpStatus.LOCKED,
      [BUSINESS_ERROR_CODES.QUOTA_EXCEEDED]: HttpStatus.TOO_MANY_REQUESTS,
      [BUSINESS_ERROR_CODES.DUPLICATE_ENTRY]: HttpStatus.CONFLICT,
      [BUSINESS_ERROR_CODES.INVALID_STATE]: HttpStatus.CONFLICT,
      [BUSINESS_ERROR_CODES.DEPENDENCY_ERROR]: HttpStatus.FAILED_DEPENDENCY,
      [BUSINESS_ERROR_CODES.VALIDATION_ERROR]: HttpStatus.UNPROCESSABLE_ENTITY,
      [BUSINESS_ERROR_CODES.PERMISSION_ERROR]: HttpStatus.FORBIDDEN,
      [BUSINESS_ERROR_CODES.BUSINESS_RULE_VIOLATION]: HttpStatus.UNPROCESSABLE_ENTITY
    };

    return statusMap[businessCode] || HttpStatus.BAD_REQUEST;
  }

  /**
   * Calculates retry-after timestamp for quota errors
   */
  private static calculateRetryAfter(): string {
    const resetTime = new Date();
    resetTime.setMinutes(resetTime.getMinutes() + 15); // Default 15 minute cooldown
    return resetTime.toISOString();
  }
}