import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { IUser } from '@shared/interfaces';
import { ROLES } from '@shared/constants';

// Constants for security configuration
const SALT_ROUNDS = 12;
const PASSWORD_HISTORY_LIMIT = 5;
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION = 30 * 60 * 1000; // 30 minutes
const BACKUP_CODES_COUNT = 10;
const BACKUP_CODE_LENGTH = 10;

/**
 * Extended user schema with comprehensive security features
 */
const UserSchema = new mongoose.Schema<IUser>({
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
  },
  password: {
    type: String,
    required: true,
    minlength: 8,
  },
  role: {
    type: String,
    enum: Object.values(ROLES),
    required: true,
  },
  profile: {
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    avatarUrl: String,
    bio: { type: String, maxlength: 500 },
    location: String,
    timezone: { type: String, required: true },
    preferences: {
      notifications: { type: Boolean, default: true },
      emailUpdates: { type: Boolean, default: true },
      language: { type: String, default: 'en' },
    },
  },
  mfaEnabled: { type: Boolean, default: false },
  mfaSecret: { type: String, select: false },
  mfaBackupCodes: { type: [String], select: false },
  roleMetadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: new Map(),
  },
  permissions: {
    type: [String],
    default: [],
  },
  passwordHistory: {
    type: [String],
    select: false,
    default: [],
  },
  failedLoginAttempts: {
    type: Number,
    default: 0,
  },
  accountLockoutUntil: {
    type: Date,
    default: null,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  lastLogin: {
    type: Date,
    default: null,
  },
}, {
  timestamps: true,
  collection: 'users',
});

/**
 * Index definitions for optimized queries
 */
UserSchema.index({ email: 1 }, { unique: true });
UserSchema.index({ role: 1 });
UserSchema.index({ 'profile.firstName': 1, 'profile.lastName': 1 });
UserSchema.index({ createdAt: 1 });
UserSchema.index({ failedLoginAttempts: 1, accountLockoutUntil: 1 });

/**
 * Pre-save middleware to handle password hashing and history
 */
UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) {
    return next();
  }

  try {
    // Generate salt and hash password
    const salt = await bcrypt.genSalt(SALT_ROUNDS);
    const hashedPassword = await bcrypt.hash(this.password, salt);

    // Update password history
    if (this.passwordHistory) {
      this.passwordHistory.unshift(hashedPassword);
      if (this.passwordHistory.length > PASSWORD_HISTORY_LIMIT) {
        this.passwordHistory = this.passwordHistory.slice(0, PASSWORD_HISTORY_LIMIT);
      }
    } else {
      this.passwordHistory = [hashedPassword];
    }

    this.password = hashedPassword;
    next();
  } catch (error) {
    next(error as Error);
  }
});

/**
 * Instance method to compare passwords and manage login attempts
 */
UserSchema.methods.comparePassword = async function(candidatePassword: string): Promise<boolean> {
  try {
    // Check account lockout
    if (this.accountLockoutUntil && this.accountLockoutUntil > new Date()) {
      throw new Error('Account is temporarily locked');
    }

    const isMatch = await bcrypt.compare(candidatePassword, this.password);

    if (!isMatch) {
      this.failedLoginAttempts += 1;

      // Implement account lockout after max attempts
      if (this.failedLoginAttempts >= MAX_LOGIN_ATTEMPTS) {
        this.accountLockoutUntil = new Date(Date.now() + LOCKOUT_DURATION);
      }

      await this.save();
      return false;
    }

    // Reset login attempts on successful login
    if (this.failedLoginAttempts > 0) {
      this.failedLoginAttempts = 0;
      this.accountLockoutUntil = null;
      await this.save();
    }

    return true;
  } catch (error) {
    throw error;
  }
};

/**
 * Instance method to generate MFA credentials
 */
UserSchema.methods.generateMFASecret = async function(): Promise<{ secret: string; backupCodes: string[] }> {
  try {
    // Generate random MFA secret
    const secret = crypto.randomBytes(32).toString('hex');

    // Generate backup codes
    const backupCodes = Array.from({ length: BACKUP_CODES_COUNT }, () =>
      crypto.randomBytes(BACKUP_CODE_LENGTH / 2).toString('hex')
    );

    // Hash backup codes before storage
    const hashedBackupCodes = await Promise.all(
      backupCodes.map(code => bcrypt.hash(code, SALT_ROUNDS))
    );

    // Update user with new MFA credentials
    this.mfaSecret = secret;
    this.mfaBackupCodes = hashedBackupCodes;
    this.mfaEnabled = true;
    await this.save();

    return {
      secret,
      backupCodes,
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Instance method to verify MFA backup code
 */
UserSchema.methods.verifyBackupCode = async function(backupCode: string): Promise<boolean> {
  try {
    for (let i = 0; i < this.mfaBackupCodes.length; i++) {
      const isMatch = await bcrypt.compare(backupCode, this.mfaBackupCodes[i]);
      if (isMatch) {
        // Remove used backup code
        this.mfaBackupCodes.splice(i, 1);
        await this.save();
        return true;
      }
    }
    return false;
  } catch (error) {
    throw error;
  }
};

// Export the User model
export const User = mongoose.model<IUser>('User', UserSchema);