import { useSelector, useDispatch } from 'react-redux';
import { useCallback, useEffect } from 'react';
import { debounce } from 'lodash'; // v4.17.21

import { 
  ChatService, 
  initializeChat, 
  sendMessage, 
  getThreadMessages, 
  setTypingStatus, 
  updatePresence, 
  markMessageRead 
} from '../services/chat.service';

import { 
  Message, 
  MessageType, 
  MessageStatus, 
  ChatThread, 
  ChatEvent, 
  MessageDraft 
} from '../types/chat';

import { User } from '../types/user';

// Constants for chat functionality
const TYPING_DEBOUNCE_MS = 1000;
const MESSAGE_RETRY_ATTEMPTS = 3;
const PRESENCE_UPDATE_INTERVAL = 30000;

// Interface for hook options
interface ChatHookOptions {
  autoReconnect?: boolean;
  offlineSupport?: boolean;
  presenceTracking?: boolean;
  typingIndicators?: boolean;
}

// Interface for hook return value
interface ChatHookReturn {
  // State
  activeThread: ChatThread | null;
  messages: Message[];
  loading: boolean;
  error: Error | null;
  connectionStatus: 'connected' | 'disconnected' | 'connecting';
  typingUsers: User[];
  onlineUsers: User[];
  unreadCount: number;

  // Methods
  sendMessage: (content: string, type?: MessageType) => Promise<void>;
  setActiveThread: (threadId: string) => Promise<void>;
  loadMoreMessages: (threadId: string, page: number) => Promise<void>;
  markThreadRead: (threadId: string) => Promise<void>;
  setTypingStatus: (isTyping: boolean) => void;
  retryFailedMessage: (messageId: string) => Promise<void>;
}

/**
 * Custom hook for managing comprehensive chat functionality
 * Includes real-time messaging, presence detection, offline support, and error handling
 */
