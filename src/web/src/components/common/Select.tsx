import React, { useCallback, useEffect, useRef, useState } from 'react';
import classNames from 'classnames';
import { LoadingState } from '../../types/common';

// Interface for individual select options
export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

// Comprehensive props interface for the Select component
export interface SelectProps {
  name: string;
  label: string;
  options: SelectOption[];
  value: string | string[];
  onChange: (value: string | string[]) => void;
  disabled?: boolean;
  isMulti?: boolean;
  isSearchable?: boolean;
  isLoading?: boolean;
  placeholder?: string;
  error?: string;
  className?: string;
  loadingMessage?: string;
  noOptionsMessage?: string;
  maxHeight?: number;
  closeOnSelect?: boolean;
  isOptionDisabled?: (option: SelectOption) => boolean;
}

export const Select: React.FC<SelectProps> = ({
  name,
  label,
  options,
  value,
  onChange,
  disabled = false,
  isMulti = false,
  isSearchable = false,
  isLoading = false,
  placeholder = 'Select an option',
  error,
  className = '',
  loadingMessage = 'Loading options...',
  noOptionsMessage = 'No options available',
  maxHeight = 300,
  closeOnSelect = !isMulti,
  isOptionDisabled = (option) => option.disabled || false,
}) => {
  // Component state
  const [isOpen, setIsOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [hoveredIndex, setHoveredIndex] = useState(-1);
  
  // Refs for DOM elements
  const selectRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const optionsRef = useRef<HTMLDivElement>(null);

  // Convert value to array for consistent handling
  const selectedValues = Array.isArray(value) ? value : [value];
  
  // Filter options based on search value
  const filteredOptions = options.filter(option => 
    option.label.toLowerCase().includes(searchValue.toLowerCase())
  );

  // Get selected options
  const selectedOptions = options.filter(option => 
    selectedValues.includes(option.value)
  );

  // Handle dropdown open/close
  const handleOpen = useCallback(() => {
    if (!disabled) {
      setIsOpen(!isOpen);
      setSearchValue('');
      setFocusedIndex(-1);
      
      if (!isOpen && isSearchable) {
        setTimeout(() => searchInputRef.current?.focus(), 0);
      }
    }
  }, [disabled, isOpen, isSearchable]);

  // Handle option selection
  const handleSelect = useCallback((option: SelectOption) => {
    if (isOptionDisabled(option)) return;

    if (isMulti) {
      const newValue = selectedValues.includes(option.value)
        ? selectedValues.filter(v => v !== option.value)
        : [...selectedValues, option.value];
      onChange(newValue);
    } else {
      onChange(option.value);
    }

    if (closeOnSelect) {
      setIsOpen(false);
    }
  }, [isMulti, selectedValues, onChange, closeOnSelect, isOptionDisabled]);

  // Handle search input changes
  const handleSearch = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchValue(event.target.value);
    setFocusedIndex(-1);
  }, []);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (disabled) return;

    switch (event.key) {
      case 'Enter':
        event.preventDefault();
        if (isOpen && focusedIndex >= 0) {
          handleSelect(filteredOptions[focusedIndex]);
        } else {
          setIsOpen(true);
        }
        break;

      case ' ':
        if (!isSearchable) {
          event.preventDefault();
          setIsOpen(true);
        }
        break;

      case 'ArrowDown':
        event.preventDefault();
        if (!isOpen) {
          setIsOpen(true);
        } else {
          setFocusedIndex(prev => 
            Math.min(prev + 1, filteredOptions.length - 1)
          );
        }
        break;

      case 'ArrowUp':
        event.preventDefault();
        setFocusedIndex(prev => Math.max(prev - 1, -1));
        break;

      case 'Home':
        event.preventDefault();
        setFocusedIndex(0);
        break;

      case 'End':
        event.preventDefault();
        setFocusedIndex(filteredOptions.length - 1);
        break;

      case 'Escape':
        event.preventDefault();
        setIsOpen(false);
        break;

      case 'Tab':
        if (isOpen) {
          setIsOpen(false);
        }
        break;
    }
  }, [disabled, isOpen, focusedIndex, filteredOptions, handleSelect, isSearchable]);

  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (selectRef.current && !selectRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Scroll focused option into view
  useEffect(() => {
    if (isOpen && focusedIndex >= 0 && optionsRef.current) {
      const focusedOption = optionsRef.current.children[focusedIndex] as HTMLElement;
      if (focusedOption) {
        focusedOption.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [isOpen, focusedIndex]);

  return (
    <div
      ref={selectRef}
      className={classNames(
        'relative w-full',
        className,
        { 'opacity-50 cursor-not-allowed': disabled }
      )}
    >
      {/* Label */}
      <label
        htmlFor={name}
        className="block text-sm font-medium text-gray-700 mb-1"
        id={`${name}-label`}
      >
        {label}
      </label>

      {/* Select button */}
      <div
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-controls={`${name}-options`}
        aria-labelledby={`${name}-label`}
        aria-disabled={disabled}
        aria-invalid={!!error}
        tabIndex={disabled ? -1 : 0}
        className={classNames(
          'relative w-full min-h-[40px] px-3 py-2 bg-white border rounded-md shadow-sm',
          'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500',
          {
            'border-red-500': error,
            'border-gray-300': !error,
            'cursor-pointer': !disabled,
            'cursor-not-allowed': disabled
          }
        )}
        onClick={handleOpen}
        onKeyDown={handleKeyDown}
      >
        {/* Selected value(s) display */}
        <div className="flex flex-wrap gap-1">
          {selectedOptions.length > 0 ? (
            selectedOptions.map(option => (
              <span
                key={option.value}
                className="inline-flex items-center px-2 py-0.5 rounded-full text-sm bg-blue-100 text-blue-800"
              >
                {option.label}
                {isMulti && (
                  <button
                    type="button"
                    className="ml-1 focus:outline-none"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelect(option);
                    }}
                    aria-label={`Remove ${option.label}`}
                  >
                    ×
                  </button>
                )}
              </span>
            ))
          ) : (
            <span className="text-gray-500">{placeholder}</span>
          )}
        </div>

        {/* Dropdown arrow */}
        <span className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
          <svg
            className="h-5 w-5 text-gray-400"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </span>
      </div>

      {/* Dropdown menu */}
      {isOpen && (
        <div
          className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg"
          role="presentation"
        >
          {/* Search input */}
          {isSearchable && (
            <div className="p-2">
              <input
                ref={searchInputRef}
                type="text"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                value={searchValue}
                onChange={handleSearch}
                placeholder="Search options..."
                aria-autocomplete="list"
                aria-controls={`${name}-options`}
              />
            </div>
          )}

          {/* Options list */}
          <div
            ref={optionsRef}
            id={`${name}-options`}
            role="listbox"
            aria-multiselectable={isMulti}
            className="max-h-[300px] overflow-auto"
            style={{ maxHeight }}
          >
            {isLoading ? (
              <div
                className="p-2 text-center text-gray-500"
                role="status"
                aria-live="polite"
              >
                {loadingMessage}
              </div>
            ) : filteredOptions.length === 0 ? (
              <div
                className="p-2 text-center text-gray-500"
                role="status"
                aria-live="polite"
              >
                {noOptionsMessage}
              </div>
            ) : (
              filteredOptions.map((option, index) => {
                const isSelected = selectedValues.includes(option.value);
                const isDisabled = isOptionDisabled(option);

                return (
                  <div
                    key={option.value}
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={isDisabled}
                    className={classNames(
                      'px-3 py-2 cursor-pointer',
                      {
                        'bg-blue-100': index === focusedIndex,
                        'bg-blue-50': isSelected && index !== focusedIndex,
                        'hover:bg-gray-100': !isDisabled && index !== focusedIndex,
                        'opacity-50 cursor-not-allowed': isDisabled
                      }
                    )}
                    onClick={() => !isDisabled && handleSelect(option)}
                    onMouseEnter={() => setHoveredIndex(index)}
                    onMouseLeave={() => setHoveredIndex(-1)}
                  >
                    {option.label}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div
          className="mt-1 text-sm text-red-600"
          role="alert"
          id={`${name}-error`}
        >
          {error}
        </div>
      )}
    </div>
  );
};