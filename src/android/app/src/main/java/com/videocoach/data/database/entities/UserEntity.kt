package com.videocoach.data.database.entities

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey
import androidx.room.TypeConverters
import com.videocoach.domain.models.User
import com.videocoach.domain.models.UserEmail
import com.videocoach.domain.models.UserId
import com.videocoach.domain.models.UserRole
import com.videocoach.domain.models.UserStatus
import java.util.regex.Pattern

/**
 * Room database entity representing a user in the local SQLite database.
 * Implements enhanced security, performance optimization, and production-ready features.
 *
 * @property id Unique identifier for the user
 * @property email User's email address (unique, indexed)
 * @property name User's full name
 * @property profileImageUrl Optional URL to user's profile image
 * @property role User's role in the system (indexed)
 * @property status Current account status
 * @property phoneNumber Optional phone number
 * @property coachId Optional reference to assigned coach
 * @property isEmailVerified Email verification status
 * @property isBiometricEnabled Biometric authentication status
 * @property createdAt Account creation timestamp
 * @property lastLoginAt Last login timestamp
 * @property lastSyncedAt Last sync timestamp with remote server
 * @property version Entity version for optimistic locking
 * @property createdBy Creator identifier for audit trail
 * @property modifiedBy Last modifier identifier
 * @property modifiedAt Last modification timestamp
 */
@Entity(
    tableName = "users",
    indices = [
        Index(value = ["email"], unique = true),
        Index(value = ["role"]),
        Index(value = ["status"]),
        Index(value = ["coach_id"]),
        Index(value = ["last_synced_at"])
    ],
    foreignKeys = [
        ForeignKey(
            entity = UserEntity::class,
            parentColumns = ["id"],
            childColumns = ["coach_id"],
            onDelete = ForeignKey.SET_NULL
        )
    ]
)
@TypeConverters(UserTypeConverters::class)
data class UserEntity(
    @PrimaryKey
    @ColumnInfo(name = "id")
    val id: String,

    @ColumnInfo(name = "email", collate = ColumnInfo.NOCASE)
    val email: String,

    @ColumnInfo(name = "name")
    val name: String,

    @ColumnInfo(name = "profile_image_url")
    val profileImageUrl: String?,

    @ColumnInfo(name = "role")
    val role: UserRole,

    @ColumnInfo(name = "status")
    val status: UserStatus,

    @ColumnInfo(name = "phone_number")
    val phoneNumber: String?,

    @ColumnInfo(name = "coach_id")
    val coachId: String?,

    @ColumnInfo(name = "is_email_verified", defaultValue = "0")
    val isEmailVerified: Boolean,

    @ColumnInfo(name = "is_biometric_enabled", defaultValue = "0")
    val isBiometricEnabled: Boolean,

    @ColumnInfo(name = "created_at")
    val createdAt: Long,

    @ColumnInfo(name = "last_login_at")
    val lastLoginAt: Long,

    @ColumnInfo(name = "last_synced_at")
    val lastSyncedAt: Long,

    @ColumnInfo(name = "version")
    val version: Int,

    @ColumnInfo(name = "created_by")
    val createdBy: String,

    @ColumnInfo(name = "modified_by")
    val modifiedBy: String,

    @ColumnInfo(name = "modified_at")
    val modifiedAt: Long
) {
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
     * Computed property indicating if the entity needs synchronization with remote server.
     */
    val needsSync: Boolean
        get() = System.currentTimeMillis() - lastSyncedAt > SYNC_THRESHOLD_MS

    /**
     * Converts database entity to domain model with validation.
     *
     * @return Validated domain model instance
     * @throws IllegalStateException if validation fails
     */
    fun toDomainModel(): User {
        require(validate()) { "Invalid user entity state" }

        return User(
            id = UserId(id),
            email = UserEmail(email),
            name = name,
            profileImageUrl = profileImageUrl,
            role = role,
            status = status,
            phoneNumber = phoneNumber,
            coachId = coachId,
            isEmailVerified = isEmailVerified,
            isBiometricEnabled = isBiometricEnabled,
            isMfaEnabled = false, // Default value as not stored locally
            socialProvider = null, // Not stored in local DB
            marketingConsent = false, // Not stored in local DB
            dataUsageConsent = false, // Not stored in local DB
            createdAt = createdAt,
            updatedAt = modifiedAt,
            lastLoginAt = lastLoginAt,
            lastPasswordChanged = null, // Not stored in local DB
            modifiedBy = modifiedBy,
            version = version
        )
    }

    /**
     * Validates entity data integrity.
     *
     * @return true if all validations pass
     */
    fun validate(): Boolean {
        return id.isNotBlank() &&
                validateEmail(email) &&
                name.isNotBlank() &&
                createdAt > 0 &&
                lastLoginAt >= createdAt &&
                modifiedAt >= createdAt &&
                version >= 0 &&
                createdBy.isNotBlank() &&
                modifiedBy.isNotBlank()
    }

    private fun validateEmail(email: String): Boolean {
        val emailPattern = Pattern.compile(
            "[a-zA-Z0-9+._%\\-]{1,256}" +
                    "@" +
                    "[a-zA-Z0-9][a-zA-Z0-9\\-]{0,64}" +
                    "(" +
                    "\\." +
                    "[a-zA-Z0-9][a-zA-Z0-9\\-]{0,25}" +
                    ")+"
        )
        return emailPattern.matcher(email).matches()
    }

    companion object {
        private const val SYNC_THRESHOLD_MS = 5 * 60 * 1000L // 5 minutes
    }
}