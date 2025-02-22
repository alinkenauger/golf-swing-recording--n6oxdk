import { AuthController } from '../src/controllers/auth.controller';
import { AuthService } from '../src/services/auth.service';
import { ApiError, ERROR_CODES } from '@shared/errors/api.error';
import { Logger } from '@shared/utils/logger';
import { RateLimiterRedis } from 'rate-limiter-flexible';
import { ROLES } from '@shared/constants';
import supertest from 'supertest'; // v6.3.3
import { jest } from '@jest/globals'; // v29.0.0

describe('AuthController Tests', () => {
  let authController: AuthController;
  let mockAuthService: jest.Mocked<AuthService>;
  let mockLogger: jest.Mocked<Logger>;
  let mockRateLimiter: jest.Mocked<RateLimiterRedis>;

  // Test data
  const mockUser = {
    id: 'test-user-id',
    email: 'test@example.com',
    role: ROLES.ATHLETE,
    lastLogin: '2023-01-01T00:00:00Z',
    securityProfile: {
      mfaEnabled: false,
      loginAttempts: 0,
      lastFailedLogin: null
    }
  };

  const mockCoach = {
    id: 'test-coach-id',
    email: 'coach@example.com',
    role: ROLES.COACH,
    securityProfile: {
      mfaEnabled: true,
      mfaSecret: 'TEST_SECRET',
      backupCodes: ['CODE1', 'CODE2']
    }
  };

  beforeEach(() => {
    // Initialize mocks
    mockAuthService = {
      login: jest.fn(),
      socialLogin: jest.fn(),
      verifyMFA: jest.fn(),
      setupMFA: jest.fn(),
      validateToken: jest.fn(),
      checkRateLimits: jest.fn(),
      detectSuspiciousActivity: jest.fn()
    } as any;

    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      setCorrelationId: jest.fn(),
      clearCorrelationId: jest.fn()
    } as any;

    mockRateLimiter = {
      consume: jest.fn(),
      penalty: jest.fn(),
      delete: jest.fn()
    } as any;

    authController = new AuthController(
      mockAuthService,
      mockLogger as Logger,
      mockRateLimiter as RateLimiterRedis
    );
  });

  describe('Login Flow Tests', () => {
    it('should successfully authenticate user with valid credentials', async () => {
      const loginRequest = {
        email: mockUser.email,
        password: 'ValidPassword123!',
        deviceId: 'test-device'
      };

      const expectedResponse = {
        success: true,
        data: {
          accessToken: 'mock-token',
          user: mockUser,
          mfaRequired: false
        }
      };

      mockAuthService.login.mockResolvedValue(expectedResponse.data);
      mockRateLimiter.consume.mockResolvedValue({ remainingPoints: 4 });

      const req = {
        body: loginRequest,
        ip: '127.0.0.1',
        headers: { 'x-correlation-id': 'test-correlation-id' }
      } as any;

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        setHeader: jest.fn()
      } as any;

      await authController.login(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expectedResponse);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'User login successful',
        expect.any(Object)
      );
    });

    it('should enforce rate limiting on multiple failed attempts', async () => {
      const loginRequest = {
        email: mockUser.email,
        password: 'WrongPassword',
        deviceId: 'test-device'
      };

      mockRateLimiter.consume.mockRejectedValue({
        remainingPoints: 0,
        msBeforeNext: 60000
      });

      const req = {
        body: loginRequest,
        ip: '127.0.0.1',
        headers: { 'x-correlation-id': 'test-correlation-id' }
      } as any;

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        setHeader: jest.fn()
      } as any;

      await authController.login(req, res);

      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: ERROR_CODES.RATE_LIMIT_EXCEEDED
          })
        })
      );
    });
  });

  describe('Social Authentication Tests', () => {
    it('should successfully authenticate with valid OAuth token', async () => {
      const socialLoginRequest = {
        provider: 'google',
        token: 'valid-oauth-token',
        deviceId: 'test-device'
      };

      const expectedResponse = {
        success: true,
        data: {
          accessToken: 'mock-token',
          user: mockUser
        }
      };

      mockAuthService.socialLogin.mockResolvedValue(expectedResponse.data);
      mockRateLimiter.consume.mockResolvedValue({ remainingPoints: 4 });

      const req = {
        body: socialLoginRequest,
        ip: '127.0.0.1',
        headers: { 'x-correlation-id': 'test-correlation-id' }
      } as any;

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        setHeader: jest.fn()
      } as any;

      await authController.socialLogin(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expectedResponse);
    });

    it('should handle invalid OAuth tokens appropriately', async () => {
      const socialLoginRequest = {
        provider: 'google',
        token: 'invalid-token',
        deviceId: 'test-device'
      };

      mockAuthService.socialLogin.mockRejectedValue(
        ApiError.unauthorized('Invalid OAuth token')
      );

      const req = {
        body: socialLoginRequest,
        ip: '127.0.0.1',
        headers: { 'x-correlation-id': 'test-correlation-id' }
      } as any;

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        setHeader: jest.fn()
      } as any;

      await authController.socialLogin(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: ERROR_CODES.UNAUTHORIZED
          })
        })
      );
    });
  });

  describe('MFA Operation Tests', () => {
    it('should successfully set up MFA for eligible users', async () => {
      const mfaSetupResponse = {
        secret: 'new-mfa-secret',
        qrCode: 'mfa-qr-code-url'
      };

      mockAuthService.setupMFA.mockResolvedValue(mfaSetupResponse);

      const req = {
        user: mockCoach,
        headers: { 'x-correlation-id': 'test-correlation-id' }
      } as any;

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        setHeader: jest.fn()
      } as any;

      await authController.setupMFA(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: mfaSetupResponse
      });
    });

    it('should successfully verify valid MFA tokens', async () => {
      const mfaRequest = {
        token: '123456',
        userId: mockCoach.id
      };

      mockAuthService.verifyMFA.mockResolvedValue(true);

      const req = {
        body: mfaRequest,
        headers: { 'x-correlation-id': 'test-correlation-id' }
      } as any;

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        setHeader: jest.fn()
      } as any;

      await authController.verifyMFA(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'MFA verification successful'
      });
    });

    it('should enforce MFA for required roles', async () => {
      const loginRequest = {
        email: mockCoach.email,
        password: 'ValidPassword123!',
        deviceId: 'test-device'
      };

      mockAuthService.login.mockResolvedValue({
        user: mockCoach,
        mfaRequired: true
      });

      const req = {
        body: loginRequest,
        ip: '127.0.0.1',
        headers: { 'x-correlation-id': 'test-correlation-id' }
      } as any;

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        setHeader: jest.fn()
      } as any;

      await authController.login(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            mfaRequired: true
          })
        })
      );
    });
  });

  describe('Security Header Tests', () => {
    it('should set appropriate security headers on responses', async () => {
      const loginRequest = {
        email: mockUser.email,
        password: 'ValidPassword123!',
        deviceId: 'test-device'
      };

      mockAuthService.login.mockResolvedValue({
        user: mockUser,
        mfaRequired: false
      });

      const req = {
        body: loginRequest,
        ip: '127.0.0.1',
        headers: { 'x-correlation-id': 'test-correlation-id' }
      } as any;

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        setHeader: jest.fn()
      } as any;

      await authController.login(req, res);

      expect(res.setHeader).toHaveBeenCalledWith(
        'X-Content-Type-Options',
        'nosniff'
      );
      expect(res.setHeader).toHaveBeenCalledWith(
        'X-Frame-Options',
        'DENY'
      );
      expect(res.setHeader).toHaveBeenCalledWith(
        'Strict-Transport-Security',
        'max-age=31536000; includeSubDomains'
      );
    });
  });
});