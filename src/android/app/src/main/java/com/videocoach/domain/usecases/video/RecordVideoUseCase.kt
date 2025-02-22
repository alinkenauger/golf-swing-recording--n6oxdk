package com.videocoach.domain.usecases.video

import android.content.Context
import android.net.Uri
import androidx.camera.core.*
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.video.*
import androidx.core.content.ContextCompat
import com.videocoach.data.repositories.VideoRepository
import com.videocoach.domain.models.Video
import com.videocoach.domain.models.VideoStatus
import com.videocoach.domain.models.VideoType
import com.videocoach.utils.VideoUtils
import com.videocoach.utils.Constants.VIDEO
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import java.io.File
import java.lang.ref.WeakReference
import java.util.*
import java.util.concurrent.Executor
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Use case that manages video recording functionality with comprehensive processing and resource management.
 * Handles camera initialization, recording control, format validation, and initial video processing.
 * Version: 1.0.0
 */
@Singleton
@OptIn(ExperimentalCamera2Interop::class)
class RecordVideoUseCase @Inject constructor(
    private val videoRepository: VideoRepository,
    context: Context,
    private val scope: CoroutineScope
) {
    private val _isRecording = MutableStateFlow(false)
    val isRecording: StateFlow<Boolean> = _isRecording.asStateFlow()

    private val _recordingProgress = MutableStateFlow(0f)
    val recordingProgress: StateFlow<Float> = _recordingProgress.asStateFlow()

    private var cameraProvider: ProcessCameraProvider? = null
    private var videoCapture: VideoCapture<Recorder>? = null
    private var activeRecording: Recording? = null
    private val contextRef = WeakReference(context)
    private val mainExecutor: Executor by lazy { ContextCompat.getMainExecutor(contextRef.get()!!) }

    init {
        initializeCameraProvider()
    }

    private fun initializeCameraProvider() {
        val context = contextRef.get() ?: return
        val cameraProviderFuture = ProcessCameraProvider.getInstance(context)
        
        cameraProviderFuture.addListener({
            try {
                cameraProvider = cameraProviderFuture.get()
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }, mainExecutor)
    }

    /**
     * Initiates video recording with enhanced quality control and monitoring.
     *
     * @param type Type of video being recorded
     * @param title Optional title for the video
     * @param description Optional description for the video
     * @param quality Recording quality settings
     * @return Flow emitting video recording status and progress
     */
    fun startRecording(
        type: VideoType,
        title: String? = null,
        description: String? = null,
        quality: Quality = Quality.HD
    ): Flow<Video> = flow {
        val context = contextRef.get() ?: throw IllegalStateException("Context not available")
        
        try {
            if (_isRecording.value) {
                throw IllegalStateException("Recording already in progress")
            }

            // Initialize camera with specified quality
            initializeCamera(quality)

            val outputFile = createOutputFile(context)
            val outputOptions = FileOutputOptions.Builder(outputFile).build()

            // Configure recording with quality settings
            val recording = videoCapture?.output
                ?.prepareRecording(context, outputOptions)
                ?.apply {
                    if (quality == Quality.HD) {
                        withAudioEnabled()
                    }
                }
                ?.start(mainExecutor) { event ->
                    when (event) {
                        is VideoRecordEvent.Start -> {
                            _isRecording.value = true
                            scope.launch {
                                monitorRecordingProgress(outputFile)
                            }
                        }
                        is VideoRecordEvent.Finalize -> {
                            if (event.hasError()) {
                                throw RuntimeException("Recording failed: ${event.error}")
                            }
                        }
                    }
                } ?: throw IllegalStateException("Failed to start recording")

            activeRecording = recording

            // Create initial video object
            val video = Video(
                id = UUID.randomUUID().toString(),
                title = title ?: "Recording_${System.currentTimeMillis()}",
                description = description ?: "",
                url = outputFile.toUri().toString(),
                thumbnailUrl = "",
                userId = "", // Will be set by repository
                duration = 0,
                fileSize = 0,
                status = VideoStatus.UPLOADING,
                type = type,
                processingProgress = 0f,
                createdAt = System.currentTimeMillis()
            )

            emit(video)

        } catch (e: Exception) {
            _isRecording.value = false
            throw e
        }
    }

    /**
     * Stops recording and processes the video with enhanced validation and processing.
     *
     * @return Processed video data with metadata
     */
    suspend fun stopRecording(): Video {
        try {
            activeRecording?.stop()
            _isRecording.value = false
            
            val context = contextRef.get() ?: throw IllegalStateException("Context not available")
            val outputFile = activeRecording?.outputOptions?.let { 
                (it as FileOutputOptions).file 
            } ?: throw IllegalStateException("Recording file not found")
            
            val videoUri = Uri.fromFile(outputFile)

            // Validate recorded file
            if (!VideoUtils.isVideoFormatSupported(context, videoUri)) {
                throw IllegalStateException("Recorded video format is not supported")
            }

            // Extract video metadata
            val duration = VideoUtils.getVideoDuration(context, videoUri)
            val (width, height) = VideoUtils.getVideoResolution(context, videoUri)
            
            // Generate thumbnail
            val thumbnail = VideoUtils.generateThumbnail(context, videoUri)
            val thumbnailFile = saveThumbnail(context, thumbnail, outputFile.nameWithoutExtension)

            // Create video object with metadata
            val video = Video(
                id = UUID.randomUUID().toString(),
                title = outputFile.nameWithoutExtension,
                description = "",
                url = videoUri.toString(),
                thumbnailUrl = thumbnailFile.toUri().toString(),
                userId = "", // Will be set by repository
                duration = duration,
                fileSize = outputFile.length(),
                status = VideoStatus.PROCESSING,
                type = VideoType.PRACTICE,
                processingProgress = 0f,
                createdAt = System.currentTimeMillis()
            )

            // Upload to repository
            return videoRepository.uploadVideo(videoUri, video)
                .first { it is Video }

        } finally {
            cleanup()
        }
    }

    /**
     * Enhanced camera initialization with quality and device capability checks.
     *
     * @param quality Desired recording quality
     */
    private suspend fun initializeCamera(quality: Quality) {
        val context = contextRef.get() ?: throw IllegalStateException("Context not available")
        val cameraProvider = cameraProvider ?: throw IllegalStateException("Camera provider not initialized")

        // Configure quality settings
        val qualitySelector = QualitySelector.from(
            when (quality) {
                Quality.HD -> Quality.HD
                Quality.FHD -> Quality.FHD
                else -> Quality.SD
            }
        )

        val recorder = Recorder.Builder()
            .setQualitySelector(qualitySelector)
            .build()

        videoCapture = VideoCapture.withOutput(recorder)

        // Select back camera
        val cameraSelector = CameraSelector.DEFAULT_BACK_CAMERA

        try {
            cameraProvider.unbindAll()
            cameraProvider.bindToLifecycle(
                context as androidx.lifecycle.LifecycleOwner,
                cameraSelector,
                videoCapture
            )
        } catch (e: Exception) {
            throw IllegalStateException("Failed to initialize camera: ${e.message}")
        }
    }

    private suspend fun monitorRecordingProgress(outputFile: File) {
        while (_isRecording.value) {
            val progress = (outputFile.length().toFloat() / (VIDEO.MAX_FILE_SIZE_MB * 1024 * 1024))
            _recordingProgress.value = progress
            if (progress >= 1f) {
                stopRecording()
                break
            }
            kotlinx.coroutines.delay(1000)
        }
    }

    private fun createOutputFile(context: Context): File {
        val mediaDir = context.externalMediaDirs.firstOrNull()?.let {
            File(it, "VideoCoach").apply { mkdirs() }
        } ?: context.filesDir
        
        return File(mediaDir, "REC_${System.currentTimeMillis()}.mp4")
    }

    private fun saveThumbnail(context: Context, bitmap: android.graphics.Bitmap?, baseName: String): File {
        val thumbnailFile = File(context.cacheDir, "${baseName}_thumb.jpg")
        bitmap?.compress(android.graphics.Bitmap.CompressFormat.JPEG, 90, thumbnailFile.outputStream())
        return thumbnailFile
    }

    private fun cleanup() {
        activeRecording = null
        _recordingProgress.value = 0f
        videoCapture = null
    }

    enum class Quality {
        SD, HD, FHD
    }
}