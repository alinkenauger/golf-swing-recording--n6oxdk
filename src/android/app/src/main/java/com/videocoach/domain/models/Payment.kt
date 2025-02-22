package com.videocoach.domain.models

import android.os.Parcelable
import kotlinx.parcelize.Parcelize
import com.stripe.android.model.PaymentStatus // version: 20.0.0
import java.text.NumberFormat
import java.util.*
import kotlin.time.Duration.Companion.days

/**
 * Represents a payment transaction in the Video Coaching Platform.
 * Implements Parcelable for efficient data serialization across Android components.
 *
 * @property id Unique identifier for the payment transaction
 * @property userId Identifier of the user making the payment
 * @property coachId Identifier of the coach receiving the payment
 * @property amount Payment amount in the smallest currency unit
 * @property currency Three-letter ISO currency code
 * @property paymentMethodId Identifier of the payment method used
 * @property status Current status of the payment transaction
 * @property stripePaymentIntentId Associated Stripe payment intent identifier
 * @property description Human-readable description of the payment
 * @property metadata Additional payment-related metadata
 * @property createdAt Timestamp when the payment was created
 * @property updatedAt Timestamp when the payment was last updated
 */
@Parcelize
data class Payment(
    val id: String,
    val userId: String,
    val coachId: String,
    val amount: Double,
    val currency: String,
    val paymentMethodId: String,
    val status: PaymentStatus,
    val stripePaymentIntentId: String,
    val description: String,
    val metadata: Map<String, Any>,
    val createdAt: Long,
    val updatedAt: Long
) : Parcelable {

    companion object {
        private const val REFUND_WINDOW_DAYS = 30
        private val REFUNDABLE_STATUSES = setOf(
            PaymentStatus.Completed,
            PaymentStatus.Processing
        )
    }

    /**
     * Determines if the payment is eligible for refund based on platform policies.
     * Checks payment status, time window, and transaction type.
     *
     * @return true if the payment can be refunded, false otherwise
     */
    fun isRefundable(): Boolean {
        val isWithinRefundWindow = (System.currentTimeMillis() - createdAt) < REFUND_WINDOW_DAYS.days.inWholeMilliseconds
        val hasValidStatus = status in REFUNDABLE_STATUSES
        val isRefundableType = metadata["refundable"] as? Boolean ?: true

        return isWithinRefundWindow && hasValidStatus && isRefundableType
    }

    /**
     * Formats the payment amount with appropriate currency symbol and decimal places.
     * Handles locale-specific formatting rules and currency symbols.
     *
     * @return Formatted amount string with currency symbol
     */
    fun formattedAmount(): String {
        return try {
            val formatter = NumberFormat.getCurrencyInstance().apply {
                currency = Currency.getInstance(currency)
                minimumFractionDigits = 2
                maximumFractionDigits = 2
            }
            formatter.format(amount)
        } catch (e: IllegalArgumentException) {
            // Fallback formatting for unsupported currencies
            "$currency ${String.format("%.2f", amount)}"
        }
    }

    /**
     * Provides a human-readable string representation of the payment.
     *
     * @return String containing essential payment details
     */
    override fun toString(): String {
        return "Payment(id=$id, amount=${formattedAmount()}, status=$status)"
    }
}