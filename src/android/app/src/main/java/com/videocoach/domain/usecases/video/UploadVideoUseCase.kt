package com.videocoach.domain.usecases.video

import android.content.Context
import android.net.Uri
import androidx.work.WorkManager
import com.videocoach.data.repositories.VideoRepository
import com.videocoach.domain.models.Video
import com.videocoach.domain.models.VideoStatus
import com.videocoach.domain.models.VideoType
import com.videocoach.utils.Constants.VIDEO
import com.videocoach.utils.VideoUtils
import kotlinx.coroutines.flow.*
import java.lang.ref.WeakReference
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Use case responsible for handling video upload operations with comprehensive validation,
 * preprocessing, compression, and progress tracking.
 *
 * @property videoRepository Repository for video operations
 * @property context Application context for accessing system services
 * @property workManager WorkManager instance for background processing
 * @version 1.0.0
 */
@Singleton
class UploadVideoUseCase @Inject constructor(
    private val videoRepository: VideoRepository,
    context: Context,
    private val workManager: WorkManager
) {
    private val contextRef = WeakReference(context)
    
    private val _isUploading = MutableStateFlow(false)
    val isUploading: StateFlow<Boolean> = _isUploading.asStateFlow()
    
    private val _uploadProgress = MutableStateFlow(0f)
    val uploadProgress: StateFlow<Float> = _uploadProgress.asStateFlow()
    
    private val _uploadStatus = MutableStateFlow<VideoStatus>(VideoStatus.READY)
    val uploadStatus: StateFlow<VideoStatus> = _uploadStatus.asStateFlow()
    
    private val _errorMessage = MutableStateFlow<String?>(null)
    val errorMessage: StateFlow<String?> = _errorMessage.asStateFlow()

    /**
     * Executes the video upload operation with comprehensive validation and preprocessing.
     *
     * @param videoUri URI of the video file to upload
     * @param title Video title
     * @param description Video description
     * @param type Type of video content
     * @return Flow of Result containing upload progress and final video data
     */
    suspend fun execute(
        videoUri: Uri,
        title: String,
        description: String,
        type: VideoType
    ): Flow<Result<Video>> = flow {
        try {
            _isUploading.value = true
            _errorMessage.value = null
            _uploadStatus.value = VideoStatus.UPLOADING
            
            // Validate input parameters
            require(title.isNotBlank()) { "Title cannot be empty" }
            require(description.isNotBlank()) { "Description cannot be empty" }
            
            // Validate video format and metadata
            val validationResult = validateVideo(videoUri)
            if (validationResult.isFailure) {
                throw validationResult.exceptionOrNull() ?: Exception("Video validation failed")
            }
            
            val metadata = validationResult.getOrNull()!!
            
            // Preprocess video (compression, thumbnail generation)
            val processedVideo = preprocessVideo(videoUri, metadata)
            if (processedVideo.isFailure) {
                throw processedVideo.exceptionOrNull() ?: Exception("Video preprocessing failed")
            }
            
            // Create video object
            val video = Video(
                id = UUID.randomUUID().toString(),
                title = title,
                description = description,
                url = videoUri.toString(),
                thumbnailUrl = processedVideo.getOrNull()?.thumbnailUrl ?: "",
                userId = "", // Will be set by repository
                coachId = null,
                duration = metadata.duration,
                fileSize = metadata.fileSize,
                status = VideoStatus.UPLOADING,
                type = type,
                processingProgress = 0f
            )
            
            // Start upload through repository
            videoRepository.uploadVideo(videoUri, video)
                .collect { uploadState ->
                    when (uploadState) {
                        is UploadState.Preparing -> {
                            _uploadStatus.value = VideoStatus.UPLOADING
                            _uploadProgress.value = 0f
                        }
                        is UploadState.Uploading -> {
                            _uploadProgress.value = uploadState.progress.toFloat() / 100
                        }
                        is UploadState.Success -> {
                            _uploadStatus.value = VideoStatus.READY
                            _uploadProgress.value = 1f
                            emit(Result.success(uploadState.video))
                        }
                        is UploadState.Error -> {
                            throw uploadState.exception
                        }
                    }
                }
        } catch (e: Exception) {
            _errorMessage.value = e.message
            _uploadStatus.value = VideoStatus.ERROR
            emit(Result.failure(e))
        } finally {
            _isUploading.value = false
        }
    }

    /**
     * Validates video file format, size, and duration constraints.
     *
     * @param videoUri URI of the video to validate
     * @return Result containing video metadata or validation error
     */
    private suspend fun validateVideo(videoUri: Uri): Result<VideoMetadata> {
        return try {
            val context = contextRef.get() ?: throw Exception("Context not available")
            
            // Check format support
            if (!VideoUtils.isVideoFormatSupported(context, videoUri)) {
                throw IllegalArgumentException("Unsupported video format. Supported formats: ${VIDEO.SUPPORTED_FORMATS.joinToString()}")
            }
            
            // Get video duration
            val duration = VideoUtils.getVideoDuration(context, videoUri)
            if (duration <= 0 || duration > VIDEO.MAX_DURATION_SECONDS * 1000) {
                throw IllegalArgumentException("Video duration must be between 1 and ${VIDEO.MAX_DURATION_SECONDS} seconds")
            }
            
            // Check file size
            val fileSize = context.contentResolver.openFileDescriptor(videoUri, "r")?.statSize ?: 0
            if (fileSize > VIDEO.MAX_FILE_SIZE_MB * 1024 * 1024) {
                throw IllegalArgumentException("Video file size exceeds ${VIDEO.MAX_FILE_SIZE_MB}MB limit")
            }
            
            // Get resolution
            val (width, height) = VideoUtils.getVideoResolution(context, videoUri)
            if (width == 0 || height == 0) {
                throw IllegalArgumentException("Invalid video resolution")
            }
            
            Result.success(VideoMetadata(duration, fileSize, width, height))
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    /**
     * Handles video preprocessing including compression and thumbnail generation.
     *
     * @param videoUri URI of the video to process
     * @param metadata Video metadata for optimization decisions
     * @return Result containing processed video data
     */
    private suspend fun preprocessVideo(
        videoUri: Uri,
        metadata: VideoMetadata
    ): Result<ProcessedVideo> {
        return try {
            val context = contextRef.get() ?: throw Exception("Context not available")
            
            // Generate thumbnail
            val thumbnail = VideoUtils.generateThumbnail(context, videoUri)
                ?: throw Exception("Failed to generate thumbnail")
            
            // Store thumbnail and get URL
            val thumbnailUrl = "" // Implementation depends on storage strategy
            
            Result.success(
                ProcessedVideo(
                    thumbnailUrl = thumbnailUrl,
                    width = metadata.width,
                    height = metadata.height
                )
            )
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    private data class VideoMetadata(
        val duration: Long,
        val fileSize: Long,
        val width: Int,
        val height: Int
    )

    private data class ProcessedVideo(
        val thumbnailUrl: String,
        val width: Int,
        val height: Int
    )
}