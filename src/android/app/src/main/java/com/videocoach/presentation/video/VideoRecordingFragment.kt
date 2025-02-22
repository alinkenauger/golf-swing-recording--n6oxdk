package com.videocoach.presentation.video

import android.Manifest
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.view.accessibility.AccessibilityEvent
import androidx.camera.core.CameraSelector
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.video.Quality
import androidx.camera.video.QualitySelector
import androidx.camera.video.Recorder
import androidx.camera.video.VideoCapture
import androidx.core.content.ContextCompat
import androidx.core.view.isVisible
import androidx.fragment.app.viewModels
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.videocoach.R
import com.videocoach.databinding.FragmentVideoRecordingBinding
import com.videocoach.domain.models.VideoType
import com.videocoach.presentation.base.BaseFragment
import com.videocoach.utils.Constants.VIDEO
import com.videocoach.utils.PermissionUtils
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import javax.inject.Inject

private const val TAG = "VideoRecordingFragment"
private const val ANIMATION_DURATION = 300L

/**
 * Fragment responsible for handling video recording functionality with comprehensive
 * error handling, accessibility support, and state management.
 */
@AndroidEntryPoint
class VideoRecordingFragment : BaseFragment<FragmentVideoRecordingBinding>(R.layout.fragment_video_recording) {

    private val viewModel: VideoRecordingViewModel by viewModels()
    private var videoCapture: VideoCapture<Recorder>? = null
    private var cameraProvider: ProcessCameraProvider? = null
    private lateinit var cameraExecutor: ExecutorService
    private var qualitySelector: QualitySelector? = null

