import { injectable } from 'inversify';
import { Stripe, loadStripe } from '@stripe/stripe-js'; // v2.1.0
import { retry } from 'retry-ts'; // v0.1.0
import { Logger } from 'winston'; // v3.8.0
import { Payment, PaymentMethod, PaymentProcessingResult, RefundRequest, StripePaymentIntent } from '../types/payment';
import { ApiError, HttpStatusCode } from '../types/common';

/**
 * Configuration interface for payment service retry mechanism
 */
interface RetryConfig {
  retries: number;
  factor: number;
  minTimeout: number;
  maxTimeout: number;
}

/**
 * Service class for handling secure payment processing, subscription management,
 * and transaction operations with comprehensive error handling and logging
 */
@injectable()
export class PaymentService {
  private readonly stripe: Stripe;
  private readonly retryOperation: RetryConfig;
  private readonly STRIPE_WEBHOOK_SECRET: string;

  constructor(
    private readonly apiClient: any,
    private readonly logger: Logger,
    retryConfig: RetryConfig
  ) {
    this.STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
    this.stripe = loadStripe(process.env.STRIPE_PUBLIC_KEY || '') as unknown as Stripe;
    this.retryOperation = {
      retries: retryConfig.retries || 3,
      factor: retryConfig.factor || 2,
      minTimeout: retryConfig.minTimeout || 1000,
      maxTimeout: retryConfig.maxTimeout || 5000
    };
  }

  /**
   * Process a payment with comprehensive error handling and retry mechanism
   * @param paymentData Payment details including amount and currency
   * @param options Additional payment processing options
   * @returns Processed payment details
   */
  public async processPayment(
    paymentData: Partial<Payment>,
    options: { idempotencyKey?: string } = {}
  ): Promise<PaymentProcessingResult> {
    try {
      this.logger.info('Initiating payment processing', { paymentData });

      // Validate payment data
      this.validatePaymentData(paymentData);

      // Create payment intent with retry mechanism
      const paymentIntent = await retry(async () => {
        return await this.stripe.paymentIntents.create({
          amount: paymentData.amount! * 100, // Convert to cents
          currency: paymentData.currency || 'USD',
          payment_method: paymentData.paymentMethod as PaymentMethod,
          customer: paymentData.stripeCustomerId,
          metadata: {
            userId: paymentData.userId!,
            coachId: paymentData.coachId!
          }
        }, {
          idempotencyKey: options.idempotencyKey
        });
      }, this.retryOperation);

      // Log successful payment intent creation
      this.logger.info('Payment intent created successfully', {
        paymentIntentId: paymentIntent.id
      });

      return {
        success: true,
        paymentIntentId: paymentIntent.id,
        clientSecret: paymentIntent.client_secret
      };

    } catch (error) {
      this.logger.error('Payment processing failed', { error });
      return this.handlePaymentError(error);
    }
  }

  /**
   * Handle Stripe webhook events for payment status updates
   * @param event Webhook event from Stripe
   * @param signature Webhook signature for verification
   */
  public async handleWebhook(
    event: any,
    signature: string
  ): Promise<void> {
    try {
      // Verify webhook signature
      const stripeEvent = this.stripe.webhooks.constructEvent(
        event,
        signature,
        this.STRIPE_WEBHOOK_SECRET
      );

      // Process different webhook events
      switch (stripeEvent.type) {
        case 'payment_intent.succeeded':
          await this.handlePaymentSuccess(stripeEvent.data.object as StripePaymentIntent);
          break;
        case 'payment_intent.payment_failed':
          await this.handlePaymentFailure(stripeEvent.data.object as StripePaymentIntent);
          break;
        default:
          this.logger.info(`Unhandled webhook event: ${stripeEvent.type}`);
      }

    } catch (error) {
      this.logger.error('Webhook processing failed', { error });
      throw new Error('Webhook processing failed');
    }
  }

  /**
   * Process refund request with validation and error handling
   * @param refundRequest Refund request details
   * @returns Refund processing result
   */
  public async processRefund(
    refundRequest: RefundRequest
  ): Promise<PaymentProcessingResult> {
    try {
      this.logger.info('Processing refund request', { refundRequest });

      const refund = await retry(async () => {
        return await this.stripe.refunds.create({
          payment_intent: refundRequest.paymentId,
          amount: refundRequest.amount,
          reason: refundRequest.reason,
          metadata: refundRequest.metadata
        });
      }, this.retryOperation);

      this.logger.info('Refund processed successfully', { refundId: refund.id });

      return {
        success: true,
        paymentIntentId: refund.payment_intent as string
      };

    } catch (error) {
      this.logger.error('Refund processing failed', { error });
      return this.handlePaymentError(error);
    }
  }

  /**
   * Validate payment data before processing
   * @param paymentData Payment details to validate
   * @throws ApiError if validation fails
   */
  private validatePaymentData(paymentData: Partial<Payment>): void {
    if (!paymentData.amount || paymentData.amount <= 0) {
      throw new ApiError('Invalid payment amount', HttpStatusCode.BAD_REQUEST);
    }
    if (!paymentData.userId || !paymentData.coachId) {
      throw new ApiError('Missing user or coach ID', HttpStatusCode.BAD_REQUEST);
    }
    if (!paymentData.paymentMethod) {
      throw new ApiError('Missing payment method', HttpStatusCode.BAD_REQUEST);
    }
  }

  /**
   * Handle successful payment processing
   * @param paymentIntent Successful payment intent from Stripe
   */
  private async handlePaymentSuccess(paymentIntent: StripePaymentIntent): Promise<void> {
    try {
      await this.apiClient.post('/api/payments/confirm', {
        paymentIntentId: paymentIntent.id,
        status: 'SUCCESS',
        metadata: paymentIntent.metadata
      });

      this.logger.info('Payment success handled', {
        paymentIntentId: paymentIntent.id
      });
    } catch (error) {
      this.logger.error('Failed to handle payment success', { error });
      throw error;
    }
  }

  /**
   * Handle failed payment processing
   * @param paymentIntent Failed payment intent from Stripe
   */
  private async handlePaymentFailure(paymentIntent: StripePaymentIntent): Promise<void> {
    try {
      await this.apiClient.post('/api/payments/confirm', {
        paymentIntentId: paymentIntent.id,
        status: 'FAILED',
        metadata: paymentIntent.metadata
      });

      this.logger.error('Payment failure handled', {
        paymentIntentId: paymentIntent.id,
        error: paymentIntent.last_payment_error
      });
    } catch (error) {
      this.logger.error('Failed to handle payment failure', { error });
      throw error;
    }
  }

  /**
   * Handle and format payment processing errors
   * @param error Error from payment processing
   * @returns Formatted error response
   */
  private handlePaymentError(error: any): PaymentProcessingResult {
    return {
      success: false,
      error: {
        code: error.code || 'PAYMENT_PROCESSING_ERROR',
        message: error.message || 'An error occurred during payment processing'
      }
    };
  }
}