// mongoose version ^6.0.0
import { Schema, Document, model } from 'mongoose';
import { Coach } from './coach.model';
import { PaginationParams } from '../../../shared/types';

/**
 * Program status enum defining all possible states of a training program
 */
export enum ProgramStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  ARCHIVED = 'archived',
  SUSPENDED = 'suspended'
}

/**
 * Content item interface for program modules/lessons
 */
export interface ContentItem {
  type: 'video' | 'document' | 'quiz' | 'assignment';
  title: string;
  description: string;
  url: string;
  duration?: number;
  order: number;
  completionCriteria?: string;
  requiredTime?: number;
}

/**
 * Program interface extending Document for Mongoose
 */
export interface Program extends Document {
  coachId: string;
  title: string;
  description: string;
  sport: string;
  level: 'beginner' | 'intermediate' | 'advanced' | 'professional';
  duration: number; // in minutes
  price: number;
  content: ContentItem[];
  enrollmentCount: number;
  rating: number;
  reviewCount: number;
  status: ProgramStatus;
  isPublished: boolean;
  publishedAt?: Date;
  categories: string[];
  tags: string[];
  prerequisites: string[];
  availabilityWindow: {
    startDate: Date;
    endDate?: Date;
  };
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Program schema definition with comprehensive validation
 */
const ProgramSchema = new Schema<Program>({
  coachId: {
    type: String,
    required: true,
    index: true,
    ref: 'Coach'
  },
  title: {
    type: String,
    required: true,
    trim: true,
    minlength: 5,
    maxlength: 100
  },
  description: {
    type: String,
    required: true,
    trim: true,
    minlength: 20,
    maxlength: 2000
  },
  sport: {
    type: String,
    required: true,
    index: true
  },
  level: {
    type: String,
    required: true,
    enum: ['beginner', 'intermediate', 'advanced', 'professional']
  },
  duration: {
    type: Number,
    required: true,
    min: 1
  },
  price: {
    type: Number,
    required: true,
    min: 0,
    validate: {
      validator: (value: number) => value >= 0 && value <= 10000,
      message: 'Price must be between 0 and 10000'
    }
  },
  content: [{
    type: {
      type: String,
      required: true,
      enum: ['video', 'document', 'quiz', 'assignment']
    },
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 100
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500
    },
    url: {
      type: String,
      required: true,
      trim: true
    },
    duration: Number,
    order: {
      type: Number,
      required: true,
      min: 0
    },
    completionCriteria: String,
    requiredTime: Number
  }],
  enrollmentCount: {
    type: Number,
    default: 0,
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
  status: {
    type: String,
    enum: Object.values(ProgramStatus),
    default: ProgramStatus.DRAFT
  },
  isPublished: {
    type: Boolean,
    default: false
  },
  publishedAt: Date,
  categories: [{
    type: String,
    trim: true
  }],
  tags: [{
    type: String,
    trim: true
  }],
  prerequisites: [{
    type: String,
    trim: true
  }],
  availabilityWindow: {
    startDate: {
      type: Date,
      required: true
    },
    endDate: Date
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
ProgramSchema.index({ coachId: 1, status: 1 });
ProgramSchema.index({ sport: 1, level: 1 });
ProgramSchema.index({ categories: 1 });
ProgramSchema.index({ title: 'text', description: 'text' });
ProgramSchema.index({ price: 1 });

/**
 * Pre-save middleware for data validation and processing
 */
ProgramSchema.pre('save', async function(next) {
  if (this.isModified('content')) {
    // Validate content order sequence
    const orders = this.content.map(item => item.order);
    const uniqueOrders = new Set(orders);
    if (orders.length !== uniqueOrders.size) {
      throw new Error('Content items must have unique order values');
    }
  }

  if (this.isModified('status') && this.status === ProgramStatus.PUBLISHED) {
    this.isPublished = true;
    this.publishedAt = new Date();
  }

  if (this.availabilityWindow.endDate && 
      this.availabilityWindow.endDate <= this.availabilityWindow.startDate) {
    throw new Error('End date must be after start date');
  }

  next();
});

/**
 * Static methods for program model
 */
ProgramSchema.statics = {
  /**
   * Find programs by coach ID with pagination
   */
  async findByCoach(coachId: string, params: PaginationParams) {
    return this.find({ coachId })
      .sort({ [params.sortBy || 'createdAt']: params.sortOrder || 'desc' })
      .skip((params.page - 1) * params.limit)
      .limit(params.limit);
  },

  /**
   * Update program status
   */
  async updateStatus(programId: string, status: ProgramStatus) {
    return this.findByIdAndUpdate(
      programId,
      { status, ...(status === ProgramStatus.PUBLISHED && { publishedAt: new Date() }) },
      { new: true }
    );
  },

  /**
   * Calculate program rating
   */
  async calculateRating(programId: string, newRating: number) {
    const program = await this.findById(programId);
    if (!program) throw new Error('Program not found');

    const totalRating = program.rating * program.reviewCount + newRating;
    program.reviewCount += 1;
    program.rating = totalRating / program.reviewCount;
    
    return program.save();
  }
};

/**
 * Export the Program model and interface
 */
export const ProgramModel = model<Program>('Program', ProgramSchema);