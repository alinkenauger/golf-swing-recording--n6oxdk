"""
Video Service Validation Utilities
Provides comprehensive validation for video processing, annotations, and voice-over data
with enhanced security and performance features.

External Dependencies:
pydantic==2.4.0
python-magic==0.4.27
"""

import re
from typing import Dict, List, Tuple, Union
import magic
from pydantic import validator

# Video format constraints
ALLOWED_VIDEO_FORMATS = ['.mp4', '.mov', '.avi', '.mkv']
ALLOWED_VIDEO_CODECS = ['h264', 'h265', 'vp8', 'vp9']
MAX_VIDEO_SIZE_BYTES = 5_368_709_120  # 5GB
MIN_VIDEO_DURATION = 1.0  # seconds
MAX_VIDEO_DURATION = 3600.0  # 1 hour
MIN_FPS = 15.0
MAX_FPS = 120.0

# Audio format constraints
ALLOWED_AUDIO_FORMATS = ['.mp3', '.wav', '.aac', '.m4a']
MAX_AUDIO_SIZE_BYTES = 104_857_600  # 100MB

# MIME type validation
VALID_MIME_TYPES = {
    'video/mp4',
    'video/quicktime',
    'video/x-msvideo',
    'video/x-matroska'
}

# Annotation constraints
VALID_ANNOTATION_TYPES = {'drawing', 'voice-over', 'text'}
MAX_COORDINATES = 10000  # Maximum coordinate value for annotations

@validator('file_content', pre=True)
def validate_video_file(file_content: bytes, filename: str, strict_validation: bool = True) -> Tuple[bool, str, Dict]:
    """
    Performs comprehensive validation of uploaded video files.
    
    Args:
        file_content: Raw bytes of the video file
        filename: Original filename with extension
        strict_validation: Enable additional integrity checks
        
    Returns:
        Tuple containing:
        - Success status (bool)
        - Error message if any (str)
        - Additional metadata (dict)
    """
    if not file_content:
        return False, "Empty file content", {}

    # File size validation
    file_size = len(file_content)
    if file_size > MAX_VIDEO_SIZE_BYTES:
        return False, f"File size exceeds maximum limit of {MAX_VIDEO_SIZE_BYTES/1024/1024/1024:.1f}GB", {
            "size": file_size
        }
    
    # Extension validation
    file_ext = filename[filename.rfind('.'):].lower() if '.' in filename else ''
    if file_ext not in ALLOWED_VIDEO_FORMATS:
        return False, f"Unsupported file format. Allowed formats: {', '.join(ALLOWED_VIDEO_FORMATS)}", {
            "extension": file_ext
        }

    # MIME type validation
    try:
        mime_type = magic.from_buffer(file_content[:2048], mime=True)
        if mime_type not in VALID_MIME_TYPES:
            return False, f"Invalid MIME type: {mime_type}", {"mime_type": mime_type}
    except Exception as e:
        return False, f"Failed to detect MIME type: {str(e)}", {}

    # Basic header integrity check
    if not file_content.startswith((b'\x00\x00\x00', b'\x00\x00\x01')):
        return False, "Invalid video file header", {}

    metadata = {
        "size": file_size,
        "extension": file_ext,
        "mime_type": mime_type
    }

    if strict_validation:
        # Additional integrity checks for strict validation
        try:
            # Check for minimum viable video content
            if file_size < 1024:
                return False, "File too small to be a valid video", metadata
            
            # Verify file termination
            if not any(file_content[-32:].endswith(term) for term in [b'mdat', b'moov']):
                return False, "Invalid video file termination", metadata
        except Exception as e:
            return False, f"Strict validation failed: {str(e)}", metadata

    return True, "", metadata

