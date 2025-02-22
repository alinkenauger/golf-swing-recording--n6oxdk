package com.videocoach.presentation.video

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.view.accessibility.AccessibilityEvent
import androidx.fragment.app.viewModels
import androidx.lifecycle.lifecycleScope
import com.google.android.exoplayer2.ExoPlayer // v2.19.1
import com.google.android.exoplayer2.MediaItem
import com.google.android.exoplayer2.Player
import com.google.android.exoplayer2.ui.StyledPlayerView
import com.videocoach.R
import com.videocoach.databinding.FragmentVideoAnnotationBinding
import com.videocoach.presentation.base.BaseFragment
import com.videocoach.utils.Constants
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import android.view.GestureDetector
import android.view.MotionEvent
import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import com.videocoach.domain.models.VideoStatus
import com.videocoach.utils.NetworkUtils

private const val ARG_VIDEO_ID = "video_id"
private const val TAG = "VideoAnnotationFragment"

/**
 * Fragment implementing video annotation functionality with split-screen interface,
 * real-time drawing tools, and voice-over recording capabilities.
 */
@AndroidEntryPoint
class VideoAnnotationFragment : BaseFragment<FragmentVideoAnnotationBinding>(R.layout.fragment_video_annotation) {

    private val viewModel: VideoAnnotationViewModel by viewModels()
    private var player: ExoPlayer? = null
    private var videoId: String? = null
    private var isDrawingEnabled = false
    private var currentPlaybackPosition = 0L

