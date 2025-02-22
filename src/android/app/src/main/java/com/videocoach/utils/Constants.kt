/**
 * Constants used throughout the Video Coaching Platform Android application.
 * Provides centralized access to critical application parameters with type safety.
 *
 * @version 1.0
 */
object Constants {

    /**
     * API configuration constants for network communication settings.
     * Defines endpoints, timeouts, and retry policies for backend communication.
     */
    object API {
        const val BASE_URL = "https://api.videocoach.com/v1"
        const val TIMEOUT_SECONDS = 30L
        const val CONNECT_TIMEOUT_SECONDS = 10L
        const val RETRY_MAX_ATTEMPTS = 3
        const val RETRY_BACKOFF_MS = 1000L
        const val MAX_CONCURRENT_REQUESTS = 4
    }

    /**
     * Authentication related constants for secure user session management.
     * Defines token configurations, password policies, and security parameters.
     */
    object AUTH {
        const val TOKEN_HEADER = "Authorization"
        const val TOKEN_PREFIX = "Bearer "
        const val TOKEN_EXPIRY_HOURS = 24
        const val REFRESH_TOKEN_EXPIRY_DAYS = 7
        const val MIN_PASSWORD_LENGTH = 8
        const val MAX_LOGIN_ATTEMPTS = 5
        const val LOCKOUT_DURATION_MINUTES = 30
    }

    /**
     * Video processing related constants for media handling.
     * Defines video constraints, formats, and quality parameters.
     */
    object VIDEO {
        const val MAX_DURATION_SECONDS = 600
        const val MAX_FILE_SIZE_MB = 500
        val SUPPORTED_FORMATS = arrayOf("mp4", "mov", "avi")
        const val THUMBNAIL_WIDTH = 320
        const val THUMBNAIL_HEIGHT = 180
        const val MAX_BITRATE_MBPS = 8
        const val FRAME_RATE = 30
        const val COMPRESSION_QUALITY = 0.8f
    }

    /**
     * Caching related constants for performance optimization.
     * Defines cache sizes, TTL values, and preloading thresholds.
     */
    object CACHE {
        const val USER_PROFILE_TTL_HOURS = 24
        const val VIDEO_METADATA_TTL_MINUTES = 30
        const val MAX_DISK_CACHE_SIZE_MB = 500
        const val MAX_MEMORY_CACHE_SIZE_MB = 50
        const val THUMBNAIL_CACHE_SIZE_MB = 100
        const val PRELOAD_THRESHOLD_MB = 20
    }

    /**
     * UI related constants for consistent user interaction.
     * Defines gesture thresholds, animation durations, and interaction parameters.
     */
    object UI {
        const val MIN_SWIPE_DISTANCE = 100f
        const val ANIMATION_DURATION_MS = 300L
        const val MAX_ZOOM_LEVEL = 3.0f
        const val MIN_ZOOM_LEVEL = 1.0f
        const val DOUBLE_TAP_TIMEOUT_MS = 300L
        const val SCROLL_THRESHOLD_PX = 8f
        const val RIPPLE_DURATION_MS = 250L
        const val TOUCH_SLOP_FACTOR = 1.5f
    }
}