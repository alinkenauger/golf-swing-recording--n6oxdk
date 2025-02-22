import supertest from 'supertest'; // ^6.3.3
import jwt from 'jsonwebtoken'; // ^9.0.0
import RedisMock from 'redis-mock'; // ^0.56.3
import { app } from '../src/app';
import { authenticate } from '../src/middleware/auth.middleware';
import { errorHandler } from '../src/middleware/error.middleware';
import { ApiError } from '../../shared/errors/api.error';
import { ROLES } from '../../shared/constants';

// Initialize test client
const request = supertest(app);

// Mock Redis client
const mockRedis = new RedisMock();

// Test configuration
const testConfig = {
  jwtSecret: 'test-secret-key',
  jwtExpiry: '1h',
  testUsers: {
    admin: { id: 'admin-123', role: ROLES.ADMIN },
    coach: { id: 'coach-123', role: ROLES.COACH },
    athlete: { id: 'athlete-123', role: ROLES.ATHLETE }
  }
};

/**
 * Generates JWT tokens for testing authentication
 */
const generateTestToken = (payload: any, role: string): string => {
  return jwt.sign(
    {
      userId: payload.id,
      role: role,
      permissions: [],
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600
    },
    testConfig.jwtSecret
  );
};

/**
 * Setup test environment before each test
 */
beforeEach(() => {
  // Reset mock Redis
  mockRedis.flushall();
  
  // Reset rate limit counters
  jest.clearAllMocks();
  
  // Configure test timeouts
  jest.setTimeout(10000);
});

describe('API Gateway Core Functionality', () => {
  describe('Health Check', () => {
    it('should return 200 OK for health check endpoint', async () => {
      const response = await request.get('/health');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('version');
    });
  });

  describe('CORS Configuration', () => {
    it('should handle CORS preflight requests', async () => {
      const response = await request
        .options('/api/v1/users')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'GET');

      expect(response.status).toBe(204);
      expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3000');
      expect(response.headers['access-control-allow-methods']).toContain('GET');
    });
  });

  describe('Security Headers', () => {
    it('should set security headers on all responses', async () => {
      const response = await request.get('/health');

      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['x-xss-protection']).toBe('1; mode=block');
    });
  });
});

describe('Authentication & Authorization', () => {
  describe('JWT Validation', () => {
    it('should reject requests without authentication token', async () => {
      const response = await request.get('/api/v1/users');
      
      expect(response.status).toBe(401);
      expect(response.body.errorCode).toBe('UNAUTHORIZED');
    });

    it('should accept valid JWT tokens', async () => {
      const token = generateTestToken(testConfig.testUsers.admin, ROLES.ADMIN);
      
      const response = await request
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${token}`);
      
      expect(response.status).toBe(200);
    });

    it('should reject expired tokens', async () => {
      const expiredToken = jwt.sign(
        {
          userId: 'test-123',
          role: ROLES.ADMIN,
          exp: Math.floor(Date.now() / 1000) - 3600
        },
        testConfig.jwtSecret
      );

      const response = await request
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${expiredToken}`);
      
      expect(response.status).toBe(401);
      expect(response.body.errorCode).toBe('UNAUTHORIZED');
    });
  });

  describe('Role-Based Authorization', () => {
    it('should allow admin access to protected routes', async () => {
      const token = generateTestToken(testConfig.testUsers.admin, ROLES.ADMIN);
      
      const response = await request
        .get('/api/v1/admin/dashboard')
        .set('Authorization', `Bearer ${token}`);
      
      expect(response.status).toBe(200);
    });

    it('should restrict athlete access to coach-only routes', async () => {
      const token = generateTestToken(testConfig.testUsers.athlete, ROLES.ATHLETE);
      
      const response = await request
        .get('/api/v1/coach/analytics')
        .set('Authorization', `Bearer ${token}`);
      
      expect(response.status).toBe(403);
      expect(response.body.errorCode).toBe('FORBIDDEN');
    });
  });
});

describe('Rate Limiting', () => {
  describe('Basic Rate Limits', () => {
    it('should apply rate limits to public endpoints', async () => {
      // Make requests up to limit
      for (let i = 0; i < 100; i++) {
        await request.get('/api/v1/public/endpoint');
      }

      // Next request should be rate limited
      const response = await request.get('/api/v1/public/endpoint');
      
      expect(response.status).toBe(429);
      expect(response.body.errorCode).toBe('RATE_LIMIT_EXCEEDED');
      expect(response.headers['retry-after']).toBeDefined();
    });

    it('should include rate limit headers', async () => {
      const response = await request.get('/api/v1/public/endpoint');
      
      expect(response.headers['x-ratelimit-limit']).toBeDefined();
      expect(response.headers['x-ratelimit-remaining']).toBeDefined();
      expect(response.headers['x-ratelimit-reset']).toBeDefined();
    });
  });

  describe('Tiered Rate Limits', () => {
    it('should apply higher limits for authenticated users', async () => {
      const token = generateTestToken(testConfig.testUsers.coach, ROLES.COACH);
      
      // Make requests up to authenticated limit
      for (let i = 0; i < 1000; i++) {
        await request
          .get('/api/v1/users')
          .set('Authorization', `Bearer ${token}`);
      }

      const response = await request
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${token}`);
      
      expect(response.status).toBe(429);
    });
  });
});

describe('Error Handling', () => {
  describe('HTTP Error Responses', () => {
    it('should handle 404 not found errors', async () => {
      const response = await request.get('/api/v1/nonexistent');
      
      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({
        statusCode: 404,
        errorCode: 'NOT_FOUND',
        message: expect.any(String)
      });
    });

    it('should handle validation errors', async () => {
      const response = await request
        .post('/api/v1/users')
        .send({ invalidField: 'test' });
      
      expect(response.status).toBe(422);
      expect(response.body.errorCode).toBe('VALIDATION_ERROR');
      expect(response.body.details).toBeDefined();
    });
  });

  describe('Error Response Format', () => {
    it('should return standardized error responses', async () => {
      const response = await request.get('/api/v1/error-test');
      
      expect(response.body).toMatchObject({
        statusCode: expect.any(Number),
        errorCode: expect.any(String),
        message: expect.any(String),
        timestamp: expect.any(String),
        traceId: expect.any(String)
      });
    });

    it('should mask sensitive data in error responses', async () => {
      const response = await request
        .post('/api/v1/users')
        .send({ password: 'secret', token: 'sensitive' });
      
      expect(response.body.details).not.toHaveProperty('password');
      expect(response.body.details).not.toHaveProperty('token');
    });
  });
});