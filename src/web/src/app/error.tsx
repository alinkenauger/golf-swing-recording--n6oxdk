'use client';

import React, { useEffect } from 'react';
import { Button } from '../components/common/Button';
import { ErrorBoundary } from '../components/common/ErrorBoundary';
import { ErrorMonitoring } from '@monitoring/client'; // v1.0.0

// Error severity levels for appropriate display and tracking
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

interface ErrorPageProps {
  error: Error;
  reset: () => void;
  severity?: ErrorSeverity;
}

// Initialize error monitoring client
const errorMonitor = new ErrorMonitoring({
  environment: process.env.NODE_ENV,
  release: process.env.NEXT_PUBLIC_VERSION,
  dsn: process.env.NEXT_PUBLIC_ERROR_MONITORING_DSN
});

/**
 * Enhanced error logging with monitoring integration
 */
const logError = (error: Error, severity: ErrorSeverity = ErrorSeverity.MEDIUM): void => {
  const errorContext = {
    severity,
    timestamp: new Date().toISOString(),
    url: window.location.href,
    userAgent: navigator.userAgent,
    stack: error.stack
  };

  // Send to monitoring service
  errorMonitor.captureException(error, {
    level: severity,
    extra: errorContext
  });

  // Log to console in development
  if (process.env.NODE_ENV === 'development') {
    console.error('Application Error:', error, errorContext);
  }
};

/**
 * Main error page component that displays error information and recovery options
 * with monitoring integration and accessibility features.
 */
const Error: React.FC<ErrorPageProps> = ({
  error,
  reset,
  severity = ErrorSeverity.MEDIUM
}) => {
  // Log error on mount
  useEffect(() => {
    logError(error, severity);
  }, [error, severity]);

  // Get error illustration based on severity
  const getErrorIllustration = () => {
    switch (severity) {
      case ErrorSeverity.CRITICAL:
        return '🚨';
      case ErrorSeverity.HIGH:
        return '⚠️';
      case ErrorSeverity.MEDIUM:
        return '⚡';
      default:
        return '❗';
    }
  };

  return (
    <ErrorBoundary
      onError={(boundaryError) => logError(boundaryError, ErrorSeverity.HIGH)}
      retryOnError
    >
      <div
        role="alert"
        aria-live="assertive"
        className="min-h-screen flex items-center justify-center p-4"
      >
        <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6">
          {/* Error Header */}
          <div className="text-center mb-6">
            <div className="text-4xl mb-4" aria-hidden="true">
              {getErrorIllustration()}
            </div>
            <h1 
              className="text-2xl font-bold text-gray-900 mb-2"
              tabIndex={-1}
              ref={(node) => node?.focus()}
            >
              Something went wrong
            </h1>
            <p className="text-gray-600">
              {process.env.NODE_ENV === 'development' 
                ? error.message 
                : "We're having trouble loading this page"}
            </p>
          </div>

          {/* Technical Details (Development Only) */}
          {process.env.NODE_ENV === 'development' && (
            <div 
              className="mb-6 p-4 bg-gray-50 rounded-md"
              aria-label="Technical error details"
            >
              <details>
                <summary className="text-sm font-medium text-gray-700 cursor-pointer">
                  Error Details
                </summary>
                <pre className="mt-2 text-xs text-gray-600 overflow-auto">
                  {error.stack}
                </pre>
              </details>
            </div>
          )}

          {/* Recovery Actions */}
          <div className="space-y-3">
            <Button
              variant="primary"
              fullWidth
              onClick={reset}
              startIcon={<span aria-hidden="true">↺</span>}
              analyticsId="error_page_retry"
            >
              Try again
            </Button>
            
            <Button
              variant="outline"
              fullWidth
              onClick={() => window.location.href = '/'}
              analyticsId="error_page_home"
            >
              Return to home
            </Button>

            <Button
              variant="secondary"
              fullWidth
              onClick={() => window.location.reload()}
              analyticsId="error_page_refresh"
            >
              Refresh page
            </Button>
          </div>

          {/* Support Link */}
          <div className="mt-6 text-center">
            <a
              href="/support"
              className="text-sm text-primary-600 hover:text-primary-700"
              onClick={() => errorMonitor.track('error_page_support_click')}
            >
              Contact support for help
            </a>
          </div>

          {/* Hidden error metadata for monitoring */}
          <div hidden aria-hidden="true">
            <span data-error-id={error.name} />
            <span data-error-severity={severity} />
            <span data-error-timestamp={new Date().toISOString()} />
          </div>
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default Error;