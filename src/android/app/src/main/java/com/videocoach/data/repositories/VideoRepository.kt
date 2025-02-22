package com.videocoach.data.repositories

import android.net.Uri
import com.videocoach.data.api.ApiService
import com.videocoach.data.database.dao.VideoDao
import com.videocoach.data.database.entities.VideoEntity
import com.videocoach.domain.models.Video
import com.videocoach.domain.models.VideoStatus
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.asRequestBody
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.math.min

/**
 * Repository implementation for managing video data with offline-first architecture.
 * Handles local caching, remote synchronization, and provides a clean API for video operations.
 * Version: 1.0.0
 */
@Singleton
class VideoRepository @Inject constructor(
    private val videoDao: VideoDao,
    private val apiService: ApiService
) {
    private val repositoryScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    
    private val _isUploading = MutableStateFlow(false)
    val isUploading: StateFlow<Boolean> = _isUploading.asStateFlow()
    
    private val _networkState = MutableStateFlow<NetworkState>(NetworkState.Connected)
    val networkState: StateFlow<NetworkState> = _networkState.asStateFlow()

    /**
     * Retrieves a video by ID with offline-first strategy and background sync
     * @param videoId Unique identifier of the video
     * @return Flow of Result containing video data or error
     */
    fun getVideo(videoId: String): Flow<Result<Video>> = flow {
        // First emit from local cache
        videoDao.getVideoById(videoId)
            .map { entity -> 
                entity?.toVideo() ?: Result.failure(NoSuchElementException("Video not found"))
            }
            .collect { result ->
                emit(result)
                
                // Attempt background sync if connected
                if (_networkState.value is NetworkState.Connected) {
                    try {
                        val response = apiService.getVideo("Bearer ${getAuthToken()}", videoId).blockingGet()
                        if (response.isSuccessful()) {
                            response.data?.let { video ->
                                videoDao.insertVideo(VideoEntity.fromVideo(video))
                            }
                        }
                    } catch (e: Exception) {
                        // Log error but don't emit - we already emitted cached data
                        logError("Background sync failed", e)
                    }
                }
            }
    }.flowOn(Dispatchers.IO)

    /**
     * Uploads video with progress tracking and retry mechanism
     * @param videoUri URI of the video file to upload
     * @param metadata Video metadata
     * @return Flow of UploadState for tracking progress
     */
    fun uploadVideo(videoUri: Uri, metadata: Video): Flow<UploadState> = flow {
        emit(UploadState.Preparing)
        
        try {
            _isUploading.value = true
            
            // Validate video file
            val videoFile = File(videoUri.path!!)
            require(videoFile.exists()) { "Video file not found" }
            require(videoFile.length() > 0) { "Video file is empty" }
            
            // Create local entry
            val localVideo = metadata.copy(
                status = VideoStatus.UPLOADING,
                processingProgress = 0f
            )
            videoDao.insertVideo(VideoEntity.fromVideo(localVideo))
            
            // Prepare multipart request
            val videoRequestBody = videoFile.asRequestBody("video/*".toMediaTypeOrNull())
            val videoPart = MultipartBody.Part.createFormData(
                "video",
                videoFile.name,
                videoRequestBody
            )
            
            emit(UploadState.Uploading(0))
            
            // Upload with retry mechanism
            var attempts = 0
            var success = false
            while (attempts < MAX_UPLOAD_ATTEMPTS && !success) {
                try {
                    val response = apiService.uploadVideo(
                        "Bearer ${getAuthToken()}",
                        videoPart,
                        createMetadataRequestBody(metadata)
                    ).blockingGet()
                    
                    if (response.isSuccessful()) {
                        response.data?.let { video ->
                            videoDao.insertVideo(VideoEntity.fromVideo(video))
                            emit(UploadState.Success(video))
                            success = true
                        }
                    } else {
                        throw Exception(response.message ?: "Upload failed")
                    }
                } catch (e: Exception) {
                    attempts++
                    if (attempts >= MAX_UPLOAD_ATTEMPTS) {
                        throw e
                    }
                    // Exponential backoff
                    kotlinx.coroutines.delay(INITIAL_RETRY_DELAY * (1 shl (attempts - 1)))
                }
            }
        } catch (e: Exception) {
            emit(UploadState.Error(e))
            // Update local status
            videoDao.updateVideoStatus(
                metadata.id,
                VideoStatus.ERROR,
                0f
            )
        } finally {
            _isUploading.value = false
        }
    }.flowOn(Dispatchers.IO)

    /**
     * Adds annotation with validation and conflict resolution
     * @param videoId ID of the video to annotate
     * @param annotation Annotation to add
     * @return Result containing updated video or error
     */
    suspend fun addAnnotation(videoId: String, annotation: Annotation): Result<Video> {
        return try {
            // Validate video exists
            val videoEntity = videoDao.getVideoById(videoId).first()
                ?: return Result.failure(NoSuchElementException("Video not found"))
            
            val video = videoEntity.toVideo().getOrThrow()
            
            // Validate annotation
            val updatedVideo = video.addAnnotation(annotation)
            
            // Update local cache
            videoDao.updateVideoAnnotations(
                videoId,
                VideoEntity.fromVideo(updatedVideo).annotationsJson
            )
            
            // Sync with server if connected
            if (_networkState.value is NetworkState.Connected) {
                val response = apiService.addVideoAnnotation(
                    "Bearer ${getAuthToken()}",
                    videoId,
                    createAnnotationRequest(annotation)
                ).blockingGet()
                
                if (!response.isSuccessful()) {
                    throw Exception(response.message ?: "Failed to sync annotation")
                }
            }
            
            Result.success(updatedVideo)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    private fun logError(message: String, error: Throwable) {
        // Implementation depends on logging strategy
    }

    private fun getAuthToken(): String {
        // Implementation depends on auth management strategy
        return ""
    }

    companion object {
        private const val MAX_UPLOAD_ATTEMPTS = 3
        private const val INITIAL_RETRY_DELAY = 1000L // 1 second
    }
}

sealed class NetworkState {
    object Connected : NetworkState()
    object Disconnected : NetworkState()
}

sealed class UploadState {
    object Preparing : UploadState()
    data class Uploading(val progress: Int) : UploadState()
    data class Success(val video: Video) : UploadState()
    data class Error(val exception: Exception) : UploadState()
}