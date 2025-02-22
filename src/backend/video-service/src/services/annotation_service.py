"""
Annotation Service Module
Provides enhanced business logic for managing video annotations with security,
performance monitoring, and voice-over support.

External Dependencies:
tenacity==8.2.2
"""

import asyncio
from typing import Dict, List, Optional, Tuple
from tenacity import retry, stop_after_attempt, wait_exponential

from ..models.annotation import Annotation, DrawingAnnotation, VoiceOverAnnotation
from ..repositories.annotation_repository import AnnotationRepository
from ..services.storage_service import StorageService
from ..utils.metrics import VideoMetrics
from ..utils.logger import VideoServiceLogger

class AnnotationService:
    """Enhanced service class for managing video annotation operations with performance monitoring and security features."""

    def __init__(
        self,
        repository: AnnotationRepository,
        storage_service: StorageService,
        metrics_service: VideoMetrics,
        max_retries: int = 3,
        timeout_seconds: int = 30
    ) -> None:
        """
        Initialize annotation service with required dependencies and configuration.

        Args:
            repository: Repository for annotation data access
            storage_service: Service for handling file storage
            metrics_service: Service for metrics collection
            max_retries: Maximum retry attempts for operations
            timeout_seconds: Operation timeout in seconds
        """
        self._repository = repository
        self._storage = storage_service
        self._metrics = metrics_service
        self._logger = VideoServiceLogger("annotation-service")
        self._max_retries = max_retries
        self._timeout_seconds = timeout_seconds
        self._cache: Dict[str, Dict] = {}

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=4, max=10)
    )
    async def create_drawing_annotation(
        self,
        video_id: str,
        user_id: str,
        timestamp: float,
        drawing_data: DrawingAnnotation
    ) -> Annotation:
        """
        Creates a new drawing annotation with enhanced validation and monitoring.

        Args:
            video_id: Video identifier
            user_id: User creating the annotation
            timestamp: Timestamp in video
            drawing_data: Drawing annotation data

        Returns:
            Created annotation object

        Raises:
            ValueError: If validation fails
            Exception: If creation fails
        """
        try:
            with self._metrics.track_processing_duration(video_id, "annotation_creation"):
                # Validate input data
                if not drawing_data.validate():
                    raise ValueError("Invalid drawing annotation data")

                # Create annotation object
                annotation = Annotation(
                    video_id=video_id,
                    user_id=user_id,
                    type="drawing",
                    timestamp=timestamp,
                    data=drawing_data
                )

                # Validate annotation
                if not annotation.validate():
                    raise ValueError("Invalid annotation")

                # Create in repository
                annotation_id = await self._repository.create(annotation)
                
                # Update cache
                self._cache[annotation_id] = annotation.to_dict()

                # Record metrics
                self._metrics.track_storage_operation("annotation_create", "success")

                self._logger.info(
                    "Drawing annotation created",
                    extra={
                        "video_id": video_id,
                        "user_id": user_id,
                        "annotation_id": annotation_id
                    }
                )

                return annotation

        except Exception as e:
            self._metrics.record_error("annotation_creation", "error")
            self._logger.error(
                "Failed to create drawing annotation",
                exc_info=e,
                extra={"video_id": video_id, "user_id": user_id}
            )
            raise

    async def create_voice_over(
        self,
        video_id: str,
        user_id: str,
        timestamp: float,
        audio_data: bytes,
        file_name: str,
        metadata: Dict
    ) -> Annotation:
        """
        Creates voice-over annotation with enhanced file handling and CDN integration.

        Args:
            video_id: Video identifier
            user_id: User creating the voice-over
            timestamp: Timestamp in video
            audio_data: Raw audio file content
            file_name: Original audio file name
            metadata: Additional metadata

        Returns:
            Created voice-over annotation

        Raises:
            ValueError: If validation fails
            Exception: If creation fails
        """
        try:
            with self._metrics.track_processing_duration(video_id, "voice_over_creation"):
                # Validate audio file
                is_valid, error_msg = self._storage.validate_file(
                    audio_data,
                    file_name,
                    allowed_types=["audio/mp3", "audio/wav", "audio/m4a"]
                )
                if not is_valid:
                    raise ValueError(f"Invalid audio file: {error_msg}")

                # Upload audio file
                success, error, cdn_url = await self._storage.upload_video(
                    audio_data,
                    file_name,
                    f"voice-overs/{video_id}"
                )
                if not success:
                    raise Exception(f"Failed to upload voice-over: {error}")

                # Create voice-over data
                voice_over_data = VoiceOverAnnotation(
                    audio_url=cdn_url,
                    duration=metadata.get("duration", 0),
                    format=metadata.get("format", ""),
                    size_bytes=len(audio_data),
                    metadata=metadata
                )

                # Create annotation
                annotation = Annotation(
                    video_id=video_id,
                    user_id=user_id,
                    type="voice-over",
                    timestamp=timestamp,
                    data=voice_over_data
                )

                # Validate annotation
                if not annotation.validate():
                    raise ValueError("Invalid voice-over annotation")

                # Create in repository
                annotation_id = await self._repository.create(annotation)
                
                # Update cache
                self._cache[annotation_id] = annotation.to_dict()

                # Record metrics
                self._metrics.track_storage_operation("voice_over_create", "success")

                self._logger.info(
                    "Voice-over annotation created",
                    extra={
                        "video_id": video_id,
                        "user_id": user_id,
                        "annotation_id": annotation_id,
                        "cdn_url": cdn_url
                    }
                )

                return annotation

        except Exception as e:
            self._metrics.record_error("voice_over_creation", "error")
            self._logger.error(
                "Failed to create voice-over annotation",
                exc_info=e,
                extra={"video_id": video_id, "user_id": user_id}
            )
            raise

    async def get_video_annotations(
        self,
        video_id: str,
        annotation_type: Optional[str] = None,
        page_size: int = 100,
        page_number: int = 1
    ) -> List[Annotation]:
        """
        Retrieves paginated annotations for a video with optional type filtering.

        Args:
            video_id: Video identifier
            annotation_type: Optional type filter
            page_size: Number of items per page
            page_number: Page number to retrieve

        Returns:
            List of annotations
        """
        try:
            annotations = await self._repository.get_by_video(
                video_id,
                page_size,
                page_number
            )

            if annotation_type:
                annotations = [a for a in annotations if a.type == annotation_type]

            self._logger.info(
                "Retrieved video annotations",
                extra={
                    "video_id": video_id,
                    "count": len(annotations),
                    "type": annotation_type
                }
            )

            return annotations

        except Exception as e:
            self._metrics.record_error("annotation_retrieval", "error")
            self._logger.error(
                "Failed to retrieve annotations",
                exc_info=e,
                extra={"video_id": video_id}
            )
            raise

    async def delete_annotation(self, annotation_id: str, user_id: str) -> bool:
        """
        Deletes an annotation with user verification.

        Args:
            annotation_id: Annotation identifier
            user_id: User requesting deletion

        Returns:
            Success status

        Raises:
            ValueError: If user is not authorized
            Exception: If deletion fails
        """
        try:
            # Get annotation
            annotation = await self._repository.get_by_id(annotation_id)
            if not annotation:
                raise ValueError("Annotation not found")

            # Verify user permission
            if annotation.user_id != user_id:
                raise ValueError("Unauthorized to delete annotation")

            # Delete annotation
            success = await self._repository.delete(annotation_id)
            if success:
                # Remove from cache
                self._cache.pop(annotation_id, None)

                # Clean up voice-over file if needed
                if annotation.type == "voice-over":
                    await self._storage.delete_video(annotation.data.audio_url)

            self._logger.info(
                "Annotation deleted",
                extra={
                    "annotation_id": annotation_id,
                    "user_id": user_id
                }
            )

            return success

        except Exception as e:
            self._metrics.record_error("annotation_deletion", "error")
            self._logger.error(
                "Failed to delete annotation",
                exc_info=e,
                extra={"annotation_id": annotation_id}
            )
            raise