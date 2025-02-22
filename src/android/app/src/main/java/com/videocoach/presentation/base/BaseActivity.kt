package com.videocoach.presentation.base

import android.os.Bundle
import android.view.HapticFeedbackConstants
import android.view.accessibility.AccessibilityManager
import androidx.appcompat.app.AppCompatActivity // v1.6.1
import androidx.lifecycle.LifecycleOwner // v2.6.1
import androidx.lifecycle.lifecycleScope // v2.6.1
import com.google.android.material.dialog.MaterialAlertDialogBuilder // v1.9.0
import com.videocoach.utils.NetworkUtils
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import android.util.Log

private const val TAG = "BaseActivity"
private const val DIALOG_STATE_KEY = "dialog_state"
private const val NETWORK_CHECK_INTERVAL = 30_000L // 30 seconds

/**
 * Abstract base activity providing comprehensive foundation functionality for all activities
 * in the Video Coach application. Implements enhanced accessibility features, robust error
 * handling, and advanced network state management.
 */
abstract class BaseActivity : AppCompatActivity(), LifecycleOwner {

    private var _progressDialog: MaterialAlertDialogBuilder? = null
    private var _errorDialog: MaterialAlertDialogBuilder? = null
    private var _networkMonitorJob: Job? = null
    private var _accessibilityManager: AccessibilityManager? = null
    
    private val _networkState = MutableStateFlow<NetworkState>(NetworkState.Unknown)
    val networkState: StateFlow<NetworkState> = _networkState

    /**
     * Data class representing comprehensive network state information
     */
    data class NetworkState(
        val isAvailable: Boolean,
        val type: NetworkUtils.NetworkType,
        val isHighBandwidth: Boolean,
        val error: NetworkUtils.NetworkError?
    ) {
        companion object {
            val Unknown = NetworkState(
                isAvailable = false,
                type = NetworkUtils.NetworkType.NONE,
                isHighBandwidth = false,
                error = null
            )
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Initialize accessibility manager
        _accessibilityManager = getSystemService(ACCESSIBILITY_SERVICE) as AccessibilityManager
        
        // Restore dialog states if needed
        savedInstanceState?.let { restoreDialogStates(it) }
        
        // Initialize network monitoring
        startNetworkMonitoring()
        
        // Initialize view - to be implemented by child classes
        initializeView()
    }

    /**
     * Abstract method for view initialization to be implemented by child activities
     */
    abstract fun initializeView()

    /**
     * Shows an enhanced loading dialog with accessibility support
     */
    protected fun showLoading() {
        if (_progressDialog == null) {
            _progressDialog = MaterialAlertDialogBuilder(this).apply {
                setTitle("Loading")
                setCancelable(false)
                setView(layoutInflater.inflate(android.R.layout.progress_bar_material, null))
                
                // Enhance accessibility
                if (_accessibilityManager?.isEnabled == true) {
                    setAccessibilityPaneTitle("Loading in progress")
                    window?.decorView?.announceForAccessibility("Loading started")
                }
            }
        }
        
        // Provide haptic feedback
        window?.decorView?.performHapticFeedback(HapticFeedbackConstants.CONTEXT_CLICK)
        
        _progressDialog?.show()
    }

    /**
     * Shows an enhanced error dialog with accessibility features
     */
    protected fun showError(errorState: NetworkUtils.NetworkError) {
        _errorDialog = MaterialAlertDialogBuilder(this).apply {
            setTitle("Error")
            setMessage(errorState.message)
            setCancelable(true)
            
            // Configure based on error type
            when (errorState.type) {
                NetworkUtils.ErrorType.CONNECTIVITY -> {
                    setIcon(android.R.drawable.ic_dialog_alert)
                    setPositiveButton("Retry") { _, _ -> 
                        checkNetworkConnectivity()
                    }
                }
                NetworkUtils.ErrorType.SECURITY -> {
                    setIcon(android.R.drawable.ic_dialog_alert)
                    setPositiveButton("Settings") { _, _ ->
                        // Launch network settings
                        startActivity(android.provider.Settings.ACTION_WIRELESS_SETTINGS)
                    }
                }
                else -> {
                    setPositiveButton("OK") { dialog, _ -> dialog.dismiss() }
                }
            }
            
            // Enhance accessibility
            if (_accessibilityManager?.isEnabled == true) {
                setAccessibilityPaneTitle("Error message")
                window?.decorView?.announceForAccessibility("Error: ${errorState.message}")
            }
        }
        
        // Provide error haptic feedback
        window?.decorView?.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)
        
        _errorDialog?.show()
        
        // Log error for analytics
        Log.e(TAG, "Error shown: ${errorState.type} - ${errorState.message}")
    }

    /**
     * Performs comprehensive network connectivity check with quality monitoring
     */
    protected fun checkNetworkConnectivity() {
        lifecycleScope.launch {
            val isAvailable = NetworkUtils.isNetworkAvailable(applicationContext)
            val networkType = NetworkUtils.getNetworkType(applicationContext)
            val isHighBandwidth = NetworkUtils.isHighBandwidthConnection(applicationContext)
            
            _networkState.value = NetworkState(
                isAvailable = isAvailable,
                type = networkType,
                isHighBandwidth = isHighBandwidth,
                error = if (!isAvailable) {
                    NetworkUtils.handleNetworkError(
                        Exception("Network unavailable"),
                        0
                    )
                } else null
            )
            
            // Update UI based on network state
            if (!isAvailable) {
                showError(NetworkUtils.handleNetworkError(
                    Exception("Network unavailable"),
                    0
                ))
            }
        }
    }

    /**
     * Starts periodic network monitoring
     */
    private fun startNetworkMonitoring() {
        _networkMonitorJob?.cancel()
        _networkMonitorJob = lifecycleScope.launch {
            while (true) {
                checkNetworkConnectivity()
                delay(NETWORK_CHECK_INTERVAL)
            }
        }
    }

    /**
     * Restores dialog states after configuration changes
     */
    private fun restoreDialogStates(savedInstanceState: Bundle) {
        savedInstanceState.getBoolean(DIALOG_STATE_KEY)?.let { isShowingDialog ->
            if (isShowingDialog) {
                showLoading()
            }
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        
        // Save dialog states
        outState.putBoolean(DIALOG_STATE_KEY, _progressDialog != null)
    }

    override fun onDestroy() {
        super.onDestroy()
        
        // Cleanup resources
        _networkMonitorJob?.cancel()
        _progressDialog = null
        _errorDialog = null
        _accessibilityManager = null
    }
}