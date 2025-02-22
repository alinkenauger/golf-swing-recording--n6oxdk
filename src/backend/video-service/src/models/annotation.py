"""
Video Annotation Models
Provides Pydantic models for video annotations including drawings, voice-overs and timestamps
with enhanced validation and security features.

External Dependencies:
pydantic==2.4.0
python-validators==0.20.0
"""

from datetime import datetime
from typing import List, Union, Dict, Optional
from uuid import UUID, uuid4
import validators
from pydantic import BaseModel, Field, validator
from ..utils.validators import validate_annotation, validate_hex_color

# Annotation type constants
ANNOTATION_TYPES = ['drawing', 'voice-over']
DRAWING_TOOLS = ['pen', 'line', 'arrow', 'rectangle', 'circle']
MAX_STROKE_WIDTH = 50.0
MAX_VOICE_OVER_DURATION = 3600.0  # 1 hour
SUPPORTED_AUDIO_FORMATS = ['audio/mp3', 'audio/wav', 'audio/m4a']
MAX_AUDIO_SIZE_BYTES = 52_428_800  # 50MB

class DrawingPoint(BaseModel):
    """Model for a single point in a drawing annotation with enhanced validation"""
    x: float = Field(..., ge=0)
    y: float = Field(..., ge=0)
    pressure: float = Field(default=1.0, ge=0.0, le=1.0)
    timestamp: datetime

    @validator('timestamp')
    def validate_coordinates(cls, v):
        """Validates point coordinates and pressure"""
        if v > datetime.now():
            raise ValueError("Timestamp cannot be in the future")
        return v

class DrawingAnnotation(BaseModel):
    """Model for drawing-based annotations with comprehensive validation"""
    tool_type: str
    points: List[DrawingPoint]
    color: str
    stroke_width: float = Field(default=2.0, ge=0.0, le=MAX_STROKE_WIDTH)
    is_filled: bool = False
    metadata: Dict = Field(default_factory=dict)

    @validator('tool_type')
    def validate_tool_type(cls, v):
        if v not in DRAWING_TOOLS:
            raise ValueError(f"Tool type must be one of: {DRAWING_TOOLS}")
        return v

    @validator('color')
    def validate_color_code(cls, v):
        is_valid, error_msg, normalized_color = validate_hex_color(v)
        if not is_valid:
            raise ValueError(error_msg)
        return normalized_color

    @validator('points')
    def validate_points_sequence(cls, v, values):
        if not v:
            raise ValueError("Points sequence cannot be empty")
        
        tool_type = values.get('tool_type')
        if tool_type in ['line', 'arrow'] and len(v) != 2:
            raise ValueError(f"{tool_type} must have exactly 2 points")
        elif tool_type in ['rectangle', 'circle'] and len(v) != 2:
            raise ValueError(f"{tool_type} must have exactly 2 points defining bounds")
        
        return v

class VoiceOverAnnotation(BaseModel):
    """Model for voice-over annotations with security measures"""
    audio_url: str
    duration: float = Field(..., gt=0, le=MAX_VOICE_OVER_DURATION)
    format: str
    size_bytes: int = Field(..., gt=0, le=MAX_AUDIO_SIZE_BYTES)
    metadata: Dict = Field(default_factory=dict)
    transcription: Optional[str] = None

    @validator('audio_url')
    def validate_audio_url(cls, v):
        if not validators.url(v):
            raise ValueError("Invalid audio URL format")
        return v

    @validator('format')
    def validate_audio_format(cls, v):
        if v not in SUPPORTED_AUDIO_FORMATS:
            raise ValueError(f"Unsupported audio format. Must be one of: {SUPPORTED_AUDIO_FORMATS}")
        return v

    @validator('transcription')
    def validate_transcription(cls, v):
        if v is not None and len(v) > 10000:  # Limit transcription length
            raise ValueError("Transcription exceeds maximum length of 10000 characters")
        return v

class Annotation(BaseModel):
    """Main annotation model with enhanced validation and security"""
    id: UUID = Field(default_factory=uuid4)
    video_id: str
    user_id: str
    type: str
    timestamp: float
    data: Union[DrawingAnnotation, VoiceOverAnnotation]
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    metadata: Dict = Field(default_factory=dict)

    @validator('type')
    def validate_type(cls, v):
        if v not in ANNOTATION_TYPES:
            raise ValueError(f"Annotation type must be one of: {ANNOTATION_TYPES}")
        return v

    @validator('video_id', 'user_id')
    def validate_ids(cls, v):
        if not v or len(v) < 8:  # Basic ID validation
            raise ValueError("Invalid ID format")
        return v

    @validator('timestamp')
    def validate_timestamp(cls, v):
        if v < 0:
            raise ValueError("Timestamp cannot be negative")
        return v

    @validator('metadata')
    def validate_metadata(cls, v):
        if not isinstance(v, dict):
            raise ValueError("Metadata must be a dictionary")
        # Limit metadata size
        if len(str(v)) > 5000:
            raise ValueError("Metadata size exceeds maximum limit")
        return v

    def validate(self) -> bool:
        """Comprehensive validation of annotation data"""
        try:
            # Validate basic fields
            if self.type not in ANNOTATION_TYPES:
                return False
            
            # Validate annotation data based on type
            if self.type == 'drawing':
                if not isinstance(self.data, DrawingAnnotation):
                    return False
            elif self.type == 'voice-over':
                if not isinstance(self.data, VoiceOverAnnotation):
                    return False
            
            # Validate timestamps
            if self.updated_at < self.created_at:
                return False
            
            return True
        except Exception:
            return False

    def to_dict(self) -> Dict:
        """Converts annotation to secure dictionary format"""
        return {
            'id': str(self.id),
            'video_id': self.video_id,
            'user_id': self.user_id,
            'type': self.type,
            'timestamp': self.timestamp,
            'data': self.data.dict(),
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat(),
            'metadata': self.metadata
        }