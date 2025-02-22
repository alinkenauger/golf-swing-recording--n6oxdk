'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { Suspense } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { VideoPlayer } from '../../../components/video/VideoPlayer';
import { AnnotationToolbar, TOOL_TYPES } from '../../../components/video/AnnotationToolbar';
import { VoiceOverRecorder } from '../../../components/video/VoiceOverRecorder';
import { useVideo } from '../../../hooks/useVideo';
import { VideoAnnotation, VideoStatus } from '../../../types/video';

// Constants for video page configuration
const AUTOSAVE_INTERVAL = 30000; // 30 seconds
const OFFLINE_SYNC_INTERVAL = 60000; // 1 minute

interface VideoPageState {
  selectedTool: TOOL_TYPES;
  isRecording: boolean;
  currentTime: number;
  selectedColor: string;
  strokeWidth: number;
}

const VideoPage: React.FC = () => {
  // Get video ID from route parameters
  const { id } = useParams();
  
  // Initialize video hook with offline support
  const {
    video,
    isLoading,
    error,
    addAnnotation,
    syncAnnotations,
    startVoiceOver,
    stopVoiceOver,
    setPlaybackSpeed,
    setVideoQuality,
    offlineStatus,
    currentQuality,
    voiceOverState
  } = useVideo(id as string, { 
    autoLoad: true, 
    enableOfflineSupport: true 
  });

  // Local state management
  const [state, setState] = useState<VideoPageState>({
    selectedTool: 'pen',
    isRecording: false,
    currentTime: 0,
    selectedColor: '#FF0000',
    strokeWidth: 2
  });

  // Refs for managing intervals and canvas
  const autoSaveIntervalRef = useRef<NodeJS.Timeout>();
  const syncIntervalRef = useRef<NodeJS.Timeout>();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  /**
   * Handle annotation creation with offline support
   */
  const handleAnnotation = useCallback(async (annotation: Omit<VideoAnnotation, 'id' | 'createdAt'>) => {
    try {
      await addAnnotation({
        ...annotation,
        timestamp: state.currentTime,
        type: state.selectedTool === 'voiceover' ? 'voiceover' : 'drawing'
      });

      // Announce to screen readers
      const announcement = document.createElement('div');
      announcement.setAttribute('aria-live', 'polite');
      announcement.textContent = 'Annotation added successfully';
      document.body.appendChild(announcement);
      setTimeout(() => announcement.remove(), 1000);
    } catch (err) {
      console.error('Failed to add annotation:', err);
      // Show error message to user
    }
  }, [addAnnotation, state.currentTime, state.selectedTool]);

  /**
   * Handle voice-over recording with visualization
   */
  const handleVoiceOver = useCallback(async (audioBlob: Blob) => {
    try {
      if (state.isRecording) {
        await stopVoiceOver();
      } else {
        await startVoiceOver();
      }
      setState(prev => ({ ...prev, isRecording: !prev.isRecording }));
    } catch (err) {
      console.error('Voice-over operation failed:', err);
      // Show error message to user
    }
  }, [state.isRecording, startVoiceOver, stopVoiceOver]);

  /**
   * Handle playback state changes
   */
  const handlePlayStateChange = useCallback((playing: boolean) => {
    // Update aria-live region for screen readers
    const announcement = document.createElement('div');
    announcement.setAttribute('aria-live', 'polite');
    announcement.textContent = `Video ${playing ? 'playing' : 'paused'}`;
    document.body.appendChild(announcement);
    setTimeout(() => announcement.remove(), 1000);
  }, []);

  /**
   * Setup auto-save and sync intervals
   */
  useEffect(() => {
    if (video?.status === VideoStatus.READY) {
      // Setup auto-save interval
      autoSaveIntervalRef.current = setInterval(() => {
        // Implement auto-save logic
      }, AUTOSAVE_INTERVAL);

      // Setup sync interval for offline changes
      if (offlineStatus.pendingSync > 0) {
        syncIntervalRef.current = setInterval(() => {
          syncAnnotations();
        }, OFFLINE_SYNC_INTERVAL);
      }
    }

    return () => {
      if (autoSaveIntervalRef.current) clearInterval(autoSaveIntervalRef.current);
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
    };
  }, [video?.status, offlineStatus.pendingSync, syncAnnotations]);

  /**
   * Handle keyboard shortcuts
   */
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setState(prev => ({ ...prev, selectedTool: 'pen' }));
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);

  // Error fallback component
  const ErrorFallback = ({ error }: { error: Error }) => (
    <div role="alert" className="p-4 bg-red-50 text-red-700">
      <h2 className="text-lg font-semibold">Error Loading Video</h2>
      <p>{error.message}</p>
      <button 
        onClick={() => window.location.reload()}
        className="mt-2 px-4 py-2 bg-red-600 text-white rounded"
      >
        Retry
      </button>
    </div>
  );

  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <div className="flex flex-col space-y-4 p-4">
        <Suspense fallback={<div>Loading video...</div>}>
          {video && (
            <>
              {/* Video Player */}
              <div className="relative w-full aspect-video">
                <VideoPlayer
                  video={video}
                  onPlayStateChange={handlePlayStateChange}
                  onTimeUpdate={(time) => setState(prev => ({ ...prev, currentTime: time }))}
                  onQualityChange={setVideoQuality}
                  accessibilityLabel={`Video: ${video.title}`}
                />
              </div>

              {/* Annotation Tools */}
              <AnnotationToolbar
                onToolSelect={(tool) => setState(prev => ({ ...prev, selectedTool: tool }))}
                onColorSelect={(color) => setState(prev => ({ ...prev, selectedColor: color }))}
                onStrokeWidthChange={(width) => setState(prev => ({ ...prev, strokeWidth: width }))}
                onVoiceOverStart={() => handleVoiceOver(new Blob())}
                onVoiceOverStop={stopVoiceOver}
                isRecording={state.isRecording}
                selectedTool={state.selectedTool}
                selectedColor={state.selectedColor}
                strokeWidth={state.strokeWidth}
              />

              {/* Voice-over Recorder */}
              {state.selectedTool === 'voiceover' && (
                <VoiceOverRecorder
                  videoId={video.id}
                  currentTime={state.currentTime}
                  onComplete={handleVoiceOver}
                  visualizerOptions={{
                    width: 600,
                    height: 100,
                    barWidth: 2,
                    barGap: 1,
                    barColor: '#2D5BFF'
                  }}
                />
              )}

              {/* Offline Status Indicator */}
              {offlineStatus.isOffline && (
                <div 
                  role="status" 
                  className="fixed bottom-4 right-4 bg-yellow-100 p-2 rounded"
                  aria-live="polite"
                >
                  Working offline - {offlineStatus.pendingSync} changes pending sync
                </div>
              )}
            </>
          )}
        </Suspense>
      </div>
    </ErrorBoundary>
  );
};

export default VideoPage;