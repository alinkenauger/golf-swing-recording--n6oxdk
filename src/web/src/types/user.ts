/**
 * TypeScript type definitions for user-related interfaces and types in the web frontend.
 * Includes comprehensive user profiles, preferences, statistics, and role-specific data models.
 * @version 1.0.0
 */

import { UserRole, BaseEntity } from './common';

/**
 * Main user interface extending BaseEntity with core user data and verification status
 */
export interface User extends BaseEntity {
  email: string;
  role: UserRole;
  profile: UserProfile;
  preferences: UserPreferences;
  isActive: boolean;
  lastLogin: string;
  verificationStatus: 'pending' | 'verified' | 'rejected';
}

/**
 * Enhanced user profile information interface with contact and social details
 */
export interface UserProfile {
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  bio: string | null;
  location: string | null;
  timezone: string;
  phoneNumber: string | null;
  socialLinks: {
    platform: string;
    url: string;
  }[];
}

/**
 * Extended user preferences interface with privacy and notification controls
 */
export interface UserPreferences {
  emailNotifications: boolean;
  pushNotifications: boolean;
  language: string;
  theme: 'light' | 'dark' | 'system';
  privacySettings: {
    profileVisibility: 'public' | 'private' | 'connections';
    showActivity: boolean;
  };
}

/**
 * Enhanced coach profile interface with verification, certifications and availability
 */
export interface CoachProfile {
  specialties: string[];
  experience: number;
  certifications: {
    name: string;
    issuer: string;
    expiryDate: string;
    verificationUrl: string;
  }[];
  hourlyRate: number;
  rating: number;
  totalReviews: number;
  availability: {
    weekday: string;
    slots: {
      start: string;
      end: string;
    }[];
  }[];
  verificationDocuments: {
    type: string;
    url: string;
    status: 'pending' | 'verified' | 'rejected';
  }[];
}

/**
 * Enhanced athlete profile interface with goals and performance tracking
 */
export interface AthleteProfile {
  sports: string[];
  skillLevel: 'beginner' | 'intermediate' | 'advanced' | 'professional';
  goals: {
    description: string;
    targetDate: string;
    status: 'active' | 'completed' | 'abandoned';
  }[];
  activeSubscriptions: string[];
  performanceMetrics: {
    metric: string;
    value: number;
    date: string;
  }[];
  injuryHistory: {
    type: string;
    date: string;
    recoveryStatus: string;
    notes: string;
  }[];
}

/**
 * Comprehensive user statistics interface with engagement and progress tracking
 */
export interface UserStats {
  totalVideos: number;
  totalReviews: number;
  totalCoachingSessions: number;
  lastActivity: string;
  engagementMetrics: {
    metric: string;
    count: number;
    trend: number;
  }[];
  revenueStats: {
    period: string;
    amount: number;
    subscriptions: number;
  }[];
  progressMetrics: {
    skill: string;
    initialLevel: number;
    currentLevel: number;
    history: {
      date: string;
      level: number;
    }[];
  }[];
}