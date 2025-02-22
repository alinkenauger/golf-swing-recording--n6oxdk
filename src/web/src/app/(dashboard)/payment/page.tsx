'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { Elements } from '@stripe/stripe-js'; // v2.1.0
import { loadStripe } from '@stripe/stripe-js'; // v2.1.0
import toast from 'react-hot-toast'; // v2.4.1

import { PaymentForm } from '../../components/payment/PaymentForm';
import { PaymentHistory } from '../../components/payment/PaymentHistory';
import { usePayment } from '../../hooks/usePayment';
import { ErrorBoundary } from '../../components/common/ErrorBoundary';

// Initialize Stripe
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);

// Constants
const PAYMENT_HISTORY_PAGE_SIZE = 10;
const RETRY_ATTEMPTS = 3;

/**
 * Payment dashboard page component that handles payment processing,
 * subscription management, and displays payment history
 */
export default function PaymentPage() {
  // Payment hook for managing payment state and operations
  const {
    processPayment,
    createSubscription,
    loading,
    error,
    paymentHistory,
    activeSubscription
  } = usePayment();

  // Local state for payment form
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [isSubscription, setIsSubscription] = useState<boolean>(false);
  const [retryCount, setRetryCount] = useState<number>(0);

  /**
   * Handle successful payment processing
   * @param result Payment processing result
   */
  const handlePaymentSuccess = useCallback((paymentIntentId: string) => {
    toast.success('Payment processed successfully', {
      duration: 5000,
      position: 'top-right',
    });

    // Reset form state
    setPaymentAmount(0);
    setRetryCount(0);

    // Announce to screen readers
    const announcement = document.createElement('div');
    announcement.setAttribute('role', 'alert');
    announcement.setAttribute('aria-live', 'assertive');
    announcement.textContent = 'Payment completed successfully';
    document.body.appendChild(announcement);
    setTimeout(() => document.body.removeChild(announcement), 1000);
  }, []);

  /**
   * Handle payment processing errors with retry mechanism
   * @param error Payment processing error
   */
  const handlePaymentError = useCallback((error: Error) => {
    if (retryCount < RETRY_ATTEMPTS) {
      setRetryCount(prev => prev + 1);
      toast.error(`Payment failed. Retrying... (${retryCount + 1}/${RETRY_ATTEMPTS})`, {
        duration: 3000,
      });
    } else {
      toast.error('Payment failed. Please try again later.', {
        duration: 5000,
      });
      setRetryCount(0);
    }

    // Log error for monitoring
    console.error('Payment processing error:', {
      error,
      timestamp: new Date().toISOString(),
      retryCount,
    });
  }, [retryCount]);

  /**
   * Handle payment history page changes
   * @param page New page number
   */
  const handlePageChange = useCallback((page: number) => {
    // PaymentHistory component handles the actual pagination
  }, []);

  // Effect to monitor active subscription status
  useEffect(() => {
    if (activeSubscription?.data) {
      const expiryDate = new Date(activeSubscription.data.currentPeriodEnd);
      const now = new Date();
      const daysUntilExpiry = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      if (daysUntilExpiry <= 7) {
        toast.warning(`Your subscription will expire in ${daysUntilExpiry} days`, {
          duration: 7000,
        });
      }
    }
  }, [activeSubscription]);

  return (
    <ErrorBoundary
      fallback={
        <div role="alert" className="p-4 bg-red-50 border border-red-100 rounded-lg">
          <h2 className="text-lg font-semibold text-red-800 mb-2">
            Payment System Error
          </h2>
          <p className="text-sm text-red-600">
            Unable to load payment system. Please try again later.
          </p>
        </div>
      }
    >
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-8">
          Payment Dashboard
        </h1>

        <div className="space-y-8">
          {/* Payment Form Section */}
          <section aria-labelledby="payment-form-heading">
            <h2 id="payment-form-heading" className="text-xl font-semibold mb-4">
              Make a Payment
            </h2>
            <Elements stripe={stripePromise}>
              <PaymentForm
                amount={paymentAmount}
                currency="USD"
                isSubscription={isSubscription}
                onSuccess={handlePaymentSuccess}
                onError={handlePaymentError}
              />
            </Elements>
          </section>

          {/* Active Subscription Section */}
          {activeSubscription?.data && (
            <section aria-labelledby="subscription-heading">
              <h2 id="subscription-heading" className="text-xl font-semibold mb-4">
                Active Subscription
              </h2>
              <div className="bg-white p-6 rounded-lg border border-gray-200">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">Plan</p>
                    <p className="font-medium">{activeSubscription.data.planId}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Status</p>
                    <p className="font-medium">{activeSubscription.data.status}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Next Payment</p>
                    <p className="font-medium">
                      {new Date(activeSubscription.data.currentPeriodEnd).toLocaleDateString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Amount</p>
                    <p className="font-medium">
                      {new Intl.NumberFormat('en-US', {
                        style: 'currency',
                        currency: activeSubscription.data.currency
                      }).format(activeSubscription.data.amount)}
                    </p>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Payment History Section */}
          <section aria-labelledby="payment-history-heading">
            <h2 id="payment-history-heading" className="text-xl font-semibold mb-4">
              Payment History
            </h2>
            <PaymentHistory
              userId={activeSubscription?.data?.userId || ''}
              pageSize={PAYMENT_HISTORY_PAGE_SIZE}
              onError={(error) => {
                toast.error('Failed to load payment history');
                console.error('Payment history error:', error);
              }}
            />
          </section>
        </div>
      </div>
    </ErrorBoundary>
  );
}