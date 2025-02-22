/**
 * Comprehensive utility module providing type-safe, internationalized formatting functions
 * for currency, numbers, file sizes, and text content with robust error handling and 
 * accessibility support for the Video Coaching Platform web application.
 * @version 1.0.0
 */

import { memoize } from 'lodash';
import numeral from 'numeral'; // v2.0.6
import { PaymentStatus } from '../types/common';

/**
 * Type guard to check if a value is a finite number
 */
const isFiniteNumber = (value: unknown): value is number => {
  return typeof value === 'number' && Number.isFinite(value);
};

/**
 * Supported currency codes with their decimal places
 */
const CURRENCY_CONFIG: Record<string, { decimals: number }> = {
  USD: { decimals: 2 },
  EUR: { decimals: 2 },
  GBP: { decimals: 2 },
  JPY: { decimals: 0 }
};

/**
 * Formats monetary values with proper currency symbols and internationalization support
 * @param amount - The monetary amount to format
 * @param currency - The ISO currency code (e.g., 'USD', 'EUR')
 * @param locale - Optional locale string (defaults to user's locale)
 * @returns Formatted currency string with proper symbol placement
 */
export const formatCurrency = memoize((
  amount: number,
  currency: string,
  locale?: string
): string => {
  if (!isFiniteNumber(amount)) {
    throw new Error('Invalid amount provided for currency formatting');
  }

  if (!CURRENCY_CONFIG[currency]) {
    throw new Error(`Unsupported currency code: ${currency}`);
  }

  try {
    const formatter = new Intl.NumberFormat(locale || navigator.language, {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: CURRENCY_CONFIG[currency].decimals,
      maximumFractionDigits: CURRENCY_CONFIG[currency].decimals
    });

    const formatted = formatter.format(amount);
    return `<span aria-label="${amount} ${currency}">${formatted}</span>`;
  } catch (error) {
    console.error('Currency formatting error:', error);
    return `${currency} ${amount.toFixed(CURRENCY_CONFIG[currency].decimals)}`;
  }
});

/**
 * Formats numeric values with locale-aware thousand separators and configurable decimal places
 * @param value - The number to format
 * @param decimals - Number of decimal places
 * @param locale - Optional locale string
 * @returns Formatted number string with proper separators
 */
export const formatNumber = memoize((
  value: number,
  decimals: number = 0,
  locale?: string
): string => {
  if (!isFiniteNumber(value)) {
    throw new Error('Invalid number provided for formatting');
  }

  try {
    const formatter = new Intl.NumberFormat(locale || navigator.language, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });

    const formatted = formatter.format(value);
    return `<span aria-label="${value}">${formatted}</span>`;
  } catch (error) {
    console.error('Number formatting error:', error);
    return value.toFixed(decimals);
  }
});

/**
 * File size units in bytes
 */
const FILE_SIZE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];
const FILE_SIZE_BASE = 1024;

/**
 * Converts byte values to human-readable file sizes
 * @param bytes - The size in bytes
 * @param locale - Optional locale string
 * @returns Human-readable file size with appropriate unit
 */
export const formatFileSize = memoize((
  bytes: number,
  locale?: string
): string => {
  if (!isFiniteNumber(bytes) || bytes < 0) {
    throw new Error('Invalid byte value provided');
  }

  if (bytes === 0) return '0 B';

  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(FILE_SIZE_BASE)),
    FILE_SIZE_UNITS.length - 1
  );

  const value = bytes / Math.pow(FILE_SIZE_BASE, exponent);
  const unit = FILE_SIZE_UNITS[exponent];
  const formatted = formatNumber(value, exponent === 0 ? 0 : 2, locale);

  return `<span aria-label="${bytes} bytes">${formatted} ${unit}</span>`;
});

/**
 * Formats decimal values as percentages with locale support
 * @param value - The decimal value (0-1)
 * @param decimals - Number of decimal places
 * @param locale - Optional locale string
 * @returns Formatted percentage string
 */
export const formatPercentage = memoize((
  value: number,
  decimals: number = 0,
  locale?: string
): string => {
  if (!isFiniteNumber(value) || value < 0 || value > 1) {
    throw new Error('Invalid value for percentage (must be between 0 and 1)');
  }

  try {
    const formatter = new Intl.NumberFormat(locale || navigator.language, {
      style: 'percent',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });

    const formatted = formatter.format(value);
    return `<span aria-label="${value * 100}%">${formatted}</span>`;
  } catch (error) {
    console.error('Percentage formatting error:', error);
    return `${(value * 100).toFixed(decimals)}%`;
  }
});

/**
 * Intelligently truncates text content with ellipsis
 * @param text - The text to truncate
 * @param maxLength - Maximum length before truncation
 * @param preserveWords - Whether to preserve whole words
 * @returns Truncated text with ellipsis if needed
 */
export const truncateText = memoize((
  text: string,
  maxLength: number,
  preserveWords: boolean = true
): string => {
  if (typeof text !== 'string') {
    throw new Error('Invalid text provided for truncation');
  }

  if (!isFiniteNumber(maxLength) || maxLength <= 0) {
    throw new Error('Invalid maxLength provided for truncation');
  }

  if (text.length <= maxLength) {
    return text;
  }

  let truncated = text.slice(0, maxLength);

  if (preserveWords) {
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > 0) {
      truncated = truncated.slice(0, lastSpace);
    }
  }

  return `<span aria-label="${text}" title="${text}">${truncated}...</span>`;
});

/**
 * Type guard for supported currencies
 */
export const isSupportedCurrency = (currency: string): boolean => {
  return currency in CURRENCY_CONFIG;
};

/**
 * Validates and formats payment amounts based on status
 * @param amount - The payment amount
 * @param currency - The currency code
 * @param status - The payment status
 * @returns Formatted payment amount with status indication
 */
export const formatPaymentAmount = memoize((
  amount: number,
  currency: string,
  status: PaymentStatus
): string => {
  const formatted = formatCurrency(amount, currency);
  
  if (status === PaymentStatus.REFUNDED) {
    return `<span class="refunded" aria-label="Refunded: ${amount} ${currency}">-${formatted}</span>`;
  }
  
  return formatted;
});