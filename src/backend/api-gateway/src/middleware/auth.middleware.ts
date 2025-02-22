import { Request, Response, NextFunction, RequestHandler } from 'express';
import jwt from 'jsonwebtoken'; // ^9.0.0
import { RateLimiterRedis } from 'rate-limiter-flexible'; // ^2.4.1
import { createClient } from 'redis'; // ^4.6.7
import { ApiError } from '../../shared/errors/api.error';
import { Logger } from '../../shared/utils/logger';
import { UserRole } from '../../shared/types';

// Initialize Redis client for token blacklist and rate limiting
const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redisClient.on('error', (err) => console.error('Redis Client Error:', err));
redisClient.connect();

// Initialize rate limiter
const rateLimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: 'auth_limit',
  points: Number(process.env.MAX_LOGIN_ATTEMPTS) || 5,
  duration: 60 * 15 // 15 minutes
});

// Initialize logger
const logger = new Logger('AuthMiddleware');

// Token verification interface
interface DecodedToken {
  userId: string;
  role: UserRole;
  permissions: string[];
  iat: number;
  exp: number;
  iss: string;
}

// Role hierarchy for permission inheritance
const roleHierarchy: Record<UserRole, UserRole[]> = {
  admin: ['admin', 'coach', 'athlete'],
  coach: ['coach', 'athlete'],
  athlete: ['athlete']
};

/**
 * Verifies JWT token and returns decoded payload
 * @param token - JWT token to verify
 * @returns Decoded token payload
 */
async function verifyToken(token: string): Promise<DecodedToken> {
  try {
    // Remove Bearer prefix if present
    const cleanToken = token.startsWith('Bearer ') ? token.slice(7) : token;

    // Check token blacklist
    const isBlacklisted = await redisClient.get(`blacklist:${cleanToken}`);
    if (isBlacklisted) {
      throw ApiError.unauthorized('Token has been revoked');
    }

    // Verify token signature and expiration
    const decoded = jwt.verify(cleanToken, process.env.JWT_SECRET!, {
      issuer: process.env.JWT_ISSUER || 'video-coaching-platform',
      algorithms: ['HS256']
    }) as DecodedToken;

    // Validate token structure
    if (!decoded.userId || !decoded.role) {
      throw ApiError.unauthorized('Invalid token structure');
    }

    logger.info('Token verified successfully', {
      userId: decoded.userId,
      role: decoded.role
    });

    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw ApiError.unauthorized('Token has expired');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw ApiError.unauthorized('Invalid token');
    }
    throw error;
  }
}

/**
 * Authentication middleware for validating JWT tokens
 */
export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Check rate limits
    try {
      await rateLimiter.consume(req.ip);
    } catch (error) {
      throw ApiError.unauthorized('Too many authentication attempts');
    }

    const authHeader = req.headers.authorization;
    if (!authHeader) {
      throw ApiError.unauthorized('No authorization token provided');
    }

    // Verify and decode token
    const decoded = await verifyToken(authHeader);

    // Add user info to request
    req.user = {
      id: decoded.userId,
      role: decoded.role,
      permissions: decoded.permissions
    };

    // Add security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');

    // Log successful authentication
    logger.info('Authentication successful', {
      userId: decoded.userId,
      role: decoded.role,
      ip: req.ip
    });

    next();
  } catch (error) {
    logger.error('Authentication failed', error as Error, {
      ip: req.ip,
      headers: req.headers
    });
    next(error);
  }
}

/**
 * Authorization middleware factory for role-based access control
 * @param allowedRoles - Array of roles allowed to access the route
 * @param requiredPermissions - Array of required permissions
 */
export function authorize(
  allowedRoles: UserRole[],
  requiredPermissions: string[] = []
): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = req.user;
      if (!user) {
        throw ApiError.unauthorized('User not authenticated');
      }

      // Check role authorization
      const hasValidRole = allowedRoles.some(role => 
        roleHierarchy[role].includes(user.role as UserRole)
      );

      if (!hasValidRole) {
        throw ApiError.forbidden('Insufficient role permissions');
      }

      // Check required permissions
      if (requiredPermissions.length > 0) {
        const hasAllPermissions = requiredPermissions.every(
          permission => user.permissions.includes(permission)
        );

        if (!hasAllPermissions) {
          throw ApiError.forbidden('Missing required permissions');
        }
      }

      // Log authorization success
      logger.info('Authorization successful', {
        userId: user.id,
        role: user.role,
        requiredRoles: allowedRoles,
        requiredPermissions
      });

      next();
    } catch (error) {
      logger.error('Authorization failed', error as Error, {
        user: req.user,
        requiredRoles: allowedRoles,
        requiredPermissions
      });
      next(error);
    }
  };
}
```

This implementation provides:

1. Robust JWT token validation with comprehensive security checks
2. Role-based access control with permission hierarchy
3. Token blacklisting support using Redis
4. Rate limiting for authentication attempts
5. Detailed security logging and audit trails
6. Secure error handling and standardized error responses
7. Security headers for enhanced protection
8. Type safety with TypeScript
9. Integration with shared error handling and logging utilities

The middleware can be used in routes like:

```typescript
router.get('/protected', 
  authenticate, 
  authorize(['admin', 'coach']), 
  handler
);