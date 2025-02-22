/**
 * User Service Implementation
 * Handles user-related operations with comprehensive security, validation, and error handling
 * @version 1.0.0
 */

import { ApiClient } from '../lib/api';
import { API_ROUTES } from '../constants/api';
import { User, UserProfile, UserPreferences, UserStats } from '../types/user';
import { ApiResponse, HttpStatusCode } from '../types/common';

/**
 * Service configuration interface
 */
interface ServiceConfig {
  maxRetries?: number;
  requestTimeout?: number;
  cacheExpiry?: number;
}

/**
 * Options for retrieving user statistics
 */
interface StatOptions {
  period?: 'day' | 'week' | 'month' | 'year';
  includeProgress?: boolean;
  includeRevenue?: boolean;
}

/**
 * Options for account deletion
 */
interface DeleteOptions {
  exportData?: boolean;
  reason?: string;
  confirmationToken: string;
}

/**
 * User service class for managing user operations with enhanced security and validation
 */
export class UserService {
  private readonly apiClient: ApiClient;
  private readonly maxRetries: number;
  private readonly requestTimeout: number;
  private readonly cacheExpiry: number;
  private readonly cacheKey = 'user_data';

  constructor(apiClient: ApiClient, config: ServiceConfig = {}) {
    this.apiClient = apiClient;
    this.maxRetries = config.maxRetries || 3;
    this.requestTimeout = config.requestTimeout || 30000;
    this.cacheExpiry = config.cacheExpiry || 300000; // 5 minutes
  }

  /**
   * Retrieves current user profile with caching
   * @returns Promise<User> Current user data with role information
   * @throws ApiError if request fails
   */
  public async getCurrentUser(): Promise<User> {
    try {
      // Check cache first
      const cachedData = this.getCachedUser();
      if (cachedData) {
        return cachedData;
      }

      const response = await this.apiClient.get<User>(
        `${API_ROUTES.AUTH.VERIFY}`,
        {
          timeout: this.requestTimeout,
          skipRetry: false
        }
      );

      if (!response.success || !response.data) {
        throw new Error('Failed to fetch user data');
      }

      // Cache the response
      this.cacheUser(response.data);
      return response.data;
    } catch (error) {
      this.clearCache();
      throw error;
    }
  }

  /**
   * Updates user profile information with validation
   * @param profile Updated profile data
   * @returns Promise<User> Updated user data
   * @throws ApiError if validation fails or update fails
   */
  public async updateProfile(profile: Partial<UserProfile>): Promise<User> {
    try {
      this.validateProfileData(profile);

      const response = await this.apiClient.put<Partial<UserProfile>, User>(
        `${API_ROUTES.AUTH.VERIFY}`,
        profile,
        {
          timeout: this.requestTimeout
        }
      );

      if (!response.success || !response.data) {
        throw new Error('Failed to update profile');
      }

      // Update cache with new data
      this.cacheUser(response.data);
      return response.data;
    } catch (error) {
      this.clearCache();
      throw error;
    }
  }

  /**
   * Updates user preferences with validation
   * @param preferences Updated preferences
   * @returns Promise<User> Updated user data
   * @throws ApiError if validation fails or update fails
   */
  public async updatePreferences(preferences: Partial<UserPreferences>): Promise<User> {
    try {
      this.validatePreferences(preferences);

      const response = await this.apiClient.put<Partial<UserPreferences>, User>(
        `${API_ROUTES.AUTH.VERIFY}/preferences`,
        preferences,
        {
          timeout: this.requestTimeout
        }
      );

      if (!response.success || !response.data) {
        throw new Error('Failed to update preferences');
      }

      // Update cache and local storage
      this.cacheUser(response.data);
      this.updateLocalPreferences(preferences);
      return response.data;
    } catch (error) {
      this.clearCache();
      throw error;
    }
  }

  /**
   * Retrieves user statistics and activity data
   * @param userId User ID to fetch stats for
   * @param options Stats configuration options
   * @returns Promise<UserStats> User statistics data
   * @throws ApiError if fetch fails or unauthorized
   */
  public async getUserStats(userId: string, options: StatOptions = {}): Promise<UserStats> {
    try {
      const response = await this.apiClient.get<UserStats>(
        `${API_ROUTES.AUTH.VERIFY}/${userId}/stats`,
        {
          params: options,
          timeout: this.requestTimeout
        }
      );

      if (!response.success || !response.data) {
        throw new Error('Failed to fetch user statistics');
      }

      return response.data;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Permanently deletes user account with GDPR compliance
   * @param options Deletion options including confirmation
   * @returns Promise<void>
   * @throws ApiError if deletion fails
   */
  public async deleteAccount(options: DeleteOptions): Promise<void> {
    try {
      if (!options.confirmationToken) {
        throw new Error('Confirmation token required for account deletion');
      }

      await this.apiClient.delete(
        `${API_ROUTES.AUTH.VERIFY}`,
        {
          data: options,
          timeout: this.requestTimeout
        }
      );

      // Clear all local data
      this.clearCache();
      localStorage.clear();
      sessionStorage.clear();
    } catch (error) {
      throw error;
    }
  }

  /**
   * Validates profile data against schema
   * @private
   */
  private validateProfileData(profile: Partial<UserProfile>): void {
    if (profile.firstName && profile.firstName.length < 2) {
      throw new Error('First name must be at least 2 characters');
    }
    if (profile.lastName && profile.lastName.length < 2) {
      throw new Error('Last name must be at least 2 characters');
    }
    if (profile.phoneNumber && !/^\+?[\d\s-]{10,}$/.test(profile.phoneNumber)) {
      throw new Error('Invalid phone number format');
    }
  }

  /**
   * Validates user preferences
   * @private
   */
  private validatePreferences(preferences: Partial<UserPreferences>): void {
    if (preferences.theme && !['light', 'dark', 'system'].includes(preferences.theme)) {
      throw new Error('Invalid theme selection');
    }
    if (preferences.language && !/^[a-z]{2}-[A-Z]{2}$/.test(preferences.language)) {
      throw new Error('Invalid language format');
    }
  }

  /**
   * Manages user data caching
   * @private
   */
  private cacheUser(userData: User): void {
    const cacheData = {
      data: userData,
      timestamp: Date.now()
    };
    localStorage.setItem(this.cacheKey, JSON.stringify(cacheData));
  }

  /**
   * Retrieves cached user data if valid
   * @private
   */
  private getCachedUser(): User | null {
    const cached = localStorage.getItem(this.cacheKey);
    if (!cached) return null;

    const { data, timestamp } = JSON.parse(cached);
    if (Date.now() - timestamp > this.cacheExpiry) {
      this.clearCache();
      return null;
    }

    return data;
  }

  /**
   * Clears cached user data
   * @private
   */
  private clearCache(): void {
    localStorage.removeItem(this.cacheKey);
  }

  /**
   * Updates local storage preferences
   * @private
   */
  private updateLocalPreferences(preferences: Partial<UserPreferences>): void {
    if (preferences.theme) {
      localStorage.setItem('theme', preferences.theme);
    }
    if (preferences.language) {
      localStorage.setItem('language', preferences.language);
    }
  }
}