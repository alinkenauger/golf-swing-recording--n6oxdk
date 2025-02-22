/**
 * TypeScript type definitions and interfaces for coach-related entities
 * Provides comprehensive type safety for coach profiles, programs, and monetization features
 * @version 1.0.0
 */

import { BaseEntity, UserRole } from './common';

/**
 * Coach status in the platform
 */
export enum CoachStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
  PENDING_REVIEW = 'pending_review'
}

/**
 * Verification status for coach credentials and certifications
 */
export enum VerificationStatus {
  PENDING = 'pending',
  VERIFIED = 'verified',
  REJECTED = 'rejected',
  REQUIRES_ADDITIONAL_INFO = 'requires_additional_info'
}

/**
 * Training program difficulty levels
 */
export enum ProgramLevel {
  BEGINNER = 'beginner',
  INTERMEDIATE = 'intermediate',
  ADVANCED = 'advanced',
  PRO = 'pro',
  ELITE = 'elite'
}

/**
 * Interface for coach certification details
 */
export interface Certification extends BaseEntity {
  name: string;
  issuer: string;
  issueDate: string;
  expiryDate: string | null;
  verificationUrl: string | null;
  verificationStatus: VerificationStatus;
  documentUrls: string[];
}

/**
 * Interface for coach availability scheduling
 */
export interface Availability {
  days: string[];
  timeSlots: {
    start: string;
    end: string;
    maxStudents?: number;
  }[];
  timezone: string;
  exceptions: {
    date: string;
    available: boolean;
    reason?: string;
  }[];
}

/**
 * Comprehensive interface for coach profile data
 */
export interface Coach extends BaseEntity {
  userId: string;
  specialties: string[];
  certifications: Certification[];
  experience: number;
  hourlyRate: number;
  rating: number;
  reviewCount: number;
  studentCount: number;
  programCount: number;
  totalEarnings: number;
  monthlyEarnings: {
    month: string;
    amount: number;
  }[];
  availability: Availability;
  status: CoachStatus;
  verificationStatus: VerificationStatus;
  analyticsData: {
    viewCount: number;
    bookmarkCount: number;
    shareCount: number;
  };
}

/**
 * Interface for program content items
 */
export interface ContentItem extends BaseEntity {
  type: string;
  title: string;
  description: string;
  url: string;
  duration: number | null;
  order: number;
  prerequisites: string[];
  attachments: {
    name: string;
    url: string;
    type: string;
  }[];
}

/**
 * Comprehensive interface for training program data
 */
export interface Program extends BaseEntity {
  coachId: string;
  title: string;
  description: string;
  sport: string;
  level: ProgramLevel;
  duration: number;
  price: number;
  discountPrice: number | null;
  content: ContentItem[];
  enrollmentCount: number;
  rating: number;
  reviewCount: number;
  isPublished: boolean;
  publishedAt: string | null;
  analytics: {
    views: number;
    completionRate: number;
    averageRating: number;
    revenue: number;
  };
}