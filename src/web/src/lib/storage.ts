/**
 * Client-side storage utility library for managing cached data
 * Implements browser storage strategies with type-safe interfaces and robust error handling
 * @version 1.0.0
 */

import { Video, VideoMetadata } from '../types/video';
import { ApiError } from '../types/common';

// Global constants for storage configuration
const CACHE_PREFIX = 'videocoach_';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
const MAX_CACHE_SIZE = 50 * 1024 * 1024; // 50MB max cache size
const STORAGE_VERSION = '1.0';
const CLEANUP_THRESHOLD = 0.9 * MAX_CACHE_SIZE; // 90% threshold for cleanup

/**
 * Interface for stored item metadata
 */
interface StoredItemMetadata {
  version: string;
  timestamp: number;
  ttl: number;
  size: number;
}

/**
 * Interface for storage metrics
 */
interface StorageMetrics {
  totalSize: number;
  availableSpace: number;
  itemCount: number;
  lastCleanup: number;
}

/**
 * Error types for storage operations
 */
enum StorageError {
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
  VERSION_MISMATCH = 'VERSION_MISMATCH',
  INVALID_DATA = 'INVALID_DATA',
  TTL_EXPIRED = 'TTL_EXPIRED',
}

/**
 * Class managing storage operations with monitoring and cleanup
 */
export class StorageManager {
  private totalSize: number = 0;
  private availableSpace: number = 0;
  private itemSizes: Map<string, number> = new Map();
  private monitoringInterval: number;

  constructor() {
    this.initializeMetrics();
    this.monitoringInterval = window.setInterval(() => this.monitorStorageUsage(), 60000);
    window.addEventListener('storage', this.handleStorageEvent);
  }

  /**
   * Initialize storage metrics
   */
  private async initializeMetrics(): Promise<void> {
    try {
      const keys = Object.keys(localStorage);
      let totalSize = 0;

      for (const key of keys) {
        if (key.startsWith(CACHE_PREFIX)) {
          const size = localStorage.getItem(key)?.length || 0;
          this.itemSizes.set(key, size);
          totalSize += size;
        }
      }

      this.totalSize = totalSize;
      this.availableSpace = MAX_CACHE_SIZE - totalSize;
    } catch (error) {
      console.error('Failed to initialize storage metrics:', error);
    }
  }

  /**
   * Handle storage events from other tabs/windows
   */
  private handleStorageEvent = (event: StorageEvent): void => {
    if (event.key?.startsWith(CACHE_PREFIX)) {
      this.initializeMetrics();
    }
  };

  /**
   * Perform storage cleanup based on usage and TTL
   */
  public async cleanup(): Promise<void> {
    try {
      const keys = Object.keys(localStorage);
      const now = Date.now();
      let freedSpace = 0;

      for (const key of keys) {
        if (!key.startsWith(CACHE_PREFIX)) continue;

        const item = localStorage.getItem(key);
        if (!item) continue;

        try {
          const { metadata } = JSON.parse(item);
          if (now - metadata.timestamp > metadata.ttl) {
            freedSpace += this.itemSizes.get(key) || 0;
            localStorage.removeItem(key);
            this.itemSizes.delete(key);
          }
        } catch (error) {
          localStorage.removeItem(key);
          this.itemSizes.delete(key);
        }
      }

      this.totalSize -= freedSpace;
      this.availableSpace += freedSpace;

      return;
    } catch (error) {
      throw new Error(`Storage cleanup failed: ${error}`);
    }
  }

  /**
   * Dispose storage manager resources
   */
  public dispose(): void {
    clearInterval(this.monitoringInterval);
    window.removeEventListener('storage', this.handleStorageEvent);
  }
}

/**
 * Store data in browser storage with TTL and quota management
 */
export async function setItem<T>(key: string, value: T, ttl: number = CACHE_TTL): Promise<void> {
  const storageKey = `${CACHE_PREFIX}${key}`;
  const serializedData = JSON.stringify({
    data: value,
    metadata: {
      version: STORAGE_VERSION,
      timestamp: Date.now(),
      ttl,
      size: 0,
    },
  });

  const size = serializedData.length;

  try {
    if (size > MAX_CACHE_SIZE) {
      throw new Error(StorageError.QUOTA_EXCEEDED);
    }

    const storageManager = new StorageManager();
    if (size > storageManager.availableSpace) {
      await storageManager.cleanup();
      if (size > storageManager.availableSpace) {
        throw new Error(StorageError.QUOTA_EXCEEDED);
      }
    }

    localStorage.setItem(storageKey, serializedData);
  } catch (error) {
    throw new Error(`Storage operation failed: ${error}`);
  }
}

/**
 * Retrieve data from browser storage with TTL check and type validation
 */
export async function getItem<T>(key: string): Promise<T | null> {
  const storageKey = `${CACHE_PREFIX}${key}`;
  
  try {
    const item = localStorage.getItem(storageKey);
    if (!item) return null;

    const { data, metadata } = JSON.parse(item);

    if (metadata.version !== STORAGE_VERSION) {
      localStorage.removeItem(storageKey);
      throw new Error(StorageError.VERSION_MISMATCH);
    }

    if (Date.now() - metadata.timestamp > metadata.ttl) {
      localStorage.removeItem(storageKey);
      return null;
    }

    return data as T;
  } catch (error) {
    if (error instanceof SyntaxError) {
      localStorage.removeItem(storageKey);
      throw new Error(StorageError.INVALID_DATA);
    }
    throw error;
  }
}

/**
 * Cache video data for offline access with quota management
 */
export async function cacheVideo(video: Video): Promise<void> {
  try {
    const storageManager = new StorageManager();
    const videoKey = `video_${video.id}`;
    const metadataKey = `video_metadata_${video.id}`;

    // Cache video metadata
    await setItem(metadataKey, {
      id: video.id,
      metadata: video.metadata,
      timestamp: Date.now(),
    });

    // Cache video data with monitoring
    await setItem(videoKey, video);

    // Update storage metrics
    await storageManager.monitorStorageUsage();
  } catch (error) {
    throw new Error(`Video caching failed: ${error}`);
  }
}

/**
 * Monitor storage usage and trigger cleanup when needed
 */
export async function monitorStorageUsage(): Promise<StorageMetrics> {
  const storageManager = new StorageManager();
  const metrics: StorageMetrics = {
    totalSize: storageManager.totalSize,
    availableSpace: storageManager.availableSpace,
    itemCount: storageManager.itemSizes.size,
    lastCleanup: Date.now(),
  };

  if (storageManager.totalSize > CLEANUP_THRESHOLD) {
    await storageManager.cleanup();
  }

  return metrics;
}