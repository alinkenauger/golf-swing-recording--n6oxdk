import { injectable } from 'inversify'; // ^6.1.1
import Stripe from 'stripe'; // ^12.0.0
import { config } from '../config';
import { ApiError } from '../../../shared/errors/api.error';
import { Logger } from '../../../shared/utils/logger';
import { PAYMENT_STATUS } from '../../../shared/constants';

// Types for payment processing
interface PaymentIntent {
  amount: number;
  currency: string;
  customerId?: string;
  description?: string;
  metadata?: Record<string, string>;
}

interface PaymentWebhookEvent {
  type: string;
  data: Record<string, any>;
  status: string;
}

/**
 * Service class for handling Stripe payment processing with enhanced security and monitoring
 * @version 1.0.0
 */
@injectable()
export class StripeService {
  private readonly stripeClient: Stripe;
  private readonly webhookSecret: string;
  private readonly logger: Logger;
  private readonly retryAttempts: Map<string, number>;
  private readonly maxRetries: number = 3;

  constructor() {
    // Initialize Stripe client with configuration
    this.stripeClient = new Stripe(config.stripe.secretKey, {
      apiVersion: config.stripe.apiVersion,
      timeout: config.stripe.timeout,
    });

    this.webhookSecret = config.stripe.webhookSecret;
    this.logger = new Logger('StripeService');
    this.retryAttempts = new Map();

    // Validate required configuration
    this.validateConfig();
  }

  /**
   * Creates a new payment intent with idempotency and retry handling
   * @param paymentData - Payment intent data
   * @param idempotencyKey - Unique key for idempotent requests
   */
  public async createPaymentIntent(
    paymentData: PaymentIntent,
    idempotencyKey: string
  ): Promise<Stripe.PaymentIntent> {
    try {
      // Validate payment data
      this.validatePaymentData(paymentData);

      // Create payment intent with idempotency
      const paymentIntent = await this.stripeClient.paymentIntents.create(
        {
          amount: paymentData.amount,
          currency: paymentData.currency,
          customer: paymentData.customerId,
          description: paymentData.description,
          metadata: {
            ...paymentData.metadata,
            status: PAYMENT_STATUS.PROCESSING,
          },
        },
        {
          idempotencyKey: `${config.stripe.idempotencyKeyPrefix}_${idempotencyKey}`,
        }
      );

      this.logger.info('Payment intent created', {
        paymentIntentId: paymentIntent.id,
        amount: paymentData.amount,
        currency: paymentData.currency,
      });

      return paymentIntent;
    } catch (error) {
      // Handle Stripe errors with retry logic
      if (this.shouldRetry(error, idempotencyKey)) {
        return this.retryPaymentIntent(paymentData, idempotencyKey);
      }

      this.handleStripeError(error);
    }
  }

  /**
   * Processes incoming Stripe webhook events with enhanced validation
   * @param signature - Webhook signature from Stripe
   * @param rawBody - Raw webhook event body
   */
  public async handleWebhook(
    signature: string,
    rawBody: Buffer
  ): Promise<PaymentWebhookEvent> {
    try {
      // Verify webhook signature
      const event = this.stripeClient.webhooks.constructEvent(
        rawBody,
        signature,
        this.webhookSecret
      );

      // Process webhook event based on type
      const result = await this.processWebhookEvent(event);

      this.logger.info('Webhook processed successfully', {
        eventType: event.type,
        eventId: event.id,
      });

      return result;
    } catch (error) {
      this.logger.error('Webhook processing failed', error);
      throw ApiError.badRequest('Invalid webhook payload');
    }
  }

  /**
   * Validates payment data completeness
   */
  private validatePaymentData(data: PaymentIntent): void {
    if (!data.amount || !data.currency) {
      throw ApiError.badRequest('Invalid payment data');
    }

    if (data.amount <= 0) {
      throw ApiError.badRequest('Invalid payment amount');
    }
  }

  /**
   * Validates required Stripe configuration
   */
  private validateConfig(): void {
    if (!config.stripe.secretKey || !config.stripe.webhookSecret) {
      throw ApiError.internal('Invalid Stripe configuration');
    }
  }

  /**
   * Processes webhook events based on type
   */
  private async processWebhookEvent(
    event: Stripe.Event
  ): Promise<PaymentWebhookEvent> {
    let status: string;

    switch (event.type) {
      case 'payment_intent.succeeded':
        status = PAYMENT_STATUS.COMPLETED;
        break;
      case 'payment_intent.payment_failed':
        status = PAYMENT_STATUS.FAILED;
        break;
      case 'charge.dispute.created':
        status = PAYMENT_STATUS.DISPUTED;
        break;
      case 'charge.refunded':
        status = PAYMENT_STATUS.REFUNDED;
        break;
      default:
        status = PAYMENT_STATUS.PROCESSING;
    }

    return {
      type: event.type,
      data: event.data.object,
      status,
    };
  }

  /**
   * Determines if payment operation should be retried
   */
  private shouldRetry(error: any, idempotencyKey: string): boolean {
    const attempts = this.retryAttempts.get(idempotencyKey) || 0;
    const isRetryableError = error.type === 'StripeConnectionError';

    return isRetryableError && attempts < this.maxRetries;
  }

  /**
   * Retries payment intent creation with exponential backoff
   */
  private async retryPaymentIntent(
    paymentData: PaymentIntent,
    idempotencyKey: string
  ): Promise<Stripe.PaymentIntent> {
    const attempts = (this.retryAttempts.get(idempotencyKey) || 0) + 1;
    this.retryAttempts.set(idempotencyKey, attempts);

    const backoffMs = Math.pow(2, attempts) * 1000;
    await new Promise(resolve => setTimeout(resolve, backoffMs));

    return this.createPaymentIntent(paymentData, idempotencyKey);
  }

  /**
   * Handles Stripe errors with proper error mapping
   */
  private handleStripeError(error: any): never {
    this.logger.error('Stripe operation failed', error);

    if (error.type === 'StripeCardError') {
      throw ApiError.badRequest('Payment card was declined');
    }

    if (error.type === 'StripeInvalidRequestError') {
      throw ApiError.badRequest('Invalid payment request');
    }

    if (error.type === 'StripeAuthenticationError') {
      throw ApiError.unauthorized('Invalid Stripe credentials');
    }

    throw ApiError.internal('Payment processing failed');
  }
}