import React, { useState, useCallback, useRef } from 'react';
import { CardElement, useStripe, useElements } from '@stripe/stripe-react-js'; // v2.1.0
import { processPayment, createSubscription, PaymentError } from '../../hooks/usePayment';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { ErrorBoundary } from '../common/ErrorBoundary';
import { PaymentMethod } from '../../types/payment';

interface PaymentFormProps {
  amount: number;
  currency: string;
  isSubscription?: boolean;
  onSuccess?: (paymentIntentId: string) => void;
  onError?: (error: PaymentError) => void;
  maxRetries?: number;
  locale?: string;
}

interface FormState {
  name: string;
  email: string;
  isProcessing: boolean;
  error: string | null;
  retryCount: number;
}

const CARD_ELEMENT_OPTIONS = {
  style: {
    base: {
      fontSize: '16px',
      color: '#1A1F36',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      '::placeholder': {
        color: '#6B7280',
      },
    },
    invalid: {
      color: '#FF4D4D',
      iconColor: '#FF4D4D',
    },
  },
  hidePostalCode: true,
};

export const PaymentForm: React.FC<PaymentFormProps> = ({
  amount,
  currency,
  isSubscription = false,
  onSuccess,
  onError,
  maxRetries = 3,
  locale = 'en',
}) => {
  const stripe = useStripe();
  const elements = useElements();
  const formRef = useRef<HTMLFormElement>(null);

  const [formState, setFormState] = useState<FormState>({
    name: '',
    email: '',
    isProcessing: false,
    error: null,
    retryCount: 0,
  });

  const handleInputChange = useCallback((field: keyof Pick<FormState, 'name' | 'email'>) => (
    value: string
  ) => {
    setFormState(prev => ({
      ...prev,
      [field]: value,
      error: null,
    }));
  }, []);

  const handleRetry = useCallback(async () => {
    if (formState.retryCount >= maxRetries) {
      setFormState(prev => ({
        ...prev,
        error: 'Maximum retry attempts reached. Please try again later.',
        isProcessing: false,
      }));
      return false;
    }

    // Implement exponential backoff
    const backoffDelay = Math.pow(2, formState.retryCount) * 1000;
    await new Promise(resolve => setTimeout(resolve, backoffDelay));

    setFormState(prev => ({
      ...prev,
      retryCount: prev.retryCount + 1,
      error: null,
    }));

    return true;
  }, [formState.retryCount, maxRetries]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!stripe || !elements) {
      setFormState(prev => ({
        ...prev,
        error: 'Payment system is not ready. Please try again.',
      }));
      return;
    }

    const cardElement = elements.getElement(CardElement);
    if (!cardElement) {
      setFormState(prev => ({
        ...prev,
        error: 'Card element not found. Please refresh the page.',
      }));
      return;
    }

    setFormState(prev => ({
      ...prev,
      isProcessing: true,
      error: null,
    }));

    try {
      const { error: cardError, paymentMethod } = await stripe.createPaymentMethod({
        type: 'card',
        card: cardElement,
        billing_details: {
          name: formState.name,
          email: formState.email,
        },
      });

      if (cardError) {
        throw new PaymentError(cardError.message || 'Card validation failed');
      }

      const paymentData = {
        amount,
        currency,
        paymentMethodId: paymentMethod.id,
        paymentMethod: PaymentMethod.CREDIT_CARD,
        email: formState.email,
      };

      const result = isSubscription
        ? await createSubscription(paymentData)
        : await processPayment(paymentData);

      if (result.success) {
        // Reset form
        formRef.current?.reset();
        cardElement.clear();
        setFormState(prev => ({
          ...prev,
          name: '',
          email: '',
          isProcessing: false,
          error: null,
          retryCount: 0,
        }));

        // Announce success to screen readers
        const message = isSubscription
          ? 'Subscription created successfully'
          : 'Payment processed successfully';
        announceToScreenReader(message);

        onSuccess?.(result.paymentIntentId!);
      } else {
        throw new PaymentError(result.error?.message || 'Payment processing failed');
      }
    } catch (error) {
      const shouldRetry = await handleRetry();
      if (shouldRetry) {
        handleSubmit(event);
        return;
      }

      const errorMessage = error instanceof PaymentError
        ? error.message
        : 'An unexpected error occurred. Please try again.';

      setFormState(prev => ({
        ...prev,
        isProcessing: false,
        error: errorMessage,
      }));

      onError?.(error as PaymentError);
      announceToScreenReader(`Payment error: ${errorMessage}`);
    }
  };

  const announceToScreenReader = (message: string) => {
    const announcement = document.createElement('div');
    announcement.setAttribute('role', 'alert');
    announcement.setAttribute('aria-live', 'assertive');
    announcement.className = 'sr-only';
    announcement.textContent = message;
    document.body.appendChild(announcement);
    setTimeout(() => document.body.removeChild(announcement), 1000);
  };

  return (
    <ErrorBoundary
      fallback={
        <div role="alert" className="text-error-500 p-4 rounded-lg bg-error-50">
          Payment form encountered an error. Please refresh the page.
        </div>
      }
    >
      <form
        ref={formRef}
        onSubmit={handleSubmit}
        className="space-y-6"
        aria-label="Payment form"
      >
        <Input
          id="name"
          name="name"
          type="text"
          label="Cardholder Name"
          value={formState.name}
          onChange={handleInputChange('name')}
          required
          disabled={formState.isProcessing}
          autoComplete="cc-name"
          aria-label="Enter cardholder name"
        />

        <Input
          id="email"
          name="email"
          type="email"
          label="Email Address"
          value={formState.email}
          onChange={handleInputChange('email')}
          required
          disabled={formState.isProcessing}
          autoComplete="email"
          aria-label="Enter email address"
        />

        <div className="space-y-2">
          <label
            htmlFor="card-element"
            className="block text-sm font-medium text-gray-700"
          >
            Card Details
          </label>
          <div
            className="p-4 border rounded-lg focus-within:ring-2 focus-within:ring-primary-500"
            id="card-element"
          >
            <CardElement
              options={CARD_ELEMENT_OPTIONS}
              onChange={e => {
                if (e.error) {
                  setFormState(prev => ({
                    ...prev,
                    error: e.error.message,
                  }));
                }
              }}
            />
          </div>
        </div>

        {formState.error && (
          <div
            role="alert"
            aria-live="polite"
            className="text-error-500 text-sm"
          >
            {formState.error}
          </div>
        )}

        <Button
          type="submit"
          disabled={!stripe || formState.isProcessing}
          loading={formState.isProcessing}
          fullWidth
          variant="primary"
          size="lg"
          analyticsId="payment-submit-button"
        >
          {isSubscription
            ? `Subscribe for ${amount} ${currency}`
            : `Pay ${amount} ${currency}`}
        </Button>

        <p className="text-sm text-gray-500 text-center">
          Your payment is secure and encrypted
        </p>
      </form>
    </ErrorBoundary>
  );
};