import { Socket } from 'socket.io';
import { verify } from 'jsonwebtoken';
import { rateLimit } from 'socket.io-rate-limiter';
import { default as xss } from 'xss';
import { Redis } from 'ioredis';
import { injectable } from 'inversify';

import { ApiError } from '../../../shared/errors/api.error';
import { Logger } from '../../../shared/utils/logger';
import { UserRole } from '../../../shared/types';

// Environment variables and constants
const JWT_SECRET = process.env.JWT_SECRET;
const RATE_LIMIT_WINDOW = 60000; // 1 minute in ms
const RATE_LIMIT_MAX = 100;
const RATE_LIMIT_BURST = 150;
const MESSAGE_MAX_LENGTH = 4096;

/**
 * Validates incoming chat message format and content
 * @param message - Message object to validate
 * @returns boolean indicating if message is valid
 */
export const validateMessage = (message: any): boolean => {
  try {
    // Check required fields
    if (!message || typeof message !== 'object') {
      return false;
    }

    if (!message.content || typeof message.content !== 'string') {
      return false;
    }

    // Validate message length
    if (message.content.length > MESSAGE_MAX_LENGTH) {
      return false;
    }

    // Sanitize content
    message.content = xss(message.content, {
      whiteList: {}, // No HTML tags allowed
      stripIgnoreTag: true,
      stripIgnoreTagBody: ['script', 'style']
    });

    // Validate message type if present
    if (message.type && !['text', 'media', 'system'].includes(message.type)) {
      return false;
    }

    // Validate media attachments if present
    if (message.attachments) {
      if (!Array.isArray(message.attachments)) {
        return false;
      }
      
      const validMediaTypes = ['image', 'video', 'audio', 'document'];
      for (const attachment of message.attachments) {
        if (!attachment.type || !validMediaTypes.includes(attachment.type)) {
          return false;
        }
        if (!attachment.url || typeof attachment.url !== 'string') {
          return false;
        }
      }
    }

    return true;
  } catch (error) {
    return false;
  }
};

@injectable()
export class SocketMiddleware {
  private readonly cleanupInterval: NodeJS.Timeout;

  constructor(
    private readonly redisClient: Redis,
    private readonly logger: Logger
  ) {
    // Set up periodic cleanup of rate limit data
    this.cleanupInterval = setInterval(() => {
      this.cleanupRateLimitData();
    }, RATE_LIMIT_WINDOW);
  }

  /**
   * Applies all middleware to a socket connection
   * @param socket - Socket.IO socket instance
   * @param next - Next function to continue middleware chain
   */
  public async apply(socket: Socket, next: (err?: Error) => void): Promise<void> {
    try {
      // Generate correlation ID for request tracking
      const correlationId = `sock-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      this.logger.setCorrelationId(correlationId);
      socket.data.correlationId = correlationId;

      // Authenticate socket connection
      await this.authenticateSocket(socket);

      // Apply rate limiting
      await this.rateLimitMiddleware(socket);

      // Set up message validation
      socket.use(([event, data], next) => {
        if (event === 'message' && !validateMessage(data)) {
          return next(ApiError.badRequest('Invalid message format'));
        }
        next();
      });

      // Set up error handling
      socket.on('error', (error: Error) => {
        this.logger.error('Socket error', error, {
          userId: socket.data.user?.id,
          correlationId: socket.data.correlationId
        });
      });

      // Set up disconnect handling
      socket.on('disconnect', (reason) => {
        this.logger.info('Socket disconnected', {
          userId: socket.data.user?.id,
          reason,
          correlationId: socket.data.correlationId
        });
        this.logger.clearCorrelationId();
      });

      next();
    } catch (error) {
      this.logger.error('Middleware error', error as Error);
      next(error as Error);
    }
  }

  /**
   * Authenticates WebSocket connections using JWT
   * @param socket - Socket instance to authenticate
   */
  private async authenticateSocket(socket: Socket): Promise<void> {
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
        throw ApiError.unauthorized('Authentication token required');
      }

      // Verify JWT token
      const decoded = verify(token, JWT_SECRET!, {
        algorithms: ['HS256'],
        ignoreExpiration: false
      });

      if (typeof decoded === 'string') {
        throw ApiError.unauthorized('Invalid token format');
      }

      // Validate user role
      if (!decoded.role || !Object.values(UserRole).includes(decoded.role)) {
        throw ApiError.forbidden('Invalid user role');
      }

      // Attach user data to socket
      socket.data.user = {
        id: decoded.sub,
        role: decoded.role,
        email: decoded.email
      };

      this.logger.info('Socket authenticated', {
        userId: decoded.sub,
        role: decoded.role
      });
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw ApiError.unauthorized('Invalid authentication token');
    }
  }

  /**
   * Implements distributed rate limiting for socket connections
   * @param socket - Socket instance to rate limit
   */
  private async rateLimitMiddleware(socket: Socket): Promise<void> {
    const userId = socket.data.user?.id;
    if (!userId) {
      throw ApiError.unauthorized('User ID not found');
    }

    const key = `ratelimit:${userId}`;
    const now = Date.now();

    try {
      // Get current rate limit data
      const current = await this.redisClient.get(key);
      const rateData = current ? JSON.parse(current) : { count: 0, timestamp: now };

      // Apply sliding window
      if (now - rateData.timestamp > RATE_LIMIT_WINDOW) {
        rateData.count = 0;
        rateData.timestamp = now;
      }

      // Check rate limit
      if (rateData.count >= RATE_LIMIT_MAX) {
        // Check burst allowance
        if (rateData.count >= RATE_LIMIT_BURST) {
          throw ApiError.tooManyRequests('Rate limit exceeded');
        }
        this.logger.warn('User approaching rate limit', { userId });
      }

      // Update rate limit counter
      rateData.count++;
      await this.redisClient.set(key, JSON.stringify(rateData), 'EX', Math.ceil(RATE_LIMIT_WINDOW / 1000));

    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      this.logger.error('Rate limit error', error as Error);
      throw ApiError.internal('Rate limiting failed');
    }
  }

  /**
   * Cleans up expired rate limit data from Redis
   */
  private async cleanupRateLimitData(): Promise<void> {
    try {
      const pattern = 'ratelimit:*';
      const keys = await this.redisClient.keys(pattern);
      const pipeline = this.redisClient.pipeline();

      for (const key of keys) {
        pipeline.get(key);
      }

      const results = await pipeline.exec();
      const now = Date.now();

      results?.forEach(([error, value], index) => {
        if (!error && value) {
          const data = JSON.parse(value as string);
          if (now - data.timestamp > RATE_LIMIT_WINDOW) {
            this.redisClient.del(keys[index]);
          }
        }
      });
    } catch (error) {
      this.logger.error('Rate limit cleanup error', error as Error);
    }
  }
}