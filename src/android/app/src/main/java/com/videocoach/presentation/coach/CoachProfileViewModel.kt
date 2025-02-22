package com.videocoach.presentation.coach

import androidx.lifecycle.SavedStateHandle // v2.6.2
import com.videocoach.data.repositories.CoachRepository
import com.videocoach.domain.models.Coach
import com.videocoach.presentation.base.BaseViewModel
import dagger.hilt.android.lifecycle.HiltViewModel // v2.6.2
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import timber.log.Timber // v5.0.1
import javax.inject.Inject

/**
 * ViewModel responsible for managing coach profile data, subscription tiers,
 * earnings analytics, and verification status with real-time updates.
 */
@HiltViewModel
class CoachProfileViewModel @Inject constructor(
    private val coachRepository: CoachRepository,
    private val savedStateHandle: SavedStateHandle,
    private val viewModelScope: CoroutineScope
) : BaseViewModel() {

    private val _coachProfile = MutableStateFlow<Coach?>(null)
    val coachProfile: StateFlow<Coach?> = _coachProfile.asStateFlow()

    private val _subscriptionTiers = MutableStateFlow<List<SubscriptionTier>>(emptyList())
    val subscriptionTiers: StateFlow<List<SubscriptionTier>> = _subscriptionTiers.asStateFlow()

    private val _earnings = MutableStateFlow<Earnings?>(null)
    val earnings: StateFlow<Earnings?> = _earnings.asStateFlow()

    private val _networkState = MutableStateFlow(NetworkState.IDLE)
    val networkState: StateFlow<NetworkState> = _networkState.asStateFlow()

    private val coachId: String = checkNotNull(savedStateHandle.get<String>("coachId")) {
        "coachId parameter is required"
    }

    init {
        loadCoachProfile(coachId)
        setupRealTimeUpdates(coachId)
    }

    /**
     * Loads coach profile data with comprehensive error handling and data validation
     */
    fun loadCoachProfile(coachId: String) {
        launchWithLoading {
            try {
                _networkState.value = NetworkState.LOADING

                // Fetch coach profile
                coachRepository.getCoachProfile(coachId)
                    .subscribe(
                        { response ->
                            if (handleDataConsistency(response)) {
                                _coachProfile.value = response
                                _subscriptionTiers.value = response.subscriptionTiers
                                _earnings.value = response.earnings
                                _networkState.value = NetworkState.SUCCESS
                            } else {
                                handleError(IllegalStateException("Inconsistent coach data received"))
                            }
                        },
                        { error ->
                            handleError(error)
                            _networkState.value = NetworkState.ERROR
                        }
                    )
            } catch (e: Exception) {
                Timber.e(e, "Error loading coach profile")
                handleError(e)
                _networkState.value = NetworkState.ERROR
            }
        }
    }

    /**
     * Sets up real-time data update observers for coach profile changes
     */
    private fun setupRealTimeUpdates(coachId: String) {
        viewModelScope.launch {
            try {
                coachRepository.observeCoachUpdates(coachId)
                    .collect { updatedCoach ->
                        if (handleDataConsistency(updatedCoach)) {
                            _coachProfile.value = updatedCoach
                            _subscriptionTiers.value = updatedCoach.subscriptionTiers
                            _earnings.value = updatedCoach.earnings
                        } else {
                            Timber.w("Inconsistent data in real-time update")
                            refreshData()
                        }
                    }
            } catch (e: Exception) {
                Timber.e(e, "Error in real-time updates")
                handleError(e)
            }
        }
    }

    /**
     * Validates data consistency across all coach-related state flows
     */
    private fun handleDataConsistency(coach: Coach?): Boolean {
        if (coach == null) return false

        return try {
            // Validate basic coach data
            require(coach.id.isNotEmpty())
            require(coach.bio.length in 50..1000)
            require(coach.specialties.isNotEmpty())
            require(coach.yearsOfExperience > 0)

            // Validate subscription tiers
            require(coach.subscriptionTiers.isNotEmpty())
            coach.subscriptionTiers.forEach { tier ->
                require(tier.price > 0)
                require(tier.features.isNotEmpty())
            }

            // Validate earnings data
            coach.earnings?.let { earnings ->
                require(earnings.lifetime >= 0)
                require(earnings.monthly >= 0)
                require(earnings.lastCalculated > 0)
            }

            true
        } catch (e: Exception) {
            Timber.w(e, "Data consistency validation failed")
            false
        }
    }

    /**
     * Refreshes all coach-related data from repository
     */
    fun refreshData() {
        loadCoachProfile(coachId)
    }

    /**
     * Updates coach verification status with error handling
     */
    fun updateVerificationStatus(status: VerificationStatus) {
        launchWithLoading {
            try {
                _coachProfile.value?.let { currentProfile ->
                    val updatedProfile = currentProfile.copy(verificationStatus = status)
                    coachRepository.updateCoachProfile(updatedProfile)
                        .subscribe(
                            { response ->
                                _coachProfile.value = response
                                _networkState.value = NetworkState.SUCCESS
                            },
                            { error ->
                                handleError(error)
                                _networkState.value = NetworkState.ERROR
                            }
                        )
                }
            } catch (e: Exception) {
                Timber.e(e, "Error updating verification status")
                handleError(e)
            }
        }
    }

    override fun onCleared() {
        super.onCleared()
        // Cleanup any resources or subscriptions
    }

    enum class NetworkState {
        IDLE,
        LOADING,
        SUCCESS,
        ERROR
    }

    enum class VerificationStatus {
        PENDING,
        IN_PROGRESS,
        VERIFIED,
        REJECTED
    }
}