    private val audioPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        if (isGranted) {
            viewModel.toggleVoiceOverRecording()
        } else {
            showError(getString(R.string.audio_permission_denied))
        }
    }

    private val gestureDetector by lazy {
        GestureDetector(requireContext(), object : GestureDetector.SimpleOnGestureListener() {
            override fun onSingleTapConfirmed(e: MotionEvent): Boolean {
                togglePlayback()
                return true
            }

            override fun onDoubleTap(e: MotionEvent): Boolean {
                if (isDrawingEnabled) {
                    binding.drawingView.clearLastDrawing()
                }
                return true
            }
        })
    }

    override fun getViewBinding(
        inflater: LayoutInflater,
        container: ViewGroup?
    ): FragmentVideoAnnotationBinding {
        return FragmentVideoAnnotationBinding.inflate(inflater, container, false)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        videoId = arguments?.getString(ARG_VIDEO_ID)
        requireNotNull(videoId) { "Video ID must be provided" }
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
        setupVideoPlayer()
        setupAnnotationTools()
        setupVoiceOverControls()
        observeViewModel()

        // Load video data
        viewModel.loadVideo(videoId!!)
    }

    private fun setupVideoPlayer() {
        player = ExoPlayer.Builder(requireContext())
            .setHandleAudioBecomingNoisy(true)
            .build()
            .apply {
                playWhenReady = false
                repeatMode = Player.REPEAT_MODE_OFF
                
                addListener(object : Player.Listener {
                    override fun onPlaybackStateChanged(state: Int) {
                        when (state) {
                            Player.STATE_READY -> hideLoading()
                            Player.STATE_BUFFERING -> showLoading()
                            Player.STATE_ENDED -> {
                                binding.playPauseButton.setImageResource(R.drawable.ic_replay)
                                announceForAccessibility(getString(R.string.video_playback_ended))
                            }
                        }
                    }

                    override fun onPositionDiscontinuity(
                        oldPosition: Player.PositionInfo,
                        newPosition: Player.PositionInfo,
                        reason: Int
                    ) {
                        currentPlaybackPosition = newPosition.positionMs
                        updateAnnotationTimeline()
                    }
                })
            }

        binding.playerView.apply {
            player = this@VideoAnnotationFragment.player
            setControllerVisibilityListener { visibility ->
                binding.annotationToolbar.visibility = visibility
            }
            controllerShowTimeoutMs = Constants.UI.ANIMATION_DURATION_MS.toInt()
            useController = true
            resizeMode = StyledPlayerView.RESIZE_MODE_FIT
        }
    }

    private fun setupAnnotationTools() {
        binding.apply {
            drawingView.apply {
                setStrokeWidth(resources.getDimension(R.dimen.annotation_stroke_width))
                setMinimumTouchSize(Constants.UI.MIN_SWIPE_DISTANCE)
                setAccessibilityDelegate(object : View.AccessibilityDelegate() {
                    override fun onInitializeAccessibilityEvent(host: View, event: AccessibilityEvent) {
                        super.onInitializeAccessibilityEvent(host, event)
                        event.contentDescription = getString(R.string.drawing_canvas_description)
                    }
                })
            }

            colorPicker.setOnColorSelectedListener { color ->
                drawingView.setColor(color)
                announceForAccessibility(getString(R.string.color_selected))
            }

            toolSelector.setOnToolSelectedListener { tool ->
                viewModel.selectTool(tool)
                updateToolState(tool)
            }

            undoButton.setOnClickListener {
                drawingView.undo()
                announceForAccessibility(getString(R.string.annotation_undone))
            }

            clearButton.setOnClickListener {
                drawingView.clear()
                announceForAccessibility(getString(R.string.annotations_cleared))
            }
        }
    }

    private fun setupVoiceOverControls() {
        binding.voiceOverButton.apply {
            setOnClickListener {
                if (ContextCompat.checkSelfPermission(
                    requireContext(),
                    Manifest.permission.RECORD_AUDIO
                ) == PackageManager.PERMISSION_GRANTED) {
                    viewModel.toggleVoiceOverRecording()
                } else {
                    audioPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
                }
            }
            
            contentDescription = getString(R.string.voice_over_button_description)
        }
    }

    private fun observeViewModel() {
        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.video.collectLatest { video ->
                video?.let {
                    if (video.status == VideoStatus.READY) {
                        loadVideo(video.url)
                    } else {
                        showError(getString(R.string.video_not_ready))
                    }
                }
            }
        }

        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.selectedTool.collectLatest { tool ->
                updateToolState(tool)
            }
        }

        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.isRecordingVoiceOver.collectLatest { isRecording ->
                updateVoiceOverState(isRecording)
            }
        }

        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.annotationError.collectLatest { error ->
                error?.let { showError(it.message) }
            }
        }
    }

    private fun loadVideo(url: String) {
        if (!NetworkUtils.isHighBandwidthConnection(requireContext())) {
            showError(getString(R.string.low_bandwidth_warning))
            return
        }

        player?.apply {
            setMediaItem(MediaItem.fromUri(url))
            prepare()
        }
    }

    private fun togglePlayback() {
        player?.let {
            if (it.isPlaying) {
                it.pause()
                binding.playPauseButton.setImageResource(R.drawable.ic_play)
                announceForAccessibility(getString(R.string.video_paused))
            } else {
                it.play()
                binding.playPauseButton.setImageResource(R.drawable.ic_pause)
                announceForAccessibility(getString(R.string.video_playing))
            }
        }
    }

    private fun updateToolState(tool: VideoAnnotationViewModel.AnnotationTool) {
        binding.apply {
            isDrawingEnabled = tool == VideoAnnotationViewModel.AnnotationTool.DRAW
            drawingView.isEnabled = isDrawingEnabled
            colorPicker.visibility = if (isDrawingEnabled) View.VISIBLE else View.GONE
            
            val toolDescription = when (tool) {
                VideoAnnotationViewModel.AnnotationTool.DRAW -> R.string.drawing_tool_selected
                VideoAnnotationViewModel.AnnotationTool.VOICE_OVER -> R.string.voice_over_tool_selected
                else -> R.string.no_tool_selected
            }
            announceForAccessibility(getString(toolDescription))
        }
    }

    private fun updateVoiceOverState(isRecording: Boolean) {
        binding.voiceOverButton.apply {
            isSelected = isRecording
            setImageResource(
                if (isRecording) R.drawable.ic_stop_recording
                else R.drawable.ic_start_recording
            )
            announceForAccessibility(
                getString(
                    if (isRecording) R.string.voice_over_recording
                    else R.string.voice_over_stopped
                )
            )
        }
    }

    private fun updateAnnotationTimeline() {
        // Update annotation markers based on current playback position
        binding.timelineView.updateMarkers(currentPlaybackPosition)
    }

    override fun onPause() {
        super.onPause()
        player?.pause()
    }

    override fun onDestroyView() {
        super.onDestroyView()
        player?.release()
        player = null
    }

    companion object {
        fun newInstance(videoId: String) = VideoAnnotationFragment().apply {
            arguments = Bundle().apply {
                putString(ARG_VIDEO_ID, videoId)
            }
        }
    }
}