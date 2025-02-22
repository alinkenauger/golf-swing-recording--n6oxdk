import React, { useEffect, useRef, useState, useCallback } from 'react';
import classNames from 'classnames';
import { motion, AnimatePresence } from 'framer-motion';
import { LoadingState } from '../../types/common';

// Constants
const DROPDOWN_POSITIONS = ['top', 'bottom', 'auto'] as const;
const ANIMATION_DURATION = 150;
const MIN_TOUCH_TARGET_SIZE = 44;
const KEYBOARD_KEYS = {
  ARROW_UP: 'ArrowUp',
  ARROW_DOWN: 'ArrowDown',
  ENTER: 'Enter',
  ESCAPE: 'Escape',
  TAB: 'Tab',
} as const;

// Props interface
export interface DropdownProps {
  options: Array<{ value: string | number; label: string }>;
  value: string | number | Array<string | number>;
  onChange: (value: string | number | Array<string | number>) => void;
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
  error?: string;
  multiple?: boolean;
  searchable?: boolean;
  className?: string;
  position?: typeof DROPDOWN_POSITIONS[number];
  animationDuration?: number;
  'aria-label'?: string;
}

// Custom hooks
const useClickOutside = (ref: React.RefObject<HTMLElement>, callback: (event: MouseEvent) => void) => {
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        callback(event);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [ref, callback]);
};

const useKeyboardNavigation = (
  options: Array<{ value: string | number; label: string }>,
  onSelect: (value: string | number) => void,
  isOpen: boolean
) => {
  const [focusedIndex, setFocusedIndex] = useState(-1);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!isOpen) return;

      switch (event.key) {
        case KEYBOARD_KEYS.ARROW_UP:
          event.preventDefault();
          setFocusedIndex((prev) => (prev <= 0 ? options.length - 1 : prev - 1));
          break;
        case KEYBOARD_KEYS.ARROW_DOWN:
          event.preventDefault();
          setFocusedIndex((prev) => (prev === options.length - 1 ? 0 : prev + 1));
          break;
        case KEYBOARD_KEYS.ENTER:
          event.preventDefault();
          if (focusedIndex >= 0) {
            onSelect(options[focusedIndex].value);
          }
          break;
      }
    },
    [isOpen, options, focusedIndex, onSelect]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    if (!isOpen) {
      setFocusedIndex(-1);
    }
  }, [isOpen]);

  return { focusedIndex };
};

const Dropdown: React.FC<DropdownProps> = ({
  options,
  value,
  onChange,
  placeholder = 'Select an option',
  disabled = false,
  loading = false,
  error,
  multiple = false,
  searchable = false,
  className = '',
  position = 'bottom',
  animationDuration = ANIMATION_DURATION,
  'aria-label': ariaLabel,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredOptions = searchable
    ? options.filter((option) =>
        option.label.toLowerCase().includes(searchValue.toLowerCase())
      )
    : options;

  useClickOutside(dropdownRef, () => setIsOpen(false));

  const { focusedIndex } = useKeyboardNavigation(
    filteredOptions,
    (selectedValue) => {
      handleSelect(selectedValue);
      if (!multiple) setIsOpen(false);
    },
    isOpen
  );

  const handleSelect = (selectedValue: string | number) => {
    if (multiple) {
      const currentValues = Array.isArray(value) ? value : [];
      const newValues = currentValues.includes(selectedValue)
        ? currentValues.filter((v) => v !== selectedValue)
        : [...currentValues, selectedValue];
      onChange(newValues);
    } else {
      onChange(selectedValue);
    }
  };

  const getSelectedLabel = () => {
    if (multiple && Array.isArray(value)) {
      return value.length
        ? `${value.length} selected`
        : placeholder;
    }
    const selectedOption = options.find((option) => option.value === value);
    return selectedOption ? selectedOption.label : placeholder;
  };

  const dropdownClasses = classNames(
    'relative inline-block w-full',
    {
      'opacity-50 cursor-not-allowed': disabled,
      'cursor-pointer': !disabled,
    },
    className
  );

  const triggerClasses = classNames(
    'flex items-center justify-between w-full px-4 py-2 bg-white border rounded-md focus:outline-none focus:ring-2',
    {
      'border-red-500 focus:ring-red-200': error,
      'border-gray-300 focus:ring-primary-200': !error,
      'hover:border-primary-500': !disabled && !error,
    }
  );

  return (
    <div
      ref={dropdownRef}
      className={dropdownClasses}
      style={{ minHeight: MIN_TOUCH_TARGET_SIZE }}
    >
      <div
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        aria-controls="dropdown-list"
        aria-owns="dropdown-list"
        aria-disabled={disabled}
        aria-invalid={!!error}
        className={triggerClasses}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onKeyDown={(e) => {
          if (e.key === KEYBOARD_KEYS.ENTER || e.key === KEYBOARD_KEYS.SPACE) {
            e.preventDefault();
            !disabled && setIsOpen(!isOpen);
          }
        }}
        tabIndex={disabled ? -1 : 0}
      >
        {loading ? (
          <div className="flex items-center space-x-2">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
              className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full"
            />
            <span>Loading...</span>
          </div>
        ) : (
          <>
            {searchable && isOpen ? (
              <input
                ref={inputRef}
                type="text"
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                className="w-full border-none focus:outline-none"
                placeholder="Search..."
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <span className="truncate">{getSelectedLabel()}</span>
            )}
            <motion.svg
              animate={{ rotate: isOpen ? 180 : 0 }}
              transition={{ duration: animationDuration / 1000 }}
              className="w-4 h-4 ml-2"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </motion.svg>
          </>
        )}
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: animationDuration / 1000 }}
            className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg"
            style={{
              [position === 'top' ? 'bottom' : 'top']: '100%',
              maxHeight: '300px',
              overflowY: 'auto',
            }}
          >
            <ul
              id="dropdown-list"
              role="listbox"
              aria-multiselectable={multiple}
              className="py-1"
            >
              {filteredOptions.map((option, index) => {
                const isSelected = multiple
                  ? Array.isArray(value) && value.includes(option.value)
                  : value === option.value;

                return (
                  <li
                    key={option.value}
                    role="option"
                    aria-selected={isSelected}
                    className={classNames(
                      'px-4 py-2 cursor-pointer select-none',
                      {
                        'bg-primary-50 text-primary-700': isSelected,
                        'text-gray-900 hover:bg-gray-100': !isSelected,
                        'bg-gray-100': focusedIndex === index,
                      }
                    )}
                    onClick={() => handleSelect(option.value)}
                    style={{ minHeight: MIN_TOUCH_TARGET_SIZE }}
                  >
                    {multiple && (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}}
                        className="mr-2"
                      />
                    )}
                    {option.label}
                  </li>
                );
              })}
              {filteredOptions.length === 0 && (
                <li className="px-4 py-2 text-gray-500">No options found</li>
              )}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>

      {error && (
        <p role="alert" className="mt-1 text-sm text-red-500">
          {error}
        </p>
      )}
    </div>
  );
};

export default Dropdown;