import React, { useCallback, useState, useRef } from 'react';
import { useForm } from 'react-hook-form'; // ^7.0.0
import { useAuth } from '../../hooks/useAuth';
import { Button } from '../common/Button';
import { Input } from '../common/Input';

interface LoginFormData {
  email: string;
  password: string;
}

export const LoginForm: React.FC = () => {
  // Form state management with validation
  const {
    register,
    handleSubmit,
    formState: { errors },
    setError,
  } = useForm<LoginFormData>();

  // Authentication hook
  const { login, loading, error: authError } = useAuth();

  // State for managing form submission and accessibility
  const [isSubmitting, setIsSubmitting] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);

  // Email validation pattern
  const emailPattern = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;

  // Password validation pattern (8+ chars, 1 number, 1 special char)
  const passwordPattern = /^(?=.*[0-9])(?=.*[!@#$%^&*])[a-zA-Z0-9!@#$%^&*]{8,}$/;

  const onSubmit = useCallback(async (data: LoginFormData) => {
    try {
      setIsSubmitting(true);

      await login({
        email: data.email,
        password: data.password,
      });
    } catch (error) {
      // Handle specific error cases
      if (error instanceof Error) {
        if (error.message.includes('credentials')) {
          setError('email', { message: 'Invalid email or password' });
          setError('password', { message: 'Invalid email or password' });
        } else {
          setError('root.serverError', { 
            message: 'An error occurred. Please try again.' 
          });
        }
        
        // Focus on error message for screen readers
        errorRef.current?.focus();
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [login, setError]);

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-6"
      noValidate
      aria-label="Login form"
    >
      {/* Email Input */}
      <Input
        id="email"
        type="email"
        label="Email Address"
        error={errors.email?.message}
        disabled={isSubmitting}
        required
        autoComplete="email"
        {...register('email', {
          required: 'Email is required',
          pattern: {
            value: emailPattern,
            message: 'Please enter a valid email address'
          }
        })}
        aria-invalid={!!errors.email}
        aria-describedby={errors.email ? 'email-error' : undefined}
      />

      {/* Password Input */}
      <Input
        id="password"
        type="password"
        label="Password"
        error={errors.password?.message}
        disabled={isSubmitting}
        required
        autoComplete="current-password"
        {...register('password', {
          required: 'Password is required',
          pattern: {
            value: passwordPattern,
            message: 'Password must be at least 8 characters with one number and special character'
          }
        })}
        aria-invalid={!!errors.password}
        aria-describedby={errors.password ? 'password-error' : undefined}
      />

      {/* Error Message Region */}
      {(authError || errors.root?.serverError) && (
        <div
          ref={errorRef}
          role="alert"
          aria-live="polite"
          className="text-error-500 text-sm p-2 rounded bg-error-50"
          tabIndex={-1}
        >
          {authError || errors.root?.serverError.message}
        </div>
      )}

      {/* Submit Button */}
      <Button
        type="submit"
        variant="primary"
        fullWidth
        loading={isSubmitting || loading}
        disabled={isSubmitting || loading}
        aria-label={isSubmitting ? 'Signing in...' : 'Sign in'}
      >
        Sign in
      </Button>
    </form>
  );
};