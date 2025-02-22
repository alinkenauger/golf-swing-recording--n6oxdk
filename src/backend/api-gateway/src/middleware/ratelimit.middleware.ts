import { Request, Response, NextFunction } from 'express'; // ^4.18.0
import Redis from 'ioredis'; // ^5.3.0
import { createHash } from 'crypto';
import { Logger } from '../../shared/utils/logger';
import { ApiError, ERROR_CODES } from '../../shared/errors/api.error';
import { ROLES } from '../../shared/constants';

// Rate limit configurations based on technical specifications
const RATE_LIMIT_CONFIGS = {
  PUBLIC_API: {
    limit: 100,
    window: 60, // 1 minute in seconds
    burst: 150
  },
  AUTHENTICATED_API: {
    limit: 1000,
    window: 60,
    burst: 1500
  },
  VIDEO_UPLOAD: {
    limit: 10,
    window: 3600, // 1 hour in seconds
    burst: 15
  }
} as const;

/**
 * Distributed rate limiting middleware using Redis sliding window algorithm
 * Provides tiered rate limiting based on user roles and endpoint types
 * @version 1.0.0
 */
export class RateLimitMiddleware {
  private readonly redisClient: Redis;
  private readonly logger: Logger;
  private readonly cleanupInterval: number;
  private readonly namespace = 'rl'; // Rate limit key namespace

  /**
   * Initialize rate limit middleware with Redis cluster connection
   * @param redisClient - Redis cluster client
   * @param options - Optional configuration overrides
   */
  constructor(redisClient: Redis, options?: { cleanupInterval?: number }) {
    this.redisClient = redisClient;
    this.logger = new Logger('RateLimitMiddleware');
    this.cleanupInterval = options?.cleanupInterval || 60000; // Default 1 minute

    // Set up Redis error handling
    this.redisClient.on('error', (error) => {
      this.logger.error('Redis connection error', error);
    });

    // Start cleanup interval for expired keys
    setInterval(() => this.cleanup(), this.cleanupInterval);
  }

  /**
   * Generate secure rate limit key for request
   * @param req - Express request object
   * @returns Formatted rate limit key
   */
  private getRateLimitKey(req: Request): string {
    const identifier = req.user?.id || 
      createHash('sha256').update(req.ip).digest('hex');
    
    const endpoint = req.path.replace(/\/$/, '').toLowerCase();
    
    return `${this.namespace}:${identifier}:${endpoint}`;
  }

  /**
   * Determine rate limit configuration based on request context
   * @param req - Express request object
   * @returns Rate limit configuration
   */
  private getRateLimitConfig(req: Request): typeof RATE_LIMIT_CONFIGS[keyof typeof RATE_LIMIT_CONFIGS] {
    // Check for video upload endpoints
    if (req.path.toLowerCase().includes('/videos/upload')) {
      return RATE_LIMIT_CONFIGS.VIDEO_UPLOAD;
    }

    // Apply role-based limits
    if (req.user) {
      const role = req.user.role;
      
      // Higher limits for coaches
      if (role === ROLES.COACH) {
        return {
          ...RATE_LIMIT_CONFIGS.AUTHENTICATED_API,
          limit: 2000, // Double limit for coaches
          burst: 3000
        };
      }
      
      return RATE_LIMIT_CONFIGS.AUTHENTICATED_API;
    }

    return RATE_LIMIT_CONFIGS.PUBLIC_API;
  }

  /**
   * Implement sliding window rate limiting using Redis
   * @param key - Rate limit key
   * @param window - Time window in seconds
   * @returns Current request count
   */
  private async incrementCounter(key: string, window: number): Promise<number> {
    const now = Date.now();
    const clearBefore = now - (window * 1000);

    // Execute atomic transaction
    const result = await this.redisClient
      .multi()
      .zremrangebyscore(key, 0, clearBefore) // Remove old requests
      .zadd(key, now, now.toString()) // Add current request
      .zcard(key) // Get current count
      .expire(key, window) // Set expiration
      .exec();

    // Return current count from transaction result
    return result?.[2][1] as number || 0;
  }

  /**
   * Clean up expired rate limit keys
   */
  private async cleanup(): Promise<void> {
    try {
      const pattern = `${this.namespace}:*`;
      const keys = await this.redisClient.keys(pattern);
      
      for (const key of keys) {
        const count = await this.redisClient.zcard(key);
        if (count === 0) {
          await this.redisClient.del(key);
        }
      }
    } catch (error) {
      this.logger.error('Rate limit cleanup error', error);
    }
  }

  /**
   * Express middleware handler for rate limiting
   * @param req - Express request object
   * @param res - Express response object
   * @param next - Next middleware function
   */
  public async handle(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const key = this.getRateLimitKey(req);
      const config = this.getRateLimitConfig(req);
      
      // Increment counter and get current count
      const requestCount = await this.incrementCounter(key, config.window);
      
      // Add rate limit headers
      res.setHeader('X-RateLimit-Limit', config.limit);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, config.limit - requestCount));
      res.setHeader('X-RateLimit-Reset', Math.floor(Date.now() / 1000) + config.window);

      // Allow burst capacity
      if (requestCount <= config.burst) {
        // Log if approaching limit
        if (requestCount > config.limit) {
          this.logger.warn('Rate limit burst capacity used', {
            key,
            count: requestCount,
            limit: config.limit,
            burst: config.burst
          });
        }
        return next();
      }

      // Rate limit exceeded
      this.logger.warn('Rate limit exceeded', {
        key,
        count: requestCount,
        limit: config.limit
      });

      // Calculate retry-after in seconds
      const retryAfter = config.window;
      res.setHeader('Retry-After', retryAfter);

      throw new ApiError(
        'Rate limit exceeded',
        429,
        ERROR_CODES.RATE_LIMIT_EXCEEDED,
        { retryAfter }
      );
    } catch (error) {
      next(error);
    }
  }
}

// Export middleware instance creator
export const createRateLimitMiddleware = (redisClient: Redis, options?: { cleanupInterval?: number }) => {
  const middleware = new RateLimitMiddleware(redisClient, options);
  return middleware.handle.bind(middleware);
};