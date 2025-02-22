import { jest } from '@jest/globals';
import { CoachService } from '../src/services/coach.service';
import { CoachRepository } from '../src/repositories/coach.repository';
import { AuditLogger } from '@common/audit-logger';
import { BusinessError, BUSINESS_ERROR_CODES } from '../../../shared/errors/business.error';
import { Coach } from '../src/models/coach.model';
import { PaginationParams } from '../../../shared/types';

// Mock implementations
jest.mock('../src/repositories/coach.repository');
jest.mock('@common/audit-logger');

describe('CoachService', () => {
  let coachService: CoachService;
  let coachRepositoryMock: jest.Mocked<CoachRepository>;
  let auditLoggerMock: jest.Mocked<AuditLogger>;

  // Test data generators
  const createMockCoach = (overrides = {}): Partial<Coach> => ({
    userId: 'test-user-id',
    specialties: ['Tennis', 'Golf'],
    certifications: [
      {
        name: 'Advanced Tennis Coach',
        issuer: 'Tennis Association',
        issueDate: new Date('2023-01-01'),
        verificationStatus: 'pending'
      }
    ],
    experience: 5,
    hourlyRate: 75,
    rating: 4.5,
    reviewCount: 10,
    studentCount: 5,
    totalEarnings: 1000,
    verificationStatus: 'pending',
    availability: {
      days: ['Monday', 'Wednesday', 'Friday'],
      timeSlots: [{ start: '09:00', end: '17:00' }],
      timezone: 'UTC'
    },
    status: 'active',
    ...overrides
  });

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Initialize mocks
    coachRepositoryMock = {
      createCoach: jest.fn(),
      findCoachById: jest.fn(),
      updateCoach: jest.fn(),
      updateEarningsWithAudit: jest.fn(),
      findCoachesWithFilters: jest.fn(),
      updateVerificationStatus: jest.fn()
    } as unknown as jest.Mocked<CoachRepository>;

    auditLoggerMock = {
      logEvent: jest.fn(),
      logAudit: jest.fn()
    } as unknown as jest.Mocked<AuditLogger>;

    // Initialize service with mocks
    coachService = new CoachService(coachRepositoryMock, auditLoggerMock);
  });

  describe('createCoachProfile', () => {
    it('should create a new coach profile successfully', async () => {
      const mockCoachData = createMockCoach();
      const expectedCoach = { ...mockCoachData, id: 'new-coach-id' };

      coachRepositoryMock.findCoachById.mockResolvedValue(null);
      coachRepositoryMock.createCoach.mockResolvedValue(expectedCoach as Coach);

      const result = await coachService.createCoachProfile(mockCoachData);

      expect(result).toEqual(expectedCoach);
      expect(coachRepositoryMock.createCoach).toHaveBeenCalledWith({
        ...mockCoachData,
        verificationStatus: 'pending',
        rating: 0,
        reviewCount: 0,
        studentCount: 0,
        totalEarnings: 0
      });
      expect(auditLoggerMock.logAudit).toHaveBeenCalledWith(
        'COACH_PROFILE_CREATED',
        { coachId: expectedCoach.id, userId: mockCoachData.userId }
      );
    });

    it('should throw error when creating duplicate coach profile', async () => {
      const mockCoachData = createMockCoach();
      coachRepositoryMock.findCoachById.mockResolvedValue(mockCoachData as Coach);

      await expect(coachService.createCoachProfile(mockCoachData))
        .rejects
        .toThrow(BusinessError);
      expect(coachRepositoryMock.createCoach).not.toHaveBeenCalled();
    });

    it('should validate required fields', async () => {
      const invalidCoachData = createMockCoach({ specialties: [] });

      await expect(coachService.createCoachProfile(invalidCoachData))
        .rejects
        .toThrow('Missing required coach profile data');
    });
  });

  describe('updateCoachProfile', () => {
    it('should update coach profile successfully', async () => {
      const mockCoach = createMockCoach();
      const updateData = {
        hourlyRate: 85,
        specialties: ['Tennis', 'Golf', 'Swimming']
      };

      coachRepositoryMock.updateCoach.mockResolvedValue({ ...mockCoach, ...updateData } as Coach);

      const result = await coachService.updateCoachProfile('test-coach-id', updateData);

      expect(result.hourlyRate).toBe(85);
      expect(result.specialties).toContain('Swimming');
      expect(auditLoggerMock.logAudit).toHaveBeenCalledWith(
        'COACH_PROFILE_UPDATED',
        { coachId: 'test-coach-id', updatedFields: Object.keys(updateData) }
      );
    });

    it('should handle certification updates correctly', async () => {
      const updateData = {
        certifications: [
          {
            name: 'New Certification',
            issuer: 'Sports Authority',
            issueDate: new Date()
          }
        ]
      };

      await coachService.updateCoachProfile('test-coach-id', updateData);

      expect(coachRepositoryMock.updateCoach).toHaveBeenCalledWith(
        'test-coach-id',
        {
          certifications: [
            {
              ...updateData.certifications[0],
              verificationStatus: 'pending'
            }
          ]
        }
      );
    });

    it('should prevent direct updates to verification status', async () => {
      const updateData = {
        verificationStatus: 'verified'
      };

      await expect(coachService.updateCoachProfile('test-coach-id', updateData))
        .rejects
        .toThrow('Cannot directly update verification status or earnings');
    });
  });

  describe('updateCoachEarnings', () => {
    it('should update earnings with audit trail', async () => {
      const earningsData = {
        amount: 100,
        transactionId: 'tx-123',
        type: 'session' as const
      };

      await coachService.updateCoachEarnings('test-coach-id', earningsData);

      expect(coachRepositoryMock.updateEarningsWithAudit).toHaveBeenCalledWith(
        'test-coach-id',
        earningsData
      );
      expect(auditLoggerMock.logAudit).toHaveBeenCalledWith(
        'COACH_EARNINGS_UPDATED',
        {
          coachId: 'test-coach-id',
          amount: earningsData.amount,
          transactionId: earningsData.transactionId
        }
      );
    });

    it('should validate earnings amount', async () => {
      const invalidEarningsData = {
        amount: -50,
        transactionId: 'tx-123',
        type: 'session' as const
      };

      await expect(coachService.updateCoachEarnings('test-coach-id', invalidEarningsData))
        .rejects
        .toThrow('Invalid earnings amount');
    });
  });

  describe('searchCoaches', () => {
    it('should search coaches with filters successfully', async () => {
      const searchParams = {
        specialties: ['Tennis'],
        minRating: 4,
        maxHourlyRate: 100,
        availability: ['Monday', 'Wednesday']
      };

      const paginationParams: PaginationParams = {
        page: 1,
        limit: 10,
        sortBy: 'rating',
        sortOrder: 'desc'
      };

      const mockSearchResult = {
        coaches: [createMockCoach()],
        total: 1,
        metadata: { page: 1, limit: 10, total: 1 }
      };

      coachRepositoryMock.findCoachesWithFilters.mockResolvedValue(mockSearchResult);

      const result = await coachService.searchCoaches(searchParams, paginationParams);

      expect(result).toEqual(mockSearchResult);
      expect(coachRepositoryMock.findCoachesWithFilters).toHaveBeenCalledWith(
        searchParams,
        paginationParams,
        undefined
      );
    });

    it('should validate search parameters', async () => {
      const invalidSearchParams = {
        minRating: 6, // Invalid rating > 5
        maxHourlyRate: 100
      };

      const paginationParams: PaginationParams = {
        page: 1,
        limit: 10,
        sortBy: 'rating',
        sortOrder: 'desc'
      };

      await expect(coachService.searchCoaches(invalidSearchParams, paginationParams))
        .rejects
        .toThrow('Invalid rating range');
    });
  });
});