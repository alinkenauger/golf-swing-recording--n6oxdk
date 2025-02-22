import React from 'react'; // ^18.0.0

interface LoadingProps {
  /**
   * Controls the size of the loading spinner
   * small: 16px, medium: 24px, large: 32px
   */
  size?: 'small' | 'medium' | 'large';
  /**
   * Optional loading message displayed below the spinner
   */
  message?: string;
  /**
   * Additional CSS classes for custom styling
   */
  className?: string;
}

/**
 * Generates Tailwind CSS classes for different spinner sizes
 * @param size - The desired size of the spinner
 * @returns Tailwind CSS classes for the spinner dimensions
 */
const getSizeClasses = (size: LoadingProps['size'] = 'medium'): string => {
  switch (size) {
    case 'small':
      return 'w-4 h-4 border-2';
    case 'large':
      return 'w-8 h-8 border-4';
    case 'medium':
    default:
      return 'w-6 h-6 border-3';
  }
};

/**
 * A flexible loading spinner component that provides visual feedback
 * during asynchronous operations with accessibility support.
 */
export const Loading: React.FC<LoadingProps> = ({
  size = 'medium',
  message,
  className = '',
}) => {
  const sizeClasses = getSizeClasses(size);

  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className={`flex flex-col items-center justify-center p-4 ${className}`}
    >
      <div
        className={`
          ${sizeClasses}
          border-t-[#2D5BFF]
          border-r-[#2D5BFF]
          border-b-[#2D5BFF]
          border-l-gray-200
          rounded-full
          animate-spin
          motion-reduce:animate-[spin_1.5s_linear_infinite]
        `}
        aria-label="Loading content"
      />
      {message && (
        <p className="mt-2 text-sm text-gray-500 text-center" aria-label={message}>
          {message}
        </p>
      )}
    </div>
  );
};

export type { LoadingProps };