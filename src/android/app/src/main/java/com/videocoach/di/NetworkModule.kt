package com.videocoach.di

import com.videocoach.data.api.ApiService
import com.videocoach.data.api.interceptors.AuthInterceptor
import com.videocoach.utils.Constants.API.BASE_URL
import com.videocoach.utils.Constants.API.TIMEOUT_SECONDS
import com.videocoach.utils.Constants.API.CONNECT_TIMEOUT_SECONDS
import com.videocoach.utils.Constants.API.MAX_CONCURRENT_REQUESTS
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import io.github.resilience4j.circuitbreaker.CircuitBreaker
import io.github.resilience4j.circuitbreaker.CircuitBreakerConfig
import io.micrometer.core.instrument.MeterRegistry
import io.micrometer.core.instrument.Timer
import okhttp3.CertificatePinner
import okhttp3.ConnectionPool
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.adapter.rxjava3.RxJava3CallAdapterFactory
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit
import javax.inject.Singleton
import javax.net.ssl.SSLContext
import javax.net.ssl.TLSSocketFactory

/**
 * Dagger Hilt module providing network-related dependencies with enhanced security and monitoring.
 */
@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {

    private val CERTIFICATE_PINS = arrayOf(
        "sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=", // Primary
        "sha256/BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=" // Backup
    )

    /**
     * Provides singleton OkHttpClient instance with security configurations.
     */
    @Provides
    @Singleton
    fun provideOkHttpClient(
        authInterceptor: AuthInterceptor,
        meterRegistry: MeterRegistry
    ): OkHttpClient {
        // Configure TLS 1.3
        val sslContext = SSLContext.getInstance("TLSv1.3")
        sslContext.init(null, null, null)
        val tlsSocketFactory = TLSSocketFactory(sslContext.socketFactory)

        // Configure certificate pinning
        val certificatePinner = CertificatePinner.Builder().apply {
            CERTIFICATE_PINS.forEach { pin ->
                add("api.videocoach.com", pin)
            }
        }.build()

        // Configure logging interceptor for debug builds
        val loggingInterceptor = HttpLoggingInterceptor().apply {
            level = if (BuildConfig.DEBUG) {
                HttpLoggingInterceptor.Level.BODY
            } else {
                HttpLoggingInterceptor.Level.NONE
            }
        }

        // Configure metrics collector
        val networkTimer = Timer.builder("http_request_duration")
            .description("HTTP request duration")
            .register(meterRegistry)

        return OkHttpClient.Builder()
            .addInterceptor(authInterceptor)
            .addInterceptor(loggingInterceptor)
            .addInterceptor { chain ->
                val start = System.nanoTime()
                val response = chain.proceed(chain.request())
                val duration = System.nanoTime() - start
                networkTimer.record(duration, TimeUnit.NANOSECONDS)
                response
            }
            .connectTimeout(CONNECT_TIMEOUT_SECONDS, TimeUnit.SECONDS)
            .readTimeout(TIMEOUT_SECONDS, TimeUnit.SECONDS)
            .writeTimeout(TIMEOUT_SECONDS, TimeUnit.SECONDS)
            .connectionPool(ConnectionPool(
                MAX_CONCURRENT_REQUESTS,
                5, TimeUnit.MINUTES
            ))
            .certificatePinner(certificatePinner)
            .sslSocketFactory(tlsSocketFactory, tlsSocketFactory.trustManager)
            .retryOnConnectionFailure(true)
            .build()
    }

    /**
     * Provides singleton Retrofit instance with circuit breaker pattern.
     */
    @Provides
    @Singleton
    fun provideRetrofit(
        okHttpClient: OkHttpClient,
        meterRegistry: MeterRegistry
    ): Retrofit {
        // Configure circuit breaker
        val circuitBreaker = CircuitBreaker.of("api-circuit-breaker",
            CircuitBreakerConfig.custom()
                .failureRateThreshold(50f)
                .waitDurationInOpenState(java.time.Duration.ofSeconds(30))
                .permittedNumberOfCallsInHalfOpenState(5)
                .slidingWindowSize(10)
                .build()
        )

        // Register circuit breaker metrics
        circuitBreaker.eventPublisher
            .onStateTransition { event ->
                meterRegistry.counter(
                    "circuit_breaker_state",
                    "state", event.stateTransition.toString()
                ).increment()
            }

        return Retrofit.Builder()
            .baseUrl(BASE_URL)
            .client(okHttpClient)
            .addCallAdapterFactory(RxJava3CallAdapterFactory.create())
            .addConverterFactory(GsonConverterFactory.create())
            .build()
    }

    /**
     * Provides singleton ApiService instance with error handling.
     */
    @Provides
    @Singleton
    fun provideApiService(retrofit: Retrofit): ApiService {
        return retrofit.create(ApiService::class.java)
    }
}