package com.videocoach.data.database.entities

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey
import androidx.room.TypeConverter
import com.squareup.moshi.JsonAdapter
import com.squareup.moshi.Moshi
import com.videocoach.domain.models.Video
import com.videocoach.domain.models.VideoStatus
import com.videocoach.domain.models.VideoType
import com.videocoach.domain.models.Annotation

/**
 * Room entity class representing a video in the local SQLite database.
 * Provides comprehensive persistence for video metadata, processing status,
 * annotations, and supports efficient offline access.
 */
@Entity(
    tableName = "videos",
    indices = [
        Index(value = ["user_id", "status"]),
        Index(value = ["coach_id"])
    ]
)
data class VideoEntity(
    @PrimaryKey
    @ColumnInfo(name = "id")
    val id: String,

    @ColumnInfo(name = "title")
    val title: String,

    @ColumnInfo(name = "description")
    val description: String,

    @ColumnInfo(name = "url")
    val url: String,

    @ColumnInfo(name = "thumbnail_url")
    val thumbnailUrl: String,

    @ColumnInfo(name = "user_id")
    val userId: String,

    @ColumnInfo(name = "coach_id")
    val coachId: String?,

    @ColumnInfo(name = "duration")
    val duration: Long,

    @ColumnInfo(name = "file_size")
    val fileSize: Long,

    @ColumnInfo(name = "status")
    val status: VideoStatus,

    @ColumnInfo(name = "type")
    val type: VideoType,

    @ColumnInfo(name = "annotations_json")
    val annotationsJson: String,

    @ColumnInfo(name = "processing_progress")
    val processingProgress: Float,

    @ColumnInfo(name = "error_details")
    val errorDetails: String?,

    @ColumnInfo(name = "created_at")
    val createdAt: Long,

    @ColumnInfo(name = "updated_at")
    val updatedAt: Long
) {
    /**
     * Computed properties for quick status checks without parsing JSON
     */
    val isProcessed: Boolean
        get() = status == VideoStatus.READY

    val hasAnnotations: Boolean
        get() = annotationsJson.isNotEmpty() && annotationsJson != "[]"

    val hasError: Boolean
        get() = status == VideoStatus.ERROR && !errorDetails.isNullOrEmpty()

    /**
     * Converts entity to domain model with enhanced error handling
     * @return Result containing either successful Video conversion or failure details
     */
    fun toVideo(): Result<Video> = runCatching {
        // Parse annotations JSON with error handling
        val annotations = try {
            annotationsAdapter.fromJson(annotationsJson) ?: emptyList()
        } catch (e: Exception) {
            return Result.failure(IllegalStateException("Failed to parse annotations: ${e.message}"))
        }

        Video(
            id = id,
            title = title,
            description = description,
            url = url,
            thumbnailUrl = thumbnailUrl,
            userId = userId,
            coachId = coachId,
            duration = duration,
            fileSize = fileSize,
            status = status,
            type = type,
            annotations = annotations,
            processingProgress = processingProgress,
            createdAt = createdAt,
            updatedAt = updatedAt
        )
    }

    companion object {
        private val moshi = Moshi.Builder().build()
        private val annotationsAdapter: JsonAdapter<List<Annotation>> = 
            moshi.adapter(Types.newParameterizedType(List::class.java, Annotation::class.java))

        /**
         * Creates entity from domain model with validation
         * @param video Domain model to convert
         * @return VideoEntity instance
         * @throws IllegalArgumentException if video data is invalid
         */
        fun fromVideo(video: Video): VideoEntity {
            require(video.id.isNotEmpty()) { "Video ID cannot be empty" }
            require(video.title.isNotEmpty()) { "Video title cannot be empty" }
            require(video.url.isNotEmpty()) { "Video URL cannot be empty" }

            val annotationsJson = try {
                annotationsAdapter.toJson(video.annotations)
            } catch (e: Exception) {
                throw IllegalArgumentException("Failed to serialize annotations: ${e.message}")
            }

            return VideoEntity(
                id = video.id,
                title = video.title,
                description = video.description,
                url = video.url,
                thumbnailUrl = video.thumbnailUrl,
                userId = video.userId,
                coachId = video.coachId,
                duration = video.duration,
                fileSize = video.fileSize,
                status = video.status,
                type = video.type,
                annotationsJson = annotationsJson,
                processingProgress = video.processingProgress,
                errorDetails = if (video.status == VideoStatus.ERROR) "Processing failed" else null,
                createdAt = video.createdAt,
                updatedAt = System.currentTimeMillis()
            )
        }
    }
}

/**
 * Type converters for Room to handle custom types
 */
class VideoConverters {
    @TypeConverter
    fun toVideoStatus(value: String) = enumValueOf<VideoStatus>(value)

    @TypeConverter
    fun fromVideoStatus(value: VideoStatus) = value.name

    @TypeConverter
    fun toVideoType(value: String) = enumValueOf<VideoType>(value)

    @TypeConverter
    fun fromVideoType(value: VideoType) = value.name
}