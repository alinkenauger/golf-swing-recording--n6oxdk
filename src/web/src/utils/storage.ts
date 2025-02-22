/**
 * Advanced utility module for managing client-side storage operations
 * Implements type-safe storage, encryption, compression, and intelligent caching
 * @version 1.0.0
 */

import CryptoJS from 'crypto-js'; // v4.2.0
import { VideoProcessingStatus } from '../types/common';
import { validateVideoFile } from './video';

// Storage keys for different data types
const STORAGE_KEYS = {
  USER_PREFERENCES: 'user_prefs',
  AUTH_TOKEN: 'auth_token',
  CACHED_VIDEOS: 'cached_videos',
  TEMP_ANNOTATIONS: 'temp_annotations',
  ENCRYPTION_KEY: 'enc_key',
  CACHE_METADATA: 'cache_meta'
} as const;

// Storage configuration constants
const MAX_CACHE_SIZE_MB = 100;
const CACHE_EXPIRY_HOURS = 24;
const CLEANUP_INTERVAL_MS = 3600000; // 1 hour
const COMPRESSION_THRESHOLD_BYTES = 1024 * 1024; // 1MB

// Type definitions
interface StorageOptions {
  encrypt?: boolean;
  compress?: boolean;
  expiry?: number;
}

interface CacheMetadata {
  size: number;
  lastAccessed: number;
  expiresAt: number;
  status: VideoProcessingStatus;
}

interface CacheResult {
  success: boolean;
  metadata: CacheMetadata;
}

interface CleanupOptions {
  force?: boolean;
  targetSizeMB?: number;
}

interface CleanupResult {
  bytesRecovered: number;
  itemsRemoved: number;
}

/**
 * Advanced storage management class with quota monitoring and cleanup
 */
export class StorageManager {
  private currentCacheSize: number;
  private cacheIndex: Map<string, CacheMetadata>;
  private cleanupInterval: number;
  private defaultOptions: StorageOptions;

  constructor(config?: { cleanupInterval?: number; defaultOptions?: StorageOptions }) {
    this.currentCacheSize = this.calculateCurrentCacheSize();
    this.cacheIndex = this.initializeCacheIndex();
    this.cleanupInterval = config?.cleanupInterval || CLEANUP_INTERVAL_MS;
    this.defaultOptions = config?.defaultOptions || { encrypt: true, compress: true };
    
    this.startCleanupTimer();
    this.recoverFromCorruption();
  }

  /**
   * Calculates total cache size from stored items
   */
  private calculateCurrentCacheSize(): number {
    let totalSize = 0;
    for (const key in localStorage) {
      if (localStorage.hasOwnProperty(key)) {
        totalSize += localStorage[key].length;
      }
    }
    return totalSize;
  }

  /**
   * Initializes cache index from metadata
   */
  private initializeCacheIndex(): Map<string, CacheMetadata> {
    try {
      const storedIndex = localStorage.getItem(STORAGE_KEYS.CACHE_METADATA);
      return storedIndex ? new Map(JSON.parse(storedIndex)) : new Map();
    } catch {
      return new Map();
    }
  }

  /**
   * Starts automatic cleanup timer
   */
  private startCleanupTimer(): void {
    setInterval(() => {
      this.cleanup({ force: false });
    }, this.cleanupInterval);
  }

  /**
   * Recovers from potential storage corruption
   */
  private recoverFromCorruption(): void {
    try {
      const cacheMetadata = localStorage.getItem(STORAGE_KEYS.CACHE_METADATA);
      if (!cacheMetadata) {
        this.rebuildCacheIndex();
      }
    } catch {
      this.rebuildCacheIndex();
    }
  }

  /**
   * Rebuilds cache index from existing storage items
   */
  private rebuildCacheIndex(): void {
    this.cacheIndex.clear();
    for (const key in localStorage) {
      if (key.startsWith(STORAGE_KEYS.CACHED_VIDEOS)) {
        try {
          const metadata = this.getItemMetadata(key);
          if (metadata) {
            this.cacheIndex.set(key, metadata);
          }
        } catch {
          localStorage.removeItem(key);
        }
      }
    }
    this.saveCacheIndex();
  }

  /**
   * Intelligent cleanup system for managing storage quota
   */
  public async cleanup(options: CleanupOptions = {}): Promise<CleanupResult> {
    const result: CleanupResult = { bytesRecovered: 0, itemsRemoved: 0 };
    
    // Check if cleanup is needed
    if (!options.force && this.currentCacheSize < (MAX_CACHE_SIZE_MB * 0.9)) {
      return result;
    }

    // Remove expired items
    for (const [key, metadata] of this.cacheIndex) {
      if (Date.now() > metadata.expiresAt) {
        const size = metadata.size;
        localStorage.removeItem(key);
        this.cacheIndex.delete(key);
        result.bytesRecovered += size;
        result.itemsRemoved++;
      }
    }

    // If still need more space, remove least recently accessed items
    if (options.targetSizeMB && this.currentCacheSize > options.targetSizeMB * 1024 * 1024) {
      const sortedItems = Array.from(this.cacheIndex.entries())
        .sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);

      for (const [key, metadata] of sortedItems) {
        if (this.currentCacheSize <= options.targetSizeMB * 1024 * 1024) break;
        
        localStorage.removeItem(key);
        this.cacheIndex.delete(key);
        result.bytesRecovered += metadata.size;
        result.itemsRemoved++;
      }
    }

