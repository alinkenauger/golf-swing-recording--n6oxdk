import { Observable, Subject, BehaviorSubject, from, throwError } from 'rxjs'; // ^7.8.0
import { retry, timeout, catchError, map, filter } from 'rxjs/operators'; // ^7.8.0

import { ApiClient } from '../lib/api';
import { SocketManager } from '../lib/socket';
import { 
  Message, 
  MessageType, 
  MessageStatus, 
  ChatThread, 
  ChatEvent,
  MessageDeliveryReceipt,
  MessageDraft 
} from '../types/chat';
import { API_ROUTES } from '../constants/api';

// Environment and configuration constants
const CHAT_API_ENDPOINT = process.env.NEXT_PUBLIC_CHAT_API_ENDPOINT;
const MESSAGE_BATCH_SIZE = 50;
const RETRY_ATTEMPTS = 3;
const MESSAGE_TIMEOUT = 30000;

/**
 * Enhanced chat service class providing real-time messaging, thread management,
 * and offline support for the Video Coaching Platform
 */
export class ChatService {
  private messageSubject = new Subject<Message>();
  private presenceSubject = new BehaviorSubject<Map<string, string>>(new Map());
  private typingSubject = new Subject<{ threadId: string; userId: string; isTyping: boolean }>();
  private offlineQueue: Map<string, Message[]> = new Map();
  private messageCache: Map<string, Message[]> = new Map();
  private draftMessages: Map<string, MessageDraft> = new Map();

  // Public observables for real-time updates
  public readonly messageStream$ = this.messageSubject.asObservable();
  public readonly presenceStream$ = this.presenceSubject.asObservable();
  public readonly typingStream$ = this.typingSubject.asObservable();

  constructor(
    private readonly apiClient: ApiClient,
    private readonly socketManager: SocketManager
  ) {}

  /**
   * Initializes chat service with WebSocket connection and event handlers
   * @param userId Current user ID
   * @param authToken Authentication token
   */
  public async initializeChat(userId: string, authToken: string): Promise<void> {
    try {
      await this.socketManager.connect(authToken);
      this.setupEventListeners();
      await this.syncOfflineMessages();
    } catch (error) {
      console.error('Chat initialization failed:', error);
      throw error;
    }
  }

  /**
   * Sends a message with delivery tracking and offline support
   * @param threadId Chat thread ID
   * @param content Message content
   * @param type Message type
   */
  public async sendMessage(
    threadId: string,
    content: string,
    type: MessageType = MessageType.TEXT
  ): Promise<Message> {
    const message: Message = {
      id: crypto.randomUUID(),
      threadId,
      content,
      type,
      status: MessageStatus.SENT,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
      mediaUrl: null,
      senderId: 'currentUser' // Replace with actual user ID from context
    };

    try {
      if (!this.socketManager.isConnected()) {
        this.queueOfflineMessage(message);
        return message;
      }

      await this.socketManager.sendMessage({
        threadId,
        type,
        content
      });

      this.updateMessageCache(message);
      this.messageSubject.next(message);
      return message;
    } catch (error) {
      message.status = MessageStatus.FAILED;
      this.queueOfflineMessage(message);
      throw error;
    }
  }

  /**
   * Retrieves chat thread messages with pagination
   * @param threadId Chat thread ID
   * @param page Page number
   */
  public async getThreadMessages(threadId: string, page = 1): Promise<Message[]> {
    try {
      const response = await this.apiClient.get<Message[]>(
        `${API_ROUTES.CHAT.MESSAGES.replace(':id', threadId)}`,
        {
          params: {
            page,
            limit: MESSAGE_BATCH_SIZE
          }
        }
      );

      const messages = response.data;
      this.updateMessageCache(messages);
      return messages;
    } catch (error) {
      console.error('Failed to fetch thread messages:', error);
      return this.messageCache.get(threadId) || [];
    }
  }

  /**
   * Marks messages as read in a thread
   * @param threadId Chat thread ID
   * @param messageIds Message IDs to mark as read
   */
  public async markMessagesAsRead(threadId: string, messageIds: string[]): Promise<void> {
    try {
      await this.apiClient.post(
        `${API_ROUTES.CHAT.READ_STATUS.replace(':id', threadId)}`,
        { messageIds }
      );

      this.updateMessageStatus(threadId, messageIds, MessageStatus.READ);
    } catch (error) {
      console.error('Failed to mark messages as read:', error);
      throw error;
    }
  }

  /**
   * Updates typing status in a thread
   * @param threadId Chat thread ID
   * @param isTyping Typing status
   */
  public async setTypingStatus(threadId: string, isTyping: boolean): Promise<void> {
    await this.socketManager.emitWithAck('typing', { threadId, isTyping });
  }

  /**
   * Saves message draft for a thread
   * @param threadId Chat thread ID
   * @param draft Message draft
   */
  public saveDraft(threadId: string, draft: MessageDraft): void {
    this.draftMessages.set(threadId, {
      ...draft,
      savedAt: new Date().toISOString()
    });
  }

  /**
   * Retrieves message draft for a thread
   * @param threadId Chat thread ID
   */
  public getDraft(threadId: string): MessageDraft | undefined {
    return this.draftMessages.get(threadId);
  }

  /**
   * Cleans up chat service resources
   */
  public dispose(): void {
    this.messageSubject.complete();
    this.presenceSubject.complete();
    this.typingSubject.complete();
    this.socketManager.disconnect();
  }

  private setupEventListeners(): void {
    this.socketManager.on(ChatEvent.MESSAGE_DELIVERED, (receipt: MessageDeliveryReceipt) => {
      this.updateMessageStatus(receipt.threadId, [receipt.messageId], MessageStatus.DELIVERED);
    });

    this.socketManager.on('presence', (data: { userId: string; status: string }) => {
      const presenceMap = this.presenceSubject.value;
      presenceMap.set(data.userId, data.status);
      this.presenceSubject.next(presenceMap);
    });

    this.socketManager.on('typing', (data: { threadId: string; userId: string; isTyping: boolean }) => {
      this.typingSubject.next(data);
    });
  }

  private async syncOfflineMessages(): Promise<void> {
    for (const [threadId, messages] of this.offlineQueue.entries()) {
      try {
        for (const message of messages) {
          await this.sendMessage(threadId, message.content, message.type);
        }
        this.offlineQueue.delete(threadId);
      } catch (error) {
        console.error('Failed to sync offline messages:', error);
      }
    }
  }

  private queueOfflineMessage(message: Message): void {
    const threadMessages = this.offlineQueue.get(message.threadId) || [];
    threadMessages.push(message);
    this.offlineQueue.set(message.threadId, threadMessages);
  }

  private updateMessageCache(messages: Message | Message[]): void {
    const messageArray = Array.isArray(messages) ? messages : [messages];
    messageArray.forEach(message => {
      const threadMessages = this.messageCache.get(message.threadId) || [];
      const messageIndex = threadMessages.findIndex(m => m.id === message.id);
      
      if (messageIndex >= 0) {
        threadMessages[messageIndex] = message;
      } else {
        threadMessages.push(message);
      }
      
      this.messageCache.set(message.threadId, threadMessages);
    });
  }

  private updateMessageStatus(threadId: string, messageIds: string[], status: MessageStatus): void {
    const threadMessages = this.messageCache.get(threadId) || [];
    messageIds.forEach(messageId => {
      const message = threadMessages.find(m => m.id === messageId);
      if (message) {
        message.status = status;
      }
    });
    this.messageCache.set(threadId, threadMessages);
  }
}