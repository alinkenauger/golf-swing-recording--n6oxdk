package com.videocoach.domain.usecases.coach

import android.util.Log // version: default
import io.reactivex.rxjava3.core.Single // version: 3.1.5
import java.util.concurrent.TimeoutException // version: default
import javax.inject.Inject // version: 1
import com.videocoach.domain.models.Coach
import com.videocoach.data.repositories.CoachRepository

/**
 * Use case that encapsulates the business logic for retrieving a coach's profile information.
 * Implements clean architecture principles with enhanced validation, error handling, and logging.
 *
 * @property coachRepository Repository for accessing coach data
 */
class GetCoachProfileUseCase @Inject constructor(
    private val coachRepository: CoachRepository
) {
    companion object {
        private const val TAG = "GetCoachProfileUseCase"
        private const val TIMEOUT_DURATION_MS = 15000L // 15 seconds
        private const val MAX_RETRY_ATTEMPTS = 3
        private const val COACH_ID_MIN_LENGTH = 5
        private const val COACH_ID_MAX_LENGTH = 50
        private val COACH_ID_PATTERN = Regex("^[a-zA-Z0-9-_]+$")
    }

    /**
     * Executes the use case to retrieve a coach's profile information.
     * Includes comprehensive validation, error handling, and retry logic.
     *
     * @param coachId Unique identifier of the coach to retrieve
     * @return Single<Coach> Observable containing the coach profile data
     * @throws IllegalArgumentException if coachId is invalid
     * @throws TimeoutException if the request times out
     */
    fun execute(coachId: String): Single<Coach> {
        Log.d(TAG, "Executing GetCoachProfileUseCase for coachId: $coachId")

        return Single.defer {
            try {
                validateCoachId(coachId)
                
                coachRepository.getCoachProfile(coachId)
                    .timeout(TIMEOUT_DURATION_MS, java.util.concurrent.TimeUnit.MILLISECONDS)
                    .retry { retryCount, error ->
                        val shouldRetry = retryCount < MAX_RETRY_ATTEMPTS && isRetryableError(error)
                        if (shouldRetry) {
                            Log.w(TAG, "Retrying coach profile fetch. Attempt: ${retryCount + 1}", error)
                        }
                        shouldRetry
                    }
                    .doOnSuccess { coach ->
                        Log.d(TAG, "Successfully retrieved coach profile for ID: $coachId")
                        validateCoachProfile(coach)
                    }
                    .doOnError { error ->
                        Log.e(TAG, "Error retrieving coach profile for ID: $coachId", error)
                        handleError(error)
                    }
            } catch (e: IllegalArgumentException) {
                Log.e(TAG, "Validation error for coachId: $coachId", e)
                Single.error(e)
            }
        }
    }

    /**
     * Validates the coach ID parameter with comprehensive checks.
     *
     * @param coachId Coach identifier to validate
     * @throws IllegalArgumentException if validation fails
     */
    private fun validateCoachId(coachId: String) {
        when {
            coachId.isBlank() -> {
                throw IllegalArgumentException("Coach ID cannot be blank")
            }
            coachId.length !in COACH_ID_MIN_LENGTH..COACH_ID_MAX_LENGTH -> {
                throw IllegalArgumentException("Coach ID length must be between $COACH_ID_MIN_LENGTH and $COACH_ID_MAX_LENGTH characters")
            }
            !COACH_ID_PATTERN.matches(coachId) -> {
                throw IllegalArgumentException("Coach ID contains invalid characters. Only alphanumeric characters, hyphens and underscores are allowed")
            }
        }
    }

    /**
     * Validates the retrieved coach profile data.
     *
     * @param coach Coach profile to validate
     * @throws IllegalStateException if profile data is invalid
     */
    private fun validateCoachProfile(coach: Coach) {
        when {
            coach.id.isBlank() -> {
                throw IllegalStateException("Retrieved coach profile has invalid ID")
            }
            coach.status == null -> {
                throw IllegalStateException("Retrieved coach profile has null status")
            }
        }
    }

    /**
     * Determines if an error should trigger a retry attempt.
     *
     * @param error The error to evaluate
     * @return true if the error is retryable
     */
    private fun isRetryableError(error: Throwable): Boolean {
        return when (error) {
            is TimeoutException -> true
            is java.net.SocketTimeoutException -> true
            is java.io.IOException -> true
            else -> false
        }
    }

    /**
     * Handles errors by transforming them into appropriate domain exceptions.
     *
     * @param error The error to handle
     * @throws RuntimeException with appropriate error message
     */
    private fun handleError(error: Throwable) {
        val errorMessage = when (error) {
            is TimeoutException -> "Request timed out while fetching coach profile"
            is IllegalArgumentException -> "Invalid coach profile data: ${error.message}"
            is IllegalStateException -> "Invalid coach profile state: ${error.message}"
            else -> "Unexpected error while fetching coach profile: ${error.message}"
        }
        throw RuntimeException(errorMessage, error)
    }
}