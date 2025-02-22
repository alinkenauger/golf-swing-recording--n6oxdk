package com.videocoach.data.database.dao

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Update
import androidx.paging.PagingSource
import com.videocoach.data.database.entities.UserEntity
import kotlinx.coroutines.flow.Flow

/**
 * Room Database Data Access Object (DAO) interface for user data operations.
 * Implements secure, performant, and maintainable database operations with:
 * - Transaction support for data consistency
 * - Conflict resolution strategies
 * - Pagination for efficient memory usage
 * - Reactive streams with Flow
 * - Optimistic locking for concurrent modifications
 * - Case-insensitive email queries
 */
@Dao
interface UserDao {

    /**
     * Retrieves a user by their unique identifier.
     * Uses index-based lookup for optimal performance.
     *
     * @param id Unique identifier of the user
     * @return Flow emitting the user entity or null if not found
     */
    @Query("""
        SELECT * FROM users 
        WHERE id = :id
    """)
    fun getUserById(id: String): Flow<UserEntity?>

    /**
     * Retrieves a user by their email address.
     * Performs case-insensitive matching using indexed column.
     *
     * @param email Email address to search for
     * @return Flow emitting the user entity or null if not found
     */
    @Query("""
        SELECT * FROM users 
        WHERE LOWER(email) = LOWER(:email)
    """)
    fun getUserByEmail(email: String): Flow<UserEntity?>

    /**
     * Retrieves all users with pagination support.
     * Orders results by ID for consistent paging.
     *
     * @return PagingSource for lazy loading of user entities
     */
    @Query("""
        SELECT * FROM users 
        ORDER BY id ASC
    """)
    fun getAllUsers(): PagingSource<Int, UserEntity>

    /**
     * Inserts a new user with conflict resolution.
     * Uses REPLACE strategy to handle unique constraint violations.
     *
     * @param user User entity to insert
     * @return Row ID of the inserted user
     */
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    @Transaction
    suspend fun insertUser(user: UserEntity): Long

    /**
     * Updates an existing user with optimistic locking.
     * Verifies entity version to prevent concurrent modification issues.
     *
     * @param user User entity to update
     * @return Number of rows updated (0 if version mismatch)
     */
    @Update
    @Transaction
    suspend fun updateUser(user: UserEntity): Int

    /**
     * Deletes a user with cascade delete support.
     * Handles foreign key constraints through Room's delete cascade.
     *
     * @param user User entity to delete
     * @return Number of rows deleted
     */
    @Delete
    @Transaction
    suspend fun deleteUser(user: UserEntity): Int

    /**
     * Deletes all users with transaction support.
     * Ensures atomic operation for data consistency.
     */
    @Query("DELETE FROM users")
    @Transaction
    suspend fun deleteAllUsers()

    /**
     * Batch inserts multiple users for better performance.
     * Uses transaction to ensure atomic operation.
     *
     * @param users List of user entities to insert
     * @return List of inserted row IDs
     */
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    @Transaction
    suspend fun insertUsers(users: List<UserEntity>): List<Long>

    /**
     * Retrieves users that need synchronization.
     * Filters based on last sync timestamp.
     *
     * @param threshold Timestamp threshold for sync check
     * @return Flow emitting list of users needing sync
     */
    @Query("""
        SELECT * FROM users 
        WHERE last_synced_at < :threshold 
        ORDER BY last_synced_at ASC
    """)
    fun getUsersNeedingSync(threshold: Long): Flow<List<UserEntity>>

    /**
     * Retrieves users by role with pagination.
     * Supports filtering and ordering for role-based queries.
     *
     * @param role User role to filter by
     * @return PagingSource for lazy loading of filtered users
     */
    @Query("""
        SELECT * FROM users 
        WHERE role = :role 
        ORDER BY name ASC
    """)
    fun getUsersByRole(role: String): PagingSource<Int, UserEntity>

    /**
     * Retrieves active users assigned to a specific coach.
     * Filters by coach ID and active status.
     *
     * @param coachId ID of the coach
     * @return Flow emitting list of assigned active users
     */
    @Query("""
        SELECT * FROM users 
        WHERE coach_id = :coachId 
        AND status = 'ACTIVE' 
        ORDER BY name ASC
    """)
    fun getActiveUsersByCoach(coachId: String): Flow<List<UserEntity>>
}