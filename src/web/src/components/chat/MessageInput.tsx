import React, { useState, useRef, useEffect, useCallback } from 'react';
import { debounce } from 'lodash'; // v4.17.21
import { useChat } from '../../hooks/useChat';
import { Button } from '../common/Button';
import { MessageType } from '../../types/chat';

// Constants for media handling
const TYPING_DEBOUNCE_MS = 1000;
const MAX_VOICE_DURATION_MS = 300000; // 5 minutes
const DEFAULT_MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

interface MessageInputProps {
  threadId: string;
  onSend?: (message: Message) => void;
  disabled?: boolean;
  maxFileSize?: number;
  allowedFileTypes?: string[];
}

interface MessageError {
  type: 'media' | 'voice' | 'text';
  message: string;
}

export const MessageInput: React.FC<MessageInputProps> = ({
  threadId,
  onSend,
  disabled = false,
  maxFileSize = DEFAULT_MAX_FILE_SIZE,
  allowedFileTypes = ['video/*', 'image/*', 'audio/*']
}) => {
  // State management
  const [messageText, setMessageText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<MessageError | null>(null);
  const [mediaFile, setMediaFile] = useState<File | null>(null);

  // Refs
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Custom hooks
  const { sendMessage, activeThread } = useChat();

  // Debounced typing indicator
  const debouncedTypingIndicator = useCallback(
    debounce((isTyping: boolean) => {
      if (activeThread) {
        setIsTyping(isTyping);
      }
    }, TYPING_DEBOUNCE_MS),
    [activeThread]
  );

  // Handle text message submission
  const handleMessageSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    
    if (!messageText.trim() && !mediaFile) {
      return;
    }

    try {
      setError(null);
      
      if (mediaFile) {
        await handleMediaAttachment({ target: { files: [mediaFile] } } as any);
        setMediaFile(null);
      } else {
        await sendMessage(messageText.trim(), MessageType.TEXT);
        onSend?.({ content: messageText, type: MessageType.TEXT });
      }
      
      setMessageText('');
      setUploadProgress(0);
      inputRef.current?.focus();
    } catch (err) {
      setError({
        type: 'text',
        message: 'Failed to send message. Please try again.'
      });
    }
  };

  // Handle voice recording
  const handleVoiceRecording = async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        
        if (audioBlob.size > maxFileSize) {
          setError({
            type: 'voice',
            message: 'Voice message exceeds maximum allowed size'
          });
          return;
        }

        try {
          await sendMessage(URL.createObjectURL(audioBlob), MessageType.VOICE);
          onSend?.({ content: URL.createObjectURL(audioBlob), type: MessageType.VOICE });
        } catch (err) {
          setError({
            type: 'voice',
            message: 'Failed to send voice message'
          });
        }
      };

      mediaRecorder.start();
      setIsRecording(true);

      // Auto-stop after maximum duration
      setTimeout(() => {
        if (mediaRecorderRef.current?.state === 'recording') {
          mediaRecorderRef.current.stop();
          setIsRecording(false);
        }
      }, MAX_VOICE_DURATION_MS);

    } catch (err) {
      setError({
        type: 'voice',
        message: 'Failed to access microphone'
      });
    }
  };

  // Handle media file attachments
  const handleMediaAttachment = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!allowedFileTypes.some(type => file.type.match(type))) {
      setError({
        type: 'media',
        message: 'File type not supported'
      });
      return;
    }

    if (file.size > maxFileSize) {
      setError({
        type: 'media',
        message: 'File size exceeds maximum allowed size'
      });
      return;
    }

    try {
      setMediaFile(file);
      const messageType = file.type.startsWith('video/') ? MessageType.VIDEO :
                         file.type.startsWith('image/') ? MessageType.IMAGE :
                         MessageType.VOICE;

      const formData = new FormData();
      formData.append('file', file);

      // Simulated upload progress
      const interval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 100) {
            clearInterval(interval);
            return 100;
          }
          return prev + 10;
        });
      }, 100);

      await sendMessage(URL.createObjectURL(file), messageType);
      onSend?.({ content: URL.createObjectURL(file), type: messageType });
      
      clearInterval(interval);
      setUploadProgress(0);
      setMediaFile(null);
    } catch (err) {
      setError({
        type: 'media',
        message: 'Failed to upload media'
      });
    }
  };

  // Cleanup effect
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current?.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      debouncedTypingIndicator.cancel();
    };
  }, [debouncedTypingIndicator]);

  return (
    <form
      onSubmit={handleMessageSubmit}
      className="flex flex-col gap-2 p-4 border-t border-gray-200"
      aria-label="Message input form"
    >
      {error && (
        <div
          role="alert"
          className="text-sm text-red-600 mb-2"
          aria-live="polite"
        >
          {error.message}
        </div>
      )}

      <div className="flex items-end gap-2">
        <div className="flex-1 relative">
          <input
            ref={inputRef}
            type="text"
            value={messageText}
            onChange={(e) => {
              setMessageText(e.target.value);
              debouncedTypingIndicator(true);
            }}
            onBlur={() => debouncedTypingIndicator(false)}
            placeholder="Type a message..."
            disabled={disabled || isRecording}
            className="w-full min-h-[44px] px-4 py-2 rounded-md border border-gray-300 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            aria-label="Message text input"
          />
          
          {uploadProgress > 0 && (
            <div
              role="progressbar"
              aria-valuenow={uploadProgress}
              aria-valuemin={0}
              aria-valuemax={100}
              className="absolute bottom-0 left-0 h-1 bg-primary-500 transition-all"
              style={{ width: `${uploadProgress}%` }}
            />
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept={allowedFileTypes.join(',')}
          onChange={handleMediaAttachment}
          className="hidden"
          aria-label="Attach media"
        />

        <Button
          type="button"
          variant="secondary"
          size="md"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || isRecording}
          aria-label="Attach media"
        >
          📎
        </Button>

        <Button
          type="button"
          variant={isRecording ? 'danger' : 'secondary'}
          size="md"
          onClick={handleVoiceRecording}
          disabled={disabled}
          aria-label={isRecording ? 'Stop recording' : 'Start voice recording'}
        >
          🎤
        </Button>

        <Button
          type="submit"
          variant="primary"
          size="md"
          disabled={disabled || (!messageText.trim() && !mediaFile) || isRecording}
          aria-label="Send message"
        >
          Send
        </Button>
      </div>

      {isRecording && (
        <div
          role="status"
          aria-live="polite"
          className="text-sm text-red-600 animate-pulse"
        >
          Recording voice message...
        </div>
      )}
    </form>
  );
};