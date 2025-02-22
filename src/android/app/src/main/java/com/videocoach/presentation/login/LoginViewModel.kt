package com.videocoach.presentation.login

import androidx.lifecycle.viewModelScope
import com.videocoach.domain.models.User
import com.videocoach.domain.models.UserEmail
import com.videocoach.domain.usecases.auth.LoginUseCase
import com.videocoach.presentation.base.BaseViewModel
import com.videocoach.utils.Constants
import dagger.hilt.android.lifecycle.HiltViewModel
import io.reactivex.rxjava3.disposables.CompositeDisposable
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.util.regex.Pattern
import javax.inject.Inject

/**
 * ViewModel handling login screen business logic with secure state management
 * and comprehensive error handling for the Video Coaching Platform.
 *
 * @property loginUseCase Use case handling secure authentication
 */
@HiltViewModel
class LoginViewModel @Inject constructor(
    private val loginUseCase: LoginUseCase
) : BaseViewModel() {

    // Email state management
    private val _email = MutableStateFlow("")
    val email: StateFlow<String> = _email.asStateFlow()

    // Password state management with secure handling
    private val _password = MutableStateFlow("")
    val password: StateFlow<String> = _password.asStateFlow()

    // User state management
    private val _user = MutableStateFlow<User?>(null)
    val user: StateFlow<User?> = _user.asStateFlow()

    // Disposable for managing RxJava subscriptions
    private val disposables = CompositeDisposable()

    // Email validation pattern
    private val emailPattern = Pattern.compile(
        "[a-zA-Z0-9+._%\\-]{1,256}" +
        "@" +
        "[a-zA-Z0-9][a-zA-Z0-9\\-]{0,64}" +
        "(" +
        "\\." +
        "[a-zA-Z0-9][a-zA-Z0-9\\-]{0,25}" +
        ")+"
    )

    /**
     * Updates email input with validation
     *
     * @param email New email value
     */
    fun updateEmail(email: String) {
        val trimmedEmail = email.trim()
        if (trimmedEmail.length <= 256) { // Prevent overflow attacks
            _email.value = trimmedEmail
            clearError()
        }
    }

    /**
     * Updates password input with secure handling
     *
     * @param password New password value
     */
    fun updatePassword(password: String) {
        if (password.length <= Constants.AUTH.MAX_PASSWORD_LENGTH) { // Prevent overflow attacks
            _password.value = password
            clearError()
        }
    }

    /**
     * Executes login with current credentials and comprehensive error handling
     */
    fun login() {
        val currentEmail = email.value
        val currentPassword = password.value

        if (!validateInputs()) {
            return
        }

        launchWithLoading {
            loginUseCase.execute(
                email = currentEmail,
                password = currentPassword,
                useBiometric = false // Biometric auth handled separately
            ).subscribe(
                { result ->
                    _user.value = result
                    clearError()
                },
                { error ->
                    handleError(error)
                    _password.value = "" // Clear password on error for security
                }
            ).also { disposables.add(it) }
        }
    }

    /**
     * Validates login form inputs with security checks
     *
     * @return Boolean indicating if inputs are valid
     */
    private fun validateInputs(): Boolean {
        val currentEmail = email.value
        val currentPassword = password.value

        return when {
            currentEmail.isEmpty() -> {
                handleError(IllegalArgumentException("Email is required"))
                false
            }
            !emailPattern.matcher(currentEmail).matches() -> {
                handleError(IllegalArgumentException("Invalid email format"))
                false
            }
            currentPassword.isEmpty() -> {
                handleError(IllegalArgumentException("Password is required"))
                false
            }
            currentPassword.length < Constants.AUTH.MIN_PASSWORD_LENGTH -> {
                handleError(IllegalArgumentException("Password must be at least ${Constants.AUTH.MIN_PASSWORD_LENGTH} characters"))
                false
            }
            !isPasswordComplex(currentPassword) -> {
                handleError(IllegalArgumentException("Password must contain uppercase, lowercase, number and special character"))
                false
            }
            else -> true
        }
    }

    /**
     * Validates password complexity requirements
     *
     * @param password Password to validate
     * @return Boolean indicating if password meets complexity requirements
     */
    private fun isPasswordComplex(password: String): Boolean {
        return password.matches(Regex("^(?=.*[0-9])(?=.*[a-z])(?=.*[A-Z])(?=.*[@#\$%^&+=])(?=\\S+\$).{${Constants.AUTH.MIN_PASSWORD_LENGTH},}\$"))
    }

    /**
     * Cleans up resources when ViewModel is cleared
     */
    override fun onCleared() {
        super.onCleared()
        disposables.clear()
        // Clear sensitive data
        _password.value = ""
        _user.value = null
    }
}