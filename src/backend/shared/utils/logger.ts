import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { HTTP_STATUS } from '../constants';

// Log levels with numeric priorities
const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
};

// Default structured log format
const DEFAULT_LOG_FORMAT = winston.format.combine(
  winston.format.timestamp(),
  winston.format.json()
);

// Log rotation configuration for production
const ROTATION_CONFIG = {
  frequency: 'daily',
  maxFiles: '14d',
  maxSize: '100m'
};

// Correlation tracking key
const CORRELATION_ID_KEY = 'x-correlation-id';

/**
 * Production-grade logging utility for standardized logging across microservices
 * Supports structured logging, correlation tracking, and ELK Stack integration
 * @version 1.0.0
 */
export class Logger {
  private logger: winston.Logger;
  private serviceName: string;
  private correlationStore: Map<string, string>;
  private transportConfig: winston.transport[];

  /**
   * Creates a new Logger instance with service-specific configuration
   * @param serviceName - Name of the service for context
   * @param config - Optional configuration overrides
   */
  constructor(serviceName: string, config?: any) {
    this.serviceName = serviceName;
    this.correlationStore = new Map();

    // Configure transports based on environment
    this.transportConfig = this.initializeTransports(config);

    // Initialize Winston logger
    this.logger = winston.createLogger({
      levels: LOG_LEVELS,
      format: this.initializeLogFormat(),
      transports: this.transportConfig,
      exitOnError: false
    });

    // Add error handler
    this.logger.on('error', (error) => {
      console.error('Logging error:', error);
    });
  }

  /**
   * Initialize environment-specific transports
   */
  private initializeTransports(config?: any): winston.transport[] {
    const transports: winston.transport[] = [];

    // Console transport for all environments
    transports.push(new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }));

    // File rotation transport for production
    if (process.env.NODE_ENV === 'production') {
      transports.push(new DailyRotateFile({
        filename: `logs/${this.serviceName}-%DATE%.log`,
        ...ROTATION_CONFIG,
        format: DEFAULT_LOG_FORMAT
      }));
    }

    return transports;
  }

  /**
   * Initialize structured log format with metadata
   */
  private initializeLogFormat(): winston.Logform.Format {
    return winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json(),
      winston.format.metadata({
        fillWith: ['timestamp', 'service', 'correlationId']
      })
    );
  }

  /**
   * Create structured log entry with standard metadata
   */
  private createLogEntry(level: string, message: string, metadata: any = {}): object {
    const correlationId = this.correlationStore.get(CORRELATION_ID_KEY);
    
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      service: this.serviceName,
      correlationId,
      environment: process.env.NODE_ENV,
      pid: process.pid,
      ...this.maskSensitiveData(metadata)
    };
  }

  /**
   * Mask sensitive data in logs
   */
  private maskSensitiveData(data: any): any {
    if (!data) return data;
    
    const masked = { ...data };
    const sensitiveFields = ['password', 'token', 'secret', 'credit_card'];
    
    sensitiveFields.forEach(field => {
      if (masked[field]) {
        masked[field] = '***MASKED***';
      }
    });
    
    return masked;
  }

  /**
   * Set correlation ID for request tracking
   */
  public setCorrelationId(correlationId: string): void {
    if (!correlationId) {
      throw new Error('Correlation ID is required');
    }
    this.correlationStore.set(CORRELATION_ID_KEY, correlationId);
  }

  /**
   * Log error message with enhanced error serialization
   */
  public error(message: string, error?: Error, metadata: any = {}): void {
    const errorMetadata = error ? {
      error: {
        message: error.message,
        stack: error.stack,
        code: error.name,
        status: HTTP_STATUS.INTERNAL_SERVER_ERROR
      },
      ...metadata
    } : metadata;

    this.logger.error(
      this.createLogEntry('error', message, errorMetadata)
    );
  }

  /**
   * Log warning message
   */
  public warn(message: string, metadata: any = {}): void {
    this.logger.warn(
      this.createLogEntry('warn', message, metadata)
    );
  }

  /**
   * Log info message
   */
  public info(message: string, metadata: any = {}): void {
    this.logger.info(
      this.createLogEntry('info', message, metadata)
    );
  }

  /**
   * Log debug message
   */
  public debug(message: string, metadata: any = {}): void {
    this.logger.debug(
      this.createLogEntry('debug', message, metadata)
    );
  }

  /**
   * Clear correlation ID from store
   */
  public clearCorrelationId(): void {
    this.correlationStore.delete(CORRELATION_ID_KEY);
  }
}

// Export singleton instance
export default Logger;