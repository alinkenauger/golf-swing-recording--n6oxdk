'use client';

import React, { useEffect, useState } from 'react';
import { useSearchParams, redirect } from 'next/navigation';
import { useErrorBoundary } from 'react-error-boundary';
import { ResetPasswordForm } from '../../../components/auth/ResetPasswordForm';
import { AuthService } from '../../../services/auth.service';

// Constants for security and validation
const TOKEN_VALIDATION_TIMEOUT = 5000; // 5 seconds
const MAX_VALIDATION_RETRIES = 3;

// Interface for page props with enhanced security types
interface ResetPasswordPageProps {
  searchParams: {
    token?: string;
    deviceId?: string;
  };
}

// Interface for token validation result
interface TokenValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Enhanced password reset page component with comprehensive security features
 * and accessibility compliance (WCAG 2.1 Level AA)
 */
const ResetPasswordPage: React.FC<ResetPasswordPageProps> = ({ searchParams }) => {
  // State management
  const [isValidating, setIsValidating] = useState(true);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [deviceFingerprint, setDeviceFingerprint] = useState<string | null>(null);

  // Hooks
  const { showBoundary } = useErrorBoundary();
  const params = useSearchParams();

  // Extract token from URL params with validation
  const token = params.get('token')?.trim();

  /**
   * Enhanced token validation with security checks and rate limiting
   */
  const validateToken = async (
    token: string,
    deviceId?: string
  ): Promise<TokenValidationResult> => {
    try {
      // Check rate limiting status
      const isRateLimited = await AuthService.checkRateLimit('reset_password');
      if (isRateLimited) {
        return {
          isValid: false,
          error: 'Too many attempts. Please try again later.'
        };
      }

      // Get device fingerprint for security binding
      const fingerprint = await AuthService.getDeviceFingerprint();
      setDeviceFingerprint(fingerprint);

      // Validate token with timeout
      const validationPromise = AuthService.validateResetToken(token);
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Token validation timeout')), TOKEN_VALIDATION_TIMEOUT);
      });

      const isValid = await Promise.race([validationPromise, timeoutPromise]);

      return { isValid };
    } catch (error) {
      console.error('Token validation error:', error);
      return {
        isValid: false,
        error: 'Invalid or expired reset token'
      };
    }
  };

  /**
   * Handle validation errors with retry logic
   */
  const handleValidationError = async () => {
    if (retryCount < MAX_VALIDATION_RETRIES) {
      setRetryCount(prev => prev + 1);
      await validateTokenWithRetry();
    } else {
      setValidationError('Unable to validate reset token. Please request a new one.');
      redirect('/forgot-password');
    }
  };

  /**
   * Validate token with retry mechanism
   */
  const validateTokenWithRetry = async () => {
    if (!token) {
      setValidationError('Reset token is required');
      setIsValidating(false);
      return;
    }

    try {
      const result = await validateToken(token, searchParams.deviceId);
      
      if (!result.isValid) {
        if (result.error) {
          setValidationError(result.error);
        }
        await handleValidationError();
      }
    } catch (error) {
      showBoundary(error);
    } finally {
      setIsValidating(false);
    }
  };

  // Validate token on mount
  useEffect(() => {
    validateTokenWithRetry();
  }, [token]);

  // Show loading state while validating
  if (isValidating) {
    return (
      <main 
        className="reset-password-container"
        aria-busy="true"
        aria-describedby="validation-status"
      >
        <div 
          id="validation-status"
          className="validation-status"
          role="status"
          aria-live="polite"
        >
          Validating reset token...
        </div>
      </main>
    );
  }

  // Show error state if validation failed
  if (validationError) {
    return (
      <main 
        className="reset-password-container"
        aria-describedby="error-message"
      >
        <div
          id="error-message"
          className="error-message"
          role="alert"
        >
          <h1>Password Reset Error</h1>
          <p>{validationError}</p>
          <a 
            href="/forgot-password"
            className="btn btn-primary"
            aria-label="Request new password reset link"
          >
            Request New Link
          </a>
        </div>
      </main>
    );
  }

  // Render reset password form
  return (
    <main 
      className="reset-password-container"
      aria-labelledby="reset-password-title"
    >
      <h1 id="reset-password-title" className="visually-hidden">
        Reset Your Password
      </h1>
      <ResetPasswordForm
        token={token!}
        deviceFingerprint={deviceFingerprint!}
        onValidationError={handleValidationError}
        onTokenExpired={() => redirect('/forgot-password')}
      />
    </main>
  );
};

// Metadata for the page
export const metadata = {
  title: 'Reset Password - Video Coaching Platform',
  robots: 'noindex, nofollow',
};

// Force dynamic behavior for security
export const dynamic = 'force-dynamic';

// Security headers
export const headers = {
  'Content-Security-Policy': "default-src 'self'",
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
};

export default ResetPasswordPage;