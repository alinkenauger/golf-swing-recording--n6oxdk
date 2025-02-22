package com.videocoach.presentation.home

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.viewModels
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import com.videocoach.R
import com.videocoach.databinding.FragmentHomeBinding
import com.videocoach.domain.models.Video
import com.videocoach.domain.models.VideoStatus
import com.videocoach.presentation.base.BaseFragment
import com.videocoach.utils.Constants
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Fragment responsible for displaying the home screen with video feed.
 * Implements offline-first architecture with enhanced video management.
 */
@AndroidEntryPoint
class HomeFragment : BaseFragment<FragmentHomeBinding>(R.layout.fragment_home) {

    private val viewModel: HomeViewModel by viewModels()
    
    private var _binding: FragmentHomeBinding? = null
    private val binding get() = _binding!!

    private lateinit var videoAdapter: VideoAdapter
    private var isLoadingMore = false
    private var currentPage = 0

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentHomeBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        initializeView()
        setupObservers()
    }

    private fun initializeView() {
        setupSwipeRefresh()
        setupRecyclerView()
        setupErrorHandling()
    }

    private fun setupSwipeRefresh() {
        binding.swipeRefreshLayout.apply {
            setColorSchemeResources(R.color.primary)
            setProgressBackgroundColorSchemeResource(R.color.surface)
            setOnRefreshListener { viewModel.refreshVideos() }
        }
    }

    private fun setupRecyclerView() {
        videoAdapter = VideoAdapter(
            onVideoClick = { video -> handleVideoClick(video) },
            onRetryClick = { video -> handleRetryUpload(video) }
        )

        binding.recyclerView.apply {
            layoutManager = LinearLayoutManager(context)
            adapter = videoAdapter
            setHasFixedSize(true)
            
            // Implement infinite scroll with pagination
            addOnScrollListener(object : RecyclerView.OnScrollListener() {
                override fun onScrolled(recyclerView: RecyclerView, dx: Int, dy: Int) {
                    super.onScrolled(recyclerView, dx, dy)
                    
                    val layoutManager = recyclerView.layoutManager as LinearLayoutManager
                    val visibleItemCount = layoutManager.childCount
                    val totalItemCount = layoutManager.itemCount
                    val firstVisibleItemPosition = layoutManager.findFirstVisibleItemPosition()

                    if (!isLoadingMore && 
                        (visibleItemCount + firstVisibleItemPosition) >= totalItemCount &&
                        firstVisibleItemPosition >= 0) {
                        loadMoreVideos()
                    }
                }
            })
        }
    }

    private fun setupObservers() {
        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.videos.collectLatest { paginatedList ->
                videoAdapter.submitList(paginatedList.items)
                currentPage = paginatedList.currentPage
                isLoadingMore = false
            }
        }

        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.isRefreshing.collectLatest { isRefreshing ->
                binding.swipeRefreshLayout.isRefreshing = isRefreshing
            }
        }

        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.uploadProgress.collectLatest { progressMap ->
                videoAdapter.updateUploadProgress(progressMap)
            }
        }

        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.networkState.collectLatest { networkState ->
                handleNetworkState(networkState)
            }
        }
    }

    private fun handleVideoClick(video: Video) {
        when (video.status) {
            VideoStatus.READY -> navigateToVideoPlayer(video)
            VideoStatus.ERROR -> showError(getString(R.string.video_error_message))
            VideoStatus.UPLOADING, 
            VideoStatus.PROCESSING,
            VideoStatus.GENERATING_VARIANTS -> {
                showMessage(getString(R.string.video_processing_message))
            }
        }
    }

    private fun handleRetryUpload(video: Video) {
        if (video.status == VideoStatus.ERROR) {
            viewModel.retryFailedUploads(listOf(video.id))
        }
    }

    private fun loadMoreVideos() {
        if (!isLoadingMore) {
            isLoadingMore = true
            viewModel.loadVideos(currentPage + 1)
        }
    }

    private fun handleNetworkState(networkState: NetworkState) {
        when (networkState) {
            is NetworkState.Connected -> {
                binding.offlineBar.visibility = View.GONE
                viewModel.retryFailedUploads()
            }
            is NetworkState.Disconnected -> {
                binding.offlineBar.visibility = View.VISIBLE
                showOfflineMode()
            }
        }
    }

    private fun navigateToVideoPlayer(video: Video) {
        // Navigation implementation
    }

    private fun showMessage(message: String) {
        binding.messageSnackbar.apply {
            setText(message)
            show()
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        binding.recyclerView.adapter = null
        _binding = null
    }

    companion object {
        fun newInstance() = HomeFragment()
    }
}