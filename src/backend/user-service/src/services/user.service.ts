import { injectable } from '@nestjs/common';
import { UserRepository } from '../repositories/user.repository';
import { IUser, IUserProfile } from '@shared/interfaces';
import { ApiError } from '@shared/errors/api.error';
import { Logger } from '@shared/utils/logger';
import { ROLES } from '@shared/constants';
import { Cache } from 'cache-manager'; // @types/cache-manager ^5.0.0
import { validateEmail } from '@shared/utils/validation';

@injectable()
export class UserService {
  private readonly CACHE_TTL = 3600; // 1 hour
  private readonly CACHE_PREFIX = 'user:';

  constructor(
    private readonly userRepository: UserRepository,
    private readonly logger: Logger,
    private readonly cacheManager: Cache
  ) {
    this.logger = new Logger('UserService');
  }

  /**
   * Retrieve user by ID with caching and security checks
   * @param userId - User ID to retrieve
   * @returns Promise resolving to user data
   */
  async getUserById(userId: string): Promise<IUser> {
    try {
      // Check cache first
      const cacheKey = `${this.CACHE_PREFIX}${userId}`;
      const cachedUser = await this.cacheManager.get<IUser>(cacheKey);
      
      if (cachedUser) {
        this.logger.debug('User retrieved from cache', { userId });
        return cachedUser;
      }

      const user = await this.userRepository.findById(userId);
      if (!user) {
        throw ApiError.notFound('User not found');
      }

      // Cache user data
      await this.cacheManager.set(cacheKey, user, this.CACHE_TTL);
      
      this.logger.info('User retrieved successfully', { userId });
      return user;
    } catch (error) {
      this.logger.error('Error retrieving user', error as Error, { userId });
      throw error;
    }
  }

  /**
   * Update user profile with validation and security checks
   * @param userId - User ID to update
   * @param profileData - Profile data to update
   * @returns Promise resolving to updated user
   */
  async updateUserProfile(userId: string, profileData: Partial<IUserProfile>): Promise<IUser> {
    try {
      const user = await this.userRepository.findById(userId);
      if (!user) {
        throw ApiError.notFound('User not found');
      }

      // Validate profile data
      if (profileData.preferences?.language && 
          !['en', 'es', 'fr'].includes(profileData.preferences.language)) {
        throw ApiError.badRequest('Invalid language selection');
      }

      const updatedUser = await this.userRepository.update(userId, { profile: profileData });
      if (!updatedUser) {
        throw ApiError.internal('Failed to update user profile');
      }

      // Invalidate cache
      await this.cacheManager.del(`${this.CACHE_PREFIX}${userId}`);

      this.logger.info('User profile updated successfully', { userId });
      return updatedUser;
    } catch (error) {
      this.logger.error('Error updating user profile', error as Error, { userId, profileData });
      throw error;
    }
  }

  /**
   * Update user role with permission validation
   * @param userId - User ID to update
   * @param newRole - New role to assign
   * @returns Promise resolving to updated user
   */
  async updateUserRole(userId: string, newRole: keyof typeof ROLES): Promise<IUser> {
    try {
      const user = await this.userRepository.findById(userId);
      if (!user) {
        throw ApiError.notFound('User not found');
      }

      // Validate role transition
      if (user.role === ROLES.ADMIN && newRole !== ROLES.ADMIN) {
        throw ApiError.forbidden('Cannot demote admin user');
      }

      const updatedUser = await this.userRepository.update(userId, { role: newRole });
      if (!updatedUser) {
        throw ApiError.internal('Failed to update user role');
      }

      // Invalidate cache
      await this.cacheManager.del(`${this.CACHE_PREFIX}${userId}`);

      this.logger.info('User role updated successfully', { userId, oldRole: user.role, newRole });
      return updatedUser;
    } catch (error) {
      this.logger.error('Error updating user role', error as Error, { userId, newRole });
      throw error;
    }
  }

  /**
   * Deactivate user account with security checks
   * @param userId - User ID to deactivate
   * @returns Promise resolving to operation success
   */
  async deactivateUser(userId: string): Promise<boolean> {
    try {
      const user = await this.userRepository.findById(userId);
      if (!user) {
        throw ApiError.notFound('User not found');
      }

      if (user.role === ROLES.ADMIN) {
        throw ApiError.forbidden('Cannot deactivate admin user');
      }

      const updated = await this.userRepository.update(userId, { 
        isActive: false,
        metadata: {
          ...user.metadata,
          deactivatedAt: new Date().toISOString(),
        }
      });

      if (!updated) {
        throw ApiError.internal('Failed to deactivate user');
      }

      // Invalidate cache
      await this.cacheManager.del(`${this.CACHE_PREFIX}${userId}`);

      this.logger.info('User deactivated successfully', { userId });
      return true;
    } catch (error) {
      this.logger.error('Error deactivating user', error as Error, { userId });
      throw error;
    }
  }

  /**
   * Get users by role with pagination
   * @param role - Role to filter by
   * @param page - Page number
   * @param limit - Items per page
   * @returns Promise resolving to paginated users
   */
  async getUsersByRole(
    role: keyof typeof ROLES,
    page: number = 1,
    limit: number = 20
  ): Promise<{ users: IUser[]; total: number }> {
    try {
      const cacheKey = `${this.CACHE_PREFIX}role:${role}:${page}:${limit}`;
      const cached = await this.cacheManager.get<{ users: IUser[]; total: number }>(cacheKey);

      if (cached) {
        this.logger.debug('Users by role retrieved from cache', { role, page, limit });
        return cached;
      }

      const users = await this.userRepository.findByRole(role, { page, limit });

      // Cache results
      await this.cacheManager.set(cacheKey, users, this.CACHE_TTL);

      this.logger.info('Users retrieved by role successfully', { role, count: users.users.length });
      return users;
    } catch (error) {
      this.logger.error('Error retrieving users by role', error as Error, { role, page, limit });
      throw error;
    }
  }

  /**
   * Bulk update user profiles with validation
   * @param updates - Array of user updates
   * @returns Promise resolving to update results
   */
  async bulkUpdateProfiles(
    updates: Array<{ userId: string; profile: Partial<IUserProfile> }>
  ): Promise<{ success: string[]; failed: string[] }> {
    try {
      const results = { success: [] as string[], failed: [] as string[] };

      for (const update of updates) {
        try {
          await this.updateUserProfile(update.userId, update.profile);
          results.success.push(update.userId);
        } catch (error) {
          results.failed.push(update.userId);
          this.logger.warn('Failed to update user in bulk operation', { 
            userId: update.userId, 
            error: error instanceof Error ? error.message : 'Unknown error' 
          });
        }
      }

      this.logger.info('Bulk profile update completed', {
        totalProcessed: updates.length,
        successCount: results.success.length,
        failureCount: results.failed.length
      });

      return results;
    } catch (error) {
      this.logger.error('Error in bulk profile update', error as Error);
      throw error;
    }
  }
}