import React, { useCallback, useMemo, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useTranslation } from 'react-i18next';
import debounce from 'lodash/debounce'; // v4.17.21

import { useChat } from '../../hooks/useChat';
import { ChatThread, MessageType } from '../../types/chat';
import { EmptyState } from '../common/EmptyState';
import { User } from '../../types/user';

interface ChatListProps {
  userId: string;
  className?: string;
  onThreadSelect?: (thread: ChatThread) => void;
  isLoading?: boolean;
  error?: Error | null;
}

/**
 * ChatList component displays a virtualized list of chat threads with real-time updates
 * Implements comprehensive error handling and accessibility features
 */
export const ChatList: React.FC<ChatListProps> = ({
  userId,
  className = '',
  onThreadSelect,
  isLoading = false,
  error = null,
}) => {
  const { t } = useTranslation();
  const dispatch = useDispatch();

  // Chat hook for real-time updates and thread management
  const {
    activeThread,
    setActiveThread,
    markThreadRead,
    useWebSocketConnection,
  } = useChat(userId);

  // Get threads from Redux store
  const threads = useSelector((state: any) => state.chat.threads);

  // Setup WebSocket connection for real-time updates
  useEffect(() => {
    useWebSocketConnection();
  }, [useWebSocketConnection]);

  // Setup virtualized list
  const parentRef = React.useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: threads.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 72, // Height of each thread item
    overscan: 5,
  });

  // Format last message preview with proper truncation and localization
  const formatLastMessagePreview = useCallback((message: Message | null, locale: string): string => {
    if (!message) return '';

    const maxLength = 50;
    let preview = '';

    switch (message.type) {
      case MessageType.TEXT:
        preview = message.content;
        break;
      case MessageType.VIDEO:
        preview = t('chat.videoMessage');
        break;
      case MessageType.IMAGE:
        preview = t('chat.imageMessage');
        break;
      case MessageType.VOICE:
        preview = t('chat.voiceMessage');
        break;
      default:
        preview = message.content;
    }

    return preview.length > maxLength 
      ? `${preview.substring(0, maxLength)}...` 
      : preview;
  }, [t]);

  // Handle thread selection with debouncing
  const handleThreadSelect = useCallback(
    debounce(async (thread: ChatThread) => {
      try {
        await setActiveThread(thread.id);
        
        if (thread.unreadCount > 0) {
          await markThreadRead(thread.id);
        }

        onThreadSelect?.(thread);
      } catch (error) {
        console.error('Error selecting thread:', error);
        dispatch({ type: 'chat/error', payload: error });
      }
    }, 300),
    [setActiveThread, markThreadRead, onThreadSelect, dispatch]
  );

  // Get thread participants excluding current user
  const getOtherParticipants = (participants: User[]): User[] => {
    return participants.filter(participant => participant.id !== userId);
  };

  // Render empty state when no threads exist
  if (!isLoading && threads.length === 0) {
    return (
      <EmptyState
        title={t('chat.emptyState.title')}
        message={t('chat.emptyState.message')}
        icon={<ChatIcon className="w-12 h-12" />}
      />
    );
  }

  return (
    <div
      className={`relative flex flex-col h-full overflow-hidden ${className}`}
      role="region"
      aria-label={t('chat.threadList')}
    >
      {/* Error message */}
      {error && (
        <div 
          className="bg-red-50 p-4 rounded-md m-4"
          role="alert"
          aria-live="polite"
        >
          <p className="text-red-700">{error.message}</p>
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="flex flex-col space-y-4 p-4">
          {Array.from({ length: 5 }).map((_, index) => (
            <div
              key={index}
              className="animate-pulse flex items-center space-x-4 p-4 bg-gray-50 rounded-md"
              aria-hidden="true"
            >
              <div className="rounded-full bg-gray-200 h-10 w-10" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-gray-200 rounded w-1/4" />
                <div className="h-3 bg-gray-200 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Virtualized thread list */}
      <div
        ref={parentRef}
        className="flex-1 overflow-auto divide-y divide-gray-200"
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const thread = threads[virtualRow.index];
            const otherParticipants = getOtherParticipants(thread.participants);
            const isActive = activeThread?.id === thread.id;
            const hasUnread = thread.unreadCount > 0;

            return (
              <div
                key={thread.id}
                ref={virtualizer.measureElement}
                data-index={virtualRow.index}
                className={`absolute top-0 left-0 w-full ${
                  isActive ? 'bg-blue-50' : 'hover:bg-gray-50'
                } transition-colors cursor-pointer`}
                style={{
                  transform: `translateY(${virtualRow.start}px)`,
                }}
                onClick={() => handleThreadSelect(thread)}
                role="button"
                tabIndex={0}
                aria-selected={isActive}
                aria-label={t('chat.threadAriaLabel', {
                  participants: otherParticipants.map(p => p.profile.firstName).join(', '),
                  unread: thread.unreadCount,
                })}
              >
                <div className="flex items-center p-4">
                  {/* Avatar */}
                  <div className="flex-shrink-0">
                    <img
                      src={otherParticipants[0]?.profile.avatarUrl || '/default-avatar.png'}
                      alt=""
                      className="h-10 w-10 rounded-full"
                    />
                  </div>

                  {/* Thread info */}
                  <div className="ml-4 flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className={`text-sm font-medium ${hasUnread ? 'text-gray-900' : 'text-gray-600'}`}>
                        {otherParticipants.map(p => p.profile.firstName).join(', ')}
                      </p>
                      {thread.lastMessage && (
                        <p className="text-xs text-gray-500">
                          {new Date(thread.lastMessage.createdAt).toLocaleTimeString()}
                        </p>
                      )}
                    </div>
                    <p className={`text-sm truncate ${hasUnread ? 'font-medium text-gray-900' : 'text-gray-500'}`}>
                      {formatLastMessagePreview(thread.lastMessage, t('common.locale'))}
                    </p>
                  </div>

                  {/* Unread badge */}
                  {hasUnread && (
                    <div className="ml-2">
                      <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-blue-500 text-white text-xs">
                        {thread.unreadCount}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};