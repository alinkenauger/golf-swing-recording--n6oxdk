import { AuthService } from '../../src/services/auth.service';
import { ApiClient } from '../../src/lib/api';
import { AuthManager } from '../../src/lib/auth';
import { SecurityUtils } from '@security/utils';
import { useAuth0 } from '@auth0/auth0-react'; // ^2.0.0
import { createMockJwks } from 'mock-jwks'; // ^1.0.0
import { 
  AuthMethod, 
  EmailPasswordCredentials,
  SocialAuthCredentials,
  BiometricAuthData,
  User,
  AuthResponse,
  SubscriptionStatus,
  UserRole 
} from '../../src/types/auth';
import { HttpStatusCode } from '../../src/types/common';

// Mock external dependencies
jest.mock('../../src/lib/api');
jest.mock('../../src/lib/auth');
jest.mock('@auth0/auth0-react');
jest.mock('@security/utils');
jest.mock('@fingerprintjs/fingerprintjs');

describe('AuthService', () => {
  // Test data setup
  const mockDeviceInfo = {
    type: 'desktop',
    os: 'windows',
    browser: 'chrome'
  };

  const mockUser: User = {
    id: 'test-user-id',
    email: 'test@example.com',
    role: UserRole.ATHLETE,
    firstName: 'Test',
    lastName: 'User',
    avatarUrl: null,
    bio: null,
    isActive: true,
    lastLogin: '2023-01-01T00:00:00Z',
    subscriptionStatus: SubscriptionStatus.BASIC,
    mfaEnabled: false,
    preferredAuthMethod: AuthMethod.EMAIL_PASSWORD
  };

  const mockAuthResponse: AuthResponse = {
    success: true,
    data: {
      user: mockUser,
      token: 'mock-jwt-token',
      refreshToken: 'mock-refresh-token',
      expiresAt: Date.now() + 3600000
    },
    error: null,
    metadata: {},
    statusCode: HttpStatusCode.OK
  };

  // Mock instances
  let apiClient: jest.Mocked<ApiClient>;
  let authManager: jest.Mocked<AuthManager>;
  let securityUtils: jest.Mocked<SecurityUtils>;
  let authService: AuthService;
  let mockJwks: ReturnType<typeof createMockJwks>;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Setup mock instances
    apiClient = new ApiClient('') as jest.Mocked<ApiClient>;
    authManager = new AuthManager(apiClient) as jest.Mocked<AuthManager>;
    securityUtils = new SecurityUtils() as jest.Mocked<SecurityUtils>;

    // Setup JWKS mock
    mockJwks = createMockJwks('https://auth.example.com');

    // Setup Auth0 mock
    (useAuth0 as jest.Mock).mockReturnValue({
      isAuthenticated: false,
      loginWithRedirect: jest.fn(),
      logout: jest.fn()
    });

    // Initialize AuthService
    authService = new AuthService(apiClient, authManager, securityUtils);

    // Setup common mock implementations
    securityUtils.generateCSRFToken.mockReturnValue('mock-csrf-token');
    apiClient.post.mockResolvedValue(mockAuthResponse);
  });

  afterEach(() => {
    mockJwks.stop();
  });

  describe('login', () => {
    it('should successfully login with email/password', async () => {
      const credentials: EmailPasswordCredentials = {
        email: 'test@example.com',
        password: 'Test123!',
        rememberMe: true
      };

      const response = await authService.login(credentials, mockDeviceInfo);

      expect(apiClient.post).toHaveBeenCalledWith('/auth/login', {
        ...credentials,
        deviceInfo: mockDeviceInfo,
        deviceFingerprint: expect.any(String),
        csrfToken: 'mock-csrf-token'
      });
      expect(response).toEqual(mockAuthResponse);
      expect(authManager.setupSession).toHaveBeenCalledWith(
        mockAuthResponse.data,
        expect.any(String)
      );
    });

    it('should handle MFA challenge when required', async () => {
      const mfaResponse = {
        ...mockAuthResponse,
        data: {
          ...mockAuthResponse.data,
          user: { ...mockUser, mfaEnabled: true }
        }
      };
      apiClient.post.mockResolvedValueOnce(mfaResponse);

      const credentials: EmailPasswordCredentials = {
        email: 'test@example.com',
        password: 'Test123!'
      };

      await expect(authService.login(credentials, mockDeviceInfo))
        .rejects
        .toThrow('MFA prompt not implemented');

      expect(apiClient.post).toHaveBeenCalledTimes(1);
    });

    it('should handle social authentication', async () => {
      const socialCredentials: SocialAuthCredentials = {
        provider: AuthMethod.GOOGLE,
        accessToken: 'mock-google-token',
        idToken: 'mock-google-id-token'
      };

      const response = await authService.login(socialCredentials, mockDeviceInfo);

      expect(apiClient.post).toHaveBeenCalledWith('/auth/login', {
        ...socialCredentials,
        deviceInfo: mockDeviceInfo,
        deviceFingerprint: expect.any(String),
        csrfToken: 'mock-csrf-token'
      });
      expect(response).toEqual(mockAuthResponse);
    });

    it('should handle biometric authentication', async () => {
      const biometricData: BiometricAuthData = {
        biometricToken: 'mock-biometric-token',
        deviceId: 'mock-device-id',
        authenticatorType: 'fingerprint'
      };

      const response = await authService.login(biometricData, mockDeviceInfo);

      expect(apiClient.post).toHaveBeenCalledWith('/auth/login', {
        ...biometricData,
        deviceInfo: mockDeviceInfo,
        deviceFingerprint: expect.any(String),
        csrfToken: 'mock-csrf-token'
      });
      expect(response).toEqual(mockAuthResponse);
    });

    it('should enforce rate limiting', async () => {
      const credentials: EmailPasswordCredentials = {
        email: 'test@example.com',
        password: 'Test123!'
      };

      // Simulate multiple rapid login attempts
      for (let i = 0; i < 6; i++) {
        if (i < 5) {
          await authService.login(credentials, mockDeviceInfo);
        } else {
          await expect(authService.login(credentials, mockDeviceInfo))
            .rejects
            .toThrow('Too many login attempts');
        }
      }
    });

    it('should handle authentication errors', async () => {
      apiClient.post.mockRejectedValueOnce({
        success: false,
        error: {
          code: 'AUTH_FAILED',
          message: 'Invalid credentials'
        },
        statusCode: HttpStatusCode.UNAUTHORIZED
      });

      const credentials: EmailPasswordCredentials = {
        email: 'test@example.com',
        password: 'wrong-password'
      };

      await expect(authService.login(credentials, mockDeviceInfo))
        .rejects
        .toThrow('Invalid credentials');
    });
  });

  describe('validateSession', () => {
    it('should validate an active session', async () => {
      apiClient.post.mockResolvedValueOnce({
        success: true,
        data: { valid: true }
      });

      const isValid = await authService.validateSession();

      expect(isValid).toBe(true);
      expect(apiClient.post).toHaveBeenCalledWith('/auth/validate', {
        deviceFingerprint: expect.any(String)
      });
    });

    it('should handle invalid sessions', async () => {
      apiClient.post.mockResolvedValueOnce({
        success: true,
        data: { valid: false }
      });

      const isValid = await authService.validateSession();

      expect(isValid).toBe(false);
    });
  });

  describe('logout', () => {
    it('should successfully logout and cleanup session', async () => {
      await authService.logout();

      expect(apiClient.post).toHaveBeenCalledWith('/auth/logout', {});
      expect(authManager.clearSession).toHaveBeenCalled();
    });

    it('should handle logout with Auth0 session', async () => {
      (useAuth0 as jest.Mock).mockReturnValue({
        isAuthenticated: true,
        logout: jest.fn()
      });

      await authService.logout();

      expect(apiClient.post).toHaveBeenCalledWith('/auth/logout', {});
      expect(authManager.clearSession).toHaveBeenCalled();
      expect(useAuth0().logout).toHaveBeenCalled();
    });

    it('should handle logout errors', async () => {
      apiClient.post.mockRejectedValueOnce(new Error('Logout failed'));

      await expect(authService.logout())
        .rejects
        .toThrow('Logout failed');
    });
  });

  describe('security features', () => {
    it('should include CSRF token in requests', async () => {
      const credentials: EmailPasswordCredentials = {
        email: 'test@example.com',
        password: 'Test123!'
      };

      await authService.login(credentials, mockDeviceInfo);

      expect(securityUtils.generateCSRFToken).toHaveBeenCalled();
      expect(apiClient.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          csrfToken: 'mock-csrf-token'
        })
      );
    });

    it('should include device fingerprint in requests', async () => {
      const credentials: EmailPasswordCredentials = {
        email: 'test@example.com',
        password: 'Test123!'
      };

      await authService.login(credentials, mockDeviceInfo);

      expect(apiClient.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          deviceFingerprint: expect.any(String)
        })
      );
    });

    it('should validate token format and expiry', async () => {
      const expiredToken = mockJwks.token({
        exp: Math.floor(Date.now() / 1000) - 3600
      });

      apiClient.post.mockResolvedValueOnce({
        ...mockAuthResponse,
        data: { ...mockAuthResponse.data, token: expiredToken }
      });

      const credentials: EmailPasswordCredentials = {
        email: 'test@example.com',
        password: 'Test123!'
      };

      await expect(authService.login(credentials, mockDeviceInfo))
        .rejects
        .toThrow();
    });
  });
});