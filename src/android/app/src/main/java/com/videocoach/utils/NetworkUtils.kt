package com.videocoach.utils

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Build
import android.util.Log
import com.videocoach.utils.Constants.API.RETRY_MAX_ATTEMPTS
import com.videocoach.utils.Constants.API.TIMEOUT_SECONDS
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import java.security.cert.CertificateException
import javax.net.ssl.SSLHandshakeException

private const val TAG = "NetworkUtils"

// Minimum bandwidth thresholds
private const val MIN_BANDWIDTH_WIFI = 5000 // 5 Mbps
private const val MIN_BANDWIDTH_CELLULAR = 1000 // 1 Mbps
private const val MAX_LATENCY_MS = 500 // 500ms maximum acceptable latency

/**
 * Network type enumeration with capability details
 */
enum class NetworkType {
    WIFI,
    CELLULAR,
    NONE
}

/**
 * Network error classification with retry guidance
 */
data class NetworkError(
    val type: ErrorType,
    val message: String,
    val isRetryable: Boolean,
    val retryDelay: Long = 0
)

/**
 * Error type classification for network issues
 */
enum class ErrorType {
    CONNECTIVITY,
    TIMEOUT,
    SECURITY,
    SERVER,
    UNKNOWN
}

/**
 * Utility object providing enhanced network-related functionality with security
 * and performance focus for the Video Coaching Platform.
 */
object NetworkUtils {

    /**
     * Checks if a secure and capable network connection is available.
     *
     * @param context Application context
     * @return Boolean indicating if a secure network is available
     */
    fun isNetworkAvailable(context: Context): Boolean {
        val connectivityManager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        
        val network = connectivityManager.activeNetwork ?: return false
        val capabilities = connectivityManager.getNetworkCapabilities(network) ?: return false

        return capabilities.run {
            when {
                hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ||
                hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> {
                    // Verify network has internet and is validated
                    hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
                    hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED) &&
                    // Ensure network meets security requirements
                    hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_RESTRICTED) &&
                    hasCapability(NetworkCapabilities.NET_CAPABILITY_TRUSTED)
                }
                else -> false
            }
        }
    }

    /**
     * Determines the current network connection type with detailed capabilities.
     *
     * @param context Application context
     * @return NetworkType enum indicating connection type
     */
    fun getNetworkType(context: Context): NetworkType {
        val connectivityManager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        
        val network = connectivityManager.activeNetwork ?: return NetworkType.NONE
        val capabilities = connectivityManager.getNetworkCapabilities(network) ?: return NetworkType.NONE

        return when {
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> {
                if (isSecureWiFiConnection(capabilities)) NetworkType.WIFI else NetworkType.NONE
            }
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> {
                if (isSecureCellularConnection(capabilities)) NetworkType.CELLULAR else NetworkType.NONE
            }
            else -> NetworkType.NONE
        }
    }

    /**
     * Checks if current network connection meets video operation requirements.
     *
     * @param context Application context
     * @return Boolean indicating if connection is suitable for video operations
     */
    fun isHighBandwidthConnection(context: Context): Boolean {
        val connectivityManager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        
        val network = connectivityManager.activeNetwork ?: return false
        val capabilities = connectivityManager.getNetworkCapabilities(network) ?: return false

        val bandwidth = capabilities.linkDownstreamBandwidthKbps
        val isWifi = capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)
        
        return when {
            isWifi -> bandwidth >= MIN_BANDWIDTH_WIFI
            capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> bandwidth >= MIN_BANDWIDTH_CELLULAR
            else -> false
        } && capabilities.run {
            hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_CONGESTED) &&
            hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
        }
    }

    /**
     * Handles network-related errors with retry mechanism and security validation.
     *
     * @param error The throwable error encountered
     * @param retryAttempt Current retry attempt number
     * @return NetworkError object with retry guidance
     */
    fun handleNetworkError(error: Throwable, retryAttempt: Int): NetworkError {
        val isRetryable = retryAttempt < RETRY_MAX_ATTEMPTS
        
        return when (error) {
            is SocketTimeoutException -> NetworkError(
                ErrorType.TIMEOUT,
                "Connection timed out. Please check your internet connection.",
                isRetryable,
                calculateBackoffDelay(retryAttempt)
            )
            is UnknownHostException -> NetworkError(
                ErrorType.CONNECTIVITY,
                "Unable to reach server. Please check your internet connection.",
                isRetryable,
                calculateBackoffDelay(retryAttempt)
            )
            is SSLHandshakeException, is CertificateException -> NetworkError(
                ErrorType.SECURITY,
                "Secure connection failed. Please ensure you're on a trusted network.",
                false
            )
            else -> NetworkError(
                ErrorType.UNKNOWN,
                "An unexpected network error occurred.",
                isRetryable,
                calculateBackoffDelay(retryAttempt)
            )
        }.also {
            Log.e(TAG, "Network error: ${it.type} - ${it.message}", error)
        }
    }

    /**
     * Verifies if WiFi connection meets security requirements.
     *
     * @param capabilities Network capabilities
     * @return Boolean indicating if WiFi connection is secure
     */
    private fun isSecureWiFiConnection(capabilities: NetworkCapabilities): Boolean {
        return capabilities.run {
            hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
            hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED) &&
            hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_RESTRICTED) &&
            hasCapability(NetworkCapabilities.NET_CAPABILITY_TRUSTED) &&
            !hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_VPN)
        }
    }

    /**
     * Verifies if cellular connection meets security requirements.
     *
     * @param capabilities Network capabilities
     * @return Boolean indicating if cellular connection is secure
     */
    private fun isSecureCellularConnection(capabilities: NetworkCapabilities): Boolean {
        return capabilities.run {
            hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
            hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED) &&
            hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_RESTRICTED) &&
            hasCapability(NetworkCapabilities.NET_CAPABILITY_TRUSTED)
        }
    }

    /**
     * Calculates exponential backoff delay for retry attempts.
     *
     * @param retryAttempt Current retry attempt number
     * @return Long representing delay in milliseconds
     */
    private fun calculateBackoffDelay(retryAttempt: Int): Long {
        return if (retryAttempt > 0) {
            val baseDelay = 1000L // 1 second base delay
            val maxDelay = TIMEOUT_SECONDS * 1000 // Convert timeout to milliseconds
            minOf(baseDelay * (1 shl retryAttempt), maxDelay)
        } else 0
    }
}