// inversify version ^6.0.1
// winston version ^3.8.2

import { injectable } from 'inversify';
import { BusinessError } from '@shared/errors';
import { Program, ProgramStatus, ContentItem } from '../models/program.model';
import { ProgramRepository } from '../repositories/program.repository';
import { PaginationParams } from '@shared/types';
import { Logger } from 'winston';

/**
 * Service class implementing comprehensive business logic for training program management
 * with enhanced validation and access control
 */
@injectable()
export class ProgramService {
  constructor(
    private readonly programRepository: ProgramRepository,
    private readonly logger: Logger
  ) {}

  /**
   * Creates a new training program with enhanced validation
   */
  async createProgram(programData: Partial<Program>): Promise<Program> {
    try {
      // Validate required fields
      if (!programData.coachId || !programData.title || !programData.description) {
        throw new BusinessError('Missing required program fields');
      }

      // Validate content structure if provided
      if (programData.content) {
        this.validateContentStructure(programData.content);
      }

      // Set initial program metadata
      const initializedProgram = {
        ...programData,
        status: ProgramStatus.DRAFT,
        isPublished: false,
        enrollmentCount: 0,
        rating: 0,
        reviewCount: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const program = await this.programRepository.createProgram(initializedProgram);

      this.logger.info('Created new training program', {
        programId: program.id,
        coachId: program.coachId
      });

      return program;
    } catch (error) {
      this.logger.error('Failed to create training program', {
        error,
        coachId: programData.coachId
      });
      throw new BusinessError('Failed to create training program', error);
    }
  }

  /**
   * Retrieves a program by ID with access validation
   */
  async getProgram(programId: string, requesterId: string): Promise<Program> {
    try {
      const program = await this.programRepository.findProgramById(programId);
      
      if (!program) {
        throw new BusinessError('Program not found');
      }

      // Validate access rights
      if (program.status === ProgramStatus.DRAFT && program.coachId !== requesterId) {
        throw new BusinessError('Unauthorized access to draft program');
      }

      return program;
    } catch (error) {
      this.logger.error('Failed to retrieve program', {
        error,
        programId,
        requesterId
      });
      throw new BusinessError('Failed to retrieve program', error);
    }
  }

  /**
   * Updates an existing program with validation
   */
  async updateProgram(
    programId: string,
    coachId: string,
    updateData: Partial<Program>
  ): Promise<Program> {
    try {
      const program = await this.getProgram(programId, coachId);

      // Validate coach ownership
      if (program.coachId !== coachId) {
        throw new BusinessError('Unauthorized program update');
      }

      // Validate program status
      if (program.status === ProgramStatus.PUBLISHED) {
        throw new BusinessError('Cannot update published program');
      }

      // Validate content updates if provided
      if (updateData.content) {
        this.validateContentStructure(updateData.content);
      }

      const updatedProgram = await this.programRepository.updateProgram(
        programId,
        {
          ...updateData,
          updatedAt: new Date()
        }
      );

      this.logger.info('Updated training program', {
        programId,
        coachId
      });

      return updatedProgram;
    } catch (error) {
      this.logger.error('Failed to update program', {
        error,
        programId,
        coachId
      });
      throw new BusinessError('Failed to update program', error);
    }
  }

  /**
   * Publishes a program with comprehensive validation
   */
  async publishProgram(programId: string, coachId: string): Promise<Program> {
    try {
      const program = await this.getProgram(programId, coachId);

      // Validate coach ownership
      if (program.coachId !== coachId) {
        throw new BusinessError('Unauthorized program publication');
      }

      // Validate program status
      if (program.status !== ProgramStatus.DRAFT) {
        throw new BusinessError('Only draft programs can be published');
      }

      // Validate program completeness
      this.validateProgramCompleteness(program);

      const publishedProgram = await this.programRepository.updateProgram(
        programId,
        {
          status: ProgramStatus.PUBLISHED,
          isPublished: true,
          publishedAt: new Date(),
          updatedAt: new Date()
        }
      );

      this.logger.info('Published training program', {
        programId,
        coachId
      });

      return publishedProgram;
    } catch (error) {
      this.logger.error('Failed to publish program', {
        error,
        programId,
        coachId
      });
      throw new BusinessError('Failed to publish program', error);
    }
  }

  /**
   * Lists programs for a coach with pagination
   */
  async listCoachPrograms(
    coachId: string,
    pagination: PaginationParams
  ): Promise<{ programs: Program[]; total: number }> {
    try {
      const result = await this.programRepository.findProgramsByCoach(coachId, pagination);

      this.logger.debug('Retrieved coach programs', {
        coachId,
        count: result.programs.length,
        total: result.total
      });

      return {
        programs: result.programs,
        total: result.total
      };
    } catch (error) {
      this.logger.error('Failed to list coach programs', {
        error,
        coachId
      });
      throw new BusinessError('Failed to list coach programs', error);
    }
  }

  /**
   * Validates the structure and requirements of program content
   */
  private validateContentStructure(content: ContentItem[]): void {
    if (!Array.isArray(content) || content.length === 0) {
      throw new BusinessError('Program must have at least one content item');
    }

    // Validate each content item
    content.forEach((item, index) => {
      if (!item.type || !item.title || !item.description) {
        throw new BusinessError(`Invalid content item at index ${index}`);
      }

      if (!['video', 'document', 'quiz', 'assignment'].includes(item.type)) {
        throw new BusinessError(`Invalid content type at index ${index}`);
      }

      if (item.type === 'video' && !item.duration) {
        throw new BusinessError(`Video duration required at index ${index}`);
      }
    });

    // Validate order sequence
    const orders = content.map(item => item.order);
    const uniqueOrders = new Set(orders);
    if (orders.length !== uniqueOrders.size) {
      throw new BusinessError('Content items must have unique order values');
    }
  }

  /**
   * Validates program completeness before publishing
   */
  private validateProgramCompleteness(program: Program): void {
    // Validate required fields
    if (!program.title || !program.description || !program.sport || !program.level) {
      throw new BusinessError('Missing required program fields');
    }

    // Validate content
    if (!program.content || program.content.length === 0) {
      throw new BusinessError('Program must have content before publishing');
    }

    // Validate pricing
    if (typeof program.price !== 'number' || program.price < 0) {
      throw new BusinessError('Invalid program price');
    }

    // Validate availability window
    if (!program.availabilityWindow || !program.availabilityWindow.startDate) {
      throw new BusinessError('Program must have availability window');
    }

    if (program.availabilityWindow.endDate && 
        program.availabilityWindow.endDate <= program.availabilityWindow.startDate) {
      throw new BusinessError('Invalid availability window dates');
    }
  }
}