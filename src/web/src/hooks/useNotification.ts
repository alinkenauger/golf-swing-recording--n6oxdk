import { useState, useEffect, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { ApiResponse } from '../types/common';

// Constants for notification system configuration
const DEFAULT_NOTIFICATION_DURATION = 5000;
const MAX_NOTIFICATIONS = 5;
const NOTIFICATION_QUEUE_LIMIT = 20;
const ARIA_LIVE_REGION_ID = 'notification-live-region';

/**
 * Enum defining notification types with severity levels
 * @version 1.0.0
 */
export enum NotificationType {
  SUCCESS = 'success',
  ERROR = 'error',
  WARNING = 'warning',
  INFO = 'info'
}

/**
 * Interface defining notification object structure with enhanced tracking
 * @version 1.0.0
 */
export interface Notification {
  id: string;
  type: NotificationType;
  message: string;
  duration: number;
  priority: number;
  createdAt: number;
}

/**
 * Custom hook for managing notifications with queue handling, accessibility support,
 * and automatic cleanup.
 * @returns Object containing notification management methods and current state
 * @version 1.0.0
 */
export const useNotification = () => {
  // State for active notifications and queue
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notificationQueue, setNotificationQueue] = useState<Notification[]>([]);
  
  // Refs for cleanup timers and ARIA live region
  const timersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const ariaLiveRegionRef = useRef<HTMLDivElement | null>(null);

  /**
   * Creates and manages the ARIA live region for accessibility
   */
  useEffect(() => {
    if (!document.getElementById(ARIA_LIVE_REGION_ID)) {
      const liveRegion = document.createElement('div');
      liveRegion.id = ARIA_LIVE_REGION_ID;
      liveRegion.setAttribute('aria-live', 'polite');
      liveRegion.setAttribute('aria-atomic', 'true');
      liveRegion.style.position = 'absolute';
      liveRegion.style.width = '1px';
      liveRegion.style.height = '1px';
      liveRegion.style.padding = '0';
      liveRegion.style.margin = '-1px';
      liveRegion.style.overflow = 'hidden';
      liveRegion.style.clip = 'rect(0, 0, 0, 0)';
      liveRegion.style.whiteSpace = 'nowrap';
      liveRegion.style.border = '0';
      document.body.appendChild(liveRegion);
      ariaLiveRegionRef.current = liveRegion;
    }

    return () => {
      if (ariaLiveRegionRef.current) {
        document.body.removeChild(ariaLiveRegionRef.current);
      }
    };
  }, []);

  /**
   * Updates ARIA live region with latest notification
   */
  useEffect(() => {
    if (notifications.length > 0 && ariaLiveRegionRef.current) {
      const latestNotification = notifications[notifications.length - 1];
      ariaLiveRegionRef.current.textContent = `${latestNotification.type} notification: ${latestNotification.message}`;
    }
  }, [notifications]);

  /**
   * Processes the notification queue when space becomes available
   */
  useEffect(() => {
    if (notifications.length < MAX_NOTIFICATIONS && notificationQueue.length > 0) {
      const [nextNotification, ...remainingQueue] = notificationQueue;
      setNotifications(prev => [...prev, nextNotification]);
      setNotificationQueue(remainingQueue);
      scheduleNotificationRemoval(nextNotification);
    }
  }, [notifications, notificationQueue]);

  /**
   * Schedules automatic removal of a notification after its duration
   */
  const scheduleNotificationRemoval = useCallback((notification: Notification) => {
    const timer = setTimeout(() => {
      removeNotification(notification.id);
    }, notification.duration);
    timersRef.current.set(notification.id, timer);
  }, []);

  /**
   * Removes a specific notification by ID
   */
  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(notification => notification.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  /**
   * Shows a new notification with optional configuration
   */
  const showNotification = useCallback((
    message: string,
    type: NotificationType,
    options?: {
      duration?: number;
      priority?: number;
    }
  ) => {
    const notification: Notification = {
      id: uuidv4(),
      type,
      message,
      duration: options?.duration || DEFAULT_NOTIFICATION_DURATION,
      priority: options?.priority || 0,
      createdAt: Date.now()
    };

    if (notifications.length >= MAX_NOTIFICATIONS) {
      if (notificationQueue.length >= NOTIFICATION_QUEUE_LIMIT) {
        // Remove lowest priority notification from queue
        const sortedQueue = [...notificationQueue].sort((a, b) => a.priority - b.priority);
        if (notification.priority > sortedQueue[0].priority) {
          setNotificationQueue(prev => 
            [...prev.slice(1), notification].sort((a, b) => b.priority - a.priority)
          );
        }
      } else {
        setNotificationQueue(prev => 
          [...prev, notification].sort((a, b) => b.priority - a.priority)
        );
      }
    } else {
      setNotifications(prev => [...prev, notification]);
      scheduleNotificationRemoval(notification);
    }
  }, [notifications, notificationQueue, scheduleNotificationRemoval]);

  /**
   * Utility method to show notification for API responses
   */
  const showApiNotification = useCallback((response: ApiResponse) => {
    if (response.success) {
      showNotification(
        'Operation completed successfully',
        NotificationType.SUCCESS
      );
    } else if (response.error) {
      showNotification(
        response.error.message || 'An error occurred',
        NotificationType.ERROR
      );
    }
  }, [showNotification]);

  /**
   * Clears all active notifications and queue
   */
  const clearNotifications = useCallback(() => {
    setNotifications([]);
    setNotificationQueue([]);
    timersRef.current.forEach(timer => clearTimeout(timer));
    timersRef.current.clear();
  }, []);

  /**
   * Returns the current queue length
   */
  const getQueueLength = useCallback(() => notificationQueue.length, [notificationQueue]);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      timersRef.current.forEach(timer => clearTimeout(timer));
      timersRef.current.clear();
    };
  }, []);

  return {
    notifications,
    showNotification,
    showApiNotification,
    removeNotification,
    clearNotifications,
    getQueueLength
  };
};