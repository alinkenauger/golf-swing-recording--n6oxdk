"""
Video Controller Module
Handles video-related HTTP endpoints with enhanced security, monitoring, and CDN integration.

External Dependencies:
fastapi==0.104.0
python-multipart==0.0.6
"""

import asyncio
from typing import Dict, Optional
from uuid import UUID
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends, BackgroundTasks
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel

from ..models.video import Video, VideoMetadata
from ..services.video_processing_service import VideoProcessingService
from ..services.storage_service import StorageService
from ..utils.logger import VideoServiceLogger
from ..config import load_config

# Initialize router with prefix and tags
router = APIRouter(prefix='/api/v1/videos', tags=['videos'])

# Load configuration
config = load_config()

# Constants
ALLOWED_EXTENSIONS = ['mp4', 'mov', 'avi', 'mkv', 'webm']
MAX_FILE_SIZE = 1024 * 1024 * 500  # 500MB
PROCESSING_TIMEOUT = 60  # seconds
VARIANT_RESOLUTIONS = {'HD': '1080p', 'SD': '720p', 'MOBILE': '480p'}

# OAuth2 scheme for authentication
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

class ProcessingOptions(BaseModel):
    """Video processing options model."""
    generate_thumbnail: bool = True
    priority_processing: bool = False
    target_qualities: list[str] = ['HD', 'SD', 'MOBILE']

class VideoController:
    """Enhanced controller class handling video operations with security, monitoring, and CDN integration."""

    def __init__(
        self,
        processing_service: VideoProcessingService,
        storage_service: StorageService
    ):
        """Initialize controller with enhanced service dependencies."""
        self._processing_service = processing_service
        self._storage_service = storage_service
        self._logger = VideoServiceLogger(
            service_name="video_controller",
            environment=config['ENVIRONMENT'],
            enable_json=True,
            apm_config={
                'server_url': config['ELASTIC_APM_SERVER_URL'],
                'service_name': config['ELASTIC_APM_SERVICE_NAME'],
                'environment': config['ELASTIC_APM_ENVIRONMENT']
            }
        )

    async def _validate_video_file(self, file: UploadFile) -> None:
        """Validate video file with enhanced security checks."""
        # Check file extension
        if not any(file.filename.lower().endswith(ext) for ext in ALLOWED_EXTENSIONS):
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file format. Allowed formats: {', '.join(ALLOWED_EXTENSIONS)}"
            )

        # Check file size
        file_size = 0
        chunk_size = 8192
        while chunk := await file.read(chunk_size):
            file_size += len(chunk)
            if file_size > MAX_FILE_SIZE:
                raise HTTPException(
                    status_code=400,
                    detail=f"File size exceeds maximum limit of {MAX_FILE_SIZE/1024/1024}MB"
                )
        await file.seek(0)

    @router.post("/")
    async def upload_video(
        self,
        file: UploadFile = File(...),
        user_id: str = Depends(oauth2_scheme),
        title: str = None,
        description: str = None,
        options: ProcessingOptions = ProcessingOptions()
    ) -> Dict:
        """
        Enhanced video upload handler with security and monitoring.
        
        Args:
            file: Video file to upload
            user_id: Authenticated user ID
            title: Video title
            description: Video description
            options: Processing options
            
        Returns:
            dict: Enhanced video metadata with processing status and CDN URLs
        """
        try:
            # Add request context for logging
            self._logger.add_context({
                'user_id': user_id,
                'file_name': file.filename,
                'processing_options': options.dict()
            })

            # Validate video file
            await self._validate_video_file(file)

            # Read file content
            file_content = await file.read()

            # Create video instance
            video = Video(
                user_id=user_id,
                title=title or file.filename,
                description=description or "",
                file_content=file_content,
                filename=file.filename
            )

            # Upload original file to storage
            upload_success, error_msg, cdn_url = await self._storage_service.upload_video(
                file_content=file_content,
                file_name=file.filename,
                video_id=video.id
            )

            if not upload_success:
                raise HTTPException(status_code=500, detail=f"Upload failed: {error_msg}")

            # Start video processing
            try:
                processing_task = asyncio.create_task(
                    self._processing_service.process_video(video, file_content)
                )
                await asyncio.wait_for(processing_task, timeout=PROCESSING_TIMEOUT)
            except asyncio.TimeoutError:
                # Continue processing in background
                self._logger.warning("Processing timeout exceeded, continuing in background", {
                    'video_id': str(video.id)
                })

            # Return enhanced response
            return {
                'id': str(video.id),
                'status': video.status,
                'cdn_url': cdn_url,
                'variants': [variant.dict() for variant in video.variants],
                'processing_status': {
                    'progress': self._processing_service.monitor_processing(str(video.id))
                }
            }

        except Exception as e:
            self._logger.error(f"Video upload failed: {str(e)}", exc_info=e)
            raise HTTPException(status_code=500, detail=str(e))

    @router.get("/{video_id}")
    async def get_video(self, video_id: UUID, user_id: str = Depends(oauth2_scheme)) -> Dict:
        """
        Enhanced video retrieval with CDN integration.
        
        Args:
            video_id: Video identifier
            user_id: Authenticated user ID
            
        Returns:
            dict: Video details with CDN URLs and variants
        """
        try:
            # Add request context
            self._logger.add_context({
                'video_id': str(video_id),
                'user_id': user_id
            })

            # Check processing status
            processing_status = self._processing_service.monitor_processing(str(video_id))

            # Get video details
            video_data = {
                'id': str(video_id),
                'processing_status': processing_status,
                'cdn_urls': {}
            }

            # Generate CDN URLs for variants if processing is complete
            if processing_status['status'] == 'completed':
                for quality in VARIANT_RESOLUTIONS:
                    cdn_url = self._storage_service.get_cdn_url(
                        f"videos/{video_id}/variants/{quality.lower()}.mp4"
                    )
                    if cdn_url:
                        video_data['cdn_urls'][quality] = cdn_url

            return video_data

        except Exception as e:
            self._logger.error(f"Failed to retrieve video: {str(e)}", exc_info=e)
            raise HTTPException(status_code=404, detail="Video not found")

# Export router for FastAPI application
__all__ = ['router', 'VideoController']