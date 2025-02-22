'use client';

import React, { useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'next-i18next';
import { useAuth } from '../../../hooks/useAuth';
import { ForgotPasswordForm } from '../../../components/auth/ForgotPasswordForm';
import { analytics } from '@segment/analytics-next';

/**
 * Enhanced forgot password page component with comprehensive security features
 * and accessibility enhancements.
 */
const ForgotPasswordPage: React.FC = () => {
  const router = useRouter();
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();

  // Initialize analytics
  useEffect(() => {
    analytics.page('Forgot Password', {
      path: '/forgot-password',
      title: 'Reset Password'
    });
  }, []);

  // Redirect authenticated users to dashboard
  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/dashboard');
    }
  }, [isAuthenticated, router]);

  // ARIA live region for status announcements
  useEffect(() => {
    const statusRegion = document.createElement('div');
    statusRegion.setAttribute('role', 'status');
    statusRegion.setAttribute('aria-live', 'polite');
    statusRegion.className = 'sr-only';
    statusRegion.id = 'status-announcer';
    document.body.appendChild(statusRegion);

    return () => {
      document.body.removeChild(statusRegion);
    };
  }, []);

  /**
   * Handles successful password reset request with analytics tracking
   * and accessibility announcements
   */
  const handleSuccess = useCallback(async (email: string) => {
    // Track successful reset request
    analytics.track('Password Reset Requested', {
      email: email,
      timestamp: new Date().toISOString()
    });

    // Update ARIA live region
    const statusAnnouncer = document.getElementById('status-announcer');
    if (statusAnnouncer) {
      statusAnnouncer.textContent = t('auth.resetPassword.successAnnouncement');
    }

    // Navigate to login with success message
    router.push('/login?reset=requested');
  }, [router, t]);

  /**
   * Handles form cancellation with proper focus management
   */
  const handleCancel = useCallback(() => {
    analytics.track('Password Reset Cancelled');
    router.push('/login');
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900" id="page-heading">
            {t('auth.resetPassword.title')}
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            {t('auth.resetPassword.description')}
          </p>
        </div>

        {/* Main content region */}
        <main 
          aria-labelledby="page-heading"
          className="mt-8 bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10"
        >
          <ForgotPasswordForm
            onSuccess={handleSuccess}
            onCancel={handleCancel}
            className="space-y-6"
          />
        </main>

        {/* Back to login link */}
        <div className="text-center">
          <button
            type="button"
            onClick={handleCancel}
            className="text-sm font-medium text-primary-600 hover:text-primary-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
            aria-label={t('auth.resetPassword.backToLogin')}
          >
            {t('auth.resetPassword.backToLogin')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ForgotPasswordPage;