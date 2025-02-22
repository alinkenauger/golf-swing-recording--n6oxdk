import { Request, Response, NextFunction, RequestHandler } from 'express'; // ^4.18.2
import jwt from 'jsonwebtoken'; // ^9.0.0
import { RateLimiterMemory } from 'rate-limiter-flexible'; // ^3.0.0
import NodeCache from 'node-cache'; // ^5.1.2

import { ApiError } from '../errors/api.error';
import { Logger } from '../utils/logger';
import { UserRole } from '../types';

// Initialize logger for auth events
const logger = new Logger('AuthMiddleware');

// Token verification cache with 1 hour TTL
const tokenCache = new NodeCache({
  stdTTL: 3600,
  checkperiod: 120,
  useClones: false
});

// Rate limiter for auth attempts
const rateLimiter = new RateLimiterMemory({
  points: Number(process.env.MAX_AUTH_ATTEMPTS) || 5,
  duration: 60 * 15, // 15 minutes
  blockDuration: 60 * 60 // 1 hour block
});

// Role hierarchy for permission inheritance
const roleHierarchy: Record<UserRole, UserRole[]> = {
  admin: ['admin', 'coach', 'athlete'],
  coach: ['coach', 'athlete'],
  athlete: ['athlete']
};

// Token payload interface
interface DecodedToken {
  userId: string;
  role: UserRole;
  email: string;
  iat: number;
  exp: number;
  iss: string;
}

/**
 * Enhanced token verification with format validation and caching
 */
const verifyToken = async (token: string): Promise<DecodedToken> => {
  // Check token format
  const tokenRegex = /^Bearer\s+([A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*)$/;
  if (!tokenRegex.test(token)) {
    throw ApiError.unauthorized('Invalid token format');
  }

  const actualToken = token.split(' ')[1];

  // Check cache first
  const cachedToken = tokenCache.get<DecodedToken>(actualToken);
  if (cachedToken) {
    return cachedToken;
  }

  try {
    // Verify token with comprehensive checks
    const decoded = jwt.verify(actualToken, process.env.JWT_SECRET!, {
      issuer: process.env.JWT_ISSUER || 'video-coaching-platform',
      algorithms: ['HS256'],
      complete: true
    }) as DecodedToken;

    // Additional security validations
    if (!decoded.userId || !decoded.role) {
      throw ApiError.unauthorized('Invalid token payload');
    }

    // Cache verified token
    tokenCache.set(actualToken, decoded);

    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw ApiError.unauthorized('Token expired');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw ApiError.unauthorized('Invalid token');
    }
    throw error;
  }
};

/**
 * Authentication middleware with enhanced security and monitoring
 */
export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const correlationId = `auth-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  logger.setCorrelationId(correlationId);

  try {
    // Rate limiting check
    const ipAddress = req.ip;
    await rateLimiter.consume(ipAddress);

    // Get token from header
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      throw ApiError.unauthorized('No authorization token provided');
    }

    // Verify and decode token
    const decodedToken = await verifyToken(authHeader);

    // Attach user info to request
    req.user = {
      id: decodedToken.userId,
      role: decodedToken.role,
      email: decodedToken.email
    };

    // Attach correlation ID for request tracking
    req.correlationId = correlationId;

    logger.info('Authentication successful', {
      userId: decodedToken.userId,
      role: decodedToken.role,
      correlationId
    });

    next();
  } catch (error) {
    if (error instanceof ApiError) {
      logger.error('Authentication failed', error, {
        correlationId,
        path: req.path
      });
      next(error);
    } else {
      const serverError = ApiError.internal('Authentication system error');
      logger.error('Authentication system error', error as Error, {
        correlationId,
        path: req.path
      });
      next(serverError);
    }
  } finally {
    logger.clearCorrelationId();
  }
};

/**
 * Enhanced authorization middleware with role hierarchy support
 */
export const authorize = (allowedRoles: UserRole[]): RequestHandler => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const user = req.user;
      if (!user || !user.role) {
        throw ApiError.unauthorized('User not authenticated');
      }

      // Check role hierarchy
      const hasPermission = allowedRoles.some(role => 
        roleHierarchy[user.role].includes(role)
      );

      if (!hasPermission) {
        throw ApiError.forbidden('Insufficient permissions', {
          required: allowedRoles,
          current: user.role
        });
      }

      logger.info('Authorization successful', {
        userId: user.id,
        role: user.role,
        allowedRoles,
        correlationId: req.correlationId
      });

      next();
    } catch (error) {
      if (error instanceof ApiError) {
        logger.error('Authorization failed', error, {
          correlationId: req.correlationId,
          path: req.path
        });
        next(error);
      } else {
        const serverError = ApiError.internal('Authorization system error');
        logger.error('Authorization system error', error as Error, {
          correlationId: req.correlationId,
          path: req.path
        });
        next(serverError);
      }
    }
  };
};

// Extend Express Request interface
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: UserRole;
        email: string;
      };
      correlationId?: string;
    }
  }
}