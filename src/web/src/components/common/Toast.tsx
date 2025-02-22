import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import classNames from 'classnames';
import { NotificationType } from '../../hooks/useNotification';
import Card from './Card';

// @package-version react@18.2.0
// @package-version classnames@2.3.2
// @package-version framer-motion@10.16.4

/**
 * Props interface for Toast component with comprehensive type definitions
 */
interface ToastProps {
  /** Unique identifier for the toast notification */
  id: string;
  /** Severity level of the notification */
  type: NotificationType;
  /** Content of the notification message */
  message: string;
  /** Callback function to handle toast dismissal */
  onClose: () => void;
  /** Duration in milliseconds before auto-dismiss */
  duration?: number;
}

/**
 * Returns the appropriate icon component based on notification type
 */
const getToastIcon = (type: NotificationType): JSX.Element => {
  switch (type) {
    case NotificationType.SUCCESS:
      return (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
        </svg>
      );
    case NotificationType.ERROR:
      return (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
        </svg>
      );
    case NotificationType.WARNING:
      return (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
      );
    case NotificationType.INFO:
    default:
      return (
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
        </svg>
      );
  }
};

/**
 * Returns WCAG compliant style classes based on notification type
 */
const getToastStyles = (type: NotificationType): string => {
  const baseStyles = 'flex items-center p-4 border rounded-lg shadow-lg';
  
  switch (type) {
    case NotificationType.SUCCESS:
      return classNames(baseStyles, 'bg-success-50 text-success-800 border-success-200');
    case NotificationType.ERROR:
      return classNames(baseStyles, 'bg-error-50 text-error-800 border-error-200');
    case NotificationType.WARNING:
      return classNames(baseStyles, 'bg-warning-50 text-warning-800 border-warning-200');
    case NotificationType.INFO:
    default:
      return classNames(baseStyles, 'bg-info-50 text-info-800 border-info-200');
  }
};

/**
 * A toast notification component that displays temporary messages with accessibility support
 */
const Toast: React.FC<ToastProps> = ({
  id,
  type,
  message,
  onClose,
  duration = 5000
}) => {
  // Auto-dismiss effect
  useEffect(() => {
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [duration, onClose]);

  // Animation variants with reduced motion support
  const variants = {
    initial: { opacity: 0, x: 100 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 100 }
  };

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={id}
        initial="initial"
        animate="animate"
        exit="exit"
        variants={variants}
        transition={{ 
          type: "spring",
          stiffness: 400,
          damping: 30,
          duration: 0.3
        }}
        className="fixed top-4 right-4 z-50 min-w-[320px] max-w-[420px]"
      >
        <Card
          variant="elevated"
          padding="none"
          role="alert"
          aria-live="polite"
          aria-atomic="true"
          className={getToastStyles(type)}
          testId={`toast-${id}`}
        >
          <div className="flex-shrink-0 mr-3" aria-hidden="true">
            {getToastIcon(type)}
          </div>
          <div className="flex-1 mr-2">
            <p className="text-sm font-medium">{message}</p>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 rounded-lg p-1 transition-colors duration-200 hover:bg-black/5 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white focus:ring-primary-500"
            aria-label="Close notification"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </Card>
      </motion.div>
    </AnimatePresence>
  );
};

export default Toast;