"""
Annotation Repository Module
Provides high-performance CRUD operations for video annotations with comprehensive error handling,
logging, and metrics collection.

External Dependencies:
motor==3.3.1 - Async MongoDB driver
pymongo==4.5.0 - MongoDB operations
"""

from datetime import datetime
from typing import List, Dict, Any, Optional
import motor.motor_asyncio
from pymongo import IndexModel, ASCENDING
from pymongo.errors import PyMongoError, DuplicateKeyError

from ..models.annotation import Annotation
from ..utils.logger import VideoServiceLogger
from ..utils.metrics import VideoMetrics

# Collection and index configuration
COLLECTION_NAME = "annotations"
DEFAULT_SORT = {"timestamp": 1}
INDEXES = [
    IndexModel([("video_id", ASCENDING)]),
    IndexModel([("user_id", ASCENDING)]),
    IndexModel([("type", ASCENDING)]),
    IndexModel([("video_id", ASCENDING), ("timestamp", ASCENDING)])
]

class AnnotationRepository:
    """Repository class for managing video annotation data with optimized performance."""

    def __init__(self, db: motor.motor_asyncio.AsyncIOMotorDatabase) -> None:
        """
        Initialize the annotation repository.

        Args:
            db: AsyncIOMotorDatabase instance
        """
        self._db = db
        self._collection = db[COLLECTION_NAME]
        self._logger = VideoServiceLogger(service_name="annotation-repository")
        self._metrics = VideoMetrics()
        self._ensure_indexes()

    async def _ensure_indexes(self) -> None:
        """Create optimized indexes for annotation queries."""
        try:
            for index in INDEXES:
                await self._collection.create_index(index)
            self._logger.info("Annotation indexes created successfully")
        except PyMongoError as e:
            self._logger.error(
                "Failed to create annotation indexes",
                exc_info=e,
                extra={"indexes": str(INDEXES)}
            )
            self._metrics.record_error("database", "critical")
            raise

    async def create(self, annotation: Annotation) -> str:
        """
        Create a new annotation with validation.

        Args:
            annotation: Annotation object to create

        Returns:
            str: Created annotation ID

        Raises:
            ValueError: If annotation validation fails
            PyMongoError: If database operation fails
        """
        try:
            if not annotation.validate():
                raise ValueError("Invalid annotation data")

            doc = annotation.to_dict()
            doc["created_at"] = datetime.utcnow()
            doc["updated_at"] = doc["created_at"]

            result = await self._collection.insert_one(doc)
            
            self._logger.info(
                "Annotation created successfully",
                extra={
                    "annotation_id": str(result.inserted_id),
                    "video_id": annotation.video_id
                }
            )
            return str(result.inserted_id)

        except ValueError as e:
            self._logger.error(
                "Annotation validation failed",
                exc_info=e,
                extra={"video_id": annotation.video_id}
            )
            self._metrics.record_error("validation", "error")
            raise

        except PyMongoError as e:
            self._logger.error(
                "Failed to create annotation",
                exc_info=e,
                extra={"video_id": annotation.video_id}
            )
            self._metrics.record_error("database", "error")
            raise

    async def get_by_id(self, annotation_id: str) -> Optional[Annotation]:
        """
        Retrieve annotation by ID.

        Args:
            annotation_id: Annotation identifier

        Returns:
            Optional[Annotation]: Found annotation or None
        """
        try:
            doc = await self._collection.find_one({"_id": annotation_id})
            if not doc:
                return None

            annotation = Annotation(**doc)
            self._logger.info(
                "Annotation retrieved successfully",
                extra={"annotation_id": annotation_id}
            )
            return annotation

        except PyMongoError as e:
            self._logger.error(
                "Failed to retrieve annotation",
                exc_info=e,
                extra={"annotation_id": annotation_id}
            )
            self._metrics.record_error("database", "error")
            raise

    async def get_by_video(
        self,
        video_id: str,
        page_size: int = 100,
        page_number: int = 1
    ) -> List[Annotation]:
        """
        Retrieve paginated annotations for a video.

        Args:
            video_id: Video identifier
            page_size: Number of items per page
            page_number: Page number to retrieve

        Returns:
            List[Annotation]: List of annotations
        """
        try:
            skip = (page_number - 1) * page_size
            cursor = self._collection.find(
                {"video_id": video_id}
            ).sort(
                [("timestamp", ASCENDING)]
            ).skip(skip).limit(page_size)

            annotations = []
            async for doc in cursor:
                annotations.append(Annotation(**doc))

            self._logger.info(
                "Video annotations retrieved successfully",
                extra={
                    "video_id": video_id,
                    "count": len(annotations),
                    "page": page_number
                }
            )
            return annotations

        except PyMongoError as e:
            self._logger.error(
                "Failed to retrieve video annotations",
                exc_info=e,
                extra={"video_id": video_id}
            )
            self._metrics.record_error("database", "error")
            raise

    async def update(self, annotation_id: str, annotation: Annotation) -> bool:
        """
        Update an existing annotation.

        Args:
            annotation_id: Annotation identifier
            annotation: Updated annotation data

        Returns:
            bool: True if update successful

        Raises:
            ValueError: If annotation validation fails
            PyMongoError: If database operation fails
        """
        try:
            if not annotation.validate():
                raise ValueError("Invalid annotation data")

            update_data = annotation.to_dict()
            update_data["updated_at"] = datetime.utcnow()

            result = await self._collection.update_one(
                {"_id": annotation_id},
                {"$set": update_data}
            )

            success = result.modified_count > 0
            if success:
                self._logger.info(
                    "Annotation updated successfully",
                    extra={"annotation_id": annotation_id}
                )
            else:
                self._logger.warning(
                    "Annotation not found for update",
                    extra={"annotation_id": annotation_id}
                )

            return success

        except ValueError as e:
            self._logger.error(
                "Invalid annotation update data",
                exc_info=e,
                extra={"annotation_id": annotation_id}
            )
            self._metrics.record_error("validation", "error")
            raise

        except PyMongoError as e:
            self._logger.error(
                "Failed to update annotation",
                exc_info=e,
                extra={"annotation_id": annotation_id}
            )
            self._metrics.record_error("database", "error")
            raise

    async def delete(self, annotation_id: str) -> bool:
        """
        Delete an annotation.

        Args:
            annotation_id: Annotation identifier

        Returns:
            bool: True if deletion successful
        """
        try:
            result = await self._collection.delete_one({"_id": annotation_id})
            
            success = result.deleted_count > 0
            if success:
                self._logger.info(
                    "Annotation deleted successfully",
                    extra={"annotation_id": annotation_id}
                )
            else:
                self._logger.warning(
                    "Annotation not found for deletion",
                    extra={"annotation_id": annotation_id}
                )

            return success

        except PyMongoError as e:
            self._logger.error(
                "Failed to delete annotation",
                exc_info=e,
                extra={"annotation_id": annotation_id}
            )
            self._metrics.record_error("database", "error")
            raise

    async def delete_by_video(self, video_id: str) -> int:
        """
        Delete all annotations for a video.

        Args:
            video_id: Video identifier

        Returns:
            int: Number of annotations deleted
        """
        try:
            result = await self._collection.delete_many({"video_id": video_id})
            
            self._logger.info(
                "Video annotations deleted successfully",
                extra={
                    "video_id": video_id,
                    "count": result.deleted_count
                }
            )
            return result.deleted_count

        except PyMongoError as e:
            self._logger.error(
                "Failed to delete video annotations",
                exc_info=e,
                extra={"video_id": video_id}
            )
            self._metrics.record_error("database", "error")
            raise