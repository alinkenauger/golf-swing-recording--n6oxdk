import { injectable } from 'inversify'; // ^6.0.1
import { Socket } from 'socket.io'; // ^4.7.0
import { Queue } from 'bull'; // ^4.10.0
import { RedisService } from 'ioredis'; // ^5.0.0
import { Metrics } from 'prom-client'; // ^14.2.0
import { Logger } from '../../../shared/utils/logger';
import { ChatService } from '../services/chat.service';
import { validateMessage } from './middleware';
import { ChatMessageType } from '../types';

// Global constants
const TYPING_TIMEOUT = 3000;
const PRESENCE_UPDATE_INTERVAL = 30000;
const MAX_MESSAGE_SIZE = 1048576; // 1MB
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_MESSAGES_PER_WINDOW = 100;

@injectable()
export class SocketHandlers {
  private readonly typingTimeouts: Map<string, NodeJS.Timeout>;
  private readonly userSockets: Map<string, string>;
  private readonly messageRateLimits: Map<string, number>;
  private readonly metrics: Metrics;

  constructor(
    private readonly chatService: ChatService,
    private readonly redisService: RedisService,
    private readonly logger: Logger,
    private readonly messageQueue: Queue
  ) {
    this.typingTimeouts = new Map();
    this.userSockets = new Map();
    this.messageRateLimits = new Map();
    this.initializeMetrics();
    this.startPresenceHeartbeat();
  }

  /**
   * Handles new socket connections with enhanced presence tracking
   */
  public async handleConnection(socket: Socket): Promise<void> {
    try {
      const userId = socket.data.user?.id;
      if (!userId) {
        socket.disconnect();
        return;
      }

      // Store socket reference
      this.userSockets.set(userId, socket.id);
      
      // Initialize rate limiting
      this.messageRateLimits.set(userId, 0);

      // Join user's rooms
      const userThreads = await this.chatService.getUserThreads(userId);
      userThreads.forEach(thread => {
        socket.join(thread.id);
      });

      // Set up message handlers
      socket.on('message', async (data) => {
        await this.handleMessage(socket, data);
      });

      // Set up typing handlers
      socket.on('typing', async (data) => {
        await this.handleTyping(socket, data);
      });

      // Set up read receipt handlers
      socket.on('read', async (data) => {
        await this.handleReadReceipt(socket, data);
      });

      // Set up presence handlers
      socket.on('presence', async (data) => {
        await this.handlePresence(socket, data);
      });

      // Handle disconnection
      socket.on('disconnect', async () => {
        this.userSockets.delete(userId);
        this.messageRateLimits.delete(userId);
        await this.chatService.handlePresenceUpdate(userId, false);
        this.metrics.disconnections.inc();
      });

      // Update presence
      await this.chatService.handlePresenceUpdate(userId, true, {
        device: socket.handshake.headers['user-agent']
      });

      this.metrics.connections.inc();
      this.logger.info('Socket connected', { userId, socketId: socket.id });

    } catch (error) {
      this.logger.error('Connection handler error', error);
      socket.disconnect();
    }
  }

  /**
   * Handles incoming chat messages with delivery tracking
   */
  private async handleMessage(socket: Socket, messageData: any): Promise<void> {
    try {
      const userId = socket.data.user?.id;

      // Check rate limiting
      if (!this.checkRateLimit(userId)) {
        throw new Error('Rate limit exceeded');
      }

      // Validate message
      if (!validateMessage(messageData)) {
        throw new Error('Invalid message format');
      }

      // Process message
      const message = await this.chatService.sendMessage({
        threadId: messageData.threadId,
        senderId: userId,
        type: messageData.type || ChatMessageType.TEXT,
        content: messageData.content,
        metadata: messageData.metadata,
        replyTo: messageData.replyTo
      });

      // Track delivery status
      await this.redisService.hset(
        `msg:${message.id}:delivery`,
        userId,
        JSON.stringify({ status: 'sent', timestamp: new Date() })
      );

      // Queue offline notifications
      await this.messageQueue.add('sendNotifications', {
        messageId: message.id,
        threadId: messageData.threadId,
        senderId: userId
      });

      this.metrics.messagesSent.inc({ type: messageData.type });
      this.logger.info('Message processed', { messageId: message.id });

    } catch (error) {
      this.logger.error('Message handler error', error);
      socket.emit('error', { message: 'Failed to process message' });
    }
  }

