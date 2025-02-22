'use client';

import React, { useEffect, memo } from 'react';
import { redirect } from 'next/navigation';
import { Analytics } from '@segment/analytics-next';
import { ErrorBoundary } from 'react-error-boundary';
import { DashboardLayout } from '../../components/layout/DashboardLayout';
import { useAuth } from '../../hooks/useAuth';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

/**
 * Root layout component for the dashboard section with authentication protection
 * and comprehensive error handling.
 */
const RootLayout = memo(({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, user, isLoading } = useAuth();

  // Handle authentication and role-based routing
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      // Track failed auth attempts
      Analytics.track('Authentication Failed', {
        timestamp: new Date().toISOString(),
        path: window.location.pathname
      });
      redirect('/login');
    }

    if (isAuthenticated && user) {
      // Track successful dashboard access
      Analytics.track('Dashboard Access', {
        userId: user.id,
        role: user.role,
        timestamp: new Date().toISOString()
      });
    }
  }, [isAuthenticated, isLoading, user]);

  // Handle error logging and reporting
  const handleError = (error: Error) => {
    console.error('Dashboard error:', error);
    Analytics.track('Dashboard Error', {
      error: error.message,
      userId: user?.id,
      timestamp: new Date().toISOString()
    });
  };

  // Show loading state during authentication
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <LoadingSpinner 
          size="large"
          message="Loading your dashboard..."
          aria-label="Loading dashboard content"
        />
      </div>
    );
  }

  // Ensure user is authenticated before rendering
  if (!isAuthenticated || !user) {
    return null;
  }

  return (
    <ErrorBoundary
      fallback={
        <div className="min-h-screen p-4 bg-red-50" role="alert">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="text-lg font-semibold text-red-800 mb-2">
              Something went wrong
            </h2>
            <p className="text-sm text-red-600">
              We encountered an error loading your dashboard. Please try refreshing the page.
            </p>
          </div>
        </div>
      }
      onError={handleError}
    >
      <DashboardLayout role={user.role}>
        {/* Main content area with ARIA landmarks */}
        <main 
          id="main-content" 
          className="flex-1 overflow-auto bg-gray-50"
          role="main"
          aria-label="Dashboard content"
        >
          {children}
        </main>
      </DashboardLayout>
    </ErrorBoundary>
  );
});

// Set display name for debugging
RootLayout.displayName = 'RootLayout';

export default RootLayout;