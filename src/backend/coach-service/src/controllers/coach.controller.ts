import { injectable } from 'inversify'; // v6.0.1
import { controller, httpGet, httpPost, httpPut, httpDelete } from 'inversify-express-utils'; // v6.3.2
import { Request, Response } from 'express'; // v4.18.2
import { RateLimit } from 'express-rate-limit'; // v6.7.0
import { Coach } from '../models/coach.model';
import { CoachService } from '../services/coach.service';
import { ApiError } from '../../../shared/errors/api.error';
import { validateSchema } from '../../../shared/middleware/validation.middleware';
import { PaginationParams } from '../../../shared/types';
import { Logger } from 'winston';

// Validation schemas using Joi
const createCoachSchema = {
  userId: Joi.string().required(),
  specialties: Joi.array().items(Joi.string()).min(1).required(),
  certifications: Joi.array().items(
    Joi.object({
      name: Joi.string().required(),
      issuer: Joi.string().required(),
      issueDate: Joi.date().required(),
      expiryDate: Joi.date().optional(),
      verificationUrl: Joi.string().uri().optional()
    })
  ),
  experience: Joi.number().min(0).required(),
  hourlyRate: Joi.number().min(0).required(),
  availability: Joi.object({
    days: Joi.array().items(Joi.string()).min(1).required(),
    timeSlots: Joi.array().items(
      Joi.object({
        start: Joi.string().required(),
        end: Joi.string().required()
      })
    ).required(),
    timezone: Joi.string().required()
  }).required()
};

const searchCoachSchema = {
  specialties: Joi.array().items(Joi.string()).optional(),
  verificationStatus: Joi.string().valid('pending', 'in_progress', 'verified', 'rejected').optional(),
  minRating: Joi.number().min(0).max(5).optional(),
  maxHourlyRate: Joi.number().min(0).optional(),
  availability: Joi.array().items(Joi.string()).optional(),
  searchTerm: Joi.string().optional()
};

@injectable()
@controller('/api/v1/coaches')
export class CoachController {
  constructor(
    private readonly coachService: CoachService,
    private readonly logger: Logger
  ) {}

  /**
   * Creates a new coach profile with enhanced validation and security checks
   */
  @httpPost('/')
  @validateSchema(createCoachSchema)
  @RateLimit({ windowMs: 60 * 1000, max: 5 }) // 5 requests per minute
  async createCoach(req: Request, res: Response): Promise<Response> {
    try {
      this.logger.info('Creating coach profile', { userId: req.body.userId });

      const coachData: Partial<Coach> = {
        userId: req.body.userId,
        specialties: req.body.specialties,
        certifications: req.body.certifications,
        experience: req.body.experience,
        hourlyRate: req.body.hourlyRate,
        availability: req.body.availability,
        status: 'active',
        verificationStatus: 'pending'
      };

      const coach = await this.coachService.createCoachProfile(coachData);

      this.logger.info('Coach profile created successfully', {
        coachId: coach.id,
        userId: coach.userId
      });

      return res.status(201).json({
        success: true,
        data: coach,
        message: 'Coach profile created successfully'
      });
    } catch (error) {
      this.logger.error('Failed to create coach profile', { error });
      if (error instanceof ApiError) {
        throw error;
      }
      throw ApiError.internal('Failed to create coach profile');
    }
  }

  /**
   * Advanced coach search with filtering, pagination, and security measures
   */
  @httpGet('/')
  @validateSchema(searchCoachSchema, 'query')
  @RateLimit({ windowMs: 60 * 1000, max: 30 }) // 30 requests per minute
  async searchCoaches(req: Request, res: Response): Promise<Response> {
    try {
      const searchParams = {
        specialties: req.query.specialties as string[],
        verificationStatus: req.query.verificationStatus as Coach['verificationStatus'],
        minRating: req.query.minRating ? Number(req.query.minRating) : undefined,
        maxHourlyRate: req.query.maxHourlyRate ? Number(req.query.maxHourlyRate) : undefined,
        availability: req.query.availability as string[],
        searchTerm: req.query.searchTerm as string
      };

      const paginationParams: PaginationParams = {
        page: Number(req.query.page) || 1,
        limit: Number(req.query.limit) || 20,
        sortBy: (req.query.sortBy as string) || 'rating',
        sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'desc'
      };

      const result = await this.coachService.searchCoaches(searchParams, paginationParams);

      this.logger.info('Coach search completed', {
        totalResults: result.total,
        page: paginationParams.page
      });

      return res.status(200).json({
        success: true,
        data: result.coaches,
        metadata: {
          ...result.metadata,
          filters: searchParams
        }
      });
    } catch (error) {
      this.logger.error('Failed to search coaches', { error });
      if (error instanceof ApiError) {
        throw error;
      }
      throw ApiError.internal('Failed to search coaches');
    }
  }

  /**
   * Updates coach profile with validation and security checks
   */
  @httpPut('/:id')
  @validateSchema(createCoachSchema)
  @RateLimit({ windowMs: 60 * 1000, max: 10 }) // 10 requests per minute
  async updateCoach(req: Request, res: Response): Promise<Response> {
    try {
      const coachId = req.params.id;
      const updateData: Partial<Coach> = {
        specialties: req.body.specialties,
        certifications: req.body.certifications,
        experience: req.body.experience,
        hourlyRate: req.body.hourlyRate,
        availability: req.body.availability
      };

      const updatedCoach = await this.coachService.updateCoachProfile(coachId, updateData);

      this.logger.info('Coach profile updated successfully', {
        coachId,
        updatedFields: Object.keys(updateData)
      });

      return res.status(200).json({
        success: true,
        data: updatedCoach,
        message: 'Coach profile updated successfully'
      });
    } catch (error) {
      this.logger.error('Failed to update coach profile', { error });
      if (error instanceof ApiError) {
        throw error;
      }
      throw ApiError.internal('Failed to update coach profile');
    }
  }

  /**
   * Deletes coach profile with security validation
   */
  @httpDelete('/:id')
  @RateLimit({ windowMs: 60 * 1000, max: 5 }) // 5 requests per minute
  async deleteCoach(req: Request, res: Response): Promise<Response> {
    try {
      const coachId = req.params.id;
      
      // Soft delete by updating status
      await this.coachService.updateCoachProfile(coachId, { status: 'inactive' });

      this.logger.info('Coach profile deleted successfully', { coachId });

      return res.status(200).json({
        success: true,
        message: 'Coach profile deleted successfully'
      });
    } catch (error) {
      this.logger.error('Failed to delete coach profile', { error });
      if (error instanceof ApiError) {
        throw error;
      }
      throw ApiError.internal('Failed to delete coach profile');
    }
  }
}