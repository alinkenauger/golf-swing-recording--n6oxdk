package com.videocoach.presentation.home

import androidx.lifecycle.viewModelScope // v2.6.2
import com.videocoach.data.repositories.VideoRepository
import com.videocoach.domain.models.Video
import com.videocoach.domain.models.VideoStatus
import com.videocoach.domain.models.VideoType
import com.videocoach.presentation.base.BaseViewModel
import kotlinx.coroutines.flow.* // v1.7.3
import kotlinx.coroutines.launch
import android.net.Uri
import androidx.work.NetworkMonitor // v2.8.1
import javax.inject.Inject

/**
 * ViewModel for managing home screen state and user interactions.
 * Implements offline-first architecture with enhanced video processing support.
 */
class HomeViewModel @Inject constructor(
    private val videoRepository: VideoRepository,
    private val networkMonitor: NetworkMonitor
) : BaseViewModel() {

    private val _videos = MutableStateFlow<PaginatedList<Video>>(PaginatedList.empty())
    val videos: StateFlow<PaginatedList<Video>> = _videos.asStateFlow()

    private val _isRefreshing = MutableStateFlow(false)
    val isRefreshing: StateFlow<Boolean> = _isRefreshing.asStateFlow()

    private val _uploadProgress = MutableStateFlow<Map<String, UploadProgress>>(emptyMap())
    val uploadProgress: StateFlow<Map<String, UploadProgress>> = _uploadProgress.asStateFlow()

    private val _networkStatus = MutableStateFlow<NetworkState>(NetworkState.Connected)

    private var lastRefreshTime = 0L
    private val refreshDebounceTime = 5000L // 5 seconds

    init {
        observeNetworkStatus()
        loadInitialData()
        setupBackgroundUploadWorker()
    }

    /**
     * Loads paginated videos for the current user with offline support
     * @param page Page number to load
     * @param pageSize Number of items per page
     */
    fun loadVideos(page: Int = 0, pageSize: Int = 20) {
        launchWithLoading {
            try {
                val result = videoRepository.getVideosByUser(page, pageSize)
                    .catch { e -> handleError(e) }
                    .collect { videos ->
                        val currentList = _videos.value
                        val updatedList = if (page == 0) {
                            PaginatedList(videos, page, pageSize)
                        } else {
                            currentList.copy(
                                items = currentList.items + videos,
                                currentPage = page
                            )
                        }
                        _videos.value = updatedList
                    }
            } catch (e: Exception) {
                handleError(e)
            }
        }
    }

    /**
     * Refreshes the video feed with debounce protection
     */
    fun refreshVideos() {
        val currentTime = System.currentTimeMillis()
        if (currentTime - lastRefreshTime < refreshDebounceTime) return

        viewModelScope.launch {
            try {
                _isRefreshing.value = true
                lastRefreshTime = currentTime
                
                // Clear existing pagination
                _videos.value = PaginatedList.empty()
                
                // Reload first page
                loadVideos(0)
            } catch (e: Exception) {
                handleError(e)
            } finally {
                _isRefreshing.value = false
            }
        }
    }

    /**
     * Initiates video upload process with background support
     * @param videoUri URI of the video file to upload
     * @param metadata Video metadata
     */
    fun uploadVideo(videoUri: Uri, metadata: Video) {
        viewModelScope.launch {
            try {
                // Initialize upload progress tracking
                val uploadId = metadata.id
                _uploadProgress.value = _uploadProgress.value + (uploadId to UploadProgress.Preparing)

                videoRepository.uploadVideo(videoUri, metadata)
                    .catch { e ->
                        _uploadProgress.value = _uploadProgress.value + 
                            (uploadId to UploadProgress.Error(e.message ?: "Upload failed"))
                        handleError(e)
                    }
                    .collect { state ->
                        when (state) {
                            is UploadState.Preparing -> {
                                _uploadProgress.value = _uploadProgress.value + 
                                    (uploadId to UploadProgress.Preparing)
                            }
                            is UploadState.Uploading -> {
                                _uploadProgress.value = _uploadProgress.value + 
                                    (uploadId to UploadProgress.Progress(state.progress))
                            }
                            is UploadState.Success -> {
                                _uploadProgress.value = _uploadProgress.value + 
                                    (uploadId to UploadProgress.Complete)
                                // Refresh videos list
                                refreshVideos()
                            }
                            is UploadState.Error -> {
                                _uploadProgress.value = _uploadProgress.value + 
                                    (uploadId to UploadProgress.Error(state.exception.message ?: "Upload failed"))
                            }
                        }
                    }
            } catch (e: Exception) {
                handleError(e)
            }
        }
    }

    /**
     * Observes network connectivity changes
     */
    private fun observeNetworkStatus() {
        viewModelScope.launch {
            networkMonitor.isOnline
                .onEach { isOnline ->
                    _networkStatus.value = if (isOnline) {
                        NetworkState.Connected
                    } else {
                        NetworkState.Disconnected
                    }
                }
                .catch { e -> handleError(e) }
                .collect()
        }
    }

    /**
     * Loads initial data and sets up background sync
     */
    private fun loadInitialData() {
        viewModelScope.launch {
            loadVideos()
            // Setup periodic background sync if needed
        }
    }

    /**
     * Sets up background upload worker for offline support
     */
    private fun setupBackgroundUploadWorker() {
        viewModelScope.launch {
            // Monitor pending uploads and retry when network is available
            videoRepository.getPendingVideos()
                .collect { pendingVideos ->
                    pendingVideos.forEach { video ->
                        if (_networkStatus.value is NetworkState.Connected) {
                            // Retry upload
                            // Implementation depends on WorkManager configuration
                        }
                    }
                }
        }
    }
}

/**
 * Data class representing paginated list of items
 */
data class PaginatedList<T>(
    val items: List<T>,
    val currentPage: Int,
    val pageSize: Int,
    val hasMore: Boolean = true
) {
    companion object {
        fun <T> empty() = PaginatedList<T>(emptyList(), 0, 20)
    }
}

/**
 * Sealed class representing upload progress states
 */
sealed class UploadProgress {
    object Preparing : UploadProgress()
    data class Progress(val percent: Int) : UploadProgress()
    object Complete : UploadProgress()
    data class Error(val message: String) : UploadProgress()
}

/**
 * Sealed class representing network states
 */
sealed class NetworkState {
    object Connected : NetworkState()
    object Disconnected : NetworkState()
}