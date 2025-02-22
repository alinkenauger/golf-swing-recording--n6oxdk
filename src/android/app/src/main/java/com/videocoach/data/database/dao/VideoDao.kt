package com.videocoach.data.database.dao

import androidx.room.Dao // v2.6.x
import androidx.room.Query // v2.6.x
import androidx.room.Insert // v2.6.x
import androidx.room.Update // v2.6.x
import androidx.room.Delete // v2.6.x
import androidx.room.Transaction // v2.6.x
import androidx.room.OnConflictStrategy
import com.videocoach.data.database.entities.VideoEntity
import com.videocoach.domain.models.VideoStatus
import kotlinx.coroutines.flow.Flow // v1.7.x

/**
 * Room DAO interface for handling video-related database operations.
 * Provides optimized query performance with proper indexing and transaction support.
 * Implements reactive patterns using Kotlin Flow for real-time updates.
 */
@Dao
interface VideoDao {

    /**
     * Retrieves a video by its unique identifier with reactive updates
     * @param videoId Unique identifier of the video
     * @return Flow of nullable VideoEntity for real-time updates
     */
    @Query("""
        SELECT * FROM videos 
        WHERE id = :videoId
    """)
    fun getVideoById(videoId: String): Flow<VideoEntity?>

    /**
     * Retrieves all videos for a specific user, sorted by creation date
     * @param userId User's unique identifier
     * @return Flow of list containing user's videos
     */
    @Query("""
        SELECT * FROM videos 
        WHERE user_id = :userId 
        ORDER BY created_at DESC
    """)
    fun getVideosByUserId(userId: String): Flow<List<VideoEntity>>

    /**
     * Retrieves all videos associated with a specific coach
     * @param coachId Coach's unique identifier
     * @return Flow of list containing coach's videos
     */
    @Query("""
        SELECT * FROM videos 
        WHERE coach_id = :coachId 
        ORDER BY created_at DESC
    """)
    fun getVideosByCoachId(coachId: String): Flow<List<VideoEntity>>

    /**
     * Retrieves videos by their processing status
     * @param status Video processing status
     * @return Flow of list containing videos with specified status
     */
    @Query("""
        SELECT * FROM videos 
        WHERE status = :status 
        ORDER BY created_at DESC
    """)
    fun getVideosByStatus(status: VideoStatus): Flow<List<VideoEntity>>

    /**
     * Retrieves videos that need processing or have errors
     * @return Flow of list containing videos requiring attention
     */
    @Query("""
        SELECT * FROM videos 
        WHERE status IN ('UPLOADING', 'PROCESSING', 'GENERATING_VARIANTS', 'ERROR') 
        ORDER BY created_at ASC
    """)
    fun getPendingVideos(): Flow<List<VideoEntity>>

    /**
     * Inserts a new video with conflict resolution
     * @param video Video entity to insert
     * @return Row ID of inserted entity
     */
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertVideo(video: VideoEntity): Long

    /**
     * Inserts multiple videos in a single transaction
     * @param videos List of video entities to insert
     * @return List of inserted row IDs
     */
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertVideos(videos: List<VideoEntity>): List<Long>

    /**
     * Updates video status and processing progress atomically
     * @param videoId Video's unique identifier
     * @param status New processing status
     * @param progress Processing progress (0-100)
     */
    @Transaction
    @Query("""
        UPDATE videos 
        SET status = :status, 
            processing_progress = :progress,
            updated_at = :timestamp 
        WHERE id = :videoId
    """)
    suspend fun updateVideoStatus(
        videoId: String,
        status: VideoStatus,
        progress: Float,
        timestamp: Long = System.currentTimeMillis()
    )

    /**
     * Updates video annotations with transaction support
     * @param videoId Video's unique identifier
     * @param annotationsJson JSON string of annotations
     */
    @Transaction
    @Query("""
        UPDATE videos 
        SET annotations_json = :annotationsJson,
            updated_at = :timestamp 
        WHERE id = :videoId
    """)
    suspend fun updateVideoAnnotations(
        videoId: String,
        annotationsJson: String,
        timestamp: Long = System.currentTimeMillis()
    )

    /**
     * Deletes a video by its ID
     * @param videoId Video's unique identifier
     * @return Number of rows affected
     */
    @Query("DELETE FROM videos WHERE id = :videoId")
    suspend fun deleteVideo(videoId: String): Int

    /**
     * Deletes all videos with specified status
     * @param status Status of videos to delete
     * @return Number of rows affected
     */
    @Query("DELETE FROM videos WHERE status = :status")
    suspend fun deleteVideosByStatus(status: VideoStatus): Int

    /**
     * Counts videos by status
     * @param status Video processing status
     * @return Flow of count for real-time updates
     */
    @Query("SELECT COUNT(*) FROM videos WHERE status = :status")
    fun getVideoCountByStatus(status: VideoStatus): Flow<Int>

    /**
     * Retrieves videos created within a specific time range
     * @param startTime Start timestamp
     * @param endTime End timestamp
     * @return Flow of list containing videos within range
     */
    @Query("""
        SELECT * FROM videos 
        WHERE created_at BETWEEN :startTime AND :endTime 
        ORDER BY created_at DESC
    """)
    fun getVideosByTimeRange(startTime: Long, endTime: Long): Flow<List<VideoEntity>>
}