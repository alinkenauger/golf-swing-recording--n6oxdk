/**
 * Enhanced Stripe payment integration library
 * Provides secure, type-safe wrapper functions for Stripe API operations
 * @version 1.0.0
 */

import { loadStripe, Stripe, StripeElements } from '@stripe/stripe-js'; // v2.1.0
import { Payment, Subscription, SubscriptionInterval, SubscriptionStatus } from '../types/payment';

// Global configuration
const STRIPE_PUBLIC_KEY = process.env.NEXT_PUBLIC_STRIPE_KEY;
const STRIPE_OPTIONS = {
  appearance: { theme: 'stripe' },
  locale: 'en',
  currency: 'USD'
};
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1000;

// Custom error class for payment operations
class PaymentError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'PaymentError';
  }
}

/**
 * Implements exponential backoff retry mechanism for API calls
 */
async function withRetry<T>(
  operation: () => Promise<T>,
  maxAttempts: number = MAX_RETRY_ATTEMPTS
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      if (attempt === maxAttempts) break;
      
      const delay = RETRY_DELAY_MS * Math.pow(2, attempt - 1);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError!;
}

/**
 * Initializes and returns a Stripe instance with enhanced error handling
 */
export async function initializeStripe(): Promise<Stripe | null> {
  if (!STRIPE_PUBLIC_KEY) {
    throw new PaymentError(
      'Stripe public key is not configured',
      'STRIPE_CONFIG_ERROR'
    );
  }

  try {
    const stripe = await withRetry(() => loadStripe(STRIPE_PUBLIC_KEY));
    if (!stripe) {
      throw new PaymentError(
        'Failed to initialize Stripe',
        'STRIPE_INIT_ERROR'
      );
    }
    return stripe;
  } catch (error) {
    console.error('Stripe initialization error:', error);
    throw new PaymentError(
      'Failed to initialize Stripe payment system',
      'STRIPE_INIT_ERROR',
      { originalError: error }
    );
  }
}

/**
 * Creates a payment intent with comprehensive validation
 */
export async function createPaymentIntent(data: {
  amount: number;
  currency: string;
  customerId?: string;
  metadata?: Record<string, unknown>;
}): Promise<{ clientSecret: string; paymentIntentId: string }> {
  const stripe = await initializeStripe();
  if (!stripe) {
    throw new PaymentError(
      'Stripe is not initialized',
      'STRIPE_NOT_INITIALIZED'
    );
  }

  if (data.amount < 50) { // Minimum amount in cents
    throw new PaymentError(
      'Payment amount must be at least 0.50 USD',
      'INVALID_AMOUNT'
    );
  }

  try {
    const idempotencyKey = `pi_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const paymentIntent = await withRetry(() => 
      stripe.paymentIntents.create({
        amount: data.amount,
        currency: data.currency,
        customer: data.customerId,
        metadata: data.metadata,
      }, { idempotencyKey })
    );

    return {
      clientSecret: paymentIntent.client_secret!,
      paymentIntentId: paymentIntent.id
    };
  } catch (error) {
    throw new PaymentError(
      'Failed to create payment intent',
      'PAYMENT_INTENT_ERROR',
      { originalError: error }
    );
  }
}

/**
 * Confirms a payment with enhanced error handling and retry logic
 */
export async function confirmPayment(
  elements: StripeElements,
  clientSecret: string
): Promise<{ error?: PaymentError; paymentIntent?: Payment }> {
  const stripe = await initializeStripe();
  if (!stripe || !elements) {
    throw new PaymentError(
      'Payment system is not properly initialized',
      'PAYMENT_SYSTEM_ERROR'
    );
  }

  try {
    const { error, paymentIntent } = await withRetry(() =>
      stripe.confirmPayment({
        elements,
        clientSecret,
        confirmParams: {
          return_url: `${window.location.origin}/payment/complete`,
        },
      })
    );

    if (error) {
      return {
        error: new PaymentError(
          error.message,
          error.code || 'PAYMENT_CONFIRMATION_ERROR'
        )
      };
    }

    return { paymentIntent: paymentIntent as unknown as Payment };
  } catch (error) {
    return {
      error: new PaymentError(
        'Payment confirmation failed',
        'PAYMENT_CONFIRMATION_ERROR',
        { originalError: error }
      )
    };
  }
}

/**
 * Creates a subscription with enhanced validation and period tracking
 */
export async function createSubscription(data: {
  customerId: string;
  priceId: string;
  interval: SubscriptionInterval;
  metadata?: Record<string, unknown>;
}): Promise<{ subscriptionId: string; currentPeriodEnd: Date }> {
  const stripe = await initializeStripe();
  if (!stripe) {
    throw new PaymentError(
      'Stripe is not initialized',
      'STRIPE_NOT_INITIALIZED'
    );
  }

  try {
    const subscription = await withRetry(() =>
      stripe.subscriptions.create({
        customer: data.customerId,
        items: [{ price: data.priceId }],
        metadata: {
          ...data.metadata,
          interval: data.interval,
        },
        expand: ['latest_invoice.payment_intent'],
      })
    );

    return {
      subscriptionId: subscription.id,
      currentPeriodEnd: new Date(subscription.current_period_end * 1000)
    };
  } catch (error) {
    throw new PaymentError(
      'Failed to create subscription',
      'SUBSCRIPTION_CREATE_ERROR',
      { originalError: error }
    );
  }
}

/**
 * Cancels an active subscription with validation and proration handling
 */
export async function cancelSubscription(
  subscriptionId: string,
  options: {
    cancelAtPeriodEnd?: boolean;
    prorate?: boolean;
  } = {}
): Promise<{ canceled: boolean; endDate: Date }> {
  const stripe = await initializeStripe();
  if (!stripe) {
    throw new PaymentError(
      'Stripe is not initialized',
      'STRIPE_NOT_INITIALIZED'
    );
  }

  try {
    const subscription = await withRetry(() =>
      stripe.subscriptions.cancel(subscriptionId, {
        prorate: options.prorate,
        cancel_at_period_end: options.cancelAtPeriodEnd,
      })
    );

    return {
      canceled: subscription.status === SubscriptionStatus.CANCELED,
      endDate: new Date(subscription.current_period_end * 1000)
    };
  } catch (error) {
    throw new PaymentError(
      'Failed to cancel subscription',
      'SUBSCRIPTION_CANCEL_ERROR',
      { originalError: error }
    );
  }
}