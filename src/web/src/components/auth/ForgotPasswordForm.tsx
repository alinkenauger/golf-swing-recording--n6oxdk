import React, { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next'; // v12.0.0
import { useAnalytics } from '@analytics/react'; // v0.1.0
import { validateEmail } from '../../utils/validation';
import { AuthService } from '../../services/auth.service';
import { Button } from '../common/Button';
import { Input } from '../common/Input';

interface ForgotPasswordFormProps {
  onSuccess?: () => void;
  onCancel?: () => void;
  className?: string;
}

export const ForgotPasswordForm: React.FC<ForgotPasswordFormProps> = ({
  onSuccess,
  onCancel,
  className
}) => {
  const { t } = useTranslation();
  const analytics = useAnalytics();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [attempts, setAttempts] = useState(0);

  // Debounced email validation
  const handleEmailChange = useCallback(async (value: string) => {
    setEmail(value);
    setError(null);

    // Track input interaction
    analytics.track('Forgot Password Email Input', {
      hasValue: value.length > 0
    });
  }, [analytics]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      // Validate email format
      const validation = await validateEmail(email);
      if (!validation.isValid) {
        setError(validation.errors[0]);
        return;
      }

      // Check rate limiting
      if (!AuthService.checkRateLimit(email)) {
        setError(t('auth.errors.tooManyAttempts'));
        return;
      }

      setLoading(true);
      setAttempts(prev => prev + 1);

      // Announce loading state to screen readers
      const statusElement = document.getElementById('reset-status');
      if (statusElement) {
        statusElement.textContent = t('auth.status.processing');
      }

      // Sanitize email input
      const sanitizedEmail = email.toLowerCase().trim();

      // Track reset attempt
      analytics.track('Password Reset Request', {
        attemptNumber: attempts + 1
      });

      // Call Auth0 password reset
      await AuthService.resetPassword(sanitizedEmail);

      setSuccess(true);
      setError(null);

      // Update ARIA live region
      if (statusElement) {
        statusElement.textContent = t('auth.status.resetEmailSent');
      }

      // Track successful reset request
      analytics.track('Password Reset Success');

      // Call success callback if provided
      onSuccess?.();

    } catch (err) {
      // Handle specific error cases
      const errorMessage = err instanceof Error ? 
        err.message : t('auth.errors.resetFailed');
      
      setError(errorMessage);
      setSuccess(false);

      // Track error
      analytics.track('Password Reset Error', {
        error: errorMessage
      });

    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={className}
      noValidate
      aria-labelledby="reset-heading"
    >
      <div className="space-y-6">
        <div className="text-center">
          <h2 
            id="reset-heading"
            className="text-2xl font-semibold text-gray-900"
          >
            {t('auth.resetPassword.title')}
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            {t('auth.resetPassword.description')}
          </p>
        </div>

        {/* Status announcer for screen readers */}
        <div
          id="reset-status"
          className="sr-only"
          role="status"
          aria-live="polite"
        />

        <Input
          id="email"
          name="email"
          type="email"
          label={t('common.email')}
          value={email}
          onChange={handleEmailChange}
          error={error || undefined}
          disabled={loading || success}
          required
          autoComplete="email"
          aria-describedby="email-error"
        />

        <div className="flex flex-col space-y-3">
          <Button
            type="submit"
            variant="primary"
            loading={loading}
            disabled={loading || success}
            fullWidth
            aria-label={t('auth.resetPassword.submitButton')}
          >
            {t('auth.resetPassword.submitButton')}
          </Button>

          {onCancel && (
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={loading}
              fullWidth
              aria-label={t('common.cancel')}
            >
              {t('common.cancel')}
            </Button>
          )}
        </div>

        {success && (
          <div
            className="rounded-md bg-green-50 p-4"
            role="alert"
          >
            <p className="text-sm font-medium text-green-800">
              {t('auth.resetPassword.successMessage')}
            </p>
          </div>
        )}
      </div>
    </form>
  );
};