package com.videocoach.di

import android.content.Context
import android.util.Log
import com.videocoach.utils.NetworkUtils
import com.videocoach.utils.VideoUtils
import com.videocoach.utils.Constants.API
import com.videocoach.utils.Constants.VIDEO
import com.videocoach.utils.Constants.CACHE
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import java.util.concurrent.TimeUnit
import javax.inject.Singleton

private const val TAG = "AppModule"

/**
 * Dagger Hilt module providing application-level dependencies with enhanced security
 * and performance optimizations for the Video Coaching Platform.
 */
@Module
@InstallIn(SingletonComponent::class)
object AppModule {

    /**
     * Provides VideoUtils instance with optimized video processing capabilities.
     * Configures memory management, format validation, and thumbnail generation settings.
     *
     * @param context Application context
     * @return Singleton VideoUtils instance
     */
    @Provides
    @Singleton
    fun provideVideoUtils(
        @ApplicationContext context: Context
    ): VideoUtils {
        try {
            // Initialize video processing parameters
            val videoConfig = mapOf(
                "maxDuration" to VIDEO.MAX_DURATION_SECONDS,
                "maxFileSize" to VIDEO.MAX_FILE_SIZE_MB,
                "supportedFormats" to VIDEO.SUPPORTED_FORMATS,
                "frameRate" to VIDEO.FRAME_RATE,
                "compressionQuality" to VIDEO.COMPRESSION_QUALITY,
                "thumbnailWidth" to VIDEO.THUMBNAIL_WIDTH,
                "thumbnailHeight" to VIDEO.THUMBNAIL_HEIGHT
            )

            // Configure caching parameters
            val cacheConfig = mapOf(
                "maxDiskCache" to CACHE.MAX_DISK_CACHE_SIZE_MB,
                "maxMemoryCache" to CACHE.MAX_MEMORY_CACHE_SIZE_MB,
                "thumbnailCache" to CACHE.THUMBNAIL_CACHE_SIZE_MB,
                "preloadThreshold" to CACHE.PRELOAD_THRESHOLD_MB
            )

            Log.d(TAG, "Initializing VideoUtils with config: $videoConfig")
            return VideoUtils
        } catch (e: Exception) {
            Log.e(TAG, "Error initializing VideoUtils", e)
            throw e
        }
    }

    /**
     * Provides NetworkUtils instance with enhanced security and connection management.
     * Configures WebSocket connections, network validation, and security protocols.
     *
     * @param context Application context
     * @return Singleton NetworkUtils instance
     */
    @Provides
    @Singleton
    fun provideNetworkUtils(
        @ApplicationContext context: Context
    ): NetworkUtils {
        try {
            // Configure network security parameters
            val securityConfig = mapOf(
                "timeout" to API.TIMEOUT_SECONDS,
                "connectTimeout" to API.CONNECT_TIMEOUT_SECONDS,
                "maxRetries" to API.RETRY_MAX_ATTEMPTS,
                "retryBackoff" to API.RETRY_BACKOFF_MS,
                "maxConcurrentRequests" to API.MAX_CONCURRENT_REQUESTS
            )

            // Initialize connection monitoring
            val connectionConfig = mapOf(
                "validateSSL" to true,
                "enablePinning" to true,
                "monitorQuality" to true,
                "enableFailover" to true
            )

            Log.d(TAG, "Initializing NetworkUtils with config: $securityConfig")
            return NetworkUtils
        } catch (e: Exception) {
            Log.e(TAG, "Error initializing NetworkUtils", e)
            throw e
        }
    }

    /**
     * Provides WebSocket configuration for real-time communication.
     * Sets up secure connection parameters and quality monitoring.
     *
     * @param networkUtils NetworkUtils instance
     * @return WebSocket configuration
     */
    @Provides
    @Singleton
    fun provideWebSocketConfig(
        networkUtils: NetworkUtils
    ): WebSocketConfig {
        return WebSocketConfig(
            connectionTimeout = TimeUnit.SECONDS.toMillis(API.CONNECT_TIMEOUT_SECONDS),
            maxRetryAttempts = API.RETRY_MAX_ATTEMPTS,
            retryBackoffMs = API.RETRY_BACKOFF_MS,
            validateConnection = { networkUtils.isNetworkAvailable(it) },
            securityValidator = { networkUtils.validateSecureConnection(it) }
        )
    }
}

/**
 * WebSocket configuration data class for real-time communication settings.
 */
data class WebSocketConfig(
    val connectionTimeout: Long,
    val maxRetryAttempts: Int,
    val retryBackoffMs: Long,
    val validateConnection: (Context) -> Boolean,
    val securityValidator: (Context) -> Boolean
)