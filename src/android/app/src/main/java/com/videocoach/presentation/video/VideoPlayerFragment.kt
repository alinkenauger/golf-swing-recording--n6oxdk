package com.videocoach.presentation.video

import android.os.Bundle
import android.view.*
import android.view.GestureDetector.SimpleOnGestureListener
import androidx.core.view.GestureDetectorCompat
import androidx.fragment.app.viewModels
import androidx.lifecycle.lifecycleScope
import com.google.android.exoplayer2.*
import com.google.android.exoplayer2.ui.PlayerView
import com.google.android.exoplayer2.ui.AspectRatioFrameLayout
import com.videocoach.R
import com.videocoach.databinding.FragmentVideoPlayerBinding
import com.videocoach.presentation.base.BaseFragment
import com.videocoach.domain.models.Video
import com.videocoach.utils.Constants.UI
import com.videocoach.utils.VideoUtils
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Professional video player fragment implementing advanced coaching analysis features.
 * Supports split-screen comparison, frame-by-frame navigation, and gesture-based controls.
 */
@AndroidEntryPoint
class VideoPlayerFragment : BaseFragment<FragmentVideoPlayerBinding>(R.layout.fragment_video_player) {

    private val viewModel: VideoPlayerViewModel by viewModels()
    
    private var mainPlayer: ExoPlayer? = null
    private var comparisonPlayer: ExoPlayer? = null
    private lateinit var gestureDetector: GestureDetectorCompat
    
    private var videoId: String? = null
    private var currentMode = AnalysisMode.SINGLE
    private var isFrameByFrameMode = false
    private var currentZoom = 1.0f
    private var lastTouchX = 0f
    private var lastTouchY = 0f

    override fun getViewBinding(
        inflater: LayoutInflater,
        container: ViewGroup?
    ): FragmentVideoPlayerBinding {
        return FragmentVideoPlayerBinding.inflate(inflater, container, false)
    }

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        super.onCreateView(inflater, container, savedInstanceState)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        setupPlayers()
        setupGestureDetection()
        setupAnalysisTools()
        observeViewModel()
        
        // Restore state if available
        savedInstanceState?.let { bundle ->
            videoId = bundle.getString(KEY_VIDEO_ID)
            currentMode = AnalysisMode.valueOf(
                bundle.getString(KEY_ANALYSIS_MODE, AnalysisMode.SINGLE.name)
            )
        }
        
