package com.videocoach.data.api.models

import com.google.gson.annotations.SerializedName // v2.10.x

/**
 * Generic wrapper class for all API responses in the Video Coaching Platform.
 * Provides type-safe access to response data with standardized error handling.
 *
 * @param T The type of data contained in the response
 * @property success Indicates if the API call was successful
 * @property data The actual response data, null if request failed
 * @property message Optional message providing additional context (especially for errors)
 * @property code Optional status code for the response
 */
data class ApiResponse<T>(
    @SerializedName("success")
    val success: Boolean,
    
    @SerializedName("data")
    val data: T?,
    
    @SerializedName("message")
    val message: String?,
    
    @SerializedName("code")
    val code: Int?
) {
    /**
     * Indicates whether the response contains valid data
     */
    val hasData: Boolean
        get() = data != null

    /**
     * Indicates whether the response contains an error
     */
    val hasError: Boolean
        get() = !success || message != null

    /**
     * Checks if the response was successful and contains valid data
     *
     * @return true if the response is successful and contains non-null data
     */
    fun isSuccessful(): Boolean {
        return success && data != null
    }

    /**
     * Safely retrieves the response data or returns null if any error occurred
     *
     * @return Response data if successful, null otherwise
     */
    fun getOrNull(): T? {
        return if (isSuccessful()) data else null
    }

    companion object {
        /**
         * Creates a successful response wrapper with the provided data
         *
         * @param data The data to wrap in the response
         * @return A successful ApiResponse containing the data
         */
        fun <T> success(data: T): ApiResponse<T> {
            return ApiResponse(
                success = true,
                data = data,
                message = null,
                code = null
            )
        }

        /**
         * Creates an error response wrapper with the provided message and code
         *
         * @param message The error message
         * @param code The error code
         * @return An error ApiResponse with the specified details
         */
        fun <T> error(message: String, code: Int): ApiResponse<T> {
            return ApiResponse(
                success = false,
                data = null,
                message = message,
                code = code
            )
        }
    }
}

/**
 * Data class representing standardized error details for API responses
 *
 * @property code The error code
 * @property message The error message
 */
data class ApiError(
    @SerializedName("code")
    val code: Int,
    
    @SerializedName("message")
    val message: String
)