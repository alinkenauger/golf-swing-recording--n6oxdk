package com.videocoach.domain.usecases.payment

import com.videocoach.data.repositories.PaymentRepository
import com.videocoach.domain.models.Payment
import io.reactivex.rxjava3.core.Single // v3.1.5
import java.util.Currency // N/A
import javax.inject.Inject // v1
import javax.inject.Singleton
import timber.log.Timber // v5.0.1
import java.util.concurrent.TimeUnit

/**
 * Use case that encapsulates payment processing business logic with comprehensive validation.
 * Implements secure payment processing with support for multiple payment types and currencies.
 */
@Singleton
class ProcessPaymentUseCase @Inject constructor(
    private val paymentRepository: PaymentRepository
) {
    // Minimum payment amounts per currency (in smallest currency unit)
    private val minimumAmounts = mapOf(
        "USD" to 1.0,
        "EUR" to 1.0,
        "GBP" to 1.0
    )

    // Maximum retry attempts for failed payments
    private val maxRetryAttempts = 3

    // Payment processing timeout in seconds
    private val processingTimeout = 30L

    /**
     * Executes the payment processing use case with comprehensive validation and error handling.
     *
     * @param paymentMethodId Stripe payment method identifier
     * @param amount Payment amount in the smallest currency unit
     * @param currency Three-letter ISO currency code
     * @param type Type of payment (subscription, one-time, etc.)
     * @return Single<Payment> Observable payment result with detailed status
     */
    fun execute(
        paymentMethodId: String,
        amount: Double,
        currency: String,
        type: PaymentType
    ): Single<Payment> {
        return Single.create { emitter ->
            try {
                // Validate payment parameters
                if (!validatePayment(paymentMethodId, amount, currency)) {
                    emitter.onError(IllegalArgumentException("Invalid payment parameters"))
                    return@create
                }

                // Process payment with retry logic
                var attempts = 0
                var lastError: Throwable? = null

                while (attempts < maxRetryAttempts) {
                    try {
                        paymentRepository.processPayment(paymentMethodId, amount, currency, type)
                            .timeout(processingTimeout, TimeUnit.SECONDS)
                            .subscribe(
                                { payment ->
                                    Timber.d("Payment processed successfully: ${payment.id}")
                                    emitter.onSuccess(payment)
                                },
                                { error ->
                                    lastError = error
                                    attempts++
                                    if (attempts >= maxRetryAttempts) {
                                        Timber.e(error, "Payment processing failed after $maxRetryAttempts attempts")
                                        emitter.onError(error)
                                    }
                                }
                            )
                    } catch (e: Exception) {
                        lastError = e
                        attempts++
                        if (attempts >= maxRetryAttempts) {
                            Timber.e(e, "Payment processing failed after $maxRetryAttempts attempts")
                            emitter.onError(e)
                        }
                    }
                }
            } catch (e: Exception) {
                Timber.e(e, "Unexpected error during payment processing")
                emitter.onError(e)
            }
        }
    }

    /**
     * Validates payment parameters with specific error types.
     *
     * @param paymentMethodId Payment method identifier to validate
     * @param amount Payment amount to validate
     * @param currency Currency code to validate
     * @return Boolean indicating if all parameters are valid
     */
    private fun validatePayment(
        paymentMethodId: String,
        amount: Double,
        currency: String
    ): Boolean {
        try {
            // Validate payment method ID format
            require(paymentMethodId.isNotEmpty()) {
                "Payment method ID cannot be empty"
            }
            require(paymentMethodId.length >= 10) {
                "Invalid payment method ID format"
            }

            // Validate amount
            require(amount > 0) {
                "Payment amount must be positive"
            }
            minimumAmounts[currency]?.let { minAmount ->
                require(amount >= minAmount) {
                    "Amount below minimum for currency $currency"
                }
            }

            // Validate currency
            require(currency.length == 3) {
                "Currency code must be 3 characters"
            }
            Currency.getInstance(currency) // Throws if invalid currency code

            return true
        } catch (e: Exception) {
            Timber.e(e, "Payment validation failed")
            return false
        }
    }

    /**
     * Payment type enumeration defining supported payment types
     */
    enum class PaymentType {
        SUBSCRIPTION,
        ONE_TIME,
        COACHING_SESSION,
        TRAINING_PROGRAM
    }

    companion object {
        private const val DEFAULT_CURRENCY = "USD"
        private const val MINIMUM_PAYMENT_METHOD_ID_LENGTH = 10
    }
}