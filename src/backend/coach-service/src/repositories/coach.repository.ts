import { injectable } from 'inversify';
import { Model, Document, ClientSession, FilterQuery, UpdateQuery } from 'mongoose';
import { Logger } from 'winston';
import { RepositoryError } from '@types/custom-errors';
import { Coach, CoachModel } from '../models/coach.model';
import { PaginationParams } from '../../../shared/types';
import { ROLES } from '../../../shared/constants';

@injectable()
export class CoachRepository {
  private readonly queryTimeout: number = 30000; // 30 seconds

  constructor(
    private readonly coachModel: Model<Coach>,
    private readonly logger: Logger
  ) {}

  /**
   * Creates a new coach profile with validation and audit logging
   */
  async createCoach(coachData: Partial<Coach>, session?: ClientSession): Promise<Coach> {
    try {
      const coach = new this.coachModel({
        ...coachData,
        verificationStatus: 'pending',
        backgroundCheck: {
          status: 'pending',
          completedAt: null,
          expiryDate: null
        }
      });

      const validationError = coach.validateSync();
      if (validationError) {
        throw new RepositoryError('Validation failed', {
          code: 'VALIDATION_ERROR',
          details: validationError
        });
      }

      const savedCoach = session 
        ? await coach.save({ session })
        : await coach.save();

      this.logger.info('Coach profile created', {
        coachId: savedCoach.id,
        userId: savedCoach.userId
      });

      return savedCoach;
    } catch (error) {
      this.logger.error('Failed to create coach profile', {
        error,
        coachData
      });
      throw new RepositoryError('Failed to create coach profile', {
        code: 'CREATE_FAILED',
        cause: error
      });
    }
  }

  /**
   * Updates coach verification status with background check integration
   */
  async updateVerificationStatus(
    coachId: string,
    verificationStatus: Coach['verificationStatus'],
    backgroundCheckData?: {
      status: string;
      completedAt: Date;
      referenceId: string;
    }
  ): Promise<Coach> {
    try {
      const updateQuery: UpdateQuery<Coach> = {
        verificationStatus,
        ...(backgroundCheckData && {
          backgroundCheck: {
            status: backgroundCheckData.status,
            completedAt: backgroundCheckData.completedAt,
            referenceId: backgroundCheckData.referenceId,
            expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year expiry
          }
        })
      };

      const updatedCoach = await this.coachModel
        .findByIdAndUpdate(coachId, updateQuery, {
          new: true,
          runValidators: true,
          timeout: this.queryTimeout
        })
        .exec();

      if (!updatedCoach) {
        throw new RepositoryError('Coach not found', {
          code: 'NOT_FOUND',
          details: { coachId }
        });
      }

      this.logger.info('Coach verification status updated', {
        coachId,
        verificationStatus,
        backgroundCheck: backgroundCheckData
      });

      return updatedCoach;
    } catch (error) {
      this.logger.error('Failed to update coach verification status', {
        error,
        coachId,
        verificationStatus
      });
      throw new RepositoryError('Failed to update verification status', {
        code: 'UPDATE_FAILED',
        cause: error
      });
    }
  }

  /**
   * Updates coach earnings with detailed tracking and audit
   */
  async updateEarningsWithAudit(
    coachId: string,
    earningsData: {
      amount: number;
      transactionId: string;
      type: 'session' | 'program' | 'subscription';
    },
    session?: ClientSession
  ): Promise<void> {
    try {
      const coach = await this.coachModel
        .findById(coachId)
        .session(session)
        .exec();

      if (!coach) {
        throw new RepositoryError('Coach not found', {
          code: 'NOT_FOUND',
          details: { coachId }
        });
      }

      const updateQuery: UpdateQuery<Coach> = {
        $inc: { totalEarnings: earningsData.amount },
        $push: {
          'earnings.history': {
            amount: earningsData.amount,
            transactionId: earningsData.transactionId,
            type: earningsData.type,
            timestamp: new Date()
          }
        }
      };

      await this.coachModel
        .findByIdAndUpdate(coachId, updateQuery, {
          session,
          runValidators: true,
          timeout: this.queryTimeout
        })
        .exec();

      this.logger.info('Coach earnings updated', {
        coachId,
        earningsData,
        newTotal: coach.totalEarnings + earningsData.amount
      });
    } catch (error) {
      this.logger.error('Failed to update coach earnings', {
        error,
        coachId,
        earningsData
      });
      throw new RepositoryError('Failed to update earnings', {
        code: 'UPDATE_FAILED',
        cause: error
      });
    }
  }

  /**
   * Advanced coach search with multiple filters and sorting
   */
  async findCoachesWithFilters(
    filters: {
      specialties?: string[];
      verificationStatus?: Coach['verificationStatus'];
      minRating?: number;
      maxHourlyRate?: number;
      availability?: string[];
    },
    pagination: PaginationParams,
    searchTerm?: string
  ): Promise<{ coaches: Coach[]; total: number; metadata: object }> {
    try {
      const query: FilterQuery<Coach> = {
        status: 'active',
        role: ROLES.COACH
      };

      if (filters.specialties?.length) {
        query.specialties = { $in: filters.specialties };
      }

      if (filters.verificationStatus) {
        query.verificationStatus = filters.verificationStatus;
      }

      if (filters.minRating) {
        query.rating = { $gte: filters.minRating };
      }

      if (filters.maxHourlyRate) {
        query.hourlyRate = { $lte: filters.maxHourlyRate };
      }

      if (filters.availability?.length) {
        query['availability.days'] = { $in: filters.availability };
      }

      if (searchTerm) {
        query.$text = { $search: searchTerm };
      }

      const [coaches, total] = await Promise.all([
        this.coachModel
          .find(query)
          .sort({ [pagination.sortBy]: pagination.sortOrder })
          .skip((pagination.page - 1) * pagination.limit)
          .limit(pagination.limit)
          .select('-backgroundCheck.referenceId')
          .timeout(this.queryTimeout)
          .exec(),
        this.coachModel.countDocuments(query)
      ]);

      const metadata = {
        page: pagination.page,
        limit: pagination.limit,
        total,
        pages: Math.ceil(total / pagination.limit)
      };

      return { coaches, total, metadata };
    } catch (error) {
      this.logger.error('Failed to search coaches', {
        error,
        filters,
        pagination,
        searchTerm
      });
      throw new RepositoryError('Failed to search coaches', {
        code: 'SEARCH_FAILED',
        cause: error
      });
    }
  }
}