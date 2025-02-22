import React, { useEffect, useRef, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion'; // @package-version framer-motion@10.16.4
import { useNotification, NotificationType, type Notification as NotificationType } from '../../hooks/useNotification';
import Toast from './Toast';

// Constants for notification positioning and limits
const NOTIFICATION_SPACING = 16;
const NOTIFICATION_OFFSET = 16;
const MAX_NOTIFICATIONS = 5;
const ANIMATION_DURATION = 0.3;

/**
 * Calculates the vertical position for a notification in the stack
 * @param index Position in the notification stack
 * @param height Height of the notification element
 * @returns Vertical position in pixels from the top
 */
const calculateNotificationPosition = (index: number, height: number): number => {
  const baseOffset = NOTIFICATION_OFFSET;
  const stackOffset = index * (height + NOTIFICATION_SPACING);
  const maxOffset = window.innerHeight - height - NOTIFICATION_OFFSET;
  
  return Math.min(baseOffset + stackOffset, maxOffset);
};

/**
 * A container component that manages and renders multiple toast notifications
 * with accessibility support and animation handling.
 */
const NotificationContainer: React.FC = () => {
  const { notifications, removeNotification } = useNotification();
  const containerRef = useRef<HTMLDivElement>(null);
  const notificationRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  /**
   * Handles keyboard navigation between notifications
   */
  const handleKeyboardNavigation = useCallback((event: KeyboardEvent) => {
    if (!containerRef.current || notifications.length === 0) return;

    const activeElement = document.activeElement;
    const notificationElements = Array.from(notificationRefs.current.values());
    const currentIndex = notificationElements.findIndex(el => el === activeElement);

    switch (event.key) {
      case 'ArrowUp':
        event.preventDefault();
        if (currentIndex > 0) {
          notificationElements[currentIndex - 1].focus();
        }
        break;
      case 'ArrowDown':
        event.preventDefault();
        if (currentIndex < notificationElements.length - 1) {
          notificationElements[currentIndex + 1].focus();
        }
        break;
    }
  }, [notifications.length]);

  // Setup keyboard event listeners
  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      container.addEventListener('keydown', handleKeyboardNavigation);
      return () => {
        container.removeEventListener('keydown', handleKeyboardNavigation);
      };
    }
  }, [handleKeyboardNavigation]);

  // Clear notification refs on unmount
  useEffect(() => {
    return () => {
      notificationRefs.current.clear();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="fixed top-0 right-0 z-50 pointer-events-none p-4 max-w-sm w-full focus-within:outline-none"
      role="region"
      aria-label="Notifications"
      aria-live="polite"
      aria-relevant="additions removals"
      data-testid="notification-container"
    >
      <AnimatePresence initial={false} mode="sync">
        {notifications.slice(0, MAX_NOTIFICATIONS).map((notification, index) => {
          const notificationHeight = 80; // Estimated height, will be updated on render
          const position = calculateNotificationPosition(index, notificationHeight);

          return (
            <div
              key={notification.id}
              ref={el => {
                if (el) {
                  notificationRefs.current.set(notification.id, el);
                } else {
                  notificationRefs.current.delete(notification.id);
                }
              }}
              style={{
                position: 'absolute',
                top: position,
                right: NOTIFICATION_OFFSET,
                width: 'calc(100% - 32px)',
                pointerEvents: 'auto'
              }}
              tabIndex={0}
              role="alert"
              aria-atomic="true"
            >
              <Toast
                id={notification.id}
                type={notification.type}
                message={notification.message}
                duration={notification.duration}
                onClose={() => removeNotification(notification.id)}
              />
            </div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};

export default NotificationContainer;