  /**
   * Handles typing indicator events with debouncing
   */
  private async handleTyping(socket: Socket, typingData: any): Promise<void> {
    try {
      const userId = socket.data.user?.id;
      const timeoutKey = `typing:${typingData.threadId}:${userId}`;

      // Clear existing timeout
      if (this.typingTimeouts.has(timeoutKey)) {
        clearTimeout(this.typingTimeouts.get(timeoutKey));
      }

      // Broadcast typing status
      socket.to(typingData.threadId).emit('typing', {
        userId,
        threadId: typingData.threadId,
        isTyping: typingData.isTyping
      });

      // Set new timeout
      if (typingData.isTyping) {
        const timeout = setTimeout(() => {
          socket.to(typingData.threadId).emit('typing', {
            userId,
            threadId: typingData.threadId,
            isTyping: false
          });
          this.typingTimeouts.delete(timeoutKey);
        }, TYPING_TIMEOUT);

        this.typingTimeouts.set(timeoutKey, timeout);
      }

      this.metrics.typingEvents.inc();

    } catch (error) {
      this.logger.error('Typing handler error', error);
    }
  }

  /**
   * Handles message read receipts with Redis tracking
   */
  private async handleReadReceipt(socket: Socket, receiptData: any): Promise<void> {
    try {
      const userId = socket.data.user?.id;

      await this.chatService.markMessageAsRead(
        receiptData.messageId,
        userId,
        receiptData.threadId
      );

      // Update Redis tracking
      await this.redisService.hset(
        `msg:${receiptData.messageId}:read`,
        userId,
        new Date().toISOString()
      );

      // Broadcast read status
      socket.to(receiptData.threadId).emit('read', {
        messageId: receiptData.messageId,
        userId,
        threadId: receiptData.threadId,
        timestamp: new Date()
      });

      this.metrics.readReceipts.inc();

    } catch (error) {
      this.logger.error('Read receipt handler error', error);
    }
  }

  /**
   * Manages user presence with heartbeat
   */
  private async handlePresence(socket: Socket, presenceData: any): Promise<void> {
    try {
      const userId = socket.data.user?.id;

      await this.chatService.handlePresenceUpdate(
        userId,
        presenceData.status === 'online',
        {
          device: socket.handshake.headers['user-agent'],
          lastSeen: new Date()
        }
      );

      this.metrics.presenceUpdates.inc();

    } catch (error) {
      this.logger.error('Presence handler error', error);
    }
  }

  /**
   * Initializes metrics collectors
   */
  private initializeMetrics(): void {
    this.metrics = {
      connections: new Metrics.Counter({
        name: 'ws_connections_total',
        help: 'Total WebSocket connections'
      }),
      disconnections: new Metrics.Counter({
        name: 'ws_disconnections_total',
        help: 'Total WebSocket disconnections'
      }),
      messagesSent: new Metrics.Counter({
        name: 'messages_sent_total',
        help: 'Total messages sent',
        labelNames: ['type']
      }),
      typingEvents: new Metrics.Counter({
        name: 'typing_events_total',
        help: 'Total typing indicator events'
      }),
      readReceipts: new Metrics.Counter({
        name: 'read_receipts_total',
        help: 'Total read receipts processed'
      }),
      presenceUpdates: new Metrics.Counter({
        name: 'presence_updates_total',
        help: 'Total presence status updates'
      })
    };
  }

  /**
   * Starts presence heartbeat interval
   */
  private startPresenceHeartbeat(): void {
    setInterval(async () => {
      for (const [userId, socketId] of this.userSockets) {
        try {
          await this.chatService.handlePresenceUpdate(userId, true);
        } catch (error) {
          this.logger.error('Presence heartbeat error', error);
        }
      }
    }, PRESENCE_UPDATE_INTERVAL);
  }

  /**
   * Checks rate limiting for message sending
   */
  private checkRateLimit(userId: string): boolean {
    const currentCount = this.messageRateLimits.get(userId) || 0;
    if (currentCount >= MAX_MESSAGES_PER_WINDOW) {
      return false;
    }
    this.messageRateLimits.set(userId, currentCount + 1);
    return true;
  }
}

export default SocketHandlers;