import { injectable } from 'inversify'; // v6.0.1
import { Logger } from 'winston'; // v3.8.2
import { Coach } from '../models/coach.model';
import { CoachRepository } from '../repositories/coach.repository';
import { BusinessError, BUSINESS_ERROR_CODES } from '../../../shared/errors/business.error';
import { PaginationParams } from '../../../shared/types';

@injectable()
export class CoachService {
  private readonly DOMAIN = 'coach-service';

  constructor(
    private readonly coachRepository: CoachRepository,
    private readonly logger: Logger
  ) {}

  /**
   * Creates a new coach profile with comprehensive validation and verification
   */
  async createCoachProfile(coachData: Partial<Coach>): Promise<Coach> {
    try {
      this.logger.info('Creating new coach profile', { userId: coachData.userId });

      // Validate required fields
      if (!coachData.userId || !coachData.specialties?.length) {
        throw BusinessError.invalidOperation(
          'Missing required coach profile data',
          this.DOMAIN,
          { providedFields: Object.keys(coachData) }
        );
      }

      // Check for existing profile
      const existingCoach = await this.coachRepository.findCoachById(coachData.userId);
      if (existingCoach) {
        throw BusinessError.duplicateEntry(
          'Coach profile already exists',
          this.DOMAIN,
          { userId: coachData.userId }
        );
      }

      // Initialize coach profile with default verification status
      const coach = await this.coachRepository.createCoach({
        ...coachData,
        verificationStatus: 'pending',
        rating: 0,
        reviewCount: 0,
        studentCount: 0,
        totalEarnings: 0
      });

      this.logger.info('Coach profile created successfully', {
        coachId: coach.id,
        userId: coach.userId
      });

      return coach;
    } catch (error) {
      this.logger.error('Failed to create coach profile', {
        error,
        userId: coachData.userId
      });
      throw error;
    }
  }

  /**
   * Updates coach profile with validation and audit logging
   */
  async updateCoachProfile(coachId: string, updateData: Partial<Coach>): Promise<Coach> {
    try {
      this.logger.info('Updating coach profile', { coachId });

      // Validate update data
      if (updateData.verificationStatus || updateData.totalEarnings) {
        throw BusinessError.invalidOperation(
          'Cannot directly update verification status or earnings',
          this.DOMAIN,
          { coachId }
        );
      }

      // Check certification updates
      if (updateData.certifications?.length) {
        updateData.certifications = updateData.certifications.map(cert => ({
          ...cert,
          verificationStatus: 'pending'
        }));
      }

      const updatedCoach = await this.coachRepository.updateCoach(coachId, updateData);
      if (!updatedCoach) {
        throw BusinessError.invalidOperation(
          'Coach profile not found',
          this.DOMAIN,
          { coachId }
        );
      }

      this.logger.info('Coach profile updated successfully', {
        coachId,
        updatedFields: Object.keys(updateData)
      });

      return updatedCoach;
    } catch (error) {
      this.logger.error('Failed to update coach profile', {
        error,
        coachId,
        updateData
      });
      throw error;
    }
  }

  /**
   * Updates coach earnings with transaction support and analytics
   */
  async updateCoachEarnings(
    coachId: string,
    earningsData: {
      amount: number;
      transactionId: string;
      type: 'session' | 'program' | 'subscription';
    }
  ): Promise<void> {
    try {
      this.logger.info('Updating coach earnings', {
        coachId,
        transactionId: earningsData.transactionId
      });

      if (earningsData.amount <= 0) {
        throw BusinessError.invalidOperation(
          'Invalid earnings amount',
          this.DOMAIN,
          { amount: earningsData.amount }
        );
      }

      await this.coachRepository.updateEarningsWithAudit(coachId, earningsData);

      this.logger.info('Coach earnings updated successfully', {
        coachId,
        amount: earningsData.amount,
        type: earningsData.type
      });
    } catch (error) {
      this.logger.error('Failed to update coach earnings', {
        error,
        coachId,
        earningsData
      });
      throw error;
    }
  }

  /**
   * Advanced coach search with multiple criteria and pagination
   */
  async searchCoaches(
    searchParams: {
      specialties?: string[];
      verificationStatus?: Coach['verificationStatus'];
      minRating?: number;
      maxHourlyRate?: number;
      availability?: string[];
      searchTerm?: string;
    },
    paginationParams: PaginationParams
  ): Promise<{
    coaches: Coach[];
    total: number;
    metadata: object;
  }> {
    try {
      this.logger.info('Searching coaches', { searchParams, paginationParams });

      // Validate search parameters
      if (searchParams.minRating && (searchParams.minRating < 0 || searchParams.minRating > 5)) {
        throw BusinessError.invalidOperation(
          'Invalid rating range',
          this.DOMAIN,
          { minRating: searchParams.minRating }
        );
      }

      if (searchParams.maxHourlyRate && searchParams.maxHourlyRate < 0) {
        throw BusinessError.invalidOperation(
          'Invalid hourly rate',
          this.DOMAIN,
          { maxHourlyRate: searchParams.maxHourlyRate }
        );
      }

      const result = await this.coachRepository.findCoachesWithFilters(
        searchParams,
        paginationParams,
        searchParams.searchTerm
      );

      this.logger.info('Coach search completed', {
        totalResults: result.total,
        page: paginationParams.page
      });

      return result;
    } catch (error) {
      this.logger.error('Failed to search coaches', {
        error,
        searchParams,
        paginationParams
      });
      throw error;
    }
  }
}