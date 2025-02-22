// @package-version react@18.0.0
// @package-version classnames@2.3.2
import React from 'react';
import classNames from 'classnames';

/**
 * Props interface for the Card component defining all possible customization options
 */
interface CardProps {
  /** Content to be rendered inside the card */
  children: React.ReactNode;
  /** Additional CSS classes for custom styling */
  className?: string;
  /** Visual style variant affecting borders and shadows */
  variant?: 'default' | 'elevated' | 'outlined';
  /** Internal padding size following design system spacing */
  padding?: 'none' | 'small' | 'medium' | 'large';
  /** Optional click handler for interactive cards */
  onClick?: () => void;
  /** Data attribute for testing purposes */
  testId?: string;
  /** ARIA role for accessibility */
  role?: string;
  /** Tab index for keyboard navigation */
  tabIndex?: number;
}

/**
 * A flexible card container component that provides consistent styling and layout
 * with accessibility support following WCAG 2.1 Level AA guidelines.
 */
const Card: React.FC<CardProps> = ({
  children,
  className,
  variant = 'default',
  padding = 'medium',
  onClick,
  testId,
  role,
  tabIndex
}) => {
  // Base styles that apply to all cards
  const baseStyles = 'rounded-xl bg-white transition-all duration-200';

  // Variant-specific styles
  const variantStyles = {
    default: 'border border-gray-200 hover:border-gray-300',
    elevated: 'shadow-sm hover:shadow-md active:shadow-sm',
    outlined: 'border-2 border-gray-300 hover:border-gray-400'
  };

  // Padding options following design system spacing
  const paddingStyles = {
    none: 'p-0',
    small: 'p-4',
    medium: 'p-6',
    large: 'p-8'
  };

  // Interactive styles for clickable cards
  const interactiveStyles = onClick
    ? 'cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2'
    : '';

  // Accessibility enhancements
  const a11yStyles = 'focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2';

  // Dark mode support
  const darkModeStyles = 'dark:bg-gray-800 dark:border-gray-700';

  // Reduced motion support
  const motionStyles = 'motion-reduce:transition-none';

  // Combine all styles using classNames utility
  const cardStyles = classNames(
    baseStyles,
    variantStyles[variant],
    paddingStyles[padding],
    interactiveStyles,
    a11yStyles,
    darkModeStyles,
    motionStyles,
    className
  );

  // Determine appropriate ARIA attributes based on interactivity
  const ariaProps = onClick
    ? {
        role: role || 'button',
        tabIndex: tabIndex ?? 0,
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick();
          }
        }
      }
    : {
        role: role || 'article',
        tabIndex: tabIndex
      };

  return (
    <div
      className={cardStyles}
      onClick={onClick}
      data-testid={testId}
      {...ariaProps}
    >
      {children}
    </div>
  );
};

export default Card;