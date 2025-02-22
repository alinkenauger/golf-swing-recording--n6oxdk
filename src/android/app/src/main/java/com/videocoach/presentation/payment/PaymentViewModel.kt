package com.videocoach.presentation.payment

import androidx.lifecycle.viewModelScope // v2.6.2
import com.videocoach.domain.models.Payment
import com.videocoach.domain.usecases.payment.ProcessPaymentUseCase
import com.videocoach.presentation.base.BaseViewModel
import dagger.hilt.android.lifecycle.HiltViewModel // v2.44
import kotlinx.coroutines.flow.MutableStateFlow // v1.7.3
import kotlinx.coroutines.flow.StateFlow // v1.7.3
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.util.Currency
import javax.inject.Inject // v1
import timber.log.Timber // v5.0.1

/**
 * ViewModel responsible for managing payment-related UI state and business logic.
 * Implements secure payment processing with comprehensive error handling and state management.
 */
@HiltViewModel
class PaymentViewModel @Inject constructor(
    private val processPaymentUseCase: ProcessPaymentUseCase,
    private val getPaymentHistoryUseCase: GetPaymentHistoryUseCase,
    private val checkSubscriptionStatusUseCase: CheckSubscriptionStatusUseCase
) : BaseViewModel() {

    // Payment processing state
    private val _paymentState = MutableStateFlow<PaymentState>(PaymentState.Idle)
    val paymentState: StateFlow<PaymentState> = _paymentState.asStateFlow()

    // Payment history state
    private val _paymentHistory = MutableStateFlow<List<Payment>>(emptyList())
    val paymentHistory: StateFlow<List<Payment>> = _paymentHistory.asStateFlow()

    // Subscription state
    private val _subscriptionState = MutableStateFlow<SubscriptionState>(SubscriptionState.Loading)
    val subscriptionState: StateFlow<SubscriptionState> = _subscriptionState.asStateFlow()

    // Error state
    private val _error = MutableStateFlow<PaymentError?>(null)
    val error: StateFlow<PaymentError?> = _error.asStateFlow()

    init {
        checkSubscriptionStatus()
    }

    /**
     * Processes a payment transaction with comprehensive validation and error handling.
     *
     * @param paymentMethodId Stripe payment method identifier
     * @param amount Payment amount in the smallest currency unit
     * @param currency Three-letter ISO currency code
     * @param type Type of payment (subscription, one-time, etc.)
     * @param metadata Additional payment metadata
     */
    fun processPayment(
        paymentMethodId: String,
        amount: Double,
        currency: String,
        type: ProcessPaymentUseCase.PaymentType,
        metadata: Map<String, Any> = emptyMap()
    ) {
        viewModelScope.launch {
            try {
                // Validate payment parameters
                validatePaymentParameters(paymentMethodId, amount, currency)

                _paymentState.value = PaymentState.Processing
                
                launchWithLoading {
                    processPaymentUseCase.execute(
                        paymentMethodId = paymentMethodId,
                        amount = amount,
                        currency = currency,
                        type = type
                    ).collect { result ->
                        when (result) {
                            is PaymentResult.Success -> {
                                _paymentState.value = PaymentState.Success(result.payment)
                                refreshPaymentHistory()
                            }
                            is PaymentResult.Error -> {
                                _paymentState.value = PaymentState.Error(result.error)
                                _error.value = PaymentError(result.error)
                            }
                        }
                    }
                }
            } catch (e: Exception) {
                Timber.e(e, "Payment processing failed")
                _paymentState.value = PaymentState.Error(e.message ?: "Payment processing failed")
                _error.value = PaymentError(e.message ?: "Payment processing failed")
            }
        }
    }

    /**
     * Retrieves paginated payment transaction history with filtering options.
     *
     * @param page Page number for pagination
     * @param pageSize Number of items per page
     * @param filter Optional filter for payment history
     */
    fun getPaymentHistory(
        page: Int = 0,
        pageSize: Int = 20,
        filter: PaymentHistoryFilter = PaymentHistoryFilter()
    ) {
        viewModelScope.launch {
            try {
                launchWithLoading {
                    getPaymentHistoryUseCase.execute(page, pageSize, filter)
                        .collect { payments ->
                            _paymentHistory.value = payments
                        }
                }
            } catch (e: Exception) {
                Timber.e(e, "Failed to fetch payment history")
                _error.value = PaymentError("Failed to fetch payment history")
            }
        }
    }

    /**
     * Checks and updates current subscription status.
     */
    private fun checkSubscriptionStatus() {
        viewModelScope.launch {
            try {
                checkSubscriptionStatusUseCase.execute()
                    .collect { status ->
                        _subscriptionState.value = when (status) {
                            is SubscriptionStatus.Active -> SubscriptionState.Active(
                                expiryDate = status.expiryDate,
                                autoRenew = status.autoRenew
                            )
                            is SubscriptionStatus.Expired -> SubscriptionState.Expired(
                                lastActiveDate = status.lastActiveDate
                            )
                            is SubscriptionStatus.None -> SubscriptionState.None
                        }
                    }
            } catch (e: Exception) {
                Timber.e(e, "Failed to check subscription status")
                _subscriptionState.value = SubscriptionState.Error(
                    e.message ?: "Failed to check subscription status"
                )
            }
        }
    }

    /**
     * Retries a failed payment with exponential backoff.
     *
     * @param paymentId ID of the failed payment
     * @param retryAttempt Current retry attempt number
     */
    fun retryPayment(paymentId: String, retryAttempt: Int = 0) {
        viewModelScope.launch {
            try {
                if (retryAttempt >= MAX_RETRY_ATTEMPTS) {
                    _error.value = PaymentError("Maximum retry attempts reached")
                    return@launch
                }

                _paymentState.value = PaymentState.Retrying(retryAttempt)
                
                // Calculate backoff delay
                val backoffDelay = calculateBackoffDelay(retryAttempt)
                kotlinx.coroutines.delay(backoffDelay)

                // Retry payment processing
                processPaymentUseCase.execute(
                    paymentId = paymentId,
                    isRetry = true,
                    retryAttempt = retryAttempt
                ).collect { result ->
                    when (result) {
                        is PaymentResult.Success -> {
                            _paymentState.value = PaymentState.Success(result.payment)
                            refreshPaymentHistory()
                        }
                        is PaymentResult.Error -> {
                            if (retryAttempt < MAX_RETRY_ATTEMPTS - 1) {
                                retryPayment(paymentId, retryAttempt + 1)
                            } else {
                                _paymentState.value = PaymentState.Error(result.error)
                                _error.value = PaymentError(result.error)
                            }
                        }
                    }
                }
            } catch (e: Exception) {
                Timber.e(e, "Payment retry failed")
                _paymentState.value = PaymentState.Error(e.message ?: "Payment retry failed")
                _error.value = PaymentError(e.message ?: "Payment retry failed")
            }
        }
    }

    /**
     * Validates payment parameters before processing.
     *
     * @throws IllegalArgumentException if parameters are invalid
     */
    private fun validatePaymentParameters(
        paymentMethodId: String,
        amount: Double,
        currency: String
    ) {
        require(paymentMethodId.isNotEmpty()) { "Payment method ID cannot be empty" }
        require(amount > 0) { "Payment amount must be positive" }
        require(currency.length == 3) { "Invalid currency code" }
        
        try {
            Currency.getInstance(currency)
        } catch (e: IllegalArgumentException) {
            throw IllegalArgumentException("Invalid currency code: $currency")
        }
    }

    /**
     * Calculates exponential backoff delay for retry attempts.
     */
    private fun calculateBackoffDelay(retryAttempt: Int): Long {
        return if (retryAttempt > 0) {
            val baseDelay = 1000L // 1 second base delay
            val maxDelay = 30000L // 30 seconds maximum delay
            minOf(baseDelay * (1 shl retryAttempt), maxDelay)
        } else 0
    }

    /**
     * Refreshes payment history after successful payment.
     */
    private fun refreshPaymentHistory() {
        getPaymentHistory(0, 20)
    }

    companion object {
        private const val MAX_RETRY_ATTEMPTS = 3
    }
}

/**
 * Sealed class representing payment processing states.
 */
sealed class PaymentState {
    object Idle : PaymentState()
    object Processing : PaymentState()
    data class Retrying(val attempt: Int) : PaymentState()
    data class Success(val payment: Payment) : PaymentState()
    data class Error(val message: String) : PaymentState()
}

/**
 * Sealed class representing subscription states.
 */
sealed class SubscriptionState {
    object Loading : SubscriptionState()
    object None : SubscriptionState()
    data class Active(val expiryDate: Long, val autoRenew: Boolean) : SubscriptionState()
    data class Expired(val lastActiveDate: Long) : SubscriptionState()
    data class Error(val message: String) : SubscriptionState()
}

/**
 * Data class representing payment errors.
 */
data class PaymentError(
    val message: String,
    val code: String? = null,
    val recoverable: Boolean = false
)

/**
 * Data class for payment history filtering.
 */
data class PaymentHistoryFilter(
    val startDate: Long? = null,
    val endDate: Long? = null,
    val status: String? = null,
    val type: ProcessPaymentUseCase.PaymentType? = null
)