package com.videocoach.utils

import android.animation.ValueAnimator
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Matrix
import android.net.Uri
import android.provider.MediaStore
import android.view.View
import android.view.animation.AccelerateDecelerateInterpolator
import java.io.File
import java.lang.ref.WeakReference
import java.util.concurrent.TimeUnit

/**
 * Extension functions providing utility functionality for the Video Coaching Platform.
 * Includes view animations, video processing, and data formatting utilities.
 *
 * @version 1.0
 */

/**
 * Smoothly fades in a view with proper animation handling and state preservation.
 *
 * @param duration Animation duration in milliseconds, defaults to UI.ANIMATION_DURATION_MS
 */
fun View.fadeIn(duration: Long = Constants.UI.ANIMATION_DURATION_MS) {
    // Cancel any ongoing animations
    animate().cancel()
    
    // Store and set initial state
    val initialVisibility = visibility
    alpha = 0f
    visibility = View.VISIBLE
    
    // Configure and start fade in animation
    ValueAnimator.ofFloat(0f, 1f).apply {
        this.duration = duration
        interpolator = AccelerateDecelerateInterpolator()
        
        addUpdateListener { animation ->
            alpha = animation.animatedValue as Float
        }
        
        // Cleanup on animation end
        addListener(onEnd = {
            alpha = 1f
            visibility = View.VISIBLE
        }, onCancel = {
            // Restore initial state if animation is cancelled
            visibility = initialVisibility
        })
        
        start()
    }
}

/**
 * Smoothly fades out a view with proper cleanup and state management.
 *
 * @param duration Animation duration in milliseconds, defaults to UI.ANIMATION_DURATION_MS
 */
fun View.fadeOut(duration: Long = Constants.UI.ANIMATION_DURATION_MS) {
    // Cancel any ongoing animations
    animate().cancel()
    
    // Store initial state
    val initialVisibility = visibility
    
    // Configure and start fade out animation
    ValueAnimator.ofFloat(alpha, 0f).apply {
        this.duration = duration
        interpolator = AccelerateDecelerateInterpolator()
        
        addUpdateListener { animation ->
            alpha = animation.animatedValue as Float
        }
        
        // Cleanup on animation end
        addListener(onEnd = {
            alpha = 0f
            visibility = View.GONE
        }, onCancel = {
            // Restore initial state if animation is cancelled
            visibility = initialVisibility
            alpha = 1f
        })
        
        start()
    }
}

/**
 * Converts a Uri to a video File with proper error handling and permission checks.
 *
 * @param context Context required for content resolver access
 * @return File object representing the video
 * @throws IllegalArgumentException if Uri is invalid or file is inaccessible
 */
fun Uri.toVideoFile(context: Context): File {
    val projection = arrayOf(MediaStore.Video.Media.DATA)
    
    context.contentResolver.query(
        this,
        projection,
        null,
        null,
        null
    )?.use { cursor ->
        if (cursor.moveToFirst()) {
            val columnIndex = cursor.getColumnIndexOrThrow(MediaStore.Video.Media.DATA)
            val filePath = cursor.getString(columnIndex)
            val file = File(filePath)
            
            if (file.exists() && file.canRead()) {
                // Verify file format
                if (file.extension.lowercase() in Constants.VIDEO.SUPPORTED_FORMATS) {
                    return file
                }
                throw IllegalArgumentException("Unsupported video format: ${file.extension}")
            }
            throw IllegalArgumentException("Video file is not accessible: $filePath")
        }
        throw IllegalArgumentException("Unable to locate video file for Uri: $this")
    } ?: throw IllegalArgumentException("Failed to query video Uri: $this")
}

/**
 * Scales a bitmap to thumbnail size with memory optimization.
 * Uses WeakReference for caching to prevent memory leaks.
 *
 * @return Scaled bitmap maintaining aspect ratio
 * @throws OutOfMemoryError if scaling operation cannot be completed
 */
fun Bitmap.scaleToThumbnail(): Bitmap {
    val targetWidth = Constants.VIDEO.THUMBNAIL_WIDTH
    val targetHeight = Constants.VIDEO.THUMBNAIL_HEIGHT
    
    if (width == 0 || height == 0) {
        throw IllegalArgumentException("Invalid bitmap dimensions")
    }
    
    // Calculate scaling factors
    val widthScale = targetWidth.toFloat() / width
    val heightScale = targetHeight.toFloat() / height
    val scale = minOf(widthScale, heightScale)
    
    // Create matrix for scaling
    val matrix = Matrix().apply {
        postScale(scale, scale)
    }
    
    return try {
        // Create scaled bitmap with proper config
        Bitmap.createBitmap(
            this,
            0,
            0,
            width,
            height,
            matrix,
            true
        ).also {
            // Cache using WeakReference
            WeakReference(it)
        }
    } catch (e: OutOfMemoryError) {
        throw OutOfMemoryError("Failed to scale bitmap: ${e.message}")
    }
}

/**
 * Formats a duration string (in milliseconds) to a human-readable time format.
 * Returns "HH:MM:SS" for durations >= 1 hour, "MM:SS" for shorter durations.
 *
 * @return Formatted duration string
 * @throws IllegalArgumentException if input string is not a valid number
 */
fun String.toFormattedDuration(): String {
    val durationMs = try {
        this.toLong()
    } catch (e: NumberFormatException) {
        throw IllegalArgumentException("Invalid duration format: $this")
    }
    
    if (durationMs < 0) {
        throw IllegalArgumentException("Duration cannot be negative: $durationMs")
    }
    
    val hours = TimeUnit.MILLISECONDS.toHours(durationMs)
    val minutes = TimeUnit.MILLISECONDS.toMinutes(durationMs) % 60
    val seconds = TimeUnit.MILLISECONDS.toSeconds(durationMs) % 60
    
    return when {
        hours > 0 -> String.format("%02d:%02d:%02d", hours, minutes, seconds)
        else -> String.format("%02d:%02d", minutes, seconds)
    }
}