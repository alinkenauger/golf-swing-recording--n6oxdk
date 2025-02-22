import React, { useMemo } from 'react';
import classNames from 'classnames'; // v2.x
import { MediaPlayer } from '@mui/material'; // v5.x
import { Message, MessageType } from '../../types/chat';
import { Avatar } from '../common/Avatar';
import { formatRelativeTime } from '../../utils/date';

/**
 * Props interface for MessageBubble component
 */
interface MessageBubbleProps {
  /** Message data object */
  message: Message;
  /** Whether the message is from the current user */
  isOwn: boolean;
  /** Profile of the message sender */
  senderProfile: UserProfile;
  /** Optional handler for media click events */
  onMediaClick?: () => void;
  /** Dark mode state for theming */
  isDarkMode?: boolean;
  /** Error handler for media loading failures */
  onError?: (error: Error) => void;
}

/**
 * Styles for message bubbles with dark mode and RTL support
 */
const BUBBLE_STYLES = {
  own: 'bg-primary-500 text-white rounded-l-lg rounded-tr-lg dark:bg-primary-600',
  other: 'bg-gray-100 text-gray-900 rounded-r-lg rounded-tl-lg dark:bg-gray-800 dark:text-gray-100',
  container: "flex items-start gap-2 mb-4 [dir='rtl']:flex-row-reverse"
} as const;

/**
 * Styles for media content with accessibility focus states
 */
const MEDIA_STYLES = {
  video: 'max-w-[240px] rounded-lg cursor-pointer focus:ring-2 focus:ring-primary-500',
  image: 'max-w-[240px] rounded-lg cursor-pointer focus:ring-2 focus:ring-primary-500',
  voice: 'w-[200px] focus:ring-2 focus:ring-primary-500'
} as const;

/**
 * ARIA labels for accessibility
 */
const ARIA_LABELS = {
  text: 'Text message',
  video: 'Video message',
  image: 'Image message',
  voice: 'Voice message',
  timestamp: 'Sent at',
  status: 'Message status'
} as const;

/**
 * Renders message content based on message type with accessibility support
 */
const getMessageContent = (
  message: Message,
  isDarkMode?: boolean
): React.ReactNode => {
  const { type, content, mediaUrl, metadata } = message;

  switch (type) {
    case MessageType.TEXT:
      return (
        <p
          className="break-words"
          dir={message.direction}
          role="textbox"
          aria-label={ARIA_LABELS.text}
        >
          {content}
        </p>
      );

    case MessageType.VIDEO:
      return (
        <div
          className={MEDIA_STYLES.video}
          role="button"
          tabIndex={0}
          aria-label={ARIA_LABELS.video}
        >
          <MediaPlayer
            src={mediaUrl!}
            poster={metadata?.thumbnail}
            width={metadata?.dimensions?.width || 240}
            height={metadata?.dimensions?.height || 135}
            controls
            aria-label={content || ARIA_LABELS.video}
          />
        </div>
      );

    case MessageType.IMAGE:
      return (
        <img
          src={mediaUrl!}
          alt={content || ARIA_LABELS.image}
          className={MEDIA_STYLES.image}
          loading="lazy"
          width={metadata?.dimensions?.width}
          height={metadata?.dimensions?.height}
          role="img"
          tabIndex={0}
        />
      );

    case MessageType.VOICE:
      return (
        <div className={MEDIA_STYLES.voice}>
          <MediaPlayer
            src={mediaUrl!}
            audio
            controls
            aria-label={ARIA_LABELS.voice}
            duration={metadata?.duration}
          />
        </div>
      );

    default:
      return null;
  }
};

/**
 * MessageBubble component for rendering chat messages with accessibility and RTL support
 */
export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  isOwn,
  senderProfile,
  onMediaClick,
  isDarkMode,
  onError
}) => {
  const timestamp = useMemo(
    () => formatRelativeTime(message.createdAt),
    [message.createdAt]
  );

  const bubbleClasses = classNames(
    'p-3 max-w-[70%] break-words',
    isOwn ? BUBBLE_STYLES.own : BUBBLE_STYLES.other
  );

  const handleMediaError = (error: Error) => {
    console.error('Media loading error:', error);
    onError?.(error);
  };

  return (
    <div
      className={BUBBLE_STYLES.container}
      dir={message.direction}
      data-testid="message-bubble"
    >
      {!isOwn && (
        <Avatar
          profile={senderProfile}
          size="sm"
          aria-label={`${senderProfile.firstName}'s avatar`}
        />
      )}
      
      <div className={isOwn ? 'ml-auto' : 'mr-auto'}>
        <div
          className={bubbleClasses}
          onClick={message.type !== MessageType.TEXT ? onMediaClick : undefined}
          onKeyPress={
            message.type !== MessageType.TEXT
              ? (e) => e.key === 'Enter' && onMediaClick?.()
              : undefined
          }
          role={message.type !== MessageType.TEXT ? 'button' : 'none'}
          tabIndex={message.type !== MessageType.TEXT ? 0 : undefined}
        >
          {getMessageContent(message, isDarkMode)}
        </div>
        
        <div
          className={classNames(
            'text-xs text-gray-500 mt-1',
            isOwn ? 'text-right' : 'text-left'
          )}
        >
          <time
            dateTime={message.createdAt}
            aria-label={ARIA_LABELS.timestamp}
          >
            {timestamp}
          </time>
          {isOwn && (
            <span
              className="ml-2"
              aria-label={ARIA_LABELS.status}
            >
              {message.status.toLowerCase()}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default MessageBubble;