package com.videocoach.presentation.video

import androidx.lifecycle.SavedStateHandle // v2.6.2
import com.videocoach.domain.models.Video
import com.videocoach.domain.models.VideoStatus
import com.videocoach.domain.models.VideoType
import com.videocoach.domain.models.VideoFormat
import com.videocoach.domain.usecases.video.RecordVideoUseCase
import com.videocoach.presentation.base.BaseViewModel
import com.videocoach.utils.Constants.VIDEO
import com.videocoach.utils.VideoUtils
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject

private const val KEY_VIDEO_TITLE = "video_title"
private const val KEY_VIDEO_DESCRIPTION = "video_description"
private const val KEY_VIDEO_TYPE = "video_type"
private const val KEY_VIDEO_FORMAT = "video_format"
private const val MIN_TITLE_LENGTH = 3
private const val MAX_TITLE_LENGTH = 100
private const val MAX_DESCRIPTION_LENGTH = 500

/**
 * ViewModel responsible for managing video recording state and operations.
 * Handles camera initialization, recording controls, and initial video processing
 * with comprehensive error handling and state management.
 *
 * @property recordVideoUseCase Use case for video recording operations
 * @property savedStateHandle Handle for saving and restoring state
 */
@HiltViewModel
class VideoRecordingViewModel @Inject constructor(
    private val recordVideoUseCase: RecordVideoUseCase,
    private val savedStateHandle: SavedStateHandle
) : BaseViewModel() {

    private val _videoTitle = MutableStateFlow<String?>(savedStateHandle[KEY_VIDEO_TITLE])
    val videoTitle: StateFlow<String?> = _videoTitle.asStateFlow()

    private val _videoDescription = MutableStateFlow<String?>(savedStateHandle[KEY_VIDEO_DESCRIPTION])
    val videoDescription: StateFlow<String?> = _videoDescription.asStateFlow()

    private val _videoType = MutableStateFlow(
        savedStateHandle.get<VideoType>(KEY_VIDEO_TYPE) ?: VideoType.PRACTICE
    )
    val videoType: StateFlow<VideoType> = _videoType.asStateFlow()

    private val _videoFormat = MutableStateFlow(
        savedStateHandle.get<VideoFormat>(KEY_VIDEO_FORMAT) ?: VideoFormat.HD
    )
    val videoFormat: StateFlow<VideoFormat> = _videoFormat.asStateFlow()

    // Expose recording state from use case
    val isRecording: StateFlow<Boolean> = recordVideoUseCase.isRecording
    val recordingProgress: StateFlow<Float> = recordVideoUseCase.recordingProgress

    init {
        // Register saved state providers
        savedStateHandle.setSavedStateProvider(KEY_VIDEO_TITLE) { _videoTitle.value }
        savedStateHandle.setSavedStateProvider(KEY_VIDEO_DESCRIPTION) { _videoDescription.value }
        savedStateHandle.setSavedStateProvider(KEY_VIDEO_TYPE) { _videoType.value }
        savedStateHandle.setSavedStateProvider(KEY_VIDEO_FORMAT) { _videoFormat.value }
    }

    /**
     * Updates video title with validation
     * @param title New video title
     */
    fun updateVideoTitle(title: String?) {
        if (title?.length in MIN_TITLE_LENGTH..MAX_TITLE_LENGTH) {
            _videoTitle.value = title
            savedStateHandle[KEY_VIDEO_TITLE] = title
        }
    }

    /**
     * Updates video description with validation
     * @param description New video description
     */
    fun updateVideoDescription(description: String?) {
        if (description == null || description.length <= MAX_DESCRIPTION_LENGTH) {
            _videoDescription.value = description
            savedStateHandle[KEY_VIDEO_DESCRIPTION] = description
        }
    }

    /**
     * Updates video type
     * @param type New video type
     */
    fun updateVideoType(type: VideoType) {
        _videoType.value = type
        savedStateHandle[KEY_VIDEO_TYPE] = type
    }

    /**
     * Updates video format with validation
     * @param format New video format
     */
    fun updateVideoFormat(format: VideoFormat) {
        _videoFormat.value = format
        savedStateHandle[KEY_VIDEO_FORMAT] = format
    }

    /**
     * Starts video recording with validation and error handling
     */
    fun startRecording() {
        if (!validateVideoParameters()) {
            return
        }

        launchWithLoading {
            recordVideoUseCase.startRecording(
                type = _videoType.value,
                title = _videoTitle.value,
                description = _videoDescription.value,
                quality = when (_videoFormat.value) {
                    VideoFormat.HD -> RecordVideoUseCase.Quality.HD
                    VideoFormat.FHD -> RecordVideoUseCase.Quality.FHD
                    else -> RecordVideoUseCase.Quality.SD
                }
            ).collect { video ->
                // Handle video recording updates
                when (video.status) {
                    VideoStatus.ERROR -> handleError(Exception("Recording failed: ${video.processingProgress}"))
                    else -> {} // Recording in progress
                }
            }
        }
    }

    /**
     * Stops recording and processes the video
     * @return Processed video data
     */
    suspend fun stopRecording(): Video {
        return try {
            recordVideoUseCase.stopRecording().also {
                // Clear temporary states
                _videoTitle.value = null
                _videoDescription.value = null
                savedStateHandle.remove<String>(KEY_VIDEO_TITLE)
                savedStateHandle.remove<String>(KEY_VIDEO_DESCRIPTION)
            }
        } catch (e: Exception) {
            handleError(e)
            throw e
        }
    }

    /**
     * Validates video recording parameters
     * @return true if parameters are valid
     */
    private fun validateVideoParameters(): Boolean {
        return when {
            _videoTitle.value.isNullOrBlank() || _videoTitle.value!!.length < MIN_TITLE_LENGTH -> {
                handleError(IllegalArgumentException("Video title must be at least $MIN_TITLE_LENGTH characters"))
                false
            }
            _videoTitle.value!!.length > MAX_TITLE_LENGTH -> {
                handleError(IllegalArgumentException("Video title cannot exceed $MAX_TITLE_LENGTH characters"))
                false
            }
            _videoDescription.value?.length ?: 0 > MAX_DESCRIPTION_LENGTH -> {
                handleError(IllegalArgumentException("Description cannot exceed $MAX_DESCRIPTION_LENGTH characters"))
                false
            }
            !VIDEO.SUPPORTED_FORMATS.contains(_videoFormat.value.toString().lowercase()) -> {
                handleError(IllegalArgumentException("Unsupported video format: ${_videoFormat.value}"))
                false
            }
            else -> true
        }
    }

    override fun onCleared() {
        super.onCleared()
        // Ensure recording is stopped and resources are cleaned up
        if (isRecording.value) {
            launchWithLoading {
                try {
                    stopRecording()
                } catch (e: Exception) {
                    handleError(e)
                }
            }
        }
    }
}