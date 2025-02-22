/**
 * TypeScript type definitions for authentication and authorization in the web frontend.
 * Provides comprehensive interfaces for auth state, credentials, user data, and security features.
 * @version 1.0.0
 */

import { UserRole, ApiResponse } from './common';

/**
 * Supported authentication methods for the platform
 */
export enum AuthMethod {
  EMAIL_PASSWORD = 'EMAIL_PASSWORD',
  GOOGLE = 'GOOGLE',
  FACEBOOK = 'FACEBOOK',
  APPLE = 'APPLE',
  BIOMETRIC = 'BIOMETRIC'
}

/**
 * User subscription status levels
 */
export enum SubscriptionStatus {
  NONE = 'NONE',
  TRIAL = 'TRIAL',
  BASIC = 'BASIC',
  PREMIUM = 'PREMIUM'
}

/**
 * Interface representing authenticated user data with extended profile information
 */
export interface User {
  id: string;
  email: string;
  role: UserRole;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  bio: string | null;
  isActive: boolean;
  lastLogin: string;
  subscriptionStatus: SubscriptionStatus;
  mfaEnabled: boolean;
  preferredAuthMethod: AuthMethod;
}

/**
 * Interface for global authentication state with token management
 */
export interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
}

/**
 * Interface for login credentials using email/password
 */
export interface EmailPasswordCredentials {
  email: string;
  password: string;
  rememberMe?: boolean;
}

/**
 * Interface for social authentication credentials
 */
export interface SocialAuthCredentials {
  provider: AuthMethod;
  accessToken: string;
  idToken?: string;
}

/**
 * Interface for biometric authentication data
 */
export interface BiometricAuthData {
  biometricToken: string;
  deviceId: string;
  authenticatorType: 'fingerprint' | 'faceId' | 'touchId';
}

/**
 * Interface for multi-factor authentication data
 */
export interface MFAData {
  type: 'totp' | 'sms' | 'email';
  code: string;
  sessionToken: string;
}

/**
 * Interface for password reset request
 */
export interface PasswordResetRequest {
  email: string;
  token?: string;
  newPassword?: string;
}

/**
 * Type for authentication API responses
 */
export type AuthResponse = ApiResponse<{
  user: User;
  token: string;
  refreshToken: string;
  expiresAt: number;
}>;

/**
 * Interface for token refresh request
 */
export interface TokenRefreshRequest {
  refreshToken: string;
}

/**
 * Interface for user registration data
 */
export interface RegistrationData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  acceptedTerms: boolean;
  marketingConsent?: boolean;
}

/**
 * Interface for auth session metadata
 */
export interface AuthSessionMetadata {
  deviceInfo: {
    type: string;
    os: string;
    browser?: string;
  };
  ipAddress: string;
  lastActivity: string;
  isCurrentSession: boolean;
}

/**
 * Type guard to check if a value is a valid User object
 */
export function isUser(value: unknown): value is User {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'email' in value &&
    'role' in value
  );
}

/**
 * Type guard to check if a value is a valid AuthMethod
 */
export function isAuthMethod(value: string): value is AuthMethod {
  return Object.values(AuthMethod).includes(value as AuthMethod);
}