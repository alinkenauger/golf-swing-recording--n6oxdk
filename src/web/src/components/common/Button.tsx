import React, { useMemo } from 'react';
import classNames from 'classnames'; // v2.3.2
import { Spinner } from '@heroicons/react/24/solid'; // v2.0.0

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  fullWidth?: boolean;
  startIcon?: React.ReactElement;
  endIcon?: React.ReactElement;
  analyticsId?: string;
}

const getButtonClasses = (props: ButtonProps): string => {
  const {
    variant = 'primary',
    size = 'md',
    loading = false,
    fullWidth = false,
    disabled,
    className,
  } = props;

  return classNames(
    // Base styles with minimum touch target size
    'inline-flex items-center justify-center rounded-md font-medium transition-colors',
    'focus:outline-none focus:ring-2 focus:ring-offset-2',
    'min-h-[44px] min-w-[44px]',
    
    // Variant-specific styles
    {
      'bg-primary-600 text-white hover:bg-primary-700 focus:ring-primary-500 active:bg-primary-800': variant === 'primary',
      'bg-gray-200 text-gray-900 hover:bg-gray-300 focus:ring-gray-500 active:bg-gray-400': variant === 'secondary',
      'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 focus:ring-primary-500 active:bg-gray-100': variant === 'outline',
      'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500 active:bg-red-800': variant === 'danger',
    },

    // Size-specific styles
    {
      'px-3 py-2 text-sm': size === 'sm',
      'px-4 py-2 text-base': size === 'md',
      'px-6 py-3 text-lg': size === 'lg',
    },

    // State-specific styles
    {
      'opacity-50 cursor-not-allowed': disabled,
      'cursor-wait': loading,
      'w-full': fullWidth,
    },

    // RTL support
    'rtl:space-x-reverse',

    // Custom classes
    className
  );
};

const trackButtonClick = (analyticsId?: string) => {
  if (analyticsId && window.analytics) {
    window.analytics.track('Button Click', {
      buttonId: analyticsId,
      timestamp: new Date().toISOString(),
    });
  }
};

export const Button: React.FC<ButtonProps> = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant = 'primary',
      size = 'md',
      loading = false,
      fullWidth = false,
      startIcon,
      endIcon,
      disabled,
      onClick,
      analyticsId,
      type = 'button',
      ...props
    },
    ref
  ) => {
    const buttonClasses = useMemo(
      () => getButtonClasses({ variant, size, loading, fullWidth, disabled }),
      [variant, size, loading, fullWidth, disabled]
    );

    const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
      if (loading) return;

      trackButtonClick(analyticsId);
      onClick?.(event);
    };

    const spinnerSize = {
      sm: 'h-4 w-4',
      md: 'h-5 w-5',
      lg: 'h-6 w-6',
    }[size];

    return (
      <button
        ref={ref}
        type={type}
        className={buttonClasses}
        disabled={disabled || loading}
        onClick={handleClick}
        aria-busy={loading}
        aria-disabled={disabled || loading}
        {...props}
      >
        <span className="inline-flex items-center gap-2">
          {loading && (
            <Spinner
              className={classNames('animate-spin', spinnerSize)}
              aria-hidden="true"
            />
          )}
          
          {!loading && startIcon && (
            <span className="inline-flex" aria-hidden="true">
              {startIcon}
            </span>
          )}

          <span className={classNames({ 'opacity-0': loading })}>
            {children}
          </span>

          {!loading && endIcon && (
            <span className="inline-flex" aria-hidden="true">
              {endIcon}
            </span>
          )}
        </span>
      </button>
    );
  }
);

Button.displayName = 'Button';

export type { ButtonProps };