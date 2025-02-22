import React, { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next'; // v13.0.0
import classNames from 'classnames'; // v2.3.2
import { analytics } from '@segment/analytics-next'; // v1.51.0

import Card from '../common/Card';
import { Subscription, SubscriptionStatus } from '../../types/payment';
import { usePayment } from '../../hooks/usePayment';

/**
 * Props interface for the SubscriptionCard component
 */
interface SubscriptionCardProps {
  subscription: Subscription;
  onCancel?: () => Promise<void>;
  onRenew?: () => Promise<void>;
  className?: string;
  variant?: 'primary' | 'secondary';
  testId?: string;
}

/**
 * A reusable card component for displaying subscription plan details and managing subscription status
 * with enhanced accessibility features and error handling
 */
const SubscriptionCard: React.FC<SubscriptionCardProps> = ({
  subscription,
  onCancel,
  onRenew,
  className,
  variant = 'primary',
  testId = 'subscription-card'
}) => {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { cancelSubscription, useSubscriptionStatus } = usePayment();

  // Format currency amount with localization support
  const formatAmount = useCallback((amount: number) => {
    return new Intl.NumberFormat(navigator.language, {
      style: 'currency',
      currency: subscription.currency || 'USD',
      minimumFractionDigits: 2
    }).format(amount);
  }, [subscription.currency]);

  // Handle subscription cancellation with analytics tracking
  const handleCancel = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      analytics.track('Subscription Cancel Attempt', {
        subscriptionId: subscription.stripeSubscriptionId,
        planId: subscription.planId
      });

      if (window.confirm(t('subscription.cancelConfirmation'))) {
        await cancelSubscription(subscription.stripeSubscriptionId);
        analytics.track('Subscription Cancelled', {
          subscriptionId: subscription.stripeSubscriptionId
        });
        onCancel?.();
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(t('subscription.cancelError'));
      analytics.track('Subscription Cancel Error', {
        subscriptionId: subscription.stripeSubscriptionId,
        error: errorMessage
      });
    } finally {
      setIsLoading(false);
    }
  }, [subscription, cancelSubscription, onCancel, t]);

  // Handle subscription renewal with analytics tracking
  const handleRenew = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      analytics.track('Subscription Renewal Attempt', {
        subscriptionId: subscription.stripeSubscriptionId,
        planId: subscription.planId
      });

      await onRenew?.();
      
      analytics.track('Subscription Renewed', {
        subscriptionId: subscription.stripeSubscriptionId
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(t('subscription.renewError'));
      analytics.track('Subscription Renewal Error', {
        subscriptionId: subscription.stripeSubscriptionId,
        error: errorMessage
      });
    } finally {
      setIsLoading(false);
    }
  }, [subscription, onRenew, t]);

  // Status-specific styling
  const statusClasses = {
    [SubscriptionStatus.ACTIVE]: 'text-green-600',
    [SubscriptionStatus.CANCELED]: 'text-red-600',
    [SubscriptionStatus.EXPIRED]: 'text-gray-600',
    [SubscriptionStatus.PAST_DUE]: 'text-yellow-600'
  };

  return (
    <Card
      variant={variant === 'primary' ? 'elevated' : 'outlined'}
      className={classNames(
        'subscription-card',
        'transition-all duration-200',
        className
      )}
      testId={testId}
      role="region"
      aria-label={t('subscription.cardLabel')}
    >
      <div className="p-6 space-y-4">
        {/* Subscription Header */}
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold">
            {t('subscription.currentPlan')}
          </h3>
          <span 
            className={classNames(
              'font-medium',
              statusClasses[subscription.status]
            )}
            aria-label={t(`subscription.status.${subscription.status.toLowerCase()}`)}
          >
            {t(`subscription.status.${subscription.status.toLowerCase()}`)}
          </span>
        </div>

        {/* Subscription Details */}
        <div className="space-y-2">
          <div className="flex justify-between items-baseline">
            <span className="text-2xl font-bold">
              {formatAmount(subscription.amount)}
            </span>
            <span className="text-gray-600">
              /{t(`subscription.interval.${subscription.interval.toLowerCase()}`)}
            </span>
          </div>

          <div className="text-sm text-gray-600">
            {t('subscription.nextBilling', {
              date: new Intl.DateTimeFormat(navigator.language, {
                dateStyle: 'long'
              }).format(new Date(subscription.currentPeriodEnd))
            })}
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div
            className="text-red-600 text-sm"
            role="alert"
            aria-live="polite"
          >
            {error}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-4 mt-6">
          {subscription.status === SubscriptionStatus.ACTIVE && (
            <button
              onClick={handleCancel}
              disabled={isLoading}
              className={classNames(
                'px-4 py-2 rounded-md text-red-600 border border-red-600',
                'hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                'transition-colors duration-200'
              )}
              aria-busy={isLoading}
            >
              {t('subscription.cancelButton')}
            </button>
          )}

          {subscription.status === SubscriptionStatus.CANCELED && (
            <button
              onClick={handleRenew}
              disabled={isLoading}
              className={classNames(
                'px-4 py-2 rounded-md text-white bg-primary-600',
                'hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500',
                'disabled:opacity-50 disabled:cursor-not-allowed',
                'transition-colors duration-200'
              )}
              aria-busy={isLoading}
            >
              {t('subscription.renewButton')}
            </button>
          )}
        </div>
      </div>
    </Card>
  );
};

export default SubscriptionCard;