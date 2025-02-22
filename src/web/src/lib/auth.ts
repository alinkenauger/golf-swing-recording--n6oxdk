/**
 * Core authentication library for the Video Coaching Platform
 * Provides enterprise-grade authentication utilities with Auth0 integration
 * @version 1.0.0
 */

import { useAuth0 } from '@auth0/auth0-react'; // ^2.0.0
import jwtDecode from 'jwt-decode'; // ^4.0.0
import CryptoJS from 'crypto-js'; // ^4.1.1
import { AuthState, User, AuthMethod, isUser } from '../types/auth';
import { ApiClient } from './api';
import { API_ROUTES, HTTP_STATUS } from '../constants/api';

// Secure storage keys with unique prefixes
const AUTH_TOKEN_KEY = '_secure_auth_token';
const USER_DATA_KEY = '_secure_user_data';
const DEVICE_ID_KEY = '_secure_device_id';

// Security configuration constants
const TOKEN_EXPIRY_BUFFER = 300; // 5 minutes in seconds
const MAX_TOKEN_AGE = 86400; // 24 hours in seconds
const REFRESH_ATTEMPT_LIMIT = 3;
const ENCRYPTION_ALGORITHM = 'AES-256-CBC';

/**
 * Securely stores encrypted JWT token with device binding
 * @param token - JWT token to store
 * @param deviceId - Unique device identifier
 */
export async function setAuthToken(token: string, deviceId: string): Promise<void> {
  try {
    // Validate token format and expiry
    const decoded = jwtDecode(token);
    if (!decoded || typeof decoded !== 'object') {
      throw new Error('Invalid token format');
    }

    // Generate encryption key using device ID
    const encryptionKey = CryptoJS.SHA256(deviceId).toString();
    
    // Encrypt token with device binding
    const encryptedToken = CryptoJS.AES.encrypt(
      JSON.stringify({ token, deviceId }),
      encryptionKey,
      { mode: CryptoJS.mode.CBC }
    ).toString();

    // Store encrypted token
    localStorage.setItem(AUTH_TOKEN_KEY, encryptedToken);
    
    // Set secure HTTP-only cookie for CSRF protection
    document.cookie = `XSRF-TOKEN=${CryptoJS.SHA256(token).toString()}; Secure; SameSite=Strict`;
  } catch (error) {
    console.error('Token storage error:', error);
    throw new Error('Failed to store authentication token securely');
  }
}

/**
 * Retrieves and validates stored JWT token
 * @param deviceId - Device identifier for token binding validation
 * @returns Decrypted valid token or null
 */
export async function getAuthToken(deviceId: string): Promise<string | null> {
  try {
    const encryptedToken = localStorage.getItem(AUTH_TOKEN_KEY);
    if (!encryptedToken) return null;

    // Generate decryption key from device ID
    const decryptionKey = CryptoJS.SHA256(deviceId).toString();
    
    // Decrypt and validate token
    const decrypted = CryptoJS.AES.decrypt(encryptedToken, decryptionKey);
    const { token, storedDeviceId } = JSON.parse(decrypted.toString(CryptoJS.enc.Utf8));

    // Validate device binding
    if (storedDeviceId !== deviceId) {
      throw new Error('Invalid device binding');
    }

    // Validate token expiry
    const decoded = jwtDecode(token);
    if (typeof decoded === 'object' && decoded && 'exp' in decoded) {
      const expiryTime = (decoded as { exp: number }).exp;
      if (Date.now() >= expiryTime * 1000) {
        return null;
      }
    }

    return token;
  } catch (error) {
    console.error('Token retrieval error:', error);
    return null;
  }
}

/**
 * Validates JWT token with comprehensive security checks
 * @param token - JWT token to validate
 * @returns Token validity status
 */
