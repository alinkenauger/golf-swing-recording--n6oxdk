package com.videocoach.data.repositories

import com.videocoach.data.api.ApiService
import com.videocoach.data.api.models.ApiResponse
import com.videocoach.domain.models.Coach
import io.reactivex.rxjava3.core.Single // v3.1.5
import io.reactivex.rxjava3.disposables.CompositeDisposable
import io.reactivex.rxjava3.schedulers.Schedulers
import javax.inject.Inject // v1
import javax.inject.Singleton
import timber.log.Timber // v5.0.1
import androidx.room.* // v2.5.0
import java.util.concurrent.TimeUnit

/**
 * Repository class that handles all coach-related data operations with support for
 * caching, analytics, and background check integration.
 */
@Singleton
class CoachRepository @Inject constructor(
    private val apiService: ApiService,
    private val analyticsManager: AnalyticsManager,
    @DatabaseModule.CoachDatabase private val coachDatabase: CoachDatabase
) {
    private val disposables = CompositeDisposable()
    private val cacheTimeoutMs = TimeUnit.MINUTES.toMillis(15)
    private val coachCache = mutableMapOf<String, CachedCoach>()

    private data class CachedCoach(
        val coach: Coach,
        val timestamp: Long
    )

    /**
     * Retrieves a coach profile with caching and error handling
     * @param coachId Unique identifier of the coach
     * @return Observable coach profile data
     */
    fun getCoachProfile(coachId: String): Single<Coach> {
        return Single.defer {
            // Check cache first
            coachCache[coachId]?.let { cached ->
                if (System.currentTimeMillis() - cached.timestamp < cacheTimeoutMs) {
                    Timber.d("Returning cached coach profile for $coachId")
                    return@defer Single.just(cached.coach)
                }
            }

            // Cache miss or expired, fetch from API
            apiService.getCoachProfile(coachId)
                .subscribeOn(Schedulers.io())
                .map { response ->
                    if (!response.isSuccessful() || response.data == null) {
                        throw IllegalStateException(response.message ?: "Failed to fetch coach profile")
                    }
                    response.data
                }
                .doOnSuccess { coach ->
                    // Update cache
                    coachCache[coachId] = CachedCoach(coach, System.currentTimeMillis())
                    // Store in local database
                    coachDatabase.coachDao().insertCoach(coach)
                }
                .doOnError { error ->
                    Timber.e(error, "Error fetching coach profile")
                    analyticsManager.trackError("coach_profile_fetch_error", mapOf(
                        "coach_id" to coachId,
                        "error" to error.message
                    ))
                }
                .onErrorResumeNext { error ->
                    // Try to fetch from local database on API error
                    coachDatabase.coachDao().getCoachById(coachId)
                        ?.let { Single.just(it) }
                        ?: Single.error(error)
                }
        }
    }

    /**
     * Updates a coach profile with validation and background check status
     * @param coach Updated coach profile data
     * @return Observable updated coach data
     */
    fun updateCoachProfile(coach: Coach): Single<Coach> {
        return Single.defer {
            validateCoachProfile(coach)

            apiService.updateCoachProfile(coach)
                .subscribeOn(Schedulers.io())
                .map { response ->
                    if (!response.isSuccessful() || response.data == null) {
                        throw IllegalStateException(response.message ?: "Failed to update coach profile")
                    }
                    response.data
                }
                .doOnSuccess { updatedCoach ->
                    // Update cache
                    coachCache[coach.id] = CachedCoach(updatedCoach, System.currentTimeMillis())
                    // Update local database
                    coachDatabase.coachDao().updateCoach(updatedCoach)
                    // Track analytics
                    analyticsManager.trackEvent("coach_profile_updated", mapOf(
                        "coach_id" to coach.id,
                        "verification_status" to coach.verificationStatus.name
                    ))
                }
                .doOnError { error ->
                    Timber.e(error, "Error updating coach profile")
                    analyticsManager.trackError("coach_profile_update_error", mapOf(
                        "coach_id" to coach.id,
                        "error" to error.message
                    ))
                }
        }
    }

    /**
     * Retrieves coach analytics data including earnings and engagement metrics
     * @param coachId Unique identifier of the coach
     * @param period Analytics time period
     * @return Observable analytics data
     */
    fun getCoachAnalytics(coachId: String, period: AnalyticsPeriod): Single<CoachAnalytics> {
        return Single.defer {
            apiService.getCoachAnalytics(coachId, period)
                .subscribeOn(Schedulers.io())
                .map { response ->
                    if (!response.isSuccessful() || response.data == null) {
                        throw IllegalStateException(response.message ?: "Failed to fetch coach analytics")
                    }
                    response.data
                }
                .doOnSuccess { analytics ->
                    analyticsManager.trackEvent("coach_analytics_fetched", mapOf(
                        "coach_id" to coachId,
                        "period" to period.name,
                        "revenue" to analytics.earnings.monthly
                    ))
                }
                .doOnError { error ->
                    Timber.e(error, "Error fetching coach analytics")
                    analyticsManager.trackError("coach_analytics_fetch_error", mapOf(
                        "coach_id" to coachId,
                        "period" to period.name,
                        "error" to error.message
                    ))
                }
        }
    }

    /**
     * Validates coach profile data before updates
     * @param coach Coach profile to validate
     * @throws IllegalArgumentException if validation fails
     */
    private fun validateCoachProfile(coach: Coach) {
        require(coach.id.isNotEmpty()) { "Coach ID cannot be empty" }
        require(coach.bio.length in 50..1000) { "Bio must be between 50 and 1000 characters" }
        require(coach.specialties.isNotEmpty()) { "At least one specialty must be specified" }
        require(coach.yearsOfExperience > 0) { "Years of experience must be greater than 0" }
        require(coach.subscriptionTiers.isNotEmpty()) { "At least one subscription tier must be defined" }
    }

    /**
     * Cleans up resources when repository is no longer needed
     */
    fun cleanup() {
        disposables.clear()
        coachCache.clear()
    }

    companion object {
        private const val TAG = "CoachRepository"
    }
}