package com.videocoach.domain.usecases.auth

import android.util.Patterns
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import com.videocoach.data.repositories.AuthRepository
import com.videocoach.domain.models.User
import com.videocoach.domain.models.UserEmail
import dagger.hilt.android.scopes.ViewModelScoped
import io.reactivex.rxjava3.core.Single
import java.util.concurrent.atomic.AtomicInteger
import java.util.regex.Pattern
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Use case that implements secure authentication business logic for the Video Coaching Platform.
 * Handles email/password validation, biometric authentication, rate limiting, and security checks.
 *
 * @property authRepository Repository for authentication operations
 * @property biometricManager Manager for biometric authentication
 */
@Singleton
class LoginUseCase @Inject constructor(
    private val authRepository: AuthRepository,
    private val biometricManager: BiometricManager
) {
    private val loginAttempts = AtomicInteger(0)

    companion object {
        private val EMAIL_PATTERN = Pattern.compile(
            "[a-zA-Z0-9+._%\\-]{1,256}" +
            "@" +
            "[a-zA-Z0-9][a-zA-Z0-9\\-]{0,64}" +
            "(" +
            "\\." +
            "[a-zA-Z0-9][a-zA-Z0-9\\-]{0,25}" +
            ")+"
        )
        private const val MAX_LOGIN_ATTEMPTS = 5
        private const val MIN_PASSWORD_LENGTH = User.MINIMUM_PASSWORD_LENGTH
        private const val PASSWORD_PATTERN = "^(?=.*[0-9])(?=.*[a-z])(?=.*[A-Z])(?=.*[@#$%^&+=])(?=\\S+$).{12,}$"
    }

    /**
     * Executes the login use case with comprehensive security checks.
     *
     * @param email User's email address
     * @param password User's password
     * @param useBiometric Whether to use biometric authentication
     * @return Single<User> Observable stream of authenticated user
     */
    fun execute(
        email: String,
        password: String,
        useBiometric: Boolean = false
    ): Single<User> {
        return Single.create { emitter ->
            try {
                // Validate credentials format
                val validationResult = validateCredentials(email, password)
                if (!validationResult.isValid) {
                    emitter.onError(SecurityException(validationResult.errorMessage))
                    return@create
                }

                // Check rate limiting
                if (loginAttempts.get() >= MAX_LOGIN_ATTEMPTS) {
                    emitter.onError(SecurityException("Too many login attempts. Please try again later."))
                    return@create
                }

                // Handle biometric authentication if enabled
                if (useBiometric) {
                    when (biometricManager.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG)) {
                        BiometricManager.BIOMETRIC_SUCCESS -> {
                            // Proceed with biometric auth
                            proceedWithBiometricAuth(email, password, emitter)
                        }
                        else -> {
                            emitter.onError(SecurityException("Biometric authentication not available"))
                            return@create
                        }
                    }
                } else {
                    // Proceed with standard login
                    proceedWithStandardLogin(email, password, emitter)
                }
            } catch (e: Exception) {
                handleAuthenticationError(e, emitter)
            }
        }
    }

    /**
     * Validates login credentials with enhanced security checks.
     *
     * @param email User's email
     * @param password User's password
     * @return ValidationResult with validation status and error message
     */
    private fun validateCredentials(email: String, password: String): ValidationResult {
        // Validate email format
        if (!EMAIL_PATTERN.matcher(email).matches()) {
            return ValidationResult(false, "Invalid email format")
        }

        // Validate password complexity
        if (password.length < MIN_PASSWORD_LENGTH) {
            return ValidationResult(
                false,
                "Password must be at least $MIN_PASSWORD_LENGTH characters long"
            )
        }

        if (!Pattern.compile(PASSWORD_PATTERN).matcher(password).matches()) {
            return ValidationResult(
                false,
                "Password must contain at least one uppercase letter, one lowercase letter, " +
                "one number and one special character"
            )
        }

        return ValidationResult(true)
    }

    /**
     * Handles standard email/password login flow.
     */
    private fun proceedWithStandardLogin(
        email: String,
        password: String,
        emitter: Single.Emitter<User>
    ) {
        authRepository.login(email, password)
            .subscribe({ result ->
                when (result) {
                    is AuthRepository.AuthResult.Success -> {
                        loginAttempts.set(0)
                        emitter.onSuccess(result.response.user)
                    }
                    is AuthRepository.AuthResult.Error -> {
                        handleAuthenticationError(
                            SecurityException(result.message),
                            emitter
                        )
                    }
                }
            }, { error ->
                handleAuthenticationError(error, emitter)
            })
    }

    /**
     * Handles biometric authentication flow.
     */
    private fun proceedWithBiometricAuth(
        email: String,
        password: String,
        emitter: Single.Emitter<User>
    ) {
        // First verify biometric, then proceed with login
        authRepository.validateDeviceSecurity()
            .flatMap { isSecure ->
                if (isSecure) {
                    authRepository.login(email, password, true)
                } else {
                    Single.error(SecurityException("Device security validation failed"))
                }
            }
            .subscribe({ result ->
                when (result) {
                    is AuthRepository.AuthResult.Success -> {
                        loginAttempts.set(0)
                        emitter.onSuccess(result.response.user)
                    }
                    is AuthRepository.AuthResult.Error -> {
                        handleAuthenticationError(
                            SecurityException(result.message),
                            emitter
                        )
                    }
                }
            }, { error ->
                handleAuthenticationError(error, emitter)
            })
    }

    /**
     * Handles authentication errors with retry logic and security measures.
     */
    private fun handleAuthenticationError(
        error: Throwable,
        emitter: Single.Emitter<User>
    ) {
        loginAttempts.incrementAndGet()
        
        val errorMessage = when {
            error is SecurityException -> error.message
            loginAttempts.get() >= MAX_LOGIN_ATTEMPTS -> 
                "Too many failed attempts. Please try again later."
            else -> "Authentication failed. Please try again."
        }
        
        emitter.onError(SecurityException(errorMessage ?: "Unknown error occurred"))
    }
}

/**
 * Data class representing credential validation result.
 */
private data class ValidationResult(
    val isValid: Boolean,
    val errorMessage: String? = null
)