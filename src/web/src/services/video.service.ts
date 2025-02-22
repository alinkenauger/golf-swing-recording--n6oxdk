/**
 * Video Service Implementation
 * Handles video operations including upload, processing, annotation, and playback
 * @version 1.0.0
 */

import { injectable } from 'inversify';
import axios, { AxiosProgressEvent } from 'axios'; // ^1.6.0
import { 
  Video, 
  VideoMetadata, 
  VideoStatus, 
  VideoAnnotation,
  VideoUploadRequest,
  SUPPORTED_VIDEO_FORMATS,
  MAX_FILE_SIZE_BYTES
} from '../types/video';
import { ApiClient } from '../lib/api';
import { cacheVideo } from '../lib/storage';
import { API_ROUTES } from '../constants/api';
import { ApiResponse, ApiError } from '../types/common';

// Constants for video operations
const CHUNK_SIZE = 1024 * 1024 * 5; // 5MB chunks
const MAX_RETRIES = 3;
const UPLOAD_TIMEOUT = 30000; // 30 seconds
const PROCESSING_POLL_INTERVAL = 2000; // 2 seconds

/**
 * Interface for upload session
 */
interface UploadSession {
  sessionId: string;
  uploadUrl: string;
  chunkSize: number;
  expiresAt: number;
}

/**
 * Interface for voice-over options
 */
interface VoiceOverOptions {
  startTime: number;
  duration: number;
  volume: number;
  quality: 'high' | 'medium' | 'low';
}

/**
 * Cache entry interface for video data
 */
interface CacheEntry {
  data: Video;
  timestamp: number;
  ttl: number;
}

@injectable()
export class VideoService {
  private readonly apiClient: ApiClient;
  private readonly baseUrl: string;
  private readonly videoCache: Map<string, CacheEntry>;
  private readonly retryDelay: number;
  private abortController: AbortController;

  constructor(apiClient: ApiClient) {
    this.apiClient = apiClient;
    this.baseUrl = API_ROUTES.VIDEO.UPLOAD;
    this.videoCache = new Map();
    this.retryDelay = 1000;
    this.abortController = new AbortController();
  }

  /**
   * Validates video file format and size
   */
  private validateVideoFile(file: File): void {
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!extension || !SUPPORTED_VIDEO_FORMATS.includes(extension)) {
      throw new Error(`Unsupported video format. Supported formats: ${SUPPORTED_VIDEO_FORMATS.join(', ')}`);
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      throw new Error(`File size exceeds maximum limit of ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB`);
    }
  }

  /**
   * Creates upload session for chunked upload
   */
  private async createUploadSession(file: File): Promise<UploadSession> {
    const response = await this.apiClient.post<{ file: File }, UploadSession>(
      `${this.baseUrl}/session`,
      { file },
      { timeout: UPLOAD_TIMEOUT }
    );
    return response.data;
  }

  /**
   * Uploads video file with chunked upload support and retry mechanism
   */
  public async uploadVideo(file: File, metadata: VideoUploadRequest): Promise<Video> {
    try {
      this.validateVideoFile(file);
      const session = await this.createUploadSession(file);
      const chunks = Math.ceil(file.size / CHUNK_SIZE);
      let uploadedChunks = 0;

      for (let i = 0; i < chunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunk = file.slice(start, end);
        let retries = 0;

        while (retries < MAX_RETRIES) {
          try {
            await this.uploadChunk(session, chunk, i, chunks, (progress) => {
              const totalProgress = ((uploadedChunks + progress) / chunks) * 100;
              // Emit progress event
            });
            break;
          } catch (error) {
            retries++;
            if (retries === MAX_RETRIES) throw error;
            await new Promise(resolve => setTimeout(resolve, this.retryDelay * retries));
          }
        }
        uploadedChunks++;
      }

      const response = await this.apiClient.post<VideoUploadRequest, Video>(
        `${this.baseUrl}/complete/${session.sessionId}`,
        metadata
      );

      const video = response.data;
      await this.pollProcessingStatus(video.id);
      await cacheVideo(video);

      return video;
    } catch (error) {
      throw new Error(`Video upload failed: ${(error as Error).message}`);
    }
  }

  /**
   * Uploads individual chunk with progress tracking
   */
  private async uploadChunk(
    session: UploadSession,
    chunk: Blob,
    chunkIndex: number,
    totalChunks: number,
    onProgress: (progress: number) => void
  ): Promise<void> {
    const formData = new FormData();
    formData.append('chunk', chunk);
    formData.append('chunkIndex', chunkIndex.toString());
    formData.append('totalChunks', totalChunks.toString());

    await this.apiClient.post(
      session.uploadUrl,
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent: AxiosProgressEvent) => {
          const progress = progressEvent.loaded / progressEvent.total!;
          onProgress(progress);
        },
        signal: this.abortController.signal
      }
    );
  }

  /**
   * Polls for video processing status
   */
  private async pollProcessingStatus(videoId: string): Promise<void> {
    let attempts = 0;
    const maxAttempts = 30; // 1 minute maximum polling time

    while (attempts < maxAttempts) {
      const video = await this.getVideo(videoId);
      if (video.status === VideoStatus.READY) return;
      if (video.status === VideoStatus.FAILED) {
        throw new Error('Video processing failed');
      }
      await new Promise(resolve => setTimeout(resolve, PROCESSING_POLL_INTERVAL));
      attempts++;
    }
    throw new Error('Video processing timeout');
  }

  /**
   * Retrieves video by ID with caching support
   */
  public async getVideo(videoId: string): Promise<Video> {
    const cached = this.videoCache.get(videoId);
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      return cached.data;
    }

    const response = await this.apiClient.get<Video>(
      API_ROUTES.VIDEO.GET_BY_ID.replace(':id', videoId)
    );

    const video = response.data;
    this.videoCache.set(videoId, {
      data: video,
      timestamp: Date.now(),
      ttl: 5 * 60 * 1000 // 5 minutes cache TTL
    });

    return video;
  }

  /**
   * Adds annotation to video
   */
  public async addAnnotation(videoId: string, annotation: VideoAnnotation): Promise<VideoAnnotation> {
    const response = await this.apiClient.post<VideoAnnotation, VideoAnnotation>(
      API_ROUTES.VIDEO.ADD_ANNOTATION.replace(':id', videoId),
      annotation
    );

    // Update cache
    const cached = this.videoCache.get(videoId);
    if (cached) {
      cached.data.annotations.push(response.data);
      this.videoCache.set(videoId, cached);
    }

    return response.data;
  }

  /**
   * Adds voice-over to video
   */
  public async addVoiceOver(
    videoId: string,
    audioBlob: Blob,
    options: VoiceOverOptions
  ): Promise<VideoAnnotation> {
    const formData = new FormData();
    formData.append('audio', audioBlob);
    formData.append('options', JSON.stringify(options));

    const response = await this.apiClient.post<FormData, VideoAnnotation>(
      API_ROUTES.VIDEO.ADD_VOICEOVER.replace(':id', videoId),
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' }
      }
    );

    // Update cache
    const cached = this.videoCache.get(videoId);
    if (cached) {
      cached.data.annotations.push(response.data);
      this.videoCache.set(videoId, cached);
    }

    return response.data;
  }

  /**
   * Cancels ongoing upload
   */
  public cancelUpload(): void {
    this.abortController.abort();
    this.abortController = new AbortController();
  }

  /**
   * Cleans up service resources
   */
  public dispose(): void {
    this.videoCache.clear();
    this.cancelUpload();
  }
}