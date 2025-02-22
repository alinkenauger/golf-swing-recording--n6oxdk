import { injectable } from 'inversify'; // inversify ^6.0.1
import { controller, httpGet, httpPost, httpPut, httpDelete } from 'inversify-express-utils'; // inversify-express-utils ^6.4.3
import { Request, Response } from 'express';
import { ThreadRepository } from '../repositories/thread.repository';
import { ApiError } from '../../../shared/errors/api.error';
import { validateRequest } from '../../../shared/utils/validation';
import { UserRole } from '../../../shared/types';

// Global constants for pagination
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

// Validation schemas for thread operations
const createThreadSchema = {
  title: String,
  type: ['direct', 'group'],
  participants: Array,
  createdBy: String
};

@injectable()
@controller('/api/threads')
export class ThreadController {
  constructor(private readonly threadRepository: ThreadRepository) {}

  /**
   * Creates a new chat thread with validation and security checks
   */
  @httpPost('/')
  @validateRequest(createThreadSchema)
  async createThread(req: Request, res: Response): Promise<Response> {
    try {
      const { title, type, participants, createdBy } = req.body;

      // Validate participant roles
      const validParticipants = participants.every((p: any) => 
        Object.values(UserRole).includes(p.role)
      );
      if (!validParticipants) {
        throw ApiError.badRequest('Invalid participant roles');
      }

      const thread = await this.threadRepository.createThread({
        title,
        type,
        participants,
        createdBy
      });

      return res.status(201).json(thread);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw ApiError.internal('Failed to create thread', error);
    }
  }

  /**
   * Retrieves a specific thread by ID with access control
   */
  @httpGet('/:threadId')
  async getThread(req: Request, res: Response): Promise<Response> {
    try {
      const { threadId } = req.params;
      const userId = req.user?.id;

      const thread = await this.threadRepository.getThreadById(threadId);
      if (!thread) {
        throw ApiError.notFound('Thread not found');
      }

      // Check if user is a participant
      const isParticipant = await thread.isParticipant(userId);
      if (!isParticipant) {
        throw ApiError.forbidden('Access denied');
      }

      return res.status(200).json(thread);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw ApiError.internal('Failed to retrieve thread', error);
    }
  }

  /**
   * Retrieves threads for a user with pagination and filtering
   */
  @httpGet('/')
  async getUserThreads(req: Request, res: Response): Promise<Response> {
    try {
      const userId = req.user?.id;
      const { cursor, limit = DEFAULT_PAGE_SIZE, type, isArchived } = req.query;

      const threads = await this.threadRepository.getThreadsByUser(
        userId,
        {
          cursor: cursor as string,
          limit: Math.min(Number(limit), MAX_PAGE_SIZE),
          direction: 'next'
        },
        {
          type: type as 'direct' | 'group',
          isArchived: isArchived === 'true'
        }
      );

      return res.status(200).json(threads);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw ApiError.internal('Failed to retrieve user threads', error);
    }
  }

  /**
   * Adds a participant to a thread with role validation
   */
  @httpPut('/:threadId/participants')
  async addParticipant(req: Request, res: Response): Promise<Response> {
    try {
      const { threadId } = req.params;
      const { userId, role } = req.body;
      const requesterId = req.user?.id;

      const thread = await this.threadRepository.getThreadById(threadId);
      if (!thread) {
        throw ApiError.notFound('Thread not found');
      }

      // Check if requester is admin or thread creator
      const isAdmin = await thread.isParticipant(requesterId, 'admin');
      if (!isAdmin && thread.createdBy.toString() !== requesterId) {
        throw ApiError.forbidden('Insufficient permissions');
      }

      await this.threadRepository.addParticipant(threadId, userId, role);
      return res.status(200).json({ message: 'Participant added successfully' });
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw ApiError.internal('Failed to add participant', error);
    }
  }

  /**
   * Removes a participant from a thread with permission checks
   */
  @httpDelete('/:threadId/participants/:userId')
  async removeParticipant(req: Request, res: Response): Promise<Response> {
    try {
      const { threadId, userId } = req.params;
      const requesterId = req.user?.id;

      const thread = await this.threadRepository.getThreadById(threadId);
      if (!thread) {
        throw ApiError.notFound('Thread not found');
      }

      // Check permissions
      const isAdmin = await thread.isParticipant(requesterId, 'admin');
      const isSelfRemoval = userId === requesterId;
      if (!isAdmin && !isSelfRemoval && thread.createdBy.toString() !== requesterId) {
        throw ApiError.forbidden('Insufficient permissions');
      }

      await this.threadRepository.removeParticipant(threadId, userId);
      return res.status(200).json({ message: 'Participant removed successfully' });
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw ApiError.internal('Failed to remove participant', error);
    }
  }

  /**
   * Archives a thread with optional message archival
   */
  @httpPut('/:threadId/archive')
  async archiveThread(req: Request, res: Response): Promise<Response> {
    try {
      const { threadId } = req.params;
      const { archiveMessages = false, notifyParticipants = true } = req.body;
      const userId = req.user?.id;

      const thread = await this.threadRepository.getThreadById(threadId);
      if (!thread) {
        throw ApiError.notFound('Thread not found');
      }

      // Check permissions
      const isAdmin = await thread.isParticipant(userId, 'admin');
      if (!isAdmin && thread.createdBy.toString() !== userId) {
        throw ApiError.forbidden('Insufficient permissions');
      }

      await this.threadRepository.archiveThread(threadId, {
        archiveMessages,
        notifyParticipants
      });

      return res.status(200).json({ message: 'Thread archived successfully' });
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw ApiError.internal('Failed to archive thread', error);
    }
  }
}