"""
Video Service Repositories Module
Provides high-performance data access layer for video and annotation management.

External Dependencies:
motor==3.3.1 - Async MongoDB driver
pymongo==4.5.0 - MongoDB operations
"""

from .video_repository import VideoRepository
from .annotation_repository import AnnotationRepository

__all__ = [
    'VideoRepository',
    'AnnotationRepository'
]

# Version of the repositories module
__version__ = '1.0.0'

# Module level docstring for repository capabilities
__doc__ = """
Video Service Repositories
=========================

Provides comprehensive data access layer for video management and annotations with:

- Optimized MongoDB operations for video metadata and annotations
- S3 integration for video file storage
- Real-time annotation support including drawings and voice-overs
- Enhanced caching and performance optimizations
- Comprehensive error handling and logging
- Metrics collection for monitoring

Main Components:
---------------
VideoRepository: Manages video data including uploads, metadata, and variants
AnnotationRepository: Handles video annotations including drawings and voice-overs

Usage:
------
from repositories import VideoRepository, AnnotationRepository

# Initialize repositories with MongoDB connection
video_repo = VideoRepository(db)
annotation_repo = AnnotationRepository(db)
"""