/**
 * Enhanced React hook for managing secure authentication state and operations
 * Provides comprehensive authentication flows with MFA and device binding support
 * @version 1.0.0
 */

import { useCallback, useEffect } from 'react'; // ^18.0.0
import { useDispatch, useSelector } from 'react-redux'; // ^8.0.0
import { useAuth0 } from '@auth0/auth0-react'; // ^2.0.0
import {
  login,
  logout,
  refreshToken,
  validateSession,
  selectAuth,
  selectDeviceStatus,
  selectMFAStatus
} from '../store/auth.slice';
import AuthService from '../services/auth.service';
import {
  LoginCredentials,
  MFACredentials,
  DeviceInfo,
  User,
  AuthState,
  AuthMethod,
  SubscriptionStatus
} from '../types/auth';

// Authentication configuration constants
const AUTH_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes
const SESSION_REFRESH_THRESHOLD = 5 * 60; // 5 minutes before expiry
const MFA_TIMEOUT = 5 * 60 * 1000; // 5 minutes

/**
 * Enhanced authentication hook with comprehensive security features
 * @returns Authentication state and methods
 */
export const useAuth = () => {
  const dispatch = useDispatch();
  const auth0 = useAuth0();
  
  // Select auth state from Redux store
  const {
    isAuthenticated,
    user,
    token,
    mfaRequired,
    authMethod,
    subscriptionStatus,
    sessionExpiry
  } = useSelector(selectAuth);
  
  const deviceStatus = useSelector(selectDeviceStatus);
  const mfaStatus = useSelector(selectMFAStatus);

  /**
   * Enhanced login handler with MFA and device binding support
   */
  const handleLogin = useCallback(async (
    credentials: LoginCredentials
  ): Promise<void> => {
    try {
      // Get device information for security binding
      const deviceInfo: DeviceInfo = {
        type: 'web',
        os: navigator.platform,
        browser: navigator.userAgent
      };

      // Dispatch login action with device info
      const result = await dispatch(login({ credentials, deviceInfo })).unwrap();

      // Handle MFA if required
      if (result.mfaRequired) {
        // Store temporary session token for MFA flow
        sessionStorage.setItem('mfa_session', result.sessionToken);
        return;
      }

      // Handle device binding if needed
      if (result.deviceBindingRequired) {
        await AuthService.bindDevice({
          deviceId: result.deviceId,
          userId: result.user.id
        });
      }
    } catch (error) {
      console.error('Login error:', error);
      throw new Error('Authentication failed. Please try again.');
    }
  }, [dispatch]);

  /**
   * Handles MFA verification process
   */
  const handleMFAVerification = useCallback(async (
    mfaCredentials: MFACredentials
  ): Promise<void> => {
    try {
      const sessionToken = sessionStorage.getItem('mfa_session');
      if (!sessionToken) {
        throw new Error('MFA session expired');
      }

      await AuthService.verifyMFA({
        ...mfaCredentials,
        sessionToken
      });

      // Clear MFA session
      sessionStorage.removeItem('mfa_session');
    } catch (error) {
      console.error('MFA verification error:', error);
      throw new Error('MFA verification failed. Please try again.');
    }
  }, []);

  /**
   * Enhanced logout handler with cleanup
   */
  const handleLogout = useCallback(async (): Promise<void> => {
    try {
      await dispatch(logout()).unwrap();
      
      // Clear any sensitive session data
      sessionStorage.removeItem('mfa_session');
      
      // Logout from Auth0 if using social login
      if (auth0.isAuthenticated) {
        await auth0.logout({
          returnTo: window.location.origin
        });
      }
    } catch (error) {
      console.error('Logout error:', error);
      throw new Error('Logout failed. Please try again.');
    }
  }, [dispatch, auth0]);

  /**
   * Validates and refreshes session when needed
   */
  const validateAuthSession = useCallback(async (): Promise<void> => {
    try {
      if (!isAuthenticated || !sessionExpiry) return;

      const timeUntilExpiry = sessionExpiry - Date.now();
      if (timeUntilExpiry <= SESSION_REFRESH_THRESHOLD * 1000) {
        await dispatch(refreshToken()).unwrap();
      } else {
        await dispatch(validateSession()).unwrap();
      }
    } catch (error) {
      console.error('Session validation error:', error);
      handleLogout();
    }
  }, [isAuthenticated, sessionExpiry, dispatch, handleLogout]);

  // Setup periodic session validation
  useEffect(() => {
    if (!isAuthenticated) return;

    const intervalId = setInterval(validateAuthSession, AUTH_CHECK_INTERVAL);
    return () => clearInterval(intervalId);
  }, [isAuthenticated, validateAuthSession]);

  // Validate session on visibility change
  useEffect(() => {
    if (!isAuthenticated) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        validateAuthSession();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isAuthenticated, validateAuthSession]);

  return {
    // Authentication state
    isAuthenticated,
    user,
    token,
    mfaRequired,
    mfaStatus,
    authMethod,
    deviceStatus,
    subscriptionStatus,

    // Authentication methods
    login: handleLogin,
    logout: handleLogout,
    verifyMFA: handleMFAVerification,
    validateSession: validateAuthSession,

    // Auth0 social login methods
    socialLogin: auth0.loginWithRedirect,
    socialLogout: auth0.logout,
    
    // Additional helper methods
    isCoach: user?.role === 'COACH',
    isAthlete: user?.role === 'ATHLETE',
    isAdmin: user?.role === 'ADMIN',
    isPremium: subscriptionStatus === SubscriptionStatus.PREMIUM
  };
};

export type UseAuth = ReturnType<typeof useAuth>;