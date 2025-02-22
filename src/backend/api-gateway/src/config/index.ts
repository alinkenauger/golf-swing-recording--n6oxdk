// dotenv version ^16.3.1
import * as dotenv from 'dotenv';
import { API_ROUTES } from '../../shared/constants';

// Load environment variables
dotenv.config();

/**
 * Validates required environment variables and throws error if missing
 */
function validateEnvVariables(): void {
  const required = [
    'NODE_ENV',
    'API_GATEWAY_PORT',
    'JWT_SECRET',
    'AUTH0_DOMAIN',
    'AUTH0_AUDIENCE',
    'AUTH0_CLIENT_ID',
  ];

  const missing = required.filter(key => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

/**
 * Region-specific rate limiting configurations
 */
const regionConfigs = {
  'us-east-1': {
    publicRateLimit: 100,
    authenticatedRateLimit: 1000,
    burstMultiplier: 1.5,
  },
  'us-west-2': {
    publicRateLimit: 100,
    authenticatedRateLimit: 1000,
    burstMultiplier: 1.5,
  },
  'eu-central-1': {
    publicRateLimit: 80,
    authenticatedRateLimit: 800,
    burstMultiplier: 1.3,
  },
  'ap-southeast-1': {
    publicRateLimit: 60,
    authenticatedRateLimit: 600,
    burstMultiplier: 1.2,
  },
} as const;

/**
 * Application configuration object
 */
export const config = {
  app: {
    env: process.env.NODE_ENV || 'development',
    name: 'video-coaching-api-gateway',
    version: '1.0.0',
    region: process.env.AWS_REGION || 'us-east-1',
    debug: process.env.DEBUG === 'true',
  },

  server: {
    port: parseInt(process.env.API_GATEWAY_PORT || '3000', 10),
    host: process.env.API_GATEWAY_HOST || '0.0.0.0',
    cors: {
      enabled: true,
      origins: process.env.CORS_ORIGINS?.split(',') || ['*'],
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      credentials: true,
    },
    timeout: parseInt(process.env.REQUEST_TIMEOUT || '30000', 10),
    keepAlive: true,
    maxConnections: parseInt(process.env.MAX_CONNECTIONS || '1000', 10),
  },

  auth: {
    jwtSecret: process.env.JWT_SECRET!,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1h',
    jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
    auth0Domain: process.env.AUTH0_DOMAIN!,
    auth0Audience: process.env.AUTH0_AUDIENCE!,
    auth0ClientId: process.env.AUTH0_CLIENT_ID!,
    mfaEnabled: process.env.MFA_ENABLED === 'true',
    keyRotationInterval: parseInt(process.env.KEY_ROTATION_INTERVAL || '86400', 10), // 24 hours
  },

  services: {
    user: {
      url: process.env.USER_SERVICE_URL || 'http://user-service:3001',
      timeout: 5000,
      endpoint: API_ROUTES.USERS,
    },
    video: {
      url: process.env.VIDEO_SERVICE_URL || 'http://video-service:3002',
      timeout: 10000,
      endpoint: API_ROUTES.VIDEOS,
    },
    coach: {
      url: process.env.COACH_SERVICE_URL || 'http://coach-service:3003',
      timeout: 5000,
      endpoint: API_ROUTES.COACHES,
    },
    payment: {
      url: process.env.PAYMENT_SERVICE_URL || 'http://payment-service:3004',
      timeout: 8000,
      endpoint: API_ROUTES.PAYMENTS,
    },
    healthCheck: {
      enabled: true,
      interval: parseInt(process.env.HEALTH_CHECK_INTERVAL || '30000', 10),
      timeout: 3000,
    },
    retryPolicy: {
      attempts: 3,
      delay: 1000,
      backoff: 2,
    },
    circuitBreaker: {
      failureThreshold: 5,
      resetTimeout: 30000,
    },
  },

  rateLimiting: {
    public: {
      windowMs: 60000, // 1 minute
      max: regionConfigs[process.env.AWS_REGION as keyof typeof regionConfigs]?.publicRateLimit || 100,
    },
    authenticated: {
      windowMs: 60000,
      max: regionConfigs[process.env.AWS_REGION as keyof typeof regionConfigs]?.authenticatedRateLimit || 1000,
    },
    videoUpload: {
      windowMs: 3600000, // 1 hour
      max: 10,
    },
    webhook: {
      windowMs: 60000,
      max: 50,
    },
    burstMultiplier: regionConfigs[process.env.AWS_REGION as keyof typeof regionConfigs]?.burstMultiplier || 1.5,
    regionSpecific: regionConfigs,
  },

  websocket: {
    timeout: parseInt(process.env.WS_TIMEOUT || '30000', 10),
    heartbeat: {
      interval: 25000,
      timeout: 5000,
    },
    connectionPool: {
      maxSize: parseInt(process.env.WS_MAX_CONNECTIONS || '10000', 10),
      timeout: 300000, // 5 minutes
    },
    reconnectStrategy: {
      attempts: 5,
      backoff: {
        initialDelay: 1000,
        maxDelay: 30000,
        factor: 2,
      },
    },
  },

  monitoring: {
    metrics: {
      enabled: true,
      interval: 10000,
      prefix: 'api_gateway_',
    },
    logging: {
      level: process.env.LOG_LEVEL || 'info',
      format: 'json',
      correlationId: true,
    },
    tracing: {
      enabled: true,
      serviceName: 'api-gateway',
      samplingRate: parseFloat(process.env.TRACE_SAMPLING_RATE || '0.1'),
    },
    alerting: {
      enabled: true,
      endpoints: process.env.ALERT_ENDPOINTS?.split(',') || [],
      thresholds: {
        errorRate: 0.05,
        latency: 1000,
        cpuUsage: 0.8,
      },
    },
  },
};

// Validate environment variables on startup
validateEnvVariables();

// Export the configuration
export default config;