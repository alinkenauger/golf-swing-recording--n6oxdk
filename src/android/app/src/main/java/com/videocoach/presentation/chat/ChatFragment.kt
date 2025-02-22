package com.videocoach.presentation.chat

import android.Manifest
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.view.accessibility.AccessibilityEvent
import androidx.fragment.app.viewModels
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import coil.ImageLoader // v2.4.0
import coil.request.ImageRequest
import com.google.android.material.snackbar.Snackbar
import com.videocoach.R
import com.videocoach.databinding.FragmentChatBinding
import com.videocoach.presentation.base.BaseFragment
import com.videocoach.utils.Constants
import com.videocoach.utils.NetworkUtils
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import javax.inject.Inject

private const val TAG = "ChatFragment"
private const val CAMERA_PERMISSION_REQUEST = 100
private const val STORAGE_PERMISSION_REQUEST = 101
private const val PAGE_SIZE = 20

/**
 * Fragment implementing a comprehensive real-time chat interface with support for
 * text messages, video responses, rich media, offline capabilities, and accessibility features.
 */
@AndroidEntryPoint
class ChatFragment : BaseFragment<FragmentChatBinding>(R.layout.fragment_chat) {

    private val viewModel: ChatViewModel by viewModels()
    private lateinit var messageAdapter: ChatAdapter
    private var currentPage = 0
    private var isLoading = false
    private var hasMoreMessages = true

    @Inject
    lateinit var imageLoader: ImageLoader

    @Inject
    lateinit var networkUtils: NetworkUtils

