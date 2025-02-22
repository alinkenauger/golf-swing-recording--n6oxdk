'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Analytics } from '@segment/analytics-next';
import { SignupForm } from '../../../components/auth/SignupForm';
import { useAuth } from '../../../hooks/useAuth';
import { UserRole } from '../../../types/common';

// Initialize analytics
const analytics = new Analytics({
  writeKey: process.env.NEXT_PUBLIC_SEGMENT_WRITE_KEY || ''
});

/**
 * Metadata for Next.js page optimization
 */
export const metadata = {
  title: 'Sign Up - Video Coaching Platform',
  description: 'Create your account to start your coaching journey. Choose between coach and athlete roles.',
  robots: 'noindex, nofollow' // Prevent indexing of authentication pages
};

/**
 * SignupPage component handles user registration with role selection
 * and comprehensive security features.
 */
const SignupPage: React.FC = () => {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuth();

  /**
   * Handles successful signup completion
   * @param signupData - Data from successful signup
   */
  const handleSignupSuccess = async (signupData: { role: UserRole }) => {
    try {
      // Track successful signup
      await analytics.track('Signup Completed', {
        role: signupData.role,
        timestamp: new Date().toISOString(),
        platform: 'web'
      });

      // Determine dashboard route based on role
      const dashboardRoute = signupData.role === UserRole.COACH
        ? '/coach/dashboard'
        : '/athlete/dashboard';

      // Navigate to appropriate dashboard
      router.push(dashboardRoute);
    } catch (error) {
      console.error('Signup success handling error:', error);
      // Fallback to home page if navigation fails
      router.push('/');
    }
  };

  /**
   * Handles signup errors with analytics tracking
   * @param error - Error from signup attempt
   */
  const handleSignupError = async (error: Error) => {
    await analytics.track('Signup Error', {
      error: error.message,
      timestamp: new Date().toISOString()
    });
  };

  /**
   * Effect to check authentication state and redirect if needed
   */
  useEffect(() => {
    const checkAuthRedirect = async () => {
      try {
        if (!isLoading && isAuthenticated) {
          await analytics.track('Auth Redirect', {
            from: 'signup',
            timestamp: new Date().toISOString()
          });
          router.push('/dashboard');
        }
      } catch (error) {
        console.error('Auth redirect error:', error);
      }
    };

    checkAuthRedirect();
  }, [isLoading, isAuthenticated, router]);

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        {/* Logo and branding */}
        <img
          src="/logo.svg"
          alt="Video Coaching Platform"
          className="mx-auto h-12 w-auto"
        />
        <h1 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          Create your account
        </h1>
        <p className="mt-2 text-center text-sm text-gray-600">
          Or{' '}
          <a
            href="/login"
            className="font-medium text-primary-600 hover:text-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
            aria-label="Sign in to your existing account"
          >
            sign in to your existing account
          </a>
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          {/* Loading state */}
          {isLoading && (
            <div className="absolute inset-0 bg-white/80 flex items-center justify-center" aria-live="polite">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary-500 border-t-transparent" />
              <span className="sr-only">Loading...</span>
            </div>
          )}

          {/* Signup form */}
          <SignupForm
            onSuccess={handleSignupSuccess}
            onError={handleSignupError}
            className="space-y-6"
          />
        </div>
      </div>
    </main>
  );
};

export default SignupPage;