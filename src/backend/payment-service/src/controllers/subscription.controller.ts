import { injectable } from 'inversify'; // ^6.0.1
import { controller, httpGet, httpPost, httpPut, httpDelete, httpPatch } from 'inversify-express-utils'; // ^6.3.2
import { Request, Response } from 'express'; // ^4.18.2
import { authorize } from '@custom/auth'; // ^1.0.0
import { rateLimit } from '@custom/rate-limiter'; // ^1.0.0
import { Logger } from 'winston'; // ^3.8.2
import { MetricsCollector } from '@custom/metrics'; // ^1.0.0
import { ValidationMiddleware } from '@custom/validation'; // ^1.0.0

import { Subscription } from '../models/subscription.model';
import { SubscriptionRepository } from '../repositories/subscription.repository';
import { PaymentStatus } from '@shared/types';
import { SubscriptionStatus } from '../types';

@injectable()
@controller('/api/subscriptions')
@rateLimit({ windowMs: 15 * 60 * 1000, max: 100 })
export class SubscriptionController {
  private readonly METRICS_PREFIX = 'subscription_controller';

  constructor(
    private readonly subscriptionRepository: SubscriptionRepository,
    private readonly logger: Logger,
    private readonly metricsCollector: MetricsCollector
  ) {}

  @httpPost('/')
  @authorize(['user', 'admin'])
  @ValidationMiddleware('createSubscription')
  async createSubscription(req: Request, res: Response): Promise<Response> {
    const startTime = Date.now();
    try {
      this.logger.debug('Creating subscription', { body: req.body });

      const activeSubscriptions = await this.subscriptionRepository.findActiveByUserId(req.body.userId);
      if (activeSubscriptions.length >= 3) {
        return res.status(400).json({
          error: 'Maximum active subscriptions limit reached'
        });
      }

      const subscription = await this.subscriptionRepository.create({
        ...req.body,
        status: PaymentStatus.PENDING,
        metadata: {
          ...req.body.metadata,
          createdBy: req.user?.id,
          userAgent: req.headers['user-agent']
        }
      });

      this.metricsCollector.timing(
        `${this.METRICS_PREFIX}.create.duration`,
        Date.now() - startTime
      );
      this.metricsCollector.increment(`${this.METRICS_PREFIX}.create.success`);

      return res.status(201).json(subscription);
    } catch (error) {
      this.metricsCollector.increment(`${this.METRICS_PREFIX}.create.error`);
      this.logger.error('Error creating subscription', { error });
      return res.status(500).json({ error: 'Failed to create subscription' });
    }
  }

  @httpGet('/:id')
  @authorize(['user', 'admin'])
  async getSubscription(req: Request, res: Response): Promise<Response> {
    const startTime = Date.now();
    try {
      const subscription = await this.subscriptionRepository.findById(req.params.id);
      
      if (!subscription) {
        return res.status(404).json({ error: 'Subscription not found' });
      }

      if (subscription.userId !== req.user?.id && req.user?.role !== 'admin') {
        return res.status(403).json({ error: 'Unauthorized access' });
      }

      this.metricsCollector.timing(
        `${this.METRICS_PREFIX}.get.duration`,
        Date.now() - startTime
      );

      return res.json(subscription);
    } catch (error) {
      this.logger.error('Error fetching subscription', { error, id: req.params.id });
      return res.status(500).json({ error: 'Failed to fetch subscription' });
    }
  }

  @httpPatch('/:id/pause')
  @authorize(['user', 'admin'])
  async pauseSubscription(req: Request, res: Response): Promise<Response> {
    const startTime = Date.now();
    try {
      const subscription = await this.subscriptionRepository.findById(req.params.id);
      
      if (!subscription) {
        return res.status(404).json({ error: 'Subscription not found' });
      }

      if (subscription.userId !== req.user?.id && req.user?.role !== 'admin') {
        return res.status(403).json({ error: 'Unauthorized access' });
      }

      if (subscription.status !== PaymentStatus.COMPLETED) {
        return res.status(400).json({ error: 'Only active subscriptions can be paused' });
      }

      const updatedSubscription = await this.subscriptionRepository.update(
        req.params.id,
        {
          status: SubscriptionStatus.PAST_DUE,
          metadata: {
            ...subscription.metadata,
            pausedAt: new Date(),
            pausedBy: req.user?.id,
            pauseReason: req.body.reason
          }
        }
      );

      this.metricsCollector.timing(
        `${this.METRICS_PREFIX}.pause.duration`,
        Date.now() - startTime
      );
      this.metricsCollector.increment(`${this.METRICS_PREFIX}.pause.success`);

      return res.json(updatedSubscription);
    } catch (error) {
      this.metricsCollector.increment(`${this.METRICS_PREFIX}.pause.error`);
      this.logger.error('Error pausing subscription', { error, id: req.params.id });
      return res.status(500).json({ error: 'Failed to pause subscription' });
    }
  }