    override fun getViewBinding(
        inflater: LayoutInflater,
        container: ViewGroup?
    ): FragmentVideoRecordingBinding {
        return FragmentVideoRecordingBinding.inflate(inflater, container, false)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        cameraExecutor = Executors.newSingleThreadExecutor()
    }

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        return super.onCreateView(inflater, container, savedInstanceState).apply {
            setupAccessibility()
        }
    }

    override fun initializeView() {
        setupCameraPreview()
        setupRecordingControls()
        setupInputFields()
        setupStateObservers()
        checkPermissions()
    }

    private fun setupAccessibility() {
        with(binding) {
            recordButton.apply {
                contentDescription = getString(R.string.record_button_description)
                accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_POLITE
            }
            previewView.apply {
                importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_YES
                contentDescription = getString(R.string.camera_preview_description)
            }
            titleInput.apply {
                hint = getString(R.string.video_title_hint)
                importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_YES
            }
        }
    }

    private fun setupCameraPreview() {
        binding.previewView.apply {
            implementationMode = PreviewView.ImplementationMode.PERFORMANCE
            scaleType = PreviewView.ScaleType.FILL_CENTER
        }

        val cameraProviderFuture = ProcessCameraProvider.getInstance(requireContext())
        cameraProviderFuture.addListener({
            cameraProvider = cameraProviderFuture.get()
            setupCamera()
        }, ContextCompat.getMainExecutor(requireContext()))
    }

    private fun setupCamera() {
        try {
            cameraProvider?.let { provider ->
                // Unbind previous use cases
                provider.unbindAll()

                // Configure quality selector
                qualitySelector = QualitySelector.from(Quality.HD)

                // Configure recorder
                val recorder = Recorder.Builder()
                    .setQualitySelector(qualitySelector!!)
                    .build()

                videoCapture = VideoCapture.withOutput(recorder)

                // Configure preview
                val preview = Preview.Builder()
                    .build()
                    .also {
                        it.setSurfaceProvider(binding.previewView.surfaceProvider)
                    }

                // Select back camera
                val cameraSelector = CameraSelector.DEFAULT_BACK_CAMERA

                // Bind use cases
                provider.bindToLifecycle(
                    viewLifecycleOwner,
                    cameraSelector,
                    preview,
                    videoCapture
                )

                announceForAccessibility(getString(R.string.camera_ready))
            }
        } catch (e: Exception) {
            showError(getString(R.string.camera_setup_error))
        }
    }

    private fun setupRecordingControls() {
        binding.recordButton.apply {
            setOnClickListener {
                if (viewModel.isRecording.value) {
                    stopRecording()
                } else {
                    startRecording()
                }
            }
        }
    }

    private fun setupInputFields() {
        with(binding) {
            titleInput.addTextChangedListener { text ->
                viewModel.updateVideoTitle(text?.toString())
            }

            descriptionInput.addTextChangedListener { text ->
                viewModel.updateVideoDescription(text?.toString())
            }

            videoTypeSpinner.setOnItemSelectedListener { position ->
                val type = when(position) {
                    0 -> VideoType.PRACTICE
                    1 -> VideoType.TRAINING
                    else -> VideoType.PRACTICE
                }
                viewModel.updateVideoType(type)
            }
        }
    }

    private fun setupStateObservers() {
        viewLifecycleOwner.lifecycleScope.launch {
            viewLifecycleOwner.repeatOnLifecycle(Lifecycle.State.STARTED) {
                launch {
                    viewModel.isRecording.collectLatest { isRecording ->
                        updateRecordingUI(isRecording)
                    }
                }

                launch {
                    viewModel.recordingProgress.collectLatest { progress ->
                        updateProgressUI(progress)
                    }
                }
            }
        }
    }

    private fun updateRecordingUI(isRecording: Boolean) {
        with(binding) {
            recordButton.isSelected = isRecording
            recordButton.contentDescription = getString(
                if (isRecording) R.string.stop_recording 
                else R.string.start_recording
            )
            inputGroup.isVisible = !isRecording
            progressIndicator.isVisible = isRecording

            announceForAccessibility(
                getString(
                    if (isRecording) R.string.recording_started 
                    else R.string.recording_stopped
                )
            )
        }
    }

    private fun updateProgressUI(progress: Float) {
        binding.progressIndicator.progress = (progress * 100).toInt()
        if (progress >= 1f) {
            stopRecording()
        }
    }

    private fun startRecording() {
        if (!validateInput()) return

        viewModel.startRecording()
        binding.recordButton.animate()
            .scaleX(1.5f)
            .scaleY(1.5f)
            .setDuration(ANIMATION_DURATION)
            .start()
    }

    private fun stopRecording() {
        lifecycleScope.launch {
            try {
                val video = viewModel.stopRecording()
                // Handle successful recording
                showSuccess(getString(R.string.recording_success))
                binding.recordButton.animate()
                    .scaleX(1f)
                    .scaleY(1f)
                    .setDuration(ANIMATION_DURATION)
                    .start()
            } catch (e: Exception) {
                showError(getString(R.string.recording_error))
            }
        }
    }

    private fun validateInput(): Boolean {
        with(binding) {
            when {
                titleInput.text.isNullOrBlank() -> {
                    titleInput.error = getString(R.string.title_required)
                    titleInput.requestFocus()
                    return false
                }
                titleInput.text!!.length < 3 -> {
                    titleInput.error = getString(R.string.title_too_short)
                    titleInput.requestFocus()
                    return false
                }
                descriptionInput.text!!.length > VIDEO.MAX_DESCRIPTION_LENGTH -> {
                    descriptionInput.error = getString(R.string.description_too_long)
                    descriptionInput.requestFocus()
                    return false
                }
            }
        }
        return true
    }

    private fun checkPermissions() {
        if (!PermissionUtils.hasRequiredPermissions(requireContext())) {
            if (PermissionUtils.shouldShowRationale(requireActivity())) {
                showPermissionRationale()
            } else {
                PermissionUtils.requestPermissions(requireActivity())
            }
        }
    }

    private fun showPermissionRationale() {
        MaterialAlertDialogBuilder(requireContext())
            .setTitle(R.string.permission_required)
            .setMessage(R.string.camera_permission_rationale)
            .setPositiveButton(R.string.grant) { _, _ ->
                PermissionUtils.requestPermissions(requireActivity())
            }
            .setNegativeButton(R.string.cancel) { dialog, _ ->
                dialog.dismiss()
                requireActivity().finish()
            }
            .show()
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<String>,
        grantResults: IntArray
    ) {
        if (PermissionUtils.handlePermissionResult(requestCode, permissions, grantResults)) {
            setupCamera()
        } else {
            showError(getString(R.string.permission_denied))
            requireActivity().finish()
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        cameraProvider?.unbindAll()
        cameraExecutor.shutdown()
    }

    companion object {
        fun newInstance() = VideoRecordingFragment()
    }
}