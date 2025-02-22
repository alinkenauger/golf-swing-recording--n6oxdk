package com.videocoach.presentation.chat

import androidx.lifecycle.viewModelScope // v2.6.2
import com.videocoach.presentation.base.BaseViewModel
import dagger.hilt.android.lifecycle.HiltViewModel // v2.6.2
import kotlinx.coroutines.flow.MutableStateFlow // v1.7.3
import kotlinx.coroutines.flow.StateFlow // v1.7.3
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject // v1
import java.util.UUID
import android.util.Log

private const val TAG = "ChatViewModel"
private const val PAGE_SIZE = 20

/**
 * ViewModel responsible for managing chat functionality and state in the Video Coaching Platform.
 * Handles real-time messaging, video responses, and notifications with offline support.
 */
@HiltViewModel
class ChatViewModel @Inject constructor(
    private val chatRepository: ChatRepository,
    private val socketService: SocketService,
    private val notificationManager: NotificationManager,
    private val messageQueue: MessageQueue
) : BaseViewModel() {

    // Chat threads state
    private val _threads = MutableStateFlow<List<ChatThread>>(emptyList())
    val threads: StateFlow<List<ChatThread>> = _threads.asStateFlow()

    // Current thread messages
    private val _messages = MutableStateFlow<List<Message>>(emptyList())
    val messages: StateFlow<List<Message>> = _messages.asStateFlow()

    // Currently selected thread
    private val _currentThread = MutableStateFlow<ChatThread?>(null)
    val currentThread: StateFlow<ChatThread?> = _currentThread.asStateFlow()

    // Message delivery statuses
    private val _messageStatuses = MutableStateFlow<Map<String, MessageStatus>>(emptyMap())
    val messageStatuses: StateFlow<Map<String, MessageStatus>> = _messageStatuses.asStateFlow()

    // Users currently typing
    private val _typingUsers = MutableStateFlow<Set<String>>(emptySet())
    val typingUsers: StateFlow<Set<String>> = _typingUsers.asStateFlow()

    // Connection status
    private val _isOffline = MutableStateFlow(false)
    val isOffline: StateFlow<Boolean> = _isOffline.asStateFlow()

    init {
        setupWebSocket()
        initializeOfflineSupport()
    }

    /**
     * Loads chat threads with pagination support
     */
    fun loadThreads(page: Int = 0, pageSize: Int = PAGE_SIZE) = launchWithLoading {
        val response = chatRepository.getThreads(page, pageSize)
        processApiResponse(response) { threads ->
            val currentThreads = _threads.value.toMutableList()
            if (page == 0) currentThreads.clear()
            currentThreads.addAll(threads)
            _threads.value = currentThreads
            
            // Update unread status
            threads.forEach { thread ->
                if (thread.hasUnreadMessages) {
                    updateThreadReadStatus(thread.id)
                }
            }
        }
    }

    /**
     * Loads messages for the current chat thread with pagination
     */
    fun loadMessages(threadId: String, page: Int = 0, pageSize: Int = PAGE_SIZE) = launchWithLoading {
        val response = chatRepository.getMessages(threadId, page, pageSize)
        processApiResponse(response) { messages ->
            val currentMessages = if (page == 0) mutableListOf() else _messages.value.toMutableList()
            
            // Merge with any pending offline messages
            val offlineMessages = messageQueue.getPendingMessages(threadId)
            val mergedMessages = mergeMessages(messages, offlineMessages)
            
            currentMessages.addAll(mergedMessages)
            _messages.value = currentMessages.sortedBy { it.timestamp }
            
            // Mark messages as read
            updateMessageReadStatus(threadId, messages)
        }
    }

    /**
     * Sends a new message with support for different types and offline queueing
     */
    fun sendMessage(content: String, type: MessageType, metadata: Map<String, Any> = emptyMap()) = launchWithLoading {
        val messageId = UUID.randomUUID().toString()
        val message = Message(
            id = messageId,
            threadId = currentThread.value?.id ?: return@launchWithLoading,
            content = content,
            type = type,
            metadata = metadata,
            timestamp = System.currentTimeMillis(),
            senderId = chatRepository.getCurrentUserId()
        )

        // Handle offline scenario
        if (_isOffline.value) {
            messageQueue.enqueue(message)
            updateLocalMessageState(message)
            return@launchWithLoading
        }

        // Send message
        try {
            socketService.sendMessage(message)
            updateMessageStatus(messageId, MessageStatus.SENT)
            
            // Handle media upload for video/image messages
            if (type == MessageType.VIDEO || type == MessageType.IMAGE) {
                handleMediaUpload(message)
            }
        } catch (e: Exception) {
            handleError(e)
            messageQueue.enqueue(message)
            updateMessageStatus(messageId, MessageStatus.FAILED)
        }
    }

    /**
     * Handles incoming WebSocket messages with rich notification support
     */
    private fun onMessageReceived(message: Message) {
        viewModelScope.launch {
            // Validate message integrity
            if (!message.isValid()) {
                Log.e(TAG, "Received invalid message: $message")
                return@launch
            }

            // Update messages if in same thread
            if (message.threadId == currentThread.value?.id) {
                val updatedMessages = _messages.value.toMutableList()
                updatedMessages.add(message)
                _messages.value = updatedMessages.sortedBy { it.timestamp }
                
                // Mark as read immediately if thread is active
                updateMessageReadStatus(message.threadId, listOf(message))
            }

            // Update thread metadata
            updateThreadMetadata(message)

            // Show notification if needed
            if (shouldShowNotification(message)) {
                notificationManager.showMessageNotification(message)
            }
        }
    }

    /**
     * Selects a chat thread and initializes message synchronization
     */
    fun selectThread(threadId: String) = launchWithLoading {
        val response = chatRepository.getThread(threadId)
        processApiResponse(response) { thread ->
            _currentThread.value = thread
            loadMessages(threadId)
            
            // Clear typing indicators
            _typingUsers.value = emptySet()
            
            // Initialize message status tracking
            initializeMessageTracking(threadId)
            
            // Sync offline messages
            messageQueue.getPendingMessages(threadId).forEach { message ->
                if (_isOffline.value) return@forEach
                sendMessage(message.content, message.type, message.metadata)
                messageQueue.remove(message.id)
            }
        }
    }

    private fun setupWebSocket() {
        viewModelScope.launch {
            socketService.connect()
            socketService.observeMessages().collect { message ->
                onMessageReceived(message)
            }
            socketService.observeConnectionStatus().collect { isConnected ->
                _isOffline.value = !isConnected
                if (isConnected) {
                    syncOfflineMessages()
                }
            }
        }
    }

    private fun initializeOfflineSupport() {
        viewModelScope.launch {
            messageQueue.observeQueue().collect { pendingMessages ->
                if (!_isOffline.value) {
                    syncOfflineMessages()
                }
            }
        }
    }

    private fun updateMessageStatus(messageId: String, status: MessageStatus) {
        val currentStatuses = _messageStatuses.value.toMutableMap()
        currentStatuses[messageId] = status
        _messageStatuses.value = currentStatuses
    }

    private fun updateThreadMetadata(message: Message) {
        val currentThreads = _threads.value.toMutableList()
        val threadIndex = currentThreads.indexOfFirst { it.id == message.threadId }
        if (threadIndex != -1) {
            val updatedThread = currentThreads[threadIndex].copy(
                lastMessage = message,
                lastActivityTimestamp = message.timestamp
            )
            currentThreads[threadIndex] = updatedThread
            _threads.value = currentThreads.sortedByDescending { it.lastActivityTimestamp }
        }
    }

    private suspend fun handleMediaUpload(message: Message) {
        when (message.type) {
            MessageType.VIDEO -> {
                val videoUrl = message.metadata["videoUrl"] as? String ?: return
                chatRepository.uploadVideo(message.id, videoUrl)
            }
            MessageType.IMAGE -> {
                val imageUrl = message.metadata["imageUrl"] as? String ?: return
                chatRepository.uploadImage(message.id, imageUrl)
            }
            else -> return
        }
    }

    private fun updateLocalMessageState(message: Message) {
        val currentMessages = _messages.value.toMutableList()
        currentMessages.add(message)
        _messages.value = currentMessages.sortedBy { it.timestamp }
        updateMessageStatus(message.id, MessageStatus.PENDING)
    }

    private suspend fun syncOfflineMessages() {
        messageQueue.getAllMessages().forEach { message ->
            sendMessage(message.content, message.type, message.metadata)
            messageQueue.remove(message.id)
        }
    }

    override fun onCleared() {
        super.onCleared()
        socketService.disconnect()
    }
}