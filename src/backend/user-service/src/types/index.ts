import { UserRole } from '../../../shared/types';
import { IsEmail, IsString, IsBoolean, IsEnum, IsOptional, MinLength, MaxLength, IsArray, IsNumber, IsUrl, IsDateString, IsIP, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Supported MFA types in the system
 */
export enum MfaType {
  TOTP = 'totp',
  SMS = 'sms',
  EMAIL = 'email',
  NONE = 'none'
}

/**
 * Security event types for audit logging
 */
export enum SecurityEventType {
  LOGIN_SUCCESS = 'login_success',
  LOGIN_FAILURE = 'login_failure',
  PASSWORD_CHANGE = 'password_change',
  MFA_ENABLED = 'mfa_enabled',
  MFA_DISABLED = 'mfa_disabled',
  ACCOUNT_LOCKED = 'account_locked',
  SUSPICIOUS_ACTIVITY = 'suspicious_activity'
}

/**
 * User account status types
 */
export enum UserStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
  PENDING_VERIFICATION = 'pending_verification',
  LOCKED = 'locked'
}

/**
 * Data transfer object for user creation
 */
export class CreateUserDto {
  @ApiProperty({ example: 'coach@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: 'StrongP@ssw0rd' })
  @IsString()
  @MinLength(8)
  @MaxLength(100)
  password: string;

  @ApiProperty({ enum: UserRole })
  @IsEnum(UserRole)
  role: UserRole;

  @ApiProperty()
  @IsBoolean()
  @IsOptional()
  mfaEnabled?: boolean;

  @ApiProperty({ enum: MfaType })
  @IsEnum(MfaType)
  @IsOptional()
  mfaType?: MfaType;

  @ApiProperty()
  profile: UserProfileDto;
}

/**
 * Extended user profile data transfer object
 */
export class UserProfileDto {
  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  firstName: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  lastName: string;

  @ApiProperty()
  @IsUrl()
  @IsOptional()
  avatarUrl?: string;

  @ApiProperty()
  @IsString()
  @MaxLength(1000)
  @IsOptional()
  bio?: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsOptional()
  coachSpecialties?: string[];

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsOptional()
  certifications?: string[];

  @ApiProperty()
  @IsNumber()
  @IsOptional()
  yearsOfExperience?: number;
}

/**
 * Security audit event tracking interface
 */
export interface SecurityEvent {
  type: SecurityEventType;
  userId: string;
  timestamp: Date;
  ipAddress: string;
  userAgent: string;
  metadata?: Record<string, any>;
}

/**
 * MFA verification request data transfer object
 */
export class MfaVerificationDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiProperty()
  @IsString()
  @MinLength(6)
  @MaxLength(6)
  code: string;

  @ApiProperty({ enum: MfaType })
  @IsEnum(MfaType)
  type: MfaType;
}

/**
 * Password change request data transfer object
 */
export class PasswordChangeDto {
  @ApiProperty()
  @IsString()
  @MinLength(8)
  currentPassword: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  newPassword: string;
}

/**
 * User preferences data transfer object
 */
export class UserPreferencesDto {
  @ApiProperty()
  @IsBoolean()
  emailNotifications: boolean;

  @ApiProperty()
  @IsBoolean()
  smsNotifications: boolean;

  @ApiProperty()
  @IsString()
  timezone: string;

  @ApiProperty()
  @IsString()
  language: string;
}

/**
 * Account recovery request data transfer object
 */
export class AccountRecoveryDto {
  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiProperty()
  @IsString()
  @IsOptional()
  recoveryCode?: string;
}

/**
 * User session information interface
 */
export interface UserSession {
  id: string;
  userId: string;
  createdAt: Date;
  expiresAt: Date;
  lastActiveAt: Date;
  ipAddress: string;
  userAgent: string;
  isValid: boolean;
}

/**
 * Background check status types
 */
export enum BackgroundCheckStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  EXPIRED = 'expired'
}

/**
 * Coach verification status interface
 */
export interface CoachVerification {
  backgroundCheckStatus: BackgroundCheckStatus;
  verificationDate?: Date;
  expirationDate?: Date;
  documents: Array<{
    type: string;
    url: string;
    verifiedAt?: Date;
  }>;
  notes?: string;
}