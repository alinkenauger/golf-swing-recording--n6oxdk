import { jest } from '@jest/globals'; // ^29.0.0
import { PaymentService } from '../src/services/payment.service';
import { PaymentRepository } from '../src/repositories/payment.repository';
import { StripeService } from '../src/services/stripe.service';
import { Logger } from '@shared/logger'; // ^1.0.0
import { ApiError } from '@shared/errors'; // ^1.0.0
import { PAYMENT_STATUS } from '@shared/constants';
import { PaymentMethod } from '../src/types';

// Mock implementations
jest.mock('../src/repositories/payment.repository');
jest.mock('../src/services/stripe.service');
jest.mock('@shared/logger');

describe('PaymentService', () => {
  let paymentService: PaymentService;
  let paymentRepository: jest.Mocked<PaymentRepository>;
  let stripeService: jest.Mocked<StripeService>;
  let logger: jest.Mocked<Logger>;

  const mockPayment = {
    id: 'payment_123',
    userId: 'user_123',
    coachId: 'coach_123',
    amount: 100.00,
    currency: 'USD',
    status: PAYMENT_STATUS.PROCESSING,
    paymentMethod: PaymentMethod.CREDIT_CARD,
    stripePaymentIntentId: 'pi_123',
    stripeCustomerId: 'cus_123',
    description: 'Test payment',
    metadata: {},
    processingFee: 3.20,
    platformFee: 5.00,
    netAmount: 91.80,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const mockStripePaymentIntent = {
    id: 'pi_123',
    amount: 10000,
    currency: 'usd',
    status: 'succeeded',
    client_secret: 'secret_123'
  };

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Initialize mocked dependencies
    paymentRepository = {
      createPayment: jest.fn(),
      getPaymentById: jest.fn(),
      updatePaymentStatus: jest.fn(),
      getPaymentAnalytics: jest.fn(),
      processRefund: jest.fn()
    } as any;

    stripeService = {
      createPaymentIntent: jest.fn(),
      handleWebhook: jest.fn(),
      verifyWebhookSignature: jest.fn()
    } as any;

    logger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn()
    } as any;

    // Initialize PaymentService with mocked dependencies
    paymentService = new PaymentService(
      paymentRepository,
      stripeService,
      logger
    );
  });

  describe('processPayment', () => {
    const validPaymentData = {
      userId: 'user_123',
      amount: 100.00,
      currency: 'USD',
      paymentMethod: PaymentMethod.CREDIT_CARD,
      stripeCustomerId: 'cus_123',
      description: 'Test payment'
    };

    const idempotencyKey = 'idem_123';

    it('should successfully process a valid payment', async () => {
      // Setup mocks
      stripeService.createPaymentIntent.mockResolvedValue(mockStripePaymentIntent);
      paymentRepository.createPayment.mockResolvedValue(mockPayment);

      // Execute test
      const result = await paymentService.processPayment(validPaymentData, idempotencyKey);

      // Verify results
      expect(result).toEqual(mockPayment);
      expect(stripeService.createPaymentIntent).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: validPaymentData.amount,
          currency: validPaymentData.currency,
          customerId: validPaymentData.stripeCustomerId
        }),
        idempotencyKey
      );
      expect(paymentRepository.createPayment).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        'Payment processed successfully',
        expect.any(Object)
      );
    });

    it('should handle invalid payment data', async () => {
      const invalidData = { ...validPaymentData, amount: 0 };

      await expect(
        paymentService.processPayment(invalidData, idempotencyKey)
      ).rejects.toThrow('Invalid payment amount');

      expect(stripeService.createPaymentIntent).not.toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalled();
    });

    it('should handle Stripe errors with retry mechanism', async () => {
      stripeService.createPaymentIntent
        .mockRejectedValueOnce(new Error('Stripe connection error'))
        .mockResolvedValueOnce(mockStripePaymentIntent);

      const result = await paymentService.processPayment(validPaymentData, idempotencyKey);

      expect(result).toBeDefined();
      expect(stripeService.createPaymentIntent).toHaveBeenCalledTimes(2);
      expect(logger.warn).toHaveBeenCalled();
    });
  });

  describe('handlePaymentWebhook', () => {
    const mockSignature = 'webhook_signature';
    const mockRawBody = Buffer.from('webhook_body');
    const mockWebhookEvent = {
      type: 'payment_intent.succeeded',
      data: {
        payment_intent: {
          id: 'pi_123',
          status: PAYMENT_STATUS.COMPLETED
        }
      }
    };

    it('should successfully process webhook event', async () => {
      stripeService.handleWebhook.mockResolvedValue(mockWebhookEvent);
      paymentRepository.updatePaymentStatus.mockResolvedValue(undefined);

      await paymentService.handlePaymentWebhook(mockSignature, mockRawBody);

      expect(stripeService.handleWebhook).toHaveBeenCalledWith(
        mockSignature,
        mockRawBody
      );
      expect(paymentRepository.updatePaymentStatus).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        'Processing webhook event',
        expect.any(Object)
      );
    });

    it('should handle invalid webhook signatures', async () => {
      stripeService.handleWebhook.mockRejectedValue(
        new Error('Invalid webhook signature')
      );

      await expect(
        paymentService.handlePaymentWebhook(mockSignature, mockRawBody)
      ).rejects.toThrow('Webhook processing failed');

      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('getPaymentAnalytics', () => {
    const startDate = new Date('2023-01-01');
    const endDate = new Date('2023-12-31');
    const mockAnalytics = {
      totalTransactions: 100,
      totalAmount: 10000,
      averageAmount: 100,
      statusBreakdown: {
        [PAYMENT_STATUS.COMPLETED]: 80,
        [PAYMENT_STATUS.FAILED]: 20
      },
      dailyTotals: []
    };

    it('should generate payment analytics successfully', async () => {
      paymentRepository.getPaymentAnalytics.mockResolvedValue(mockAnalytics);

      const result = await paymentService.getPaymentAnalytics(startDate, endDate);

      expect(result).toEqual(mockAnalytics);
      expect(paymentRepository.getPaymentAnalytics).toHaveBeenCalledWith(
        startDate,
        endDate,
        expect.any(Object)
      );
      expect(logger.info).toHaveBeenCalledWith(
        'Analytics generated successfully',
        expect.any(Object)
      );
    });

    it('should handle invalid date ranges', async () => {
      const invalidEndDate = new Date('2022-12-31');

      await expect(
        paymentService.getPaymentAnalytics(startDate, invalidEndDate)
      ).rejects.toThrow('Invalid date range');

      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('validatePaymentSecurity', () => {
    it('should validate payment data security requirements', () => {
      const securePayment = {
        ...mockPayment,
        ipAddress: '127.0.0.1',
        userAgent: 'test-agent'
      };

      expect(() => 
        paymentService['validatePaymentData'](securePayment)
      ).not.toThrow();
    });

    it('should reject payments exceeding maximum limits', () => {
      const largePayment = {
        ...mockPayment,
        amount: 1000000
      };

      expect(() =>
        paymentService['validatePaymentData'](largePayment)
      ).toThrow('Payment amount exceeds maximum limit');
    });
  });

  describe('error handling and monitoring', () => {
    it('should log and transform payment errors appropriately', () => {
      const stripeError = {
        type: 'StripeCardError',
        message: 'Card declined'
      };

      const error = paymentService['handlePaymentError'](stripeError);

      expect(error).toBeInstanceOf(ApiError);
      expect(error.message).toBe('Payment processing failed');
      expect(logger.error).toHaveBeenCalled();
    });

    it('should track payment processing performance', async () => {
      const startTime = Date.now();
      
      await paymentService.processPayment(mockPayment, 'idem_123');
      
      const processingTime = Date.now() - startTime;
      expect(processingTime).toBeLessThan(1000); // Processing should be under 1 second
    });
  });
});