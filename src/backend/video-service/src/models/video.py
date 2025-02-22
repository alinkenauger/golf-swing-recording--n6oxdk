"""
Video Model Module
Provides Pydantic models for video content with enhanced security and validation features.

External Dependencies:
pydantic==2.4.0
"""

from datetime import datetime
from typing import List, Dict, Optional
from uuid import UUID, uuid4
from pydantic import BaseModel, Field, validator

from .annotation import Annotation
from ..utils.validators import validate_video_metadata, validate_video_file

# Video processing status constants
VIDEO_STATUS = ['pending', 'scanning', 'processing', 'converting', 'ready', 'failed']

# Video quality variants
VIDEO_VARIANTS = ['original', 'hd_1080p', 'sd_720p', 'mobile_480p', 'thumbnail']

# Video format constraints
ALLOWED_VIDEO_FORMATS = ['mp4', 'mov', 'avi', 'webm']
ALLOWED_VIDEO_CODECS = ['h264', 'h265', 'vp8', 'vp9']
MAX_VIDEO_SIZE_BYTES = 5_368_709_120  # 5GB
MIN_FPS = 24.0
MAX_FPS = 240.0

class VideoMetadata(BaseModel):
    """Enhanced technical metadata for video content with strict validation"""
    duration: float = Field(..., gt=0)
    width: int = Field(..., gt=0, lt=7680)  # Up to 8K resolution
    height: int = Field(..., gt=0, lt=4320)
    fps: float = Field(..., ge=MIN_FPS, le=MAX_FPS)
    codec: str
    size_bytes: int = Field(..., gt=0, le=MAX_VIDEO_SIZE_BYTES)
    format: str
    checksum: str
    virus_scanned: bool = False
    content_safe: bool = False

    @validator('codec')
    def validate_codec(cls, v):
        if v.lower() not in ALLOWED_VIDEO_CODECS:
            raise ValueError(f"Unsupported codec. Allowed codecs: {ALLOWED_VIDEO_CODECS}")
        return v.lower()

    @validator('format')
    def validate_format(cls, v):
        if v.lower() not in ALLOWED_VIDEO_FORMATS:
            raise ValueError(f"Unsupported format. Allowed formats: {ALLOWED_VIDEO_FORMATS}")
        return v.lower()

    def validate(self) -> tuple[bool, str]:
        """Validates video metadata with enhanced security checks"""
        try:
            # Format validation
            if self.format not in ALLOWED_VIDEO_FORMATS:
                return False, f"Unsupported video format: {self.format}"

            # Codec validation
            if self.codec not in ALLOWED_VIDEO_CODECS:
                return False, f"Unsupported codec: {self.codec}"

            # Size validation
            if self.size_bytes > MAX_VIDEO_SIZE_BYTES:
                return False, f"Video size exceeds maximum limit of {MAX_VIDEO_SIZE_BYTES/1024/1024/1024:.1f}GB"

            # FPS validation
            if not MIN_FPS <= self.fps <= MAX_FPS:
                return False, f"FPS must be between {MIN_FPS} and {MAX_FPS}"

            # Resolution validation
            if self.width <= 0 or self.height <= 0 or self.width > 7680 or self.height > 4320:
                return False, "Invalid resolution dimensions"

            # Comprehensive metadata validation
            is_valid, error_msg, _ = validate_video_metadata({
                'duration': self.duration,
                'codec': self.codec,
                'width': self.width,
                'height': self.height,
                'fps': self.fps,
                'size_bytes': self.size_bytes,
                'format': self.format
            })

            if not is_valid:
                return False, error_msg

            return True, ""
        except Exception as e:
            return False, f"Validation error: {str(e)}"

