import React, { useRef, useEffect, useMemo, useCallback } from 'react';
import classNames from 'classnames'; // v2.3.2
import { VirtualList } from 'react-virtual'; // v2.10.4

import { MessageBubble } from './MessageBubble';
import { MessageInput } from './MessageInput';
import { useChat } from '../../hooks/useChat';
import type { ChatThread, Message } from '../../types/chat';

// Constants for chat functionality
const SCROLL_THRESHOLD = 100;
const THROTTLE_MS = 150;
const MESSAGE_GROUP_GAP_MS = 300000; // 5 minutes

interface ChatThreadProps {
  /** Chat thread data including participants and metadata */
  thread: ChatThread;
  /** Optional CSS class names */
  className?: string;
  /** Optional error handler callback */
  onError?: (error: Error) => void;
}

/**
 * ChatThread component for rendering chat conversations with real-time updates
 * Implements offline support, read receipts, and accessibility features
 */
export const ChatThread: React.FC<ChatThreadProps> = ({
  thread,
  className,
  onError
}) => {
  // Refs for DOM manipulation
  const containerRef = useRef<HTMLDivElement>(null);
  const lastScrollTimestamp = useRef<number>(0);

  // Chat functionality from custom hook
  const {
    messages,
    sendMessage,
    markThreadRead,
    isOffline,
    retryFailedMessages,
    typingUsers,
    loadMoreMessages
  } = useChat(thread.id);

  // Group messages by date for better organization
  const groupedMessages = useMemo(() => {
    const groups: Record<string, Message[]> = {};
    
    messages.forEach(message => {
      const date = new Date(message.createdAt).toLocaleDateString();
      if (!groups[date]) {
        groups[date] = [];
      }
      groups[date].push(message);
    });

    return groups;
  }, [messages]);

  // Handle scroll to bottom with throttling
  const scrollToBottom = useCallback((smooth = true, force = false) => {
    const now = Date.now();
    if (!force && now - lastScrollTimestamp.current < THROTTLE_MS) return;

    const container = containerRef.current;
    if (!container) return;

    const isNearBottom = 
      container.scrollHeight - container.scrollTop - container.clientHeight < SCROLL_THRESHOLD;

    if (force || isNearBottom) {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: smooth ? 'smooth' : 'auto'
      });
      lastScrollTimestamp.current = now;
    }
  }, []);

  // Handle new message submission
  const handleMessageSend = useCallback(async (message: Message) => {
    try {
      await sendMessage(message.content, message.type);
      scrollToBottom(true, true);
    } catch (error) {
      onError?.(error as Error);
    }
  }, [sendMessage, scrollToBottom, onError]);

  // Mark messages as read and handle scroll behavior
  useEffect(() => {
    let timeoutId: NodeJS.Timeout;

    const markRead = async () => {
      try {
        await markThreadRead(thread.id);
      } catch (error) {
        onError?.(error as Error);
      }
    };

    // Debounce read status updates
    timeoutId = setTimeout(markRead, 1000);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [thread.id, messages, markThreadRead, onError]);

  // Handle real-time updates and scroll behavior
  useEffect(() => {
    scrollToBottom(true);
  }, [messages, scrollToBottom]);

  // Virtual list configuration for performance
  const rowVirtualizer = VirtualList({
    size: Object.keys(groupedMessages).length,
    parentRef: containerRef,
    estimateSize: useCallback(() => 80, []),
    overscan: 5
  });

  return (
    <div
      ref={containerRef}
      className={classNames(
        'flex flex-col h-full overflow-hidden bg-gray-50',
        className
      )}
      role="log"
      aria-live="polite"
      aria-label="Chat conversation"
    >
      {/* Connection status indicator */}
      {isOffline && (
        <div
          className="bg-yellow-50 p-2 text-sm text-yellow-800 text-center"
          role="status"
        >
          You are offline. Messages will be sent when you reconnect.
        </div>
      )}

      {/* Virtualized message list */}
      <div className="flex-1 overflow-y-auto px-4 py-2">
        {rowVirtualizer.virtualItems.map(virtualRow => {
          const date = Object.keys(groupedMessages)[virtualRow.index];
          const dateMessages = groupedMessages[date];

          return (
            <div
              key={date}
              className="mb-6"
              style={{
                height: virtualRow.size,
                transform: `translateY(${virtualRow.start}px)`
              }}
            >
              {/* Date separator */}
              <div
                className="text-center text-sm text-gray-500 mb-4"
                aria-label={`Messages from ${date}`}
              >
                {date}
              </div>

              {/* Message bubbles */}
              {dateMessages.map((message, idx) => {
                const prevMessage = dateMessages[idx - 1];
                const showSender = !prevMessage || 
                  prevMessage.senderId !== message.senderId ||
                  (message.createdAt.getTime() - prevMessage.createdAt.getTime() > MESSAGE_GROUP_GAP_MS);

                return (
                  <MessageBubble
                    key={message.id}
                    message={message}
                    isOwn={message.senderId === thread.participants[0].id}
                    senderProfile={thread.participants.find(p => p.id === message.senderId)?.profile!}
                    showSender={showSender}
                    onError={onError}
                  />
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Typing indicator */}
      {typingUsers.length > 0 && (
        <div
          className="text-sm text-gray-500 px-4 py-1"
          aria-live="polite"
        >
          {typingUsers.map(user => user.profile.firstName).join(', ')} 
          {typingUsers.length === 1 ? ' is' : ' are'} typing...
        </div>
      )}

      {/* Message input */}
      <MessageInput
        threadId={thread.id}
        onSend={handleMessageSend}
        isOffline={isOffline}
      />
    </div>
  );
};

export default ChatThread;