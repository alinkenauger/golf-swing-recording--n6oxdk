import { Model } from 'mongoose'; // ^7.0.0
import { Logger } from 'winston'; // ^3.8.0
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

import { Payment, PaymentModel } from '../models/payment.model';
import { PaymentStatus } from '../types';

interface AnalyticsFilter {
  userId?: string;
  coachId?: string;
  status?: PaymentStatus[];
  paymentMethod?: string[];
}

interface AnalyticsResult {
  totalTransactions: number;
  totalAmount: number;
  averageAmount: number;
  statusBreakdown: Record<PaymentStatus, number>;
  dailyTotals: Array<{ date: string; amount: number }>;
}

interface AuditEntry {
  action: string;
  timestamp: Date;
  userId: string;
  ipAddress: string;
  details: Record<string, any>;
}

export class PaymentRepository {
  private readonly model: Model<Payment>;
  private readonly logger: Logger;
  private readonly encryptionKey: Buffer;
  private readonly algorithm = 'aes-256-gcm';

  constructor(encryptionKey: string) {
    this.model = PaymentModel;
    this.encryptionKey = Buffer.from(encryptionKey, 'hex');
    
    // Configure secure logger
    this.logger = new Logger({
      level: 'info',
      format: Logger.format.combine(
        Logger.format.timestamp(),
        Logger.format.json()
      ),
      transports: [
        new Logger.transports.File({ filename: 'payment-audit.log' })
      ]
    });

    // Create indexes for performance
    this.model.createIndexes().catch(err => {
      this.logger.error('Failed to create indexes', { error: err });
    });
  }

  private encryptSensitiveData(data: string): { encrypted: string; iv: string } {
    const iv = randomBytes(16);
    const cipher = createCipheriv(this.algorithm, this.encryptionKey, iv);
    const encrypted = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return {
      encrypted: Buffer.concat([encrypted, authTag]).toString('hex'),
      iv: iv.toString('hex')
    };
  }

  private decryptSensitiveData(encrypted: string, iv: string): string {
    const encryptedBuffer = Buffer.from(encrypted, 'hex');
    const ivBuffer = Buffer.from(iv, 'hex');
    const authTag = encryptedBuffer.slice(-16);
    const encryptedData = encryptedBuffer.slice(0, -16);

    const decipher = createDecipheriv(this.algorithm, this.encryptionKey, ivBuffer);
    decipher.setAuthTag(authTag);
    
    return Buffer.concat([
      decipher.update(encryptedData),
      decipher.final()
    ]).toString('utf8');
  }

  private createAuditEntry(action: string, userId: string, details: Record<string, any>): AuditEntry {
    return {
      action,
      timestamp: new Date(),
      userId,
      ipAddress: details.ipAddress || 'unknown',
      details: {
        ...details,
        sensitiveDataAccessed: false
      }
    };
  }

  async createPayment(paymentData: Partial<Payment>, userId: string): Promise<Payment> {
    try {
      // Encrypt sensitive payment data
      const { encrypted: encryptedCustomerId, iv: customerIdIv } = this.encryptSensitiveData(
        paymentData.stripeCustomerId
      );

      const payment = new this.model({
        ...paymentData,
        stripeCustomerId: encryptedCustomerId,
        metadata: {
          ...paymentData.metadata,
          customerIdIv,
          securityVersion: '1.0'
        },
        auditTrail: [
          this.createAuditEntry('payment_created', userId, {
            amount: paymentData.amount,
            paymentMethod: paymentData.paymentMethod
          })
        ]
      });

      const savedPayment = await payment.save();

      this.logger.info('Payment created successfully', {
        paymentId: savedPayment.id,
        userId,
        amount: paymentData.amount
      });

      return savedPayment;
    } catch (error) {
      this.logger.error('Failed to create payment', {
        error: error.message,
        userId,
        paymentData: { ...paymentData, stripeCustomerId: '[REDACTED]' }
      });
      throw error;
    }
  }

