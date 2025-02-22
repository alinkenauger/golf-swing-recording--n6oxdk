package com.videocoach.data.api.interceptors

import com.jakewharton.timber.Timber
import com.videocoach.utils.Constants.AUTH.TOKEN_HEADER
import com.videocoach.utils.Constants.AUTH.TOKEN_PREFIX
import com.videocoach.utils.Constants.API.TIMEOUT_SECONDS
import com.videocoach.utils.Constants.API.RETRY_MAX_ATTEMPTS
import okhttp3.Interceptor
import okhttp3.Response
import okhttp3.CertificatePinner
import okhttp3.Request
import java.io.IOException
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Thread-safe OkHttp interceptor that manages authentication tokens and secure API communication.
 * Implements token refresh, retry mechanisms, and security monitoring for the Video Coaching Platform.
 *
 * @property tokenProvider Provider for managing authentication tokens
 * @property certificatePinner SSL certificate pinning implementation
 */
@Singleton
class AuthInterceptor @Inject constructor(
    private val tokenProvider: TokenProvider,
    private val certificatePinner: CertificatePinner
) : Interceptor {

    private val retryCount = AtomicInteger(0)
    private val backoff = ExponentialBackoff(
        baseDelayMs = 1000,
        maxDelayMs = 10000,
        maxAttempts = RETRY_MAX_ATTEMPTS
    )

    /**
     * Intercepts HTTP requests to handle authentication and security.
     * Implements token refresh, request signing, and security monitoring.
     *
     * @param chain The interceptor chain
     * @return Modified HTTP response with proper authentication
     * @throws IOException When network or security errors occur
     */
    @Synchronized
    @Throws(IOException::class)
    override fun intercept(chain: Interceptor.Chain): Response {
        val originalRequest = chain.request()
        
        try {
            // Skip authentication for token refresh endpoint
            if (isTokenRefreshEndpoint(originalRequest)) {
                return chain.proceed(originalRequest)
            }

            // Add authentication and security headers
            val authenticatedRequest = addSecurityHeaders(originalRequest)
            
            // Proceed with the authenticated request
            var response = chain.proceed(authenticatedRequest)

            // Handle authentication errors
            when (response.code) {
                401 -> {
                    response.close()
                    return handleTokenRefresh(chain)
                }
                403 -> {
                    Timber.w("Access forbidden: ${originalRequest.url}")
                    tokenProvider.clearTokens()
                }
            }

            return response
        } catch (e: Exception) {
            Timber.e(e, "Error during request interception")
            throw e
        }
    }

    /**
     * Adds security headers including authentication token and request signing.
     *
     * @param request Original HTTP request
     * @return Modified request with security headers
     */
    private fun addSecurityHeaders(request: Request): Request {
        return request.newBuilder().apply {
            // Add authentication token
            tokenProvider.getAccessToken()?.let { token ->
                header(TOKEN_HEADER, "$TOKEN_PREFIX$token")
            }

            // Add request timestamp for replay protection
            header("X-Request-Timestamp", System.currentTimeMillis().toString())
            
            // Add request signature
            header("X-Request-Signature", generateRequestSignature(request))
            
            // Set timeouts
            timeout(TIMEOUT_SECONDS, TimeUnit.SECONDS)
        }.build()
    }

    /**
     * Handles token refresh process with retry mechanism.
     *
     * @param chain The interceptor chain
     * @return New response with refreshed token
     * @throws TokenRefreshException When token refresh fails
     */
    @Synchronized
    @Throws(TokenRefreshException::class)
    private fun handleTokenRefresh(chain: Interceptor.Chain): Response {
        val currentRetry = retryCount.getAndIncrement()
        
        try {
            if (currentRetry >= RETRY_MAX_ATTEMPTS) {
                throw TokenRefreshException("Max retry attempts exceeded")
            }

            // Apply exponential backoff
            backoff.delay(currentRetry)

            // Attempt token refresh
            val refreshed = tokenProvider.refreshToken()
            if (!refreshed) {
                throw TokenRefreshException("Token refresh failed")
            }

            // Retry original request with new token
            val newRequest = addSecurityHeaders(chain.request())
            return chain.proceed(newRequest)
        } catch (e: Exception) {
            Timber.e(e, "Token refresh failed")
            throw TokenRefreshException("Token refresh failed", e)
        } finally {
            retryCount.set(0)
        }
    }

    /**
     * Generates cryptographic signature for request validation.
     *
     * @param request HTTP request to sign
     * @return Cryptographic signature
     */
    private fun generateRequestSignature(request: Request): String {
        // Implementation of request signing algorithm
        val timestamp = System.currentTimeMillis()
        val method = request.method
        val path = request.url.encodedPath
        val body = request.body?.toString() ?: ""
        
        return SecurityUtils.signRequest(method, path, body, timestamp)
    }

    /**
     * Checks if the request is for token refresh endpoint.
     *
     * @param request HTTP request to check
     * @return True if request is for token refresh
     */
    private fun isTokenRefreshEndpoint(request: Request): Boolean {
        return request.url.encodedPath.endsWith("/auth/refresh")
    }

    /**
     * Custom exception for token refresh failures.
     */
    private class TokenRefreshException : Exception {
        constructor(message: String) : super(message)
        constructor(message: String, cause: Throwable) : super(message, cause)
    }

    /**
     * Implements exponential backoff strategy for retries.
     */
    private class ExponentialBackoff(
        private val baseDelayMs: Long,
        private val maxDelayMs: Long,
        private val maxAttempts: Int
    ) {
        fun delay(attempt: Int) {
            if (attempt >= maxAttempts) return
            
            val delayMs = (baseDelayMs * Math.pow(2.0, attempt.toDouble()))
                .toLong()
                .coerceAtMost(maxDelayMs)
            
            Thread.sleep(delayMs)
        }
    }
}