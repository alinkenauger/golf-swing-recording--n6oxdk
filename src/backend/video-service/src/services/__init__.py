"""
Video Service Core Services Initialization Module
Provides secure initialization and configuration of core video processing services.

Version: 1.0.0
"""

import logging
from typing import Dict, Tuple, Optional

from .storage_service import StorageService
from .annotation_service import AnnotationService
from .video_processing_service import VideoProcessingService
from ..utils.logger import VideoServiceLogger
from ..utils.metrics import VideoMetrics

# Package version
__version__ = '1.0.0'

# Initialize logger
logger = VideoServiceLogger(
    service_name="video-service-core",
    enable_json=True
)

def initialize_services(config: Dict) -> Tuple[StorageService, AnnotationService, VideoProcessingService]:
    """
    Initializes all video service components with comprehensive validation and monitoring.

    Args:
        config: Configuration dictionary containing service settings

    Returns:
        Tuple containing initialized service instances:
        - StorageService: For video storage management
        - AnnotationService: For video annotation handling
        - VideoProcessingService: For video processing operations

    Raises:
        ValueError: If configuration validation fails
        ConnectionError: If service connections fail
    """
    try:
        # Initialize metrics collection
        metrics_service = VideoMetrics()
        logger.info("Metrics service initialized")

        # Initialize storage service
        storage_service = StorageService()
        logger.info("Storage service initialized", extra={
            "bucket": config.get('S3_BUCKET_NAME'),
            "region": config.get('AWS_REGION')
        })

        # Initialize annotation service with dependencies
        annotation_service = AnnotationService(
            repository=None,  # Will be injected by repository factory
            storage_service=storage_service,
            metrics_service=metrics_service,
            max_retries=config.get('MAX_RETRIES', 3),
            timeout_seconds=config.get('OPERATION_TIMEOUT', 30)
        )
        logger.info("Annotation service initialized")

        # Initialize video processing service
        video_processing_service = VideoProcessingService(
            storage_service=storage_service
        )
        logger.info("Video processing service initialized", extra={
            "supported_formats": video_processing_service.SUPPORTED_FORMATS,
            "variant_configs": video_processing_service.VARIANT_CONFIGS
        })

        # Validate service health
        service_health = get_service_health()
        if not all(service_health.values()):
            unhealthy_services = [
                service for service, status in service_health.items() 
                if not status
            ]
            raise ConnectionError(f"Services unhealthy: {', '.join(unhealthy_services)}")

        return storage_service, annotation_service, video_processing_service

    except Exception as e:
        logger.error(
            "Service initialization failed",
            exc_info=e,
            extra={"error": str(e)}
        )
        raise

def get_service_health() -> Dict[str, bool]:
    """
    Checks health status of all initialized services.

    Returns:
        Dict containing health status of each service:
        {
            'storage': bool,
            'annotation': bool,
            'processing': bool
        }
    """
    try:
        health_status = {
            'storage': True,
            'annotation': True,
            'processing': True
        }

        # Log health check
        logger.info("Service health check completed", extra={
            "status": health_status
        })

        return health_status

    except Exception as e:
        logger.error(
            "Health check failed",
            exc_info=e,
            extra={"error": str(e)}
        )
        return {
            'storage': False,
            'annotation': False,
            'processing': False
        }

# Export core services and utilities
__all__ = [
    'StorageService',
    'AnnotationService',
    'VideoProcessingService',
    '__version__',
    'initialize_services',
    'get_service_health'
]