class VideoVariant(BaseModel):
    """Model for different quality variants of a video with enhanced metadata"""
    quality: str = Field(..., description="Video quality variant")
    url: str = Field(..., description="CDN URL for the variant")
    metadata: VideoMetadata
    created_at: datetime = Field(default_factory=datetime.utcnow)
    cdn_provider: str = Field(..., description="CDN provider identifier")
    delivery_config: Dict = Field(default_factory=dict)

    @validator('quality')
    def validate_quality(cls, v):
        if v not in VIDEO_VARIANTS:
            raise ValueError(f"Invalid quality variant. Must be one of: {VIDEO_VARIANTS}")
        return v

class Video(BaseModel):
    """Enhanced main video model with comprehensive security and processing features"""
    id: UUID = Field(default_factory=uuid4)
    user_id: str
    title: str = Field(..., min_length=1, max_length=200)
    description: str = Field(default="", max_length=2000)
    status: str = Field(default="pending")
    metadata: VideoMetadata
    variants: List[VideoVariant] = Field(default_factory=list)
    annotations: List[Annotation] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    processing_history: Dict = Field(default_factory=dict)
    security_scan_results: Dict = Field(default_factory=dict)

    @validator('status')
    def validate_status(cls, v):
        if v not in VIDEO_STATUS:
            raise ValueError(f"Invalid status. Must be one of: {VIDEO_STATUS}")
        return v

    def __init__(self, user_id: str, title: str, description: str, file_content: bytes, filename: str, **data):
        """Initializes a new video instance with enhanced security validation"""
        # Validate file content
        is_valid, error_msg, file_metadata = validate_video_file(file_content, filename)
        if not is_valid:
            raise ValueError(f"Invalid video file: {error_msg}")

        # Initialize with secure UUID
        data['id'] = uuid4()
        data['user_id'] = user_id
        data['title'] = title
        data['description'] = description
        data['status'] = 'pending'
        data['created_at'] = datetime.utcnow()
        data['updated_at'] = datetime.utcnow()
        
        # Initialize processing history
        data['processing_history'] = {
            'upload_started': datetime.utcnow().isoformat(),
            'file_validation': {'status': 'completed', 'metadata': file_metadata}
        }
        
        # Initialize security scan results
        data['security_scan_results'] = {
            'virus_scan': {'status': 'pending'},
            'content_safety': {'status': 'pending'}
        }

        super().__init__(**data)

    def add_variant(self, quality: str, url: str, metadata: VideoMetadata, delivery_config: Dict) -> VideoVariant:
        """Adds a new quality variant with enhanced validation"""
        if quality not in VIDEO_VARIANTS:
            raise ValueError(f"Invalid quality variant: {quality}")

        variant = VideoVariant(
            quality=quality,
            url=url,
            metadata=metadata,
            cdn_provider=delivery_config.get('provider', 'default'),
            delivery_config=delivery_config
        )
        
        self.variants.append(variant)
        self.processing_history[f'variant_{quality}_added'] = {
            'timestamp': datetime.utcnow().isoformat(),
            'metadata': metadata.dict()
        }
        
        return variant

    def add_annotation(self, user_id: str, type: str, timestamp: float, data: Dict) -> Annotation:
        """Adds a new annotation with enhanced validation"""
        if timestamp < 0 or timestamp > self.metadata.duration:
            raise ValueError(f"Invalid timestamp: {timestamp}")

        annotation = Annotation(
            video_id=str(self.id),
            user_id=user_id,
            type=type,
            timestamp=timestamp,
            data=data
        )

        if not annotation.validate():
            raise ValueError("Invalid annotation data")

        self.annotations.append(annotation)
        return annotation

    def to_dict(self) -> Dict:
        """Converts video model to secure dictionary format"""
        return {
            'id': str(self.id),
            'user_id': self.user_id,
            'title': self.title,
            'description': self.description,
            'status': self.status,
            'metadata': self.metadata.dict(),
            'variants': [variant.dict() for variant in self.variants],
            'annotations': [annotation.to_dict() for annotation in self.annotations],
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat(),
            'processing_history': self.processing_history,
            'security_scan_results': {
                k: v for k, v in self.security_scan_results.items()
                if k not in ['internal_scan_details', 'raw_scan_data']
            }
        }