    this.saveCacheIndex();
    this.currentCacheSize = this.calculateCurrentCacheSize();
    return result;
  }

  /**
   * Saves current cache index to storage
   */
  private saveCacheIndex(): void {
    localStorage.setItem(
      STORAGE_KEYS.CACHE_METADATA,
      JSON.stringify(Array.from(this.cacheIndex.entries()))
    );
  }

  /**
   * Gets cache statistics
   */
  public getCacheStats() {
    return {
      totalSize: this.currentCacheSize,
      itemCount: this.cacheIndex.size,
      maxSize: MAX_CACHE_SIZE_MB * 1024 * 1024
    };
  }
}

/**
 * Enhanced type-safe wrapper for localStorage.setItem with encryption and compression
 */
export async function setItem<T>(
  key: keyof typeof STORAGE_KEYS,
  value: T,
  options: StorageOptions = {}
): Promise<void> {
  const storageKey = STORAGE_KEYS[key];
  let data = JSON.stringify(value);

  // Compress if needed
  if (options.compress && data.length > COMPRESSION_THRESHOLD_BYTES) {
    data = btoa(pako.deflate(data, { to: 'string' }));
  }

  // Encrypt if needed
  if (options.encrypt) {
    const encryptionKey = localStorage.getItem(STORAGE_KEYS.ENCRYPTION_KEY) ||
      CryptoJS.lib.WordArray.random(256 / 8).toString();
    data = CryptoJS.AES.encrypt(data, encryptionKey).toString();
    
    if (!localStorage.getItem(STORAGE_KEYS.ENCRYPTION_KEY)) {
      localStorage.setItem(STORAGE_KEYS.ENCRYPTION_KEY, encryptionKey);
    }
  }

  localStorage.setItem(storageKey, data);
}

/**
 * Enhanced type-safe wrapper for localStorage.getItem with decryption and decompression
 */
export async function getItem<T>(
  key: keyof typeof STORAGE_KEYS,
  options: StorageOptions = {}
): Promise<T | null> {
  const storageKey = STORAGE_KEYS[key];
  let data = localStorage.getItem(storageKey);

  if (!data) return null;

  // Decrypt if needed
  if (options.encrypt) {
    const encryptionKey = localStorage.getItem(STORAGE_KEYS.ENCRYPTION_KEY);
    if (!encryptionKey) return null;
    
    try {
      const bytes = CryptoJS.AES.decrypt(data, encryptionKey);
      data = bytes.toString(CryptoJS.enc.Utf8);
    } catch {
      return null;
    }
  }

  // Decompress if needed
  if (options.compress && data.startsWith('data:')) {
    try {
      data = pako.inflate(atob(data.split(',')[1]), { to: 'string' });
    } catch {
      return null;
    }
  }

  try {
    return JSON.parse(data) as T;
  } catch {
    return null;
  }
}

/**
 * Advanced video caching system with format validation and size management
 */
export async function cacheVideo(
  videoId: string,
  videoData: Blob,
  options: StorageOptions = {}
): Promise<CacheResult> {
  const storageManager = new StorageManager();
  
  // Validate video format
  const validationResult = await validateVideoFile(new File([videoData], 'video'));
  if (validationResult !== VideoProcessingStatus.READY) {
    return {
      success: false,
      metadata: {
        size: videoData.size,
        lastAccessed: Date.now(),
        expiresAt: Date.now(),
        status: VideoProcessingStatus.FAILED
      }
    };
  }

  // Check cache space
  const stats = storageManager.getCacheStats();
  if (stats.totalSize + videoData.size > stats.maxSize) {
    await storageManager.cleanup({
      force: true,
      targetSizeMB: (stats.totalSize + videoData.size) / (1024 * 1024)
    });
  }

  // Store video with metadata
  const key = `${STORAGE_KEYS.CACHED_VIDEOS}_${videoId}`;
  const metadata: CacheMetadata = {
    size: videoData.size,
    lastAccessed: Date.now(),
    expiresAt: Date.now() + (options.expiry || CACHE_EXPIRY_HOURS) * 3600000,
    status: VideoProcessingStatus.READY
  };

  try {
    await setItem(key as keyof typeof STORAGE_KEYS, videoData, options);
    return { success: true, metadata };
  } catch {
    return { success: false, metadata: { ...metadata, status: VideoProcessingStatus.FAILED } };
  }
}

// Export singleton instance
export const storageManager = new StorageManager();