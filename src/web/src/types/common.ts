/**
 * Core TypeScript type definitions and interfaces shared across the web application.
 * Provides comprehensive type safety and standardized data structures.
 * @version 1.0.0
 */

/**
 * HTTP status codes used across the application
 */
export enum HttpStatusCode {
  OK = 200,
  CREATED = 201,
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  UNPROCESSABLE_ENTITY = 422,
  TOO_MANY_REQUESTS = 429,
  INTERNAL_SERVER_ERROR = 500
}

/**
 * User roles for role-based access control
 */
export enum UserRole {
  ADMIN = 'ADMIN',
  COACH = 'COACH',
  COACH_PENDING = 'COACH_PENDING',
  ATHLETE = 'ATHLETE'
}

/**
 * Subscription tiers for feature access control
 */
export enum SubscriptionTier {
  FREE = 'FREE',
  BASIC = 'BASIC',
  PREMIUM = 'PREMIUM'
}

/**
 * Video processing status states
 */
export enum VideoProcessingStatus {
  UPLOADING = 'UPLOADING',
  PROCESSING = 'PROCESSING',
  READY = 'READY',
  FAILED = 'FAILED'
}

/**
 * Enhanced interface for API error details with stack trace support
 */
export interface ApiError {
  code: string;
  message: string;
  details: Record<string, unknown>;
  stack?: string;
}

/**
 * Generic interface for API responses with enhanced metadata support
 */
export interface ApiResponse<T extends object = {}> {
  success: boolean;
  data: T;
  error: ApiError | null;
  metadata: Record<string, unknown>;
  statusCode: HttpStatusCode;
}

/**
 * Enhanced generic interface for paginated responses with sorting support
 */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasMore: boolean;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Base interface for all database entities with versioning support
 */
export interface BaseEntity {
  id: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

/**
 * Enhanced type for component loading states with progress tracking
 */
export type LoadingState = {
  state: 'idle' | 'loading' | 'success' | 'error';
  error: ApiError | null;
  progress?: number;
}