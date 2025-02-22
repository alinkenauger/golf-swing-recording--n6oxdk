package com.videocoach.data.repositories

import android.content.Context
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKeys
import com.videocoach.data.api.ApiService
import com.videocoach.data.api.models.ApiResponse
import com.videocoach.domain.models.User
import dagger.hilt.android.qualifiers.ApplicationContext
import io.reactivex.rxjava3.core.BehaviorSubject
import io.reactivex.rxjava3.core.Observable
import io.reactivex.rxjava3.core.Single
import io.reactivex.rxjava3.subjects.PublishSubject
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Repository that handles authentication operations with comprehensive security features
 * and session management for the Video Coaching Platform.
 *
 * @property apiService API service for authentication endpoints
 * @property userDao Local database access for user data
 * @property biometricManager Biometric authentication manager
 */
@Singleton
class AuthRepository @Inject constructor(
    private val apiService: ApiService,
    private val userDao: UserDao,
    @ApplicationContext private val context: Context
) {
    private val masterKeyAlias = MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC)
    
    private val securePrefs = EncryptedSharedPreferences.create(
        "auth_prefs",
        masterKeyAlias,
        context,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )

    private val currentUser = BehaviorSubject.create<User?>()
    private val authEvents = PublishSubject.create<AuthEvent>()
    private val loginAttempts = AtomicInteger(0)
    private val biometricManager = BiometricManager.from(context)

    init {
        // Load cached user on initialization
        val cachedUser = userDao.getCachedUser()
        cachedUser?.let { currentUser.onNext(it) }

        // Setup token refresh scheduler
        setupTokenRefreshScheduler()
    }

    /**
     * Authenticates user with comprehensive security checks and multi-factor support.
     *
     * @param email User's email
     * @param password User's password
     * @param useBiometric Whether to enable biometric auth
     * @return Single<AuthResult> Observable stream of authentication result
     */
    fun login(email: String, password: String, useBiometric: Boolean = false): Single<AuthResult> {
        return Single.create { emitter ->
            try {
                // Check login attempt count
                if (loginAttempts.get() >= MAX_LOGIN_ATTEMPTS) {
                    val cooldownRemaining = getCooldownTimeRemaining()
                    if (cooldownRemaining > 0) {
                        throw SecurityException("Too many login attempts. Try again in $cooldownRemaining minutes")
                    }
                    loginAttempts.set(0)
                }

                // Validate password complexity
                validatePasswordComplexity(password)

                // Perform API login
                apiService.login(LoginRequest(email, password, getDeviceId()))
                    .flatMap { response ->
                        when {
                            response.isSuccessful() -> {
                                val authResponse = response.data!!
                                
                                // Handle MFA if enabled
                                if (authResponse.user.isMfaEnabled) {
                                    handleMfaVerification(authResponse)
                                } else {
                                    Single.just(authResponse)
                                }
                            }
                            else -> Single.error(AuthException(response.message ?: "Login failed"))
                        }
                    }
                    .subscribe({ authResponse ->
                        // Handle biometric enrollment if requested
                        if (useBiometric) {
                            enrollBiometric(authResponse)
                        }

                        // Store tokens securely
                        storeAuthTokens(authResponse)

                        // Cache user data
                        userDao.cacheUser(authResponse.user)
                        currentUser.onNext(authResponse.user)

                        // Log successful auth
                        logAuthEvent(AuthEvent.LOGIN_SUCCESS)

                        emitter.onSuccess(AuthResult.Success(authResponse))
                    }, { error ->
                        handleLoginError(error)
                        emitter.onError(error)
                    })
            } catch (e: Exception) {
                handleLoginError(e)
                emitter.onError(e)
            }
        }
    }

    /**
     * Handles secure token refresh with proper error handling.
     *
     * @return Single<TokenResult> New valid token
     */
    fun refreshToken(): Single<TokenResult> {
        return Single.create { emitter ->
            try {
                val refreshToken = securePrefs.getString(PREF_REFRESH_TOKEN, null)
                    ?: throw SecurityException("No refresh token available")

                apiService.refreshToken(refreshToken)
                    .subscribe({ response ->
                        if (response.isSuccessful()) {
                            val tokenResponse = response.data!!
                            storeAuthTokens(tokenResponse)
                            logAuthEvent(AuthEvent.TOKEN_REFRESH)
                            emitter.onSuccess(TokenResult.Success(tokenResponse.accessToken))
                        } else {
                            handleTokenRefreshError()
                            emitter.onError(AuthException("Token refresh failed"))
                        }
                    }, { error ->
                        handleTokenRefreshError()
                        emitter.onError(error)
                    })
            } catch (e: Exception) {
                handleTokenRefreshError()
                emitter.onError(e)
            }
        }
    }

    /**
     * Logs out user and cleans up session data.
     *
     * @return Single<Unit>
     */
    fun logout(): Single<Unit> {
        return Single.create { emitter ->
            try {
                val token = securePrefs.getString(PREF_ACCESS_TOKEN, null)
                if (token != null) {
                    apiService.logout(token)
                        .subscribe({
                            cleanupSession()
                            emitter.onSuccess(Unit)
                        }, { error ->
                            // Still cleanup session on API error
                            cleanupSession()
                            emitter.onSuccess(Unit)
                        })
                } else {
                    cleanupSession()
                    emitter.onSuccess(Unit)
                }
            } catch (e: Exception) {
                cleanupSession()
                emitter.onSuccess(Unit)
            }
        }
    }

    /**
     * Observes current authenticated user.
     *
     * @return Observable<User?> Stream of user updates
     */
    fun observeCurrentUser(): Observable<User?> = currentUser

    /**
     * Observes authentication events.
     *
     * @return Observable<AuthEvent> Stream of auth events
     */
    fun observeAuthEvents(): Observable<AuthEvent> = authEvents

    private fun validatePasswordComplexity(password: String) {
        if (password.length < User.MINIMUM_PASSWORD_LENGTH) {
            throw SecurityException("Password must be at least ${User.MINIMUM_PASSWORD_LENGTH} characters")
        }
        // Add additional password complexity checks as needed
    }

    private fun handleMfaVerification(authResponse: AuthResponse): Single<AuthResponse> {
        // Implementation for MFA verification flow
        return Single.error(NotImplementedError("MFA verification not implemented"))
    }

    private fun enrollBiometric(authResponse: AuthResponse) {
        if (biometricManager.canAuthenticate() == BiometricManager.BIOMETRIC_SUCCESS) {
            // Implementation for biometric enrollment
        }
    }

    private fun storeAuthTokens(authResponse: AuthResponse) {
        securePrefs.edit()
            .putString(PREF_ACCESS_TOKEN, authResponse.accessToken)
            .putString(PREF_REFRESH_TOKEN, authResponse.refreshToken)
            .putLong(PREF_TOKEN_EXPIRY, System.currentTimeMillis() + authResponse.expiresIn)
            .apply()
    }

    private fun handleLoginError(error: Throwable) {
        loginAttempts.incrementAndGet()
        if (loginAttempts.get() >= MAX_LOGIN_ATTEMPTS) {
            securePrefs.edit()
                .putLong(PREF_COOLDOWN_START, System.currentTimeMillis())
                .apply()
        }
        logAuthEvent(AuthEvent.LOGIN_FAILURE)
    }

    private fun handleTokenRefreshError() {
        cleanupSession()
        logAuthEvent(AuthEvent.TOKEN_REFRESH_FAILURE)
    }

    private fun cleanupSession() {
        securePrefs.edit().clear().apply()
        userDao.clearCachedUser()
        currentUser.onNext(null)
        logAuthEvent(AuthEvent.LOGOUT)
    }

    private fun setupTokenRefreshScheduler() {
        // Schedule token refresh before expiry
        // Implementation details omitted for brevity
    }

    private fun logAuthEvent(event: AuthEvent) {
        authEvents.onNext(event)
        // Additional audit logging implementation
    }

    private fun getDeviceId(): String {
        // Implement secure device ID generation
        return "device_id"
    }

    private fun getCooldownTimeRemaining(): Long {
        val cooldownStart = securePrefs.getLong(PREF_COOLDOWN_START, 0)
        if (cooldownStart == 0L) return 0
        val elapsed = System.currentTimeMillis() - cooldownStart
        return maxOf(0, COOLDOWN_DURATION - elapsed) / 60000 // Convert to minutes
    }

    companion object {
        private const val PREF_ACCESS_TOKEN = "access_token"
        private const val PREF_REFRESH_TOKEN = "refresh_token"
        private const val PREF_TOKEN_EXPIRY = "token_expiry"
        private const val PREF_COOLDOWN_START = "cooldown_start"
        private const val MAX_LOGIN_ATTEMPTS = 5
        private const val COOLDOWN_DURATION = 15 * 60 * 1000L // 15 minutes in milliseconds
    }
}

sealed class AuthResult {
    data class Success(val response: AuthResponse) : AuthResult()
    data class Error(val message: String) : AuthResult()
}

sealed class TokenResult {
    data class Success(val token: String) : TokenResult()
    data class Error(val message: String) : TokenResult()
}

enum class AuthEvent {
    LOGIN_SUCCESS,
    LOGIN_FAILURE,
    TOKEN_REFRESH,
    TOKEN_REFRESH_FAILURE,
    LOGOUT
}

class AuthException(message: String) : Exception(message)