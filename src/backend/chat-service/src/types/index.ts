// mongoose version ^7.5.0
import { Types } from 'mongoose';
import { UserRole, PaginationParams } from '@shared/types';

/**
 * Enum defining supported message content types including rich media
 */
export enum MessageType {
  TEXT = 'text',
  VIDEO = 'video',
  IMAGE = 'image',
  VOICE = 'voice',
  FILE = 'file'
}

/**
 * Enum defining comprehensive message delivery status tracking
 */
export enum MessageStatus {
  SENDING = 'sending',
  SENT = 'sent',
  DELIVERED = 'delivered',
  READ = 'read',
  FAILED = 'failed'
}

/**
 * Enum defining chat thread types
 */
export enum ChatThreadType {
  DIRECT = 'direct',
  GROUP = 'group'
}

/**
 * Interface defining comprehensive chat message structure with rich media support
 */
export interface Message {
  id: Types.ObjectId;
  threadId: Types.ObjectId;
  senderId: Types.ObjectId;
  type: MessageType;
  content: string;
  status: MessageStatus;
  readBy: Types.ObjectId[];
  deliveredTo: Types.ObjectId[];
  metadata: Record<string, any>;
  mediaUrl: string | null;
  mediaDuration: number | null;
  mediaSize: number | null;
  replyTo: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Interface defining chat thread structure with enhanced metadata
 */
export interface ChatThread {
  id: Types.ObjectId;
  type: ChatThreadType;
  participants: Types.ObjectId[];
  lastMessage: Message;
  name: string | null;
  avatar: string | null;
  metadata: Record<string, any>;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Interface for comprehensive chat query parameters
 */
export interface ChatQueryParams {
  pagination: PaginationParams;
  threadId: Types.ObjectId;
  userId: Types.ObjectId;
  messageType: MessageType;
  startDate: Date;
  endDate: Date;
  searchText: string;
}

/**
 * Interface for message delivery receipt tracking
 */
export interface MessageDeliveryReceipt {
  messageId: Types.ObjectId;
  userId: Types.ObjectId;
  status: MessageStatus;
  timestamp: Date;
}

/**
 * Interface for thread participant metadata
 */
export interface ThreadParticipant {
  userId: Types.ObjectId;
  role: UserRole;
  joinedAt: Date;
  lastSeen: Date;
  isActive: boolean;
  mutedUntil: Date | null;
}

/**
 * Interface for rich media message metadata
 */
export interface MediaMessageMetadata {
  mimeType: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
  codec?: string;
  bitrate?: number;
  transcoded: boolean;
}

/**
 * Interface for message reactions
 */
export interface MessageReaction {
  userId: Types.ObjectId;
  emoji: string;
  createdAt: Date;
}

/**
 * Type for thread notification preferences
 */
export type ThreadNotificationPreferences = {
  muted: boolean;
  muteExpiration: Date | null;
  showPreview: boolean;
  sound: boolean;
  priority: 'low' | 'normal' | 'high';
};

/**
 * Type for message retention policy
 */
export type MessageRetentionPolicy = {
  enabled: boolean;
  duration: number; // in days
  mediaOnly: boolean;
  excludeTypes?: MessageType[];
};