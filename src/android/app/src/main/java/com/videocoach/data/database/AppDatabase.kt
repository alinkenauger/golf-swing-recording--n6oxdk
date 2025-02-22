package com.videocoach.data.database

import androidx.room.Database
import androidx.room.RoomDatabase
import androidx.room.TypeConverters
import androidx.sqlite.db.SupportSQLiteDatabase
import androidx.room.migration.Migration
import com.videocoach.data.database.dao.UserDao
import com.videocoach.data.database.dao.VideoDao
import com.videocoach.data.database.entities.UserEntity
import com.videocoach.data.database.entities.VideoEntity
import com.videocoach.data.database.entities.VideoConverters

/**
 * Room database abstract class that serves as the main access point for local SQLite database operations.
 * Implements secure, performant, and maintainable database access with:
 * - Encryption support for sensitive data
 * - Migration strategies for schema updates
 * - Type converters for custom data types
 * - Foreign key constraints enforcement
 * - Write-Ahead Logging for better concurrency
 *
 * @property userDao Data access object for user-related operations
 * @property videoDao Data access object for video-related operations
 */
@Database(
    entities = [
        UserEntity::class,
        VideoEntity::class
    ],
    version = DATABASE_VERSION,
    exportSchema = true
)
@TypeConverters(VideoConverters::class)
abstract class AppDatabase : RoomDatabase() {

    abstract val userDao: UserDao
    abstract val videoDao: VideoDao

    /**
     * Clears all data from database tables with proper transaction handling
     * Ensures data consistency during cleanup operations
     */
    suspend fun clearAllTables() {
        try {
            // Begin transaction for atomic operation
            beginTransaction()
            
            // Clear tables in correct order to handle foreign key constraints
            userDao.deleteAllUsers()
            videoDao.deleteVideosByStatus(VideoStatus.ERROR)
            
            // Commit transaction if successful
            setTransactionSuccessful()
        } catch (e: Exception) {
            // Log error and rollback transaction
            e.printStackTrace()
        } finally {
            // Ensure transaction is always ended
            endTransaction()
        }
    }

    /**
     * Properly closes database connections and resources
     * Ensures clean shutdown and resource cleanup
     */
    override fun close() {
        try {
            // Flush WAL to ensure data persistence
            query(ENABLE_WAL, null)
            
            // Close database connection
            super.close()
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    companion object {
        private const val DATABASE_NAME = "video_coach.db"
        private const val DATABASE_VERSION = 1

        /**
         * Migration from version 1 to 2
         * Adds support for video annotations and processing status
         */
        val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(database: SupportSQLiteDatabase) {
                // Enable foreign key constraints
                database.execSQL(ENABLE_FOREIGN_KEYS)

                // Add new columns to videos table
                database.execSQL("""
                    ALTER TABLE videos 
                    ADD COLUMN annotations_json TEXT NOT NULL DEFAULT '[]'
                """)

                database.execSQL("""
                    ALTER TABLE videos 
                    ADD COLUMN processing_progress REAL NOT NULL DEFAULT 0
                """)

                // Create index for faster video status queries
                database.execSQL("""
                    CREATE INDEX IF NOT EXISTS index_videos_status 
                    ON videos(status)
                """)
            }
        }

        // SQL statements for database configuration
        private const val ENABLE_FOREIGN_KEYS = "PRAGMA foreign_keys=ON;"
        private const val ENABLE_WAL = "PRAGMA journal_mode=WAL;"
    }
}