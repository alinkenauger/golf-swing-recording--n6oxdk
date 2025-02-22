/**
 * Date and time utility functions for the Video Coaching Platform web application.
 * Provides comprehensive date formatting, duration handling, and range calculations.
 * @version 1.0.0
 */

import { format, formatDistance, parseISO, addDays } from 'date-fns';
import type { BaseEntity } from '../types/common';

/**
 * Supported date range types for analytics and reporting
 */
export type DateRangeType = 'day' | 'week' | 'month' | 'quarter' | 'year' | 'custom';

/**
 * Custom date range interface for flexible date selection
 */
interface CustomDateRange {
  start: Date;
  end: Date;
}

/**
 * Date range result interface with timezone information
 */
interface DateRangeResult {
  startDate: Date;
  endDate: Date;
  timezone: string;
}

/**
 * Formats a date string or timestamp into a human-readable format with locale support.
 * @param date - The date to format (string, number, or Date)
 * @param formatStr - The format string (defaults to 'yyyy-MM-dd HH:mm:ss')
 * @param locale - Optional locale for internationalization
 * @returns Formatted date string
 * @throws {TypeError} If date parameter is invalid
 */
export const formatDate = (
  date: string | number | Date,
  formatStr: string = 'yyyy-MM-dd HH:mm:ss',
  locale?: Locale
): string => {
  try {
    let dateObj: Date;

    if (typeof date === 'string') {
      dateObj = parseISO(date);
    } else if (typeof date === 'number') {
      dateObj = new Date(date);
    } else if (date instanceof Date) {
      dateObj = date;
    } else {
      throw new TypeError('Invalid date parameter');
    }

    if (isNaN(dateObj.getTime())) {
      throw new TypeError('Invalid date value');
    }

    return format(dateObj, formatStr, { locale });
  } catch (error) {
    console.error('Error formatting date:', error);
    throw error;
  }
};

/**
 * Formats duration in seconds to HH:mm:ss format.
 * Used for video timestamps and recording durations.
 * @param seconds - Duration in seconds
 * @returns Formatted duration string
 * @throws {Error} If seconds is negative or invalid
 */
export const formatDuration = (seconds: number): string => {
  if (typeof seconds !== 'number' || seconds < 0) {
    throw new Error('Duration must be a non-negative number');
  }

  try {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.floor(seconds % 60);

    if (hours > 99) {
      throw new Error('Duration exceeds maximum supported length (99:59:59)');
    }

    const parts = [
      hours.toString().padStart(2, '0'),
      minutes.toString().padStart(2, '0'),
      remainingSeconds.toString().padStart(2, '0')
    ];

    return parts.join(':');
  } catch (error) {
    console.error('Error formatting duration:', error);
    throw error;
  }
};

/**
 * Gets start and end dates for a specified range type with timezone support.
 * Supports custom ranges and quarter calculations for analytics.
 * @param rangeType - Type of date range to calculate
 * @param customRange - Optional custom date range
 * @returns Object containing start date, end date, and timezone
 * @throws {Error} If range type is invalid or dates are out of bounds
 */
export const getDateRange = (
  rangeType: DateRangeType,
  customRange?: CustomDateRange
): DateRangeResult => {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const now = new Date();
  let startDate: Date;
  let endDate: Date = now;

  try {
    if (rangeType === 'custom') {
      if (!customRange?.start || !customRange?.end) {
        throw new Error('Custom range requires start and end dates');
      }
      startDate = customRange.start;
      endDate = customRange.end;

      if (endDate < startDate) {
        throw new Error('End date must be after start date');
      }
    } else {
      switch (rangeType) {
        case 'day':
          startDate = addDays(now, -1);
          break;
        case 'week':
          startDate = addDays(now, -7);
          break;
        case 'month':
          startDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
          break;
        case 'quarter':
          startDate = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3 - 3, 1);
          break;
        case 'year':
          startDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
          break;
        default:
          throw new Error(`Invalid range type: ${rangeType}`);
      }
    }

    // Validate date range is within acceptable bounds (max 5 years)
    const maxRangeInMs = 5 * 365 * 24 * 60 * 60 * 1000;
    if (endDate.getTime() - startDate.getTime() > maxRangeInMs) {
      throw new Error('Date range exceeds maximum allowed period (5 years)');
    }

    return { startDate, endDate, timezone };
  } catch (error) {
    console.error('Error calculating date range:', error);
    throw error;
  }
};

/**
 * Formats a relative time string from a date.
 * Used for chat messages and activity timestamps.
 * @param date - The date to format
 * @param baseDate - Optional base date for comparison (defaults to now)
 * @returns Formatted relative time string
 */
export const formatRelativeTime = (date: string | Date, baseDate: Date = new Date()): string => {
  try {
    const dateObj = typeof date === 'string' ? parseISO(date) : date;
    return formatDistance(dateObj, baseDate, { addSuffix: true });
  } catch (error) {
    console.error('Error formatting relative time:', error);
    throw error;
  }
};

/**
 * Formats entity timestamps from BaseEntity interface.
 * @param entity - Entity with createdAt and updatedAt fields
 * @returns Object containing formatted timestamps
 */
export const formatEntityDates = (entity: BaseEntity): { created: string; updated: string } => {
  return {
    created: formatDate(entity.createdAt),
    updated: formatDate(entity.updatedAt)
  };
};