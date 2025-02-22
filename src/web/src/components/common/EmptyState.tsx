import React from 'react';
import { Button } from './Button';

interface EmptyStateProps {
  /** Main heading text for empty state display */
  title: string;
  /** Descriptive message explaining the empty state context */
  message: string;
  /** Optional icon element displayed above title */
  icon?: React.ReactNode;
  /** Text label for call-to-action button */
  actionLabel?: string;
  /** Callback function triggered on action button click */
  onAction?: () => void;
  /** Additional CSS classes for custom styling */
  className?: string;
}

/**
 * EmptyState component displays a message and optional action button when no content is available.
 * Implements design system specifications and accessibility standards.
 *
 * @example
 * <EmptyState
 *   title="No Videos Found"
 *   message="Upload your first video to get started with coaching"
 *   actionLabel="Upload Video"
 *   onAction={() => handleUpload()}
 * />
 */
export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  message,
  icon,
  actionLabel,
  onAction,
  className = '',
}) => {
  // Base container styles following design system spacing and responsive behavior
  const containerClasses = [
    'flex flex-col items-center justify-center',
    'p-4 md:p-8', // Responsive padding
    'text-center',
    'min-h-[200px]', // Minimum height for visual balance
    className,
  ].join(' ');

  return (
    <div
      className={containerClasses}
      role="region"
      aria-label={title}
    >
      {/* Icon with semantic color and sizing */}
      {icon && (
        <div 
          className="text-gray-400 w-12 h-12 mb-4 transition-all duration-200"
          aria-hidden="true"
        >
          {icon}
        </div>
      )}

      {/* Title using design system typography */}
      <h3 className="text-xl font-semibold text-gray-900 mb-2 font-sf-pro md:text-2xl">
        {title}
      </h3>

      {/* Message with proper text styling and max width for readability */}
      <p className="text-base text-gray-500 mb-6 max-w-md">
        {message}
      </p>

      {/* Conditionally render action button */}
      {actionLabel && onAction && (
        <div className="mt-4">
          <Button
            variant="primary"
            size="md"
            onClick={onAction}
            className="min-w-[120px]"
            aria-label={actionLabel}
          >
            {actionLabel}
          </Button>
        </div>
      )}
    </div>
  );
};

// Type export for external usage
export type { EmptyStateProps };