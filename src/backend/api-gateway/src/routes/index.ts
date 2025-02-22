import express, { Router, Request, Response } from 'express'; // ^4.18.2
import { createProxyMiddleware, Options as ProxyOptions } from 'http-proxy-middleware'; // ^2.0.6
import { WebSocketServer } from 'ws'; // ^8.14.2
import helmet from 'helmet'; // ^7.0.0
import { body, query, param, validationResult } from 'express-validator'; // ^7.0.0
import CircuitBreaker from 'circuit-breaker-js'; // ^0.5.0

import { authenticate, authorize } from '../middleware/auth.middleware';
import { errorMiddleware } from '../middleware/error.middleware';
import { RateLimitMiddleware } from '../middleware/ratelimit.middleware';
import { requestLoggingMiddleware } from '../middleware/logging.middleware';
import { ApiError } from '../../shared/errors/api.error';
import { Logger } from '../../shared/utils/logger';
import { ROLES, API_ROUTES, SYSTEM_CONFIG } from '../../shared/constants';

// Initialize logger
const logger = new Logger('ApiGateway');

// Service URLs from environment variables
const SERVICES = {
  USER: process.env.USER_SERVICE_URL!,
  VIDEO: process.env.VIDEO_SERVICE_URL!,
  COACH: process.env.COACH_SERVICE_URL!,
  PAYMENT: process.env.PAYMENT_SERVICE_URL!,
  CHAT: process.env.CHAT_SERVICE_URL!
};

// Rate limit configurations
const RATE_LIMITS = {
  PUBLIC_API: '100/minute',
  AUTHENTICATED_API: '1000/minute',
  VIDEO_UPLOAD: '10/hour',
  ANALYTICS: '500/minute'
};

// Initialize router
const router: Router = express.Router();

// Circuit breaker configuration
const circuitBreakerOptions = {
  timeout: 10000,
  failureThreshold: 5,
  resetTimeout: 30000
};

/**
 * Creates enhanced proxy middleware with circuit breaker and monitoring
 */
const createServiceProxy = (targetUrl: string, options: ProxyOptions = {}) => {
  const breaker = new CircuitBreaker(circuitBreakerOptions);
  
  const defaultOptions: ProxyOptions = {
    target: targetUrl,
    changeOrigin: true,
    pathRewrite: { [`^${API_ROUTES.AUTH}`]: '' },
    proxyTimeout: 10000,
    timeout: 10000,
    ws: false,
    onError: (err: Error, req: Request, res: Response) => {
      logger.error('Proxy error', err, { service: targetUrl });
      throw ApiError.internal('Service temporarily unavailable');
    }
  };

  const proxyMiddleware = createProxyMiddleware({
    ...defaultOptions,
    ...options
  });

  return (req: Request, res: Response, next: Function) => {
    breaker.run(
      () => proxyMiddleware(req, res, next),
      () => next(ApiError.internal('Service temporarily unavailable'))
    );
  };
};

// Apply global middleware
router.use(helmet());
router.use(requestLoggingMiddleware);
router.use(express.json({ limit: SYSTEM_CONFIG.MAX_FILE_SIZE }));

// Authentication routes
router.use(
  API_ROUTES.AUTH,
  RateLimitMiddleware.handle({
    windowMs: 15 * 60 * 1000,
    max: 100
  }),
  createServiceProxy(SERVICES.USER)
);

// Video routes
router.use(
  API_ROUTES.VIDEOS,
  authenticate,
  authorize([ROLES.COACH, ROLES.ATHLETE]),
  RateLimitMiddleware.handle({
    windowMs: 60 * 60 * 1000,
    max: 10,
    keyGenerator: (req) => `${req.user.id}-video-upload`
  }),
  body('file').custom((value, { req }) => {
    const allowedFormats = SYSTEM_CONFIG.SUPPORTED_VIDEO_FORMATS;
    const fileFormat = req.file?.mimetype.split('/')[1];
    if (!allowedFormats.includes(fileFormat)) {
      throw new Error('Unsupported video format');
    }
    return true;
  }),
  createServiceProxy(SERVICES.VIDEO, { ws: true })
);

// Coach routes
router.use(
  API_ROUTES.COACHES,
  authenticate,
  RateLimitMiddleware.handle({
    windowMs: 60 * 1000,
    max: 1000
  }),
  createServiceProxy(SERVICES.COACH)
);

// Payment routes
router.use(
  API_ROUTES.PAYMENTS,
  authenticate,
  authorize([ROLES.COACH, ROLES.ATHLETE]),
  RateLimitMiddleware.handle({
    windowMs: 60 * 1000,
    max: 100
  }),
  createServiceProxy(SERVICES.PAYMENT)
);

// WebSocket setup for real-time features
const setupWebSocket = (server: any) => {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', async (ws, req) => {
    try {
      // Authenticate WebSocket connection
      const token = req.headers['sec-websocket-protocol'];
      if (!token) {
        throw ApiError.unauthorized('WebSocket authentication required');
      }

      const user = await authenticate(token as string);
      (ws as any).user = user;

      // Setup heartbeat
      ws.on('pong', () => {
        (ws as any).isAlive = true;
      });

      // Handle messages
      ws.on('message', (data: string) => {
        try {
          const message = JSON.parse(data);
          // Route WebSocket messages to appropriate service
          switch (message.type) {
            case 'video_annotation':
              // Handle video annotation messages
              break;
            case 'chat':
              // Handle chat messages
              break;
            default:
              ws.send(JSON.stringify({ error: 'Unknown message type' }));
          }
        } catch (error) {
          logger.error('WebSocket message error', error as Error);
        }
      });
    } catch (error) {
      ws.close(1008, 'Authentication failed');
    }
  });

  // Heartbeat interval
  setInterval(() => {
    wss.clients.forEach((ws: any) => {
      if (ws.isAlive === false) {
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);
};

// Error handling
router.use(errorMiddleware);

// Health check endpoint
router.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Export router and WebSocket setup
export { router, setupWebSocket };