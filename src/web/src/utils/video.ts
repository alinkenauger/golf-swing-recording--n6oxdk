/**
 * Comprehensive utility functions for video processing, validation, and display
 * @version 1.0.0
 * @package @video-coaching-platform/web
 */

import { VideoMetadata, VideoStatus } from '../types/video';

// Supported formats and codecs
const SUPPORTED_VIDEO_FORMATS = ['mp4', 'mov', 'avi', 'webm'] as const;
const SUPPORTED_VIDEO_CODECS = ['h264', 'vp8', 'vp9'] as const;

// Video constraints
const MAX_VIDEO_DURATION_SECONDS = 3600; // 1 hour
const MAX_FILE_SIZE_BYTES = 1024 * 1024 * 100; // 100MB
const DEFAULT_THUMBNAIL_SIZE = { width: 320, height: 180 };
const MIN_FPS = 24;
const MAX_FPS = 60;

/**
 * Validates video file format, size, duration, codec and fps
 * @param file - Video file to validate
 * @returns Promise resolving to VideoStatus with validation result
 */
export const validateVideoFile = async (file: File): Promise<VideoStatus> => {
  try {
    // Check file format
    const fileExtension = file.name.split('.').pop()?.toLowerCase();
    if (!fileExtension || !SUPPORTED_VIDEO_FORMATS.includes(fileExtension as any)) {
      return VideoStatus.INVALID_FORMAT;
    }

    // Check file size
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return VideoStatus.INVALID_FORMAT;
    }

    // Extract and validate metadata
    const metadata = await extractVideoMetadata(file);
    
    // Validate codec
    if (!SUPPORTED_VIDEO_CODECS.includes(metadata.codec as any)) {
      return VideoStatus.INVALID_CODEC;
    }

    // Validate FPS
    if (metadata.fps < MIN_FPS || metadata.fps > MAX_FPS) {
      return VideoStatus.INVALID_FORMAT;
    }

    // Validate duration
    if (metadata.duration > MAX_VIDEO_DURATION_SECONDS) {
      return VideoStatus.INVALID_FORMAT;
    }

    return VideoStatus.VALID;
  } catch (error) {
    console.error('Video validation error:', error);
    return VideoStatus.INVALID_FORMAT;
  }
};

/**
 * Extracts comprehensive technical metadata from video file
 * @param file - Video file to extract metadata from
 * @returns Promise resolving to VideoMetadata
 */
export const extractVideoMetadata = async (file: File): Promise<VideoMetadata> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(file);
    
    let frameCount = 0;
    let startTime: number;
    
    video.onloadedmetadata = () => {
      // Start FPS calculation
      startTime = performance.now();
      requestAnimationFrame(function countFrames() {
        frameCount++;
        if (frameCount < 60) { // Sample first 60 frames
          requestAnimationFrame(countFrames);
        } else {
          const endTime = performance.now();
          const fps = Math.round((frameCount / (endTime - startTime)) * 1000);
          
          const metadata: VideoMetadata = {
            duration: video.duration,
            width: video.videoWidth,
            height: video.videoHeight,
            fps: fps,
            codec: determineCodec(video),
            sizeBytes: file.size,
            format: file.name.split('.').pop()?.toLowerCase() || ''
          };
          
          URL.revokeObjectURL(url);
          resolve(metadata);
        }
      });
    };

    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load video metadata'));
    };

    video.src = url;
  });
};

/**
 * Generates optimized thumbnail image from video at specified timestamp
 * @param videoFile - Source video file
 * @param timestamp - Timestamp in seconds to capture thumbnail
 * @param options - Optional configuration for thumbnail generation
 * @returns Promise resolving to thumbnail Blob
 */
export const generateThumbnail = async (
  videoFile: File,
  timestamp: number,
  options: { quality?: number; format?: 'jpeg' | 'png' } = {}
): Promise<Blob> => {
  const { quality = 0.8, format = 'jpeg' } = options;
  
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    const url = URL.createObjectURL(videoFile);
    
    video.onloadedmetadata = () => {
      canvas.width = DEFAULT_THUMBNAIL_SIZE.width;
      canvas.height = DEFAULT_THUMBNAIL_SIZE.height;
      
      video.currentTime = Math.min(timestamp, video.duration);
    };
    
    video.onseeked = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to get canvas context'));
        return;
      }
      
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      canvas.toBlob(
        (blob) => {
          if (blob) {
            URL.revokeObjectURL(url);
            resolve(blob);
          } else {
            reject(new Error('Failed to generate thumbnail'));
          }
        },
        `image/${format}`,
        quality
      );
    };
    
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load video for thumbnail generation'));
    };
    
    video.src = url;
  });
};

/**
 * Formats video duration in seconds to HH:MM:SS format
 * @param seconds - Duration in seconds
 * @param showMs - Whether to include milliseconds
 * @returns Formatted duration string
 */
export const formatDuration = (seconds: number, showMs = false): string => {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '00:00:00';
  }

  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);

  const parts = [
    hrs.toString().padStart(2, '0'),
    mins.toString().padStart(2, '0'),
    secs.toString().padStart(2, '0')
  ];

  return showMs ? `${parts.join(':')}:${ms.toString().padStart(3, '0')}` : parts.join(':');
};

/**
 * Calculates video aspect ratio and dimensions for responsive display
 * @param width - Original video width
 * @param height - Original video height
 * @param containerWidth - Target container width
 * @param constraints - Optional constraints for calculation
 * @returns Calculated dimensions and aspect ratio
 */
export const calculateAspectRatio = (
  width: number,
  height: number,
  containerWidth: number,
  constraints?: { maxHeight?: number; preserveRatio?: boolean }
): { width: number; height: number; ratio: number } => {
  if (width <= 0 || height <= 0 || containerWidth <= 0) {
    throw new Error('Invalid dimensions provided');
  }

  const ratio = width / height;
  let targetWidth = containerWidth;
  let targetHeight = containerWidth / ratio;

  if (constraints?.maxHeight && targetHeight > constraints.maxHeight) {
    targetHeight = constraints.maxHeight;
    targetWidth = constraints.preserveRatio ? targetHeight * ratio : containerWidth;
  }

  return {
    width: Math.round(targetWidth),
    height: Math.round(targetHeight),
    ratio
  };
};

/**
 * Helper function to determine video codec
 * @param video - Video element to check codec for
 * @returns Detected codec string
 */
const determineCodec = (video: HTMLVideoElement): string => {
  const codecs = {
    'video/mp4; codecs="avc1.42E01E"': 'h264',
    'video/webm; codecs="vp8"': 'vp8',
    'video/webm; codecs="vp9"': 'vp9'
  };

  const mediaSource = MediaSource || window.MediaSource;
  
  for (const [codec, name] of Object.entries(codecs)) {
    if (mediaSource.isTypeSupported(codec)) {
      return name;
    }
  }

  return 'unknown';
};