package com.videocoach.data.repositories

import com.videocoach.data.api.ApiService
import com.videocoach.data.database.dao.UserDao
import com.videocoach.domain.models.User
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.distinctUntilChanged
import javax.inject.Inject
import javax.inject.Singleton
import java.util.concurrent.TimeUnit

/**
 * Repository implementation that manages user data operations with offline-first architecture.
 * Implements secure data handling, optimistic locking, and comprehensive error management.
 *
 * @property userDao Local database access for user data
 * @property apiService Remote API service for user operations
 */
@Singleton
class UserRepository @Inject constructor(
    private val userDao: UserDao,
    private val apiService: ApiService
) {
    companion object {
        private const val SYNC_INTERVAL = 5 * 60 * 1000L // 5 minutes
        private const val MAX_SYNC_RETRIES = 3
        private const val TOKEN_REFRESH_THRESHOLD = 5 * 60L // 5 minutes before expiry
    }

    // Current authenticated user
    private val _currentUser = MutableStateFlow<User?>(null)
    val currentUser: Flow<User?> = _currentUser.distinctUntilChanged()

    // Sync status for UI feedback
    private val _syncStatus = MutableStateFlow(SyncStatus.IDLE)
    val syncStatus: Flow<SyncStatus> = _syncStatus.distinctUntilChanged()

    // Network status for connectivity handling
    private val _networkStatus = MutableStateFlow(NetworkStatus.UNKNOWN)
    val networkStatus: Flow<NetworkStatus> = _networkStatus.distinctUntilChanged()

    /**
     * Retrieves user by ID with offline-first approach.
     *
     * @param userId Unique identifier of the user
     * @return Flow emitting Result containing user data or error
     */
    fun getUserById(userId: String): Flow<Result<User>> = userDao.getUserById(userId)
        .map { entity ->
            try {
                entity?.let {
                    // Validate version and sync status
                    if (shouldSyncUser(it)) {
                        syncUserWithRemote(it)
                    }
                    Result.success(it.toDomainModel())
                } ?: Result.failure(UserNotFoundException(userId))
            } catch (e: Exception) {
                Result.failure(e)
            }
        }
        .distinctUntilChanged()

    /**
     * Authenticates user with secure token management.
     *
     * @param email User's email address
     * @param password User's password
     * @return Result containing authenticated user or error
     */
    suspend fun login(email: String, password: String): Result<User> {
        return try {
            val response = apiService.login(LoginRequest(email, password, getDeviceId()))
                .blockingGet()

            if (response.isSuccessful()) {
                response.data?.let { authResponse ->
                    // Store tokens securely
                    storeAuthTokens(authResponse)

                    // Cache user data locally
                    val userEntity = authResponse.user.toEntity().copy(
                        lastSyncedAt = System.currentTimeMillis()
                    )
                    userDao.insertUser(userEntity)

                    // Update current user
                    _currentUser.value = authResponse.user
                    
                    // Schedule background sync
                    initializeBackgroundSync()

                    Result.success(authResponse.user)
                } ?: Result.failure(LoginException("Invalid response data"))
            } else {
                Result.failure(LoginException(response.message ?: "Unknown error"))
            }
        } catch (e: Exception) {
            Result.failure(LoginException("Login failed", e))
        }
    }

    /**
     * Updates user data with optimistic locking and conflict resolution.
     *
     * @param user Updated user data
     * @return Result containing updated user or error
     */
    suspend fun updateUser(user: User): Result<User> {
        return try {
            // Validate version
            val currentEntity = userDao.getUserById(user.id.value).firstOrNull()
            if (currentEntity != null && currentEntity.version > user.version) {
                return Result.failure(VersionConflictException("Newer version exists"))
            }

            // Update local database
            val updatedEntity = user.toEntity().copy(
                version = user.version + 1,
                lastSyncedAt = System.currentTimeMillis()
            )
            val updateResult = userDao.updateUser(updatedEntity)

            if (updateResult > 0) {
                // Trigger remote sync if online
                if (_networkStatus.value == NetworkStatus.CONNECTED) {
                    syncUserWithRemote(updatedEntity)
                }

                Result.success(updatedEntity.toDomainModel())
            } else {
                Result.failure(UpdateException("Failed to update user"))
            }
        } catch (e: Exception) {
            Result.failure(UpdateException("Update failed", e))
        }
    }

    /**
     * Synchronizes pending changes with remote server.
     *
     * @return Result indicating sync completion status
     */
    suspend fun syncPendingChanges(): Result<Unit> {
        return try {
            _syncStatus.value = SyncStatus.IN_PROGRESS

            val threshold = System.currentTimeMillis() - SYNC_INTERVAL
            userDao.getUsersNeedingSync(threshold)
                .collect { pendingUsers ->
                    pendingUsers.forEach { entity ->
                        var retryCount = 0
                        var syncSuccess = false

                        while (retryCount < MAX_SYNC_RETRIES && !syncSuccess) {
                            try {
                                syncUserWithRemote(entity)
                                syncSuccess = true
                            } catch (e: Exception) {
                                retryCount++
                                if (retryCount >= MAX_SYNC_RETRIES) {
                                    throw e
                                }
                                // Exponential backoff
                                TimeUnit.SECONDS.sleep(2L shl retryCount)
                            }
                        }
                    }
                }

            _syncStatus.value = SyncStatus.IDLE
            Result.success(Unit)
        } catch (e: Exception) {
            _syncStatus.value = SyncStatus.ERROR
            Result.failure(SyncException("Sync failed", e))
        }
    }

    private suspend fun syncUserWithRemote(entity: UserEntity) {
        val response = apiService.syncUser(entity.id, entity.version)
            .blockingGet()

        if (response.isSuccessful()) {
            response.data?.let { remoteUser ->
                if (remoteUser.version > entity.version) {
                    // Remote has newer version, update local
                    userDao.updateUser(remoteUser.toEntity())
                } else if (remoteUser.version < entity.version) {
                    // Local has newer version, update remote
                    apiService.updateUserProfile(
                        token = getAuthToken(),
                        request = UpdateProfileRequest(entity.toDomainModel())
                    ).blockingGet()
                }
            }
        } else {
            throw SyncException(response.message ?: "Sync failed")
        }
    }

    private fun shouldSyncUser(entity: UserEntity): Boolean {
        return System.currentTimeMillis() - entity.lastSyncedAt > SYNC_INTERVAL
    }

    private fun initializeBackgroundSync() {
        // Implementation of background sync worker initialization
    }

    private fun storeAuthTokens(authResponse: AuthResponse) {
        // Implementation of secure token storage
    }

    private fun getAuthToken(): String {
        // Implementation of token retrieval and refresh if needed
        return ""
    }

    private fun getDeviceId(): String {
        // Implementation of secure device ID generation
        return ""
    }
}

sealed class UserRepositoryException(message: String, cause: Throwable? = null) : Exception(message, cause)
class UserNotFoundException(userId: String) : UserRepositoryException("User not found: $userId")
class LoginException(message: String, cause: Throwable? = null) : UserRepositoryException(message, cause)
class UpdateException(message: String, cause: Throwable? = null) : UserRepositoryException(message, cause)
class SyncException(message: String, cause: Throwable? = null) : UserRepositoryException(message, cause)
class VersionConflictException(message: String) : UserRepositoryException(message)

enum class SyncStatus {
    IDLE,
    IN_PROGRESS,
    ERROR
}

enum class NetworkStatus {
    UNKNOWN,
    CONNECTED,
    DISCONNECTED
}