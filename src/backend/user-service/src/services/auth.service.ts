import { User } from '../models/user.model';
import { ApiError } from '@shared/errors/api.error';
import jsonwebtoken from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { Auth0Client } from '@auth0/auth0-spa-js';
import speakeasy from 'speakeasy';
import { RateLimiterRedis } from 'rate-limiter-flexible';
import Redis from 'redis';
import { promisify } from 'util';
import { IUser } from '@shared/interfaces';
import { ROLES } from '@shared/constants';

// Environment variables and constants
const JWT_SECRET = process.env.JWT_SECRET!;
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET!;
const TOKEN_EXPIRY = process.env.TOKEN_EXPIRY || '1h';
const REFRESH_TOKEN_EXPIRY = process.env.REFRESH_TOKEN_EXPIRY || '7d';
const MFA_REQUIRED_ROLES = ['ADMIN', 'COACH'];
const MAX_LOGIN_ATTEMPTS = Number(process.env.MAX_LOGIN_ATTEMPTS) || 5;
const LOGIN_WINDOW = Number(process.env.LOGIN_WINDOW) || 15 * 60;

interface TokenPayload {
  userId: string;
  role: string;
  sessionId: string;
}

interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: Partial<IUser>;
  mfaRequired?: boolean;
}

export class AuthService {
  private readonly redisClient: Redis.RedisClient;
  private readonly getAsync: (key: string) => Promise<string | null>;
  private readonly setAsync: (key: string, value: string) => Promise<unknown>;
  private readonly rateLimiter: RateLimiterRedis;
  private readonly auth0Client: Auth0Client;

  constructor() {
    // Initialize Redis client
    this.redisClient = Redis.createClient({
      url: process.env.REDIS_URL,
      password: process.env.REDIS_PASSWORD
    });

    // Promisify Redis methods
    this.getAsync = promisify(this.redisClient.get).bind(this.redisClient);
    this.setAsync = promisify(this.redisClient.set).bind(this.redisClient);

    // Configure rate limiter
    this.rateLimiter = new RateLimiterRedis({
      storeClient: this.redisClient,
      keyPrefix: 'login_limit',
      points: MAX_LOGIN_ATTEMPTS,
      duration: LOGIN_WINDOW
    });

    // Initialize Auth0 client
    this.auth0Client = new Auth0Client({
      domain: process.env.AUTH0_DOMAIN!,
      client_id: process.env.AUTH0_CLIENT_ID!
    });
  }

  /**
   * Generates JWT tokens for authenticated user
   */
  private async generateTokens(user: IUser, sessionId: string): Promise<{ accessToken: string; refreshToken: string }> {
    const payload: TokenPayload = {
      userId: user.id,
      role: user.role,
      sessionId
    };

    const accessToken = jsonwebtoken.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
    const refreshToken = jsonwebtoken.sign(payload, REFRESH_TOKEN_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRY });

    // Store refresh token hash in Redis
    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    await this.setAsync(`refresh_token:${sessionId}`, refreshTokenHash);

    return { accessToken, refreshToken };
  }

  /**
   * Authenticates user with email/password
   */
  public async login(email: string, password: string, ip: string): Promise<AuthResponse> {
    try {
      // Check rate limiting
      await this.rateLimiter.consume(ip);

      const user = await User.findOne({ email }).select('+password +mfaSecret +mfaEnabled');
      if (!user) {
        throw ApiError.unauthorized('Invalid credentials');
      }

      const isPasswordValid = await user.comparePassword(password);
      if (!isPasswordValid) {
        throw ApiError.unauthorized('Invalid credentials');
      }

      // Generate unique session ID
      const sessionId = `${user.id}_${Date.now()}`;

      // Check if MFA is required
      const mfaRequired = user.mfaEnabled || MFA_REQUIRED_ROLES.includes(user.role);

      // Generate tokens
      const { accessToken, refreshToken } = await this.generateTokens(user, sessionId);

      // Update last login
      await user.updateLastLogin();

      // Filter sensitive data from user object
      const userResponse = {
        id: user.id,
        email: user.email,
        role: user.role,
        profile: user.profile
      };

      return {
        accessToken,
        refreshToken,
        user: userResponse,
        mfaRequired
      };
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw ApiError.internal('Authentication failed', { error: error.message });
    }
  }

  /**
   * Refreshes access token using refresh token
   */
  public async refreshToken(refreshToken: string): Promise<{ accessToken: string }> {
    try {
      const decoded = jsonwebtoken.verify(refreshToken, REFRESH_TOKEN_SECRET) as TokenPayload;
      
      // Verify refresh token in Redis
      const storedHash = await this.getAsync(`refresh_token:${decoded.sessionId}`);
      if (!storedHash) {
        throw ApiError.unauthorized('Invalid refresh token');
      }

      const isValid = await bcrypt.compare(refreshToken, storedHash);
      if (!isValid) {
        throw ApiError.unauthorized('Invalid refresh token');
      }

      // Generate new access token
      const accessToken = jsonwebtoken.sign(
        { userId: decoded.userId, role: decoded.role, sessionId: decoded.sessionId },
        JWT_SECRET,
        { expiresIn: TOKEN_EXPIRY }
      );

      return { accessToken };
    } catch (error) {
      throw ApiError.unauthorized('Token refresh failed');
    }
  }

  /**
   * Verifies MFA token
   */
  public async verifyMFA(userId: string, token: string): Promise<boolean> {
    try {
      const user = await User.findById(userId).select('+mfaSecret');
      if (!user?.mfaSecret) {
        throw ApiError.badRequest('MFA not configured');
      }

      return speakeasy.totp.verify({
        secret: user.mfaSecret,
        encoding: 'hex',
        token
      });
    } catch (error) {
      throw ApiError.badRequest('MFA verification failed');
    }
  }

  /**
   * Sets up MFA for user
   */
  public async setupMFA(userId: string): Promise<{ secret: string; qrCode: string }> {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw ApiError.notFound('User not found');
      }

      const secret = speakeasy.generateSecret({ length: 20 });
      const qrCode = `otpauth://totp/VideoCoach:${user.email}?secret=${secret.base32}&issuer=VideoCoach`;

      user.mfaSecret = secret.hex;
      await user.save();

      return {
        secret: secret.base32,
        qrCode
      };
    } catch (error) {
      throw ApiError.internal('MFA setup failed');
    }
  }

  /**
   * Logs out user and invalidates tokens
   */
  public async logout(sessionId: string): Promise<void> {
    try {
      await this.redisClient.del(`refresh_token:${sessionId}`);
    } catch (error) {
      throw ApiError.internal('Logout failed');
    }
  }
}