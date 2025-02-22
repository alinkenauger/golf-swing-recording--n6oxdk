package com.videocoach.di

import com.videocoach.data.api.ApiService
import com.videocoach.data.database.dao.VideoDao
import com.videocoach.data.repositories.AuthRepository
import com.videocoach.data.repositories.VideoRepository
import com.videocoach.data.repositories.CoachRepository
import dagger.Module // v2.48
import dagger.Provides // v2.48
import dagger.hilt.InstallIn // v2.48
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton // v1

/**
 * Dagger Hilt module that provides dependency injection bindings for all repositories
 * in the Video Coaching Platform with enhanced validation, monitoring, and security features.
 */
@Module
@InstallIn(SingletonComponent::class)
object RepositoryModule {

    /**
     * Provides singleton instance of AuthRepository with enhanced security validation
     * and session management capabilities.
     *
     * @param apiService API service for authentication endpoints
     * @param userDao Local database access for user data
     * @param context Application context for secure preferences
     * @return Singleton AuthRepository instance
     */
    @Provides
    @Singleton
    fun provideAuthRepository(
        apiService: ApiService,
        userDao: UserDao,
        @ApplicationContext context: Context
    ): AuthRepository {
        return AuthRepository(
            apiService = apiService,
            userDao = userDao,
            context = context
        )
    }

    /**
     * Provides singleton instance of VideoRepository with caching, offline support,
     * and performance monitoring.
     *
     * @param videoDao Local database access for video data
     * @param apiService API service for video operations
     * @return Singleton VideoRepository instance
     */
    @Provides
    @Singleton
    fun provideVideoRepository(
        videoDao: VideoDao,
        apiService: ApiService
    ): VideoRepository {
        return VideoRepository(
            videoDao = videoDao,
            apiService = apiService
        )
    }

    /**
     * Provides singleton instance of CoachRepository with analytics tracking
     * and background check integration.
     *
     * @param apiService API service for coach operations
     * @param analyticsManager Analytics tracking manager
     * @param coachDatabase Local database for coach data
     * @return Singleton CoachRepository instance
     */
    @Provides
    @Singleton
    fun provideCoachRepository(
        apiService: ApiService,
        analyticsManager: AnalyticsManager,
        @DatabaseModule.CoachDatabase coachDatabase: CoachDatabase
    ): CoachRepository {
        return CoachRepository(
            apiService = apiService,
            analyticsManager = analyticsManager,
            coachDatabase = coachDatabase
        )
    }
}