import { config as dotenvConfig } from 'dotenv';
import { ROLES } from '../../shared/constants';

// Load environment variables
dotenvConfig();

/**
 * Validates environment variables and their formats
 * @throws Error if validation fails with specific validation messages
 */
function validateConfig(): void {
  const requiredEnvVars = [
    'NODE_ENV',
    'PORT',
    'DB_HOST',
    'DB_PORT',
    'DB_USER',
    'DB_PASSWORD',
    'DB_NAME',
    'JWT_SECRET',
    'AUTH0_DOMAIN',
    'AUTH0_CLIENT_ID',
    'AUTH0_CLIENT_SECRET',
  ];

  const missingVars = requiredEnvVars.filter(
    (envVar) => !process.env[envVar]
  );

  if (missingVars.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missingVars.join(', ')}`
    );
  }

  // Validate port number
  if (isNaN(Number(process.env.PORT))) {
    throw new Error('PORT must be a valid number');
  }

  // Validate database port
  if (isNaN(Number(process.env.DB_PORT))) {
    throw new Error('DB_PORT must be a valid number');
  }
}

// Validate configuration on load
validateConfig();

/**
 * Configuration object with enhanced security and monitoring capabilities
 */
export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),

  database: {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: process.env.DB_SSL === 'true',
    poolSize: parseInt(process.env.DB_POOL_SIZE || '10', 10),
    connectionTimeout: parseInt(process.env.DB_CONNECTION_TIMEOUT || '10000', 10),
    idleTimeout: parseInt(process.env.DB_IDLE_TIMEOUT || '10000', 10),
    maxLifetime: parseInt(process.env.DB_MAX_LIFETIME || '3600000', 10),
    replication: {
      read: (process.env.DB_READ_REPLICAS || '').split(',').filter(Boolean),
      write: process.env.DB_WRITE_HOST || process.env.DB_HOST,
    },
  },

  auth: {
    jwtSecret: process.env.JWT_SECRET,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1h',
    refreshTokenExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d',
    tokenRotationEnabled: process.env.TOKEN_ROTATION_ENABLED === 'true',
    tokenRotationInterval: parseInt(process.env.TOKEN_ROTATION_INTERVAL || '3600000', 10),
    auth0: {
      domain: process.env.AUTH0_DOMAIN,
      clientId: process.env.AUTH0_CLIENT_ID,
      clientSecret: process.env.AUTH0_CLIENT_SECRET,
      audience: process.env.AUTH0_AUDIENCE || `https://${process.env.AUTH0_DOMAIN}/api/v2/`,
      callbackUrl: process.env.AUTH0_CALLBACK_URL || 'http://localhost:3000/auth/callback',
      scope: (process.env.AUTH0_SCOPE || 'openid profile email').split(' '),
    },
  },

  cors: {
    origin: (process.env.CORS_ORIGINS || '*').split(','),
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
      'Origin',
    ],
    exposedHeaders: ['X-Total-Count', 'X-Rate-Limit'],
    credentials: true,
    maxAge: 86400, // 24 hours
    preflightContinue: false,
    optionsSuccessStatus: 204,
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'json',
    transports: (process.env.LOG_TRANSPORTS || 'console').split(','),
    enableConsole: process.env.LOG_ENABLE_CONSOLE !== 'false',
    enableFile: process.env.LOG_ENABLE_FILE === 'true',
    logRotation: {
      maxSize: process.env.LOG_MAX_SIZE || '10m',
      maxFiles: parseInt(process.env.LOG_MAX_FILES || '7', 10),
    },
    errorLogging: {
      separate: process.env.LOG_SEPARATE_ERRORS === 'true',
      filename: process.env.LOG_ERROR_FILENAME || 'error.log',
    },
  },

  monitoring: {
    enabled: process.env.MONITORING_ENABLED === 'true',
    metricsInterval: parseInt(process.env.METRICS_INTERVAL || '15000', 10),
    healthCheck: {
      enabled: process.env.HEALTH_CHECK_ENABLED !== 'false',
      interval: parseInt(process.env.HEALTH_CHECK_INTERVAL || '30000', 10),
      timeout: parseInt(process.env.HEALTH_CHECK_TIMEOUT || '5000', 10),
    },
    alerting: {
      enabled: process.env.ALERTING_ENABLED === 'true',
      threshold: parseInt(process.env.ALERTING_THRESHOLD || '90', 10),
      channels: (process.env.ALERTING_CHANNELS || 'email').split(','),
    },
  },

  roles: ROLES,
} as const;

// Type definitions for configuration
export type Config = typeof config;
export type DatabaseConfig = typeof config.database;
export type AuthConfig = typeof config.auth;
export type CorsConfig = typeof config.cors;
export type LoggingConfig = typeof config.logging;
export type MonitoringConfig = typeof config.monitoring;