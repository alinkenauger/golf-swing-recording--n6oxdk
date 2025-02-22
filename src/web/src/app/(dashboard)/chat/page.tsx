'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { DashboardLayout } from '../../../components/layout/DashboardLayout';
import { ChatList } from '../../../components/chat/ChatList';
import { MessageInput } from '../../../components/chat/MessageInput';
import { useChat } from '../../../hooks/useChat';
import { Message, MessageType, ChatThread } from '../../../types/chat';
import { EmptyState } from '../../../components/common/EmptyState';
import { Loading } from '../../../components/common/Loading';

/**
 * Chat page component implementing real-time messaging with comprehensive features
 * including offline support, media handling, and accessibility
 */
const ChatPage: React.FC = () => {
  // Get current user from Redux store
  const user = useSelector((state: any) => state.auth.user);
  
  // Local state for UI management
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [isMediaUploading, setIsMediaUploading] = useState(false);

  // Initialize chat hook with comprehensive features
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
    loadMoreMessages,
    markThreadRead,
    setTypingStatus
  } = useChat(user?.id);

  // Handle thread selection with message loading
  const handleThreadSelect = useCallback(async (thread: ChatThread) => {
    try {
      setSelectedThreadId(thread.id);
      await setActiveThread(thread.id);
      await markThreadRead(thread.id);
    } catch (error) {
      console.error('Error selecting thread:', error);
    }
  }, [setActiveThread, markThreadRead]);

  // Handle message sending with media support
  const handleSendMessage = useCallback(async (content: string, type: MessageType = MessageType.TEXT) => {
    if (!activeThread) return;

    try {
      await sendMessage(content, type);
    } catch (error) {
      console.error('Error sending message:', error);
    }
  }, [activeThread, sendMessage]);

  // Handle media upload with progress tracking
  const handleMediaUpload = useCallback(async (file: File) => {
    if (!activeThread) return;

    try {
      setIsMediaUploading(true);
      const messageType = file.type.startsWith('video/') ? MessageType.VIDEO :
                         file.type.startsWith('image/') ? MessageType.IMAGE :
                         MessageType.VOICE;

      await handleSendMessage(URL.createObjectURL(file), messageType);
    } catch (error) {
      console.error('Error uploading media:', error);
    } finally {
      setIsMediaUploading(false);
    }
  }, [activeThread, handleSendMessage]);

  // Load more messages when scrolling
  const handleLoadMore = useCallback(async () => {
    if (!activeThread) return;
    await loadMoreMessages(activeThread.id, messages.length);
  }, [activeThread, messages.length, loadMoreMessages]);

  // Render loading state
  if (loading && !activeThread) {
    return (
      <DashboardLayout>
        <div className="h-full flex items-center justify-center">
          <Loading size="large" message="Loading conversations..." />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="h-full flex overflow-hidden bg-white">
        {/* Chat list sidebar */}
        <div className="w-80 border-r border-gray-200 flex flex-col">
          <ChatList
            userId={user?.id}
            onThreadSelect={handleThreadSelect}
            className="flex-1"
          />
        </div>

        {/* Main chat area */}
        <div className="flex-1 flex flex-col">
          {activeThread ? (
            <>
              {/* Chat header */}
              <div className="border-b border-gray-200 p-4">
                <div className="flex items-center">
                  <h2 className="text-lg font-semibold">
                    {activeThread.participants
                      .filter(p => p.id !== user?.id)
                      .map(p => p.profile.firstName)
                      .join(', ')}
                  </h2>
                  {onlineUsers.includes(activeThread.participants[0].id) && (
                    <span className="ml-2 h-2 w-2 rounded-full bg-green-500" />
                  )}
                </div>
              </div>

              {/* Messages container */}
              <div 
                className="flex-1 overflow-y-auto p-4 space-y-4"
                role="log"
                aria-label="Message history"
              >
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.senderId === user?.id ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[70%] rounded-lg p-3 ${
                        message.senderId === user?.id
                          ? 'bg-primary-500 text-white'
                          : 'bg-gray-100 text-gray-900'
                      }`}
                    >
                      {message.type === MessageType.TEXT && (
                        <p>{message.content}</p>
                      )}
                      {message.type === MessageType.IMAGE && (
                        <img
                          src={message.content}
                          alt="Shared image"
                          className="rounded-lg max-w-full"
                          loading="lazy"
                        />
                      )}
                      {message.type === MessageType.VIDEO && (
                        <video
                          src={message.content}
                          controls
                          className="rounded-lg max-w-full"
                        />
                      )}
                      <span className="text-xs opacity-75 mt-1 block">
                        {new Date(message.createdAt).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                ))}

                {typingUsers.length > 0 && (
                  <div className="text-sm text-gray-500" aria-live="polite">
                    {typingUsers.map(u => u.profile.firstName).join(', ')} typing...
                  </div>
                )}
              </div>

              {/* Message input */}
              <MessageInput
                threadId={activeThread.id}
                onSend={handleSendMessage}
                disabled={connectionStatus !== 'connected' || isMediaUploading}
              />
            </>
          ) : (
            <EmptyState
              title="Select a conversation"
              message="Choose a conversation from the list to start chatting"
              icon={<ChatIcon className="w-12 h-12" />}
            />
          )}
        </div>

        {/* Connection status banner */}
        {connectionStatus !== 'connected' && (
          <div 
            className="fixed bottom-0 left-0 right-0 bg-yellow-50 p-2 text-center text-sm text-yellow-800"
            role="alert"
            aria-live="polite"
          >
            {connectionStatus === 'connecting' ? 'Connecting...' : 'Offline - Messages will be sent when back online'}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default ChatPage;