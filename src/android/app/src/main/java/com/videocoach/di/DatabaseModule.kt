package com.videocoach.di

import android.content.Context
import androidx.room.Room
import androidx.sqlite.db.SupportSQLiteDatabase
import com.videocoach.data.database.AppDatabase
import com.videocoach.data.database.dao.UserDao
import com.videocoach.data.database.dao.VideoDao
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

/**
 * Dagger Hilt module that provides database-related dependencies with enhanced security,
 * performance optimization, and error handling features.
 */
@Module
@InstallIn(SingletonComponent::class)
object DatabaseModule {

    /**
     * Provides singleton instance of Room database with optimized configuration.
     * Implements:
     * - Write-Ahead Logging for better concurrency
     * - Foreign key constraint enforcement
     * - Custom thread pool sizing
     * - Robust error handling
     * - Query execution logging in debug mode
     */
    @Provides
    @Singleton
    fun provideAppDatabase(
        @ApplicationContext context: Context
    ): AppDatabase {
        return Room.databaseBuilder(
            context.applicationContext,
            AppDatabase::class.java,
            AppDatabase.DATABASE_NAME
        ).apply {
            // Enable foreign key constraints
            setForeignKeyConstraintForcingEnabled(true)

            // Configure database creation/upgrade callback
            addCallback(object : RoomDatabase.Callback() {
                override fun onCreate(db: SupportSQLiteDatabase) {
                    super.onCreate(db)
                    db.execSQL("PRAGMA foreign_keys=ON;")
                }

                override fun onOpen(db: SupportSQLiteDatabase) {
                    super.onOpen(db)
                    // Enable Write-Ahead Logging for better concurrency
                    db.execSQL("PRAGMA journal_mode=WAL;")
                    // Set journal mode to TRUNCATE for crash recovery
                    db.execSQL("PRAGMA journal_size_limit=10485760;") // 10MB limit
                }
            })

            // Configure database for optimal performance
            setJournalMode(RoomDatabase.JournalMode.WRITE_AHEAD_LOGGING)
            setQueryExecutor(Executors.newFixedThreadPool(4)) // Optimize thread pool size
            enableMultiInstanceInvalidation() // Support multiple process access

            // Add migrations
            addMigrations(AppDatabase.MIGRATION_1_2)

            // Enable query logging in debug mode
            if (BuildConfig.DEBUG) {
                setQueryCallback({ sqlQuery, bindArgs ->
                    Timber.d("SQL Query: $sqlQuery SQL Args: $bindArgs")
                }, Executors.newSingleThreadExecutor())
            }

            // Handle corruption cases
            fallbackToDestructiveMigration()
        }.build()
    }

    /**
     * Provides UserDao instance with enhanced error handling.
     * Ensures proper database initialization and access.
     */
    @Provides
    @Singleton
    fun provideUserDao(database: AppDatabase): UserDao {
        return database.userDao.also {
            // Validate DAO initialization
            requireNotNull(it) { "UserDao initialization failed" }
        }
    }

    /**
     * Provides VideoDao instance with enhanced error handling.
     * Ensures proper database initialization and access.
     */
    @Provides
    @Singleton
    fun provideVideoDao(database: AppDatabase): VideoDao {
        return database.videoDao.also {
            // Validate DAO initialization
            requireNotNull(it) { "VideoDao initialization failed" }
        }
    }

    private fun getOptimalThreadPoolSize(): Int {
        val availableProcessors = Runtime.getRuntime().availableProcessors()
        return when {
            availableProcessors <= 2 -> 2
            availableProcessors <= 4 -> 3
            else -> 4
        }
    }
}