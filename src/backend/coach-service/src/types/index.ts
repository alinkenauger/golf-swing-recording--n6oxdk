import { Document } from 'mongoose'; // ^6.0.0
import { UserRole, PaginationParams } from '@shared/types';

/**
 * Enum defining training program difficulty levels
 */
export enum ProgramLevel {
  BEGINNER = 'beginner',
  INTERMEDIATE = 'intermediate',
  ADVANCED = 'advanced'
}

/**
 * Interface defining daily availability hours
 */
export interface DailyHours {
  start: string; // 24-hour format HH:mm
  end: string; // 24-hour format HH:mm
  available: boolean;
}

/**
 * Interface defining weekly availability schedule
 */
export interface WeeklySchedule {
  monday: DailyHours;
  tuesday: DailyHours;
  wednesday: DailyHours;
  thursday: DailyHours;
  friday: DailyHours;
  saturday: DailyHours;
  sunday: DailyHours;
}

/**
 * Interface defining custom availability hours for specific dates
 */
export interface CustomHours {
  date: Date;
  hours: DailyHours;
  reason: string;
}

/**
 * Interface defining comprehensive coach availability
 */
export interface Availability {
  timeZone: string; // IANA time zone identifier
  weeklySchedule: WeeklySchedule;
  customHours: CustomHours[];
}

/**
 * Interface defining coach certification details
 */
export interface Certification {
  name: string;
  issuingBody: string;
  issueDate: Date;
  expiryDate?: Date;
  verificationUrl?: string;
  verified: boolean;
}

/**
 * Interface defining coach social media links
 */
export interface SocialLink {
  platform: string;
  url: string;
  verified: boolean;
}

/**
 * Interface defining coach subscription tier configuration
 */
export interface SubscriptionTier {
  name: string;
  price: number;
  features: string[];
  billingPeriod: 'monthly' | 'quarterly' | 'yearly';
  maxAthletes: number;
  trialPeriod: number; // in days
}

/**
 * Interface defining program content structure
 */
export interface ProgramContent {
  title: string;
  description: string;
  type: 'video' | 'document' | 'assessment';
  url: string;
  duration?: number; // in minutes
  order: number;
  isPreview: boolean;
}

/**
 * Interface defining comprehensive coach profile data structure
 */
export interface CoachProfile extends Document {
  userId: string;
  bio: string;
  specialties: string[];
  yearsOfExperience: number;
  certifications: Certification[];
  rating: number;
  reviewCount: number;
  subscriptionTiers: SubscriptionTier[];
  availability: Availability;
  socialLinks: SocialLink[];
  featuredVideos: string[]; // Array of video IDs
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Interface defining training program structure
 */
export interface TrainingProgram extends Document {
  coachId: string;
  title: string;
  description: string;
  price: number;
  duration: number; // in weeks
  level: ProgramLevel;
  content: ProgramContent[];
  prerequisites: string[];
  objectives: string[];
  category: string[];
  tags: string[];
  publishedStatus: 'draft' | 'published' | 'archived';
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Interface for coach search filters
 */
export interface CoachSearchFilters extends PaginationParams {
  specialties?: string[];
  minRating?: number;
  maxPrice?: number;
  availability?: {
    dayOfWeek?: number;
    timeRange?: {
      start: string;
      end: string;
    };
  };
  location?: {
    timeZone?: string;
    country?: string;
  };
}

/**
 * Interface for coach analytics data
 */
export interface CoachAnalytics {
  totalRevenue: number;
  activeStudents: number;
  averageRating: number;
  completionRate: number;
  studentRetentionRate: number;
  popularPrograms: {
    programId: string;
    enrollments: number;
    revenue: number;
  }[];
  monthlyStats: {
    month: string;
    revenue: number;
    newStudents: number;
    churnRate: number;
  }[];
}