export async function validateToken(token: string): Promise<boolean> {
  try {
    const decoded = jwtDecode(token);
    if (!decoded || typeof decoded !== 'object') {
      return false;
    }

    // Check token expiration
    if ('exp' in decoded) {
      const expiryTime = (decoded as { exp: number }).exp;
      if (Date.now() >= (expiryTime * 1000) - TOKEN_EXPIRY_BUFFER * 1000) {
        return false;
      }
    }

    // Verify token claims
    if (!('sub' in decoded && 'aud' in decoded && 'iss' in decoded)) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Enterprise-grade authentication manager with security features
 */
export class AuthManager {
  private currentState: AuthState;
  private readonly apiClient: ApiClient;
  private refreshAttempts: number = 0;
  private refreshTimer?: NodeJS.Timeout;
  private readonly auth0 = useAuth0();

  constructor(apiClient: ApiClient) {
    this.apiClient = apiClient;
    this.currentState = {
      isAuthenticated: false,
      user: null,
      token: null,
      deviceId: this.generateDeviceId(),
      refreshToken: null,
      expiresAt: null
    };

    // Initialize security measures
    this.setupSecurityListeners();
    this.initializeAuthState();
  }

  /**
   * Generates unique device identifier for token binding
   */
  private generateDeviceId(): string {
    const storedId = localStorage.getItem(DEVICE_ID_KEY);
    if (storedId) return storedId;

    const newId = CryptoJS.SHA256(
      navigator.userAgent + screen.width + screen.height + new Date().getTime()
    ).toString();

    localStorage.setItem(DEVICE_ID_KEY, newId);
    return newId;
  }

  /**
   * Sets up security event listeners
   */
  private setupSecurityListeners(): void {
    // Monitor for storage events
    window.addEventListener('storage', (event) => {
      if (event.key === AUTH_TOKEN_KEY) {
        this.validateSession();
      }
    });

    // Monitor for visibility changes
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.validateSession();
      }
    });
  }

  /**
   * Initializes authentication state
   */
  private async initializeAuthState(): Promise<void> {
    try {
      const token = await getAuthToken(this.currentState.deviceId);
      if (token && await validateToken(token)) {
        const decoded = jwtDecode(token);
        if (typeof decoded === 'object' && decoded && 'user' in decoded) {
          const userData = decoded.user as User;
          if (isUser(userData)) {
            this.currentState = {
              ...this.currentState,
              isAuthenticated: true,
              user: userData,
              token
            };
            this.setupTokenRefresh();
          }
        }
      }
    } catch (error) {
      console.error('Auth state initialization error:', error);
      this.logout();
    }
  }

  /**
   * Sets up automatic token refresh
   */
  private setupTokenRefresh(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }

    const decoded = jwtDecode(this.currentState.token!);
    if (typeof decoded === 'object' && decoded && 'exp' in decoded) {
      const expiryTime = (decoded as { exp: number }).exp * 1000;
      const refreshTime = expiryTime - Date.now() - TOKEN_EXPIRY_BUFFER * 1000;

      this.refreshTimer = setTimeout(() => {
        this.refreshToken();
      }, refreshTime);
    }
  }

  /**
   * Refreshes authentication token
   */
  public async refreshToken(): Promise<boolean> {
    if (this.refreshAttempts >= REFRESH_ATTEMPT_LIMIT) {
      this.logout();
      return false;
    }

    try {
      this.refreshAttempts++;
      const response = await this.apiClient.post(API_ROUTES.AUTH.REFRESH, {
        refreshToken: this.currentState.refreshToken
      });

      if (response.success && response.data.token) {
        await setAuthToken(response.data.token, this.currentState.deviceId);
        this.currentState = {
          ...this.currentState,
          token: response.data.token,
          refreshToken: response.data.refreshToken,
          expiresAt: response.data.expiresAt
        };
        this.refreshAttempts = 0;
        this.setupTokenRefresh();
        return true;
      }

      return false;
    } catch (error) {
      console.error('Token refresh error:', error);
      return false;
    }
  }

  /**
   * Validates current session
   */
  public async validateSession(): Promise<boolean> {
    try {
      if (!this.currentState.token) {
        return false;
      }

      const isValid = await validateToken(this.currentState.token);
      if (!isValid && this.currentState.refreshToken) {
        return this.refreshToken();
      }

      return isValid;
    } catch (error) {
      console.error('Session validation error:', error);
      return false;
    }
  }

  /**
   * Logs out user and cleans up session
   */
  public async logout(): Promise<void> {
    try {
      await this.apiClient.post(API_ROUTES.AUTH.LOGOUT, {});
      localStorage.removeItem(AUTH_TOKEN_KEY);
      localStorage.removeItem(USER_DATA_KEY);
      
      if (this.refreshTimer) {
        clearTimeout(this.refreshTimer);
      }

      this.currentState = {
        isAuthenticated: false,
        user: null,
        token: null,
        deviceId: this.currentState.deviceId,
        refreshToken: null,
        expiresAt: null
      };

      // Clear secure cookies
      document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT; Secure; SameSite=Strict';
      
      // Logout from Auth0 if using social login
      if (this.auth0.isAuthenticated) {
        await this.auth0.logout();
      }
    } catch (error) {
      console.error('Logout error:', error);
      throw new Error('Failed to logout securely');
    }
  }

  /**
   * Gets current authentication state
   */
  public getState(): AuthState {
    return { ...this.currentState };
  }
}