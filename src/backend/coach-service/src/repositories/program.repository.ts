// inversify version ^6.0.1
// mongoose version ^6.0.0
// winston version ^3.8.2

import { injectable } from 'inversify';
import { Model, ClientSession } from 'mongoose';
import { Logger } from 'winston';
import { RepositoryError } from '@shared/errors';
import { Program, ProgramModel, ProgramStatus } from '../models/program.model';
import { PaginationParams } from '@shared/types';

/**
 * Repository class for managing training program data access operations
 * with enhanced caching, monitoring and error handling capabilities
 */
@injectable()
export class ProgramRepository {
  private readonly CACHE_TTL = 3600; // 1 hour in seconds
  private readonly CACHE_PREFIX = 'program:';

  constructor(
    private readonly programModel: Model<Program>,
    private readonly logger: Logger,
    private readonly cache: any // Redis cache service
  ) {
    this.initializeMetrics();
  }

  /**
   * Initialize monitoring metrics for repository operations
   */
  private initializeMetrics(): void {
    // Initialize custom metrics for monitoring
    this.logger.info('Initializing program repository metrics');
  }

  /**
   * Creates a new training program with validation and error handling
   */
  async createProgram(programData: Partial<Program>, session?: ClientSession): Promise<Program> {
    try {
      const program = new this.programModel({
        ...programData,
        status: ProgramStatus.DRAFT,
        enrollmentCount: 0,
        rating: 0,
        reviewCount: 0
      });

      // Validate program data
      const validationError = program.validateSync();
      if (validationError) {
        throw new RepositoryError('Invalid program data', validationError);
      }

      // Save program with optional transaction support
      const savedProgram = session ? 
        await program.save({ session }) :
        await program.save();

      // Invalidate related cache entries
      await this.cache.del(`${this.CACHE_PREFIX}coach:${programData.coachId}`);

      this.logger.info('Created new training program', {
        programId: savedProgram.id,
        coachId: programData.coachId
      });

      return savedProgram;
    } catch (error) {
      this.logger.error('Failed to create training program', {
        error,
        coachId: programData.coachId
      });
      throw new RepositoryError('Failed to create training program', error);
    }
  }

  /**
   * Finds all programs for a coach with enhanced pagination and caching
   */
  async findProgramsByCoach(coachId: string, pagination: PaginationParams): Promise<{
    programs: Program[];
    total: number;
    cached: boolean;
  }> {
    try {
      const cacheKey = `${this.CACHE_PREFIX}coach:${coachId}:${JSON.stringify(pagination)}`;

      // Check cache first
      const cachedResult = await this.cache.get(cacheKey);
      if (cachedResult) {
        return {
          ...JSON.parse(cachedResult),
          cached: true
        };
      }

      // Build query with pagination and sorting
      const query = { coachId };
      const { page, limit, sortBy, sortOrder } = pagination;
      const skip = (page - 1) * limit;

      // Execute query with aggregation for total count
      const [programs, countResult] = await Promise.all([
        this.programModel
          .find(query)
          .sort({ [sortBy]: sortOrder })
          .skip(skip)
          .limit(limit)
          .lean(),
        this.programModel.aggregate([
          { $match: query },
          { $count: 'total' }
        ])
      ]);

      const result = {
        programs,
        total: countResult[0]?.total || 0,
        cached: false
      };

      // Cache results
      await this.cache.set(
        cacheKey,
        JSON.stringify(result),
        'EX',
        this.CACHE_TTL
      );

      this.logger.debug('Retrieved programs for coach', {
        coachId,
        count: programs.length,
        total: result.total
      });

      return result;
    } catch (error) {
      this.logger.error('Failed to retrieve programs for coach', {
        error,
        coachId
      });
      throw new RepositoryError('Failed to retrieve programs', error);
    }
  }

  /**
   * Updates an existing program with validation and cache management
   */
  async updateProgram(
    programId: string,
    updateData: Partial<Program>,
    session?: ClientSession
  ): Promise<Program> {
    try {
      const program = await this.programModel.findById(programId);
      if (!program) {
        throw new RepositoryError('Program not found');
      }

      // Apply updates
      Object.assign(program, updateData);

      // Validate updated data
      const validationError = program.validateSync();
      if (validationError) {
        throw new RepositoryError('Invalid program update data', validationError);
      }

      // Save with optional transaction support
      const updatedProgram = session ?
        await program.save({ session }) :
        await program.save();

      // Invalidate related cache entries
      await this.cache.del(`${this.CACHE_PREFIX}coach:${program.coachId}`);

      this.logger.info('Updated training program', {
        programId,
        coachId: program.coachId
      });

      return updatedProgram;
    } catch (error) {
      this.logger.error('Failed to update training program', {
        error,
        programId
      });
      throw new RepositoryError('Failed to update program', error);
    }
  }

  /**
   * Deletes a program with proper cleanup and cache invalidation
   */
  async deleteProgram(programId: string, session?: ClientSession): Promise<void> {
    try {
      const program = await this.programModel.findById(programId);
      if (!program) {
        throw new RepositoryError('Program not found');
      }

      // Perform deletion with optional transaction support
      if (session) {
        await program.deleteOne({ session });
      } else {
        await program.deleteOne();
      }

      // Invalidate related cache entries
      await this.cache.del(`${this.CACHE_PREFIX}coach:${program.coachId}`);

      this.logger.info('Deleted training program', {
        programId,
        coachId: program.coachId
      });
    } catch (error) {
      this.logger.error('Failed to delete training program', {
        error,
        programId
      });
      throw new RepositoryError('Failed to delete program', error);
    }
  }
}