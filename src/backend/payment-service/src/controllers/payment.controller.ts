import { injectable } from 'inversify'; // ^6.0.1
import { controller, httpPost, httpGet } from 'inversify-express-utils'; // ^6.4.3
import { Request, Response } from 'express'; // ^4.18.2
import { rateLimit } from 'express-rate-limit'; // ^6.7.0
import helmet from 'helmet'; // ^7.0.0
import { validate } from 'class-validator'; // ^0.14.0

import { PaymentService } from '../services/payment.service';
import { ApiError } from '../../../shared/errors/api.error';
import { Logger } from '../../../shared/utils/logger';
import { PAYMENT_STATUS } from '../../../shared/constants';

// Payment request validation schema
class PaymentRequest {
  amount!: number;
  currency!: string;
  userId!: string;
  coachId!: string;
  paymentMethod!: string;
  description?: string;
  metadata?: Record<string, any>;
}

@injectable()
@controller('/api/payments')
@rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }) // Global rate limit
export class PaymentController {
  constructor(
    private readonly paymentService: PaymentService,
    private readonly logger: Logger
  ) {
    this.logger = new Logger('PaymentController');
  }

  /**
   * Create a new payment with comprehensive validation and security
   */
  @httpPost('/create')
  @rateLimit({ windowMs: 60 * 1000, max: 5 }) // Stricter limit for payments
  async createPayment(req: Request, res: Response): Promise<Response> {
    try {
      const correlationId = req.headers['x-correlation-id'] as string;
      this.logger.setCorrelationId(correlationId);

      // Validate request body
      const paymentRequest = new PaymentRequest();
      Object.assign(paymentRequest, req.body);
      const errors = await validate(paymentRequest);

      if (errors.length > 0) {
        throw ApiError.badRequest('Invalid payment request', { errors });
      }

      // Generate idempotency key
      const idempotencyKey = `${req.body.userId}_${Date.now()}`;

      // Process payment
      const payment = await this.paymentService.processPayment(
        {
          ...req.body,
          status: PAYMENT_STATUS.PROCESSING,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        },
        idempotencyKey
      );

      this.logger.info('Payment created successfully', {
        paymentId: payment.id,
        amount: payment.amount,
        status: payment.status,
      });

      return res
        .status(201)
        .header('X-Idempotency-Key', idempotencyKey)
        .json(payment);
    } catch (error) {
      this.logger.error('Payment creation failed', error);
      throw error instanceof ApiError ? error : ApiError.internal('Payment processing failed');
    } finally {
      this.logger.clearCorrelationId();
    }
  }

  /**
   * Handle Stripe webhook events with signature verification
   */
  @httpPost('/webhook')
  async handleWebhook(req: Request, res: Response): Promise<Response> {
    try {
      const signature = req.headers['stripe-signature'] as string;
      
      if (!signature) {
        throw ApiError.badRequest('Missing Stripe signature');
      }

      const event = await this.paymentService.handlePaymentWebhook(
        signature,
        req.body
      );

      this.logger.info('Webhook processed', {
        type: event.type,
        status: event.status,
      });

      return res.status(200).json({ received: true });
    } catch (error) {
      this.logger.error('Webhook processing failed', error);
      throw error instanceof ApiError ? error : ApiError.internal('Webhook processing failed');
    }
  }

  /**
   * Get payment analytics with security filtering
   */
  @httpGet('/analytics')
  async getAnalytics(req: Request, res: Response): Promise<Response> {
    try {
      const { startDate, endDate, options } = req.query;

      if (!startDate || !endDate) {
        throw ApiError.badRequest('Missing required date parameters');
      }

      const analytics = await this.paymentService.getPaymentAnalytics(
        new Date(startDate as string),
        new Date(endDate as string),
        options as any
      );

      return res.status(200).json(analytics);
    } catch (error) {
      this.logger.error('Analytics retrieval failed', error);
      throw error instanceof ApiError ? error : ApiError.internal('Failed to retrieve analytics');
    }
  }

  /**
   * Process payment refund with validation
   */
  @httpPost('/refund')
  @rateLimit({ windowMs: 60 * 1000, max: 3 }) // Strict limit for refunds
  async processRefund(req: Request, res: Response): Promise<Response> {
    try {
      const { paymentId, amount, reason } = req.body;

      if (!paymentId || !amount) {
        throw ApiError.badRequest('Missing required refund parameters');
      }

      const refund = await this.paymentService.refundPayment(
        paymentId,
        amount,
        reason
      );

      this.logger.info('Refund processed successfully', {
        paymentId,
        refundAmount: amount,
      });

      return res.status(200).json(refund);
    } catch (error) {
      this.logger.error('Refund processing failed', error);
      throw error instanceof ApiError ? error : ApiError.internal('Refund processing failed');
    }
  }
}