'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { ErrorBoundary } from 'react-error-boundary';
import { Analytics } from '@segment/analytics-next';

import { ChatThread } from '../../../components/chat/ChatThread';
import { useChat } from '../../../hooks/useChat';
import type { Message, ChatThread as ChatThreadType } from '../../../types/chat';

// Analytics instance
const analytics = new Analytics({
  writeKey: process.env.NEXT_PUBLIC_SEGMENT_WRITE_KEY || ''
});

/**
 * Error fallback component with retry capability
 */
const ErrorFallback = ({ error, resetErrorBoundary }: { error: Error; resetErrorBoundary: () => void }) => (
  <div 
    role="alert" 
    className="p-4 bg-red-50 border border-red-200 rounded-lg"
    aria-live="assertive"
  >
    <h2 className="text-lg font-semibold text-red-800">Error Loading Chat</h2>
    <p className="mt-2 text-sm text-red-600">{error.message}</p>
    <button
      onClick={resetErrorBoundary}
      className="mt-4 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
    >
      Try Again
    </button>
  </div>
);

/**
 * Loading skeleton component for chat interface
 */
const ChatSkeleton = () => (
  <div className="animate-pulse h-full" role="status" aria-label="Loading chat">
    <div className="flex flex-col h-full">
      <div className="h-16 bg-gray-100 rounded-t-lg" />
      <div className="flex-1 space-y-4 p-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className={`flex ${i % 2 === 0 ? 'justify-end' : 'justify-start'}`}>
            <div className="w-2/3 h-12 bg-gray-100 rounded-lg" />
          </div>
        ))}
      </div>
      <div className="h-20 bg-gray-100 rounded-b-lg" />
    </div>
  </div>
);

/**
 * Enhanced chat page component with real-time messaging, offline support,
 * and comprehensive accessibility features
 */
const ChatPage = () => {
  // Get thread ID from route parameters
  const { id: threadId } = useParams();
  
  // Local state for loading and offline status
  const [isInitializing, setIsInitializing] = useState(true);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  // Initialize chat hook with enhanced features
  const {
    activeThread,
    messages,
    loading,
    error,
    connectionStatus,
    typingUsers,
    onlineUsers,
    sendMessage,
    setActiveThread,
    markThreadRead,
    setTypingStatus,
    retryFailedMessage
  } = useChat(threadId as string);

  // Handle online/offline status
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Initialize chat thread and track page view
  useEffect(() => {
    const initializeChat = async () => {
      try {
        await setActiveThread(threadId as string);
        analytics.track('Chat Thread Viewed', {
          threadId,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('Failed to initialize chat:', error);
      } finally {
        setIsInitializing(false);
      }
    };

    initializeChat();

    return () => {
      // Cleanup and track exit
      analytics.track('Chat Thread Exited', {
        threadId,
        duration: Date.now() - performance.now()
      });
    };
  }, [threadId, setActiveThread]);

  // Handle chat errors
  const handleError = (error: Error) => {
    console.error('Chat error:', error);
    analytics.track('Chat Error', {
      threadId,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  };

  // Show loading state
  if (isInitializing || loading) {
    return <ChatSkeleton />;
  }

  // Show error state if no thread found
  if (!activeThread) {
    return (
      <div 
        role="alert" 
        className="p-4 text-center"
        aria-live="assertive"
      >
        <h2 className="text-lg font-semibold">Chat Not Found</h2>
        <p className="mt-2 text-gray-600">This chat thread may have been deleted or you don't have access to it.</p>
      </div>
    );
  }

  return (
    <ErrorBoundary FallbackComponent={ErrorFallback} onError={handleError}>
      <main 
        className="flex flex-col h-full"
        role="main"
        aria-label={`Chat with ${activeThread.participants.map(p => p.profile.firstName).join(', ')}`}
      >
        {/* Offline indicator */}
        {isOffline && (
          <div 
            className="bg-yellow-50 p-2 text-sm text-yellow-800 text-center"
            role="status"
            aria-live="polite"
          >
            You are currently offline. Messages will be sent when you reconnect.
          </div>
        )}

        {/* Connection status indicator */}
        {connectionStatus === 'connecting' && (
          <div 
            className="bg-blue-50 p-2 text-sm text-blue-800 text-center"
            role="status"
            aria-live="polite"
          >
            Connecting to chat...
          </div>
        )}

        {/* Chat thread component */}
        <ChatThread
          thread={activeThread}
          className="flex-1"
          onError={handleError}
        />
      </main>
    </ErrorBoundary>
  );
};

/**
 * Generate enhanced metadata for the chat page
 */
export async function generateMetadata({ params }: { params: { id: string } }) {
  return {
    title: 'Chat | Video Coaching Platform',
    description: 'Real-time chat and messaging interface for coaches and athletes',
    openGraph: {
      title: 'Chat | Video Coaching Platform',
      description: 'Real-time chat and messaging interface for coaches and athletes',
      type: 'website'
    }
  };
}

export default ChatPage;