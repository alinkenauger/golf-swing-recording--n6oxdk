package com.videocoach.data.api

import com.videocoach.data.api.models.ApiResponse
import com.videocoach.domain.models.User
import com.videocoach.domain.models.Video
import io.reactivex.rxjava3.core.Single // v3.1.5
import okhttp3.MultipartBody // v4.10.0
import okhttp3.RequestBody
import retrofit2.http.* // v2.9.0

/**
 * Retrofit service interface defining all API endpoints for the Video Coaching Platform.
 * Implements RESTful patterns with reactive programming support.
 */
interface ApiService {

    /**
     * Authentication endpoints
     */
    @POST("/api/v1/auth/login")
    @Headers("Content-Type: application/json")
    fun login(
        @Body request: LoginRequest
    ): Single<ApiResponse<AuthResponse>>

    @POST("/api/v1/auth/refresh")
    fun refreshToken(
        @Header("Authorization") refreshToken: String
    ): Single<ApiResponse<AuthResponse>>

    @POST("/api/v1/auth/logout")
    fun logout(
        @Header("Authorization") token: String
    ): Single<ApiResponse<Unit>>

    /**
     * User management endpoints
     */
    @GET("/api/v1/users/profile")
    fun getUserProfile(
        @Header("Authorization") token: String
    ): Single<ApiResponse<User>>

    @PUT("/api/v1/users/profile")
    @Headers("Content-Type: application/json")
    fun updateUserProfile(
        @Header("Authorization") token: String,
        @Body request: UpdateProfileRequest
    ): Single<ApiResponse<User>>

    /**
     * Video management endpoints
     */
    @Multipart
    @POST("/api/v1/videos/upload")
    fun uploadVideo(
        @Header("Authorization") token: String,
        @Part video: MultipartBody.Part,
        @Part("metadata") metadata: RequestBody
    ): Single<ApiResponse<Video>>

    @GET("/api/v1/videos/{videoId}")
    fun getVideo(
        @Header("Authorization") token: String,
        @Path("videoId") videoId: String
    ): Single<ApiResponse<Video>>

    @GET("/api/v1/videos")
    fun getVideos(
        @Header("Authorization") token: String,
        @Query("page") page: Int,
        @Query("size") size: Int,
        @Query("type") type: String? = null,
        @Query("status") status: String? = null
    ): Single<ApiResponse<PaginatedResponse<Video>>>

    /**
     * Video annotation endpoints
     */
    @POST("/api/v1/videos/{videoId}/annotations")
    @Headers("Content-Type: application/json")
    fun addVideoAnnotation(
        @Header("Authorization") token: String,
        @Path("videoId") videoId: String,
        @Body annotation: AnnotationRequest
    ): Single<ApiResponse<Annotation>>

    @GET("/api/v1/videos/{videoId}/annotations")
    fun getVideoAnnotations(
        @Header("Authorization") token: String,
        @Path("videoId") videoId: String,
        @Query("page") page: Int,
        @Query("size") size: Int
    ): Single<ApiResponse<PaginatedResponse<Annotation>>>

    /**
     * Coach profile endpoints
     */
    @GET("/api/v1/coaches/{coachId}")
    fun getCoachProfile(
        @Header("Authorization") token: String,
        @Path("coachId") coachId: String
    ): Single<ApiResponse<CoachProfile>>

    @GET("/api/v1/coaches")
    fun searchCoaches(
        @Header("Authorization") token: String,
        @Query("query") query: String,
        @Query("page") page: Int,
        @Query("size") size: Int,
        @Query("specialization") specialization: String? = null
    ): Single<ApiResponse<PaginatedResponse<CoachProfile>>>

    /**
     * Payment processing endpoints
     */
    @POST("/api/v1/payments/process")
    @Headers("Content-Type: application/json")
    fun processPayment(
        @Header("Authorization") token: String,
        @Body request: PaymentRequest
    ): Single<ApiResponse<PaymentResponse>>

    @GET("/api/v1/payments/history")
    fun getPaymentHistory(
        @Header("Authorization") token: String,
        @Query("page") page: Int,
        @Query("size") size: Int,
        @Query("status") status: String? = null
    ): Single<ApiResponse<PaginatedResponse<PaymentTransaction>>>
}

/**
 * Request/Response data classes for API endpoints
 */
data class LoginRequest(
    val email: String,
    val password: String,
    val deviceId: String
)

data class AuthResponse(
    val user: User,
    val accessToken: String,
    val refreshToken: String,
    val expiresIn: Long
)

data class UpdateProfileRequest(
    val name: String?,
    val phoneNumber: String?,
    val profileImageUrl: String?
)

data class AnnotationRequest(
    val timestamp: Long,
    val type: String,
    val data: String,
    val duration: Long? = null
)

data class CoachProfile(
    val id: String,
    val user: User,
    val specializations: List<String>,
    val experience: Int,
    val rating: Float,
    val reviewCount: Int,
    val hourlyRate: Double,
    val availability: List<AvailabilitySlot>
)

data class PaymentRequest(
    val amount: Double,
    val currency: String,
    val paymentMethodId: String,
    val serviceType: String,
    val description: String
)

data class PaymentResponse(
    val transactionId: String,
    val status: String,
    val amount: Double,
    val currency: String,
    val timestamp: Long
)

data class PaginatedResponse<T>(
    val items: List<T>,
    val totalItems: Int,
    val currentPage: Int,
    val totalPages: Int,
    val hasNext: Boolean
)

data class PaymentTransaction(
    val id: String,
    val amount: Double,
    val currency: String,
    val status: String,
    val type: String,
    val createdAt: Long
)

data class AvailabilitySlot(
    val dayOfWeek: Int,
    val startTime: String,
    val endTime: String,
    val timezone: String
)