'use client';

import React, { useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'react-hot-toast';
import { analytics } from '@segment/analytics-next';

import SubscriptionCard from '@/components/payment/SubscriptionCard';
import PaymentHistory from '@/components/payment/PaymentHistory';
import { usePayment } from '@/hooks/usePayment';
import ErrorBoundary from '@/components/common/ErrorBoundary';

/**
 * Enhanced subscription management page component with comprehensive error handling,
 * accessibility features, and real-time status updates.
 */
const SubscriptionPage: React.FC = () => {
  const { t } = useTranslation();
  const {
    loading,
    error,
    activeSubscription,
    cancelSubscription,
    createSubscription,
    fetchActiveSubscription
  } = usePayment();

  // Initialize subscription data and analytics
  useEffect(() => {
    const initializeSubscription = async () => {
      try {
        await fetchActiveSubscription();
        analytics.track('Subscription Page View', {
          hasActiveSubscription: !!activeSubscription?.data,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('Failed to fetch subscription:', error);
      }
    };

    initializeSubscription();

    // Cleanup analytics listeners
    return () => {
      analytics.reset();
    };
  }, [fetchActiveSubscription]);

  // Enhanced subscription cancellation handler with analytics
  const handleSubscriptionCancel = useCallback(async () => {
    try {
      if (!activeSubscription?.data?.stripeSubscriptionId) {
        throw new Error('No active subscription found');
      }

      analytics.track('Subscription Cancel Attempt', {
        subscriptionId: activeSubscription.data.stripeSubscriptionId
      });

      // Show confirmation dialog with accessibility support
      if (window.confirm(t('subscription.cancelConfirmation'))) {
        await cancelSubscription(activeSubscription.data.stripeSubscriptionId);

        toast.success(t('subscription.cancelSuccess'), {
          ariaProps: {
            role: 'status',
            'aria-live': 'polite'
          }
        });

        analytics.track('Subscription Cancelled', {
          subscriptionId: activeSubscription.data.stripeSubscriptionId
        });

        await fetchActiveSubscription();
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      toast.error(t('subscription.cancelError'), {
        ariaProps: {
          role: 'alert',
          'aria-live': 'assertive'
        }
      });

      analytics.track('Subscription Cancel Error', {
        error: errorMessage
      });
    }
  }, [activeSubscription, cancelSubscription, fetchActiveSubscription, t]);

  // Enhanced subscription renewal handler with validation
  const handleSubscriptionRenewal = useCallback(async () => {
    try {
      if (!activeSubscription?.data?.planId) {
        throw new Error('No subscription plan found');
      }

      analytics.track('Subscription Renewal Attempt', {
        planId: activeSubscription.data.planId
      });

      await createSubscription({
        planId: activeSubscription.data.planId,
        currency: activeSubscription.data.currency
      });

      toast.success(t('subscription.renewSuccess'), {
        ariaProps: {
          role: 'status',
          'aria-live': 'polite'
        }
      });

      analytics.track('Subscription Renewed', {
        planId: activeSubscription.data.planId
      });

      await fetchActiveSubscription();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      toast.error(t('subscription.renewError'), {
        ariaProps: {
          role: 'alert',
          'aria-live': 'assertive'
        }
      });

      analytics.track('Subscription Renewal Error', {
        error: errorMessage
      });
    }
  }, [activeSubscription, createSubscription, fetchActiveSubscription, t]);

  return (
    <ErrorBoundary
      fallback={
        <div role="alert" className="p-4 text-red-600 bg-red-50 rounded-lg">
          {t('subscription.errorFallback')}
        </div>
      }
    >
      <div className="max-w-4xl mx-auto p-6 space-y-8">
        <h1 className="text-2xl font-bold text-gray-900">
          {t('subscription.pageTitle')}
        </h1>

        {/* Loading State */}
        {loading.subscription && (
          <div
            role="status"
            aria-live="polite"
            className="animate-pulse space-y-4"
          >
            <div className="h-48 bg-gray-200 rounded-lg" />
            <div className="h-8 w-1/3 bg-gray-200 rounded" />
          </div>
        )}

        {/* Error State */}
        {error && (
          <div
            role="alert"
            className="p-4 text-red-600 bg-red-50 rounded-lg"
            aria-live="assertive"
          >
            {error.message}
          </div>
        )}

        {/* Active Subscription */}
        {activeSubscription?.data && (
          <SubscriptionCard
            subscription={activeSubscription.data}
            onCancel={handleSubscriptionCancel}
            onRenew={handleSubscriptionRenewal}
            className="shadow-lg"
            testId="active-subscription-card"
          />
        )}

        {/* No Active Subscription */}
        {!loading.subscription && !activeSubscription?.data && (
          <div
            className="text-center p-8 bg-gray-50 rounded-lg"
            role="status"
            aria-live="polite"
          >
            <p className="text-gray-600 mb-4">
              {t('subscription.noActiveSubscription')}
            </p>
          </div>
        )}

        {/* Payment History Section */}
        <section aria-labelledby="payment-history-heading" className="mt-12">
          <h2
            id="payment-history-heading"
            className="text-xl font-semibold mb-6"
          >
            {t('subscription.paymentHistory')}
          </h2>
          
          <PaymentHistory
            userId={activeSubscription?.data?.userId || ''}
            pageSize={10}
            onError={(error) => {
              toast.error(t('subscription.paymentHistoryError'), {
                ariaProps: {
                  role: 'alert',
                  'aria-live': 'assertive'
                }
              });
              
              analytics.track('Payment History Error', {
                error: error.message
              });
            }}
          />
        </section>
      </div>
    </ErrorBoundary>
  );
};

export default SubscriptionPage;