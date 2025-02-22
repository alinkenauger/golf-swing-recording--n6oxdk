// @nestjs/common version ^10.0.0
import { HttpStatus } from '@nestjs/common';

/**
 * User role constants for access control across the platform
 */
export const ROLES = {
  ADMIN: 'admin',
  COACH: 'coach',
  ATHLETE: 'athlete',
} as const;

/**
 * Video processing status constants tracking the complete lifecycle
 * of video content in the system
 */
export const VIDEO_STATUS = {
  QUEUED: 'queued',         // Initial upload, awaiting processing
  PROCESSING: 'processing', // Active video analysis/processing
  TRANSCODING: 'transcoding', // Format conversion/optimization
  READY: 'ready',          // Available for viewing/annotation
  ERROR: 'error',          // Processing failed
  DELETED: 'deleted',      // Soft-deleted from system
} as const;

/**
 * Video annotation type constants defining all supported
 * forms of video markup and analysis
 */
export const ANNOTATION_TYPES = {
  DRAWING: 'drawing',     // Freehand drawing overlays
  TEXT: 'text',          // Text annotations
  VOICE: 'voice',        // Voice-over recordings
  MARKER: 'marker',      // Point markers/pins
  TIMESTAMP: 'timestamp', // Time-based markers
} as const;

/**
 * Payment transaction status constants tracking the complete
 * lifecycle of payment processing
 */
export const PAYMENT_STATUS = {
  PROCESSING: 'processing', // Initial transaction processing
  PENDING: 'pending',      // Awaiting confirmation
  COMPLETED: 'completed',  // Successfully processed
  FAILED: 'failed',       // Transaction failed
  DISPUTED: 'disputed',    // Payment under dispute
  CANCELLED: 'cancelled',  // Transaction cancelled
  REFUNDED: 'refunded',   // Payment refunded
} as const;

/**
 * API route path constants for consistent endpoint mapping
 * across microservices
 */
export const API_ROUTES = {
  AUTH: '/auth',
  USERS: '/users',
  VIDEOS: '/videos',
  COACHES: '/coaches',
  PAYMENTS: '/payments',
} as const;

/**
 * Default pagination parameters for list endpoints
 */
export const DEFAULT_PAGINATION = {
  PAGE: 1,
  LIMIT: 20,
  SORT_BY: 'createdAt',
  SORT_ORDER: 'desc',
} as const;

/**
 * Type definitions for constants to enable TypeScript support
 */
export type UserRole = typeof ROLES[keyof typeof ROLES];
export type VideoStatus = typeof VIDEO_STATUS[keyof typeof VIDEO_STATUS];
export type AnnotationType = typeof ANNOTATION_TYPES[keyof typeof ANNOTATION_TYPES];
export type PaymentStatus = typeof PAYMENT_STATUS[keyof typeof PAYMENT_STATUS];
export type ApiRoute = typeof API_ROUTES[keyof typeof API_ROUTES];

/**
 * Standard API response status codes
 * Re-exported from @nestjs/common for convenience
 */
export const API_STATUS_CODES = {
  OK: HttpStatus.OK,                    // 200
  CREATED: HttpStatus.CREATED,          // 201
  BAD_REQUEST: HttpStatus.BAD_REQUEST,  // 400
  UNAUTHORIZED: HttpStatus.UNAUTHORIZED, // 401
  FORBIDDEN: HttpStatus.FORBIDDEN,      // 403
  NOT_FOUND: HttpStatus.NOT_FOUND,      // 404
  CONFLICT: HttpStatus.CONFLICT,        // 409
  SERVER_ERROR: HttpStatus.INTERNAL_SERVER_ERROR, // 500
} as const;

/**
 * System-wide configuration constants
 */
export const SYSTEM_CONFIG = {
  MAX_FILE_SIZE: 1024 * 1024 * 100, // 100MB
  SUPPORTED_VIDEO_FORMATS: ['mp4', 'mov', 'avi'],
  MAX_ANNOTATION_LENGTH: 1000,
  CACHE_TTL: 3600, // 1 hour in seconds
  API_VERSION: 'v1',
} as const;