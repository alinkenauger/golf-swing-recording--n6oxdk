import { io, Socket } from 'socket.io-client'; // v4.7.0
import { EventEmitter } from 'events'; // v3.3.0
import debug from 'debug'; // v4.3.4

import { MessageType, ChatEvent } from '../types/chat';

// Debug logger instance
const log = debug('app:socket');

// Environment and configuration constants
const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL;
const RECONNECTION_ATTEMPTS = 5;
const RECONNECTION_DELAY = 1000;
const MESSAGE_TIMEOUT = 5000;
const HEARTBEAT_INTERVAL = 30000;

// Socket connection states
enum ConnectionState {
  CONNECTED = 'CONNECTED',
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  ERROR = 'ERROR'
}

// Socket configuration options interface
interface SocketOptions {
  autoReconnect?: boolean;
  reconnectionAttempts?: number;
  reconnectionDelay?: number;
  heartbeatInterval?: number;
}

// Message queue interface for offline support
interface QueuedMessage {
  id: string;
  threadId: string;
  type: MessageType;
  content: string;
  timestamp: number;
  retryCount: number;
}

/**
 * SocketManager class for handling WebSocket connections and real-time communication
 * Implements comprehensive error handling, connection management, and offline support
 */
export class SocketManager {
  private socket: Socket | null = null;
  private eventEmitter: EventEmitter;
  private messageQueue: QueuedMessage[] = [];
  private pendingMessages: Map<string, NodeJS.Timeout> = new Map();
  private currentThreadId: string | null = null;
  private connectionState: ConnectionState = ConnectionState.DISCONNECTED;
  private reconnectAttempts: number = 0;
  private heartbeatInterval?: NodeJS.Timeout;
  private options: SocketOptions;

  constructor(options: SocketOptions = {}) {
    this.eventEmitter = new EventEmitter();
    this.options = {
      autoReconnect: true,
      reconnectionAttempts: RECONNECTION_ATTEMPTS,
      reconnectionDelay: RECONNECTION_DELAY,
      heartbeatInterval: HEARTBEAT_INTERVAL,
      ...options
    };
    log('SocketManager initialized with options:', this.options);
  }

  /**
   * Establishes WebSocket connection with authentication and automatic reconnection
   * @param token Authentication token for secure connection
   */
  public async connect(token: string): Promise<void> {
    if (!SOCKET_URL) {
      throw new Error('Socket URL not configured');
    }

    if (this.connectionState === ConnectionState.CONNECTING) {
      log('Connection already in progress');
      return;
    }

    this.connectionState = ConnectionState.CONNECTING;
    log('Initiating socket connection');

    try {
      this.socket = io(SOCKET_URL, {
        auth: { token },
        reconnection: this.options.autoReconnect,
        reconnectionAttempts: this.options.reconnectionAttempts,
        reconnectionDelay: this.options.reconnectionDelay,
        transports: ['websocket', 'polling']
      });

      this.setupEventHandlers();
      this.setupHeartbeat();

      await this.waitForConnection();
      this.processQueuedMessages();
    } catch (error) {
      this.handleConnectionError(error);
      throw error;
    }
  }

  /**
   * Gracefully closes the WebSocket connection and cleans up resources
   */
  public disconnect(): void {
    log('Disconnecting socket');
    this.clearHeartbeat();
    this.connectionState = ConnectionState.DISCONNECTED;
    
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }

    this.currentThreadId = null;
    this.pendingMessages.clear();
    this.eventEmitter.removeAllListeners();
  }

  /**
   * Sends a chat message with delivery guarantees and offline support
   * @param messageData Message data to be sent
   */
  public async sendMessage(messageData: {
    threadId: string;
    type: MessageType;
    content: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const messageId = crypto.randomUUID();
    
    if (!this.isConnected()) {
      this.queueMessage({
        id: messageId,
        ...messageData,
        timestamp: Date.now(),
        retryCount: 0
      });
      return;
    }

    try {
      await this.emitWithAck('message', {
        id: messageId,
        ...messageData
      });

      this.eventEmitter.emit('messageSent', messageId);
      log('Message sent successfully:', messageId);
    } catch (error) {
      this.handleMessageError(messageId, error);
      throw error;
    }
  }

  /**
   * Manages chat thread subscription with presence tracking
   * @param threadId ID of the thread to join
   */
  public async joinThread(threadId: string): Promise<void> {
    if (this.currentThreadId === threadId) {
      return;
    }

    if (this.currentThreadId) {
      await this.leaveThread(this.currentThreadId);
    }

    try {
      await this.emitWithAck('joinThread', { threadId });
      this.currentThreadId = threadId;
      this.setupThreadEventHandlers(threadId);
      log('Joined thread:', threadId);
    } catch (error) {
      log('Error joining thread:', error);
      throw error;
    }
  }

  /**
   * Updates user presence status in current thread
   * @param status Presence status to update
   */
  public async updatePresence(status: 'online' | 'away' | 'offline'): Promise<void> {
    if (!this.currentThreadId || !this.isConnected()) {
      return;
    }

    try {
      await this.emitWithAck('presence', {
        threadId: this.currentThreadId,
        status
      });
      log('Presence updated:', status);
    } catch (error) {
      log('Error updating presence:', error);
      throw error;
    }
  }

  /**
   * Subscribes to socket events with error handling
   * @param event Event name to subscribe to
   * @param callback Event handler callback
   */
  public on(event: string, callback: (data: any) => void): void {
    this.eventEmitter.on(event, callback);
  }

  /**
   * Unsubscribes from socket events
   * @param event Event name to unsubscribe from
   * @param callback Event handler callback
   */
  public off(event: string, callback: (data: any) => void): void {
    this.eventEmitter.off(event, callback);
  }

  private setupEventHandlers(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      this.connectionState = ConnectionState.CONNECTED;
      this.reconnectAttempts = 0;
      this.eventEmitter.emit('connected');
      log('Socket connected');
    });

    this.socket.on('disconnect', (reason) => {
      this.connectionState = ConnectionState.DISCONNECTED;
      this.eventEmitter.emit('disconnected', reason);
      log('Socket disconnected:', reason);
    });

    this.socket.on('error', this.handleConnectionError.bind(this));

    this.socket.on(ChatEvent.MESSAGE_DELIVERED, (data) => {
      this.clearMessageTimeout(data.messageId);
      this.eventEmitter.emit('messageDelivered', data);
    });
  }

  private setupThreadEventHandlers(threadId: string): void {
    if (!this.socket) return;

    this.socket.on(`${threadId}:typing`, (data) => {
      this.eventEmitter.emit('typing', data);
    });

    this.socket.on(`${threadId}:presence`, (data) => {
      this.eventEmitter.emit('presenceUpdate', data);
    });
  }

  private setupHeartbeat(): void {
    this.clearHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      if (this.isConnected()) {
        this.socket?.emit('heartbeat');
      }
    }, this.options.heartbeatInterval);
  }

  private clearHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
  }

  private async emitWithAck(event: string, data: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.isConnected()) {
        reject(new Error('Socket not connected'));
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error('Acknowledgment timeout'));
      }, MESSAGE_TIMEOUT);

      this.socket.emit(event, data, (response: any) => {
        clearTimeout(timeout);
        if (response?.error) {
          reject(response.error);
        } else {
          resolve(response);
        }
      });
    });
  }

  private async waitForConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.isConnected()) {
        resolve();
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, MESSAGE_TIMEOUT);

      this.eventEmitter.once('connected', () => {
        clearTimeout(timeout);
        resolve();
      });

      this.eventEmitter.once('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  private handleConnectionError(error: any): void {
    this.connectionState = ConnectionState.ERROR;
    log('Socket connection error:', error);
    this.eventEmitter.emit('error', error);
  }

  private handleMessageError(messageId: string, error: any): void {
    this.clearMessageTimeout(messageId);
    log('Message error:', messageId, error);
    this.eventEmitter.emit('messageError', { messageId, error });
  }

  private queueMessage(message: QueuedMessage): void {
    this.messageQueue.push(message);
    log('Message queued:', message.id);
    this.eventEmitter.emit('messageQueued', message);
  }

  private async processQueuedMessages(): Promise<void> {
    if (!this.messageQueue.length) return;

    log('Processing queued messages:', this.messageQueue.length);
    
    for (const message of this.messageQueue) {
      try {
        await this.sendMessage({
          threadId: message.threadId,
          type: message.type,
          content: message.content
        });
        this.messageQueue = this.messageQueue.filter(m => m.id !== message.id);
      } catch (error) {
        log('Error processing queued message:', message.id, error);
      }
    }
  }

  private clearMessageTimeout(messageId: string): void {
    const timeout = this.pendingMessages.get(messageId);
    if (timeout) {
      clearTimeout(timeout);
      this.pendingMessages.delete(messageId);
    }
  }

  private isConnected(): boolean {
    return this.connectionState === ConnectionState.CONNECTED && !!this.socket?.connected;
  }

  private async leaveThread(threadId: string): Promise<void> {
    if (!this.socket || !this.isConnected()) return;

    try {
      await this.emitWithAck('leaveThread', { threadId });
      this.socket.off(`${threadId}:typing`);
      this.socket.off(`${threadId}:presence`);
      log('Left thread:', threadId);
    } catch (error) {
      log('Error leaving thread:', error);
    }
  }
}