@validator('metadata', pre=True)
def validate_video_metadata(metadata: Dict) -> Tuple[bool, str, Dict]:
    """
    Validates comprehensive video metadata including duration, resolution, codec, and specifications.
    
    Args:
        metadata: Dictionary containing video metadata
        
    Returns:
        Tuple containing validation status, error message, and validated metadata
    """
    required_fields = {'duration', 'codec', 'width', 'height', 'fps'}
    if not all(field in metadata for field in required_fields):
        return False, f"Missing required metadata fields: {required_fields - metadata.keys()}", {}

    # Duration validation
    duration = float(metadata['duration'])
    if not MIN_VIDEO_DURATION <= duration <= MAX_VIDEO_DURATION:
        return False, f"Video duration must be between {MIN_VIDEO_DURATION} and {MAX_VIDEO_DURATION} seconds", metadata

    # Codec validation
    if metadata['codec'].lower() not in ALLOWED_VIDEO_CODECS:
        return False, f"Unsupported codec. Allowed codecs: {', '.join(ALLOWED_VIDEO_CODECS)}", metadata

    # Resolution validation
    try:
        width = int(metadata['width'])
        height = int(metadata['height'])
        if width <= 0 or height <= 0 or width > 7680 or height > 4320:  # Up to 8K resolution
            return False, "Invalid resolution dimensions", metadata
    except ValueError:
        return False, "Invalid resolution format", metadata

    # Frame rate validation
    try:
        fps = float(metadata['fps'])
        if not MIN_FPS <= fps <= MAX_FPS:
            return False, f"Frame rate must be between {MIN_FPS} and {MAX_FPS} fps", metadata
    except ValueError:
        return False, "Invalid frame rate format", metadata

    # Validate additional metadata if present
    if 'bitrate' in metadata:
        try:
            bitrate = int(metadata['bitrate'])
            if not 100_000 <= bitrate <= 100_000_000:  # 100Kbps to 100Mbps
                return False, "Invalid bitrate range", metadata
        except ValueError:
            return False, "Invalid bitrate format", metadata

    return True, "", metadata

@validator('annotation_data', pre=True)
def validate_annotation(
    annotation_data: Dict,
    video_duration: float,
    annotation_type: str
) -> Tuple[bool, str, Dict]:
    """
    Validates video annotation data with type-specific validation.
    
    Args:
        annotation_data: Annotation content and metadata
        video_duration: Duration of the video being annotated
        annotation_type: Type of annotation (drawing, voice-over, text)
        
    Returns:
        Tuple containing validation status, error message, and validated data
    """
    if annotation_type not in VALID_ANNOTATION_TYPES:
        return False, f"Invalid annotation type. Allowed types: {', '.join(VALID_ANNOTATION_TYPES)}", {}

    if 'timestamp' not in annotation_data:
        return False, "Missing timestamp in annotation data", {}

    timestamp = float(annotation_data['timestamp'])
    if timestamp < 0 or timestamp > video_duration:
        return False, f"Timestamp {timestamp} outside video duration {video_duration}", annotation_data

    if annotation_type == 'drawing':
        if 'coordinates' not in annotation_data or 'color' not in annotation_data:
            return False, "Missing required drawing data", annotation_data

        # Validate coordinates
        coordinates = annotation_data['coordinates']
        if not isinstance(coordinates, list) or not coordinates:
            return False, "Invalid coordinates format", annotation_data

        for coord in coordinates:
            if not isinstance(coord, dict) or 'x' not in coord or 'y' not in coord:
                return False, "Invalid coordinate format", annotation_data
            if not (0 <= coord['x'] <= MAX_COORDINATES and 0 <= coord['y'] <= MAX_COORDINATES):
                return False, f"Coordinates must be between 0 and {MAX_COORDINATES}", annotation_data

        # Validate color
        color_valid, color_error, _ = validate_hex_color(annotation_data['color'])
        if not color_valid:
            return False, f"Invalid color format: {color_error}", annotation_data

    elif annotation_type == 'voice-over':
        if 'audio_data' not in annotation_data or 'duration' not in annotation_data:
            return False, "Missing required voice-over data", annotation_data

        audio_duration = float(annotation_data['duration'])
        if audio_duration <= 0 or audio_duration > 300:  # Max 5 minutes
            return False, "Invalid voice-over duration", annotation_data

    elif annotation_type == 'text':
        if 'content' not in annotation_data or 'position' not in annotation_data:
            return False, "Missing required text annotation data", annotation_data

        content = annotation_data['content']
        if not isinstance(content, str) or len(content) > 1000:
            return False, "Invalid text content or length", annotation_data

        position = annotation_data['position']
        if not isinstance(position, dict) or 'x' not in position or 'y' not in position:
            return False, "Invalid text position format", annotation_data

    return True, "", annotation_data

def validate_hex_color(color: str) -> Tuple[bool, str, str]:
    """
    Validates hex color codes with support for both short and long formats.
    
    Args:
        color: Hex color code string
        
    Returns:
        Tuple containing:
        - Validation status (bool)
        - Error message if any (str)
        - Normalized color code (str)
    """
    if not color or not isinstance(color, str):
        return False, "Invalid color value", ""

    if not color.startswith('#'):
        return False, "Color code must start with #", ""

    color = color.upper()
    if len(color) == 4:  # #RGB format
        try:
            # Expand to #RRGGBB format
            color = '#' + ''.join(c + c for c in color[1:])
        except Exception:
            return False, "Invalid short color format", ""
    elif len(color) != 7:  # #RRGGBB format
        return False, "Invalid color code length", ""

    if not re.match(r'^#[0-9A-F]{6}$', color):
        return False, "Invalid hex color characters", ""

    return True, "", color