package com.videocoach.domain.models

import android.os.Parcelable // version: latest
import com.google.gson.annotations.SerializedName // version: 2.10.x
import kotlinx.parcelize.Parcelize // version: 1.9.x

/**
 * Data model representing a coach profile with comprehensive professional information,
 * business settings, and analytics data. Implements Parcelable for efficient
 * data transfer between Android components.
 */
@Parcelize
data class Coach(
    @SerializedName("id")
    val id: String,
    
    @SerializedName("userId")
    val userId: String,
    
    @SerializedName("bio")
    val bio: String,
    
    @SerializedName("specialties")
    val specialties: List<String>,
    
    @SerializedName("yearsOfExperience")
    val yearsOfExperience: Int,
    
    @SerializedName("certifications")
    val certifications: List<Certification>,
    
    @SerializedName("rating")
    val rating: Double,
    
    @SerializedName("reviewCount")
    val reviewCount: Int,
    
    @SerializedName("subscriptionTiers")
    val subscriptionTiers: List<SubscriptionTier>,
    
    @SerializedName("availability")
    val availability: Availability,
    
    @SerializedName("socialLinks")
    val socialLinks: List<SocialLink>,
    
    @SerializedName("featuredVideoIds")
    val featuredVideoIds: List<String>,
    
    @SerializedName("studentCount")
    val studentCount: Int,
    
    @SerializedName("earnings")
    val earnings: Earnings,
    
    @SerializedName("status")
    val status: CoachStatus,
    
    @SerializedName("backgroundCheckId")
    val backgroundCheckId: String,
    
    @SerializedName("analyticsId")
    val analyticsId: String,
    
    @SerializedName("verificationTimestamp")
    val verificationTimestamp: Long,
    
    @SerializedName("createdAt")
    val createdAt: Long,
    
    @SerializedName("updatedAt")
    val updatedAt: Long
) : Parcelable {

    /**
     * Computed property indicating if the coach is currently available for new students
     */
    val isAvailable: Boolean
        get() = availability.isAcceptingStudents && status == CoachStatus.ACTIVE

    /**
     * Computed property indicating if the coach has completed verification process
     */
    val isVerified: Boolean
        get() = backgroundCheckId.isNotEmpty() && verificationTimestamp > 0

    /**
     * Computed property indicating if the coach has any active subscription tiers
     */
    val hasActiveSubscriptions: Boolean
        get() = subscriptionTiers.isNotEmpty()

    /**
     * Checks if coach offers a specific subscription tier
     *
     * @param tierId The ID of the subscription tier to check
     * @return True if the subscription tier exists, false otherwise
     */
    fun hasSubscriptionTier(tierId: String): Boolean {
        if (tierId.isEmpty()) return false
        return subscriptionTiers.any { it.id == tierId }
    }

    /**
     * Returns count of currently active students
     *
     * @return Number of active students
     */
    fun getActiveStudentCount(): Int = studentCount

    /**
     * Calculates total monthly revenue from all subscription tiers
     *
     * @return Total monthly revenue across all subscription tiers
     */
    fun calculateMonthlyRevenue(): Double {
        return subscriptionTiers.sumOf { tier ->
            tier.price * (earnings.revenueByTier[tier.id] ?: 0.0)
        }
    }
}

/**
 * Data class representing coach's earnings statistics with analytics
 */
@Parcelize
data class Earnings(
    @SerializedName("lifetime")
    val lifetime: Double,
    
    @SerializedName("monthly")
    val monthly: Double,
    
    @SerializedName("monthlyTrend")
    val monthlyTrend: Double,
    
    @SerializedName("projectedAnnual")
    val projectedAnnual: Double,
    
    @SerializedName("revenueByTier")
    val revenueByTier: Map<String, Double>,
    
    @SerializedName("lastCalculated")
    val lastCalculated: Long
) : Parcelable