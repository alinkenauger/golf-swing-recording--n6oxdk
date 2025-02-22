// zod version ^3.22.4
import { z } from 'zod';
import { ROLES, HTTP_STATUS } from '../constants';

/**
 * Branded type for type-safe user IDs
 * Prevents accidental mixing of different ID types
 */
export type UserId = string & { readonly brand: unique symbol };

/**
 * Branded type for type-safe video IDs
 * Prevents accidental mixing of different ID types
 */
export type VideoId = string & { readonly brand: unique symbol };

/**
 * User profile information interface
 */
export interface IUserProfile {
  firstName: string;
  lastName: string;
  avatarUrl?: string;
  bio?: string;
  location?: string;
  timezone: string;
  preferences: {
    notifications: boolean;
    emailUpdates: boolean;
    language: string;
  };
}

/**
 * Video metadata interface containing technical details
 */
export interface IVideoMetadata {
  duration: number;
  fileSize: number;
  format: string;
  resolution: {
    width: number;
    height: number;
  };
  fps: number;
  bitrate: number;
  codec: string;
}

/**
 * Video variant interface for different quality versions
 */
export interface IVideoVariant {
  readonly quality: '1080p' | '720p' | '480p' | '360p';
  readonly url: string;
  readonly fileSize: number;
  readonly bitrate: number;
}

/**
 * Video status type definition
 */
export type VideoStatus = 'queued' | 'processing' | 'ready' | 'error' | 'deleted';

/**
 * API error interface for standardized error responses
 */
export interface IApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  stack?: string;
}

/**
 * Core user interface with enhanced type safety
 */
export interface IUser {
  readonly id: UserId;
  email: string;
  role: keyof typeof ROLES;
  profile: IUserProfile;
  isActive: boolean;
  lastLogin: Date;
  metadata: Record<string, unknown>;
}

/**
 * Video content interface with immutable arrays
 */
export interface IVideo {
  readonly id: VideoId;
  readonly userId: UserId;
  title: string;
  description: string;
  status: VideoStatus;
  metadata: IVideoMetadata;
  readonly variants: readonly IVideoVariant[];
  readonly annotationIds: readonly string[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Enhanced API response interface with detailed error handling
 */
export interface IApiResponse<T> {
  success: boolean;
  data: T | null;
  error: IApiError | null;
  statusCode: HTTP_STATUS;
  metadata: Record<string, unknown>;
}

/**
 * Zod schema for runtime validation of user data
 */
export const userSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  role: z.enum([ROLES.ADMIN, ROLES.COACH, ROLES.ATHLETE]),
  profile: z.object({
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    avatarUrl: z.string().url().optional(),
    bio: z.string().max(500).optional(),
    location: z.string().optional(),
    timezone: z.string(),
    preferences: z.object({
      notifications: z.boolean(),
      emailUpdates: z.boolean(),
      language: z.string()
    })
  }),
  isActive: z.boolean(),
  lastLogin: z.date(),
  metadata: z.record(z.unknown())
});

/**
 * Zod schema for runtime validation of video data
 */
export const videoSchema = z.object({
  id: z.string(),
  userId: z.string(),
  title: z.string().min(1),
  description: z.string(),
  status: z.enum(['queued', 'processing', 'ready', 'error', 'deleted']),
  metadata: z.object({
    duration: z.number().positive(),
    fileSize: z.number().positive(),
    format: z.string(),
    resolution: z.object({
      width: z.number().positive(),
      height: z.number().positive()
    }),
    fps: z.number().positive(),
    bitrate: z.number().positive(),
    codec: z.string()
  }),
  variants: z.array(z.object({
    quality: z.enum(['1080p', '720p', '480p', '360p']),
    url: z.string().url(),
    fileSize: z.number().positive(),
    bitrate: z.number().positive()
  })).readonly(),
  annotationIds: z.array(z.string()).readonly(),
  createdAt: z.date(),
  updatedAt: z.date()
});

/**
 * Type guard to check if a value is a valid UserId
 */
export const isUserId = (value: unknown): value is UserId => {
  return typeof value === 'string' && value.length > 0;
};

/**
 * Type guard to check if a value is a valid VideoId
 */
export const isVideoId = (value: unknown): value is VideoId => {
  return typeof value === 'string' && value.length > 0;
};