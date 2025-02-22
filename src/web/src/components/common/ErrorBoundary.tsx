import React from 'react'; // ^18.0.0
import { Loading } from './Loading';
import type { LoadingState } from '../../types/common';

interface ErrorBoundaryProps {
  /**
   * Child components to be rendered and monitored for errors
   */
  children: React.ReactNode;
  /**
   * Optional custom fallback UI to display when an error occurs
   */
  fallback?: React.ReactNode | null;
  /**
   * Optional callback function to handle errors externally
   */
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  /**
   * Enable automatic retry functionality when errors occur
   * @default false
   */
  retryOnError?: boolean;
  /**
   * Show loading indicator during error recovery
   * @default true
   */
  showLoading?: boolean;
}

interface ErrorBoundaryState {
  /**
   * Indicates if an error has occurred
   */
  hasError: boolean;
  /**
   * The error object if one exists
   */
  error: Error | null;
  /**
   * React error info containing component stack
   */
  errorInfo: React.ErrorInfo | null;
  /**
   * Indicates if component is attempting to recover from error
   */
  isRecovering: boolean;
  /**
   * Number of retry attempts made
   */
  retryCount: number;
}

/**
 * A React error boundary component that catches JavaScript errors anywhere in the
 * child component tree and displays a fallback UI. Includes enhanced error reporting,
 * retry functionality, and accessibility features.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  private readonly maxRetries: number = 3;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      isRecovering: false,
      retryCount: 0
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    // Update state to trigger fallback UI rendering
    return {
      hasError: true,
      error,
      isRecovering: false
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // Log error details for monitoring and debugging
    console.error('ErrorBoundary caught an error:', {
      error,
      componentStack: errorInfo.componentStack,
      timestamp: new Date().toISOString()
    });

    this.setState({
      errorInfo,
      isRecovering: false
    });

    // Call external error handler if provided
    if (this.props.onError) {
      try {
        this.props.onError(error, errorInfo);
      } catch (handlerError) {
        console.error('Error in error handler:', handlerError);
      }
    }

    // Attempt automatic recovery if enabled
    if (this.props.retryOnError && this.state.retryCount < this.maxRetries) {
      this.handleRetry();
    }
  }

  handleRetry = (): void => {
    if (this.state.retryCount >= this.maxRetries) {
      console.warn('Maximum retry attempts reached');
      return;
    }

    this.setState(prevState => ({
      isRecovering: true,
      retryCount: prevState.retryCount + 1
    }));

    // Delay retry to prevent immediate re-render
    setTimeout(() => {
      this.setState({
        hasError: false,
        error: null,
        errorInfo: null,
        isRecovering: false
      });
    }, 1000);
  };

  render(): React.ReactNode {
    const { hasError, error, isRecovering } = this.state;
    const { children, fallback, showLoading = true, retryOnError = false } = this.props;

    if (!hasError) {
      return children;
    }

    if (isRecovering && showLoading) {
      return (
        <Loading 
          size="large"
          message="Attempting to recover..."
          className="min-h-[200px]"
        />
      );
    }

    if (fallback) {
      return fallback;
    }

    return (
      <div
        role="alert"
        aria-live="assertive"
        className="p-4 rounded-lg bg-red-50 border border-red-100"
      >
        <div className="flex flex-col items-center text-center">
          <h2 className="text-lg font-semibold text-red-800 mb-2">
            Something went wrong
          </h2>
          <p className="text-sm text-red-600 mb-4">
            {error?.message || 'An unexpected error occurred'}
          </p>
          {retryOnError && this.state.retryCount < this.maxRetries && (
            <button
              onClick={this.handleRetry}
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
              aria-label="Retry loading the content"
            >
              Try Again
            </button>
          )}
          {this.state.retryCount >= this.maxRetries && (
            <p className="text-sm text-red-500 mt-2">
              Maximum retry attempts reached. Please refresh the page.
            </p>
          )}
        </div>
      </div>
    );
  }
}