import { Schema, Document, model } from 'mongoose'; // ^7.0.0
import { PaymentStatus } from '../../../shared/types';
import { PaymentMethod } from '../types';

/**
 * Interface representing a payment document in MongoDB
 */
export interface Payment extends Document {
  id: string;
  userId: string;
  coachId: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  paymentMethod: PaymentMethod;
  stripePaymentIntentId: string;
  stripeCustomerId: string;
  subscriptionId?: string;
  description: string;
  metadata: Record<string, any>;
  refundedAmount: number;
  refundReason?: string;
  processingFee: number;
  platformFee: number;
  netAmount: number;
  payoutStatus: string;
  payoutDate?: Date;
  lastProcessedAt: Date;
  errorDetails?: string;
  ipAddress: string;
  userAgent: string;
  createdAt: Date;
  updatedAt: Date;
  
  toJSON(): Record<string, any>;
  isRefundable(): boolean;
  calculateFees(amount: number, paymentMethod: PaymentMethod): { 
    processingFee: number;
    platformFee: number;
    netAmount: number;
  };
}

/**
 * Mongoose schema definition for payment transactions
 */
@Schema({ 
  timestamps: true, 
  collection: 'payments',
  autoIndex: true
})
export class PaymentSchema {
  @Schema({ required: true, index: true })
  userId: string;

  @Schema({ required: true, index: true })
  coachId: string;

  @Schema({ required: true, min: 0 })
  amount: number;

  @Schema({ required: true, default: 'USD' })
  currency: string;

  @Schema({ 
    required: true, 
    enum: Object.values(PaymentStatus),
    index: true
  })
  status: PaymentStatus;

  @Schema({ 
    required: true,
    enum: Object.values(PaymentMethod)
  })
  paymentMethod: PaymentMethod;

  @Schema({ required: true, unique: true, index: true })
  stripePaymentIntentId: string;

  @Schema({ required: true, index: true })
  stripeCustomerId: string;

  @Schema({ index: true })
  subscriptionId?: string;

  @Schema({ required: true })
  description: string;

  @Schema({ type: Object, default: {} })
  metadata: Record<string, any>;

  @Schema({ default: 0, min: 0 })
  refundedAmount: number;

  @Schema()
  refundReason?: string;

  @Schema({ required: true, min: 0 })
  processingFee: number;

  @Schema({ required: true, min: 0 })
  platformFee: number;

  @Schema({ required: true })
  netAmount: number;

  @Schema({ 
    required: true,
    enum: ['pending', 'processed', 'failed'],
    default: 'pending'
  })
  payoutStatus: string;

  @Schema()
  payoutDate?: Date;

  @Schema({ required: true, default: Date.now })
  lastProcessedAt: Date;

  @Schema()
  errorDetails?: string;

  @Schema({ required: true })
  ipAddress: string;

  @Schema({ required: true })
  userAgent: string;

  /**
   * Transform payment document to JSON, handling sensitive data
   */
  toJSON() {
    const obj = this.toObject();
    
    // Remove MongoDB-specific fields
    delete obj._id;
    delete obj.__v;
    
    // Mask sensitive data
    obj.stripeCustomerId = `${obj.stripeCustomerId.slice(0, 4)}...${obj.stripeCustomerId.slice(-4)}`;
    
    // Format monetary values
    obj.amount = Number(obj.amount.toFixed(2));
    obj.refundedAmount = Number(obj.refundedAmount.toFixed(2));
    obj.processingFee = Number(obj.processingFee.toFixed(2));
    obj.platformFee = Number(obj.platformFee.toFixed(2));
    obj.netAmount = Number(obj.netAmount.toFixed(2));
    
    // Add computed fields
    obj.totalAmount = obj.amount + obj.processingFee + obj.platformFee;
    obj.refundableAmount = Math.max(0, obj.amount - obj.refundedAmount);
    
    return obj;
  }

  /**
   * Check if payment is eligible for refund
   */
  isRefundable(): boolean {
    // Must be completed payment
    if (this.status !== PaymentStatus.COMPLETED) {
      return false;
    }

    // Check if within 30-day refund window
    const refundWindow = new Date();
    refundWindow.setDate(refundWindow.getDate() - 30);
    if (this.createdAt < refundWindow) {
      return false;
    }

    // Must have remaining refundable amount
    if (this.amount <= this.refundedAmount) {
      return false;
    }

    // Validate payment method supports refunds
    const refundablePaymentMethods = [
      PaymentMethod.CREDIT_CARD,
      PaymentMethod.DEBIT_CARD
    ];
    if (!refundablePaymentMethods.includes(this.paymentMethod)) {
      return false;
    }

    return true;
  }

  /**
   * Calculate processing and platform fees for a payment
   */
  calculateFees(amount: number, paymentMethod: PaymentMethod) {
    // Stripe processing fee: 2.9% + $0.30
    const stripePercentage = 0.029;
    const stripeFixed = 0.30;
    const processingFee = (amount * stripePercentage) + stripeFixed;

    // Platform fee: 5% of transaction
    const platformPercentage = 0.05;
    const platformFee = amount * platformPercentage;

    // Calculate net amount after fees
    const netAmount = amount - processingFee - platformFee;

    return {
      processingFee: Number(processingFee.toFixed(2)),
      platformFee: Number(platformFee.toFixed(2)),
      netAmount: Number(netAmount.toFixed(2))
    };
  }
}

// Create and export the Mongoose model
const PaymentModel = model<Payment>('Payment', PaymentSchema);
export default PaymentModel;