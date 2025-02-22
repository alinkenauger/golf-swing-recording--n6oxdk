/**
 * Enhanced React hook for managing WebSocket connections and real-time communication
 * Provides secure socket connection management, message delivery tracking, and offline support
 * @version 1.0.0
 */

import { useState, useEffect, useCallback, useRef } from 'react'; // ^18.0.0
import { SocketManager } from '../lib/socket';
import { useAuth } from './useAuth';
import { ChatEvent } from '../types/chat';

// Connection state type
type ConnectionState = 'connected' | 'disconnected' | 'connecting' | 'error';

// Message queue type for offline support
interface QueuedMessage {
  id: string;
  threadId: string;
  content: string;
  type: string;
  timestamp: number;
}

// Typing indicator state type
interface TypingState {
  threadId: string;
  userId: string;
  isTyping: boolean;
}

/**
 * Enhanced WebSocket hook with comprehensive real-time features
 * @returns Socket state and methods for real-time communication
 */
export const useSocket = () => {
  // Socket manager instance
  const socketManagerRef = useRef<SocketManager | null>(null);
  
  // Auth state and token management
  const { isAuthenticated, token, validateSession } = useAuth();
  
  // Socket states
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [messageQueue, setMessageQueue] = useState<QueuedMessage[]>([]);
  const [typingUsers, setTypingUsers] = useState<Record<string, string[]>>({});
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null);
  
  // Typing indicator debounce timer
  const typingTimerRef = useRef<NodeJS.Timeout>();

  /**
   * Initialize socket manager with secure configuration
   */
  useEffect(() => {
    if (!isAuthenticated || !token) return;

    socketManagerRef.current = new SocketManager({
      autoReconnect: true,
      reconnectionAttempts: 5,
      heartbeatInterval: 30000
    });

    return () => {
      socketManagerRef.current?.disconnect();
      socketManagerRef.current = null;
    };
  }, [isAuthenticated, token]);

  /**
   * Handle socket connection and event setup
   */
  useEffect(() => {
    if (!socketManagerRef.current || !token) return;

    const setupConnection = async () => {
      try {
        setConnectionState('connecting');
        await socketManagerRef.current?.connect(token);
        setConnectionState('connected');
      } catch (error) {
        console.error('Socket connection error:', error);
        setConnectionState('error');
      }
    };

    setupConnection();

    // Setup event listeners
    socketManagerRef.current.on('connected', () => setConnectionState('connected'));
    socketManagerRef.current.on('disconnected', () => setConnectionState('disconnected'));
    socketManagerRef.current.on('error', () => setConnectionState('error'));

    return () => {
      socketManagerRef.current?.disconnect();
    };
  }, [token]);

  /**
   * Enhanced message handler with delivery tracking and offline support
   */
  const sendMessage = useCallback(async (
    threadId: string,
    content: string,
    type: string = 'TEXT'
  ): Promise<void> => {
    if (!socketManagerRef.current) {
      throw new Error('Socket not initialized');
    }

    const messageId = crypto.randomUUID();
    const messageData = {
      threadId,
      content,
      type,
      metadata: {
        timestamp: Date.now()
      }
    };

    try {
      await socketManagerRef.current.sendMessage(messageData);
    } catch (error) {
      // Queue message for offline support
      setMessageQueue(prev => [...prev, {
        id: messageId,
        threadId,
        content,
        type,
        timestamp: Date.now()
      }]);
      throw error;
    }
  }, []);

  /**
   * Enhanced thread management with presence detection
   */
  const joinThread = useCallback(async (threadId: string): Promise<void> => {
    if (!socketManagerRef.current) {
      throw new Error('Socket not initialized');
    }

    try {
      await socketManagerRef.current.joinThread(threadId);
      setCurrentThreadId(threadId);
      setTypingUsers(prev => ({ ...prev, [threadId]: [] }));
    } catch (error) {
      console.error('Error joining thread:', error);
      throw error;
    }
  }, []);

  /**
   * Leave current thread and cleanup subscriptions
   */
  const leaveThread = useCallback(async (): Promise<void> => {
    if (!socketManagerRef.current || !currentThreadId) return;

    try {
      await socketManagerRef.current.leaveThread(currentThreadId);
      setCurrentThreadId(null);
      setTypingUsers(prev => {
        const updated = { ...prev };
        delete updated[currentThreadId];
        return updated;
      });
    } catch (error) {
      console.error('Error leaving thread:', error);
      throw error;
    }
  }, [currentThreadId]);

  /**
   * Enhanced typing indicator handler with debouncing
   */
  const setTypingStatus = useCallback((isTyping: boolean): void => {
    if (!socketManagerRef.current || !currentThreadId) return;

    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
    }

    socketManagerRef.current.emit(
      isTyping ? ChatEvent.TYPING_START : ChatEvent.TYPING_END,
      { threadId: currentThreadId }
    );

    if (isTyping) {
      typingTimerRef.current = setTimeout(() => {
        socketManagerRef.current?.emit(ChatEvent.TYPING_END, {
          threadId: currentThreadId
        });
      }, 3000);
    }
  }, [currentThreadId]);

  /**
   * Mark thread messages as read
   */
  const markThreadRead = useCallback(async (threadId: string): Promise<void> => {
    if (!socketManagerRef.current) return;

    try {
      await socketManagerRef.current.emit(ChatEvent.MESSAGE_READ, { threadId });
    } catch (error) {
      console.error('Error marking thread as read:', error);
      throw error;
    }
  }, []);

  /**
   * Process queued messages when connection is restored
   */
  useEffect(() => {
    if (connectionState !== 'connected' || !messageQueue.length) return;

    const processQueue = async () => {
      const queue = [...messageQueue];
      setMessageQueue([]);

      for (const message of queue) {
        try {
          await sendMessage(message.threadId, message.content, message.type);
        } catch (error) {
          setMessageQueue(prev => [...prev, message]);
          break;
        }
      }
    };

    processQueue();
  }, [connectionState, messageQueue, sendMessage]);

  /**
   * Validate session and reconnect on token refresh
   */
  useEffect(() => {
    const validateAndReconnect = async () => {
      const isValid = await validateSession();
      if (isValid && socketManagerRef.current) {
        await socketManagerRef.current.reconnect();
      }
    };

    validateAndReconnect();
  }, [validateSession]);

  return {
    connectionState,
    sendMessage,
    joinThread,
    leaveThread,
    setTypingStatus,
    markThreadRead,
    messageQueue,
    typingUsers,
    currentThreadId
  };
};

export type UseSocket = ReturnType<typeof useSocket>;