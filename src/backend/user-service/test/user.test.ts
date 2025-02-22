import { UserService } from '../src/services/user.service';
import { UserRepository } from '../src/repositories/user.repository';
import { ApiError } from '@shared/errors/api.error';
import { faker } from '@faker-js/faker';
import { ROLES } from '@shared/constants';
import { IUser, IUserProfile } from '@shared/interfaces';

describe('UserService', () => {
  let userService: UserService;
  let mockUserRepository: jest.SpyInstance;
  let mockLogger: any;
  let mockCacheManager: any;

  // Test data
  const testUserId = 'test-user-123';
  const testEmail = 'test@example.com';
  
  const mockUser: IUser = {
    id: testUserId,
    email: testEmail,
    role: ROLES.ATHLETE,
    profile: {
      firstName: 'John',
      lastName: 'Doe',
      timezone: 'UTC',
      preferences: {
        notifications: true,
        emailUpdates: true,
        language: 'en'
      }
    },
    isActive: true,
    lastLogin: new Date(),
    metadata: {}
  };

  beforeAll(() => {
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn()
    };

    mockCacheManager = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn()
    };

    mockUserRepository = jest.spyOn(UserRepository.prototype, 'findById');
  });

  beforeEach(() => {
    userService = new UserService(new UserRepository(mockLogger), mockLogger, mockCacheManager);
    jest.clearAllMocks();
  });

  describe('getUserById', () => {
    it('should successfully return user when valid ID is provided', async () => {
      mockUserRepository.mockResolvedValueOnce(mockUser);
      mockCacheManager.get.mockResolvedValueOnce(null);

      const result = await userService.getUserById(testUserId);

      expect(result).toEqual(mockUser);
      expect(mockCacheManager.set).toHaveBeenCalledWith(
        `user:${testUserId}`,
        mockUser,
        3600
      );
    });

    it('should return cached user when available', async () => {
      mockCacheManager.get.mockResolvedValueOnce(mockUser);

      const result = await userService.getUserById(testUserId);

      expect(result).toEqual(mockUser);
      expect(mockUserRepository).not.toHaveBeenCalled();
    });

    it('should throw NotFound error for non-existent user ID', async () => {
      mockUserRepository.mockResolvedValueOnce(null);
      mockCacheManager.get.mockResolvedValueOnce(null);

      await expect(userService.getUserById('non-existent')).rejects.toThrow(ApiError);
    });

    it('should handle database errors gracefully', async () => {
      mockUserRepository.mockRejectedValueOnce(new Error('Database error'));
      mockCacheManager.get.mockResolvedValueOnce(null);

      await expect(userService.getUserById(testUserId)).rejects.toThrow();
    });
  });

  describe('updateUserProfile', () => {
    const updateData: Partial<IUserProfile> = {
      firstName: 'Jane',
      lastName: 'Smith',
      timezone: 'UTC',
      preferences: {
        notifications: false,
        emailUpdates: true,
        language: 'es'
      }
    };

    it('should successfully update user profile with valid data', async () => {
      const updatedUser = { ...mockUser, profile: { ...mockUser.profile, ...updateData } };
      mockUserRepository.mockResolvedValueOnce(mockUser);
      jest.spyOn(UserRepository.prototype, 'update').mockResolvedValueOnce(updatedUser);

      const result = await userService.updateUserProfile(testUserId, updateData);

      expect(result).toEqual(updatedUser);
      expect(mockCacheManager.del).toHaveBeenCalledWith(`user:${testUserId}`);
    });

    it('should validate language preference', async () => {
      const invalidData = { ...updateData, preferences: { language: 'invalid' } };
      mockUserRepository.mockResolvedValueOnce(mockUser);

      await expect(userService.updateUserProfile(testUserId, invalidData))
        .rejects.toThrow(ApiError);
    });

    it('should handle concurrent profile updates', async () => {
      mockUserRepository.mockResolvedValueOnce(mockUser);
      jest.spyOn(UserRepository.prototype, 'update').mockResolvedValueOnce(null);

      await expect(userService.updateUserProfile(testUserId, updateData))
        .rejects.toThrow('Failed to update user profile');
    });
  });

  describe('deactivateUser', () => {
    it('should successfully deactivate active user account', async () => {
      mockUserRepository.mockResolvedValueOnce(mockUser);
      jest.spyOn(UserRepository.prototype, 'update').mockResolvedValueOnce({ ...mockUser, isActive: false });

      const result = await userService.deactivateUser(testUserId);

      expect(result).toBe(true);
      expect(mockCacheManager.del).toHaveBeenCalledWith(`user:${testUserId}`);
    });

    it('should throw error for admin account deactivation', async () => {
      const adminUser = { ...mockUser, role: ROLES.ADMIN };
      mockUserRepository.mockResolvedValueOnce(adminUser);

      await expect(userService.deactivateUser(testUserId))
        .rejects.toThrow('Cannot deactivate admin user');
    });

    it('should handle deactivation of non-existent user', async () => {
      mockUserRepository.mockResolvedValueOnce(null);

      await expect(userService.deactivateUser('non-existent'))
        .rejects.toThrow(ApiError);
    });
  });

  describe('updateUserRole', () => {
    it('should successfully update user role with valid role', async () => {
      const newRole = ROLES.COACH;
      const updatedUser = { ...mockUser, role: newRole };
      mockUserRepository.mockResolvedValueOnce(mockUser);
      jest.spyOn(UserRepository.prototype, 'update').mockResolvedValueOnce(updatedUser);

      const result = await userService.updateUserRole(testUserId, newRole);

      expect(result.role).toBe(newRole);
      expect(mockCacheManager.del).toHaveBeenCalledWith(`user:${testUserId}`);
    });

    it('should prevent admin role demotion', async () => {
      const adminUser = { ...mockUser, role: ROLES.ADMIN };
      mockUserRepository.mockResolvedValueOnce(adminUser);

      await expect(userService.updateUserRole(testUserId, ROLES.COACH))
        .rejects.toThrow('Cannot demote admin user');
    });

    it('should handle role update failures', async () => {
      mockUserRepository.mockResolvedValueOnce(mockUser);
      jest.spyOn(UserRepository.prototype, 'update').mockResolvedValueOnce(null);

      await expect(userService.updateUserRole(testUserId, ROLES.COACH))
        .rejects.toThrow('Failed to update user role');
    });
  });

  describe('getUsersByRole', () => {
    const mockUsers = [mockUser];
    const mockPaginatedResponse = { users: mockUsers, total: 1 };

    it('should return correctly filtered users by role', async () => {
      mockCacheManager.get.mockResolvedValueOnce(null);
      jest.spyOn(UserRepository.prototype, 'findByRole').mockResolvedValueOnce(mockPaginatedResponse);

      const result = await userService.getUsersByRole(ROLES.ATHLETE);

      expect(result).toEqual(mockPaginatedResponse);
      expect(mockCacheManager.set).toHaveBeenCalled();
    });

    it('should return cached results when available', async () => {
      mockCacheManager.get.mockResolvedValueOnce(mockPaginatedResponse);

      const result = await userService.getUsersByRole(ROLES.ATHLETE);

      expect(result).toEqual(mockPaginatedResponse);
      expect(UserRepository.prototype.findByRole).not.toHaveBeenCalled();
    });

    it('should handle pagination parameters correctly', async () => {
      mockCacheManager.get.mockResolvedValueOnce(null);
      jest.spyOn(UserRepository.prototype, 'findByRole').mockResolvedValueOnce(mockPaginatedResponse);

      await userService.getUsersByRole(ROLES.ATHLETE, 2, 10);

      expect(UserRepository.prototype.findByRole).toHaveBeenCalledWith(
        ROLES.ATHLETE,
        { page: 2, limit: 10 }
      );
    });

    it('should handle empty result sets', async () => {
      mockCacheManager.get.mockResolvedValueOnce(null);
      jest.spyOn(UserRepository.prototype, 'findByRole').mockResolvedValueOnce({ users: [], total: 0 });

      const result = await userService.getUsersByRole(ROLES.COACH);

      expect(result.users).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });
});