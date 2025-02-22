import prometheus_client  # version: 0.17.1
import time
import threading
from contextlib import contextmanager
from typing import Dict, Set, Optional, Generator, Any

from ..config import PROMETHEUS_PORT
from .logger import VideoServiceLogger

# Initialize Prometheus metrics collectors with detailed buckets
VIDEO_PROCESSING_DURATION = prometheus_client.Histogram(
    'video_processing_duration_seconds',
    'Time spent processing video',
    ['quality'],
    buckets=[0.1, 0.5, 1.0, 2.0, 5.0, 10.0, 30.0, 60.0, float('inf')]
)

VIDEO_UPLOAD_SIZE = prometheus_client.Histogram(
    'video_upload_size_bytes',
    'Size of uploaded videos',
    buckets=[1e6, 5e6, 1e7, 5e7, 1e8, 5e8, 1e9]
)

ACTIVE_PROCESSING_JOBS = prometheus_client.Gauge(
    'video_processing_active_jobs',
    'Number of videos currently being processed',
    ['quality']
)

PROCESSING_ERRORS = prometheus_client.Counter(
    'video_processing_errors_total',
    'Total number of video processing errors',
    ['error_type', 'severity']
)

STORAGE_OPERATIONS = prometheus_client.Counter(
    'storage_operations_total',
    'Total number of storage operations',
    ['operation_type', 'status']
)

class VideoMetrics:
    """Thread-safe metrics collection and monitoring system for video processing operations."""
    
    def __init__(self) -> None:
        """Initialize the metrics collector with thread-safe operations and validation sets."""
        # Initialize thread-safe lock
        self._metrics_lock = threading.Lock()
        
        # Initialize validation sets
        self._valid_qualities = {'HD', 'SD', 'MOBILE'}
        self._valid_error_types = {'encoding', 'storage', 'validation', 'processing'}
        self._valid_operations = {'upload', 'download', 'delete', 'copy'}
        
        # Initialize logger
        self._logger = VideoServiceLogger(
            service_name="video-metrics",
            enable_json=True
        )
        
        # Initialize metrics registry
        self._metrics_registry = {
            'processing_duration': VIDEO_PROCESSING_DURATION,
            'upload_size': VIDEO_UPLOAD_SIZE,
            'active_jobs': ACTIVE_PROCESSING_JOBS,
            'errors': PROCESSING_ERRORS,
            'storage_ops': STORAGE_OPERATIONS
        }
        
        # Start Prometheus HTTP server
        try:
            prometheus_client.start_http_server(PROMETHEUS_PORT)
            self._logger.info(f"Prometheus metrics server started on port {PROMETHEUS_PORT}")
        except Exception as e:
            self._logger.error(
                "Failed to start Prometheus server",
                exc_info=e,
                extra={'port': PROMETHEUS_PORT}
            )
            raise

    @contextmanager
    def track_processing_duration(self, video_id: str, quality: str) -> Generator[None, None, None]:
        """Thread-safe context manager for tracking video processing duration."""
        if quality not in self._valid_qualities:
            raise ValueError(f"Invalid quality: {quality}. Must be one of {self._valid_qualities}")
        
        try:
            with self._metrics_lock:
                start_time = time.perf_counter()
                ACTIVE_PROCESSING_JOBS.labels(quality=quality).inc()
                
            yield
            
        finally:
            with self._metrics_lock:
                duration = time.perf_counter() - start_time
                VIDEO_PROCESSING_DURATION.labels(quality=quality).observe(duration)
                ACTIVE_PROCESSING_JOBS.labels(quality=quality).dec()
                
                self._logger.info(
                    "Video processing completed",
                    extra={
                        'video_id': video_id,
                        'quality': quality,
                        'duration_seconds': duration
                    }
                )

    def record_upload_size(self, size_bytes: int) -> None:
        """Records and validates video upload sizes with byte normalization."""
        if size_bytes <= 0:
            raise ValueError("Upload size must be positive")
            
        with self._metrics_lock:
            VIDEO_UPLOAD_SIZE.observe(size_bytes)
            
            self._logger.info(
                "Video upload size recorded",
                extra={
                    'size_bytes': size_bytes,
                    'size_mb': size_bytes / (1024 * 1024)
                }
            )

    def track_active_jobs(self, change: int, quality: str) -> None:
        """Thread-safe tracking of active processing jobs with bounds checking."""
        if quality not in self._valid_qualities:
            raise ValueError(f"Invalid quality: {quality}. Must be one of {self._valid_qualities}")
            
        with self._metrics_lock:
            current = ACTIVE_PROCESSING_JOBS.labels(quality=quality)._value.get()
            if current + change < 0:
                raise ValueError("Active jobs count cannot be negative")
                
            ACTIVE_PROCESSING_JOBS.labels(quality=quality).inc(change)
            
            self._logger.info(
                "Active jobs updated",
                extra={
                    'quality': quality,
                    'change': change,
                    'current_count': current + change
                }
            )

    def record_error(self, error_type: str, severity: str) -> None:
        """Records and categorizes processing errors with severity levels."""
        if error_type not in self._valid_error_types:
            raise ValueError(f"Invalid error type: {error_type}. Must be one of {self._valid_error_types}")
        if severity not in {'critical', 'error', 'warning'}:
            raise ValueError("Severity must be one of: critical, error, warning")
            
        with self._metrics_lock:
            PROCESSING_ERRORS.labels(
                error_type=error_type,
                severity=severity
            ).inc()
            
            self._logger.error(
                "Processing error recorded",
                extra={
                    'error_type': error_type,
                    'severity': severity
                }
            )

    def track_storage_operation(self, operation_type: str, status: str) -> None:
        """Monitors storage operations with timing and status tracking."""
        if operation_type not in self._valid_operations:
            raise ValueError(f"Invalid operation type: {operation_type}. Must be one of {self._valid_operations}")
        if status not in {'success', 'failure'}:
            raise ValueError("Status must be either 'success' or 'failure'")
            
        with self._metrics_lock:
            STORAGE_OPERATIONS.labels(
                operation_type=operation_type,
                status=status
            ).inc()
            
            self._logger.info(
                "Storage operation recorded",
                extra={
                    'operation_type': operation_type,
                    'status': status
                }
            )