"""
Video Repository Module
Provides optimized data access layer for video management with enhanced performance and reliability.

External Dependencies:
motor==3.3.1
pymongo==4.5.0
cachetools==5.3.1
"""

import asyncio
from datetime import datetime
from typing import List, Dict, Optional, Union
from motor.motor_asyncio import AsyncIOMotorDatabase, AsyncIOMotorCollection
from pymongo import ASCENDING, DESCENDING, TEXT
from pymongo.errors import PyMongoError
from cachetools import TTLCache

from ..models.video import Video
from ..utils.logger import VideoServiceLogger
from ..utils.metrics import VideoMetrics

# Collection configuration
COLLECTION_NAME = "videos"
DEFAULT_SORT = {"created_at": -1}
VIDEO_BATCH_SIZE = 100
CACHE_TTL = 300  # 5 minutes
MAX_RETRIES = 3
RETRY_DELAY = 1.0

class VideoRepository:
    """Enhanced repository class for video data persistence with optimized performance."""

    def __init__(
        self,
        db: AsyncIOMotorDatabase,
        cache_ttl: int = CACHE_TTL,
        max_retries: int = MAX_RETRIES,
        retry_delay: float = RETRY_DELAY
    ) -> None:
        """Initialize repository with database connection and caching."""
        self._db = db
        self._collection = db[COLLECTION_NAME]
        self._cache = TTLCache(maxsize=1000, ttl=cache_ttl)
        self._retry_count = max_retries
        self._retry_delay = retry_delay
        
        # Initialize logger and metrics
        self._logger = VideoServiceLogger(
            service_name="video-repository",
            enable_json=True
        )
        self._metrics = VideoMetrics()

    async def create_indexes(self) -> None:
        """Creates optimized MongoDB indexes for video collection."""
        try:
            # Compound index for user video queries
            await self._collection.create_index(
                [("user_id", ASCENDING), ("created_at", DESCENDING)],
                background=True
            )

            # Text index for search functionality
            await self._collection.create_index(
                [("title", TEXT), ("description", TEXT)],
                background=True
            )

            # Status index for video processing queries
            await self._collection.create_index(
                "status",
                background=True
            )

            # Metadata index for technical queries
            await self._collection.create_index(
                [("metadata.format", ASCENDING), ("metadata.duration", ASCENDING)],
                background=True
            )

            self._logger.info("Video collection indexes created successfully")
        except PyMongoError as e:
            self._logger.error("Failed to create indexes", exc_info=e)
            self._metrics.record_error("database", "critical")
            raise

    async def create(self, video: Video) -> str:
        """Creates a new video document with retry logic and validation."""
        video_dict = video.to_dict()
        video_dict["created_at"] = datetime.utcnow()
        video_dict["updated_at"] = video_dict["created_at"]

        for attempt in range(self._retry_count):
            try:
                result = await self._collection.insert_one(video_dict)
                video_id = str(result.inserted_id)
                
                # Update cache
                self._cache[video_id] = video_dict
                
                # Record metrics
                self._metrics.record_upload_size(video.metadata.size_bytes)
                
                self._logger.info(
                    "Video created successfully",
                    extra={"video_id": video_id, "user_id": video.user_id}
                )
                return video_id

            except PyMongoError as e:
                if attempt == self._retry_count - 1:
                    self._logger.error(
                        "Failed to create video after retries",
                        exc_info=e,
                        extra={"user_id": video.user_id}
                    )
                    self._metrics.record_error("database", "error")
                    raise
                await asyncio.sleep(self._retry_delay)

    async def get_by_id(self, video_id: str) -> Optional[Video]:
        """Retrieves video by ID with caching."""
        # Check cache first
        if video_id in self._cache:
            self._logger.debug("Cache hit for video", extra={"video_id": video_id})
            return Video.from_dict(self._cache[video_id])

        try:
            video_dict = await self._collection.find_one({"_id": video_id})
            if video_dict:
                # Update cache
                self._cache[video_id] = video_dict
                return Video.from_dict(video_dict)
            return None

        except PyMongoError as e:
            self._logger.error(
                "Failed to retrieve video",
                exc_info=e,
                extra={"video_id": video_id}
            )
            self._metrics.record_error("database", "error")
            raise

    async def get_by_user(
        self,
        user_id: str,
        skip: int = 0,
        limit: int = VIDEO_BATCH_SIZE,
        status: Optional[str] = None
    ) -> List[Video]:
        """Retrieves user's videos with pagination and filtering."""
        try:
            query = {"user_id": user_id}
            if status:
                query["status"] = status

            cursor = self._collection.find(query)
            cursor.sort(DEFAULT_SORT)
            cursor.skip(skip).limit(limit)

            videos = []
            async for video_dict in cursor:
                video = Video.from_dict(video_dict)
                videos.append(video)
                # Update cache
                self._cache[str(video_dict["_id"])] = video_dict

            return videos

        except PyMongoError as e:
            self._logger.error(
                "Failed to retrieve user videos",
                exc_info=e,
                extra={"user_id": user_id}
            )
            self._metrics.record_error("database", "error")
            raise

    async def update_status(
        self,
        video_id: str,
        status: str,
        metadata: Optional[Dict] = None
    ) -> bool:
        """Updates video processing status with metadata."""
        update_data = {
            "$set": {
                "status": status,
                "updated_at": datetime.utcnow()
            }
        }
        
        if metadata:
            update_data["$set"]["processing_history." + status] = {
                "timestamp": datetime.utcnow(),
                "metadata": metadata
            }

        try:
            result = await self._collection.update_one(
                {"_id": video_id},
                update_data
            )
            
            # Invalidate cache
            self._cache.pop(video_id, None)
            
            success = result.modified_count > 0
            if success:
                self._logger.info(
                    "Video status updated",
                    extra={
                        "video_id": video_id,
                        "status": status
                    }
                )
            return success

        except PyMongoError as e:
            self._logger.error(
                "Failed to update video status",
                exc_info=e,
                extra={"video_id": video_id}
            )
            self._metrics.record_error("database", "error")
            raise

    async def add_variant(
        self,
        video_id: str,
        variant_data: Dict
    ) -> bool:
        """Adds a new video quality variant."""
        try:
            result = await self._collection.update_one(
                {"_id": video_id},
                {
                    "$push": {"variants": variant_data},
                    "$set": {"updated_at": datetime.utcnow()}
                }
            )
            
            # Invalidate cache
            self._cache.pop(video_id, None)
            
            success = result.modified_count > 0
            if success:
                self._logger.info(
                    "Video variant added",
                    extra={
                        "video_id": video_id,
                        "quality": variant_data.get("quality")
                    }
                )
            return success

        except PyMongoError as e:
            self._logger.error(
                "Failed to add video variant",
                exc_info=e,
                extra={"video_id": video_id}
            )
            self._metrics.record_error("database", "error")
            raise

    async def delete(self, video_id: str) -> bool:
        """Deletes video document with cache invalidation."""
        try:
            result = await self._collection.delete_one({"_id": video_id})
            
            # Remove from cache
            self._cache.pop(video_id, None)
            
            success = result.deleted_count > 0
            if success:
                self._logger.info(
                    "Video deleted",
                    extra={"video_id": video_id}
                )
                self._metrics.track_storage_operation("delete", "success")
            return success

        except PyMongoError as e:
            self._logger.error(
                "Failed to delete video",
                exc_info=e,
                extra={"video_id": video_id}
            )
            self._metrics.record_error("database", "error")
            self._metrics.track_storage_operation("delete", "failure")
            raise

    async def search(
        self,
        query: str,
        skip: int = 0,
        limit: int = VIDEO_BATCH_SIZE
    ) -> List[Video]:
        """Performs text search across video titles and descriptions."""
        try:
            cursor = self._collection.find(
                {"$text": {"$search": query}},
                {"score": {"$meta": "textScore"}}
            )
            cursor.sort([("score", {"$meta": "textScore"})])
            cursor.skip(skip).limit(limit)

            videos = []
            async for video_dict in cursor:
                video = Video.from_dict(video_dict)
                videos.append(video)
                # Update cache
                self._cache[str(video_dict["_id"])] = video_dict

            return videos

        except PyMongoError as e:
            self._logger.error(
                "Failed to perform video search",
                exc_info=e,
                extra={"query": query}
            )
            self._metrics.record_error("database", "error")
            raise

    async def bulk_update(
        self,
        filter_query: Dict,
        update_data: Dict
    ) -> int:
        """Performs bulk update operations with cache invalidation."""
        try:
            result = await self._collection.update_many(
                filter_query,
                {"$set": {**update_data, "updated_at": datetime.utcnow()}}
            )
            
            # Clear entire cache due to bulk operation
            self._cache.clear()
            
            modified_count = result.modified_count
            self._logger.info(
                "Bulk update completed",
                extra={
                    "modified_count": modified_count,
                    "filter": filter_query
                }
            )
            return modified_count

        except PyMongoError as e:
            self._logger.error(
                "Failed to perform bulk update",
                exc_info=e,
                extra={"filter": filter_query}
            )
            self._metrics.record_error("database", "error")
            raise