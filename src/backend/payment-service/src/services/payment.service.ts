import { injectable } from 'inversify'; // ^6.0.1
import { Logger } from 'winston'; // ^3.8.0
import { retry } from 'retry-ts'; // ^0.1.3

import { Payment } from '../models/payment.model';
import { PaymentRepository } from '../repositories/payment.repository';
import { StripeService } from './stripe.service';
import { ApiError } from '../../../shared/errors/api.error';
import { PAYMENT_STATUS } from '../../../shared/constants';

interface AnalyticsOptions {
  groupBy?: string[];
  includeRefunds?: boolean;
  detailed?: boolean;
}

interface AnalyticsReport {
  totalTransactions: number;
  totalAmount: number;
  averageAmount: number;
  statusBreakdown: Record<string, number>;
  dailyTotals: Array<{ date: string; amount: number }>;
  refundMetrics?: {
    totalRefunds: number;
    refundAmount: number;
    averageRefundTime: number;
  };
}

@injectable()
export class PaymentService {
  private readonly retryConfig = {
    maxRetries: 3,
    backoffMs: 1000,
    timeoutMs: 30000,
  };

  constructor(
    private readonly paymentRepository: PaymentRepository,
    private readonly stripeService: StripeService,
    private readonly logger: Logger
  ) {
    this.validateDependencies();
  }

  /**
   * Process a new payment with comprehensive security and monitoring
   */
  public async processPayment(
    paymentData: Partial<Payment>,
    idempotencyKey: string
  ): Promise<Payment> {
    try {
      this.logger.info('Processing payment request', {
        amount: paymentData.amount,
        userId: paymentData.userId,
        idempotencyKey,
      });

      // Validate payment data
      this.validatePaymentData(paymentData);

      // Calculate fees and net amount
      const { processingFee, platformFee, netAmount } = 
        await this.calculateTransactionFees(paymentData.amount!, paymentData.paymentMethod!);

      // Create Stripe payment intent with retry mechanism
      const paymentIntent = await retry(() => 
        this.stripeService.createPaymentIntent(
          {
            amount: paymentData.amount!,
            currency: paymentData.currency || 'USD',
            customerId: paymentData.stripeCustomerId,
            description: paymentData.description,
            metadata: paymentData.metadata,
          },
          idempotencyKey
        ),
        this.retryConfig
      );

      // Create payment record with enhanced tracking
      const payment = await this.paymentRepository.createPayment(
        {
          ...paymentData,
          stripePaymentIntentId: paymentIntent.id,
          status: PAYMENT_STATUS.PROCESSING,
          processingFee,
          platformFee,
          netAmount,
          metadata: {
            ...paymentData.metadata,
            idempotencyKey,
            paymentIntentId: paymentIntent.id,
          },
        },
        paymentData.userId!
      );

      this.logger.info('Payment processed successfully', {
        paymentId: payment.id,
        status: payment.status,
        amount: payment.amount,
      });

      return payment;
    } catch (error) {
      this.logger.error('Payment processing failed', {
        error: error.message,
        paymentData: { ...paymentData, stripeCustomerId: '[REDACTED]' },
      });
      throw this.handlePaymentError(error);
    }
  }

  /**
   * Handle Stripe webhook events with enhanced security validation
   */
  public async handlePaymentWebhook(
    signature: string,
    rawBody: Buffer
  ): Promise<void> {
    try {
      const event = await this.stripeService.handleWebhook(signature, rawBody);

      this.logger.info('Processing webhook event', {
        type: event.type,
        status: event.status,
      });

      // Update payment status based on webhook event
      if (event.data.payment_intent) {
        await this.updatePaymentStatus(
          event.data.payment_intent.id,
          event.status,
          event.data
        );
      }
    } catch (error) {
      this.logger.error('Webhook processing failed', {
        error: error.message,
        signature: '[REDACTED]',
      });
      throw new ApiError('Webhook processing failed', 400);
    }
  }