  async getPaymentById(paymentId: string, userId: string): Promise<Payment | null> {
    try {
      const payment = await this.model.findById(paymentId);

      if (!payment) {
        this.logger.warn('Payment not found', { paymentId, userId });
        return null;
      }

      // Verify access authorization
      if (payment.userId !== userId) {
        this.logger.warn('Unauthorized payment access attempt', { paymentId, userId });
        throw new Error('Unauthorized access to payment data');
      }

      // Decrypt sensitive data if present
      if (payment.metadata?.customerIdIv) {
        payment.stripeCustomerId = this.decryptSensitiveData(
          payment.stripeCustomerId,
          payment.metadata.customerIdIv
        );
      }

      // Add audit entry for data access
      payment.auditTrail.push(
        this.createAuditEntry('payment_accessed', userId, {
          ipAddress: 'request.ip', // Should be injected from the request context
          sensitiveDataAccessed: true
        })
      );
      await payment.save();

      return payment;
    } catch (error) {
      this.logger.error('Error retrieving payment', {
        error: error.message,
        paymentId,
        userId
      });
      throw error;
    }
  }

  async processRefund(
    paymentId: string,
    amount: number,
    reason: string,
    userId: string
  ): Promise<Payment> {
    try {
      const payment = await this.model.findById(paymentId);

      if (!payment) {
        throw new Error('Payment not found');
      }

      if (!payment.isRefundable()) {
        throw new Error('Payment is not eligible for refund');
      }

      if (amount > (payment.amount - payment.refundedAmount)) {
        throw new Error('Refund amount exceeds available balance');
      }

      // Update payment with refund details
      payment.refundedAmount += amount;
      payment.refundReason = reason;
      payment.status = payment.refundedAmount === payment.amount 
        ? PaymentStatus.REFUNDED 
        : PaymentStatus.PARTIALLY_REFUNDED;

      // Add audit entry for refund
      payment.auditTrail.push(
        this.createAuditEntry('payment_refunded', userId, {
          refundAmount: amount,
          reason,
          remainingBalance: payment.amount - payment.refundedAmount
        })
      );

      const updatedPayment = await payment.save();

      this.logger.info('Refund processed successfully', {
        paymentId,
        refundAmount: amount,
        userId
      });

      return updatedPayment;
    } catch (error) {
      this.logger.error('Failed to process refund', {
        error: error.message,
        paymentId,
        amount,
        userId
      });
      throw error;
    }
  }

  async getPaymentAnalytics(
    startDate: Date,
    endDate: Date,
    filters: AnalyticsFilter
  ): Promise<AnalyticsResult> {
    try {
      const matchStage: Record<string, any> = {
        createdAt: {
          $gte: startDate,
          $lte: endDate
        }
      };

      if (filters.userId) matchStage.userId = filters.userId;
      if (filters.coachId) matchStage.coachId = filters.coachId;
      if (filters.status?.length) matchStage.status = { $in: filters.status };
      if (filters.paymentMethod?.length) {
        matchStage.paymentMethod = { $in: filters.paymentMethod };
      }

      const [analytics] = await this.model.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: null,
            totalTransactions: { $sum: 1 },
            totalAmount: { $sum: '$amount' },
            averageAmount: { $avg: '$amount' },
            statusBreakdown: {
              $push: {
                k: '$status',
                v: 1
              }
            },
            dailyTotals: {
              $push: {
                date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                amount: '$amount'
              }
            }
          }
        },
        {
          $project: {
            _id: 0,
            totalTransactions: 1,
            totalAmount: 1,
            averageAmount: 1,
            statusBreakdown: { $arrayToObject: '$statusBreakdown' },
            dailyTotals: 1
          }
        }
      ]);

      // Log analytics generation
      this.logger.info('Payment analytics generated', {
        startDate,
        endDate,
        filters: { ...filters, userId: filters.userId ? '[FILTERED]' : undefined }
      });

      return analytics || {
        totalTransactions: 0,
        totalAmount: 0,
        averageAmount: 0,
        statusBreakdown: {},
        dailyTotals: []
      };
    } catch (error) {
      this.logger.error('Failed to generate payment analytics', {
        error: error.message,
        startDate,
        endDate,
        filters: { ...filters, userId: '[FILTERED]' }
      });
      throw error;
    }
  }
}