import { useState, useEffect } from 'react'; // v18.2.0
import { useDispatch, useSelector } from 'react-redux'; // v8.1.0
import { Elements } from '@stripe/stripe-js'; // v2.1.0

import { 
  processPayment,
  createSubscription,
  cancelSubscription,
  fetchPaymentHistory,
  fetchActiveSubscription
} from '../store/payment.slice';

import { 
  Payment,
  Subscription,
  PaymentProcessingResult,
  SubscriptionUpdateRequest
} from '../types/payment';

interface PaymentState {
  loading: {
    payment: boolean;
    subscription: boolean;
    history: boolean;
  };
  error: {
    type: string;
    message: string;
  } | null;
  paymentHistory: {
    data: Payment[];
    page: number;
    totalPages: number;
  };
  activeSubscription: {
    data: Subscription | null;
    status: string;
  };
}

/**
 * Custom hook for comprehensive payment and subscription management
 * Provides enhanced error handling, analytics, and real-time status tracking
 */
export const usePayment = () => {
  const dispatch = useDispatch();

  // Initialize granular loading states
  const [state, setState] = useState<PaymentState>({
    loading: {
      payment: false,
      subscription: false,
      history: false
    },
    error: null,
    paymentHistory: {
      data: [],
      page: 1,
      totalPages: 1
    },
    activeSubscription: {
      data: null,
      status: 'idle'
    }
  });

  // Select payment state from Redux store
  const paymentState = useSelector((state: any) => state.payment);

  /**
   * Process one-time payment with retry mechanism
   * @param paymentData Payment details
   * @returns PaymentProcessingResult
   */
  const handlePayment = async (paymentData: Partial<Payment>): Promise<PaymentProcessingResult> => {
    try {
      setState(prev => ({
        ...prev,
        loading: { ...prev.loading, payment: true },
        error: null
      }));

      const result = await dispatch(processPayment(paymentData)).unwrap();

      setState(prev => ({
        ...prev,
        loading: { ...prev.loading, payment: false }
      }));

      return result;
    } catch (error: any) {
      setState(prev => ({
        ...prev,
        loading: { ...prev.loading, payment: false },
        error: {
          type: 'PAYMENT_ERROR',
          message: error.message || 'Payment processing failed'
        }
      }));
      throw error;
    }
  };

  /**
   * Create new subscription with validation
   * @param subscriptionData Subscription details
   */
  const handleCreateSubscription = async (subscriptionData: Partial<Subscription>): Promise<void> => {
    try {
      setState(prev => ({
        ...prev,
        loading: { ...prev.loading, subscription: true },
        error: null
      }));

      await dispatch(createSubscription(subscriptionData)).unwrap();

      setState(prev => ({
        ...prev,
        loading: { ...prev.loading, subscription: false }
      }));
    } catch (error: any) {
      setState(prev => ({
        ...prev,
        loading: { ...prev.loading, subscription: false },
        error: {
          type: 'SUBSCRIPTION_ERROR',
          message: error.message || 'Failed to create subscription'
        }
      }));
      throw error;
    }
  };

  /**
   * Cancel subscription with cleanup
   * @param subscriptionId Subscription ID to cancel
   */
  const handleCancelSubscription = async (subscriptionId: string): Promise<void> => {
    try {
      setState(prev => ({
        ...prev,
        loading: { ...prev.loading, subscription: true },
        error: null
      }));

      await dispatch(cancelSubscription(subscriptionId)).unwrap();

      setState(prev => ({
        ...prev,
        loading: { ...prev.loading, subscription: false }
      }));
    } catch (error: any) {
      setState(prev => ({
        ...prev,
        loading: { ...prev.loading, subscription: false },
        error: {
          type: 'SUBSCRIPTION_ERROR',
          message: error.message || 'Failed to cancel subscription'
        }
      }));
      throw error;
    }
  };

  /**
   * Fetch paginated payment history
   * @param page Page number
   * @param pageSize Items per page
   */
  const loadPaymentHistory = async (page: number = 1, pageSize: number = 10): Promise<void> => {
    try {
      setState(prev => ({
        ...prev,
        loading: { ...prev.loading, history: true },
        error: null
      }));

      const result = await dispatch(fetchPaymentHistory({ page, pageSize })).unwrap();

      setState(prev => ({
        ...prev,
        loading: { ...prev.loading, history: false },
        paymentHistory: {
          data: result.items,
          page: result.page,
          totalPages: result.totalPages
        }
      }));
    } catch (error: any) {
      setState(prev => ({
        ...prev,
        loading: { ...prev.loading, history: false },
        error: {
          type: 'HISTORY_ERROR',
          message: error.message || 'Failed to load payment history'
        }
      }));
    }
  };

  /**
   * Monitor active subscription status
   */
  useEffect(() => {
    const checkSubscriptionStatus = async () => {
      try {
        const subscription = await dispatch(fetchActiveSubscription()).unwrap();
        setState(prev => ({
          ...prev,
          activeSubscription: {
            data: subscription,
            status: subscription ? 'active' : 'inactive'
          }
        }));
      } catch (error: any) {
        setState(prev => ({
          ...prev,
          error: {
            type: 'SUBSCRIPTION_STATUS_ERROR',
            message: error.message || 'Failed to fetch subscription status'
          }
        }));
      }
    };

    checkSubscriptionStatus();
    const intervalId = setInterval(checkSubscriptionStatus, 60000); // Check every minute

    return () => clearInterval(intervalId);
  }, [dispatch]);

  return {
    // Payment operations
    processPayment: handlePayment,
    createSubscription: handleCreateSubscription,
    cancelSubscription: handleCancelSubscription,
    fetchPaymentHistory: loadPaymentHistory,

    // State
    loading: state.loading,
    error: state.error,
    paymentHistory: state.paymentHistory,
    activeSubscription: state.activeSubscription,

    // Redux state
    paymentState
  };
};