"""
Video Service Package Initialization
Configures and exports the FastAPI application instance with comprehensive monitoring,
error handling, and thread safety mechanisms.

Version: 1.0.0
"""

import threading
import logging
from typing import Dict, Optional

import elastic_apm
from elastic_apm.contrib.fastapi import ElasticAPM
import prometheus_client
from prometheus_client import Counter, Gauge, Histogram

from .app import app
from .config import load_config

# Package metadata
__version__ = "1.0.0"
__author__ = "Video Coach Platform Team"

# Load validated configuration
__config__ = load_config()

# Thread-safe initialization lock
_monitoring_lock = threading.Lock()

# Configure logging
_logger = logging.getLogger(__name__)
_logger.setLevel(getattr(logging, __config__['LOG_LEVEL']))

# Initialize metrics collectors
_video_service_requests = Counter(
    'video_service_requests_total',
    'Total number of video service requests',
    ['endpoint', 'method', 'status']
)

_video_processing_duration = Histogram(
    'video_processing_duration_seconds',
    'Time spent processing videos',
    ['quality', 'status'],
    buckets=[1, 5, 10, 30, 60, 120, 300, 600]
)

_video_service_health = Gauge(
    'video_service_health',
    'Video service health status',
    ['component']
)

@_monitoring_lock
def initialize_monitoring() -> bool:
    """
    Initializes application monitoring and metrics collection with error handling and retry logic.
    
    Returns:
        bool: True if initialization successful, False otherwise
    """
    try:
        # Configure APM client
        if __config__.get('ELASTIC_APM_SERVER_URL'):
            elastic_apm.init(
                service_name=__config__['ELASTIC_APM_SERVICE_NAME'],
                server_url=__config__['ELASTIC_APM_SERVER_URL'],
                environment=__config__['ELASTIC_APM_ENVIRONMENT'],
                enabled=True
            )
            
            # Add APM middleware to FastAPI app
            app.add_middleware(ElasticAPM)
            _logger.info("Elastic APM initialized successfully")

        # Initialize Prometheus metrics
        if __config__.get('METRICS_ENABLED', True):
            # Start Prometheus HTTP server
            prometheus_client.start_http_server(
                port=__config__.get('PROMETHEUS_PORT', 9090)
            )
            
            # Set initial health status
            _video_service_health.labels(component='api').set(1)
            _video_service_health.labels(component='storage').set(1)
            _video_service_health.labels(component='processing').set(1)
            
            _logger.info("Prometheus metrics initialized successfully")

        # Configure service-wide logging
        logging.basicConfig(
            format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
            level=getattr(logging, __config__['LOG_LEVEL']),
            handlers=[
                logging.StreamHandler(),
                logging.FileHandler('video_service.log')
            ]
        )

        _logger.info(
            "Video service monitoring initialized",
            extra={
                'environment': __config__['ENVIRONMENT'],
                'version': __version__
            }
        )
        
        return True

    except Exception as e:
        _logger.error(
            "Failed to initialize monitoring",
            exc_info=e,
            extra={'config': __config__}
        )
        return False

def validate_config(config: Dict) -> bool:
    """
    Validates service configuration before exporting.
    
    Args:
        config: Configuration dictionary to validate
        
    Returns:
        bool: True if configuration is valid
    """
    try:
        required_keys = {
            'ENVIRONMENT',
            'LOG_LEVEL',
            'AWS_ACCESS_KEY_ID',
            'AWS_SECRET_ACCESS_KEY',
            'S3_BUCKET_NAME'
        }
        
        # Check required keys
        missing_keys = required_keys - set(config.keys())
        if missing_keys:
            raise ValueError(f"Missing required configuration keys: {missing_keys}")

        # Validate environment
        if config['ENVIRONMENT'] not in {'development', 'staging', 'production'}:
            raise ValueError("Invalid environment specified")

        # Validate log level
        if config['LOG_LEVEL'] not in {'DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL'}:
            raise ValueError("Invalid log level specified")

        # Validate AWS credentials
        if not all([config['AWS_ACCESS_KEY_ID'], config['AWS_SECRET_ACCESS_KEY']]):
            raise ValueError("Invalid AWS credentials")

        # Validate S3 bucket
        if not config['S3_BUCKET_NAME']:
            raise ValueError("Invalid S3 bucket name")

        _logger.info("Configuration validation successful")
        return True

    except Exception as e:
        _logger.error(
            "Configuration validation failed",
            exc_info=e,
            extra={'config': {k: '***' if 'KEY' in k else v for k, v in config.items()}}
        )
        return False

# Validate configuration
if not validate_config(__config__):
    raise ValueError("Invalid service configuration")

# Initialize monitoring
if not initialize_monitoring():
    raise RuntimeError("Failed to initialize service monitoring")

# Export FastAPI application instance and configuration
__all__ = ['app', '__version__', '__config__']