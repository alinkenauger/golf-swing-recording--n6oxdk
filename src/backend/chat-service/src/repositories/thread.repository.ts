import { injectable } from 'inversify'; // inversify ^6.0.1
import { Model, ClientSession, FilterQuery } from 'mongoose'; // mongoose ^7.5.0
import { Thread, IThread } from '../models/thread.model';
import { UserRole } from '../../../shared/types';
import { CacheManager } from '../services/cache.manager';
import { Logger } from '../services/logger.service';
import { CustomError } from '../utils/errors';

// Global constants for thread management
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
const THREAD_CACHE_TTL = 300; // 5 minutes in seconds

// Types for thread operations
interface ThreadCreateDTO {
  title: string;
  type: 'direct' | 'group';
  participants: Array<{
    userId: string;
    role: UserRole;
  }>;
  createdBy: string;
}

interface PaginationOptions {
  cursor?: string;
  limit?: number;
  direction?: 'next' | 'prev';
}

interface ThreadFilters {
  type?: 'direct' | 'group';
  isArchived?: boolean;
  participantRole?: UserRole;
}

interface PaginatedThreads {
  threads: IThread[];
  nextCursor?: string;
  prevCursor?: string;
  total: number;
}

interface ArchiveOptions {
  archiveMessages?: boolean;
  notifyParticipants?: boolean;
}

@injectable()
export class ThreadRepository {
  constructor(
    private readonly threadModel: Model<IThread>,
    private readonly cacheManager: CacheManager,
    private readonly logger: Logger
  ) {
    this.initializeIndexes();
  }

  /**
   * Initialize required database indexes for optimal query performance
   */
  private async initializeIndexes(): Promise<void> {
    try {
      await this.threadModel.collection.createIndex(
        { 'participants.userId': 1, 'participants.role': 1 },
        { background: true }
      );
      await this.threadModel.collection.createIndex(
        { lastMessageAt: -1 },
        { background: true }
      );
    } catch (error) {
      this.logger.error('Failed to create thread indexes', error);
    }
  }

  /**
   * Creates a new chat thread with transaction support
   */
  async createThread(
    threadData: ThreadCreateDTO,
    session?: ClientSession
  ): Promise<IThread> {
    const runInTransaction = async (sess: ClientSession) => {
      try {
        const thread = new this.threadModel({
          ...threadData,
          metadata: {
            videoResponses: [],
            activeParticipants: threadData.participants.map(p => p.userId),
            lastActivity: new Date()
          }
        });

        await thread.save({ session: sess });

        // Cache the newly created thread
        const cacheKey = `thread:${thread._id}`;
        await this.cacheManager.set(cacheKey, thread, THREAD_CACHE_TTL);

        return thread;
      } catch (error) {
        throw new CustomError('Failed to create thread', error);
      }
    };

    if (session) {
      return runInTransaction(session);
    }

    const newSession = await this.threadModel.startSession();
    try {
      newSession.startTransaction();
      const thread = await runInTransaction(newSession);
      await newSession.commitTransaction();
      return thread;
    } catch (error) {
      await newSession.abortTransaction();
      throw error;
    } finally {
      newSession.endSession();
    }
  }

  /**
   * Retrieves threads for a user with cursor-based pagination
   */
  async getThreadsByUser(
    userId: string,
    options: PaginationOptions,
    filters?: ThreadFilters
  ): Promise<PaginatedThreads> {
    const limit = Math.min(options.limit || DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
    const cacheKey = `threads:${userId}:${JSON.stringify({ options, filters })}`;

    // Try to get from cache first
    const cachedResult = await this.cacheManager.get<PaginatedThreads>(cacheKey);
    if (cachedResult) {
      return cachedResult;
    }

    // Build base query
    const baseQuery: FilterQuery<IThread> = {
      'participants.userId': userId,
      isArchived: filters?.isArchived || false
    };

    if (filters?.type) {
      baseQuery.type = filters.type;
    }

    if (filters?.participantRole) {
      baseQuery['participants.role'] = filters.participantRole;
    }

    // Add cursor conditions
    if (options.cursor) {
      const decodedCursor = Buffer.from(options.cursor, 'base64').toString();
      const [timestamp, id] = decodedCursor.split(':');
      
      baseQuery.lastMessageAt = {
        [options.direction === 'prev' ? '$gt' : '$lt']: new Date(timestamp)
      };
      baseQuery._id = {
        [options.direction === 'prev' ? '$gt' : '$lt']: id
      };
    }

    // Execute paginated query
    const threads = await this.threadModel
      .find(baseQuery)
      .sort({ lastMessageAt: -1, _id: -1 })
      .limit(limit + 1)
      .exec();

    // Prepare pagination metadata
    const hasMore = threads.length > limit;
    const paginatedThreads = hasMore ? threads.slice(0, -1) : threads;
    
    const result: PaginatedThreads = {
      threads: paginatedThreads,
      total: await this.threadModel.countDocuments(baseQuery)
    };

    // Generate cursors
    if (paginatedThreads.length > 0) {
      const lastThread = paginatedThreads[paginatedThreads.length - 1];
      const nextCursor = Buffer.from(
        `${lastThread.lastMessageAt.toISOString()}:${lastThread._id}`
      ).toString('base64');
      result.nextCursor = hasMore ? nextCursor : undefined;

      const firstThread = paginatedThreads[0];
      const prevCursor = Buffer.from(
        `${firstThread.lastMessageAt.toISOString()}:${firstThread._id}`
      ).toString('base64');
      result.prevCursor = options.cursor ? prevCursor : undefined;
    }

    // Cache the results
    await this.cacheManager.set(cacheKey, result, THREAD_CACHE_TTL);

    return result;
  }

  /**
   * Archives a chat thread with metadata updates
   */
  async archiveThread(
    threadId: string,
    options: ArchiveOptions = {}
  ): Promise<void> {
    const session = await this.threadModel.startSession();
    try {
      session.startTransaction();

      const thread = await this.threadModel.findById(threadId).session(session);
      if (!thread) {
        throw new CustomError('Thread not found', { threadId });
      }

      thread.isArchived = true;
      thread.metadata.lastActivity = new Date();

      if (options.archiveMessages) {
        // Additional logic for archiving associated messages
        await this.archiveThreadMessages(threadId, session);
      }

      await thread.save({ session });

      if (options.notifyParticipants) {
        // Emit event for participant notification
        // Implementation depends on event emitter service
      }

      await session.commitTransaction();

      // Clear thread cache
      const cacheKey = `thread:${threadId}`;
      await this.cacheManager.del(cacheKey);
    } catch (error) {
      await session.abortTransaction();
      throw new CustomError('Failed to archive thread', error);
    } finally {
      session.endSession();
    }
  }

  /**
   * Archives messages associated with a thread
   */
  private async archiveThreadMessages(
    threadId: string,
    session: ClientSession
  ): Promise<void> {
    // Implementation depends on message repository
    // This is a placeholder for the actual implementation
    this.logger.info(`Archiving messages for thread: ${threadId}`);
  }
}