export const useChat = (
  userId: string,
  options: ChatHookOptions = {}
): ChatHookReturn => {
  const dispatch = useDispatch();
  const chatService = ChatService.getInstance();

  // Redux selectors
  const activeThread = useSelector((state: any) => state.chat.activeThread);
  const messages = useSelector((state: any) => state.chat.messages);
  const loading = useSelector((state: any) => state.chat.loading);
  const error = useSelector((state: any) => state.chat.error);
  const typingUsers = useSelector((state: any) => state.chat.typingUsers);
  const onlineUsers = useSelector((state: any) => state.chat.onlineUsers);
  const connectionStatus = useSelector((state: any) => state.chat.connectionStatus);
  const unreadCount = useSelector((state: any) => state.chat.unreadCount);

  // Memoized typing indicator handler
  const debouncedTypingIndicator = useCallback(
    debounce((threadId: string, isTyping: boolean) => {
      chatService.setTypingStatus(threadId, isTyping);
    }, TYPING_DEBOUNCE_MS),
    []
  );

  // Initialize chat connection and listeners
  useEffect(() => {
    let presenceInterval: NodeJS.Timeout;

    const initChat = async () => {
      try {
        dispatch({ type: 'chat/connecting' });
        await chatService.initializeChat(userId);
        dispatch({ type: 'chat/connected' });

        // Set up presence tracking if enabled
        if (options.presenceTracking) {
          presenceInterval = setInterval(() => {
            chatService.updatePresence('online');
          }, PRESENCE_UPDATE_INTERVAL);
        }
      } catch (error) {
        dispatch({ type: 'chat/error', payload: error });
      }
    };

    initChat();

    return () => {
      if (presenceInterval) {
        clearInterval(presenceInterval);
      }
      chatService.dispose();
    };
  }, [userId, options.presenceTracking]);

  // Set up message listeners
  useEffect(() => {
    const messageHandler = (message: Message) => {
      dispatch({ type: 'chat/messageReceived', payload: message });
      
      // Auto-mark messages as read if in active thread
      if (activeThread?.id === message.threadId) {
        chatService.markMessageRead(message.threadId, [message.id]);
      }
    };

    const deliveryHandler = (receipt: { messageId: string; status: MessageStatus }) => {
      dispatch({ type: 'chat/messageStatusUpdated', payload: receipt });
    };

    const typingHandler = (data: { threadId: string; userId: string; isTyping: boolean }) => {
      if (options.typingIndicators) {
        dispatch({ type: 'chat/typingStatusUpdated', payload: data });
      }
    };

    chatService.messageStream$.subscribe(messageHandler);
    chatService.on(ChatEvent.MESSAGE_DELIVERED, deliveryHandler);
    chatService.on('typing', typingHandler);

    return () => {
      chatService.messageStream$.unsubscribe();
      chatService.off(ChatEvent.MESSAGE_DELIVERED, deliveryHandler);
      chatService.off('typing', typingHandler);
    };
  }, [activeThread, options.typingIndicators]);

  // Send message with retry logic and offline support
  const sendMessage = async (content: string, type: MessageType = MessageType.TEXT): Promise<void> => {
    if (!activeThread) return;

    try {
      dispatch({ type: 'chat/sendingMessage' });
      await chatService.sendMessage(activeThread.id, content, type);
      dispatch({ type: 'chat/messageSent' });
    } catch (error) {
      dispatch({ type: 'chat/messageError', payload: error });
      
      if (options.offlineSupport) {
        const draft: MessageDraft = {
          threadId: activeThread.id,
          type,
          content,
          savedAt: new Date().toISOString()
        };
        chatService.saveDraft(activeThread.id, draft);
      }
    }
  };

  // Set active thread with message loading
  const setActiveThread = async (threadId: string): Promise<void> => {
    try {
      dispatch({ type: 'chat/loadingThread' });
      const messages = await chatService.getThreadMessages(threadId);
      dispatch({ type: 'chat/threadLoaded', payload: { threadId, messages } });
    } catch (error) {
      dispatch({ type: 'chat/threadError', payload: error });
    }
  };

  // Load more messages with pagination
  const loadMoreMessages = async (threadId: string, page: number): Promise<void> => {
    try {
      dispatch({ type: 'chat/loadingMessages' });
      const messages = await chatService.getThreadMessages(threadId, page);
      dispatch({ type: 'chat/messagesLoaded', payload: messages });
    } catch (error) {
      dispatch({ type: 'chat/messagesError', payload: error });
    }
  };

  // Mark thread messages as read
  const markThreadRead = async (threadId: string): Promise<void> => {
    try {
      const unreadMessages = messages
        .filter(m => m.threadId === threadId && m.status !== MessageStatus.READ)
        .map(m => m.id);

      if (unreadMessages.length > 0) {
        await chatService.markMessageRead(threadId, unreadMessages);
        dispatch({ type: 'chat/messagesRead', payload: { threadId, messageIds: unreadMessages } });
      }
    } catch (error) {
      dispatch({ type: 'chat/readError', payload: error });
    }
  };

  // Update typing status
  const setTypingStatus = (isTyping: boolean): void => {
    if (!activeThread || !options.typingIndicators) return;
    debouncedTypingIndicator(activeThread.id, isTyping);
  };

  // Retry failed message
  const retryFailedMessage = async (messageId: string): Promise<void> => {
    const failedMessage = messages.find(m => m.id === messageId);
    if (!failedMessage || failedMessage.status !== MessageStatus.FAILED) return;

    try {
      dispatch({ type: 'chat/retryingMessage', payload: messageId });
      await sendMessage(failedMessage.content, failedMessage.type);
      dispatch({ type: 'chat/messageRetried', payload: messageId });
    } catch (error) {
      dispatch({ type: 'chat/retryError', payload: { messageId, error } });
    }
  };

  return {
    activeThread,
    messages,
    loading,
    error,
    connectionStatus,
    typingUsers,
    onlineUsers,
    unreadCount,
    sendMessage,
    setActiveThread,
    loadMoreMessages,
    markThreadRead,
    setTypingStatus,
    retryFailedMessage
  };
};