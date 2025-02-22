/**
 * TypeScript type definitions for payment and subscription handling in the web application.
 * Includes comprehensive interfaces for payment processing, subscription management, and Stripe integration.
 * @version 1.0.0
 */

import { BaseEntity, PaymentStatus } from './common';
import type { Stripe } from '@stripe/stripe-js'; // v2.1.0

/**
 * Supported payment methods in the application
 */
export enum PaymentMethod {
  CREDIT_CARD = 'CREDIT_CARD',
  DEBIT_CARD = 'DEBIT_CARD',
  BANK_TRANSFER = 'BANK_TRANSFER'
}

/**
 * Available subscription billing intervals
 */
export enum SubscriptionInterval {
  MONTHLY = 'MONTHLY',
  QUARTERLY = 'QUARTERLY',
  ANNUAL = 'ANNUAL'
}

/**
 * Possible subscription status values
 */
export enum SubscriptionStatus {
  ACTIVE = 'ACTIVE',
  CANCELED = 'CANCELED',
  EXPIRED = 'EXPIRED',
  PAST_DUE = 'PAST_DUE'
}

/**
 * Comprehensive interface for payment transactions
 * Includes Stripe integration and refund handling
 */
export interface Payment extends BaseEntity {
  userId: string;
  coachId: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  paymentMethod: PaymentMethod;
  stripePaymentIntentId: string;
  stripeCustomerId: string;
  subscriptionId: string | null;
  description: string;
  metadata: Record<string, any>;
  refundedAmount: number | null;
  refundReason: string | null;
}

/**
 * Comprehensive interface for subscription management
 * Includes billing cycles and cancellation handling
 */
export interface Subscription extends BaseEntity {
  userId: string;
  coachId: string;
  planId: string;
  status: SubscriptionStatus;
  amount: number;
  currency: string;
  interval: SubscriptionInterval;
  intervalCount: number;
  stripeSubscriptionId: string;
  stripeCustomerId: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
  metadata: Record<string, any>;
}

/**
 * Type definition for Stripe payment intent with metadata
 */
export type StripePaymentIntent = Stripe.PaymentIntent & {
  metadata: {
    userId: string;
    coachId: string;
    subscriptionId?: string;
  };
};

/**
 * Type definition for Stripe subscription with metadata
 */
export type StripeSubscription = Stripe.Subscription & {
  metadata: {
    userId: string;
    coachId: string;
    planId: string;
  };
};

/**
 * Interface for payment method details
 */
export interface PaymentMethodDetails {
  id: string;
  type: PaymentMethod;
  last4: string;
  expiryMonth?: number;
  expiryYear?: number;
  brand?: string;
  isDefault: boolean;
}

/**
 * Interface for subscription plan configuration
 */
export interface SubscriptionPlan {
  id: string;
  name: string;
  description: string;
  amount: number;
  currency: string;
  interval: SubscriptionInterval;
  intervalCount: number;
  trialPeriodDays: number | null;
  features: string[];
  metadata: Record<string, any>;
}

/**
 * Interface for payment processing response
 */
export interface PaymentProcessingResult {
  success: boolean;
  paymentIntentId?: string;
  clientSecret?: string;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Interface for subscription update request
 */
export interface SubscriptionUpdateRequest {
  planId?: string;
  cancelAtPeriodEnd?: boolean;
  paymentMethodId?: string;
  metadata?: Record<string, any>;
}

/**
 * Interface for refund request
 */
export interface RefundRequest {
  paymentId: string;
  amount?: number;
  reason: string;
  metadata?: Record<string, any>;
}