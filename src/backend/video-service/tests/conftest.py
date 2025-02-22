"""
Pytest Configuration Module
Provides comprehensive test fixtures and configuration for video service testing
with enhanced security validation and performance monitoring.

Version: 1.0.0
"""

import os
import json
import pytest
import pytest_asyncio
import httpx
from mock import Mock, AsyncMock
from typing import Dict, Generator, AsyncGenerator
import asyncio

from app import app, get_db
from models.video import Video, VideoMetadata
from services.video_processing_service import VideoProcessingService

# Test data constants
TEST_VIDEO_DATA = {
    "user_id": "test-user-123",
    "title": "Test Video",
    "description": "Video for testing",
    "status": "pending",
    "security_level": "private",
    "content_type": "training"
}

TEST_VIDEO_METADATA = {
    "duration": 60.0,
    "width": 1920,
    "height": 1080,
    "fps": 30.0,
    "codec": "h264",
    "size_bytes": 1024000,
    "format": "mp4",
    "checksum": "sha256:test-hash",
    "encryption": "AES-256"
}

PERFORMANCE_THRESHOLDS = {
    "max_processing_time": 60,  # seconds
    "max_memory_usage": 512,    # MB
    "max_cpu_usage": 80         # percent
}

def pytest_configure(config):
    """
    Configure pytest environment with enhanced settings for video service tests.
    
    Args:
        config: Pytest config object
    """
    # Set test environment variables
    os.environ["ENVIRONMENT"] = "test"
    os.environ["LOG_LEVEL"] = "DEBUG"
    os.environ["METRICS_ENABLED"] = "true"
    
    # Register custom markers
    config.addinivalue_line(
        "markers", "performance: mark test for performance validation"
    )
    config.addinivalue_line(
        "markers", "security: mark test for security validation"
    )
    
    # Configure test metrics collection
    config.option.verbose = 2
    config.option.log_level = "DEBUG"
    config.option.log_cli = True
    config.option.log_cli_level = "DEBUG"

@pytest.fixture
def test_video_binary() -> bytes:
    """
    Fixture providing test video binary data with security validation.
    
    Returns:
        bytes: Sample video file content
    """
    # Load sample video file
    video_path = os.path.join(os.path.dirname(__file__), "data/sample_video.mp4")
    with open(video_path, "rb") as f:
        content = f.read()
    
    # Validate file integrity
    if len(content) == 0:
        raise ValueError("Empty video file")
        
    # Check file header
    if not content.startswith((b"\x00\x00\x00", b"\x00\x00\x01")):
        raise ValueError("Invalid video file header")
        
    return content

@pytest.fixture
def mock_processing_service() -> Mock:
    """
    Enhanced fixture providing mocked video processing service with performance tracking.
    
    Returns:
        Mock: Mocked video processing service
    """
    mock_service = Mock(spec=VideoProcessingService)
    
    # Configure mock methods with performance tracking
    async def mock_process_video(video: Video, file_content: bytes) -> bool:
        # Simulate processing delay
        await asyncio.sleep(0.1)
        return True
        
    async def mock_validate_video(file_content: bytes) -> tuple[bool, str]:
        # Validate file size
        if len(file_content) > 1024 * 1024 * 500:  # 500MB
            return False, "File too large"
        return True, ""
    
    # Configure mock methods
    mock_service.process_video = AsyncMock(side_effect=mock_process_video)
    mock_service.validate_video = AsyncMock(side_effect=mock_validate_video)
    mock_service.monitor_processing.return_value = {
        "status": "completed",
        "progress": 100,
        "metrics": {
            "processing_time": 0.1,
            "memory_usage": 256,
            "cpu_usage": 50
        }
    }
    
    return mock_service

@pytest_asyncio.fixture
async def test_client() -> AsyncGenerator[httpx.AsyncClient, None]:
    """
    Advanced fixture providing FastAPI test client with security and monitoring.
    
    Yields:
        AsyncClient: Configured async test client
    """
    # Configure test database
    test_db = get_db()
    await test_db.connect()
    
    # Initialize test metrics
    test_metrics = {
        "requests": 0,
        "errors": 0,
        "response_times": []
    }
    
    # Create test client with security headers
    async with httpx.AsyncClient(
        app=app,
        base_url="http://test",
        headers={
            "X-Test-Client": "true",
            "X-Security-Context": "test"
        }
    ) as client:
        # Add test metrics tracking
        original_request = client.request
        
        async def tracked_request(*args, **kwargs):
            start_time = asyncio.get_event_loop().time()
            try:
                response = await original_request(*args, **kwargs)
                test_metrics["requests"] += 1
                test_metrics["response_times"].append(
                    asyncio.get_event_loop().time() - start_time
                )
                return response
            except Exception as e:
                test_metrics["errors"] += 1
                raise
                
        client.request = tracked_request
        yield client
        
    # Cleanup test database
    await test_db.disconnect()
    
    # Generate test metrics report
    avg_response_time = (
        sum(test_metrics["response_times"]) / len(test_metrics["response_times"])
        if test_metrics["response_times"]
        else 0
    )
    print(f"\nTest Metrics:")
    print(f"Total Requests: {test_metrics['requests']}")
    print(f"Total Errors: {test_metrics['errors']}")
    print(f"Average Response Time: {avg_response_time:.3f}s")