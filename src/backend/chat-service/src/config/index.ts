import { config as dotenvConfig } from 'dotenv'; // v16.3.1
import * as Joi from 'joi'; // v17.11.0
import { ROLES } from '@shared/constants';

// Load environment variables
dotenvConfig();

// Environment constants
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PRODUCTION = NODE_ENV === 'production';

/**
 * Configuration validation schema using Joi
 */
const configSchema = Joi.object({
  env: Joi.string().valid('development', 'test', 'production').default('development'),
  isProduction: Joi.boolean().default(false),
  server: Joi.object({
    port: Joi.number().port().default(3002),
    host: Joi.string().hostname().default('localhost'),
    cors: Joi.object({
      origin: Joi.array().items(Joi.string()).default(['http://localhost:3000']),
      methods: Joi.array().items(Joi.string()).default(['GET', 'POST', 'PUT', 'DELETE']),
      credentials: Joi.boolean().default(true),
      maxAge: Joi.number().default(86400)
    }),
    rateLimiting: Joi.object({
      windowMs: Joi.number().default(60000), // 1 minute
      max: Joi.number().default(100),
      message: Joi.string().default('Too many requests, please try again later'),
      statusCode: Joi.number().default(429),
      headers: Joi.boolean().default(true)
    })
  }),
  database: Joi.object({
    uri: Joi.string().required(),
    options: Joi.object({
      poolSize: Joi.number().default(10),
      connectTimeoutMS: Joi.number().default(30000),
      socketTimeoutMS: Joi.number().default(30000),
      retryWrites: Joi.boolean().default(true),
      ssl: Joi.boolean().default(IS_PRODUCTION)
    })
  }),
  redis: Joi.object({
    host: Joi.string().required(),
    port: Joi.number().port().default(6379),
    password: Joi.string().allow('').default(''),
    tls: Joi.boolean().default(IS_PRODUCTION),
    db: Joi.number().default(0),
    keyPrefix: Joi.string().default('chat:'),
    connectionPoolSize: Joi.number().default(100),
    connectionTimeout: Joi.number().default(10000)
  }),
  socket: Joi.object({
    path: Joi.string().default('/socket.io'),
    maxConnections: Joi.number().default(10000),
    pingTimeout: Joi.number().default(5000),
    pingInterval: Joi.number().default(25000),
    upgradeTimeout: Joi.number().default(10000),
    transports: Joi.array().items(Joi.string()).default(['websocket', 'polling']),
    allowUpgrades: Joi.boolean().default(true),
    maxHttpBufferSize: Joi.number().default(1e6) // 1MB
  }),
  auth: Joi.object({
    jwtSecret: Joi.string().required(),
    tokenExpiry: Joi.string().default('1h'),
    refreshTokenExpiry: Joi.string().default('7d'),
    saltRounds: Joi.number().default(12),
    sessionTimeout: Joi.number().default(3600) // 1 hour
  }),
  logging: Joi.object({
    level: Joi.string().valid('error', 'warn', 'info', 'debug').default('info'),
    format: Joi.string().valid('json', 'pretty').default(IS_PRODUCTION ? 'json' : 'pretty'),
    timestamp: Joi.boolean().default(true),
    colorize: Joi.boolean().default(!IS_PRODUCTION),
    logPath: Joi.string().default('./logs'),
    maxFiles: Joi.number().default(10),
    maxSize: Joi.string().default('100m')
  }),
  monitoring: Joi.object({
    enabled: Joi.boolean().default(IS_PRODUCTION),
    metricsPath: Joi.string().default('/metrics'),
    collectDefaultMetrics: Joi.boolean().default(true),
    pushGateway: Joi.object({
      url: Joi.string().uri().default('http://pushgateway:9091'),
      jobName: Joi.string().default('chat_service'),
      interval: Joi.number().default(15000) // 15 seconds
    })
  })
}).required();

/**
 * Validates the configuration object against the schema
 */
const validateConfig = (config: Record<string, any>) => {
  const { error, value } = configSchema.validate(config, {
    abortEarly: false,
    convert: true,
    stripUnknown: true
  });

  if (error) {
    throw new Error(`Configuration validation error: ${error.message}`);
  }

  return value;
};

/**
 * Configuration object with environment-specific settings
 */
export const config = validateConfig({
  env: NODE_ENV,
  isProduction: IS_PRODUCTION,
  server: {
    port: parseInt(process.env.PORT || '3002', 10),
    host: process.env.HOST || 'localhost',
    cors: {
      origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      credentials: true,
      maxAge: 86400
    },
    rateLimiting: {
      windowMs: 60000,
      max: IS_PRODUCTION ? 100 : 1000,
      message: 'Too many requests, please try again later',
      statusCode: 429,
      headers: true
    }
  },
  database: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/chat',
    options: {
      poolSize: parseInt(process.env.DB_POOL_SIZE || '10', 10),
      connectTimeoutMS: 30000,
      socketTimeoutMS: 30000,
      retryWrites: true,
      ssl: IS_PRODUCTION
    }
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || '',
    tls: IS_PRODUCTION,
    db: parseInt(process.env.REDIS_DB || '0', 10),
    keyPrefix: 'chat:',
    connectionPoolSize: 100,
    connectionTimeout: 10000
  },
  socket: {
    path: '/socket.io',
    maxConnections: parseInt(process.env.MAX_SOCKET_CONNECTIONS || '10000', 10),
    pingTimeout: 5000,
    pingInterval: 25000,
    upgradeTimeout: 10000,
    transports: ['websocket', 'polling'],
    allowUpgrades: true,
    maxHttpBufferSize: 1e6 // 1MB
  },
  auth: {
    jwtSecret: process.env.JWT_SECRET || 'your-secret-key',
    tokenExpiry: process.env.TOKEN_EXPIRY || '1h',
    refreshTokenExpiry: process.env.REFRESH_TOKEN_EXPIRY || '7d',
    saltRounds: 12,
    sessionTimeout: 3600,
    roles: {
      coach: ROLES.COACH,
      athlete: ROLES.ATHLETE
    }
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: IS_PRODUCTION ? 'json' : 'pretty',
    timestamp: true,
    colorize: !IS_PRODUCTION,
    logPath: process.env.LOG_PATH || './logs',
    maxFiles: 10,
    maxSize: '100m'
  },
  monitoring: {
    enabled: IS_PRODUCTION,
    metricsPath: '/metrics',
    collectDefaultMetrics: true,
    pushGateway: {
      url: process.env.PUSHGATEWAY_URL || 'http://pushgateway:9091',
      jobName: 'chat_service',
      interval: 15000
    }
  }
});

// Type definitions for configuration object
export type Config = typeof config;

// Export individual configuration sections
export const {
  env,
  isProduction,
  server,
  database,
  redis,
  socket,
  auth,
  logging,
  monitoring
} = config;