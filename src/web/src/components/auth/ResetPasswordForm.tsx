import React, { useState, useEffect } from 'react';
import { useForm } from '../../hooks/useForm';
import { AuthService } from '../../services/auth.service';
import zxcvbn from 'zxcvbn'; // v4.4.2
import { useRateLimiter } from '@custom/hooks'; // v1.0.0
import { PasswordStrengthIndicator } from '@custom/components'; // v1.0.0
import { NotificationType } from '../../hooks/useNotification';

// Constants for password validation
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 32;
const PASSWORD_MIN_SCORE = 3;

interface ResetPasswordFormProps {
  token: string;
  maxAttempts?: number;
}

interface ResetPasswordValues {
  password: string;
  confirmPassword: string;
}

const ResetPasswordForm: React.FC<ResetPasswordFormProps> = ({ 
  token, 
  maxAttempts = 5 
}) => {
  const [isTokenValid, setIsTokenValid] = useState(false);
  const [passwordScore, setPasswordScore] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { isRateLimited, incrementAttempts } = useRateLimiter(maxAttempts);

  // Form validation schema
  const validationSchema = {
    password: (value: string) => {
      if (!value) return 'Password is required';
      if (value.length < PASSWORD_MIN_LENGTH) return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
      if (value.length > PASSWORD_MAX_LENGTH) return `Password must be less than ${PASSWORD_MAX_LENGTH} characters`;
      if (!/[A-Z]/.test(value)) return 'Password must contain at least one uppercase letter';
      if (!/[a-z]/.test(value)) return 'Password must contain at least one lowercase letter';
      if (!/[0-9]/.test(value)) return 'Password must contain at least one number';
      if (!/[!@#$%^&*(),.?":{}|<>]/.test(value)) return 'Password must contain at least one special character';
      if (passwordScore < PASSWORD_MIN_SCORE) return 'Password is not strong enough';
      return '';
    },
    confirmPassword: (value: string, values: ResetPasswordValues) => {
      if (!value) return 'Please confirm your password';
      if (value !== values.password) return 'Passwords do not match';
      return '';
    }
  };

  const {
    values,
    errors,
    touched,
    handleChange,
    handleSubmit,
    getFieldProps
  } = useForm<ResetPasswordValues>({
    initialValues: { password: '', confirmPassword: '' },
    validationSchema,
    onSubmit: handleResetPassword
  });

  // Validate token on mount
  useEffect(() => {
    validateResetToken();
  }, [token]);

  // Validate reset token
  const validateResetToken = async () => {
    try {
      const isValid = await AuthService.validateResetToken(token);
      setIsTokenValid(isValid);
      if (!isValid) {
        throw new Error('Invalid or expired reset token');
      }
    } catch (error) {
      console.error('Token validation error:', error);
      setIsTokenValid(false);
    }
  };

  // Handle password field changes with strength checking
  const handlePasswordChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = event.target;
    handleChange(event);

    // Calculate password strength
    const result = zxcvbn(value);
    setPasswordScore(result.score);
  };

  // Handle form submission
  async function handleResetPassword(values: ResetPasswordValues) {
    if (isRateLimited || !isTokenValid) return;

    try {
      setIsSubmitting(true);
      incrementAttempts();

      // Get device fingerprint for security
      const deviceFingerprint = await AuthService.getDeviceFingerprint();

      await AuthService.resetPassword({
        token,
        newPassword: values.password,
        deviceFingerprint
      });

      // Show success notification and redirect
      window.location.href = '/login?reset=success';
    } catch (error) {
      console.error('Password reset error:', error);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!isTokenValid) {
    return (
      <div role="alert" className="error-container">
        <h2>Invalid Reset Link</h2>
        <p>This password reset link is invalid or has expired. Please request a new one.</p>
        <a href="/forgot-password" className="btn btn-primary">
          Request New Link
        </a>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="reset-password-form"
      noValidate
      aria-labelledby="reset-password-title"
    >
      <h1 id="reset-password-title" className="form-title">
        Reset Your Password
      </h1>

      <div className="form-group">
        <label htmlFor="password" className="form-label">
          New Password
        </label>
        <div className="password-input-wrapper">
          <input
            {...getFieldProps('password')}
            type="password"
            id="password"
            onChange={handlePasswordChange}
            className={`form-control ${touched.password && errors.password ? 'is-invalid' : ''}`}
            aria-describedby="password-requirements password-strength"
            autoComplete="new-password"
          />
          <PasswordStrengthIndicator score={passwordScore} />
        </div>
        <div id="password-requirements" className="form-text">
          Password must be 8-32 characters and contain uppercase, lowercase, number, and special character
        </div>
        {touched.password && errors.password && (
          <div className="invalid-feedback" role="alert">
            {errors.password}
          </div>
        )}
      </div>

      <div className="form-group">
        <label htmlFor="confirmPassword" className="form-label">
          Confirm Password
        </label>
        <input
          {...getFieldProps('confirmPassword')}
          type="password"
          id="confirmPassword"
          className={`form-control ${touched.confirmPassword && errors.confirmPassword ? 'is-invalid' : ''}`}
          autoComplete="new-password"
        />
        {touched.confirmPassword && errors.confirmPassword && (
          <div className="invalid-feedback" role="alert">
            {errors.confirmPassword}
          </div>
        )}
      </div>

      <button
        type="submit"
        className="btn btn-primary w-100"
        disabled={isSubmitting || isRateLimited}
        aria-busy={isSubmitting}
      >
        {isSubmitting ? 'Resetting Password...' : 'Reset Password'}
      </button>

      {isRateLimited && (
        <div role="alert" className="rate-limit-warning">
          Too many attempts. Please try again later.
        </div>
      )}
    </form>
  );
};

export default ResetPasswordForm;