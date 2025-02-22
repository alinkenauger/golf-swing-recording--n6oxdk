/**
 * Enhanced service class for managing coach-related operations with caching and analytics
 * @version 1.0.0
 */

import { ApiClient } from '../lib/api';
import { Coach, Program, CoachStatus, VerificationStatus } from '../types/coach';
import { ApiResponse, PaginatedResponse } from '../types/common';
import { cacheManager } from 'cache-manager'; // ^5.0.0

// API endpoints for coach operations
const COACH_API_ENDPOINTS = {
  GET_PROFILE: '/coaches/:id',
  UPDATE_PROFILE: '/coaches/:id',
  CREATE_PROGRAM: '/coaches/:id/programs',
  GET_PROGRAMS: '/coaches/:id/programs',
  GET_ANALYTICS: '/coaches/:id/analytics',
  GET_REVENUE: '/coaches/:id/revenue'
} as const;

// Cache configuration
const CACHE_CONFIG = {
  ttl: 300, // 5 minutes
  max: 100,
  store: 'memory'
} as const;

// Analytics filter interface
interface AnalyticsFilter {
  startDate?: string;
  endDate?: string;
  programId?: string;
  metrics?: string[];
}

// Revenue analytics interface
interface RevenueAnalytics {
  totalEarnings: number;
  monthlyEarnings: {
    month: string;
    amount: number;
  }[];
  programRevenue: {
    programId: string;
    revenue: number;
    enrollments: number;
  }[];
}

// Coach analytics interface
interface CoachAnalytics {
  profileViews: number;
  totalStudents: number;
  activeStudents: number;
  completionRate: number;
  averageRating: number;
  revenue: RevenueAnalytics;
  programPerformance: {
    programId: string;
    enrollments: number;
    completionRate: number;
    averageRating: number;
    revenue: number;
  }[];
}

/**
 * Enhanced service class for managing coach-related operations
 */
export class CoachService {
  private readonly cacheManager: typeof cacheManager;
  private readonly CACHE_PREFIX = 'coach_';

  constructor(
    private readonly apiClient: ApiClient,
    cacheManager: typeof cacheManager
  ) {
    this.cacheManager = cacheManager.caching(CACHE_CONFIG);
  }

  /**
   * Retrieves coach profile by ID with caching
   * @param coachId - The unique identifier of the coach
   * @returns Promise resolving to coach profile data
   */
  public async getCoachProfile(coachId: string): Promise<ApiResponse<Coach>> {
    const cacheKey = `${this.CACHE_PREFIX}profile_${coachId}`;
    
    // Try to get from cache first
    const cachedProfile = await this.cacheManager.get<ApiResponse<Coach>>(cacheKey);
    if (cachedProfile) {
      return cachedProfile;
    }

    const endpoint = COACH_API_ENDPOINTS.GET_PROFILE.replace(':id', coachId);
    const response = await this.apiClient.get<Coach>(endpoint);

    // Cache the response
    await this.cacheManager.set(cacheKey, response);
    
    return response;
  }

  /**
   * Updates coach profile information
   * @param coachId - The unique identifier of the coach
   * @param profileData - Updated profile data
   */
  public async updateProfile(coachId: string, profileData: Partial<Coach>): Promise<ApiResponse<Coach>> {
    const endpoint = COACH_API_ENDPOINTS.UPDATE_PROFILE.replace(':id', coachId);
    const response = await this.apiClient.put<Partial<Coach>, Coach>(endpoint, profileData);
    
    // Invalidate cache
    const cacheKey = `${this.CACHE_PREFIX}profile_${coachId}`;
    await this.cacheManager.del(cacheKey);
    
    return response;
  }

  /**
   * Creates a new training program
   * @param coachId - The unique identifier of the coach
   * @param programData - Program creation data
   */
  public async createProgram(coachId: string, programData: Partial<Program>): Promise<ApiResponse<Program>> {
    const endpoint = COACH_API_ENDPOINTS.CREATE_PROGRAM.replace(':id', coachId);
    return this.apiClient.post<Partial<Program>, Program>(endpoint, programData);
  }

  /**
   * Retrieves coach's training programs with pagination
   * @param coachId - The unique identifier of the coach
   * @param page - Page number
   * @param pageSize - Number of items per page
   */
  public async getPrograms(
    coachId: string,
    page: number = 1,
    pageSize: number = 10
  ): Promise<ApiResponse<PaginatedResponse<Program>>> {
    const endpoint = `${COACH_API_ENDPOINTS.GET_PROGRAMS.replace(':id', coachId)}?page=${page}&pageSize=${pageSize}`;
    return this.apiClient.get<PaginatedResponse<Program>>(endpoint);
  }

  /**
   * Retrieves comprehensive coach analytics including revenue and program performance
   * @param coachId - The unique identifier of the coach
   * @param filter - Analytics filter parameters
   */
  public async getAnalytics(coachId: string, filter?: AnalyticsFilter): Promise<ApiResponse<CoachAnalytics>> {
    const endpoint = COACH_API_ENDPOINTS.GET_ANALYTICS.replace(':id', coachId);
    
    const queryParams = new URLSearchParams();
    if (filter?.startDate) queryParams.append('startDate', filter.startDate);
    if (filter?.endDate) queryParams.append('endDate', filter.endDate);
    if (filter?.programId) queryParams.append('programId', filter.programId);
    if (filter?.metrics) queryParams.append('metrics', filter.metrics.join(','));

    const url = `${endpoint}?${queryParams.toString()}`;
    return this.apiClient.get<CoachAnalytics>(url);
  }

  /**
   * Retrieves detailed revenue analytics for the coach
   * @param coachId - The unique identifier of the coach
   * @param startDate - Start date for revenue analysis
   * @param endDate - End date for revenue analysis
   */
  public async getRevenueAnalytics(
    coachId: string,
    startDate?: string,
    endDate?: string
  ): Promise<ApiResponse<RevenueAnalytics>> {
    const endpoint = COACH_API_ENDPOINTS.GET_REVENUE.replace(':id', coachId);
    
    const queryParams = new URLSearchParams();
    if (startDate) queryParams.append('startDate', startDate);
    if (endDate) queryParams.append('endDate', endDate);

    const url = `${endpoint}?${queryParams.toString()}`;
    return this.apiClient.get<RevenueAnalytics>(url);
  }

  /**
   * Updates coach verification status
   * @param coachId - The unique identifier of the coach
   * @param status - New verification status
   */
  public async updateVerificationStatus(
    coachId: string,
    status: VerificationStatus
  ): Promise<ApiResponse<Coach>> {
    return this.updateProfile(coachId, { verificationStatus: status });
  }

  /**
   * Updates coach account status
   * @param coachId - The unique identifier of the coach
   * @param status - New account status
   */
  public async updateAccountStatus(
    coachId: string,
    status: CoachStatus
  ): Promise<ApiResponse<Coach>> {
    return this.updateProfile(coachId, { status });
  }
}

// Export singleton instance
export const coachService = new CoachService(
  new ApiClient(process.env.NEXT_PUBLIC_API_URL || ''),
  cacheManager
);