  /**
   * Generate comprehensive payment analytics with security filtering
   */
  public async getPaymentAnalytics(
    startDate: Date,
    endDate: Date,
    options: AnalyticsOptions = {}
  ): Promise<AnalyticsReport> {
    try {
      this.validateDateRange(startDate, endDate);

      const analytics = await this.paymentRepository.getPaymentAnalytics(
        startDate,
        endDate,
        {
          status: Object.values(PAYMENT_STATUS),
          ...options,
        }
      );

      // Add refund metrics if requested
      if (options.includeRefunds) {
        analytics.refundMetrics = await this.calculateRefundMetrics(
          startDate,
          endDate
        );
      }

      this.logger.info('Analytics generated successfully', {
        startDate,
        endDate,
        options,
      });

      return analytics;
    } catch (error) {
      this.logger.error('Analytics generation failed', {
        error: error.message,
        startDate,
        endDate,
      });
      throw new ApiError('Failed to generate analytics', 500);
    }
  }

  /**
   * Validate payment data completeness and constraints
   */
  private validatePaymentData(data: Partial<Payment>): void {
    if (!data.amount || data.amount <= 0) {
      throw new ApiError('Invalid payment amount', 400);
    }

    if (!data.userId || !data.paymentMethod) {
      throw new ApiError('Missing required payment fields', 400);
    }

    if (data.amount > 999999) {
      throw new ApiError('Payment amount exceeds maximum limit', 400);
    }
  }

  /**
   * Calculate transaction fees and net amount
   */
  private async calculateTransactionFees(
    amount: number,
    paymentMethod: string
  ): Promise<{ processingFee: number; platformFee: number; netAmount: number }> {
    const processingFee = amount * 0.029 + 0.30; // Stripe fee
    const platformFee = amount * 0.05; // Platform fee
    const netAmount = amount - processingFee - platformFee;

    return {
      processingFee: Number(processingFee.toFixed(2)),
      platformFee: Number(platformFee.toFixed(2)),
      netAmount: Number(netAmount.toFixed(2)),
    };
  }

  /**
   * Update payment status with audit trail
   */
  private async updatePaymentStatus(
    paymentIntentId: string,
    status: string,
    eventData: Record<string, any>
  ): Promise<void> {
    const payment = await this.paymentRepository.getPaymentByIntentId(
      paymentIntentId
    );

    if (!payment) {
      throw new ApiError('Payment not found', 404);
    }

    await this.paymentRepository.updatePaymentStatus(payment.id, status, {
      lastProcessedAt: new Date(),
      metadata: {
        ...payment.metadata,
        lastEventType: eventData.type,
        lastEventTimestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * Calculate refund-specific metrics
   */
  private async calculateRefundMetrics(
    startDate: Date,
    endDate: Date
  ): Promise<{
    totalRefunds: number;
    refundAmount: number;
    averageRefundTime: number;
  }> {
    const refunds = await this.paymentRepository.getRefunds(startDate, endDate);

    return {
      totalRefunds: refunds.length,
      refundAmount: refunds.reduce((sum, r) => sum + r.amount, 0),
      averageRefundTime: this.calculateAverageRefundTime(refunds),
    };
  }

  /**
   * Calculate average time to process refunds
   */
  private calculateAverageRefundTime(refunds: any[]): number {
    if (!refunds.length) return 0;

    const totalTime = refunds.reduce((sum, refund) => {
      const requestTime = new Date(refund.requestedAt).getTime();
      const processTime = new Date(refund.processedAt).getTime();
      return sum + (processTime - requestTime);
    }, 0);

    return Math.round(totalTime / refunds.length / (1000 * 60)); // In minutes
  }

  /**
   * Validate date range for analytics
   */
  private validateDateRange(startDate: Date, endDate: Date): void {
    if (startDate >= endDate) {
      throw new ApiError('Invalid date range', 400);
    }

    const maxRange = 90 * 24 * 60 * 60 * 1000; // 90 days in milliseconds
    if (endDate.getTime() - startDate.getTime() > maxRange) {
      throw new ApiError('Date range exceeds maximum allowed (90 days)', 400);
    }
  }

  /**
   * Validate service dependencies
   */
  private validateDependencies(): void {
    if (!this.paymentRepository || !this.stripeService || !this.logger) {
      throw new Error('Missing required dependencies');
    }
  }

  /**
   * Handle and transform payment-related errors
   */
  private handlePaymentError(error: any): Error {
    if (error instanceof ApiError) {
      return error;
    }

    if (error.type?.startsWith('Stripe')) {
      return new ApiError(
        'Payment processing failed',
        400,
        { originalError: error.message }
      );
    }

    return new ApiError('Internal payment error', 500);
  }
}