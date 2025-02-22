import React, { useRef, useState, useCallback } from 'react';
import classNames from 'classnames';
import type { LoadingState } from '../../types/common';

export interface InputProps {
  id: string;
  name: string;
  type: 'text' | 'email' | 'password' | 'number' | 'tel' | 'url' | 'search';
  label: string;
  value: string;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  required?: boolean;
  loadingState?: LoadingState;
  helpText?: string;
  className?: string;
  autoComplete?: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  onFocus?: () => void;
}

export const Input: React.FC<InputProps> = ({
  id,
  name,
  type = 'text',
  label,
  value,
  placeholder,
  error,
  disabled = false,
  required = false,
  loadingState,
  helpText,
  className,
  autoComplete,
  onChange,
  onBlur,
  onFocus,
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const errorId = `${id}-error`;
  const helpTextId = `${id}-help`;

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onChange(event.target.value);
    },
    [onChange]
  );

  const handleFocus = useCallback(
    (event: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(true);
      onFocus?.();
    },
    [onFocus]
  );

  const handleBlur = useCallback(
    (event: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(false);
      onBlur?.();
    },
    [onBlur]
  );

  const isLoading = loadingState?.state === 'loading';
  const hasError = !!error || loadingState?.state === 'error';

  const inputClasses = classNames(
    // Base styles
    'w-full px-4 py-2 border rounded-lg transition-all duration-200 font-sans text-base',
    // Focus states
    'focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none',
    // Error states
    {
      'border-error-500 focus:ring-error-500 focus:border-error-500 bg-error-50': hasError,
      'bg-gray-100 cursor-not-allowed opacity-75': disabled,
      'bg-gray-50 cursor-wait': isLoading,
    },
    className
  );

  const labelClasses = classNames(
    'block text-sm font-medium text-gray-700 mb-1',
    {
      'text-error-500': hasError,
    }
  );

  return (
    <div className="relative">
      <label
        htmlFor={id}
        className={labelClasses}
      >
        {label}
        {required && <span className="text-error-500 ml-1" aria-hidden="true">*</span>}
      </label>

      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          name={name}
          type={type}
          value={value}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          disabled={disabled || isLoading}
          required={required}
          placeholder={placeholder}
          autoComplete={autoComplete}
          aria-invalid={hasError}
          aria-required={required}
          aria-describedby={
            classNames({
              [errorId]: hasError,
              [helpTextId]: !!helpText && !hasError,
            })
          }
          className={inputClasses}
        />

        {isLoading && (
          <div 
            className="absolute right-3 top-1/2 transform -translate-y-1/2"
            aria-hidden="true"
          >
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary-500 border-t-transparent" />
            {loadingState?.progress !== undefined && (
              <span className="sr-only">
                Loading {Math.round(loadingState.progress)}%
              </span>
            )}
          </div>
        )}
      </div>

      {hasError && (
        <div
          id={errorId}
          role="alert"
          aria-live="polite"
          className="text-sm text-error-500 mt-1"
        >
          {error || loadingState?.error?.message}
        </div>
      )}

      {helpText && !hasError && (
        <div
          id={helpTextId}
          className="text-sm text-gray-500 mt-1"
        >
          {helpText}
        </div>
      )}
    </div>
  );
};