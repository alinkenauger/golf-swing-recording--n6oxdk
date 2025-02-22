package com.videocoach.presentation.video

import android.media.MediaPlayer // latest
import androidx.lifecycle.viewModelScope
import com.videocoach.presentation.base.BaseViewModel
import com.videocoach.data.repositories.VideoRepository
import com.videocoach.utils.VideoUtils
import com.videocoach.domain.models.Video
import javax.inject.Inject // v1
import kotlinx.coroutines.flow.StateFlow // v1.7.3
import kotlinx.coroutines.flow.MutableStateFlow // v1.7.3
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.isActive
import kotlinx.coroutines.cancelAndJoin

/**
 * ViewModel responsible for managing video playback state and controls.
 * Implements comprehensive video playback management with enhanced error handling,
 * format validation, and efficient resource management.
 */
class VideoPlayerViewModel @Inject constructor(
    private val videoRepository: VideoRepository
) : BaseViewModel() {

    // Video state
    private val _video = MutableStateFlow<Video?>(null)
    val video: StateFlow<Video?> = _video.asStateFlow()

    // Playback states
    private val _isPlaying = MutableStateFlow(false)
    val isPlaying: StateFlow<Boolean> = _isPlaying.asStateFlow()

    private val _currentPosition = MutableStateFlow(0L)
    val currentPosition: StateFlow<Long> = _currentPosition.asStateFlow()

    private val _duration = MutableStateFlow(0L)
    val duration: StateFlow<Long> = _duration.asStateFlow()

    private val _isBuffering = MutableStateFlow(false)
    val isBuffering: StateFlow<Boolean> = _isBuffering.asStateFlow()

    private val _error = MutableStateFlow<PlaybackError?>(null)
    val error: StateFlow<PlaybackError?> = _error.asStateFlow()

    // MediaPlayer instance
    private var mediaPlayer: MediaPlayer? = null
    private var positionTrackingJob: Job? = null

    /**
     * Loads and validates a video by its ID and prepares it for playback
     * @param videoId Unique identifier of the video to load
     */
    fun loadVideo(videoId: String) {
        launchWithLoading {
            try {
                // Reset states
                resetPlaybackStates()
                
                // Fetch video from repository
                videoRepository.getVideo(videoId)
                    .collect { result ->
                        result.onSuccess { video ->
                            _video.value = video
                            initializeMediaPlayer(video.url)
                        }.onFailure { error ->
                            handleError(error)
                        }
                    }
            } catch (e: Exception) {
                handleError(e)
            }
        }
    }

    /**
     * Starts or resumes video playback with error handling
     */
    fun play() {
        viewModelScope.launch {
            try {
                mediaPlayer?.let { player ->
                    if (!player.isPlaying) {
                        _isBuffering.value = true
                        player.start()
                        _isPlaying.value = true
                        startPositionTracking()
                    }
                } ?: throw IllegalStateException("MediaPlayer not initialized")
            } catch (e: Exception) {
                handlePlaybackError(e)
            } finally {
                _isBuffering.value = false
            }
        }
    }

    /**
     * Pauses video playback safely
     */
    fun pause() {
        viewModelScope.launch {
            try {
                mediaPlayer?.let { player ->
                    if (player.isPlaying) {
                        player.pause()
                        _isPlaying.value = false
                        stopPositionTracking()
                    }
                }
            } catch (e: Exception) {
                handlePlaybackError(e)
            }
        }
    }

    /**
     * Seeks to a specific position with validation
     * @param position Target position in milliseconds
     */
    fun seekTo(position: Long) {
        viewModelScope.launch {
            try {
                mediaPlayer?.let { player ->
                    val validPosition = position.coerceIn(0, _duration.value)
                    player.seekTo(validPosition.toInt())
                    _currentPosition.value = validPosition
                }
            } catch (e: Exception) {
                handlePlaybackError(e)
            }
        }
    }

    /**
     * Initializes and prepares MediaPlayer with error handling
     */
    private fun initializeMediaPlayer(videoUrl: String) {
        viewModelScope.launch {
            try {
                releaseMediaPlayer()
                
                mediaPlayer = MediaPlayer().apply {
                    setDataSource(videoUrl)
                    setOnPreparedListener { mp ->
                        _duration.value = mp.duration.toLong()
                        _isBuffering.value = false
                    }
                    setOnErrorListener { _, what, extra ->
                        handlePlaybackError(
                            PlaybackException("MediaPlayer error: $what, $extra")
                        )
                        true
                    }
                    setOnBufferingUpdateListener { _, percent ->
                        _isBuffering.value = percent < 100
                    }
                    setOnCompletionListener {
                        _isPlaying.value = false
                        stopPositionTracking()
                    }
                    prepareAsync()
                    _isBuffering.value = true
                }
            } catch (e: Exception) {
                handlePlaybackError(e)
            }
        }
    }

    /**
     * Tracks playback position with coroutine
     */
    private fun startPositionTracking() {
        positionTrackingJob?.cancel()
        positionTrackingJob = viewModelScope.launch {
            while (isActive) {
                mediaPlayer?.let { player ->
                    if (player.isPlaying) {
                        _currentPosition.value = player.currentPosition.toLong()
                    }
                }
                delay(POSITION_UPDATE_INTERVAL)
            }
        }
    }

    /**
     * Stops position tracking coroutine
     */
    private suspend fun stopPositionTracking() {
        positionTrackingJob?.cancelAndJoin()
        positionTrackingJob = null
    }

    /**
     * Resets all playback states to initial values
     */
    private fun resetPlaybackStates() {
        _isPlaying.value = false
        _currentPosition.value = 0
        _duration.value = 0
        _isBuffering.value = false
        _error.value = null
    }

    /**
     * Handles playback-specific errors
     */
    private fun handlePlaybackError(error: Throwable) {
        _error.value = when (error) {
            is IllegalStateException -> PlaybackError.INVALID_STATE
            is SecurityException -> PlaybackError.SECURITY_ERROR
            else -> PlaybackError.PLAYBACK_ERROR
        }
        handleError(error)
    }

    /**
     * Releases MediaPlayer resources safely
     */
    private fun releaseMediaPlayer() {
        mediaPlayer?.let { player ->
            try {
                if (player.isPlaying) {
                    player.stop()
                }
                player.release()
            } catch (e: Exception) {
                e.printStackTrace()
            }
            mediaPlayer = null
        }
    }

    /**
     * Cleanup when ViewModel is cleared
     */
    override fun onCleared() {
        viewModelScope.launch {
            stopPositionTracking()
            releaseMediaPlayer()
            resetPlaybackStates()
        }
        super.onCleared()
    }

    companion object {
        private const val POSITION_UPDATE_INTERVAL = 250L // 250ms
    }
}

/**
 * Enum class representing possible playback errors
 */
enum class PlaybackError {
    INVALID_STATE,
    SECURITY_ERROR,
    PLAYBACK_ERROR
}

/**
 * Custom exception for playback errors
 */
private class PlaybackException(message: String) : Exception(message)