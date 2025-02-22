package com.videocoach.data.repositories

import com.stripe.android.Stripe // v20.25.0
import com.stripe.android.model.PaymentIntent
import com.stripe.android.model.PaymentMethod
import com.stripe.android.model.ConfirmPaymentIntentParams
import com.videocoach.data.api.ApiService
import com.videocoach.domain.models.Payment
import io.reactivex.rxjava3.core.Single // v3.1.5
import javax.inject.Inject // v1
import javax.inject.Singleton
import timber.log.Timber // v5.0.1
import java.util.concurrent.TimeUnit

/**
 * Repository implementation for secure payment processing and management.
 * Implements PCI DSS compliance through Stripe integration.
 */
@Singleton
class PaymentRepository @Inject constructor(
    private val apiService: ApiService,
    private val stripe: Stripe,
    private val logger: PaymentLogger
) {
    // Cache for payment history optimization
    private val paymentCache = PaymentCache()

    /**
     * Securely processes a payment transaction with comprehensive validation.
     *
     * @param paymentMethodId Stripe payment method identifier
     * @param amount Payment amount in smallest currency unit
     * @param currency Three-letter ISO currency code
     * @param type Type of payment (subscription, one-time, etc.)
     * @return Single<Payment> Observable payment result with transaction details
     */
    fun processPayment(
        paymentMethodId: String,
        amount: Double,
        currency: String,
        type: PaymentType
    ): Single<Payment> {
        return Single.create { emitter ->
            try {
                // Validate payment parameters
                require(amount > 0) { "Payment amount must be positive" }
                require(currency.length == 3) { "Invalid currency code" }

                // Create payment request
                val request = PaymentRequest(
                    amount = amount,
                    currency = currency,
                    paymentMethodId = paymentMethodId,
                    serviceType = type.name,
                    description = "Payment for ${type.name.lowercase()}"
                )

                // Process payment through API
                apiService.processPayment(request)
                    .timeout(30, TimeUnit.SECONDS)
                    .flatMap { response ->
                        if (response.success && response.data != null) {
                            // Confirm payment with Stripe
                            val confirmParams = ConfirmPaymentIntentParams
                                .createWithPaymentMethodId(
                                    paymentMethodId,
                                    response.data.clientSecret
                                )
                            stripe.confirmPayment(confirmParams)
                        } else {
                            Single.error(PaymentException(response.message ?: "Payment failed"))
                        }
                    }
                    .subscribe({ paymentIntent ->
                        // Log successful transaction
                        logger.logPaymentSuccess(
                            amount = amount,
                            currency = currency,
                            paymentId = paymentIntent.id
                        )
                        
                        // Convert to domain model and emit
                        val payment = Payment(
                            id = paymentIntent.id,
                            amount = amount,
                            status = paymentIntent.status,
                            stripePaymentIntentId = paymentIntent.id,
                            timestamp = System.currentTimeMillis(),
                            type = type
                        )
                        emitter.onSuccess(payment)
                    }, { error ->
                        // Log payment failure
                        logger.logPaymentError(
                            amount = amount,
                            currency = currency,
                            error = error
                        )
                        emitter.onError(error)
                    })
            } catch (e: Exception) {
                emitter.onError(e)
            }
        }
    }

    /**
     * Retrieves paginated payment history with caching.
     *
     * @param page Page number for pagination
     * @param pageSize Number of items per page
     * @param type Optional payment type filter
     * @return Single<List<Payment>> Cached or fresh payment history
     */
    fun getPaymentHistory(
        page: Int,
        pageSize: Int,
        type: PaymentType? = null
    ): Single<List<Payment>> {
        return Single.create { emitter ->
            try {
                // Check cache first
                paymentCache.get(page, pageSize, type)?.let {
                    emitter.onSuccess(it)
                    return@create
                }

                // Fetch from API if cache miss
                apiService.getPaymentHistory(page, pageSize)
                    .timeout(10, TimeUnit.SECONDS)
                    .subscribe({ response ->
                        if (response.success && response.data != null) {
                            val payments = response.data.items
                            // Update cache
                            paymentCache.put(page, payments)
                            emitter.onSuccess(payments)
                        } else {
                            emitter.onError(
                                PaymentException(response.message ?: "Failed to fetch payment history")
                            )
                        }
                    }, { error ->
                        emitter.onError(error)
                    })
            } catch (e: Exception) {
                emitter.onError(e)
            }
        }
    }

    /**
     * Processes secure payment refunds with validation.
     *
     * @param paymentId ID of payment to refund
     * @param reason Reason for refund
     * @param amount Amount to refund (optional, defaults to full amount)
     * @return Single<Payment> Updated payment with refund status
     */
    fun refundPayment(
        paymentId: String,
        reason: String,
        amount: Double? = null
    ): Single<Payment> {
        return Single.create { emitter ->
            try {
                // Validate refund parameters
                require(paymentId.isNotEmpty()) { "Payment ID is required" }
                require(reason.isNotEmpty()) { "Refund reason is required" }
                amount?.let { 
                    require(it > 0) { "Refund amount must be positive" }
                }

                // Process refund through API
                apiService.processRefund(paymentId, reason, amount)
                    .timeout(30, TimeUnit.SECONDS)
                    .subscribe({ response ->
                        if (response.success && response.data != null) {
                            // Log successful refund
                            logger.logRefundSuccess(
                                paymentId = paymentId,
                                amount = amount,
                                reason = reason
                            )
                            emitter.onSuccess(response.data)
                        } else {
                            emitter.onError(
                                PaymentException(response.message ?: "Refund failed")
                            )
                        }
                    }, { error ->
                        // Log refund failure
                        logger.logRefundError(
                            paymentId = paymentId,
                            error = error
                        )
                        emitter.onError(error)
                    })
            } catch (e: Exception) {
                emitter.onError(e)
            }
        }
    }

    /**
     * Monitors subscription status with real-time updates.
     *
     * @return Single<SubscriptionStatus> Current subscription details
     */
    fun getSubscriptionStatus(): Single<SubscriptionStatus> {
        return Single.create { emitter ->
            try {
                apiService.getSubscriptionStatus()
                    .timeout(10, TimeUnit.SECONDS)
                    .subscribe({ response ->
                        if (response.success && response.data != null) {
                            emitter.onSuccess(response.data)
                        } else {
                            emitter.onError(
                                PaymentException(response.message ?: "Failed to fetch subscription status")
                            )
                        }
                    }, { error ->
                        emitter.onError(error)
                    })
            } catch (e: Exception) {
                emitter.onError(e)
            }
        }
    }

    companion object {
        private const val PAYMENT_TIMEOUT_SECONDS = 30L
        private const val CACHE_EXPIRY_MINUTES = 5L
    }
}

