/**
 * TypeScript type definitions and interfaces for video-related functionality
 * Includes comprehensive types for video metadata, processing status, annotations, and voice-overs
 * @version 1.0.0
 */

import { BaseEntity } from './common';

/**
 * Supported video file formats
 */
export const SUPPORTED_VIDEO_FORMATS = ['mp4', 'mov', 'avi', 'webm'] as const;

/**
 * Maximum allowed video duration in seconds (1 hour)
 */
export const MAX_VIDEO_DURATION_SECONDS = 3600;

/**
 * Maximum allowed file size in bytes (100MB)
 */
export const MAX_FILE_SIZE_BYTES = 1024 * 1024 * 100;

/**
 * Enum representing the current status of a video in the processing pipeline
 */
export enum VideoStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  READY = 'READY',
  FAILED = 'FAILED'
}

/**
 * Enum representing available video quality variants
 */
export enum VideoQuality {
  ORIGINAL = 'ORIGINAL',
  HD = 'HD', // 1080p
  SD = 'SD', // 720p
  MOBILE = 'MOBILE' // 480p
}

/**
 * Interface for video technical metadata
 */
export interface VideoMetadata {
  duration: number; // Duration in seconds
  width: number; // Width in pixels
  height: number; // Height in pixels
  fps: number; // Frames per second
  codec: string; // Video codec (e.g., 'h264', 'vp9')
  sizeBytes: number; // File size in bytes
  format: string; // File format (e.g., 'mp4', 'mov')
}

/**
 * Interface for video quality variants
 */
export interface VideoVariant {
  quality: VideoQuality;
  url: string;
  metadata: VideoMetadata;
}

/**
 * Interface for video annotations including drawings and voice-overs
 */
export interface VideoAnnotation {
  id: string;
  userId: string;
  timestamp: number; // Timestamp in milliseconds where annotation appears
  type: 'drawing' | 'text' | 'voiceover';
  data: Record<string, any>; // Flexible structure for different annotation types
  createdAt: string;
}

/**
 * Main interface for video data including metadata, variants and annotations
 * Extends BaseEntity for common fields (id, createdAt, updatedAt)
 */
export interface Video extends BaseEntity {
  userId: string;
  title: string;
  description: string;
  status: VideoStatus;
  metadata: VideoMetadata;
  variants: VideoVariant[];
  annotations: VideoAnnotation[];
}

/**
 * Interface for video upload requests
 */
export interface VideoUploadRequest {
  file: File;
  title: string;
  description: string;
}

/**
 * Interface for video metadata update requests
 */
export interface VideoUpdateRequest {
  title: string;
  description: string;
}