        videoId?.let { id -> viewModel.loadVideo(id) }
    }

    private fun setupPlayers() {
        context?.let { ctx ->
            mainPlayer = ExoPlayer.Builder(ctx)
                .setRenderersFactory(DefaultRenderersFactory(ctx))
                .build().apply {
                    playWhenReady = false
                    repeatMode = Player.REPEAT_MODE_OFF
                }

            binding.playerView.apply {
                player = mainPlayer
                useController = true
                resizeMode = AspectRatioFrameLayout.RESIZE_MODE_FIT
                setOnTouchListener { _, event -> handleTouchEvent(event) }
            }

            // Setup comparison player if needed
            if (currentMode == AnalysisMode.SPLIT_SCREEN) {
                setupComparisonPlayer()
            }
        }
    }

    private fun setupComparisonPlayer() {
        context?.let { ctx ->
            comparisonPlayer = ExoPlayer.Builder(ctx)
                .setRenderersFactory(DefaultRenderersFactory(ctx))
                .build().apply {
                    playWhenReady = false
                    repeatMode = Player.REPEAT_MODE_OFF
                }

            binding.comparisonPlayerView.apply {
                player = comparisonPlayer
                useController = false
                resizeMode = AspectRatioFrameLayout.RESIZE_MODE_FIT
                visibility = View.VISIBLE
            }
        }
    }

    private fun setupGestureDetection() {
        gestureDetector = GestureDetectorCompat(requireContext(), 
            object : SimpleOnGestureListener() {
                override fun onDoubleTap(e: MotionEvent): Boolean {
                    togglePlayPause()
                    return true
                }

                override fun onScroll(
                    e1: MotionEvent?,
                    e2: MotionEvent,
                    distanceX: Float,
                    distanceY: Float
                ): Boolean {
                    if (isFrameByFrameMode) {
                        handleFrameNavigation(distanceX)
                    } else {
                        handleVideoScrubbing(distanceX)
                    }
                    return true
                }

                override fun onScale(detector: ScaleGestureDetector): Boolean {
                    if (currentMode == AnalysisMode.SINGLE) {
                        handleZoom(detector.scaleFactor)
                    }
                    return true
                }
            })
    }

    private fun setupAnalysisTools() {
        binding.apply {
            frameByFrameButton.setOnClickListener { 
                toggleFrameByFrameMode() 
            }
            
            splitScreenButton.setOnClickListener { 
                toggleAnalysisMode() 
            }
            
            drawingToolsButton.setOnClickListener { 
                showDrawingTools() 
            }
            
            annotationButton.setOnClickListener { 
                startAnnotation() 
            }
        }
    }

    private fun observeViewModel() {
        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.video.collectLatest { video ->
                video?.let { updateVideoPlayer(it) }
            }
        }

        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.isPlaying.collectLatest { isPlaying ->
                updatePlaybackState(isPlaying)
            }
        }

        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.currentPosition.collectLatest { position ->
                updatePlaybackPosition(position)
            }
        }
    }

    private fun updateVideoPlayer(video: Video) {
        context?.let { ctx ->
            val mediaItem = MediaItem.fromUri(video.url)
            mainPlayer?.apply {
                setMediaItem(mediaItem)
                prepare()
            }
            
            // Update UI elements
            binding.apply {
                videoTitleText.text = video.title
                durationText.text = VideoUtils.formatDuration(video.duration)
            }
        }
    }

    private fun handleTouchEvent(event: MotionEvent): Boolean {
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                lastTouchX = event.x
                lastTouchY = event.y
            }
            MotionEvent.ACTION_MOVE -> {
                if (currentMode == AnalysisMode.SPLIT_SCREEN) {
                    val deltaX = event.x - lastTouchX
                    updateSplitScreenDivider(deltaX)
                }
            }
        }
        return gestureDetector.onTouchEvent(event)
    }

    private fun handleFrameNavigation(distanceX: Float) {
        mainPlayer?.let { player ->
            val frameTime = 1000L / UI.FRAME_RATE
            val frames = (distanceX / UI.SCROLL_THRESHOLD_PX).toInt()
            val newPosition = player.currentPosition + (frames * frameTime)
            player.seekTo(newPosition.coerceIn(0, player.duration))
        }
    }

    private fun handleVideoScrubbing(distanceX: Float) {
        mainPlayer?.let { player ->
            val scrubAmount = (distanceX * UI.SCROLL_THRESHOLD_PX).toLong()
            val newPosition = player.currentPosition - scrubAmount
            player.seekTo(newPosition.coerceIn(0, player.duration))
        }
    }

    private fun handleZoom(scaleFactor: Float) {
        val newZoom = (currentZoom * scaleFactor)
            .coerceIn(UI.MIN_ZOOM_LEVEL, UI.MAX_ZOOM_LEVEL)
        
        if (newZoom != currentZoom) {
            currentZoom = newZoom
            binding.playerView.scaleX = currentZoom
            binding.playerView.scaleY = currentZoom
        }
    }

    private fun togglePlayPause() {
        mainPlayer?.let { player ->
            if (player.isPlaying) {
                player.pause()
            } else {
                player.play()
            }
            viewModel.setIsPlaying(player.isPlaying)
        }
    }

    private fun toggleFrameByFrameMode() {
        isFrameByFrameMode = !isFrameByFrameMode
        mainPlayer?.playWhenReady = !isFrameByFrameMode
        binding.frameByFrameButton.isSelected = isFrameByFrameMode
        
        if (isFrameByFrameMode) {
            showFrameControls()
        } else {
            hideFrameControls()
        }
    }

    private fun toggleAnalysisMode() {
        currentMode = when (currentMode) {
            AnalysisMode.SINGLE -> AnalysisMode.SPLIT_SCREEN
            AnalysisMode.SPLIT_SCREEN -> AnalysisMode.SINGLE
        }
        
        updateAnalysisMode()
    }

    private fun updateAnalysisMode() {
        binding.apply {
            when (currentMode) {
                AnalysisMode.SINGLE -> {
                    comparisonPlayerView.visibility = View.GONE
                    splitScreenDivider.visibility = View.GONE
                    releaseComparisonPlayer()
                }
                AnalysisMode.SPLIT_SCREEN -> {
                    comparisonPlayerView.visibility = View.VISIBLE
                    splitScreenDivider.visibility = View.VISIBLE
                    setupComparisonPlayer()
                }
            }
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        outState.putString(KEY_VIDEO_ID, videoId)
        outState.putString(KEY_ANALYSIS_MODE, currentMode.name)
    }

    override fun onDestroyView() {
        super.onDestroyView()
        releasePlayers()
    }

    private fun releasePlayers() {
        mainPlayer?.release()
        mainPlayer = null
        releaseComparisonPlayer()
    }

    private fun releaseComparisonPlayer() {
        comparisonPlayer?.release()
        comparisonPlayer = null
    }

    companion object {
        private const val KEY_VIDEO_ID = "video_id"
        private const val KEY_ANALYSIS_MODE = "analysis_mode"

        fun newInstance(videoId: String): VideoPlayerFragment {
            return VideoPlayerFragment().apply {
                this.videoId = videoId
            }
        }
    }
}

enum class AnalysisMode {
    SINGLE,
    SPLIT_SCREEN
}