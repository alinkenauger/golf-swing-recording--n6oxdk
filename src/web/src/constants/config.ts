// @package process ^0.11.10
import process from 'process';

/**
 * Global configuration constants for the Video Coaching Platform web application.
 * Contains environment-specific settings, API endpoints, feature flags, and other
 * global configuration constants.
 */

/**
 * Current environment type
 */
export const ENV = process.env.NODE_ENV || 'development';

/**
 * API configuration including base URL, endpoints, timeouts and retry settings
 */
export const API = {
  BASE_URL: process.env.NEXT_PUBLIC_API_URL,
  TIMEOUT: 30000, // 30 seconds
  RETRY_ATTEMPTS: 3,
  VERSION: 'v1',
  ENDPOINTS: {
    AUTH: '/auth',
    USERS: '/users',
    VIDEOS: '/videos',
    COACHES: '/coaches',
    PAYMENTS: '/payments',
    ANALYTICS: '/analytics'
  }
} as const;

/**
 * WebSocket configuration for real-time communication features
 */
export const SOCKET = {
  URL: process.env.NEXT_PUBLIC_SOCKET_URL,
  RECONNECT_ATTEMPTS: 5,
  RECONNECT_INTERVAL: 2000, // 2 seconds
  PATH: '/socket.io',
  EVENTS: {
    CONNECT: 'connect',
    DISCONNECT: 'disconnect',
    MESSAGE: 'message',
    VIDEO_PROGRESS: 'video_progress',
    ANNOTATION_UPDATE: 'annotation_update'
  }
} as const;

/**
 * Authentication configuration including token management and providers
 */
export const AUTH = {
  TOKEN_KEY: 'videocoach_token',
  REFRESH_TOKEN_KEY: 'videocoach_refresh_token',
  TOKEN_EXPIRY: 3600, // 1 hour in seconds
  STORAGE_TYPE: 'localStorage',
  PROVIDERS: {
    EMAIL: 'email',
    GOOGLE: 'google',
    APPLE: 'apple',
    FACEBOOK: 'facebook'
  }
} as const;

/**
 * Stripe payment integration configuration
 */
export const STRIPE = {
  PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  ELEMENTS_APPEARANCE: {
    theme: 'stripe',
    variables: {
      colorPrimary: '#2D5BFF',
      colorBackground: '#ffffff',
      colorText: '#1A1F36',
      colorDanger: '#FF4D4D',
      fontFamily: 'SF Pro Display, -apple-system, sans-serif',
      borderRadius: '8px',
      spacingUnit: '4px'
    }
  },
  PAYMENT_METHODS: ['card', 'apple_pay', 'google_pay'],
  CURRENCY: 'usd'
} as const;

/**
 * Video upload and processing configuration
 */
export const VIDEO = {
  MAX_DURATION: 600, // 10 minutes in seconds
  MAX_FILE_SIZE: 524288000, // 500MB in bytes
  SUPPORTED_FORMATS: ['mp4', 'mov', 'avi', 'webm'],
  CHUNK_SIZE: 2097152, // 2MB chunk size for uploads
  STORAGE_TYPE: 's3',
  QUALITY_LEVELS: {
    HD: '1080p',
    SD: '720p',
    MOBILE: '480p'
  },
  PROCESSING_STAGES: {
    UPLOADING: 'uploading',
    PROCESSING: 'processing',
    READY: 'ready',
    FAILED: 'failed'
  }
} as const;

/**
 * Feature flags for platform capabilities
 */
export const FEATURES = {
  VOICE_OVER: true,
  ANNOTATIONS: true,
  SLOW_MOTION: true,
  FRAME_EXTRACTION: true,
  REAL_TIME_CHAT: true,
  VIDEO_RESPONSES: true,
  ANALYTICS: true
} as const;

/**
 * Combined configuration object for global application use
 */
export const CONFIG = {
  ENV,
  API,
  SOCKET,
  AUTH,
  STRIPE,
  VIDEO,
  FEATURES
} as const;

export default CONFIG;