"""
Initialization module for video service utilities that exports core utility functions
for logging, metrics collection, and validation.

Version: 1.0.0
"""

from .logger import VideoServiceLogger
from .metrics import VideoMetrics
from .validators import (
    validate_video_file,
    validate_video_metadata,
    validate_annotation,
    validate_hex_color
)

# Global service name constant
SERVICE_NAME = "video-service"

# Initialize core service utilities
logger = VideoServiceLogger(
    service_name=SERVICE_NAME,
    enable_json=True,
    environment="development",  # Will be overridden by environment variable
    initial_context={
        "service": SERVICE_NAME,
        "version": "1.0.0"
    }
)

# Initialize metrics collector
metrics = VideoMetrics()

# Export core utilities and validation functions
__all__ = [
    # Logger instance and class
    'logger',
    'VideoServiceLogger',
    
    # Metrics instance and class
    'metrics',
    'VideoMetrics',
    
    # Validation functions
    'validate_video_file',
    'validate_video_metadata', 
    'validate_annotation',
    'validate_hex_color',
    
    # Constants
    'SERVICE_NAME'
]

# Version information
__version__ = "1.0.0"