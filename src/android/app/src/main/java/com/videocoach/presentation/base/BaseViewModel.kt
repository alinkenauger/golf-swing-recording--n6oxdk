package com.videocoach.presentation.base

import androidx.lifecycle.ViewModel // v2.6.2
import androidx.lifecycle.viewModelScope // v2.6.2
import kotlinx.coroutines.flow.StateFlow // v1.7.3
import kotlinx.coroutines.flow.MutableStateFlow // v1.7.3
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import android.util.Log
import com.videocoach.utils.NetworkUtils
import com.videocoach.data.api.models.ApiResponse
import com.videocoach.utils.Constants

private const val TAG = "BaseViewModel"

/**
 * Abstract base ViewModel class providing common functionality for all ViewModels
 * in the Video Coaching Platform. Handles state management, error handling, and
 * coroutine lifecycle management with a focus on reliability and security.
 */
abstract class BaseViewModel : ViewModel() {

    // Loading state management
    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    // Error state management
    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    // Network availability state
    private val _isNetworkAvailable = MutableStateFlow(true)
    val isNetworkAvailable: StateFlow<Boolean> = _isNetworkAvailable.asStateFlow()

    // Retry attempt counter for error handling
    private var retryAttempt = 0

    /**
     * Launches a coroutine with loading state management and comprehensive error handling.
     * Ensures proper network validation and secure error processing.
     *
     * @param block The suspend function to execute
     * @return Job representing the launched coroutine
     */
    protected fun launchWithLoading(block: suspend () -> Unit): Job {
        return viewModelScope.launch {
            try {
                _isLoading.value = true
                retryAttempt = 0
                block()
            } catch (e: Exception) {
                handleError(e)
            } finally {
                _isLoading.value = false
            }
        }
    }

    /**
     * Processes API responses with proper error handling and retry logic.
     * 
     * @param response The API response to process
     * @param onSuccess Callback for successful response
     * @return Boolean indicating if processing was successful
     */
    protected suspend fun <T> processApiResponse(
        response: ApiResponse<T>,
        onSuccess: suspend (T) -> Unit
    ): Boolean {
        return when {
            response.isSuccessful() -> {
                response.data?.let { 
                    onSuccess(it)
                    true
                } ?: run {
                    handleError(IllegalStateException("Response successful but data is null"))
                    false
                }
            }
            else -> {
                handleError(IllegalStateException(response.message ?: "Unknown API error"))
                false
            }
        }
    }

    /**
     * Handles errors with proper categorization and user feedback.
     * Implements secure error logging and network state validation.
     *
     * @param error The error to handle
     */
    protected fun handleError(error: Throwable) {
        Log.e(TAG, "Error in ViewModel", error)
        
        val networkError = NetworkUtils.handleNetworkError(error, retryAttempt)
        
        when (networkError.type) {
            NetworkUtils.ErrorType.CONNECTIVITY -> {
                _isNetworkAvailable.value = false
                _error.value = networkError.message
            }
            NetworkUtils.ErrorType.SECURITY -> {
                _error.value = networkError.message
                // Security errors are not retryable
                retryAttempt = Constants.API.RETRY_MAX_ATTEMPTS
            }
            else -> {
                _error.value = networkError.message
                if (networkError.isRetryable) {
                    retryAttempt++
                }
            }
        }
    }

    /**
     * Safely clears current error state and resets related states.
     */
    fun clearError() {
        _error.value = null
        if (!isNetworkAvailable.value) {
            // Recheck network availability when clearing errors
            _isNetworkAvailable.value = true
        }
        // Reset retry counter when clearing errors
        retryAttempt = 0
    }

    /**
     * Handles cleanup when ViewModel is destroyed.
     * Ensures proper resource cleanup and state reset.
     */
    override fun onCleared() {
        super.onCleared()
        clearError()
        _isLoading.value = false
        // Additional cleanup if needed
    }
}