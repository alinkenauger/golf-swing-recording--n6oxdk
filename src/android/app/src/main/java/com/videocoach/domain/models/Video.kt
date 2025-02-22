package com.videocoach.domain.models

import android.os.Parcelable
import androidx.annotation.NonNull
import androidx.annotation.Size
import kotlinx.parcelize.Parcelize
import java.util.concurrent.TimeUnit

/**
 * Enum class representing possible states of a video during processing pipeline
 */
enum class VideoStatus {
    UPLOADING,        // Video is being uploaded to storage
    PROCESSING,       // Video is undergoing format conversion and compression
    GENERATING_VARIANTS, // Creating different quality variants of the video
    READY,           // Video is fully processed and ready for playback
    ERROR            // Error occurred during upload/processing with error details
}

/**
 * Enum class representing types of videos in the platform
 */
enum class VideoType {
    TRAINING,    // Training video from coach with instructional content
    PRACTICE,    // Practice video from athlete for review
    FEEDBACK,    // Feedback video with annotations and voice-over
    COMPARISON   // Side-by-side comparison video for analysis
}

/**
 * Domain model representing a video in the Video Coaching Platform.
 * Supports comprehensive video metadata, processing status tracking,
 * annotation management, and split-screen comparison functionality.
 */
@Parcelize
data class Video(
    @NonNull val id: String,
    @NonNull val title: String,
    @NonNull val description: String,
    @NonNull val url: String,
    @NonNull val thumbnailUrl: String,
    @NonNull val userId: String,
    val coachId: String?,
    @NonNull val duration: Long,
    @NonNull val fileSize: Long,
    @NonNull var status: VideoStatus,
    @NonNull val type: VideoType,
    @Size(max = 1000) var annotations: List<Annotation> = emptyList(),
    @NonNull var variantUrls: Map<String, String> = emptyMap(),
    @NonNull var compressionQuality: Int = 100,
    @NonNull var processingProgress: Float = 0f,
    @NonNull val createdAt: Long = System.currentTimeMillis(),
    @NonNull var updatedAt: Long = System.currentTimeMillis()
) : Parcelable {

    /**
     * Computed properties
     */
    val isProcessed: Boolean
        get() = status == VideoStatus.READY

    val hasAnnotations: Boolean
        get() = annotations.isNotEmpty()

    val hasVariants: Boolean
        get() = variantUrls.isNotEmpty()

    val formattedDuration: String
        get() {
            val minutes = TimeUnit.MILLISECONDS.toMinutes(duration)
            val seconds = TimeUnit.MILLISECONDS.toSeconds(duration) % 60
            return String.format("%02d:%02d", minutes, seconds)
        }

    val frameMarkers: List<Long>
        get() = annotations.map { it.timestamp }.sorted()

    var currentPlaybackPosition: Long = 0

    var isInSplitScreenMode: Boolean = false

    /**
     * Adds a new annotation with timestamp validation
     * @param annotation The annotation to add
     * @return Updated video instance with new annotation
     * @throws IllegalArgumentException if timestamp is invalid
     */
    fun addAnnotation(annotation: Annotation): Video {
        require(annotation.timestamp in 0..duration) {
            "Annotation timestamp must be within video duration"
        }

        // Check for timestamp conflicts
        annotations.find { abs(it.timestamp - annotation.timestamp) < 500 }?.let {
            throw IllegalArgumentException("Annotation timestamp too close to existing annotation")
        }

        val updatedAnnotations = (annotations + annotation).sortedBy { it.timestamp }
        return copy(
            annotations = updatedAnnotations,
            updatedAt = System.currentTimeMillis()
        )
    }

    /**
     * Removes an annotation and updates related metadata
     * @param annotationId ID of annotation to remove
     * @return Updated video instance without the annotation
     * @throws IllegalArgumentException if annotation not found
     */
    fun removeAnnotation(annotationId: String): Video {
        val updatedAnnotations = annotations.filterNot { it.id == annotationId }
        require(updatedAnnotations.size < annotations.size) {
            "Annotation with ID $annotationId not found"
        }

        return copy(
            annotations = updatedAnnotations,
            updatedAt = System.currentTimeMillis()
        )
    }

    /**
     * Updates video processing status and progress
     * @param newStatus New processing status
     * @param progress Processing progress (0-100)
     * @return Updated video instance with new status
     * @throws IllegalStateException if status transition is invalid
     */
    fun updateProcessingStatus(newStatus: VideoStatus, progress: Float): Video {
        require(progress in 0f..100f) {
            "Progress must be between 0 and 100"
        }

        // Validate status transitions
        when (status) {
            VideoStatus.ERROR -> throw IllegalStateException("Cannot update status from ERROR state")
            VideoStatus.READY -> require(newStatus == VideoStatus.ERROR) {
                "Cannot change status from READY except to ERROR"
            }
            else -> {
                // Ensure sequential progression
                require(newStatus.ordinal >= status.ordinal) {
                    "Invalid status transition from $status to $newStatus"
                }
            }
        }

        return copy(
            status = newStatus,
            processingProgress = progress,
            updatedAt = System.currentTimeMillis()
        )
    }

    companion object {
        private fun abs(value: Long): Long = if (value < 0) -value else value
    }
}