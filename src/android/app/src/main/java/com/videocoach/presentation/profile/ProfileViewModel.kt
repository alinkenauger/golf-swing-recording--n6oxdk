package com.videocoach.presentation.profile

import androidx.lifecycle.SavedStateHandle
import com.videocoach.data.repositories.UserRepository
import com.videocoach.domain.models.User
import com.videocoach.presentation.base.BaseViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import javax.inject.Inject
import android.util.Log

private const val TAG = "ProfileViewModel"
private const val KEY_EDIT_MODE = "profile_edit_mode"
private const val KEY_LAST_SYNC = "profile_last_sync"

/**
 * ViewModel managing user profile data and operations with enhanced security features
 * and robust error handling in the Video Coaching Platform Android app.
 *
 * @property userRepository Repository handling user data operations
 * @property savedStateHandle Handle for saving/restoring ViewModel state
 */
@HiltViewModel
class ProfileViewModel @Inject constructor(
    private val userRepository: UserRepository,
    private val savedStateHandle: SavedStateHandle
) : BaseViewModel() {

    // UI State management
    private val _uiState = MutableStateFlow<ProfileUiState>(ProfileUiState.Loading)
    val uiState: StateFlow<ProfileUiState> = _uiState.asStateFlow()

    // Edit mode state with process death persistence
    private val _isEditMode = MutableStateFlow(savedStateHandle[KEY_EDIT_MODE] ?: false)
    val isEditMode: StateFlow<Boolean> = _isEditMode.asStateFlow()

    init {
        initializeProfileData()
    }

    /**
     * Initializes profile data stream with error handling and automatic synchronization
     */
    private fun initializeProfileData() {
        viewModelScope.launch {
            userRepository.currentUser
                .catch { error ->
                    handleError(error)
                    _uiState.value = ProfileUiState.Error(error.message ?: "Unknown error")
                }
                .collectLatest { user ->
                    user?.let {
                        _uiState.value = ProfileUiState.Success(it)
                        checkAndSyncProfile(it)
                    } ?: run {
                        _uiState.value = ProfileUiState.Error("User data not found")
                    }
                }
        }
    }

    /**
     * Updates user profile with validation and error handling
     *
     * @param updatedUser Updated user data
     * @return Result indicating success or failure
     */
    suspend fun updateProfile(updatedUser: User): Result<Unit> {
        return try {
            // Validate input data
            require(updatedUser.validate()) { "Invalid user data" }

            // Launch update with loading state
            launchWithLoading {
                val result = userRepository.updateUser(updatedUser)
                result.fold(
                    onSuccess = {
                        _isEditMode.value = false
                        savedStateHandle[KEY_EDIT_MODE] = false
                    },
                    onFailure = { throw it }
                )
            }
            Result.success(Unit)
        } catch (e: Exception) {
            Log.e(TAG, "Profile update failed", e)
            Result.failure(e)
        }
    }

    /**
     * Toggles profile edit mode with state persistence
     */
    fun toggleEditMode() {
        val newEditMode = !_isEditMode.value
        _isEditMode.value = newEditMode
        savedStateHandle[KEY_EDIT_MODE] = newEditMode
    }

    /**
     * Securely logs out user with proper cleanup
     *
     * @return Result indicating success or failure
     */
    suspend fun logout(): Result<Unit> {
        return try {
            launchWithLoading {
                // Clear sensitive data first
                clearProfileData()
                
                // Perform logout
                userRepository.logout()
                
                // Reset UI state
                _uiState.value = ProfileUiState.Loading
                _isEditMode.value = false
                savedStateHandle[KEY_EDIT_MODE] = false
            }
            Result.success(Unit)
        } catch (e: Exception) {
            Log.e(TAG, "Logout failed", e)
            Result.failure(e)
        }
    }

    /**
     * Checks if profile needs synchronization and triggers sync if needed
     */
    private suspend fun checkAndSyncProfile(user: User) {
        val lastSync = savedStateHandle.get<Long>(KEY_LAST_SYNC) ?: 0
        val shouldSync = System.currentTimeMillis() - lastSync > SYNC_INTERVAL

        if (shouldSync) {
            try {
                userRepository.syncProfile()
                savedStateHandle[KEY_LAST_SYNC] = System.currentTimeMillis()
            } catch (e: Exception) {
                Log.w(TAG, "Profile sync failed", e)
                // Don't propagate sync errors to UI
            }
        }
    }

    /**
     * Clears sensitive profile data during logout or cleanup
     */
    private fun clearProfileData() {
        viewModelScope.launch {
            try {
                // Clear any cached sensitive data
                savedStateHandle.remove<Long>(KEY_LAST_SYNC)
                _uiState.value = ProfileUiState.Loading
            } catch (e: Exception) {
                Log.e(TAG, "Error clearing profile data", e)
            }
        }
    }

    override fun onCleared() {
        super.onCleared()
        clearProfileData()
    }

    companion object {
        private const val SYNC_INTERVAL = 5 * 60 * 1000L // 5 minutes
    }
}

/**
 * Sealed class representing possible UI states for the profile screen
 */
sealed class ProfileUiState {
    object Loading : ProfileUiState()
    data class Success(val user: User) : ProfileUiState()
    data class Error(val message: String) : ProfileUiState()
}