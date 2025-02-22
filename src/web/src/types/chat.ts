/**
 * TypeScript type definitions and interfaces for chat functionality in the web application.
 * Includes comprehensive types for messages, threads, and real-time communication.
 * @version 1.0.0
 */

import { BaseEntity } from './common';
import { User } from './user';

/**
 * Enum defining all supported chat message types including media formats
 */
export enum MessageType {
  TEXT = 'TEXT',
  VIDEO = 'VIDEO',
  IMAGE = 'IMAGE',
  VOICE = 'VOICE'
}

/**
 * Enum for tracking message delivery status with error handling support
 */
export enum MessageStatus {
  SENT = 'SENT',
  DELIVERED = 'DELIVERED',
  READ = 'READ',
  FAILED = 'FAILED'
}

/**
 * Enum defining WebSocket chat events including typing indicators
 */
export enum ChatEvent {
  MESSAGE_SENT = 'MESSAGE_SENT',
  MESSAGE_DELIVERED = 'MESSAGE_DELIVERED',
  MESSAGE_READ = 'MESSAGE_READ',
  TYPING_START = 'TYPING_START',
  TYPING_END = 'TYPING_END'
}

/**
 * Interface for chat messages with comprehensive media and status support
 */
export interface Message extends BaseEntity {
  threadId: string;
  senderId: string;
  type: MessageType;
  content: string;
  mediaUrl: string | null;
  status: MessageStatus;
  replyTo?: string | null;
  metadata?: {
    duration?: number; // For voice/video messages
    thumbnail?: string; // For video/image messages
    dimensions?: {
      width: number;
      height: number;
    }; // For image/video messages
  };
}

/**
 * Interface for chat thread/conversation with unread count and last message tracking
 */
export interface ChatThread extends BaseEntity {
  participants: User[];
  lastMessage: Message | null;
  unreadCount: number;
  metadata?: {
    name?: string; // For group chats
    icon?: string; // For group chats
    isGroup?: boolean;
    muted?: boolean;
    pinnedMessageIds?: string[];
  };
}

/**
 * Interface for chat Redux state with loading and error handling
 */
export interface ChatState {
  threads: ChatThread[];
  activeThread: ChatThread | null;
  messages: Record<string, Message[]>;
  loading: boolean;
  error: string | null;
  typingUsers: Record<string, string[]>; // threadId -> typing user ids
  onlineUsers: string[]; // user ids
}

/**
 * Interface for chat notification preferences
 */
export interface ChatNotificationPreferences {
  sound: boolean;
  desktop: boolean;
  mobile: boolean;
  emailDigest: 'none' | 'immediate' | 'daily' | 'weekly';
  muteThreads: string[]; // thread ids
}

/**
 * Interface for chat message draft
 */
export interface MessageDraft {
  threadId: string;
  type: MessageType;
  content: string;
  mediaUrl?: string;
  replyTo?: string;
  savedAt: string;
}

/**
 * Interface for chat search filters
 */
export interface ChatSearchFilters {
  messageTypes?: MessageType[];
  startDate?: string;
  endDate?: string;
  participants?: string[];
  hasMedia?: boolean;
  hasLinks?: boolean;
}

/**
 * Type for chat message reactions
 */
export type MessageReaction = {
  emoji: string;
  count: number;
  userIds: string[];
};

/**
 * Interface for message delivery receipt
 */
export interface MessageDeliveryReceipt {
  messageId: string;
  threadId: string;
  userId: string;
  status: MessageStatus;
  timestamp: string;
}