package com.videocoach.domain.models

import android.os.Parcelable
import androidx.annotation.Keep
import com.google.gson.annotations.SerializedName
import kotlinx.parcelize.Parcelize
import kotlinx.serialization.Serializable
import java.util.regex.Pattern

/**
 * Value class representing a type-safe user identifier.
 */
@JvmInline
value class UserId(val value: String)

/**
 * Value class for email with built-in validation.
 */
@JvmInline
value class UserEmail(val value: String) {
    fun isValid(): Boolean {
        val emailPattern = Pattern.compile(
            "[a-zA-Z0-9+._%\\-]{1,256}" +
            "@" +
            "[a-zA-Z0-9][a-zA-Z0-9\\-]{0,64}" +
            "(" +
            "\\." +
            "[a-zA-Z0-9][a-zA-Z0-9\\-]{0,25}" +
            ")+"
        )
        return emailPattern.matcher(value).matches()
    }
}

/**
 * Enum representing possible user roles in the system.
 */
enum class UserRole {
    ATHLETE,
    COACH,
    ADMIN
}

/**
 * Enum representing possible user account statuses.
 */
enum class UserStatus {
    ACTIVE,
    PENDING,
    SUSPENDED,
    DELETED
}

/**
 * Domain model representing a user in the Video Coaching Platform.
 * Implements enhanced security and privacy features with GDPR compliance.
 *
 * @property id Unique identifier for the user
 * @property email User's email address
 * @property name User's full name
 * @property profileImageUrl Optional URL to user's profile image
 * @property role User's role in the system
 * @property status Current account status
 * @property phoneNumber Optional phone number
 * @property coachId Optional reference to assigned coach
 * @property isEmailVerified Email verification status
 * @property isBiometricEnabled Biometric authentication status
 * @property isMfaEnabled Multi-factor authentication status
 * @property socialProvider Optional social login provider
 * @property marketingConsent Marketing communications consent
 * @property dataUsageConsent Data processing consent
 * @property createdAt Account creation timestamp
 * @property updatedAt Last update timestamp
 * @property lastLoginAt Last login timestamp
 * @property lastPasswordChanged Last password change timestamp
 * @property modifiedBy Last modifier identifier
 * @property version Entity version for optimistic locking
 */
@Parcelize
@Serializable
@Keep
data class User(
    @SerializedName("id") val id: UserId,
    @SerializedName("email") val email: UserEmail,
    @SerializedName("name") val name: String,
    @SerializedName("profile_image_url") val profileImageUrl: String? = null,
    @SerializedName("role") val role: UserRole,
    @SerializedName("status") val status: UserStatus,
    @SerializedName("phone_number") val phoneNumber: String? = null,
    @SerializedName("coach_id") val coachId: String? = null,
    @SerializedName("is_email_verified") val isEmailVerified: Boolean,
    @SerializedName("is_biometric_enabled") val isBiometricEnabled: Boolean,
    @SerializedName("is_mfa_enabled") val isMfaEnabled: Boolean,
    @SerializedName("social_provider") val socialProvider: String? = null,
    @SerializedName("marketing_consent") val marketingConsent: Boolean,
    @SerializedName("data_usage_consent") val dataUsageConsent: Boolean,
    @SerializedName("created_at") val createdAt: Long,
    @SerializedName("updated_at") val updatedAt: Long,
    @SerializedName("last_login_at") val lastLoginAt: Long,
    @SerializedName("last_password_changed") val lastPasswordChanged: Long? = null,
    @SerializedName("modified_by") val modifiedBy: String? = null,
    @SerializedName("version") val version: Int
) : Parcelable {

    /**
     * Computed property returning user's display name.
     */
    val displayName: String
        get() = name.split(" ").firstOrNull() ?: name

    /**
     * Computed property indicating if the account is active.
     */
    val isActive: Boolean
        get() = status == UserStatus.ACTIVE

    /**
     * Computed property indicating if the user is a coach.
     */
    val isCoach: Boolean
        get() = role == UserRole.COACH

    /**
     * Computed property indicating if the user is an athlete.
     */
    val isAthlete: Boolean
        get() = role == UserRole.ATHLETE

    /**
     * Checks if the user has access to coach features.
     * Verifies role, status, and required verifications.
     *
     * @return true if user can access coach features
     */
    fun canAccessCoachFeatures(): Boolean {
        return isCoach &&
                isActive &&
                isEmailVerified &&
                isMfaEnabled
    }

    /**
     * Creates an anonymized version of the user for GDPR compliance.
     * Maintains essential relationships while removing PII.
     *
     * @return Anonymized user instance
     */
    fun toAnonymized(): User {
        return copy(
            name = "Anonymized User",
            email = UserEmail("anonymized.${id.value}@redacted.com"),
            phoneNumber = null,
            profileImageUrl = null,
            socialProvider = null,
            modifiedBy = "GDPR_ANONYMIZATION"
        )
    }

    companion object {
        const val MINIMUM_PASSWORD_LENGTH = 12
        const val PASSWORD_EXPIRY_DAYS = 90
    }
}