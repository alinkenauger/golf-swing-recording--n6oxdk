import { config as dotenvConfig } from 'dotenv'; // ^16.0.0
import { z } from 'zod'; // ^3.22.0
import winston from 'winston'; // ^3.11.0
import { PAYMENT_STATUS } from '../../../shared/constants';

// Load environment variables
dotenvConfig();

// Environment type validation schema
const envSchema = z.enum(['development', 'test', 'staging', 'production']);

// Configuration validation schema
const configSchema = z.object({
  env: envSchema,
  isProduction: z.boolean(),
  server: z.object({
    port: z.number().int().positive(),
    host: z.string().min(1),
    apiPrefix: z.string().startsWith('/'),
    corsOrigin: z.string().min(1),
    rateLimiting: z.object({
      windowMs: z.number().int().positive(),
      max: z.number().int().positive(),
    }),
    security: z.object({
      headers: z.object({
        hsts: z.boolean(),
        noSniff: z.boolean(),
        xssProtection: z.boolean(),
      }),
    }),
  }),
  database: z.object({
    url: z.string().url(),
    name: z.string().min(1),
    options: z.object({
      useNewUrlParser: z.boolean(),
      useUnifiedTopology: z.boolean(),
      poolSize: z.number().int().positive(),
      connectTimeoutMS: z.number().int().positive(),
      retryWrites: z.boolean(),
      retryReads: z.boolean(),
    }),
  }),
  stripe: z.object({
    secretKey: z.string().startsWith('sk_'),
    webhookSecret: z.string().min(1),
    apiVersion: z.string(),
    timeout: z.number().int().positive(),
    maxRetries: z.number().int().positive(),
    idempotencyKeyPrefix: z.string().min(1),
  }),
  redis: z.object({
    host: z.string().min(1),
    port: z.number().int().positive(),
    password: z.string().optional(),
    maxRetries: z.number().int().positive(),
    connectTimeout: z.number().int().positive(),
  }),
  logging: z.object({
    level: z.enum(['error', 'warn', 'info', 'debug']),
    format: z.enum(['json', 'simple']),
    rotation: z.object({
      maxSize: z.string().min(1),
      maxFiles: z.string().min(1),
    }),
    errorTracking: z.object({
      enabled: z.boolean(),
      sampleRate: z.number().min(0).max(1),
    }),
  }),
  monitoring: z.object({
    metrics: z.object({
      enabled: z.boolean(),
      interval: z.number().int().positive(),
    }),
    healthCheck: z.object({
      enabled: z.boolean(),
      interval: z.number().int().positive(),
    }),
  }),
});

// Configuration type
type Config = z.infer<typeof configSchema>;

// Create winston logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.json(),
  transports: [new winston.transports.Console()],
});

/**
 * Validates the configuration against the schema
 * @throws {Error} if validation fails
 */
const validateConfig = (config: unknown): Config => {
  try {
    return configSchema.parse(config);
  } catch (error) {
    logger.error('Configuration validation failed', { error });
    throw new Error('Invalid configuration: ' + error.message);
  }
};

/**
 * Loads and validates the configuration
 */
const loadConfig = (): Config => {
  const config = {
    env: process.env.NODE_ENV || 'development',
    isProduction: process.env.NODE_ENV === 'production',
    server: {
      port: parseInt(process.env.PORT || '3003', 10),
      host: process.env.HOST || '0.0.0.0',
      apiPrefix: process.env.API_PREFIX || '/api/v1',
      corsOrigin: process.env.CORS_ORIGIN || '*',
      rateLimiting: {
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || String(15 * 60 * 1000), 10),
        max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
      },
      security: {
        headers: {
          hsts: true,
          noSniff: true,
          xssProtection: true,
        },
      },
    },
    database: {
      url: process.env.MONGODB_URI || '',
      name: process.env.DB_NAME || 'videocoach_payments',
      options: {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        poolSize: parseInt(process.env.DB_POOL_SIZE || '10', 10),
        connectTimeoutMS: parseInt(process.env.DB_CONNECT_TIMEOUT || '30000', 10),
        retryWrites: true,
        retryReads: true,
      },
    },
    stripe: {
      secretKey: process.env.STRIPE_SECRET_KEY || '',
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
      apiVersion: '2023-10-16',
      timeout: parseInt(process.env.STRIPE_TIMEOUT || '30000', 10),
      maxRetries: parseInt(process.env.STRIPE_MAX_RETRIES || '3', 10),
      idempotencyKeyPrefix: process.env.STRIPE_IDEMPOTENCY_PREFIX || 'payment',
    },
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD,
      maxRetries: parseInt(process.env.REDIS_MAX_RETRIES || '3', 10),
      connectTimeout: parseInt(process.env.REDIS_CONNECT_TIMEOUT || '10000', 10),
    },
    logging: {
      level: (process.env.LOG_LEVEL || 'info') as 'error' | 'warn' | 'info' | 'debug',
      format: (process.env.LOG_FORMAT || 'json') as 'json' | 'simple',
      rotation: {
        maxSize: process.env.LOG_MAX_SIZE || '10m',
        maxFiles: process.env.LOG_MAX_FILES || '7d',
      },
      errorTracking: {
        enabled: process.env.ERROR_TRACKING_ENABLED !== 'false',
        sampleRate: parseFloat(process.env.ERROR_SAMPLING_RATE || '1.0'),
      },
    },
    monitoring: {
      metrics: {
        enabled: process.env.METRICS_ENABLED !== 'false',
        interval: parseInt(process.env.METRICS_INTERVAL || '15000', 10),
      },
      healthCheck: {
        enabled: process.env.HEALTH_CHECK_ENABLED !== 'false',
        interval: parseInt(process.env.HEALTH_CHECK_INTERVAL || '30000', 10),
      },
    },
  };

  return validateConfig(config);
};

// Export validated configuration
export const config = loadConfig();

// Export payment status constants for convenience
export const { PENDING, COMPLETED } = PAYMENT_STATUS;

// Export configuration types
export type { Config };