package com.videocoach.presentation.video

import android.media.MediaRecorder // v33
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import com.videocoach.presentation.base.BaseViewModel
import com.videocoach.domain.usecases.video.AnnotateVideoUseCase
import com.videocoach.domain.models.Video
import com.videocoach.domain.models.VideoStatus
import com.videocoach.utils.Constants
import java.io.File
import java.util.UUID

/**
 * ViewModel managing video annotation state and user interactions for the video annotation workspace.
 * Implements real-time annotation updates, voice-over recording, and comprehensive state management.
 */
@HiltViewModel
class VideoAnnotationViewModel @Inject constructor(
    private val annotateVideoUseCase: AnnotateVideoUseCase
) : BaseViewModel() {

    private val _video = MutableStateFlow<Video?>(null)
    val video: StateFlow<Video?> = _video.asStateFlow()

    private val _selectedTool = MutableStateFlow<AnnotationTool>(AnnotationTool.NONE)
    val selectedTool: StateFlow<AnnotationTool> = _selectedTool.asStateFlow()

    private val _isRecordingVoiceOver = MutableStateFlow(false)
    val isRecordingVoiceOver: StateFlow<Boolean> = _isRecordingVoiceOver.asStateFlow()

    private val _annotationError = MutableStateFlow<AnnotationError?>(null)
    val annotationError: StateFlow<AnnotationError?> = _annotationError.asStateFlow()

    private val _isAnnotating = MutableStateFlow(false)
    val isAnnotating: StateFlow<Boolean> = _isAnnotating.asStateFlow()

    private var mediaRecorder: MediaRecorder? = null
    private var currentVoiceOverFile: File? = null
    private var currentAnnotationId: String? = null

    /**
     * Loads and validates video data for annotation
     */
    fun loadVideo(videoId: String) {
        launchWithLoading {
            require(videoId.isNotEmpty()) { "Video ID cannot be empty" }

            val result = annotateVideoUseCase.execute(videoId, null).collect { result ->
                result.onSuccess { video ->
                    if (video.status != VideoStatus.READY) {
                        handleError(IllegalStateException("Video is not ready for annotation"))
                        return@collect
                    }
                    _video.value = video
                }.onFailure { error ->
                    handleError(error)
                }
            }
        }
    }

    /**
     * Adds and validates a new annotation to the video
     */
    fun addAnnotation(annotation: Annotation) {
        viewModelScope.launch {
            try {
                _isAnnotating.value = true
                currentAnnotationId = UUID.randomUUID().toString()

                val video = _video.value ?: throw IllegalStateException("No video loaded")
                
                // Validate annotation
                if (!annotateVideoUseCase.validateAnnotation(annotation)) {
                    throw IllegalArgumentException("Invalid annotation parameters")
                }

                // Add annotation with ID
                val annotationWithId = annotation.copy(id = currentAnnotationId!!)
                val updatedVideo = video.addAnnotation(annotationWithId)
                
                // Execute use case
                annotateVideoUseCase.execute(video.id, annotationWithId).collect { result ->
                    result.onSuccess { 
                        _video.value = updatedVideo
                    }.onFailure { error ->
                        handleError(error)
                        _annotationError.value = AnnotationError(error.message ?: "Failed to add annotation")
                    }
                }
            } catch (e: Exception) {
                handleError(e)
                _annotationError.value = AnnotationError(e.message ?: "Failed to add annotation")
            } finally {
                _isAnnotating.value = false
                currentAnnotationId = null
            }
        }
    }

    /**
     * Safely removes an annotation from the video
     */
    fun removeAnnotation(annotationId: String) {
        viewModelScope.launch {
            try {
                val video = _video.value ?: throw IllegalStateException("No video loaded")
                
                // Remove annotation
                val updatedVideo = video.removeAnnotation(annotationId)
                _video.value = updatedVideo
                
            } catch (e: Exception) {
                handleError(e)
                _annotationError.value = AnnotationError(e.message ?: "Failed to remove annotation")
            }
        }
    }

    /**
     * Selects and configures an annotation tool
     */
    fun selectTool(tool: AnnotationTool) {
        viewModelScope.launch {
            try {
                // Clean up previous tool if needed
                when (_selectedTool.value) {
                    AnnotationTool.VOICE_OVER -> stopVoiceOverRecording()
                    else -> {} // No cleanup needed
                }
                
                _selectedTool.value = tool
                
            } catch (e: Exception) {
                handleError(e)
            }
        }
    }

    /**
     * Manages voice-over recording state and resources
     */
    fun toggleVoiceOverRecording() {
        viewModelScope.launch {
            try {
                if (_isRecordingVoiceOver.value) {
                    stopVoiceOverRecording()
                } else {
                    startVoiceOverRecording()
                }
            } catch (e: Exception) {
                handleError(e)
                _annotationError.value = AnnotationError(e.message ?: "Voice-over recording failed")
            }
        }
    }

    private fun startVoiceOverRecording() {
        try {
            val video = _video.value ?: throw IllegalStateException("No video loaded")
            
            // Create output file
            currentVoiceOverFile = File.createTempFile(
                "voice_over_${video.id}_",
                ".aac",
                File(System.getProperty("java.io.tmpdir"))
            )

            // Configure MediaRecorder
            mediaRecorder = MediaRecorder().apply {
                setAudioSource(MediaRecorder.AudioSource.MIC)
                setOutputFormat(MediaRecorder.OutputFormat.AAC_ADTS)
                setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
                setOutputFile(currentVoiceOverFile?.absolutePath)
                setMaxDuration(Constants.VIDEO.MAX_DURATION_SECONDS * 1000)
                prepare()
                start()
            }

            _isRecordingVoiceOver.value = true
            
        } catch (e: Exception) {
            cleanupVoiceOverResources()
            throw e
        }
    }

    private fun stopVoiceOverRecording() {
        try {
            mediaRecorder?.apply {
                stop()
                release()
            }
            mediaRecorder = null
            
            // Process recorded file
            currentVoiceOverFile?.let { file ->
                if (file.exists() && file.length() > 0) {
                    // TODO: Process voice-over file
                    // For now, just cleanup
                    file.delete()
                }
            }
            currentVoiceOverFile = null
            
        } finally {
            _isRecordingVoiceOver.value = false
        }
    }

    private fun cleanupVoiceOverResources() {
        mediaRecorder?.apply {
            try {
                stop()
            } catch (e: Exception) {
                // Ignore stop errors during cleanup
            }
            release()
        }
        mediaRecorder = null
        
        currentVoiceOverFile?.delete()
        currentVoiceOverFile = null
        
        _isRecordingVoiceOver.value = false
    }

    override fun onCleared() {
        super.onCleared()
        cleanupVoiceOverResources()
        currentAnnotationId = null
        _video.value = null
        _selectedTool.value = AnnotationTool.NONE
        _annotationError.value = null
        _isAnnotating.value = false
    }

    enum class AnnotationTool {
        NONE,
        DRAW,
        TEXT,
        VOICE_OVER
    }

    data class AnnotationError(val message: String)
}