    override fun getViewBinding(
        inflater: LayoutInflater,
        container: ViewGroup?
    ): FragmentChatBinding = FragmentChatBinding.inflate(inflater, container, false)

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        setupMessageList()
        setupMessageInput()
        setupSwipeRefresh()
        setupVideoButton()
        observeViewModel()
        setupAccessibility()
    }

    private fun setupMessageList() {
        messageAdapter = ChatAdapter(
            imageLoader = imageLoader,
            onMessageClick = ::handleMessageClick,
            onRetryClick = ::handleRetryClick
        )

        binding.messageList.apply {
            layoutManager = LinearLayoutManager(context).apply {
                stackFromEnd = true
                reverseLayout = true
            }
            adapter = messageAdapter
            addOnScrollListener(createScrollListener())
            itemAnimator = null // Disable animations for better performance
        }
    }

    private fun createScrollListener() = object : RecyclerView.OnScrollListener() {
        override fun onScrolled(recyclerView: RecyclerView, dx: Int, dy: Int) {
            val layoutManager = recyclerView.layoutManager as LinearLayoutManager
            val visibleItemCount = layoutManager.childCount
            val totalItemCount = layoutManager.itemCount
            val firstVisibleItem = layoutManager.findFirstVisibleItemPosition()

            if (!isLoading && hasMoreMessages && 
                (visibleItemCount + firstVisibleItem) >= totalItemCount - 5) {
                loadMoreMessages()
            }
        }
    }

    private fun setupMessageInput() {
        binding.messageInput.apply {
            setOnEditorActionListener { _, _, _ ->
                sendMessage()
                true
            }
            
            addTextChangedListener(object : SimpleTextWatcher() {
                override fun onTextChanged(text: CharSequence?, start: Int, before: Int, count: Int) {
                    binding.sendButton.isEnabled = !text.isNullOrBlank()
                    viewModel.updateTypingStatus(text?.isNotBlank() == true)
                }
            })
        }

        binding.sendButton.setOnClickListener { sendMessage() }
    }

    private fun setupSwipeRefresh() {
        binding.swipeRefresh.apply {
            setOnRefreshListener {
                currentPage = 0
                hasMoreMessages = true
                loadMoreMessages()
            }
            setColorSchemeResources(R.color.primary)
        }
    }

    private fun setupVideoButton() {
        binding.videoButton.apply {
            setOnClickListener {
                checkPermissionsAndStartRecording()
            }
            contentDescription = getString(R.string.record_video_response)
        }
    }

    private fun observeViewModel() {
        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.messages.collectLatest { messages ->
                messageAdapter.submitList(messages) {
                    if (currentPage == 0) {
                        binding.messageList.scrollToPosition(0)
                    }
                }
            }
        }

        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.messageStatuses.collectLatest { statuses ->
                messageAdapter.updateMessageStatuses(statuses)
            }
        }

        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.isOffline.collectLatest { offline ->
                handleOfflineState(offline)
            }
        }

        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.typingUsers.collectLatest { users ->
                updateTypingIndicator(users)
            }
        }
    }

    private fun setupAccessibility() {
        binding.root.apply {
            importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_YES
            contentDescription = getString(R.string.chat_screen_description)
        }

        binding.messageList.accessibilityDelegate = object : View.AccessibilityDelegate() {
            override fun onPopulateAccessibilityEvent(host: View, event: AccessibilityEvent) {
                super.onPopulateAccessibilityEvent(host, event)
                if (event.eventType == AccessibilityEvent.TYPE_VIEW_SCROLLED) {
                    announceForAccessibility(getString(R.string.messages_updated))
                }
            }
        }
    }

    private fun sendMessage() {
        val content = binding.messageInput.text?.toString()?.trim()
        if (content.isNullOrBlank()) return

        viewModel.sendMessage(
            content = content,
            type = MessageType.TEXT
        )
        
        binding.messageInput.text?.clear()
        binding.messageList.scrollToPosition(0)
    }

    private fun loadMoreMessages() {
        if (isLoading) return
        
        isLoading = true
        viewModel.loadMessages(
            threadId = requireArguments().getString(ARG_THREAD_ID)!!,
            page = currentPage,
            pageSize = PAGE_SIZE
        )
        currentPage++
    }

    private fun handleMessageClick(message: Message) {
        when (message.type) {
            MessageType.VIDEO -> playVideo(message)
            MessageType.IMAGE -> showFullImage(message)
            else -> Unit
        }
    }

    private fun handleRetryClick(message: Message) {
        viewModel.retryFailedMessage(message.id)
    }

    private fun handleOfflineState(offline: Boolean) {
        binding.offlineIndicator.visibility = if (offline) View.VISIBLE else View.GONE
        binding.sendButton.isEnabled = !offline || binding.messageInput.text?.isNotBlank() == true

        if (offline) {
            Snackbar.make(
                binding.root,
                R.string.offline_mode_active,
                Snackbar.LENGTH_LONG
            ).show()
        }
    }

    private fun updateTypingIndicator(typingUsers: Set<String>) {
        binding.typingIndicator.visibility = 
            if (typingUsers.isNotEmpty()) View.VISIBLE else View.GONE
        
        if (typingUsers.isNotEmpty()) {
            val text = resources.getQuantityString(
                R.plurals.users_typing,
                typingUsers.size,
                typingUsers.size
            )
            binding.typingIndicator.text = text
            announceForAccessibility(text)
        }
    }

    private fun checkPermissionsAndStartRecording() {
        val permissions = arrayOf(
            Manifest.permission.CAMERA,
            Manifest.permission.RECORD_AUDIO
        )
        
        requestPermissions(permissions, CAMERA_PERMISSION_REQUEST)
    }

    private fun playVideo(message: Message) {
        val videoUrl = message.metadata["videoUrl"] as? String ?: return
        // Navigate to video player fragment
        findNavController().navigate(
            R.id.action_chatFragment_to_videoPlayerFragment,
            bundleOf("videoUrl" to videoUrl)
        )
    }

    private fun showFullImage(message: Message) {
        val imageUrl = message.metadata["imageUrl"] as? String ?: return
        // Show full screen image dialog
        ImageViewerDialog.newInstance(imageUrl)
            .show(childFragmentManager, "image_viewer")
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<String>,
        grantResults: IntArray
    ) {
        when (requestCode) {
            CAMERA_PERMISSION_REQUEST -> {
                if (grantResults.all { it == PERMISSION_GRANTED }) {
                    startVideoRecording()
                } else {
                    showError(getString(R.string.camera_permission_required))
                }
            }
        }
    }

    companion object {
        private const val ARG_THREAD_ID = "thread_id"

        fun newInstance(threadId: String) = ChatFragment().apply {
            arguments = Bundle().apply {
                putString(ARG_THREAD_ID, threadId)
            }
        }
    }
}