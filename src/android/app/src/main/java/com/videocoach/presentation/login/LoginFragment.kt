package com.videocoach.presentation.login

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.view.accessibility.AccessibilityEvent
import android.view.inputmethod.EditorInfo
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.view.ViewCompat
import androidx.core.view.accessibility.AccessibilityNodeInfoCompat
import androidx.core.widget.doAfterTextChanged
import androidx.fragment.app.viewModels
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import com.videocoach.R
import com.videocoach.databinding.FragmentLoginBinding
import com.videocoach.presentation.base.BaseFragment
import com.videocoach.utils.NetworkUtils
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.launch
import javax.inject.Inject

private const val TAG = "LoginFragment"
private const val MAX_LOGIN_ATTEMPTS = 3

/**
 * Fragment handling secure login functionality with comprehensive accessibility support
 * and biometric authentication capabilities.
 */
@AndroidEntryPoint
class LoginFragment : BaseFragment<FragmentLoginBinding>(R.layout.fragment_login) {

    private val viewModel: LoginViewModel by viewModels()
    private lateinit var biometricPrompt: BiometricPrompt
    private var loginAttempts = 0
    private var isBiometricEnabled = false

    override fun getViewBinding(
        inflater: LayoutInflater,
        container: ViewGroup?
    ): FragmentLoginBinding = FragmentLoginBinding.inflate(inflater, container, false)

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        initializeView()
        setupAccessibility()
        setupBiometricAuth()
        observeState()
    }

    private fun initializeView() {
        with(binding) {
            // Email input setup
            emailInput.doAfterTextChanged { text ->
                viewModel.updateEmail(text?.toString() ?: "")
            }

            // Password input setup with IME action
            passwordInput.apply {
                doAfterTextChanged { text ->
                    viewModel.updatePassword(text?.toString() ?: "")
                }
                setOnEditorActionListener { _, actionId, _ ->
                    if (actionId == EditorInfo.IME_ACTION_DONE) {
                        handleLogin()
                        true
                    } else false
                }
            }

            // Login button setup
            loginButton.setOnClickListener {
                handleLogin()
            }

            // Social login buttons
            googleLoginButton.setOnClickListener {
                // Social login implementation pending
                showError(getString(R.string.feature_coming_soon))
            }

            // Forgot password and signup navigation
            forgotPasswordText.setOnClickListener {
                // Navigation implementation pending
                showError(getString(R.string.feature_coming_soon))
            }

            signupText.setOnClickListener {
                // Navigation implementation pending
                showError(getString(R.string.feature_coming_soon))
            }
        }
    }

    private fun setupAccessibility() {
        with(binding) {
            // Set content descriptions
            emailInput.contentDescription = getString(R.string.email_input_description)
            passwordInput.contentDescription = getString(R.string.password_input_description)
            loginButton.contentDescription = getString(R.string.login_button_description)

            // Configure touch target sizes
            val minTouchTarget = resources.getDimensionPixelSize(R.dimen.min_touch_target)
            listOf(loginButton, googleLoginButton, forgotPasswordText, signupText).forEach { view ->
                ViewCompat.setMinimumTouchTargetSize(view, minTouchTarget)
            }

            // Set up live regions for error messages
            errorText.accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_POLITE

            // Configure focus order
            ViewCompat.setAccessibilityTraversalOrder(emailInput, 1)
            ViewCompat.setAccessibilityTraversalOrder(passwordInput, 2)
            ViewCompat.setAccessibilityTraversalOrder(loginButton, 3)

            // Add custom actions
            val clearFieldsAction = AccessibilityNodeInfoCompat.AccessibilityActionCompat(
                AccessibilityNodeInfoCompat.ACTION_CLICK,
                getString(R.string.clear_fields)
            )
            ViewCompat.addAccessibilityAction(root, clearFieldsAction) { _, _ ->
                emailInput.text?.clear()
                passwordInput.text?.clear()
                true
            }
        }
    }

    private fun setupBiometricAuth() {
        val biometricManager = BiometricManager.from(requireContext())
        when (biometricManager.canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG)) {
            BiometricManager.BIOMETRIC_SUCCESS -> {
                isBiometricEnabled = true
                binding.biometricLoginButton.apply {
                    visibility = View.VISIBLE
                    setOnClickListener { showBiometricPrompt() }
                }
                
                biometricPrompt = BiometricPrompt(
                    this,
                    object : BiometricPrompt.AuthenticationCallback() {
                        override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                            viewModel.biometricLogin()
                        }

                        override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                            handleError(AuthError(errString.toString()))
                        }
                    }
                )
            }
            else -> {
                binding.biometricLoginButton.visibility = View.GONE
            }
        }
    }

    private fun showBiometricPrompt() {
        val promptInfo = BiometricPrompt.PromptInfo.Builder()
            .setTitle(getString(R.string.biometric_prompt_title))
            .setSubtitle(getString(R.string.biometric_prompt_subtitle))
            .setNegativeButtonText(getString(R.string.biometric_prompt_negative))
            .setConfirmationRequired(true)
            .build()

        biometricPrompt.authenticate(promptInfo)
    }

    private fun observeState() {
        viewLifecycleOwner.lifecycleScope.launch {
            viewLifecycleOwner.repeatOnLifecycle(Lifecycle.State.STARTED) {
                launch {
                    viewModel.user.collect { user ->
                        user?.let {
                            // Navigate to main screen
                            // Implementation pending
                        }
                    }
                }
            }
        }
    }

    private fun handleLogin() {
        if (!NetworkUtils.isNetworkAvailable(requireContext())) {
            showError(getString(R.string.no_network_error))
            return
        }

        if (loginAttempts >= MAX_LOGIN_ATTEMPTS) {
            showError(getString(R.string.too_many_attempts))
            return
        }

        hideKeyboard()
        viewModel.login()
        loginAttempts++
    }

    private fun handleError(error: AuthError) {
        val message = when (error.type) {
            AuthErrorType.INVALID_CREDENTIALS -> getString(R.string.invalid_credentials)
            AuthErrorType.NETWORK -> getString(R.string.network_error)
            AuthErrorType.SERVER -> getString(R.string.server_error)
            else -> error.message
        }

        showError(message)
        announceForAccessibility(message)
    }

    private fun hideKeyboard() {
        view?.clearFocus()
        val imm = requireContext().getSystemService(android.content.Context.INPUT_METHOD_SERVICE) as android.view.inputmethod.InputMethodManager
        imm.hideSoftInputFromWindow(view?.windowToken, 0)
    }

    companion object {
        fun newInstance() = LoginFragment()
    }
}

data class AuthError(
    val message: String,
    val type: AuthErrorType = AuthErrorType.UNKNOWN
)

enum class AuthErrorType {
    INVALID_CREDENTIALS,
    NETWORK,
    SERVER,
    UNKNOWN
}