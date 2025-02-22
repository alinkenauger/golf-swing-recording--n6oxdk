import { injectable } from 'inversify'; // ^6.0.1
import { Server } from 'socket.io'; // ^4.7.0
import * as admin from 'firebase-admin'; // ^11.11.0
import Redis from 'ioredis'; // ^5.3.0
import * as Bull from 'bull'; // ^4.10.0
import { Logger } from '../../../shared/utils/logger';
import { ChatMessage } from '../models/chat.model';
import { MessageType, MessageStatus, ThreadNotificationPreferences } from '../types';

// Notification types for different events
const NOTIFICATION_TYPES = {
  NEW_MESSAGE: 'new_message',
  TYPING: 'typing',
  PRESENCE: 'presence',
  RICH_MEDIA: 'rich_media',
  GROUP_UPDATE: 'group_update'
} as const;

// Configuration constants
const NOTIFICATION_DEBOUNCE = 1000; // 1 second
const NOTIFICATION_RETRY_ATTEMPTS = 3;
const NOTIFICATION_BATCH_SIZE = 100;
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 100;

// Interfaces for notification tracking
interface NotificationMetrics {
  attempts: number;
  success: number;
  failed: number;
  lastAttempt: Date;
}

interface NotificationPayload {
  type: keyof typeof NOTIFICATION_TYPES;
  data: any;
  recipients: string[];
  priority: 'high' | 'normal';
}

interface NotificationResult {
  success: boolean;
  delivered: string[];
  failed: string[];
  metrics: NotificationMetrics;
}

@injectable()
export class NotificationService {
  private readonly logger: Logger;
  private readonly deliveryMetrics: Map<string, NotificationMetrics>;
  private readonly typingTimeouts: Map<string, NodeJS.Timeout>;

