"""
Video Service Controllers Initialization
Initializes and exports FastAPI controllers for video and annotation endpoints with enhanced security,
monitoring and error handling capabilities.

External Dependencies:
prometheus-client==0.17.1
fastapi-security==0.5.0
opentelemetry-api==1.20.0
"""

from typing import Tuple, List
from fastapi import APIRouter
from prometheus_client import Counter, Histogram
import time
from opentelemetry import trace

from .video_controller import router as video_router
from .annotation_controller import router as annotation_router
from ..utils.logger import VideoServiceLogger
from ..utils.metrics import VideoMetrics

# Initialize logger and metrics
logger = VideoServiceLogger(
    service_name="controller-init",
    enable_json=True
)
metrics = VideoMetrics()

# Initialize OpenTelemetry tracer
tracer = trace.get_tracer(__name__)

# Define required endpoints for validation
REQUIRED_VIDEO_ENDPOINTS = {
    'get_upload_url',
    'get_video',
    'update_video',
    'delete_video',
    'start_processing',
    'get_processing_status'
}

REQUIRED_ANNOTATION_ENDPOINTS = {
    'get_annotations',
    'create_drawing',
    'create_voice_over',
    'update_drawing',
    'delete_annotation'
}

# Initialize metrics collectors
ROUTER_INITIALIZATION = Counter(
    'router_initialization_total',
    'Router initialization attempts',
    ['router_type', 'status']
)

ENDPOINT_VALIDATION = Counter(
    'endpoint_validation_total',
    'Endpoint validation results',
    ['router_type', 'status']
)

def validate_router_security(router: APIRouter) -> bool:
    """
    Validates security configuration of router endpoints.

    Args:
        router: APIRouter instance to validate

    Returns:
        bool: True if security configuration is valid
    """
    try:
        # Check for authentication middleware
        if not any(d.get('dependencies') for d in router.routes):
            logger.error("Missing authentication dependencies in router")
            return False

        # Validate rate limiting configuration
        if not any('RateLimiter' in str(d) for r in router.routes for d in r.dependencies):
            logger.warning("Rate limiting not configured for router")

        # Check CORS configuration
        if not getattr(router, 'cors_middleware', None):
            logger.warning("CORS middleware not configured")

        # Verify error handlers
        if not router.exception_handlers:
            logger.warning("No custom exception handlers configured")

        return True

    except Exception as e:
        logger.error("Router security validation failed", exc_info=e)
        return False

def initialize_routers() -> Tuple[APIRouter, APIRouter]:
    """
    Initializes and validates video and annotation routers with security and monitoring.

    Returns:
        Tuple containing configured video_router and annotation_router

    Raises:
        RuntimeError: If router initialization or validation fails
    """
    try:
        with tracer.start_as_current_span("initialize_routers") as span:
            start_time = time.perf_counter()

            # Validate video router endpoints
            video_endpoints = {route.name for route in video_router.routes}
            if not REQUIRED_VIDEO_ENDPOINTS.issubset(video_endpoints):
                missing = REQUIRED_VIDEO_ENDPOINTS - video_endpoints
                raise RuntimeError(f"Missing required video endpoints: {missing}")

            # Validate annotation router endpoints
            annotation_endpoints = {route.name for route in annotation_router.routes}
            if not REQUIRED_ANNOTATION_ENDPOINTS.issubset(annotation_endpoints):
                missing = REQUIRED_ANNOTATION_ENDPOINTS - annotation_endpoints
                raise RuntimeError(f"Missing required annotation endpoints: {missing}")

            # Validate router security configuration
            if not validate_router_security(video_router):
                raise RuntimeError("Video router security validation failed")
            if not validate_router_security(annotation_router):
                raise RuntimeError("Annotation router security validation failed")

            # Record initialization metrics
            initialization_time = time.perf_counter() - start_time
            span.set_attribute("initialization.duration", initialization_time)

            ROUTER_INITIALIZATION.labels(
                router_type="video",
                status="success"
            ).inc()
            ROUTER_INITIALIZATION.labels(
                router_type="annotation",
                status="success"
            ).inc()

            logger.info(
                "Routers initialized successfully",
                extra={
                    "video_endpoints": len(video_endpoints),
                    "annotation_endpoints": len(annotation_endpoints),
                    "initialization_time": initialization_time
                }
            )

            return video_router, annotation_router

    except Exception as e:
        ROUTER_INITIALIZATION.labels(
            router_type="combined",
            status="error"
        ).inc()

        logger.error(
            "Router initialization failed",
            exc_info=e,
            extra={"error": str(e)}
        )
        raise RuntimeError(f"Failed to initialize routers: {str(e)}")

# Initialize routers
video_router, annotation_router = initialize_routers()

# Export routers and validation functions
__all__ = [
    'video_router',
    'annotation_router',
    'initialize_routers',
    'validate_router_security'
]