import { injectable } from 'inversify';
import { Model, ClientSession } from 'mongoose';
import { Logger } from '@shared/logger';
import { Metrics } from '@shared/metrics';
import { Subscription } from '../models/subscription.model';
import SubscriptionModel from '../models/subscription.model';
import { SubscriptionStatus } from '../types';
import { PaymentStatus } from '@shared/types';

interface QueryOptions {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

@injectable()
export class SubscriptionRepository {
  private readonly _model: Model<Subscription>;
  private readonly _logger: Logger;
  private readonly _metrics: Metrics;
  private readonly METRICS_PREFIX = 'subscription_repository';

  constructor(logger: Logger, metrics: Metrics) {
    this._model = SubscriptionModel;
    this._logger = logger;
    this._metrics = metrics;
  }

  /**
   * Creates a new subscription with validation and monitoring
   */
  async create(
    subscriptionData: Partial<Subscription>,
    session?: ClientSession
  ): Promise<Subscription> {
    const startTime = Date.now();
    try {
      this._logger.debug('Creating subscription', { data: subscriptionData });

      const subscription = new this._model({
        ...subscriptionData,
        status: PaymentStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      const result = session 
        ? await subscription.save({ session })
        : await subscription.save();

      this._metrics.increment(`${this.METRICS_PREFIX}.create.success`);
      this._metrics.timing(
        `${this.METRICS_PREFIX}.create.duration`,
        Date.now() - startTime
      );

      return result;
    } catch (error) {
      this._metrics.increment(`${this.METRICS_PREFIX}.create.error`);
      this._logger.error('Error creating subscription', {
        error,
        data: subscriptionData
      });
      throw error;
    }
  }

  /**
   * Finds subscription by ID with detailed error handling
   */
  async findById(id: string): Promise<Subscription | null> {
    const startTime = Date.now();
    try {
      this._logger.debug('Finding subscription by ID', { id });

      const subscription = await this._model.findById(id);

      this._metrics.timing(
        `${this.METRICS_PREFIX}.findById.duration`,
        Date.now() - startTime
      );
      this._metrics.increment(`${this.METRICS_PREFIX}.findById.${subscription ? 'hit' : 'miss'}`);

      return subscription;
    } catch (error) {
      this._metrics.increment(`${this.METRICS_PREFIX}.findById.error`);
      this._logger.error('Error finding subscription by ID', { error, id });
      throw error;
    }
  }

  /**
   * Finds all subscriptions for a user with pagination
   */
  async findByUserId(
    userId: string,
    options: QueryOptions = {}
  ): Promise<PaginatedResult<Subscription>> {
    const startTime = Date.now();
    try {
      const {
        page = 1,
        limit = 10,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = options;

      const query = this._model.find({ userId });
      const total = await this._model.countDocuments({ userId });

      const subscriptions = await query
        .sort({ [sortBy]: sortOrder })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec();

      this._metrics.timing(
        `${this.METRICS_PREFIX}.findByUserId.duration`,
        Date.now() - startTime
      );

      return {
        data: subscriptions,
        total,
        page,
        limit
      };
    } catch (error) {
      this._metrics.increment(`${this.METRICS_PREFIX}.findByUserId.error`);
      this._logger.error('Error finding subscriptions by user ID', {
        error,
        userId
      });
      throw error;
    }
  }

  /**
   * Finds active subscriptions for a user
   */
  async findActiveByUserId(userId: string): Promise<Subscription[]> {
    const startTime = Date.now();
    try {
      this._logger.debug('Finding active subscriptions for user', { userId });

      const subscriptions = await this._model.find({
        userId,
        status: PaymentStatus.COMPLETED,
        currentPeriodEnd: { $gt: new Date() },
        canceledAt: { $exists: false }
      });

      this._metrics.timing(
        `${this.METRICS_PREFIX}.findActiveByUserId.duration`,
        Date.now() - startTime
      );
      this._metrics.gauge(
        `${this.METRICS_PREFIX}.active_subscriptions`,
        subscriptions.length,
        { userId }
      );

      return subscriptions;
    } catch (error) {
      this._metrics.increment(`${this.METRICS_PREFIX}.findActiveByUserId.error`);
      this._logger.error('Error finding active subscriptions', {
        error,
        userId
      });
      throw error;
    }
  }

  /**
   * Updates subscription with validation and audit trail
   */
  async update(
    id: string,
    updateData: Partial<Subscription>,
    session?: ClientSession
  ): Promise<Subscription | null> {
    const startTime = Date.now();
    try {
      this._logger.debug('Updating subscription', { id, data: updateData });

      const subscription = await this._model.findById(id);
      if (!subscription) {
        return null;
      }

      // Validate status transition if status is being updated
      if (updateData.status && !subscription.validateStatusTransition(updateData.status)) {
        throw new Error(`Invalid status transition from ${subscription.status} to ${updateData.status}`);
      }

      const updatedSubscription = session
        ? await this._model.findByIdAndUpdate(
            id,
            { ...updateData, updatedAt: new Date() },
            { new: true, session }
          )
        : await this._model.findByIdAndUpdate(
            id,
            { ...updateData, updatedAt: new Date() },
            { new: true }
          );

      this._metrics.timing(
        `${this.METRICS_PREFIX}.update.duration`,
        Date.now() - startTime
      );
      this._metrics.increment(`${this.METRICS_PREFIX}.update.success`);

      return updatedSubscription;
    } catch (error) {
      this._metrics.increment(`${this.METRICS_PREFIX}.update.error`);
      this._logger.error('Error updating subscription', {
        error,
        id,
        data: updateData
      });
      throw error;
    }
  }

  /**
   * Cancels subscription with comprehensive lifecycle management
   */
  async cancel(
    id: string,
    reason: string
  ): Promise<Subscription | null> {
    const startTime = Date.now();
    const session = await this._model.startSession();

    try {
      session.startTransaction();

      const subscription = await this._model.findById(id).session(session);
      if (!subscription) {
        await session.abortTransaction();
        return null;
      }

      if (subscription.status === PaymentStatus.CANCELLED) {
        await session.abortTransaction();
        throw new Error('Subscription is already cancelled');
      }

      const updatedSubscription = await this._model.findByIdAndUpdate(
        id,
        {
          status: PaymentStatus.CANCELLED,
          canceledAt: new Date(),
          cancelAtPeriodEnd: true,
          metadata: {
            ...subscription.metadata,
            cancellationReason: reason,
            cancelledBy: 'user'
          },
          updatedAt: new Date()
        },
        { new: true, session }
      );

      await session.commitTransaction();

      this._metrics.timing(
        `${this.METRICS_PREFIX}.cancel.duration`,
        Date.now() - startTime
      );
      this._metrics.increment(`${this.METRICS_PREFIX}.cancel.success`);

      return updatedSubscription;
    } catch (error) {
      await session.abortTransaction();
      this._metrics.increment(`${this.METRICS_PREFIX}.cancel.error`);
      this._logger.error('Error cancelling subscription', {
        error,
        id,
        reason
      });
      throw error;
    } finally {
      session.endSession();
    }
  }
}