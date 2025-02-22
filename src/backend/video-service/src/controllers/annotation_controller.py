"""
Annotation Controller Module
Provides FastAPI endpoints for video annotation operations with enhanced security,
monitoring and performance features.

External Dependencies:
fastapi==0.104.0
pydantic==2.4.0
prometheus_client==0.17.1
redis==5.0.1
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Security, UploadFile, File
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from prometheus_client import Counter, Histogram
import time

from ..models.annotation import Annotation, DrawingAnnotation, VoiceOverAnnotation
from ..services.annotation_service import AnnotationService
from ..utils.logger import VideoServiceLogger
from ..utils.metrics import VideoMetrics
from ..utils.validators import validate_annotation, validate_hex_color

# Initialize router with prefix and tags
router = APIRouter(prefix="/annotations", tags=["annotations"])

# Initialize security scheme
security = HTTPBearer()

# Initialize services
logger = VideoServiceLogger("annotation-controller")
metrics = VideoMetrics()

# Initialize metrics collectors
ANNOTATION_METRICS = Counter(
    'annotation_operations_total',
    'Total annotation operations',
    ['operation_type', 'status']
)

ANNOTATION_LATENCY = Histogram(
    'annotation_operation_latency_seconds',
    'Annotation operation latency',
    ['operation_type']
)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Security(security)) -> str:
    """Validates JWT token and returns user ID."""
    try:
        # Token validation would be implemented here
        user_id = "user_id_from_token"  # Placeholder
        return user_id
    except Exception as e:
        logger.error("Authentication failed", exc_info=e)
        raise HTTPException(status_code=401, detail="Invalid authentication credentials")

@router.post("/drawing")
async def create_drawing(
    video_id: str,
    drawing_data: DrawingAnnotation,
    current_user: str = Depends(get_current_user),
    annotation_service: AnnotationService = Depends()
) -> Annotation:
    """
    Creates a new drawing annotation with performance monitoring.
    
    Args:
        video_id: Video identifier
        drawing_data: Drawing annotation data
        current_user: Authenticated user ID
        annotation_service: Annotation service instance
    
    Returns:
        Created annotation object
    """
    start_time = time.perf_counter()
    try:
        # Validate drawing data
        if not drawing_data.validate():
            raise HTTPException(status_code=422, detail="Invalid drawing annotation data")

        # Create annotation
        annotation = await annotation_service.create_drawing_annotation(
            video_id=video_id,
            user_id=current_user,
            timestamp=drawing_data.timestamp,
            drawing_data=drawing_data
        )

        # Record metrics
        ANNOTATION_METRICS.labels(
            operation_type="create_drawing",
            status="success"
        ).inc()

        logger.info(
            "Drawing annotation created",
            extra={
                "video_id": video_id,
                "user_id": current_user,
                "annotation_id": str(annotation.id)
            }
        )

        return annotation

    except Exception as e:
        ANNOTATION_METRICS.labels(
            operation_type="create_drawing",
            status="error"
        ).inc()
        
        logger.error(
            "Failed to create drawing annotation",
            exc_info=e,
            extra={"video_id": video_id, "user_id": current_user}
        )
        raise HTTPException(status_code=500, detail=str(e))

    finally:
        ANNOTATION_LATENCY.labels(
            operation_type="create_drawing"
        ).observe(time.perf_counter() - start_time)

@router.post("/voice-over")
async def create_voice_over(
    video_id: str,
    timestamp: float,
    audio_file: UploadFile = File(...),
    current_user: str = Depends(get_current_user),
    annotation_service: AnnotationService = Depends()
) -> Annotation:
    """
    Creates a new voice-over annotation with file validation.
    
    Args:
        video_id: Video identifier
        timestamp: Timestamp in video
        audio_file: Voice-over audio file
        current_user: Authenticated user ID
        annotation_service: Annotation service instance
    
    Returns:
        Created annotation object
    """
    start_time = time.perf_counter()
    try:
        # Read and validate audio file
        audio_content = await audio_file.read()
        if not audio_content:
            raise HTTPException(status_code=400, detail="Empty audio file")

        # Create voice-over annotation
        annotation = await annotation_service.create_voice_over(
            video_id=video_id,
            user_id=current_user,
            timestamp=timestamp,
            audio_data=audio_content,
            file_name=audio_file.filename,
            metadata={
                "content_type": audio_file.content_type,
                "size": len(audio_content)
            }
        )

        # Record metrics
        ANNOTATION_METRICS.labels(
            operation_type="create_voice_over",
            status="success"
        ).inc()

        logger.info(
            "Voice-over annotation created",
            extra={
                "video_id": video_id,
                "user_id": current_user,
                "annotation_id": str(annotation.id)
            }
        )

        return annotation

    except Exception as e:
        ANNOTATION_METRICS.labels(
            operation_type="create_voice_over",
            status="error"
        ).inc()
        
        logger.error(
            "Failed to create voice-over annotation",
            exc_info=e,
            extra={"video_id": video_id, "user_id": current_user}
        )
        raise HTTPException(status_code=500, detail=str(e))

    finally:
        ANNOTATION_LATENCY.labels(
            operation_type="create_voice_over"
        ).observe(time.perf_counter() - start_time)

@router.get("/{video_id}")
async def get_video_annotations(
    video_id: str,
    annotation_type: Optional[str] = None,
    page_size: int = 100,
    page_number: int = 1,
    current_user: str = Depends(get_current_user),
    annotation_service: AnnotationService = Depends()
) -> List[Annotation]:
    """
    Retrieves paginated annotations for a video.
    
    Args:
        video_id: Video identifier
        annotation_type: Optional type filter
        page_size: Number of items per page
        page_number: Page number to retrieve
        current_user: Authenticated user ID
        annotation_service: Annotation service instance
    
    Returns:
        List of annotations
    """
    start_time = time.perf_counter()
    try:
        annotations = await annotation_service.get_video_annotations(
            video_id=video_id,
            annotation_type=annotation_type,
            page_size=page_size,
            page_number=page_number
        )

        # Record metrics
        ANNOTATION_METRICS.labels(
            operation_type="get_annotations",
            status="success"
        ).inc()

        logger.info(
            "Retrieved video annotations",
            extra={
                "video_id": video_id,
                "count": len(annotations),
                "type": annotation_type
            }
        )

        return annotations

    except Exception as e:
        ANNOTATION_METRICS.labels(
            operation_type="get_annotations",
            status="error"
        ).inc()
        
        logger.error(
            "Failed to retrieve annotations",
            exc_info=e,
            extra={"video_id": video_id}
        )
        raise HTTPException(status_code=500, detail=str(e))

    finally:
        ANNOTATION_LATENCY.labels(
            operation_type="get_annotations"
        ).observe(time.perf_counter() - start_time)

@router.delete("/{annotation_id}")
async def delete_annotation(
    annotation_id: str,
    current_user: str = Depends(get_current_user),
    annotation_service: AnnotationService = Depends()
) -> dict:
    """
    Deletes an annotation with authorization check.
    
    Args:
        annotation_id: Annotation identifier
        current_user: Authenticated user ID
        annotation_service: Annotation service instance
    
    Returns:
        Success status
    """
    start_time = time.perf_counter()
    try:
        success = await annotation_service.delete_annotation(
            annotation_id=annotation_id,
            user_id=current_user
        )

        if not success:
            raise HTTPException(status_code=404, detail="Annotation not found")

        # Record metrics
        ANNOTATION_METRICS.labels(
            operation_type="delete_annotation",
            status="success"
        ).inc()

        logger.info(
            "Annotation deleted",
            extra={
                "annotation_id": annotation_id,
                "user_id": current_user
            }
        )

        return {"status": "success", "message": "Annotation deleted"}

    except HTTPException:
        raise

    except Exception as e:
        ANNOTATION_METRICS.labels(
            operation_type="delete_annotation",
            status="error"
        ).inc()
        
        logger.error(
            "Failed to delete annotation",
            exc_info=e,
            extra={"annotation_id": annotation_id}
        )
        raise HTTPException(status_code=500, detail=str(e))

    finally:
        ANNOTATION_LATENCY.labels(
            operation_type="delete_annotation"
        ).observe(time.perf_counter() - start_time)