/**
 * Custom exception for payment-related errors
 */
class PaymentException(message: String) : Exception(message)

/**
 * Cache implementation for payment history
 */
private class PaymentCache {
    private val cache = mutableMapOf<String, CacheEntry>()

    fun get(page: Int, pageSize: Int, type: PaymentType?): List<Payment>? {
        val key = buildCacheKey(page, pageSize, type)
        val entry = cache[key] ?: return null
        
        return if (entry.isExpired()) {
            cache.remove(key)
            null
        } else {
            entry.data
        }
    }

    fun put(page: Int, data: List<Payment>) {
        val key = buildCacheKey(page, data.size)
        cache[key] = CacheEntry(data)
    }

    private fun buildCacheKey(
        page: Int,
        pageSize: Int,
        type: PaymentType? = null
    ): String {
        return "$page:$pageSize:${type?.name ?: "all"}"
    }

    private data class CacheEntry(
        val data: List<Payment>,
        val timestamp: Long = System.currentTimeMillis()
    ) {
        fun isExpired(): Boolean {
            return System.currentTimeMillis() - timestamp > 
                TimeUnit.MINUTES.toMillis(CACHE_EXPIRY_MINUTES)
        }
    }

    companion object {
        private const val CACHE_EXPIRY_MINUTES = 5L
    }
}