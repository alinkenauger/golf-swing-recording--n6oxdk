"""
Configuration module for the video processing service.
Handles environment variables, validation, and security settings.

Version: 1.0.0
"""

import os
from typing import Dict, Any, List, Optional
from urllib.parse import urlparse
import logging
from dotenv import load_dotenv  # python-dotenv ^1.0.0

# Load environment variables from .env file if present
load_dotenv()

# Application Constants
APP_NAME = "video-service"
ENVIRONMENT = os.getenv('ENVIRONMENT', 'development')
DEBUG = os.getenv('DEBUG', 'False').lower() == 'true'
API_VERSION = "v1"

# Server Configuration
HOST = os.getenv('HOST', '0.0.0.0')
PORT = int(os.getenv('PORT', 8000))
PROMETHEUS_PORT = int(os.getenv('PROMETHEUS_PORT', 9090))
LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO')

# AWS Configuration
AWS_ACCESS_KEY_ID = os.getenv('AWS_ACCESS_KEY_ID')
AWS_SECRET_ACCESS_KEY = os.getenv('AWS_SECRET_ACCESS_KEY')
AWS_REGION = os.getenv('AWS_REGION', 'us-east-1')
S3_BUCKET_NAME = os.getenv('S3_BUCKET_NAME')
S3_PREFIX = os.getenv('S3_PREFIX', 'videos/')

# Video Processing Configuration
MAX_VIDEO_SIZE_MB = int(os.getenv('MAX_VIDEO_SIZE_MB', 500))
MIN_VIDEO_SIZE_MB = int(os.getenv('MIN_VIDEO_SIZE_MB', 1))
SUPPORTED_VIDEO_FORMATS = ['.mp4', '.mov', '.avi', '.mkv', '.webm']
VIDEO_PROCESSING_TIMEOUT = int(os.getenv('VIDEO_PROCESSING_TIMEOUT', 60))
VIDEO_PROCESSING_THREADS = int(os.getenv('VIDEO_PROCESSING_THREADS', 4))

# Video Output Format Configuration
OUTPUT_FORMATS = {
    'HD': {'resolution': '1080p', 'bitrate': '5000k'},
    'SD': {'resolution': '720p', 'bitrate': '2500k'},
    'MOBILE': {'resolution': '480p', 'bitrate': '1000k'}
}

# Cache Configuration
REDIS_URL = os.getenv('REDIS_URL', 'redis://localhost:6379')
REDIS_PASSWORD = os.getenv('REDIS_PASSWORD')

# APM Configuration
ELASTIC_APM_SERVER_URL = os.getenv('ELASTIC_APM_SERVER_URL')
ELASTIC_APM_SERVICE_NAME = os.getenv('ELASTIC_APM_SERVICE_NAME', 'video-service')
ELASTIC_APM_ENVIRONMENT = os.getenv('ENVIRONMENT', 'development')

# Monitoring Configuration
METRICS_ENABLED = os.getenv('METRICS_ENABLED', 'True').lower() == 'true'
HEALTH_CHECK_INTERVAL = int(os.getenv('HEALTH_CHECK_INTERVAL', 30))

class ConfigurationError(Exception):
    """Custom exception for configuration validation errors."""
    pass

def validate_url(url: str) -> bool:
    """Validate URL format.
    
    Args:
        url: URL string to validate
        
    Returns:
        bool: True if URL is valid, False otherwise
    """
    try:
        result = urlparse(url)
        return all([result.scheme, result.netloc])
    except Exception:
        return False

