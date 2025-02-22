/**
 * Custom React hook for managing comprehensive video operations
 * Includes chunked upload, real-time annotation, voice-over recording, and advanced playback controls
 * @version 1.0.0
 */

import { useState, useEffect, useCallback } from 'react'; // ^18.2.0
import { VideoService } from '../services/video.service';
import { Video, VideoStatus, VideoAnnotation, VideoQuality } from '../types/video';
import { ApiError } from '../types/common';

// Constants for video operations
const PLAYBACK_SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2] as const;
const QUALITY_LEVELS = [VideoQuality.ORIGINAL, VideoQuality.HD, VideoQuality.SD, VideoQuality.MOBILE] as const;

interface UseVideoOptions {
  autoLoad?: boolean;
  enableOfflineSupport?: boolean;
  quality?: VideoQuality;
  initialSpeed?: number;
}

interface UploadStatus {
  progress: number;
  state: 'idle' | 'uploading' | 'paused' | 'completed' | 'error';
  error?: string;
}

interface OfflineStatus {
  isOffline: boolean;
  pendingSync: number;
  lastSynced: Date | null;
}

interface VoiceOverState {
  isRecording: boolean;
  duration: number;
  volume: number;
}

/**
 * Custom hook for managing video operations
 */
export function useVideo(videoId?: string, options: UseVideoOptions = {}) {
  const [video, setVideo] = useState<Video | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>({
    progress: 0,
    state: 'idle'
  });
  const [offlineStatus, setOfflineStatus] = useState<OfflineStatus>({
    isOffline: !navigator.onLine,
    pendingSync: 0,
    lastSynced: null
  });
  const [playbackSpeed, setPlaybackSpeed] = useState(options.initialSpeed || 1);
  const [currentQuality, setCurrentQuality] = useState(options.quality || VideoQuality.HD);
  const [voiceOverState, setVoiceOverState] = useState<VoiceOverState>({
    isRecording: false,
    duration: 0,
    volume: 1
  });

  const videoService = new VideoService(null);

  /**
   * Load video data with offline support
   */
  const loadVideo = useCallback(async () => {
    if (!videoId) return;

    setIsLoading(true);
    setError(null);

    try {
      const videoData = await videoService.getVideo(videoId);
      setVideo(videoData);
    } catch (err) {
      const error = err as ApiError;
      setError(error.message);
    } finally {
      setIsLoading(false);
    }
  }, [videoId]);

  /**
   * Upload video with chunked upload support
   */
  const uploadVideo = useCallback(async (file: File, title: string, description: string) => {
    setUploadStatus({ progress: 0, state: 'uploading' });
    setError(null);

    try {
      const uploadedVideo = await videoService.uploadVideo(file, {
        file,
        title,
        description
      });

      setVideo(uploadedVideo);
      setUploadStatus({ progress: 100, state: 'completed' });
      return uploadedVideo;
    } catch (err) {
      const error = err as ApiError;
      setUploadStatus({ progress: 0, state: 'error', error: error.message });
      setError(error.message);
      throw error;
    }
  }, []);

  /**
   * Pause ongoing upload
   */
  const pauseUpload = useCallback(() => {
    videoService.pauseUpload();
    setUploadStatus(prev => ({ ...prev, state: 'paused' }));
  }, []);

  /**
   * Resume paused upload
   */
  const resumeUpload = useCallback(() => {
    videoService.resumeUpload();
    setUploadStatus(prev => ({ ...prev, state: 'uploading' }));
  }, []);

  /**
   * Add annotation with offline support
   */
  const addAnnotation = useCallback(async (annotation: Omit<VideoAnnotation, 'id' | 'createdAt'>) => {
    if (!video) return;

    try {
      const newAnnotation = await videoService.addAnnotation(video.id, annotation as VideoAnnotation);
      setVideo(prev => prev ? {
        ...prev,
        annotations: [...prev.annotations, newAnnotation]
      } : null);
      return newAnnotation;
    } catch (err) {
      if (!navigator.onLine && options.enableOfflineSupport) {
        // Store annotation locally for later sync
        setOfflineStatus(prev => ({
          ...prev,
          pendingSync: prev.pendingSync + 1
        }));
      } else {
        const error = err as ApiError;
        setError(error.message);
        throw error;
      }
    }
  }, [video, options.enableOfflineSupport]);

  /**
   * Start voice-over recording
   */
  const startVoiceOver = useCallback(async () => {
    if (!video) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      const audioChunks: BlobPart[] = [];

      mediaRecorder.ondataavailable = (event) => {
        audioChunks.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        try {
          await videoService.addVoiceOver(video.id, audioBlob, {
            startTime: 0,
            duration: voiceOverState.duration,
            volume: voiceOverState.volume,
            quality: 'high'
          });
        } catch (err) {
          const error = err as ApiError;
          setError(error.message);
        }
      };

      setVoiceOverState(prev => ({ ...prev, isRecording: true }));
      mediaRecorder.start();
    } catch (err) {
      const error = err as Error;
      setError(error.message);
    }
  }, [video, voiceOverState.duration, voiceOverState.volume]);

  /**
   * Stop voice-over recording
   */
  const stopVoiceOver = useCallback(() => {
    setVoiceOverState(prev => ({ ...prev, isRecording: false }));
  }, []);

  /**
   * Set video playback speed
   */
  const setPlaybackSpeed = useCallback((speed: number) => {
    if (PLAYBACK_SPEEDS.includes(speed as typeof PLAYBACK_SPEEDS[number])) {
      setPlaybackSpeed(speed);
    }
  }, []);

  /**
   * Set video quality
   */
  const setVideoQuality = useCallback((quality: VideoQuality) => {
    if (QUALITY_LEVELS.includes(quality)) {
      setCurrentQuality(quality);
    }
  }, []);

  /**
   * Extract frame at specific timestamp
   */
  const extractFrame = useCallback(async (timestamp: number): Promise<string> => {
    if (!video) throw new Error('No video loaded');

    const video_element = document.createElement('video');
    video_element.src = video.variants.find(v => v.quality === currentQuality)?.url || '';

    return new Promise((resolve, reject) => {
      video_element.onseeked = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = video_element.videoWidth;
          canvas.height = video_element.videoHeight;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(video_element, 0, 0);
          resolve(canvas.toDataURL('image/jpeg'));
        } catch (err) {
          reject(err);
        }
      };
      video_element.currentTime = timestamp;
    });
  }, [video, currentQuality]);

  /**
   * Sync offline annotations
   */
  const syncAnnotations = useCallback(async () => {
    if (!video || !options.enableOfflineSupport) return;

    try {
      await videoService.syncAnnotations(video.id);
      setOfflineStatus(prev => ({
        ...prev,
        pendingSync: 0,
        lastSynced: new Date()
      }));
    } catch (err) {
      const error = err as ApiError;
      setError(error.message);
    }
  }, [video, options.enableOfflineSupport]);

  // Handle online/offline status
  useEffect(() => {
    const handleOnline = () => {
      setOfflineStatus(prev => ({ ...prev, isOffline: false }));
      if (options.enableOfflineSupport) {
        syncAnnotations();
      }
    };

    const handleOffline = () => {
      setOfflineStatus(prev => ({ ...prev, isOffline: true }));
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [options.enableOfflineSupport, syncAnnotations]);

  // Initial load
  useEffect(() => {
    if (options.autoLoad && videoId) {
      loadVideo();
    }
  }, [options.autoLoad, videoId, loadVideo]);

  // Cleanup
  useEffect(() => {
    return () => {
      videoService.dispose();
    };
  }, []);

  return {
    video,
    isLoading,
    error,
    uploadStatus,
    uploadVideo,
    pauseUpload,
    resumeUpload,
    addAnnotation,
    syncAnnotations,
    startVoiceOver,
    stopVoiceOver,
    setPlaybackSpeed,
    setVideoQuality,
    extractFrame,
    offlineStatus,
    playbackSpeed,
    currentQuality,
    voiceOverState
  };
}