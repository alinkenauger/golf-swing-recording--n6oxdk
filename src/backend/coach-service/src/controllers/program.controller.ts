// express version ^4.18.2
// inversify version ^6.0.1
// joi version ^17.11.0
// express-rate-limit version ^7.1.0
// winston version ^3.11.0

import { Router, Request, Response } from 'express';
import { injectable } from 'inversify';
import Joi from 'joi';
import rateLimit from 'express-rate-limit';
import { Logger } from 'winston';
import { ProgramService } from '../services/program.service';
import { Program, ProgramStatus } from '../models/program.model';
import { validateSchema } from '@shared/middleware/validation.middleware';
import { ApiError } from '@shared/errors/api.error';
import { PaginationParams } from '@shared/types';

@injectable()
export class ProgramController {
  private readonly router: Router;
  private readonly logger: Logger;

  // Rate limiting configurations
  private readonly createProgramLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // 10 programs per hour
    message: 'Too many program creation attempts'
  });

  private readonly updateProgramLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 30, // 30 updates per 15 minutes
    message: 'Too many program update attempts'
  });

  // Validation schemas
  private readonly programSchema = Joi.object({
    title: Joi.string().min(5).max(100).required(),
    description: Joi.string().min(20).max(2000).required(),
    sport: Joi.string().required(),
    level: Joi.string().valid('beginner', 'intermediate', 'advanced', 'professional').required(),
    price: Joi.number().min(0).max(10000).required(),
    content: Joi.array().items(
      Joi.object({
        type: Joi.string().valid('video', 'document', 'quiz', 'assignment').required(),
        title: Joi.string().min(3).max(100).required(),
        description: Joi.string().max(500).required(),
        url: Joi.string().uri().required(),
        duration: Joi.when('type', {
          is: 'video',
          then: Joi.number().required(),
          otherwise: Joi.number().optional()
        }),
        order: Joi.number().min(0).required(),
        completionCriteria: Joi.string().optional(),
        requiredTime: Joi.number().optional()
      })
    ).min(1).required(),
    availabilityWindow: Joi.object({
      startDate: Joi.date().iso().required(),
      endDate: Joi.date().iso().greater(Joi.ref('startDate')).optional()
    }).required()
  });

  private readonly paginationSchema = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    sortBy: Joi.string().valid('createdAt', 'title', 'price').default('createdAt'),
    sortOrder: Joi.string().valid('asc', 'desc').default('desc')
  });

  constructor(private readonly programService: ProgramService) {
    this.router = Router();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    // Create program endpoint
    this.router.post(
      '/',
      this.createProgramLimiter,
      validateSchema(this.programSchema),
      this.createProgram.bind(this)
    );

    // Get program by ID endpoint
    this.router.get(
      '/:programId',
      this.getProgram.bind(this)
    );

    // Get coach programs endpoint
    this.router.get(
      '/coach/:coachId',
      validateSchema(this.paginationSchema, 'query'),
      this.getCoachPrograms.bind(this)
    );

    // Update program endpoint
    this.router.put(
      '/:programId',
      this.updateProgramLimiter,
      validateSchema(this.programSchema),
      this.updateProgram.bind(this)
    );

    // Delete program endpoint
    this.router.delete(
      '/:programId',
      this.deleteProgram.bind(this)
    );

    // Publish program endpoint
    this.router.post(
      '/:programId/publish',
      this.publishProgram.bind(this)
    );
  }

  /**
   * Creates a new training program
   */
  private async createProgram(req: Request, res: Response): Promise<void> {
    try {
      const coachId = req.user?.id;
      if (!coachId) {
        throw ApiError.unauthorized('Coach ID not found in request');
      }

      const programData: Partial<Program> = {
        ...req.body,
        coachId
      };

      const program = await this.programService.createProgram(programData);

      this.logger.info('Program created successfully', {
        programId: program.id,
        coachId
      });

      res.status(201).json({
        success: true,
        data: program
      });
    } catch (error) {
      this.logger.error('Failed to create program', { error });
      throw error;
    }
  }

  /**
   * Retrieves a program by ID
   */
  private async getProgram(req: Request, res: Response): Promise<void> {
    try {
      const { programId } = req.params;
      const requesterId = req.user?.id;

      if (!requesterId) {
        throw ApiError.unauthorized('User ID not found in request');
      }

      const program = await this.programService.getProgram(programId, requesterId);

      res.status(200).json({
        success: true,
        data: program
      });
    } catch (error) {
      this.logger.error('Failed to retrieve program', { error });
      throw error;
    }
  }

  /**
   * Retrieves all programs for a coach with pagination
   */
  private async getCoachPrograms(req: Request, res: Response): Promise<void> {
    try {
      const { coachId } = req.params;
      const pagination: PaginationParams = req.query as PaginationParams;

      const result = await this.programService.listCoachPrograms(coachId, pagination);

      res.status(200).json({
        success: true,
        data: result.programs,
        metadata: {
          total: result.total,
          page: pagination.page,
          limit: pagination.limit
        }
      });
    } catch (error) {
      this.logger.error('Failed to retrieve coach programs', { error });
      throw error;
    }
  }

  /**
   * Updates an existing program
   */
  private async updateProgram(req: Request, res: Response): Promise<void> {
    try {
      const { programId } = req.params;
      const coachId = req.user?.id;

      if (!coachId) {
        throw ApiError.unauthorized('Coach ID not found in request');
      }

      const program = await this.programService.updateProgram(
        programId,
        coachId,
        req.body
      );

      res.status(200).json({
        success: true,
        data: program
      });
    } catch (error) {
      this.logger.error('Failed to update program', { error });
      throw error;
    }
  }

  /**
   * Deletes a program
   */
  private async deleteProgram(req: Request, res: Response): Promise<void> {
    try {
      const { programId } = req.params;
      const coachId = req.user?.id;

      if (!coachId) {
        throw ApiError.unauthorized('Coach ID not found in request');
      }

      await this.programService.deleteProgram(programId, coachId);

      res.status(204).send();
    } catch (error) {
      this.logger.error('Failed to delete program', { error });
      throw error;
    }
  }

  /**
   * Publishes a program
   */
  private async publishProgram(req: Request, res: Response): Promise<void> {
    try {
      const { programId } = req.params;
      const coachId = req.user?.id;

      if (!coachId) {
        throw ApiError.unauthorized('Coach ID not found in request');
      }

      const program = await this.programService.publishProgram(programId, coachId);

      res.status(200).json({
        success: true,
        data: program
      });
    } catch (error) {
      this.logger.error('Failed to publish program', { error });
      throw error;
    }
  }

  public getRouter(): Router {
    return this.router;
  }
}

export default ProgramController;