  constructor(
    private readonly io: Server,
    private readonly cache: Redis,
    private readonly queue: Bull.Queue
  ) {
    this.logger = new Logger('NotificationService');
    this.deliveryMetrics = new Map();
    this.typingTimeouts = new Map();

    // Initialize Firebase Admin SDK
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.applicationDefault()
      });
    }

    this.setupErrorHandling();
  }

  /**
   * Sends real-time and push notifications for new messages
   */
  public async sendMessageNotification(
    message: ChatMessage,
    recipientIds: string[],
    preferences: ThreadNotificationPreferences
  ): Promise<NotificationResult> {
    try {
      // Check rate limits
      const rateLimitKey = `ratelimit:notifications:${message.senderId}`;
      const requests = await this.cache.incr(rateLimitKey);
      await this.cache.expire(rateLimitKey, RATE_LIMIT_WINDOW / 1000);

      if (requests > RATE_LIMIT_MAX_REQUESTS) {
        throw new Error('Rate limit exceeded');
      }

      // Prepare notification payload
      const payload: NotificationPayload = {
        type: NOTIFICATION_TYPES.NEW_MESSAGE,
        data: {
          messageId: message.id,
          threadId: message.threadId,
          senderId: message.senderId,
          content: this.sanitizeContent(message),
          type: message.type
        },
        recipients: recipientIds,
        priority: preferences.priority || 'normal'
      };

      // Send real-time notifications via Socket.IO
      const onlineUsers = await this.getOnlineUsers(recipientIds);
      onlineUsers.forEach(userId => {
        this.io.to(userId).emit('notification', payload);
      });

      // Send push notifications to offline users
      const offlineUsers = recipientIds.filter(id => !onlineUsers.includes(id));
      const pushResults = await this.sendPushNotifications(payload, offlineUsers);

      // Update delivery metrics
      this.updateDeliveryMetrics(message.id, {
        attempts: 1,
        success: pushResults.delivered.length,
        failed: pushResults.failed.length,
        lastAttempt: new Date()
      });

      return {
        success: true,
        delivered: [...onlineUsers, ...pushResults.delivered],
        failed: pushResults.failed,
        metrics: this.deliveryMetrics.get(message.id) || {
          attempts: 0,
          success: 0,
          failed: 0,
          lastAttempt: new Date()
        }
      };
    } catch (error) {
      this.logger.error('Failed to send message notification', error);
      return this.handleNotificationFailure(error, message.id, recipientIds);
    }
  }

  /**
   * Sends typing status notifications with debouncing
   */
  public async sendTypingNotification(
    threadId: string,
    userId: string,
    isTyping: boolean
  ): Promise<void> {
    const timeoutKey = `typing:${threadId}:${userId}`;
    
    if (this.typingTimeouts.has(timeoutKey)) {
      clearTimeout(this.typingTimeouts.get(timeoutKey));
    }

    // Emit typing status
    this.io.to(threadId).emit('typing', {
      threadId,
      userId,
      isTyping
    });

    // Set timeout to clear typing status
    if (isTyping) {
      const timeout = setTimeout(() => {
        this.io.to(threadId).emit('typing', {
          threadId,
          userId,
          isTyping: false
        });
        this.typingTimeouts.delete(timeoutKey);
      }, NOTIFICATION_DEBOUNCE);

      this.typingTimeouts.set(timeoutKey, timeout);
    }
  }

  /**
   * Sends presence status updates
   */
  public async sendPresenceNotification(
    userId: string,
    isOnline: boolean,
    metadata: { lastSeen?: Date; device?: string }
  ): Promise<void> {
    try {
      // Update presence in cache
      const presenceKey = `presence:${userId}`;
      await this.cache.hset(presenceKey, {
        status: isOnline ? 'online' : 'offline',
        lastSeen: metadata.lastSeen?.toISOString() || new Date().toISOString(),
        device: metadata.device
      });
      await this.cache.expire(presenceKey, 24 * 60 * 60); // 24 hours TTL

      // Notify relevant users
      this.io.emit('presence', {
        userId,
        status: isOnline ? 'online' : 'offline',
        lastSeen: metadata.lastSeen || new Date(),
        device: metadata.device
      });

      this.logger.info('Presence notification sent', {
        userId,
        status: isOnline ? 'online' : 'offline'
      });
    } catch (error) {
      this.logger.error('Failed to send presence notification', error);
      throw error;
    }
  }

  /**
   * Handles failed notifications with retry logic
   */
  private async handleNotificationFailure(
    error: Error,
    messageId: string,
    recipients: string[]
  ): Promise<NotificationResult> {
    const metrics = this.deliveryMetrics.get(messageId) || {
      attempts: 0,
      success: 0,
      failed: 0,
      lastAttempt: new Date()
    };

    if (metrics.attempts < NOTIFICATION_RETRY_ATTEMPTS) {
      // Queue for retry
      await this.queue.add('retryNotification', {
        messageId,
        recipients,
        attempt: metrics.attempts + 1
      }, {
        delay: Math.pow(2, metrics.attempts) * 1000, // Exponential backoff
        attempts: NOTIFICATION_RETRY_ATTEMPTS - metrics.attempts
      });
    }

    metrics.attempts++;
    metrics.failed += recipients.length;
    metrics.lastAttempt = new Date();
    this.deliveryMetrics.set(messageId, metrics);

    return {
      success: false,
      delivered: [],
      failed: recipients,
      metrics
    };
  }

  /**
   * Helper method to get online users from cache
   */
  private async getOnlineUsers(userIds: string[]): Promise<string[]> {
    const pipeline = this.cache.pipeline();
    userIds.forEach(id => {
      pipeline.hget(`presence:${id}`, 'status');
    });
    const results = await pipeline.exec();
    return userIds.filter((id, index) => results[index]?.[1] === 'online');
  }

  /**
   * Sends push notifications via Firebase
   */
  private async sendPushNotifications(
    payload: NotificationPayload,
    recipients: string[]
  ): Promise<{ delivered: string[]; failed: string[] }> {
    const delivered: string[] = [];
    const failed: string[] = [];

    // Batch notifications
    for (let i = 0; i < recipients.length; i += NOTIFICATION_BATCH_SIZE) {
      const batch = recipients.slice(i, i + NOTIFICATION_BATCH_SIZE);
      try {
        const messages = batch.map(userId => ({
          token: userId,
          notification: {
            title: 'New Message',
            body: this.formatNotificationBody(payload)
          },
          data: {
            type: payload.type,
            ...payload.data
          },
          android: {
            priority: payload.priority === 'high' ? 'high' : 'normal'
          },
          apns: {
            payload: {
              aps: {
                'content-available': 1
              }
            }
          }
        }));

        const response = await admin.messaging().sendAll(messages);
        response.responses.forEach((resp, index) => {
          if (resp.success) {
            delivered.push(batch[index]);
          } else {
            failed.push(batch[index]);
          }
        });
      } catch (error) {
        this.logger.error('Failed to send push notifications batch', error);
        failed.push(...batch);
      }
    }

    return { delivered, failed };
  }

  /**
   * Helper method to sanitize message content for notifications
   */
  private sanitizeContent(message: ChatMessage): string {
    if (message.type === MessageType.TEXT) {
      return message.content.substring(0, 100);
    }
    return `New ${message.type} message`;
  }

  /**
   * Formats notification body based on payload type
   */
  private formatNotificationBody(payload: NotificationPayload): string {
    switch (payload.type) {
      case NOTIFICATION_TYPES.NEW_MESSAGE:
        return payload.data.content;
      case NOTIFICATION_TYPES.TYPING:
        return 'Someone is typing...';
      case NOTIFICATION_TYPES.PRESENCE:
        return `${payload.data.userId} is ${payload.data.status}`;
      default:
        return 'New notification';
    }
  }

  /**
   * Sets up error handling for the notification service
   */
  private setupErrorHandling(): void {
    this.queue.on('failed', (job, error) => {
      this.logger.error('Notification job failed', error, {
        jobId: job.id,
        data: job.data
      });
    });

    process.on('unhandledRejection', (error) => {
      this.logger.error('Unhandled rejection in notification service', error);
    });
  }

  /**
   * Updates delivery metrics for tracking
   */
  private updateDeliveryMetrics(
    messageId: string,
    metrics: NotificationMetrics
  ): void {
    const existing = this.deliveryMetrics.get(messageId) || {
      attempts: 0,
      success: 0,
      failed: 0,
      lastAttempt: new Date()
    };

    this.deliveryMetrics.set(messageId, {
      attempts: existing.attempts + metrics.attempts,
      success: existing.success + metrics.success,
      failed: existing.failed + metrics.failed,
      lastAttempt: metrics.lastAttempt
    });
  }
}