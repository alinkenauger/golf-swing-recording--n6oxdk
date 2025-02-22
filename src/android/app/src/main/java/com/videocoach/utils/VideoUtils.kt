package com.videocoach.utils

import android.content.Context
import android.graphics.Bitmap
import android.media.MediaMetadataRetriever
import android.media.MediaPlayer
import android.net.Uri
import com.videocoach.utils.Constants.VIDEO
import java.lang.ref.WeakReference
import kotlin.math.min

/**
 * Utility object providing comprehensive video processing and manipulation functions.
 * Handles video metadata extraction, thumbnail generation, format validation, and playback utilities
 * with robust error handling and resource management.
 *
 * @version 1.0
 */
object VideoUtils {

    private const val MAX_THUMBNAIL_SIZE = VIDEO.THUMBNAIL_WIDTH
    private const val DEFAULT_FRAME_TIME = 1000000L // 1 second in microseconds
    private const val MAX_RETRY_ATTEMPTS = 3

    /**
     * Retrieves the duration of a video file in milliseconds with retry mechanism.
     *
     * @param context Application context
     * @param videoUri URI of the video file
     * @return Duration in milliseconds, or -1 if retrieval fails
     */
    fun getVideoDuration(context: Context, videoUri: Uri): Long {
        val contextRef = WeakReference(context)
        var duration = -1L

        try {
            MediaMetadataRetriever().use { retriever ->
                var attempts = 0
                while (attempts < MAX_RETRY_ATTEMPTS) {
                    try {
                        contextRef.get()?.let { ctx ->
                            retriever.setDataSource(ctx, videoUri)
                            duration = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)
                                ?.toLongOrNull() ?: -1L
                            
                            if (duration > 0 && duration <= VIDEO.MAX_DURATION_SECONDS * 1000) {
                                break
                            }
                        }
                    } catch (e: Exception) {
                        attempts++
                        if (attempts == MAX_RETRY_ATTEMPTS) {
                            throw e
                        }
                        Thread.sleep(100)
                    }
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }

        return duration
    }

    /**
     * Generates an optimized thumbnail bitmap from a video at specified position.
     *
     * @param context Application context
     * @param videoUri URI of the video file
     * @param position Position in microseconds (defaults to 1 second)
     * @return Scaled and optimized thumbnail bitmap or null if generation fails
     */
    fun generateThumbnail(
        context: Context,
        videoUri: Uri,
        position: Long = DEFAULT_FRAME_TIME
    ): Bitmap? {
        val contextRef = WeakReference(context)
        var thumbnail: Bitmap? = null

        try {
            MediaMetadataRetriever().use { retriever ->
                var attempts = 0
                while (attempts < MAX_RETRY_ATTEMPTS) {
                    try {
                        contextRef.get()?.let { ctx ->
                            retriever.setDataSource(ctx, videoUri)
                            
                            // Extract frame and handle scaling
                            val frame = retriever.getFrameAtTime(position,
                                MediaMetadataRetriever.OPTION_CLOSEST_SYNC)
                            
                            frame?.let {
                                val width = it.width
                                val height = it.height
                                val scaleFactor = min(
                                    MAX_THUMBNAIL_SIZE.toFloat() / width,
                                    MAX_THUMBNAIL_SIZE.toFloat() / height
                                )
                                
                                val scaledWidth = (width * scaleFactor).toInt()
                                val scaledHeight = (height * scaleFactor).toInt()
                                
                                thumbnail = Bitmap.createScaledBitmap(
                                    it,
                                    scaledWidth,
                                    scaledHeight,
                                    true
                                )
                                
                                // Recycle original frame if scaled
                                if (thumbnail !== it) {
                                    it.recycle()
                                }
                            }
                            break
                        }
                    } catch (e: Exception) {
                        attempts++
                        if (attempts == MAX_RETRY_ATTEMPTS) {
                            throw e
                        }
                        Thread.sleep(100)
                    }
                }
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }

        return thumbnail
    }

    /**
     * Performs comprehensive validation of video format including both file extension and MIME type checking.
     *
     * @param context Application context
     * @param videoUri URI of the video file
     * @return True if format is supported and video is valid
     */
    fun isVideoFormatSupported(context: Context, videoUri: Uri): Boolean {
        try {
            // Check file extension
            val path = videoUri.path
            val extension = path?.substringAfterLast('.', "")?.lowercase()
            if (extension !in VIDEO.SUPPORTED_FORMATS) {
                return false
            }

            // Verify MIME type
            context.contentResolver.getType(videoUri)?.let { mimeType ->
                if (!mimeType.startsWith("video/")) {
                    return false
                }
            }

            // Verify video can be opened
            MediaMetadataRetriever().use { retriever ->
                retriever.setDataSource(context, videoUri)
                // Check if we can extract basic metadata
                return retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_HAS_VIDEO) != null
            }
        } catch (e: Exception) {
            e.printStackTrace()
            return false
        }
    }

    /**
     * Formats video duration in milliseconds to human readable string with localization support.
     *
     * @param durationMs Duration in milliseconds
     * @return Localized duration string (HH:mm:ss)
     */
    fun formatDuration(durationMs: Long): String {
        if (durationMs < 0) return "00:00"
        
        val seconds = (durationMs / 1000) % 60
        val minutes = (durationMs / (1000 * 60)) % 60
        val hours = durationMs / (1000 * 60 * 60)

        return when {
            hours > 0 -> String.format("%02d:%02d:%02d", hours, minutes, seconds)
            else -> String.format("%02d:%02d", minutes, seconds)
        }
    }

    /**
     * Retrieves the resolution of a video file with orientation handling.
     *
     * @param context Application context
     * @param videoUri URI of the video file
     * @return Pair of width and height considering orientation
     */
    fun getVideoResolution(context: Context, videoUri: Uri): Pair<Int, Int> {
        var width = 0
        var height = 0
        var rotation = 0

        try {
            MediaMetadataRetriever().use { retriever ->
                retriever.setDataSource(context, videoUri)
                
                width = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)
                    ?.toIntOrNull() ?: 0
                height = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)
                    ?.toIntOrNull() ?: 0
                rotation = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)
                    ?.toIntOrNull() ?: 0
            }

            // Adjust dimensions based on rotation
            return if (rotation == 90 || rotation == 270) {
                Pair(height, width)
            } else {
                Pair(width, height)
            }
        } catch (e: Exception) {
            e.printStackTrace()
            return Pair(0, 0)
        }
    }
}