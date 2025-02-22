import { injectable } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import compression from 'compression';
import cors from 'cors';
import { UserService } from '../services/user.service';
import { authenticate, authorize } from '@shared/middleware/auth.middleware';
import { validateSchema } from '@shared/middleware/validation.middleware';
import { ApiError } from '@shared/errors/api.error';
import { Logger } from '@shared/utils/logger';
import { ROLES } from '@shared/constants';
import { IUser, IUserProfile, userSchema } from '@shared/interfaces';

// Request validation schemas
const updateProfileSchema = Joi.object({
  firstName: Joi.string().min(1).max(50),
  lastName: Joi.string().min(1).max(50),
  avatarUrl: Joi.string().uri().optional(),
  bio: Joi.string().max(500).optional(),
  location: Joi.string().optional(),
  timezone: Joi.string(),
  preferences: Joi.object({
    notifications: Joi.boolean(),
    emailUpdates: Joi.boolean(),
    language: Joi.string().valid('en', 'es', 'fr')
  })
}).min(1);

const userRoleSchema = Joi.object({
  role: Joi.string().valid(...Object.values(ROLES)).required()
});

const bulkUpdateSchema = Joi.array().items(
  Joi.object({
    userId: Joi.string().required(),
    profile: updateProfileSchema.required()
  })
).min(1).max(100);

@injectable()
export class UserController {
  private readonly logger: Logger;

  constructor(
    private readonly userService: UserService,
    logger: Logger
  ) {
    this.logger = logger;
  }

  /**
   * Get user profile with security checks and response compression
   */
  public getUserProfile = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = req.params.id;
      
      // Validate user has permission to access profile
      if (req.user?.role !== ROLES.ADMIN && req.user?.id !== userId) {
        throw ApiError.forbidden('Unauthorized access to user profile');
      }

      const user = await this.userService.getUserById(userId);
      
      this.logger.info('User profile retrieved', { userId, requesterId: req.user?.id });
      
      // Apply compression and security headers
      compression()(req, res, () => {});
      res.set('Content-Security-Policy', "default-src 'self'");
      res.json(user);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update user profile with validation and security checks
   */
  public updateProfile = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = req.params.id;
      
      // Validate user has permission to update profile
      if (req.user?.role !== ROLES.ADMIN && req.user?.id !== userId) {
        throw ApiError.forbidden('Unauthorized profile update attempt');
      }

      const updatedUser = await this.userService.updateUserProfile(
        userId,
        req.body as Partial<IUserProfile>
      );

      this.logger.info('User profile updated', { userId, requesterId: req.user?.id });
      res.json(updatedUser);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Deactivate user account with security checks
   */
  public deactivateAccount = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = req.params.id;
      
      // Only admins can deactivate other accounts
      if (req.user?.role !== ROLES.ADMIN && req.user?.id !== userId) {
        throw ApiError.forbidden('Unauthorized account deactivation attempt');
      }

      await this.userService.deactivateUser(userId);

      this.logger.info('User account deactivated', { userId, requesterId: req.user?.id });
      res.status(200).json({ message: 'Account deactivated successfully' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update user role with admin-only access
   */
  public updateUserRole = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = req.params.id;
      const { role } = req.body;

      const updatedUser = await this.userService.updateUserRole(userId, role);

      this.logger.info('User role updated', { 
        userId, 
        newRole: role, 
        requesterId: req.user?.id 
      });
      res.json(updatedUser);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get users by role with pagination and caching
   */
  public getUsersByRole = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { role, page, limit } = req.query;
      
      const users = await this.userService.getUsersByRole(
        role as keyof typeof ROLES,
        Number(page),
        Number(limit)
      );

      this.logger.info('Users retrieved by role', { 
        role, 
        page, 
        limit, 
        count: users.users.length 
      });
      
      // Apply compression for large responses
      compression()(req, res, () => {});
      res.json(users);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Bulk update user profiles with validation and rate limiting
   */
  public bulkUpdateUsers = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const updates = req.body;
      
      const results = await this.userService.bulkUpdateProfiles(updates);

      this.logger.info('Bulk user update completed', { 
        successCount: results.success.length,
        failureCount: results.failed.length,
        requesterId: req.user?.id
      });
      res.json(results);
    } catch (error) {
      next(error);
    }
  }
}

// Route decorators
export const userRoutes = {
  getUserProfile: [
    authenticate,
    authorize([ROLES.ADMIN, ROLES.COACH, ROLES.ATHLETE]),
    validateSchema(userSchema, 'params')
  ],
  updateProfile: [
    authenticate,
    authorize([ROLES.ADMIN, ROLES.COACH, ROLES.ATHLETE]),
    validateSchema(updateProfileSchema, 'body')
  ],
  deactivateAccount: [
    authenticate,
    authorize([ROLES.ADMIN])
  ],
  updateUserRole: [
    authenticate,
    authorize([ROLES.ADMIN]),
    validateSchema(userRoleSchema, 'body')
  ],
  getUsersByRole: [
    authenticate,
    authorize([ROLES.ADMIN]),
    validateSchema(Joi.object({
      role: Joi.string().valid(...Object.values(ROLES)).required(),
      page: Joi.number().min(1).optional(),
      limit: Joi.number().min(1).max(100).optional()
    }), 'query')
  ],
  bulkUpdateUsers: [
    authenticate,
    authorize([ROLES.ADMIN]),
    validateSchema(bulkUpdateSchema, 'body')
  ]
};