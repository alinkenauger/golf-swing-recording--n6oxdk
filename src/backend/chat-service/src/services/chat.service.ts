import { injectable } from 'inversify'; // ^6.0.1
import { Server } from 'socket.io'; // ^4.7.0
import Redis from 'ioredis'; // ^5.3.0
import { ChatRepository } from '../repositories/chat.repository';
import { NotificationService } from './notification.service';
import { Logger } from '../../../shared/utils/logger';
import { Message, MessageType, MessageStatus, ChatThread, ThreadParticipant } from '../types';
import { Thread } from '../models/thread.model';

// Global constants
const MESSAGE_TYPES = {
  TEXT: 'text',
  VIDEO: 'video',
  VOICE: 'voice'
} as const;

const MAX_MESSAGE_LENGTH = 5000;
const TYPING_TIMEOUT = 3000;
const DELIVERY_RETRY_ATTEMPTS = 3;
const CACHE_TTL = 3600;

@injectable()
export class ChatService {
  private readonly logger: Logger;
  private readonly activeConnections: Map<string, Set<string>>;
  private readonly typingTimeouts: Map<string, NodeJS.Timeout>;
  private readonly redis: Redis;

  constructor(
    private readonly chatRepository: ChatRepository,
    private readonly notificationService: NotificationService,
    private readonly io: Server
  ) {
    this.logger = new Logger('ChatService');
    this.activeConnections = new Map();
    this.typingTimeouts = new Map();
    this.redis = new Redis();

    this.setupSocketHandlers();
  }

  /**
   * Sends a new message with enhanced delivery tracking
   */
  public async sendMessage(messageData: {
    threadId: string;
    senderId: string;
    type: MessageType;
    content: string;
    metadata?: Record<string, any>;
    replyTo?: string;
  }): Promise<Message> {
    try {
      // Validate message content
      if (messageData.content.length > MAX_MESSAGE_LENGTH) {
        throw new Error(`Message exceeds maximum length of ${MAX_MESSAGE_LENGTH}`);
      }

      // Get thread and validate sender participation
      const thread = await Thread.findById(messageData.threadId);
      if (!thread) {
        throw new Error('Thread not found');
      }

      const isParticipant = await thread.isParticipant(messageData.senderId);
      if (!isParticipant) {
        throw new Error('Sender is not a thread participant');
      }

      // Create message with optimistic update
      const message = await this.chatRepository.createMessage(messageData);

      // Get thread participants excluding sender
      const recipients = thread.participants
        .filter(p => p.userId.toString() !== messageData.senderId)
        .map(p => p.userId.toString());

      // Send real-time notifications
      await this.notificationService.sendMessageNotification(
        message,
        recipients,
        {
          muted: false,
          muteExpiration: null,
          showPreview: true,
          sound: true,
          priority: 'high'
        }
      );

      // Update thread metadata
      await Thread.findByIdAndUpdate(messageData.threadId, {
        lastMessageAt: new Date(),
        'metadata.lastActivity': new Date()
      });

      this.logger.info('Message sent successfully', {
        messageId: message.id,
        threadId: messageData.threadId,
        type: messageData.type
      });

      return message;
    } catch (error) {
      this.logger.error('Failed to send message', error);
      throw error;
    }
  }

  /**
   * Retrieves paginated messages with optimized batch updates
   */
  public async getThreadMessages(
    threadId: string,
    page: number = 1,
    limit: number = 50,
    filters?: {
      type?: MessageType[];
      startDate?: Date;
      endDate?: Date;
      senderId?: string;
    }
  ): Promise<{
    messages: Message[];
    total: number;
    hasMore: boolean;
  }> {
    try {
      const cacheKey = `thread:${threadId}:messages:${page}:${limit}`;
      const cachedResult = await this.redis.get(cacheKey);

      if (cachedResult) {
        return JSON.parse(cachedResult);
      }

      const result = await this.chatRepository.getMessagesByThread(
        threadId,
        page,
        limit,
        filters
      );

      // Cache results
      await this.redis.setex(
        cacheKey,
        CACHE_TTL,
        JSON.stringify(result)
      );

      return result;
    } catch (error) {
      this.logger.error('Failed to retrieve thread messages', error);
      throw error;
    }
  }

  /**
   * Handles user presence with enhanced connection tracking
   */
  public async handlePresenceUpdate(
    userId: string,
    isOnline: boolean,
    metadata?: { device?: string }
  ): Promise<void> {
    try {
      if (isOnline) {
        // Update active connections
        const userConnections = this.activeConnections.get(userId) || new Set();
        userConnections.add(metadata?.device || 'unknown');
        this.activeConnections.set(userId, userConnections);

        // Update presence in cache
        await this.redis.hset(`presence:${userId}`, {
          status: 'online',
          lastSeen: new Date().toISOString(),
          connections: userConnections.size
        });
      } else {
        // Remove connection
        const userConnections = this.activeConnections.get(userId);
        if (userConnections) {
          userConnections.delete(metadata?.device || 'unknown');
          if (userConnections.size === 0) {
            this.activeConnections.delete(userId);
          }
        }

        // Update presence in cache
        await this.redis.hset(`presence:${userId}`, {
          status: 'offline',
          lastSeen: new Date().toISOString(),
          connections: userConnections?.size || 0
        });
      }

      // Notify relevant users
      await this.notificationService.sendPresenceNotification(
        userId,
        isOnline,
        {
          lastSeen: new Date(),
          device: metadata?.device
        }
      );
    } catch (error) {
      this.logger.error('Failed to handle presence update', error);
      throw error;
    }
  }

  /**
   * Sets up WebSocket event handlers
   */
  private setupSocketHandlers(): void {
    this.io.on('connection', (socket) => {
      const userId = socket.handshake.auth.userId;
      if (!userId) {
        socket.disconnect();
        return;
      }

      // Handle connection
      this.handlePresenceUpdate(userId, true, {
        device: socket.handshake.headers['user-agent']
      });

      // Handle typing events
      socket.on('typing', async (data: { threadId: string; isTyping: boolean }) => {
        await this.notificationService.sendTypingNotification(
          data.threadId,
          userId,
          data.isTyping
        );
      });

      // Handle disconnection
      socket.on('disconnect', async () => {
        await this.handlePresenceUpdate(userId, false);
      });

      // Handle errors
      socket.on('error', (error) => {
        this.logger.error('Socket error', error);
      });
    });
  }
}