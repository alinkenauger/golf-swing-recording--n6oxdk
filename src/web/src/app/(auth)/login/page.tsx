'use client';

import React, { useEffect, useCallback } from 'react';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { LoginForm } from '../../components/auth/LoginForm';
import { useAuth } from '../../hooks/useAuth';

// Page metadata with security headers
export const metadata: Metadata = {
  title: 'Login - Video Coaching Platform',
  description: 'Secure login to access your video coaching dashboard and training content',
  robots: 'noindex, nofollow',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1',
  // Security headers
  openGraph: {
    type: 'website',
    title: 'Login - Video Coaching Platform',
    description: 'Secure login to access your video coaching dashboard',
  },
  other: {
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  },
};

/**
 * Enhanced login page component with comprehensive security features
 * and accessibility support
 */
const LoginPage: React.FC = () => {
  const {
    isAuthenticated,
    validateSession,
    login,
    socialLogin,
  } = useAuth();

  // Validate session on mount and visibility change
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        validateSession();
      }
    };

    validateSession();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [validateSession]);

  // Redirect authenticated users to dashboard
  useEffect(() => {
    if (isAuthenticated) {
      redirect('/dashboard');
    }
  }, [isAuthenticated]);

  // Handle social login
  const handleSocialLogin = useCallback(async (provider: 'google' | 'facebook' | 'apple') => {
    try {
      await socialLogin({ connection: provider });
    } catch (error) {
      console.error('Social login error:', error);
    }
  }, [socialLogin]);

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      {/* Skip link for accessibility */}
      <a
        href="#login-form"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 bg-white p-4 rounded-md shadow-md"
      >
        Skip to login form
      </a>

      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        {/* Logo and branding */}
        <img
          src="/logo.svg"
          alt="Video Coaching Platform"
          className="mx-auto h-12 w-auto"
          width={48}
          height={48}
        />
        <h1 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          Sign in to your account
        </h1>
        <p className="mt-2 text-center text-sm text-gray-600">
          Or{' '}
          <a
            href="/signup"
            className="font-medium text-primary-600 hover:text-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
          >
            start your 14-day free trial
          </a>
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div
          id="login-form"
          className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10"
          role="region"
          aria-label="Login form"
        >
          {/* Enhanced login form with security features */}
          <LoginForm />

          {/* Social login options */}
          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="bg-white px-2 text-gray-500">
                  Or continue with
                </span>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-3 gap-3">
              {/* Google login */}
              <button
                onClick={() => handleSocialLogin('google')}
                className="inline-flex w-full justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-500 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
                aria-label="Sign in with Google"
              >
                <span className="sr-only">Sign in with Google</span>
                <svg className="h-5 w-5" aria-hidden="true" fill="currentColor" viewBox="0 0 24 24">
                  {/* Google icon path */}
                </svg>
              </button>

              {/* Facebook login */}
              <button
                onClick={() => handleSocialLogin('facebook')}
                className="inline-flex w-full justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-500 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
                aria-label="Sign in with Facebook"
              >
                <span className="sr-only">Sign in with Facebook</span>
                <svg className="h-5 w-5" aria-hidden="true" fill="currentColor" viewBox="0 0 24 24">
                  {/* Facebook icon path */}
                </svg>
              </button>

              {/* Apple login */}
              <button
                onClick={() => handleSocialLogin('apple')}
                className="inline-flex w-full justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-500 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
                aria-label="Sign in with Apple"
              >
                <span className="sr-only">Sign in with Apple</span>
                <svg className="h-5 w-5" aria-hidden="true" fill="currentColor" viewBox="0 0 24 24">
                  {/* Apple icon path */}
                </svg>
              </button>
            </div>
          </div>

          {/* Help links */}
          <div className="mt-6 flex items-center justify-between">
            <div className="text-sm">
              <a
                href="/forgot-password"
                className="font-medium text-primary-600 hover:text-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
              >
                Forgot your password?
              </a>
            </div>
            <div className="text-sm">
              <a
                href="/help"
                className="font-medium text-primary-600 hover:text-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
              >
                Need help?
              </a>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
};

export default LoginPage;