import { injectable } from '@nestjs/common';
import { User } from '../models/user.model';
import { IUser } from '@shared/interfaces';
import { Logger } from '@shared/utils/logger';
import { ValidationUtils } from '@shared/utils/validation';
import { ApiError } from '@shared/errors/api.error';
import { ROLES } from '@shared/constants';

@injectable()
export class UserRepository {
  private readonly logger: Logger;
  private readonly validationUtils: ValidationUtils;

  constructor(logger: Logger, validationUtils: ValidationUtils) {
    this.logger = logger;
    this.validationUtils = validationUtils;
  }

  /**
   * Find user by ID with security checks and logging
   * @param id - User ID to find
   * @returns Promise resolving to user document or null
   */
  async findById(id: string): Promise<IUser | null> {
    try {
      // Validate ID format
      if (!this.validationUtils.validateId(id)) {
        throw ApiError.badRequest('Invalid user ID format');
      }

      this.logger.info('Finding user by ID', { userId: id });

      const user = await User.findById(id)
        .select('-password -mfaSecret -mfaBackupCodes')
        .lean()
        .exec();

      if (!user) {
        this.logger.warn('User not found', { userId: id });
        return null;
      }

      this.logger.debug('User found successfully', { userId: id });
      return user;
    } catch (error) {
      this.logger.error('Error finding user by ID', error as Error, { userId: id });
      throw error;
    }
  }

  /**
   * Find user by email with validation and security checks
   * @param email - Email address to search
   * @returns Promise resolving to user document or null
   */
  async findByEmail(email: string): Promise<IUser | null> {
    try {
      // Validate email format
      if (!this.validationUtils.validateEmail(email)) {
        throw ApiError.badRequest('Invalid email format');
      }

      const sanitizedEmail = this.validationUtils.sanitizeInput(email.toLowerCase());
      
      this.logger.info('Finding user by email', { email: sanitizedEmail });

      const user = await User.findOne({ email: sanitizedEmail })
        .select('-password -mfaSecret -mfaBackupCodes')
        .lean()
        .exec();

      if (!user) {
        this.logger.warn('User not found by email', { email: sanitizedEmail });
        return null;
      }

      this.logger.debug('User found by email successfully', { email: sanitizedEmail });
      return user;
    } catch (error) {
      this.logger.error('Error finding user by email', error as Error, { email });
      throw error;
    }
  }

  /**
   * Create new user with comprehensive validation
   * @param userData - User data to create
   * @returns Promise resolving to created user
   */
  async create(userData: Partial<IUser>): Promise<IUser> {
    try {
      // Validate required fields
      if (!userData.email || !userData.role) {
        throw ApiError.badRequest('Missing required user fields');
      }

      // Validate email format
      if (!this.validationUtils.validateEmail(userData.email)) {
        throw ApiError.badRequest('Invalid email format');
      }

      // Validate role
      if (!Object.values(ROLES).includes(userData.role)) {
        throw ApiError.badRequest('Invalid user role');
      }

      const sanitizedData = {
        ...userData,
        email: this.validationUtils.sanitizeInput(userData.email.toLowerCase()),
      };

      this.logger.info('Creating new user', { email: sanitizedData.email });

      // Check for existing user
      const existingUser = await User.findOne({ email: sanitizedData.email });
      if (existingUser) {
        throw ApiError.conflict('User already exists');
      }

      const user = await User.create(sanitizedData);
      
      this.logger.info('User created successfully', { userId: user.id });
      
      const userDoc = await User.findById(user.id)
        .select('-password -mfaSecret -mfaBackupCodes')
        .lean()
        .exec();

      return userDoc as IUser;
    } catch (error) {
      this.logger.error('Error creating user', error as Error, { userData });
      throw error;
    }
  }

  /**
   * Update user with validation and atomic operations
   * @param id - User ID to update
   * @param updateData - Data to update
   * @returns Promise resolving to updated user
   */
  async update(id: string, updateData: Partial<IUser>): Promise<IUser | null> {
    try {
      // Validate ID format
      if (!this.validationUtils.validateId(id)) {
        throw ApiError.badRequest('Invalid user ID format');
      }

      // Validate email if present
      if (updateData.email && !this.validationUtils.validateEmail(updateData.email)) {
        throw ApiError.badRequest('Invalid email format');
      }

      const sanitizedData = {
        ...updateData,
        email: updateData.email ? 
          this.validationUtils.sanitizeInput(updateData.email.toLowerCase()) : 
          undefined,
      };

      this.logger.info('Updating user', { userId: id });

      const updatedUser = await User.findByIdAndUpdate(
        id,
        { $set: sanitizedData },
        { 
          new: true,
          runValidators: true,
          select: '-password -mfaSecret -mfaBackupCodes'
        }
      ).lean().exec();

      if (!updatedUser) {
        this.logger.warn('User not found for update', { userId: id });
        return null;
      }

      this.logger.info('User updated successfully', { userId: id });
      return updatedUser;
    } catch (error) {
      this.logger.error('Error updating user', error as Error, { userId: id, updateData });
      throw error;
    }
  }

  /**
   * Soft delete user with security checks
   * @param id - User ID to delete
   * @returns Promise resolving to operation success
   */
  async delete(id: string): Promise<boolean> {
    try {
      // Validate ID format
      if (!this.validationUtils.validateId(id)) {
        throw ApiError.badRequest('Invalid user ID format');
      }

      this.logger.info('Soft deleting user', { userId: id });

      const result = await User.updateOne(
        { _id: id },
        { 
          $set: { 
            isDeleted: true,
            deletedAt: new Date(),
          }
        }
      );

      const success = result.modifiedCount > 0;
      
      if (success) {
        this.logger.info('User soft deleted successfully', { userId: id });
      } else {
        this.logger.warn('User not found for deletion', { userId: id });
      }

      return success;
    } catch (error) {
      this.logger.error('Error deleting user', error as Error, { userId: id });
      throw error;
    }
  }

  /**
   * Find all users with pagination and filtering
   * @param filter - Filter criteria
   * @param options - Pagination and sorting options
   * @returns Promise resolving to array of users
   */
  async findAll(
    filter: Partial<IUser> = {},
    options: { 
      page?: number; 
      limit?: number; 
      sortBy?: string; 
      sortOrder?: 'asc' | 'desc';
    } = {}
  ): Promise<{ users: IUser[]; total: number }> {
    try {
      const {
        page = 1,
        limit = 20,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = options;

      // Validate pagination parameters
      if (page < 1 || limit < 1 || limit > 100) {
        throw ApiError.badRequest('Invalid pagination parameters');
      }

      const skip = (page - 1) * limit;

      this.logger.info('Finding all users', { filter, options });

      const [users, total] = await Promise.all([
        User.find({ ...filter, isDeleted: { $ne: true } })
          .select('-password -mfaSecret -mfaBackupCodes')
          .sort({ [sortBy]: sortOrder })
          .skip(skip)
          .limit(limit)
          .lean()
          .exec(),
        User.countDocuments({ ...filter, isDeleted: { $ne: true } })
      ]);

      this.logger.debug('Users found successfully', { 
        count: users.length,
        total,
        page,
        limit
      });

      return { users, total };
    } catch (error) {
      this.logger.error('Error finding users', error as Error, { filter, options });
      throw error;
    }
  }
}