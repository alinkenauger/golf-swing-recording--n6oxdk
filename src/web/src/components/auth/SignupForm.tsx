import React, { useState, useCallback } from 'react';
import { useForm } from 'react-hook-form'; // ^7.0.0
import { useRateLimit } from '@custom/hooks'; // ^1.0.0
import { validateEmail, validatePassword } from '../../utils/validation';
import { useAuth } from '../../hooks/useAuth';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { UserRole } from '../../types/common';

interface SignupFormProps {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
  className?: string;
}

interface SignupFormData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: UserRole.COACH | UserRole.ATHLETE;
}

export const SignupForm: React.FC<SignupFormProps> = ({
  onSuccess,
  onError,
  className
}) => {
  // Form state management with validation
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
    watch
  } = useForm<SignupFormData>();

  // Custom hooks
  const { signup, loading, deviceFingerprint } = useAuth();
  const { isRateLimited } = useRateLimit('signup', 5, '1m');

  // Local state for role selection
  const [selectedRole, setSelectedRole] = useState<UserRole.COACH | UserRole.ATHLETE>(UserRole.ATHLETE);

  // Form submission handler with security measures
  const onSubmit = useCallback(async (data: SignupFormData) => {
    try {
      // Check rate limiting
      if (isRateLimited()) {
        throw new Error('Too many signup attempts. Please try again later.');
      }

      // Enhanced email validation
      const emailValidation = await validateEmail(data.email);
      if (!emailValidation.isValid) {
        setError('email', { message: emailValidation.errors[0] });
        return;
      }

      // Enhanced password validation
      const passwordValidation = await validatePassword(data.password);
      if (!passwordValidation.isValid) {
        setError('password', { message: passwordValidation.errors[0] });
        return;
      }

      // Get device fingerprint for security
      const fingerprint = await deviceFingerprint();

      // Submit signup data with enhanced security
      await signup({
        ...data,
        role: selectedRole,
        deviceInfo: {
          fingerprint,
          userAgent: navigator.userAgent,
          platform: navigator.platform
        }
      });

      onSuccess?.();
    } catch (error) {
      console.error('Signup error:', error);
      onError?.(error as Error);
    }
  }, [signup, deviceFingerprint, isRateLimited, onSuccess, onError, selectedRole, setError]);

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className={className}
      noValidate
      aria-label="Sign up form"
    >
      <div className="space-y-6">
        {/* Email Input */}
        <Input
          id="email"
          type="email"
          label="Email Address"
          {...register('email', {
            required: 'Email is required',
            pattern: {
              value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
              message: 'Invalid email address'
            }
          })}
          error={errors.email?.message}
          autoComplete="email"
          required
          aria-describedby="email-error"
        />

        {/* Password Input with strength meter */}
        <Input
          id="password"
          type="password"
          label="Password"
          {...register('password', {
            required: 'Password is required',
            minLength: {
              value: 8,
              message: 'Password must be at least 8 characters'
            }
          })}
          error={errors.password?.message}
          autoComplete="new-password"
          required
          helpText="Must contain at least 8 characters, including uppercase, lowercase, numbers, and special characters"
          aria-describedby="password-error password-help"
        />

        {/* First Name Input */}
        <Input
          id="firstName"
          type="text"
          label="First Name"
          {...register('firstName', {
            required: 'First name is required',
            minLength: {
              value: 2,
              message: 'First name must be at least 2 characters'
            }
          })}
          error={errors.firstName?.message}
          autoComplete="given-name"
          required
          aria-describedby="firstName-error"
        />

        {/* Last Name Input */}
        <Input
          id="lastName"
          type="text"
          label="Last Name"
          {...register('lastName', {
            required: 'Last name is required',
            minLength: {
              value: 2,
              message: 'Last name must be at least 2 characters'
            }
          })}
          error={errors.lastName?.message}
          autoComplete="family-name"
          required
          aria-describedby="lastName-error"
        />

        {/* Role Selection */}
        <fieldset className="space-y-4">
          <legend className="text-sm font-medium text-gray-700">
            I want to join as a:
          </legend>
          <div className="space-y-2">
            <label className="inline-flex items-center">
              <input
                type="radio"
                value={UserRole.ATHLETE}
                checked={selectedRole === UserRole.ATHLETE}
                onChange={(e) => setSelectedRole(e.target.value as UserRole.ATHLETE)}
                className="form-radio h-4 w-4 text-primary-600"
                aria-describedby="role-athlete-description"
              />
              <span className="ml-3">Athlete</span>
            </label>
            <p
              id="role-athlete-description"
              className="text-sm text-gray-500 ml-7"
            >
              Get personalized coaching and feedback on your performance
            </p>

            <label className="inline-flex items-center">
              <input
                type="radio"
                value={UserRole.COACH}
                checked={selectedRole === UserRole.COACH}
                onChange={(e) => setSelectedRole(e.target.value as UserRole.COACH)}
                className="form-radio h-4 w-4 text-primary-600"
                aria-describedby="role-coach-description"
              />
              <span className="ml-3">Coach</span>
            </label>
            <p
              id="role-coach-description"
              className="text-sm text-gray-500 ml-7"
            >
              Provide coaching services and grow your online presence
            </p>
          </div>
        </fieldset>

        {/* Submit Button */}
        <Button
          type="submit"
          variant="primary"
          fullWidth
          loading={isSubmitting || loading}
          disabled={isSubmitting || loading}
          aria-label={isSubmitting ? 'Signing up...' : 'Sign up'}
        >
          {isSubmitting ? 'Signing up...' : 'Sign up'}
        </Button>
      </div>
    </form>
  );
};