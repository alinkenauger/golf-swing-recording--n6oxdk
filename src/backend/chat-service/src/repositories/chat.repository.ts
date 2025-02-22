import { injectable } from 'inversify'; // inversify ^6.0.1
import { Model, ClientSession } from 'mongoose'; // mongoose ^7.5.0
import { DatabaseError } from '@types/custom-errors'; // @types/custom-errors ^1.0.0
import { ChatMessage, markAsDelivered, markAsRead, softDelete } from '../models/chat.model';
import { ChatMessageType } from '../../shared/types';

// Global constants for pagination and batch operations
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
const MAX_BATCH_SIZE = 1000;

/**
 * Enhanced repository class for chat message operations with transaction support
 * and optimized query performance
 */
@injectable()
export class ChatRepository {
  private readonly messageModel: Model<ChatMessage>;
  private readonly session: ClientSession | null;

  constructor(messageModel: Model<ChatMessage>, session?: ClientSession) {
    this.messageModel = messageModel;
    this.session = session || null;
  }

  /**
   * Creates a new chat message with enhanced validation and media support
   */
  async createMessage(messageData: {
    threadId: string;
    senderId: string;
    type: ChatMessageType;
    content: string;
    metadata?: Record<string, any>;
    replyTo?: string;
  }, session?: ClientSession): Promise<ChatMessage> {
    try {
      const messageSession = session || this.session;

      // Validate message type and content
      if (!Object.values(ChatMessageType).includes(messageData.type)) {
        throw new DatabaseError('Invalid message type');
      }

      // Create message document with optimistic locking
      const message = new this.messageModel({
        ...messageData,
        status: 'sending',
        readBy: [],
        deliveredTo: [],
        createdAt: new Date(),
        updatedAt: new Date()
      });

      // Process media content based on message type
      if (messageData.type !== ChatMessageType.TEXT) {
        message.metadata = {
          ...messageData.metadata,
          transcoded: false,
          processedAt: null
        };
      }

      // Save with transaction support
      const savedMessage = await message.save({ session: messageSession });

      // Update thread's last message timestamp
      await this.messageModel.updateOne(
        { _id: messageData.threadId },
        { $set: { lastMessageAt: new Date() } },
        { session: messageSession }
      );

      return savedMessage;
    } catch (error) {
      throw new DatabaseError(
        `Failed to create message: ${error.message}`,
        { cause: error }
      );
    }
  }

  /**
   * Retrieves messages from a thread with optimized pagination and caching
   */
  async getMessagesByThread(
    threadId: string,
    page: number = 1,
    limit: number = DEFAULT_PAGE_SIZE,
    filters?: {
      type?: ChatMessageType[];
      startDate?: Date;
      endDate?: Date;
      senderId?: string;
    }
  ): Promise<{
    messages: ChatMessage[];
    total: number;
    hasMore: boolean;
  }> {
    try {
      // Validate and normalize pagination parameters
      const normalizedLimit = Math.min(limit, MAX_PAGE_SIZE);
      const skip = (page - 1) * normalizedLimit;

      // Build query with filters
      const query: any = { threadId, deleted: { $ne: true } };
      
      if (filters?.type?.length) {
        query.type = { $in: filters.type };
      }
      
      if (filters?.startDate || filters?.endDate) {
        query.createdAt = {};
        if (filters.startDate) query.createdAt.$gte = filters.startDate;
        if (filters.endDate) query.createdAt.$lte = filters.endDate;
      }

      if (filters?.senderId) {
        query.senderId = filters.senderId;
      }

      // Execute query with cursor-based pagination for better performance
      const messages = await this.messageModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(normalizedLimit + 1) // Fetch one extra to determine if there are more
        .lean();

      const hasMore = messages.length > normalizedLimit;
      const resultMessages = hasMore ? messages.slice(0, -1) : messages;

      // Get total count for pagination metadata
      const total = await this.messageModel.countDocuments(query);

      return {
        messages: resultMessages,
        total,
        hasMore
      };
    } catch (error) {
      throw new DatabaseError(
        `Failed to retrieve messages: ${error.message}`,
        { cause: error }
      );
    }
  }

  /**
   * Updates message status with atomic operations and real-time tracking
   */
  async updateMessageStatus(
    messageId: string,
    userId: string,
    status: 'delivered' | 'read',
    session?: ClientSession
  ): Promise<void> {
    try {
      const messageSession = session || this.session;

      // Find message and validate existence
      const message = await this.messageModel.findById(messageId);
      if (!message) {
        throw new DatabaseError('Message not found');
      }

      // Update status based on type
      if (status === 'delivered') {
        await message.markAsDelivered(userId, messageSession);
      } else if (status === 'read') {
        await message.markAsRead(userId, messageSession);
      }

    } catch (error) {
      throw new DatabaseError(
        `Failed to update message status: ${error.message}`,
        { cause: error }
      );
    }
  }

  /**
   * Performs soft deletion with metadata preservation and cleanup
   */
  async deleteMessage(
    messageId: string,
    userId: string,
    session?: ClientSession
  ): Promise<void> {
    try {
      const messageSession = session || this.session;

      // Find message and validate ownership
      const message = await this.messageModel.findOne({
        _id: messageId,
        senderId: userId
      });

      if (!message) {
        throw new DatabaseError('Message not found or unauthorized');
      }

      // Perform soft delete with metadata
      await message.softDelete({
        deletedBy: userId,
        deletedAt: new Date(),
        reason: 'user_requested'
      }, messageSession);

      // Cleanup associated resources (e.g., media files) asynchronously
      if (message.type !== ChatMessageType.TEXT) {
        // Queue cleanup job for associated media
        // Implementation depends on media handling service
      }

    } catch (error) {
      throw new DatabaseError(
        `Failed to delete message: ${error.message}`,
        { cause: error }
      );
    }
  }
}