def validate_config(config: Dict[str, Any]) -> bool:
    """Validate configuration settings with comprehensive security checks.
    
    Args:
        config: Dictionary containing configuration settings
        
    Returns:
        bool: True if configuration is valid
        
    Raises:
        ConfigurationError: If configuration validation fails
    """
    # Validate AWS credentials
    if not all([config.get('AWS_ACCESS_KEY_ID'), config.get('AWS_SECRET_ACCESS_KEY'),
                config.get('AWS_REGION'), config.get('S3_BUCKET_NAME')]):
        raise ConfigurationError("Missing required AWS credentials")

    # Validate video processing settings
    if not (0 < config['MIN_VIDEO_SIZE_MB'] < config['MAX_VIDEO_SIZE_MB']):
        raise ConfigurationError("Invalid video size limits")
    
    if config['VIDEO_PROCESSING_TIMEOUT'] < 1:
        raise ConfigurationError("Invalid video processing timeout")
    
    if config['VIDEO_PROCESSING_THREADS'] < 1:
        raise ConfigurationError("Invalid thread count")

    # Validate Redis configuration
    if not validate_url(config['REDIS_URL']):
        raise ConfigurationError("Invalid Redis URL")

    # Validate APM configuration if enabled
    if config.get('ELASTIC_APM_SERVER_URL'):
        if not validate_url(config['ELASTIC_APM_SERVER_URL']):
            raise ConfigurationError("Invalid APM server URL")

    return True

def get_environment_config(environment: str) -> Dict[str, Any]:
    """Get environment-specific configuration overrides.
    
    Args:
        environment: Environment name (development, staging, production)
        
    Returns:
        dict: Environment-specific configuration values
    """
    env_configs = {
        'development': {
            'DEBUG': True,
            'LOG_LEVEL': 'DEBUG',
            'METRICS_ENABLED': False
        },
        'staging': {
            'DEBUG': False,
            'LOG_LEVEL': 'INFO',
            'METRICS_ENABLED': True
        },
        'production': {
            'DEBUG': False,
            'LOG_LEVEL': 'WARNING',
            'METRICS_ENABLED': True,
            'HEALTH_CHECK_INTERVAL': 15
        }
    }
    return env_configs.get(environment, {})

def load_config() -> Dict[str, Any]:
    """Load and validate configuration from environment with security checks.
    
    Returns:
        dict: Validated configuration dictionary
        
    Raises:
        ConfigurationError: If configuration validation fails
    """
    # Create base configuration dictionary
    config = {
        'APP_NAME': APP_NAME,
        'ENVIRONMENT': ENVIRONMENT,
        'DEBUG': DEBUG,
        'API_VERSION': API_VERSION,
        'HOST': HOST,
        'PORT': PORT,
        'PROMETHEUS_PORT': PROMETHEUS_PORT,
        'LOG_LEVEL': LOG_LEVEL,
        'AWS_ACCESS_KEY_ID': AWS_ACCESS_KEY_ID,
        'AWS_SECRET_ACCESS_KEY': AWS_SECRET_ACCESS_KEY,
        'AWS_REGION': AWS_REGION,
        'S3_BUCKET_NAME': S3_BUCKET_NAME,
        'S3_PREFIX': S3_PREFIX,
        'MAX_VIDEO_SIZE_MB': MAX_VIDEO_SIZE_MB,
        'MIN_VIDEO_SIZE_MB': MIN_VIDEO_SIZE_MB,
        'SUPPORTED_VIDEO_FORMATS': SUPPORTED_VIDEO_FORMATS,
        'VIDEO_PROCESSING_TIMEOUT': VIDEO_PROCESSING_TIMEOUT,
        'VIDEO_PROCESSING_THREADS': VIDEO_PROCESSING_THREADS,
        'OUTPUT_FORMATS': OUTPUT_FORMATS,
        'REDIS_URL': REDIS_URL,
        'REDIS_PASSWORD': REDIS_PASSWORD,
        'ELASTIC_APM_SERVER_URL': ELASTIC_APM_SERVER_URL,
        'ELASTIC_APM_SERVICE_NAME': ELASTIC_APM_SERVICE_NAME,
        'ELASTIC_APM_ENVIRONMENT': ELASTIC_APM_ENVIRONMENT,
        'METRICS_ENABLED': METRICS_ENABLED,
        'HEALTH_CHECK_INTERVAL': HEALTH_CHECK_INTERVAL
    }

    # Override with environment-specific settings
    env_config = get_environment_config(ENVIRONMENT)
    config.update(env_config)

    # Validate the final configuration
    if validate_config(config):
        logging.info(f"Configuration loaded successfully for environment: {ENVIRONMENT}")
        return config

    raise ConfigurationError("Configuration validation failed")

# Initialize logging
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

# Export configuration functions
__all__ = ['load_config', 'validate_config', 'get_environment_config']