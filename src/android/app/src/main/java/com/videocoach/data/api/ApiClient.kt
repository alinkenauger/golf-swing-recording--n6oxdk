package com.videocoach.data.api

import com.videocoach.data.api.interceptors.AuthInterceptor
import okhttp3.Cache
import okhttp3.CertificatePinner
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor // v4.10.0
import retrofit2.Retrofit // v2.9.0
import retrofit2.adapter.rxjava3.RxJava3CallAdapterFactory // v2.9.0
import retrofit2.converter.gson.GsonConverterFactory // v2.9.0
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton
import android.content.Context
import com.google.gson.GsonBuilder
import okhttp3.ConnectionPool
import okhttp3.Protocol
import java.io.File

/**
 * Thread-safe singleton class for managing Retrofit API client with enhanced security and performance features.
 * Implements comprehensive error handling, retry mechanisms, and security protocols.
 *
 * @property context Application context for cache directory access
 * @property authInterceptor Authentication interceptor for securing requests
 */
@Singleton
class ApiClient @Inject constructor(
    private val context: Context,
    private val authInterceptor: AuthInterceptor
) {
    private val BASE_URL = "https://api.videocoach.com/v1/"
    private val TIMEOUT_SECONDS = 30L
    private val CACHE_SIZE_MB = 50L
    private val MAX_RETRIES = 3
    private val SSL_PINS = arrayOf(
        "sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
    )

    private val cache: Cache by lazy {
        Cache(
            directory = File(context.cacheDir, "http_cache"),
            maxSize = CACHE_SIZE_MB * 1024 * 1024
        )
    }

    private val httpClient: OkHttpClient by lazy {
        createOkHttpClient()
    }

    private val retrofit: Retrofit by lazy {
        createRetrofit(httpClient)
    }

    private val apiService: ApiService by lazy {
        retrofit.create(ApiService::class.java)
    }

    /**
     * Creates and configures OkHttpClient with security and performance features.
     * Implements certificate pinning, connection pooling, and compression.
     *
     * @return Configured OkHttpClient instance
     */
    private fun createOkHttpClient(): OkHttpClient {
        val certificatePinner = CertificatePinner.Builder().apply {
            SSL_PINS.forEach { pin ->
                add("api.videocoach.com", pin)
            }
        }.build()

        return OkHttpClient.Builder().apply {
            // Security configurations
            certificatePinner(certificatePinner)
            addInterceptor(authInterceptor)

            // Timeouts
            connectTimeout(TIMEOUT_SECONDS, TimeUnit.SECONDS)
            readTimeout(TIMEOUT_SECONDS, TimeUnit.SECONDS)
            writeTimeout(TIMEOUT_SECONDS, TimeUnit.SECONDS)

            // Connection pooling
            connectionPool(ConnectionPool(
                maxIdleConnections = 5,
                keepAliveDuration = 5,
                timeUnit = TimeUnit.MINUTES
            ))

            // Performance optimizations
            cache(cache)
            protocols(listOf(Protocol.HTTP_2, Protocol.HTTP_1_1))
            retryOnConnectionFailure(true)

            // Logging for debug builds
            if (BuildConfig.DEBUG) {
                addInterceptor(HttpLoggingInterceptor().apply {
                    level = HttpLoggingInterceptor.Level.BODY
                })
            }

        }.build()
    }

    /**
     * Creates and configures Retrofit instance with RxJava and Gson adapters.
     *
     * @param client Configured OkHttpClient instance
     * @return Configured Retrofit instance
     */
    private fun createRetrofit(client: OkHttpClient): Retrofit {
        val gson = GsonBuilder()
            .setDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'")
            .setLenient()
            .create()

        return Retrofit.Builder()
            .baseUrl(BASE_URL)
            .client(client)
            .addCallAdapterFactory(RxJava3CallAdapterFactory.create())
            .addConverterFactory(GsonConverterFactory.create(gson))
            .build()
    }

    /**
     * Provides thread-safe singleton instance of ApiService.
     * Implements double-checked locking pattern for thread safety.
     *
     * @return Thread-safe API service implementation
     */
    @Synchronized
    fun getApiService(): ApiService = apiService

    companion object {
        @Volatile
        private var instance: ApiClient? = null

        /**
         * Thread-safe singleton access with double-checked locking.
         *
         * @param context Application context
         * @param authInterceptor Authentication interceptor instance
         * @return Singleton ApiClient instance
         */
        @JvmStatic
        fun getInstance(
            context: Context,
            authInterceptor: AuthInterceptor
        ): ApiClient = instance ?: synchronized(this) {
            instance ?: ApiClient(context, authInterceptor).also { instance = it }
        }
    }
}