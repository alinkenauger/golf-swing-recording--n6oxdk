import { Request, Response } from 'express';
import { AuthService } from '../services/auth.service';
import { ApiError } from '@shared/errors/api.error';
import { Logger } from '@shared/utils/logger';
import { RateLimiterRedis } from 'rate-limiter-flexible';
import joi from 'joi';
import { ROLES } from '@shared/constants';

// Version comments for dependencies
// express: ^4.18.2
// joi: ^17.9.2
// rate-limiter-flexible: ^2.4.1

// Security configuration constants
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_LOGIN_ATTEMPTS = 5;
const PROGRESSIVE_PENALTY = 2;
const IP_RATE_LIMIT = 100;

// Request validation schemas
const loginSchema = joi.object({
  email: joi.string().email().required(),
  password: joi.string().min(8).required(),
  deviceId: joi.string(),
  deviceType: joi.string()
});

const mfaSchema = joi.object({
  token: joi.string().length(6).required(),
  userId: joi.string().required()
});

const socialLoginSchema = joi.object({
  provider: joi.string().valid('google', 'facebook', 'apple').required(),
  token: joi.string().required(),
  deviceId: joi.string()
});

/**
 * Enhanced authentication controller with comprehensive security measures
 * Implements secure login flows, MFA, and social authentication
 */
export class AuthController {
  private readonly logger: Logger;
  private readonly rateLimiter: RateLimiterRedis;

  constructor(
    private readonly authService: AuthService,
    logger: Logger,
    rateLimiter: RateLimiterRedis
  ) {
    this.logger = logger;
    this.rateLimiter = rateLimiter;
  }

  /**
   * Handles user login with enhanced security measures
   * @param req Express request object
   * @param res Express response object
   */
  public async login(req: Request, res: Response): Promise<void> {
    const correlationId = req.headers['x-correlation-id'] as string;
    this.logger.setCorrelationId(correlationId);

    try {
      // Validate request body
      const { error, value } = loginSchema.validate(req.body);
      if (error) {
        throw ApiError.badRequest('Invalid request payload', { details: error.details });
      }

      // Check IP-based rate limiting
      const ipKey = req.ip;
      await this.rateLimiter.consume(ipKey);

      // Attempt login
      const authResponse = await this.authService.login(
        value.email,
        value.password,
        ipKey
      );

      // Set secure headers
      this.setSecurityHeaders(res);

      // Log successful login
      this.logger.info('User login successful', {
        userId: authResponse.user.id,
        email: value.email,
        deviceId: value.deviceId
      });

      res.status(200).json({
        success: true,
        data: authResponse,
        mfaRequired: authResponse.mfaRequired
      });
    } catch (error) {
      this.handleAuthError(error, req, res);
    } finally {
      this.logger.clearCorrelationId();
    }
  }

  /**
   * Handles social authentication
   * @param req Express request object
   * @param res Express response object
   */
  public async socialLogin(req: Request, res: Response): Promise<void> {
    const correlationId = req.headers['x-correlation-id'] as string;
    this.logger.setCorrelationId(correlationId);

    try {
      // Validate request
      const { error, value } = socialLoginSchema.validate(req.body);
      if (error) {
        throw ApiError.badRequest('Invalid social login payload', { details: error.details });
      }

      // Check rate limiting
      await this.rateLimiter.consume(req.ip);

      const authResponse = await this.authService.socialLogin(
        value.provider,
        value.token,
        value.deviceId
      );

      this.setSecurityHeaders(res);

      this.logger.info('Social login successful', {
        provider: value.provider,
        deviceId: value.deviceId
      });

      res.status(200).json({
        success: true,
        data: authResponse
      });
    } catch (error) {
      this.handleAuthError(error, req, res);
    } finally {
      this.logger.clearCorrelationId();
    }
  }

  /**
   * Handles MFA verification
   * @param req Express request object
   * @param res Express response object
   */
  public async verifyMFA(req: Request, res: Response): Promise<void> {
    const correlationId = req.headers['x-correlation-id'] as string;
    this.logger.setCorrelationId(correlationId);

    try {
      // Validate request
      const { error, value } = mfaSchema.validate(req.body);
      if (error) {
        throw ApiError.badRequest('Invalid MFA payload', { details: error.details });
      }

      const isValid = await this.authService.verifyMFA(
        value.userId,
        value.token
      );

      if (!isValid) {
        throw ApiError.unauthorized('Invalid MFA token');
      }

      this.setSecurityHeaders(res);

      this.logger.info('MFA verification successful', {
        userId: value.userId
      });

      res.status(200).json({
        success: true,
        message: 'MFA verification successful'
      });
    } catch (error) {
      this.handleAuthError(error, req, res);
    } finally {
      this.logger.clearCorrelationId();
    }
  }

  /**
   * Handles MFA setup for users
   * @param req Express request object
   * @param res Express response object
   */
  public async setupMFA(req: Request, res: Response): Promise<void> {
    const correlationId = req.headers['x-correlation-id'] as string;
    this.logger.setCorrelationId(correlationId);

    try {
      const userId = req.user?.id;
      const userRole = req.user?.role;

      if (!userId) {
        throw ApiError.unauthorized('User not authenticated');
      }

      // Check if MFA is required for role
      if (![ROLES.ADMIN, ROLES.COACH].includes(userRole)) {
        throw ApiError.forbidden('MFA setup not allowed for this role');
      }

      const mfaDetails = await this.authService.setupMFA(userId);

      this.setSecurityHeaders(res);

      this.logger.info('MFA setup completed', {
        userId,
        role: userRole
      });

      res.status(200).json({
        success: true,
        data: mfaDetails
      });
    } catch (error) {
      this.handleAuthError(error, req, res);
    } finally {
      this.logger.clearCorrelationId();
    }
  }

  /**
   * Sets security headers for responses
   * @param res Express response object
   */
  private setSecurityHeaders(res: Response): void {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('Content-Security-Policy', "default-src 'self'");
  }

  /**
   * Handles authentication errors with proper logging and response
   * @param error Error object
   * @param req Express request object
   * @param res Express response object
   */
  private handleAuthError(error: any, req: Request, res: Response): void {
    if (error instanceof ApiError) {
      this.logger.warn('Authentication error', {
        errorCode: error.errorCode,
        message: error.message,
        path: req.path
      });

      res.status(error.statusCode).json(error.toJSON());
    } else {
      this.logger.error('Unexpected authentication error', error, {
        path: req.path,
        method: req.method
      });

      const serverError = ApiError.internal('Authentication failed');
      res.status(serverError.statusCode).json(serverError.toJSON());
    }
  }
}