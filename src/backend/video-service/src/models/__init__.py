"""
Video Service Models Package
Exports core video and annotation models with comprehensive validation and security controls.

External Dependencies:
pydantic==2.4.0
"""

from .video import (
    Video,
    VideoMetadata,
    VideoVariant,
    ALLOWED_VIDEO_FORMATS,
    ALLOWED_VIDEO_CODECS,
    VIDEO_STATUS,
    VIDEO_VARIANTS
)

from .annotation import (
    Annotation,
    DrawingAnnotation,
    VoiceOverAnnotation,
    ANNOTATION_TYPES,
    DRAWING_TOOLS,
    SUPPORTED_AUDIO_FORMATS
)

__all__ = [
    # Video models
    'Video',
    'VideoMetadata', 
    'VideoVariant',
    
    # Video constants
    'ALLOWED_VIDEO_FORMATS',
    'ALLOWED_VIDEO_CODECS',
    'VIDEO_STATUS',
    'VIDEO_VARIANTS',
    
    # Annotation models
    'Annotation',
    'DrawingAnnotation',
    'VoiceOverAnnotation',
    
    # Annotation constants
    'ANNOTATION_TYPES',
    'DRAWING_TOOLS',
    'SUPPORTED_AUDIO_FORMATS'
]

# Version of the models package
__version__ = '1.0.0'

# Package metadata
__author__ = 'Video Coaching Platform'
__description__ = 'Core video and annotation models with validation'