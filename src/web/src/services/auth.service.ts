/**
 * Enhanced Authentication Service for Video Coaching Platform
 * Provides secure authentication flows, session management, and social login capabilities
 * with comprehensive security features and error handling.
 * @version 1.0.0
 */

import { ApiClient } from '../lib/api';
import { AuthManager } from '../lib/auth';
import { useAuth0 } from '@auth0/auth0-react'; // ^2.0.0
import FingerprintJS from '@fingerprintjs/fingerprintjs'; // ^3.4.0
import { SecurityUtils } from '@security/utils'; // ^1.0.0
import {
  AuthMethod,
  EmailPasswordCredentials,
  SocialAuthCredentials,
  BiometricAuthData,
  MFAData,
  AuthResponse,
  User,
  AuthState,
  AuthSessionMetadata
} from '../types/auth';
import { HttpStatusCode } from '../types/common';

// Authentication endpoints
const AUTH_ENDPOINTS = {
  LOGIN: '/auth/login',
  SIGNUP: '/auth/signup',
  LOGOUT: '/auth/logout',
  RESET_PASSWORD: '/auth/reset-password',
  VERIFY_EMAIL: '/auth/verify-email',
  REFRESH_TOKEN: '/auth/refresh',
  VALIDATE_SESSION: '/auth/validate',
  MFA_VERIFY: '/auth/mfa/verify'
} as const;

// Authentication configuration
const AUTH_CONFIG = {
  TOKEN_REFRESH_THRESHOLD: 300, // 5 minutes in seconds
  MAX_RETRY_ATTEMPTS: 3,
  RATE_LIMIT_WINDOW: 300, // 5 minutes in seconds
  MAX_ATTEMPTS_PER_WINDOW: 5
} as const;

/**
 * Enhanced Authentication Service with comprehensive security features
 */
export class AuthService {
  private readonly apiClient: ApiClient;
  private readonly authManager: AuthManager;
  private readonly securityUtils: SecurityUtils;
  private readonly auth0 = useAuth0();
  private readonly fpPromise = FingerprintJS.load();
  private attemptCount: Map<string, number> = new Map();
  private lastAttemptTime: Map<string, number> = new Map();

  constructor(
    apiClient: ApiClient,
    authManager: AuthManager,
    securityUtils: SecurityUtils
  ) {
    this.apiClient = apiClient;
    this.authManager = authManager;
    this.securityUtils = securityUtils;
    this.setupSecurityMonitoring();
  }

  /**
   * Sets up security monitoring and event listeners
   */
  private setupSecurityMonitoring(): void {
    window.addEventListener('storage', () => this.validateSession());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.validateSession();
      }
    });
  }

  /**
   * Checks rate limiting for authentication attempts
   */
  private checkRateLimit(identifier: string): boolean {
    const now = Date.now();
    const attempts = this.attemptCount.get(identifier) || 0;
    const lastAttempt = this.lastAttemptTime.get(identifier) || 0;

    if (now - lastAttempt > AUTH_CONFIG.RATE_LIMIT_WINDOW * 1000) {
      this.attemptCount.set(identifier, 1);
      this.lastAttemptTime.set(identifier, now);
      return true;
    }

    if (attempts >= AUTH_CONFIG.MAX_ATTEMPTS_PER_WINDOW) {
      return false;
    }

    this.attemptCount.set(identifier, attempts + 1);
    this.lastAttemptTime.set(identifier, now);
    return true;
  }

  /**
   * Generates device fingerprint for security binding
   */
  private async getDeviceFingerprint(): Promise<string> {
    const fp = await this.fpPromise;
    const result = await fp.get();
    return result.visitorId;
  }

  /**
   * Enhanced login with comprehensive security features
   */
  public async login(
    credentials: EmailPasswordCredentials | SocialAuthCredentials | BiometricAuthData,
    deviceInfo: AuthSessionMetadata['deviceInfo']
  ): Promise<AuthResponse> {
    try {
      // Rate limiting check
      const identifier = 'email' in credentials ? credentials.email : deviceInfo.browser || deviceInfo.type;
      if (!this.checkRateLimit(identifier)) {
        throw new Error('Too many login attempts. Please try again later.');
      }

      // Generate device fingerprint
      const deviceFingerprint = await this.getDeviceFingerprint();

      // CSRF token validation
      const csrfToken = this.securityUtils.generateCSRFToken();

      const loginData = {
        ...credentials,
        deviceInfo,
        deviceFingerprint,
        csrfToken
      };

      const response = await this.apiClient.post<typeof loginData, AuthResponse>(
        AUTH_ENDPOINTS.LOGIN,
        loginData
      );

      if (response.success) {
        // Handle MFA if required
        if (response.data.user.mfaEnabled) {
          return this.handleMFAChallenge(response.data);
        }

        // Setup session with device binding
        await this.authManager.setupSession(response.data, deviceFingerprint);
        return response;
      }

      throw new Error(response.error?.message || 'Login failed');
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  }

  /**
   * Handles Multi-Factor Authentication challenge
   */
  public async handleMFAChallenge(initialAuth: AuthResponse): Promise<AuthResponse> {
    try {
      const mfaData: MFAData = await this.promptMFACode();
      const response = await this.apiClient.post<MFAData, AuthResponse>(
        AUTH_ENDPOINTS.MFA_VERIFY,
        mfaData
      );

      if (response.success) {
        await this.authManager.setupSession(response.data, await this.getDeviceFingerprint());
        return response;
      }

      throw new Error(response.error?.message || 'MFA verification failed');
    } catch (error) {
      console.error('MFA error:', error);
      throw error;
    }
  }

  /**
   * Validates current session with security checks
   */
  public async validateSession(): Promise<boolean> {
    try {
      const deviceFingerprint = await this.getDeviceFingerprint();
      const currentState = this.authManager.getState();

      if (!currentState.isAuthenticated || !currentState.token) {
        return false;
      }

      const response = await this.apiClient.post<{ deviceFingerprint: string }, { valid: boolean }>(
        AUTH_ENDPOINTS.VALIDATE_SESSION,
        { deviceFingerprint }
      );

      return response.success && response.data.valid;
    } catch (error) {
      console.error('Session validation error:', error);
      return false;
    }
  }

  /**
   * Securely logs out user and cleans up session
   */
  public async logout(): Promise<void> {
    try {
      await this.apiClient.post(AUTH_ENDPOINTS.LOGOUT, {});
      await this.authManager.clearSession();

      if (this.auth0.isAuthenticated) {
        await this.auth0.logout();
      }
    } catch (error) {
      console.error('Logout error:', error);
      throw error;
    }
  }

  /**
   * Prompts for MFA code - implementation depends on UI framework
   */
  private async promptMFACode(): Promise<MFAData> {
    // Implementation would be provided by UI framework
    throw new Error('MFA prompt not implemented');
  }
}

// Export singleton instance
export const authService = new AuthService(
  new ApiClient(process.env.NEXT_PUBLIC_API_URL || ''),
  new AuthManager(new ApiClient(process.env.NEXT_PUBLIC_API_URL || '')),
  new SecurityUtils()
);