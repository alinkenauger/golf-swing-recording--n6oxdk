// mongoose version ^6.0.0
import { Schema, Document, model } from 'mongoose';
import { IUser } from '../../../shared/interfaces';
import { UserRole } from '../../../shared/types';

/**
 * Certification schema type definition
 */
interface ICertification {
  name: string;
  issuer: string;
  issueDate: Date;
  expiryDate?: Date;
  verificationUrl?: string;
  verificationStatus: 'pending' | 'verified' | 'expired';
}

/**
 * Availability schema type definition
 */
interface IAvailability {
  days: string[];
  timeSlots: Array<{
    start: string;
    end: string;
  }>;
  timezone: string;
}

/**
 * Background check schema type definition
 */
interface IBackgroundCheck {
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  completedAt?: Date;
  expiryDate?: Date;
  referenceId?: string;
}

/**
 * Coach interface extending Document for Mongoose
 */
export interface ICoach extends Document {
  userId: string;
  specialties: string[];
  certifications: ICertification[];
  experience: number;
  hourlyRate: number;
  rating: number;
  reviewCount: number;
  studentCount: number;
  programCount: number;
  totalEarnings: number;
  availability: IAvailability;
  status: 'active' | 'inactive' | 'suspended';
  verificationStatus: 'pending' | 'in_progress' | 'verified' | 'rejected';
  backgroundCheck: IBackgroundCheck;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Coach schema definition with comprehensive validation
 */
const CoachSchema = new Schema<ICoach>({
  userId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  specialties: {
    type: [String],
    required: true,
    validate: {
      validator: (v: string[]) => Array.isArray(v) && v.length > 0,
      message: 'At least one specialty must be specified'
    }
  },
  certifications: [{
    name: { type: String, required: true },
    issuer: { type: String, required: true },
    issueDate: { type: Date, required: true },
    expiryDate: Date,
    verificationUrl: String,
    verificationStatus: {
      type: String,
      enum: ['pending', 'verified', 'expired'],
      default: 'pending'
    }
  }],
  experience: {
    type: Number,
    required: true,
    min: 0
  },
  hourlyRate: {
    type: Number,
    required: true,
    min: 0
  },
  rating: {
    type: Number,
    default: 0,
    min: 0,
    max: 5
  },
  reviewCount: {
    type: Number,
    default: 0,
    min: 0
  },
  studentCount: {
    type: Number,
    default: 0,
    min: 0
  },
  programCount: {
    type: Number,
    default: 0,
    min: 0
  },
  totalEarnings: {
    type: Number,
    default: 0,
    min: 0
  },
  availability: {
    days: {
      type: [String],
      required: true,
      validate: {
        validator: (v: string[]) => Array.isArray(v) && v.length > 0,
        message: 'At least one availability day must be specified'
      }
    },
    timeSlots: [{
      start: { type: String, required: true },
      end: { type: String, required: true }
    }],
    timezone: { type: String, required: true }
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended'],
    default: 'active'
  },
  verificationStatus: {
    type: String,
    enum: ['pending', 'in_progress', 'verified', 'rejected'],
    default: 'pending'
  },
  backgroundCheck: {
    status: {
      type: String,
      enum: ['pending', 'in_progress', 'completed', 'failed'],
      default: 'pending'
    },
    completedAt: Date,
    expiryDate: Date,
    referenceId: String
  }
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      delete ret._id;
      delete ret.__v;
      ret.id = doc.id;
      return ret;
    }
  }
});

/**
 * Indexes for optimized queries
 */
CoachSchema.index({ userId: 1, status: 1 });
CoachSchema.index({ specialties: 'text' });
CoachSchema.index({ 'certifications.verificationStatus': 1 });
CoachSchema.index({ verificationStatus: 1 });

/**
 * Pre-save middleware for data validation
 */
CoachSchema.pre('save', async function(next) {
  if (this.isNew) {
    const existingCoach = await this.constructor.findOne({ userId: this.userId });
    if (existingCoach) {
      throw new Error('Coach profile already exists for this user');
    }
  }

  // Validate certification dates
  this.certifications.forEach(cert => {
    if (cert.expiryDate && cert.expiryDate < cert.issueDate) {
      throw new Error('Certification expiry date cannot be before issue date');
    }
  });

  next();
});

/**
 * Static methods for coach model
 */
CoachSchema.statics = {
  /**
   * Find coach by user ID
   */
  async findByUserId(userId: string): Promise<ICoach | null> {
    return this.findOne({ userId });
  },

  /**
   * Update coach verification status
   */
  async updateVerificationStatus(
    userId: string,
    status: 'pending' | 'in_progress' | 'verified' | 'rejected'
  ): Promise<ICoach | null> {
    return this.findOneAndUpdate(
      { userId },
      { verificationStatus: status },
      { new: true }
    );
  },

  /**
   * Update coach background check status
   */
  async updateBackgroundCheck(
    userId: string,
    backgroundCheck: Partial<IBackgroundCheck>
  ): Promise<ICoach | null> {
    return this.findOneAndUpdate(
      { userId },
      { $set: { backgroundCheck } },
      { new: true }
    );
  }
};

/**
 * Instance methods for coach model
 */
CoachSchema.methods = {
  /**
   * Update coach earnings
   */
  async updateEarnings(amount: number): Promise<void> {
    this.totalEarnings += amount;
    await this.save();
  },

  /**
   * Update coach rating
   */
  async updateRating(newRating: number): Promise<void> {
    const totalRating = this.rating * this.reviewCount + newRating;
    this.reviewCount += 1;
    this.rating = totalRating / this.reviewCount;
    await this.save();
  }
};

/**
 * Export the Coach model
 */
export const CoachModel = model<ICoach>('Coach', CoachSchema);