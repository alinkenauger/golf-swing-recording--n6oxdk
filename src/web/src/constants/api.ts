/**
 * API Constants and Configuration
 * @version 1.0.0
 * @description Centralized API configuration for the Video Coaching Platform
 */

/**
 * Base API URL from environment variables with fallback
 * @constant
 */
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

/**
 * API request timeout in milliseconds
 * @constant
 */
export const API_TIMEOUT = 30000;

/**
 * Type definitions for API route parameters
 */
type IdParam = ':id';

/**
 * API route configuration with type safety
 * @constant
 */
export const API_ROUTES = {
  AUTH: {
    LOGIN: '/auth/login',
    REGISTER: '/auth/register',
    LOGOUT: '/auth/logout',
    REFRESH: '/auth/refresh',
    VERIFY: '/auth/verify',
    RESET_PASSWORD: '/auth/reset-password',
    CHANGE_PASSWORD: '/auth/change-password'
  },
  VIDEO: {
    UPLOAD: '/videos/upload',
    GET_BY_ID: `/videos/${IdParam as IdParam}`,
    UPDATE: `/videos/${IdParam as IdParam}`,
    DELETE: `/videos/${IdParam as IdParam}`,
    ADD_ANNOTATION: `/videos/${IdParam as IdParam}/annotations`,
    GET_ANNOTATIONS: `/videos/${IdParam as IdParam}/annotations`,
    ADD_VOICEOVER: `/videos/${IdParam as IdParam}/voiceover`
  },
  COACH: {
    PROFILE: `/coaches/${IdParam as IdParam}`,
    PROGRAMS: `/coaches/${IdParam as IdParam}/programs`,
    REVIEWS: `/coaches/${IdParam as IdParam}/reviews`,
    ANALYTICS: `/coaches/${IdParam as IdParam}/analytics`,
    EARNINGS: `/coaches/${IdParam as IdParam}/earnings`
  },
  PAYMENT: {
    CREATE: '/payments',
    GET_HISTORY: '/payments/history',
    SUBSCRIPTION: '/payments/subscription',
    CANCEL: `/payments/${IdParam as IdParam}/cancel`,
    REFUND: `/payments/${IdParam as IdParam}/refund`
  },
  CHAT: {
    THREADS: '/chat/threads',
    MESSAGES: `/chat/threads/${IdParam as IdParam}/messages`,
    SEND: `/chat/threads/${IdParam as IdParam}/messages`,
    READ_STATUS: `/chat/threads/${IdParam as IdParam}/read`
  }
} as const;

/**
 * HTTP Status codes with TypeScript enums for type safety
 * @enum
 */
export enum HTTP_STATUS {
  OK = 200,
  CREATED = 201,
  ACCEPTED = 202,
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  CONFLICT = 409,
  UNPROCESSABLE_ENTITY = 422,
  TOO_MANY_REQUESTS = 429,
  INTERNAL_SERVER_ERROR = 500
}

/**
 * Interface for API request configuration
 */
interface RequestConfigType {
  timeout: number;
  headers: {
    'Content-Type': string;
    'Accept': string;
    'X-Requested-With': string;
  };
  withCredentials: boolean;
  responseType: 'json';
}

/**
 * Default request configuration for API calls
 * @constant
 */
export const REQUEST_CONFIG: RequestConfigType = {
  timeout: API_TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'X-Requested-With': 'XMLHttpRequest'
  },
  withCredentials: true,
  responseType: 'json'
} as const;

/**
 * Type for API route keys for type-safe access
 */
export type ApiRouteKeys = keyof typeof API_ROUTES;

/**
 * Type for nested route keys for type-safe access
 */
export type ApiNestedRouteKeys<T extends ApiRouteKeys> = keyof typeof API_ROUTES[T];

/**
 * Helper type for getting full API route paths
 */
export type ApiRoutePath<T extends ApiRouteKeys, K extends ApiNestedRouteKeys<T>> = 
  typeof API_ROUTES[T][K];

/**
 * Utility type for API response handling
 */
export type ApiResponse<T> = {
  data: T;
  status: HTTP_STATUS;
  message?: string;
};

/**
 * Utility type for API error handling
 */
export type ApiError = {
  status: HTTP_STATUS;
  message: string;
  errors?: Record<string, string[]>;
};