// dotenv version ^16.0.0
import { config as dotenvConfig } from 'dotenv';
import { ROLES } from '@shared/constants';

// Load environment variables
dotenvConfig();

/**
 * Service configuration interface definitions
 */
interface ServiceConfig {
  name: string;
  port: number;
  host: string;
  env: string;
}

interface DatabaseConfig {
  host: string;
  port: number;
  name: string;
  user: string;
  password: string;
  pool: {
    min: number;
    max: number;
    idleTimeoutMillis: number;
    acquireTimeoutMillis: number;
  };
  ssl: boolean;
  monitoring: {
    enabled: boolean;
    slowQueryThreshold: number;
  };
}

interface AuthConfig {
  jwt: {
    secret: string;
    expiresIn: string;
    algorithm: string;
    refreshToken: {
      secret: string;
      expiresIn: string;
    };
  };
}

interface RateLimitConfig {
  windowMs: number;
  max: number;
  standardHeaders: boolean;
  legacyHeaders: boolean;
  skipSuccessfulRequests: boolean;
  keyGenerator: (req: any) => string;
}

interface LoggingConfig {
  level: string;
  format: string;
  destination: string;
  audit: {
    enabled: boolean;
    retention: number;
  };
}

interface MonitoringConfig {
  metrics: {
    enabled: boolean;
    interval: number;
  };
  healthCheck: {
    enabled: boolean;
    path: string;
    interval: number;
  };
}

interface Config {
  service: ServiceConfig;
  database: DatabaseConfig;
  auth: AuthConfig;
  rateLimit: RateLimitConfig;
  logging: LoggingConfig;
  monitoring: MonitoringConfig;
}

/**
 * Validates the configuration values for security and completeness
 * @throws Error if validation fails
 */
function validateConfig(): void {
  // Required environment variables
  const requiredEnvVars = [
    'DB_HOST',
    'DB_PORT',
    'DB_NAME',
    'DB_USER',
    'DB_PASSWORD',
    'JWT_SECRET',
    'JWT_REFRESH_SECRET'
  ];

  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      throw new Error(`Missing required environment variable: ${envVar}`);
    }
  }

  // JWT secret length validation
  if (process.env.JWT_SECRET!.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters long');
  }

  // Database port validation
  const dbPort = Number(process.env.DB_PORT);
  if (isNaN(dbPort) || dbPort <= 0 || dbPort > 65535) {
    throw new Error('Invalid DB_PORT value');
  }

  // Pool configuration validation
  const poolMin = Number(process.env.DB_POOL_MIN) || 5;
  const poolMax = Number(process.env.DB_POOL_MAX) || 20;
  if (poolMin > poolMax) {
    throw new Error('DB_POOL_MIN cannot be greater than DB_POOL_MAX');
  }

  // Rate limit validation
  const rateLimit = Number(process.env.RATE_LIMIT_MAX) || 100;
  if (rateLimit <= 0) {
    throw new Error('RATE_LIMIT_MAX must be greater than 0');
  }
}

/**
 * Loads and validates the service configuration
 * @returns Validated configuration object
 */
function loadConfig(): Config {
  validateConfig();

  const config: Config = {
    service: {
      name: 'coach-service',
      port: Number(process.env.PORT) || 3002,
      host: process.env.HOST || '0.0.0.0',
      env: process.env.NODE_ENV || 'development'
    },
    database: {
      host: process.env.DB_HOST!,
      port: Number(process.env.DB_PORT),
      name: process.env.DB_NAME!,
      user: process.env.DB_USER!,
      password: process.env.DB_PASSWORD!,
      pool: {
        min: Number(process.env.DB_POOL_MIN) || 5,
        max: Number(process.env.DB_POOL_MAX) || 20,
        idleTimeoutMillis: Number(process.env.DB_POOL_IDLE_TIMEOUT) || 30000,
        acquireTimeoutMillis: Number(process.env.DB_POOL_ACQUIRE_TIMEOUT) || 60000
      },
      ssl: process.env.DB_SSL === 'true',
      monitoring: {
        enabled: process.env.DB_MONITORING === 'true',
        slowQueryThreshold: Number(process.env.DB_SLOW_QUERY_THRESHOLD) || 1000
      }
    },
    auth: {
      jwt: {
        secret: process.env.JWT_SECRET!,
        expiresIn: process.env.JWT_EXPIRES_IN || '24h',
        algorithm: process.env.JWT_ALGORITHM || 'HS256',
        refreshToken: {
          secret: process.env.JWT_REFRESH_SECRET!,
          expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d'
        }
      }
    },
    rateLimit: {
      windowMs: Number(process.env.RATE_LIMIT_WINDOW) || 60000,
      max: Number(process.env.RATE_LIMIT_MAX) || 100,
      standardHeaders: true,
      legacyHeaders: false,
      skipSuccessfulRequests: false,
      keyGenerator: (req: any): string => {
        // IP-based rate limiting with proxy support
        return req.ip || 
               req.headers['x-forwarded-for'] || 
               req.connection.remoteAddress;
      }
    },
    logging: {
      level: process.env.LOG_LEVEL || 'info',
      format: process.env.LOG_FORMAT || 'json',
      destination: process.env.LOG_DESTINATION || 'stdout',
      audit: {
        enabled: process.env.AUDIT_LOGGING === 'true',
        retention: Number(process.env.AUDIT_LOG_RETENTION) || 30
      }
    },
    monitoring: {
      metrics: {
        enabled: process.env.METRICS_ENABLED === 'true',
        interval: Number(process.env.METRICS_INTERVAL) || 5000
      },
      healthCheck: {
        enabled: true,
        path: '/health',
        interval: Number(process.env.HEALTH_CHECK_INTERVAL) || 30000
      }
    }
  };

  // Freeze configuration to prevent runtime modifications
  return Object.freeze(config);
}

// Export the validated configuration
export const config = loadConfig();

// Export configuration types for use in other modules
export type {
  Config,
  ServiceConfig,
  DatabaseConfig,
  AuthConfig,
  RateLimitConfig,
  LoggingConfig,
  MonitoringConfig
};