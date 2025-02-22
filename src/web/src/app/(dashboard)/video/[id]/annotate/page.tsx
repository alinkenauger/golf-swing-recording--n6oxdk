'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { VideoPlayer } from '@/components/video/VideoPlayer';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { Loading } from '@/components/common/Loading';
import { analytics } from '@segment/analytics-next';
import { VideoStatus, VideoAnnotation } from '@/types/video';
import { ApiError, LoadingState } from '@/types/common';

// Constants for annotation workspace
const AUTO_SAVE_INTERVAL = 30000; // 30 seconds
const CANVAS_QUALITY = 0.92;
const VOICE_RECORD_LIMIT = 300; // 5 minutes in seconds

// Annotation tool types
type AnnotationTool = 'pen' | 'line' | 'arrow' | 'rectangle' | 'text' | 'voiceover';

interface AnnotationState {
  tool: AnnotationTool;
  color: string;
  strokeWidth: number;
  annotations: VideoAnnotation[];
  isRecording: boolean;
  recordingTime: number;
}

/**
 * Video Annotation Page Component
 * Provides a comprehensive workspace for video analysis with drawing tools,
 * voice-over recording, and real-time annotations.
 */
const VideoAnnotationPage: React.FC = () => {
  // Route params and refs
  const { id } = useParams();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const autoSaveTimerRef = useRef<NodeJS.Timeout>();

  // State management
  const [loadingState, setLoadingState] = useState<LoadingState>({
    state: 'loading',
    error: null,
    progress: 0
  });
  const [annotationState, setAnnotationState] = useState<AnnotationState>({
    tool: 'pen',
    color: '#FF0000',
    strokeWidth: 2,
    annotations: [],
    isRecording: false,
    recordingTime: 0
  });
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  /**
   * Handles tool selection and configuration
   */
  const handleToolSelect = useCallback((tool: AnnotationTool) => {
    setAnnotationState(prev => ({ ...prev, tool }));
    
    analytics.track('annotation_tool_selected', {
      videoId: id,
      tool,
      timestamp: currentTime
    });

    // Configure canvas based on tool
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.strokeStyle = annotationState.color;
        ctx.lineWidth = annotationState.strokeWidth;
        ctx.lineCap = 'round';
      }
    }
  }, [id, currentTime, annotationState.color, annotationState.strokeWidth]);

  /**
   * Handles voice-over recording
   */
  const handleVoiceRecording = useCallback(async () => {
    try {
      if (!annotationState.isRecording) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const recorder = new MediaRecorder(stream, {
          mimeType: 'audio/webm'
        });

        const chunks: Blob[] = [];
        recorder.ondataavailable = (e) => chunks.push(e.data);
        recorder.onstop = async () => {
          const audioBlob = new Blob(chunks, { type: 'audio/webm' });
          
          // Create new voice-over annotation
          const newAnnotation: VideoAnnotation = {
            id: crypto.randomUUID(),
            userId: 'current-user', // Replace with actual user ID
            timestamp: currentTime,
            type: 'voiceover',
            data: {
              audioUrl: URL.createObjectURL(audioBlob),
              duration: annotationState.recordingTime
            },
            createdAt: new Date().toISOString()
          };

          setAnnotationState(prev => ({
            ...prev,
            annotations: [...prev.annotations, newAnnotation]
          }));
        };

        mediaRecorderRef.current = recorder;
        recorder.start();

        setAnnotationState(prev => ({
          ...prev,
          isRecording: true,
          recordingTime: 0
        }));
      } else {
        mediaRecorderRef.current?.stop();
        setAnnotationState(prev => ({
          ...prev,
          isRecording: false
        }));
      }
    } catch (error) {
      console.error('Voice recording error:', error);
      setLoadingState({
        state: 'error',
        error: {
          code: 'VOICE_RECORD_ERROR',
          message: 'Failed to start voice recording',
          details: {}
        }
      });
    }
  }, [currentTime, annotationState.isRecording]);

  /**
   * Handles drawing annotations on canvas
   */
  const handleDraw = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    if (annotationState.tool === 'pen') {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
  }, [annotationState.tool]);

  /**
   * Handles auto-saving annotations
   */
  const handleAutoSave = useCallback(async () => {
    if (isOffline) {
      // Store in IndexedDB for offline support
      try {
        const db = await window.indexedDB.open('videoAnnotations', 1);
        // Implementation for IndexedDB storage
      } catch (error) {
        console.error('Offline storage error:', error);
      }
      return;
    }

    try {
      // Save annotations to server
      analytics.track('annotations_auto_saved', {
        videoId: id,
        annotationCount: annotationState.annotations.length
      });
    } catch (error) {
      console.error('Auto-save error:', error);
    }
  }, [id, isOffline, annotationState.annotations]);

  /**
   * Handles offline mode detection and management
   */
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

  /**
   * Sets up auto-save interval
   */
  useEffect(() => {
    autoSaveTimerRef.current = setInterval(handleAutoSave, AUTO_SAVE_INTERVAL);

    return () => {
      if (autoSaveTimerRef.current) {
        clearInterval(autoSaveTimerRef.current);
      }
    };
  }, [handleAutoSave]);

  /**
   * Handles recording time updates
   */
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (annotationState.isRecording) {
      timer = setInterval(() => {
        setAnnotationState(prev => {
          if (prev.recordingTime >= VOICE_RECORD_LIMIT) {
            handleVoiceRecording();
            return prev;
          }
          return { ...prev, recordingTime: prev.recordingTime + 1 };
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [annotationState.isRecording, handleVoiceRecording]);

  if (loadingState.state === 'loading') {
    return <Loading size="large" message="Loading video workspace..." />;
  }

  if (loadingState.state === 'error') {
    return (
      <div role="alert" className="p-4 bg-red-50 rounded-lg">
        <h2 className="text-red-800">Error loading video workspace</h2>
        <p className="text-red-600">{loadingState.error?.message}</p>
      </div>
    );
  }

  return (
    <ErrorBoundary
      onError={(error) => {
        analytics.track('video_annotation_error', {
          videoId: id,
          error: error.message
        });
      }}
    >
      <div className="flex flex-col h-full">
        {/* Offline indicator */}
        {isOffline && (
          <div className="bg-yellow-50 p-2 text-center text-yellow-800">
            Working offline - changes will sync when connection is restored
          </div>
        )}

        {/* Main workspace */}
        <div className="grid grid-cols-2 gap-4 p-4">
          {/* Original video */}
          <div className="relative">
            <VideoPlayer
              video={{ id: id as string, status: VideoStatus.READY }}
              onTimeUpdate={setCurrentTime}
              playbackSpeed={playbackSpeed}
              controls
            />
          </div>

          {/* Annotation canvas */}
          <div className="relative">
            <canvas
              ref={canvasRef}
              className="absolute top-0 left-0 w-full h-full"
              onMouseDown={handleDraw}
              onMouseMove={(e) => {
                if (e.buttons === 1) handleDraw(e);
              }}
            />
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between p-4 border-t">
          <div className="flex space-x-2">
            {(['pen', 'line', 'arrow', 'rectangle', 'text'] as AnnotationTool[]).map((tool) => (
              <button
                key={tool}
                onClick={() => handleToolSelect(tool)}
                className={`p-2 rounded ${
                  annotationState.tool === tool ? 'bg-blue-100' : 'bg-gray-100'
                }`}
                aria-label={`Select ${tool} tool`}
              >
                {tool}
              </button>
            ))}
          </div>

          <div className="flex items-center space-x-4">
            <input
              type="color"
              value={annotationState.color}
              onChange={(e) => setAnnotationState(prev => ({
                ...prev,
                color: e.target.value
              }))}
              className="w-8 h-8"
              aria-label="Select color"
            />
            <input
              type="range"
              min="1"
              max="10"
              value={annotationState.strokeWidth}
              onChange={(e) => setAnnotationState(prev => ({
                ...prev,
                strokeWidth: parseInt(e.target.value)
              }))}
              className="w-32"
              aria-label="Select stroke width"
            />
          </div>

          <button
            onClick={handleVoiceRecording}
            className={`px-4 py-2 rounded ${
              annotationState.isRecording ? 'bg-red-500' : 'bg-blue-500'
            } text-white`}
            aria-label={annotationState.isRecording ? 'Stop recording' : 'Start recording'}
          >
            {annotationState.isRecording ? (
              `Stop Recording (${VOICE_RECORD_LIMIT - annotationState.recordingTime}s)`
            ) : (
              'Record Voice-over'
            )}
          </button>
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default VideoAnnotationPage;