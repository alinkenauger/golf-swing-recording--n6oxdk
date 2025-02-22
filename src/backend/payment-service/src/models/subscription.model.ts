import { Schema, Document, model } from 'mongoose';
import { PaymentStatus } from '@shared/types';
import type { Stripe } from 'stripe'; // ^12.0.0

/**
 * Interface representing a subscription document with enhanced status tracking
 */
export interface Subscription extends Document {
  id: string;
  userId: string;
  coachId: string;
  planId: string;
  status: PaymentStatus;
  amount: number;
  currency: string;
  interval: string;
  intervalCount: number;
  stripeSubscriptionId: string;
  stripeCustomerId: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  canceledAt: Date;
  lastPaymentError: string;
  retryCount: number;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;

  // Instance methods
  isActive(): boolean;
  willRenew(): boolean;
  validateStatusTransition(newStatus: PaymentStatus): boolean;
}

/**
 * Mongoose schema definition for subscription management
 */
@Schema({ timestamps: true, collection: 'subscriptions' })
class SubscriptionSchema {
  @Schema({ required: true, index: true })
  userId: string;

  @Schema({ required: true, index: true })
  coachId: string;

  @Schema({ required: true })
  planId: string;

  @Schema({
    required: true,
    enum: Object.values(PaymentStatus),
    default: PaymentStatus.PENDING,
    index: true
  })
  status: PaymentStatus;

  @Schema({ required: true, min: 0 })
  amount: number;

  @Schema({ required: true, default: 'USD' })
  currency: string;

  @Schema({ required: true, enum: ['month', 'year'] })
  interval: string;

  @Schema({ required: true, min: 1, default: 1 })
  intervalCount: number;

  @Schema({ required: true, unique: true, sparse: true })
  stripeSubscriptionId: string;

  @Schema({ required: true, index: true })
  stripeCustomerId: string;

  @Schema({ required: true })
  currentPeriodStart: Date;

  @Schema({ required: true })
  currentPeriodEnd: Date;

  @Schema({ default: false })
  cancelAtPeriodEnd: boolean;

  @Schema()
  canceledAt: Date;

  @Schema()
  lastPaymentError: string;

  @Schema({ default: 0, min: 0, max: 3 })
  retryCount: number;

  @Schema({ type: Object, default: {} })
  metadata: Record<string, any>;

  /**
   * Checks if subscription is currently active based on status and period dates
   */
  isActive(): boolean {
    const now = new Date();
    return (
      this.status === PaymentStatus.COMPLETED &&
      now >= this.currentPeriodStart &&
      now <= this.currentPeriodEnd &&
      !this.canceledAt
    );
  }

  /**
   * Determines if subscription will automatically renew at period end
   */
  willRenew(): boolean {
    return (
      this.isActive() &&
      !this.cancelAtPeriodEnd &&
      !this.canceledAt
    );
  }

  /**
   * Validates if a status transition is allowed based on current status
   */
  validateStatusTransition(newStatus: PaymentStatus): boolean {
    const allowedTransitions: Record<PaymentStatus, PaymentStatus[]> = {
      [PaymentStatus.PENDING]: [PaymentStatus.PROCESSING, PaymentStatus.FAILED, PaymentStatus.CANCELLED],
      [PaymentStatus.PROCESSING]: [PaymentStatus.COMPLETED, PaymentStatus.FAILED],
      [PaymentStatus.COMPLETED]: [PaymentStatus.CANCELLED, PaymentStatus.DISPUTED],
      [PaymentStatus.FAILED]: [PaymentStatus.PROCESSING],
      [PaymentStatus.DISPUTED]: [PaymentStatus.COMPLETED, PaymentStatus.REFUNDED],
      [PaymentStatus.CANCELLED]: [],
      [PaymentStatus.REFUNDED]: []
    };

    // Increment retry count for failed payments
    if (newStatus === PaymentStatus.FAILED) {
      this.retryCount += 1;
    }

    return allowedTransitions[this.status]?.includes(newStatus) || false;
  }
}

// Create and export the Mongoose model
const SubscriptionModel = model<Subscription>('Subscription', new Schema(SubscriptionSchema));
export default SubscriptionModel;