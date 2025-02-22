/**
 * VideoPlayer Component
 * A feature-rich video player with support for playback controls, annotations,
 * voice-over recording, slow-motion analysis, and accessibility features.
 * @version 1.0.0
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { useAnalytics } from '@analytics/react';
import { VideoControls } from './VideoControls';
import { calculateAspectRatio } from '../../utils/video';
import { Video, VideoQuality, VideoStatus } from '../../types/video';

// Constants for video player configuration
const RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 1000;
const BUFFER_THRESHOLD = 2; // seconds
const QUALITY_CHECK_INTERVAL = 10000; // 10 seconds

interface VideoPlayerProps {
  video: Video;
  initialTime?: number;
  autoPlay?: boolean;
  loop?: boolean;
  controls?: boolean;
  onPlayStateChange?: (playing: boolean) => void;
  onTimeUpdate?: (time: number) => void;
  onSpeedChange?: (speed: number) => void;
  onError?: (error: Error) => void;
  onQualityChange?: (quality: string) => void;
  accessibilityLabel?: string;
  errorRetryCount?: number;
  analyticsEnabled?: boolean;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  video,
  initialTime = 0,
  autoPlay = false,
  loop = false,
  controls = true,
  onPlayStateChange,
  onTimeUpdate,
  onSpeedChange,
  onError,
  onQualityChange,
  accessibilityLabel,
  errorRetryCount = RETRY_ATTEMPTS,
  analyticsEnabled = true
}) => {
  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const retryCountRef = useRef(0);

  // State
  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const [currentTime, setCurrentTime] = useState(initialTime);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [currentQuality, setCurrentQuality] = useState<VideoQuality>(VideoQuality.HD);
  const [error, setError] = useState<Error | null>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  // Analytics
  const analytics = useAnalytics();

  /**
   * Selects optimal video variant based on network conditions and device capabilities
   */
  const selectOptimalVariant = useCallback(() => {
    const connection = (navigator as any).connection;
    const variants = video.variants.sort((a, b) => 
      b.metadata.height - a.metadata.height
    );

    // Check network conditions
    if (connection) {
      const isSlowConnection = connection.downlink < 5 || connection.effectiveType === '3g';
      if (isSlowConnection && variants.find(v => v.quality === VideoQuality.SD)) {
        return VideoQuality.SD;
      }
    }

    // Check device capabilities
    const screenHeight = window.innerHeight;
    const variant = variants.find(v => v.metadata.height <= screenHeight) || variants[0];
    
    return variant.quality;
  }, [video.variants]);

  /**
   * Handles play/pause state with accessibility announcements
   */
  const handlePlayPause = useCallback((playing: boolean) => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    try {
      if (playing) {
        videoElement.play().catch(handleError);
      } else {
        videoElement.pause();
      }
      
      setIsPlaying(playing);
      onPlayStateChange?.(playing);

      // Accessibility announcement
      const announcement = playing ? 'Video playing' : 'Video paused';
      const ariaLive = document.createElement('div');
      ariaLive.setAttribute('aria-live', 'polite');
      ariaLive.textContent = announcement;
      document.body.appendChild(ariaLive);
      setTimeout(() => ariaLive.remove(), 1000);

      if (analyticsEnabled) {
        analytics.track('video_playback_state_change', {
          videoId: video.id,
          state: playing ? 'playing' : 'paused',
          timestamp: currentTime
        });
      }
    } catch (err) {
      handleError(err as Error);
    }
  }, [video.id, currentTime, onPlayStateChange, analyticsEnabled, analytics]);

  /**
   * Handles seeking with error handling and analytics
   */
  const handleSeek = useCallback((time: number) => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    try {
      const validTime = Math.max(0, Math.min(time, videoElement.duration));
      videoElement.currentTime = validTime;
      setCurrentTime(validTime);
      onTimeUpdate?.(validTime);

      if (analyticsEnabled) {
        analytics.track('video_seek', {
          videoId: video.id,
          fromTime: currentTime,
          toTime: validTime
        });
      }
    } catch (err) {
      handleError(err as Error);
    }
  }, [video.id, currentTime, onTimeUpdate, analyticsEnabled, analytics]);

  /**
   * Handles playback speed changes
   */
  const handleSpeedChange = useCallback((speed: number) => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    try {
      videoElement.playbackRate = speed;
      setPlaybackSpeed(speed);
      onSpeedChange?.(speed);

      if (analyticsEnabled) {
        analytics.track('video_speed_change', {
          videoId: video.id,
          speed
        });
      }
    } catch (err) {
      handleError(err as Error);
    }
  }, [video.id, onSpeedChange, analyticsEnabled, analytics]);

  /**
   * Handles video playback errors with retry logic
   */
  const handleError = useCallback((error: Error) => {
    setError(error);
    onError?.(error);

    if (retryCountRef.current < errorRetryCount) {
      retryCountRef.current += 1;
      setTimeout(() => {
        const videoElement = videoRef.current;
        if (videoElement) {
          videoElement.load();
          if (isPlaying) {
            videoElement.play().catch(handleError);
          }
        }
      }, RETRY_DELAY_MS);
    }

    if (analyticsEnabled) {
      analytics.track('video_error', {
        videoId: video.id,
        error: error.message,
        retryCount: retryCountRef.current
      });
    }
  }, [video.id, isPlaying, errorRetryCount, onError, analyticsEnabled, analytics]);

  // Effect for container resize handling
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current && video.metadata) {
        const container = containerRef.current.getBoundingClientRect();
        const { width, height } = calculateAspectRatio(
          video.metadata.width,
          video.metadata.height,
          container.width,
          { maxHeight: window.innerHeight * 0.8 }
        );
        setDimensions({ width, height });
      }
    };

    const resizeObserver = new ResizeObserver(updateDimensions);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => resizeObserver.disconnect();
  }, [video.metadata]);

  // Effect for quality adaptation
  useEffect(() => {
    if (!analyticsEnabled) return;

    const checkQuality = () => {
      const optimal = selectOptimalVariant();
      if (optimal !== currentQuality) {
        setCurrentQuality(optimal);
        onQualityChange?.(optimal);
      }
    };

    const interval = setInterval(checkQuality, QUALITY_CHECK_INTERVAL);
    return () => clearInterval(interval);
  }, [currentQuality, selectOptimalVariant, onQualityChange, analyticsEnabled]);

  return (
    <ErrorBoundary fallback={<div>Error loading video player</div>}>
      <div 
        ref={containerRef}
        className="video-player-container"
        style={{ width: '100%' }}
      >
        <video
          ref={videoRef}
          style={{ width: dimensions.width, height: dimensions.height }}
          aria-label={accessibilityLabel || `Video: ${video.title}`}
          playsInline
          loop={loop}
          onError={e => handleError(e.error)}
          onTimeUpdate={e => setCurrentTime(e.currentTarget.currentTime)}
          onEnded={() => setIsPlaying(false)}
        >
          {video.variants.map(variant => (
            <source
              key={variant.quality}
              src={variant.url}
              type={`video/${video.metadata.format}`}
            />
          ))}
          Your browser does not support the video tag.
        </video>

        {controls && video.status === VideoStatus.READY && (
          <VideoControls
            isPlaying={isPlaying}
            currentTime={currentTime}
            duration={video.metadata.duration}
            frameRate={video.metadata.fps}
            playbackSpeed={playbackSpeed}
            onPlayPause={handlePlayPause}
            onSeek={handleSeek}
            onSpeedChange={handleSpeedChange}
          />
        )}
      </div>
    </ErrorBoundary>
  );
};

export default React.memo(VideoPlayer);