  @httpPatch('/:id/resume')
  @authorize(['user', 'admin'])
  async resumeSubscription(req: Request, res: Response): Promise<Response> {
    const startTime = Date.now();
    try {
      const subscription = await this.subscriptionRepository.findById(req.params.id);
      
      if (!subscription) {
        return res.status(404).json({ error: 'Subscription not found' });
      }

      if (subscription.userId !== req.user?.id && req.user?.role !== 'admin') {
        return res.status(403).json({ error: 'Unauthorized access' });
      }

      if (subscription.status !== SubscriptionStatus.PAST_DUE) {
        return res.status(400).json({ error: 'Only paused subscriptions can be resumed' });
      }

      const updatedSubscription = await this.subscriptionRepository.update(
        req.params.id,
        {
          status: PaymentStatus.COMPLETED,
          metadata: {
            ...subscription.metadata,
            resumedAt: new Date(),
            resumedBy: req.user?.id
          }
        }
      );

      this.metricsCollector.timing(
        `${this.METRICS_PREFIX}.resume.duration`,
        Date.now() - startTime
      );
      this.metricsCollector.increment(`${this.METRICS_PREFIX}.resume.success`);

      return res.json(updatedSubscription);
    } catch (error) {
      this.metricsCollector.increment(`${this.METRICS_PREFIX}.resume.error`);
      this.logger.error('Error resuming subscription', { error, id: req.params.id });
      return res.status(500).json({ error: 'Failed to resume subscription' });
    }
  }

  @httpDelete('/:id')
  @authorize(['user', 'admin'])
  async cancelSubscription(req: Request, res: Response): Promise<Response> {
    const startTime = Date.now();
    try {
      const subscription = await this.subscriptionRepository.findById(req.params.id);
      
      if (!subscription) {
        return res.status(404).json({ error: 'Subscription not found' });
      }

      if (subscription.userId !== req.user?.id && req.user?.role !== 'admin') {
        return res.status(403).json({ error: 'Unauthorized access' });
      }

      const canceledSubscription = await this.subscriptionRepository.cancel(
        req.params.id,
        req.body.reason
      );

      this.metricsCollector.timing(
        `${this.METRICS_PREFIX}.cancel.duration`,
        Date.now() - startTime
      );
      this.metricsCollector.increment(`${this.METRICS_PREFIX}.cancel.success`);

      return res.json(canceledSubscription);
    } catch (error) {
      this.metricsCollector.increment(`${this.METRICS_PREFIX}.cancel.error`);
      this.logger.error('Error canceling subscription', { error, id: req.params.id });
      return res.status(500).json({ error: 'Failed to cancel subscription' });
    }
  }

  @httpGet('/user/:userId')
  @authorize(['user', 'admin'])
  async getUserSubscriptions(req: Request, res: Response): Promise<Response> {
    const startTime = Date.now();
    try {
      if (req.params.userId !== req.user?.id && req.user?.role !== 'admin') {
        return res.status(403).json({ error: 'Unauthorized access' });
      }

      const { page, limit, sortBy, sortOrder } = req.query;
      const subscriptions = await this.subscriptionRepository.findByUserId(
        req.params.userId,
        {
          page: Number(page) || 1,
          limit: Number(limit) || 10,
          sortBy: String(sortBy) || 'createdAt',
          sortOrder: (sortOrder as 'asc' | 'desc') || 'desc'
        }
      );

      this.metricsCollector.timing(
        `${this.METRICS_PREFIX}.list.duration`,
        Date.now() - startTime
      );

      return res.json(subscriptions);
    } catch (error) {
      this.logger.error('Error fetching user subscriptions', { 
        error, 
        userId: req.params.userId 
      });
      return res.status(500).json({ error: 'Failed to fetch subscriptions' });
    }
  }
}