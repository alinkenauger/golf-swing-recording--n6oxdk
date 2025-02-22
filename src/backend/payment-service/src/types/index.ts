import { PaymentStatus } from '../../../shared/types';
import type { Stripe } from 'stripe'; // ^12.0.0

/**
 * Supported payment methods for transaction processing
 */
export enum PaymentMethod {
  CREDIT_CARD = 'credit_card',
  DEBIT_CARD = 'debit_card',
  BANK_TRANSFER = 'bank_transfer'
}

/**
 * Available subscription tiers for coaches and athletes
 */
export enum SubscriptionTier {
  BASIC = 'basic',
  PREMIUM = 'premium'
}

/**
 * Comprehensive subscription status tracking
 */
export enum SubscriptionStatus {
  ACTIVE = 'active',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
  PAST_DUE = 'past_due',
  TRIAL = 'trial'
}

/**
 * Complete payment intent data structure with Stripe integration
 */
export interface PaymentIntent {
  id: string;
  amount: number;
  currency: string;
  paymentMethod: PaymentMethod;
  status: PaymentStatus;
  stripePaymentIntentId: string;
  customerId: string;
  description: string;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Detailed subscription plan configuration with Stripe product integration
 */
export interface SubscriptionPlan {
  id: string;
  tier: SubscriptionTier;
  price: number;
  currency: string;
  billingPeriod: string;
  features: string[];
  trialPeriodDays: number;
  stripePriceId: string;
  stripeProductId: string;
}

/**
 * Comprehensive Stripe webhook event type definition
 */
export type PaymentWebhookEvent = {
  type: string;
  data: Stripe.Event.Data;
  created: number;
  id: string;
  livemode: boolean;
}

/**
 * Transaction record for payment tracking
 */
export interface Transaction {
  id: string;
  paymentIntentId: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  customerId: string;
  paymentMethod: PaymentMethod;
  metadata: {
    subscriptionId?: string;
    productId?: string;
    description: string;
  };
  refundedAmount?: number;
  fees: number;
  netAmount: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Customer subscription record
 */
export interface Subscription {
  id: string;
  customerId: string;
  planId: string;
  status: SubscriptionStatus;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  stripeSubscriptionId: string;
  trialEnd?: Date;
  canceledAt?: Date;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Payout record for coach earnings
 */
export interface Payout {
  id: string;
  coachId: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  stripePayoutId: string;
  periodStart: Date;
  periodEnd: Date;
  transactionIds: string[];
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Price configuration for subscription plans and one-time purchases
 */
export interface PriceConfiguration {
  id: string;
  amount: number;
  currency: string;
  type: 'one_time' | 'recurring';
  interval?: 'day' | 'week' | 'month' | 'year';
  intervalCount?: number;
  stripePriceId: string;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Refund record for payment reversals
 */
export interface Refund {
  id: string;
  transactionId: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  reason: string;
  stripeRefundId: string;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}