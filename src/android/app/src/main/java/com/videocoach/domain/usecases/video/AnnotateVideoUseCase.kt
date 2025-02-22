package com.videocoach.domain.usecases.video

import com.videocoach.data.repositories.VideoRepository
import com.videocoach.domain.models.Video
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Use case implementing comprehensive video annotation functionality.
 * Handles real-time annotation operations with state management and validation.
 * Version: 1.0.0
 */
@Singleton
class AnnotateVideoUseCase @Inject constructor(
    private val videoRepository: VideoRepository
) {
    private val scope = CoroutineScope(Dispatchers.Default + SupervisorJob())
    
    private val _isAnnotating = MutableStateFlow(false)
    val isAnnotating: StateFlow<Boolean> = _isAnnotating.asStateFlow()
    
    private val _annotationState = MutableStateFlow<AnnotationState>(AnnotationState.Idle)
    val annotationState: StateFlow<AnnotationState> = _annotationState.asStateFlow()
    
    private var currentAnnotationJob: Job? = null

    /**
     * Executes the video annotation operation with comprehensive validation and error handling.
     * 
     * @param videoId Unique identifier of the video to annotate
     * @param annotation Annotation data to add to the video
     * @return Flow emitting the result of the annotation operation
     */
    fun execute(videoId: String, annotation: Annotation): Flow<Result<Video>> = flow {
        try {
            // Cancel any ongoing annotation operation
            currentAnnotationJob?.cancel()
            currentAnnotationJob = Job()
            
            _isAnnotating.value = true
            _annotationState.value = AnnotationState.Validating
            
            // Validate annotation parameters
            if (!validateAnnotation(annotation)) {
                throw IllegalArgumentException("Invalid annotation parameters")
            }
            
            _annotationState.value = AnnotationState.Processing
            
            // Execute annotation through repository
            val result = videoRepository.addAnnotation(videoId, annotation)
            
            // Update state based on result
            if (result.isSuccess) {
                _annotationState.value = AnnotationState.Success
                emit(result)
            } else {
                _annotationState.value = AnnotationState.Error(result.exceptionOrNull()?.message ?: "Unknown error")
                emit(Result.failure(result.exceptionOrNull() ?: Exception("Unknown error")))
            }
            
        } catch (e: CancellationException) {
            _annotationState.value = AnnotationState.Cancelled
            throw e
        } catch (e: Exception) {
            _annotationState.value = AnnotationState.Error(e.message ?: "Unknown error")
            emit(Result.failure(e))
        } finally {
            cleanupAnnotationResources()
            _isAnnotating.value = false
        }
    }.flowOn(Dispatchers.IO)
        .catch { e ->
            _annotationState.value = AnnotationState.Error(e.message ?: "Unknown error")
            emit(Result.failure(e))
        }

    /**
     * Validates annotation parameters for correctness and completeness.
     * 
     * @param annotation Annotation to validate
     * @return true if annotation is valid, false otherwise
     */
    private fun validateAnnotation(annotation: Annotation): Boolean {
        return try {
            // Timestamp validation
            require(annotation.timestamp >= 0) { "Timestamp must be non-negative" }
            
            // Drawing coordinates validation
            when (annotation) {
                is DrawingAnnotation -> {
                    require(annotation.points.isNotEmpty()) { "Drawing must have at least one point" }
                    require(annotation.color.isNotEmpty()) { "Color must be specified" }
                    require(annotation.strokeWidth > 0) { "Stroke width must be positive" }
                }
                is TextAnnotation -> {
                    require(annotation.text.isNotEmpty()) { "Text cannot be empty" }
                    require(annotation.position.x >= 0 && annotation.position.y >= 0) {
                        "Position coordinates must be non-negative"
                    }
                }
                is VoiceOverAnnotation -> {
                    require(annotation.duration > 0) { "Voice-over duration must be positive" }
                    require(annotation.audioUrl.isNotEmpty()) { "Audio URL must be specified" }
                }
            }
            true
        } catch (e: Exception) {
            _annotationState.value = AnnotationState.Error(e.message ?: "Validation failed")
            false
        }
    }

    /**
     * Performs cleanup of annotation-related resources.
     */
    private fun cleanupAnnotationResources() {
        currentAnnotationJob?.cancel()
        currentAnnotationJob = null
    }

    /**
     * Sealed class representing possible states of the annotation process.
     */
    sealed class AnnotationState {
        object Idle : AnnotationState()
        object Validating : AnnotationState()
        object Processing : AnnotationState()
        object Success : AnnotationState()
        object Cancelled : AnnotationState()
        data class Error(val message: String) : AnnotationState()
    }
}