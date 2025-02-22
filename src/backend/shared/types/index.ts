import { ROLES, VIDEO_STATUS, PAYMENT_STATUS } from '../constants';

/**
 * Type-safe user role definition derived from role constants
 */
export type UserRole = keyof typeof ROLES;

/**
 * Video processing status type definition
 */
export type VideoStatus = keyof typeof VIDEO_STATUS;

/**
 * Payment transaction status type definition
 */
export type PaymentStatus = keyof typeof PAYMENT_STATUS;

/**
 * Comprehensive video annotation type definitions
 */
export enum AnnotationType {
  DRAWING = 'drawing',
  TEXT = 'text',
  VOICE = 'voice',
  SHAPE = 'shape',
  ARROW = 'arrow'
}

/**
 * Detailed video quality variant type definition
 * Represents different quality versions of a video
 */
export type VideoVariant = {
  quality: 'HD' | 'SD' | 'MOBILE';
  url: string;
  resolution: '1080p' | '720p' | '480p';
  codec: 'h264' | 'h265' | 'vp9';
  bitrate: number;
  format: 'mp4' | 'webm';
};

/**
 * Standard pagination parameters type definition
 * Used across all paginated API endpoints
 */
export type PaginationParams = {
  page: number;
  limit: number;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
};

/**
 * Enhanced API error response type with detailed error information
 * Provides consistent error handling across microservices
 */
export type ApiErrorResponse = {
  message: string;
  code: number;
  details: Record<string, any>;
  requestId: string;
  timestamp: string;
  stack?: string;
};

/**
 * Video processing options type definition
 */
export type VideoProcessingOptions = {
  generateThumbnail: boolean;
  targetQualities: Array<VideoVariant['quality']>;
  preserveOriginal: boolean;
  maxDuration?: number;
  watermark?: {
    enabled: boolean;
    position: 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight';
    opacity: number;
  };
};

/**
 * Annotation metadata type definition
 */
export type AnnotationMetadata = {
  type: AnnotationType;
  timestamp: number;
  duration?: number;
  coordinates?: {
    x: number;
    y: number;
    width?: number;
    height?: number;
  };
  style?: {
    color: string;
    thickness: number;
    opacity: number;
  };
};

/**
 * User profile type definition with role-specific fields
 */
export type UserProfile = {
  id: string;
  role: UserRole;
  email: string;
  name: string;
  avatar?: string;
  coachSpecific?: {
    specialties: string[];
    certifications: string[];
    hourlyRate: number;
  };
  athleteSpecific?: {
    sports: string[];
    skillLevel: 'beginner' | 'intermediate' | 'advanced' | 'professional';
    goals: string[];
  };
  preferences: {
    notifications: boolean;
    timezone: string;
    language: string;
  };
  metadata: Record<string, any>;
};

/**
 * Subscription plan type definition
 */
export type SubscriptionPlan = {
  id: string;
  name: string;
  price: number;
  interval: 'monthly' | 'yearly';
  features: string[];
  limits: {
    videoStorage: number;
    monthlyVideos: number;
    maxStudents?: number;
    maxQuality: VideoVariant['quality'];
  };
};