"""
Comprehensive test suite for the video annotation service.
Tests drawing annotations, voice-overs, annotation management, performance, and security.

External Dependencies:
pytest==7.3.1
mock==5.1.0
pytest-asyncio==0.21.0
pytest-timeout==2.1.0
aiohttp==3.8.5
"""

import pytest
import asyncio
from datetime import datetime
from uuid import uuid4
from mock import Mock, AsyncMock
import json

from ...src.services.annotation_service import AnnotationService
from ...src.models.annotation import Annotation, DrawingAnnotation, VoiceOverAnnotation
from ...src.utils.metrics import VideoMetrics
from ...src.utils.logger import VideoServiceLogger

# Test data constants
TEST_VIDEO_ID = str(uuid4())
TEST_USER_ID = str(uuid4())
TEST_TIMESTAMP = 10.5

TEST_DRAWING_DATA = {
    'tool_type': 'pen',
    'points': [
        {'x': 100, 'y': 100, 'pressure': 1.0, 'timestamp': datetime.utcnow()},
        {'x': 200, 'y': 200, 'pressure': 0.8, 'timestamp': datetime.utcnow()}
    ],
    'color': '#FF0000',
    'stroke_width': 2.0,
    'is_filled': False,
    'metadata': {'tool_mode': 'freehand'}
}

TEST_VOICE_OVER_DATA = {
    'audio_url': 'https://cdn.example.com/voice-overs/test.mp3',
    'duration': 10.5,
    'format': 'audio/mp3',
    'size_bytes': 1024 * 1024,  # 1MB
    'metadata': {'language': 'en-US'}
}

MALFORMED_DATA = {
    'tool_type': 'invalid',
    'points': 'not_an_array',
    'color': 'invalid_color'
}

@pytest.fixture
def mock_annotation_repository():
    """Provides mocked annotation repository with enhanced error simulation."""
    repository = AsyncMock()
    
    # Configure success cases
    repository.create.return_value = str(uuid4())
    repository.get_by_id.return_value = Annotation(
        video_id=TEST_VIDEO_ID,
        user_id=TEST_USER_ID,
        type='drawing',
        timestamp=TEST_TIMESTAMP,
        data=DrawingAnnotation(**TEST_DRAWING_DATA)
    )
    repository.get_by_video.return_value = [
        Annotation(
            video_id=TEST_VIDEO_ID,
            user_id=TEST_USER_ID,
            type='drawing',
            timestamp=TEST_TIMESTAMP,
            data=DrawingAnnotation(**TEST_DRAWING_DATA)
        )
    ]
    
    # Add error simulation methods
    async def simulate_timeout(*args, **kwargs):
        await asyncio.sleep(2)
        raise TimeoutError("Repository operation timed out")
    
    async def simulate_db_error(*args, **kwargs):
        raise Exception("Database connection failed")
    
    repository.simulate_timeout = simulate_timeout
    repository.simulate_db_error = simulate_db_error
    
    return repository

@pytest.fixture
def mock_storage_service():
    """Provides mocked storage service for file operations."""
    storage = AsyncMock()
    
    # Configure success cases
    storage.upload_video.return_value = (True, "", "https://cdn.example.com/test.mp3")
    storage.validate_file.return_value = (True, "", {})
    
    # Add error simulation
    storage.simulate_upload_error = AsyncMock(
        return_value=(False, "Upload failed", None)
    )
    
    return storage

@pytest.fixture
def mock_metrics_service():
    """Provides mocked metrics service."""
    metrics = Mock(spec=VideoMetrics)
    return metrics

@pytest.fixture
def annotation_service(mock_annotation_repository, mock_storage_service, mock_metrics_service):
    """Creates annotation service instance with mocked dependencies."""
    return AnnotationService(
        repository=mock_annotation_repository,
        storage_service=mock_storage_service,
        metrics_service=mock_metrics_service
    )

@pytest.mark.asyncio
async def test_create_drawing_annotation_success(annotation_service):
    """Tests successful creation of drawing annotation."""
    annotation = await annotation_service.create_drawing_annotation(
        video_id=TEST_VIDEO_ID,
        user_id=TEST_USER_ID,
        timestamp=TEST_TIMESTAMP,
        drawing_data=DrawingAnnotation(**TEST_DRAWING_DATA)
    )
    
    assert annotation is not None
    assert annotation.video_id == TEST_VIDEO_ID
    assert annotation.user_id == TEST_USER_ID
    assert annotation.type == 'drawing'
    assert annotation.timestamp == TEST_TIMESTAMP
    assert isinstance(annotation.data, DrawingAnnotation)

@pytest.mark.asyncio
async def test_create_voice_over_success(annotation_service, mock_storage_service):
    """Tests successful creation of voice-over annotation."""
    audio_data = b"test_audio_data"
    file_name = "test_voice_over.mp3"
    metadata = {
        'duration': 10.5,
        'format': 'audio/mp3',
        'language': 'en-US'
    }
    
    annotation = await annotation_service.create_voice_over(
        video_id=TEST_VIDEO_ID,
        user_id=TEST_USER_ID,
        timestamp=TEST_TIMESTAMP,
        audio_data=audio_data,
        file_name=file_name,
        metadata=metadata
    )
    
    assert annotation is not None
    assert annotation.type == 'voice-over'
    assert isinstance(annotation.data, VoiceOverAnnotation)
    assert annotation.data.duration == metadata['duration']
    mock_storage_service.upload_video.assert_called_once()

@pytest.mark.asyncio
@pytest.mark.timeout(60)
async def test_create_drawing_annotation_performance(annotation_service):
    """Tests performance of drawing annotation creation."""
    # Create large test dataset
    points = [
        {'x': x, 'y': y, 'pressure': 1.0, 'timestamp': datetime.utcnow()}
        for x, y in zip(range(0, 1000, 10), range(0, 1000, 10))
    ]
    
    large_drawing_data = {
        'tool_type': 'pen',
        'points': points,
        'color': '#FF0000',
        'stroke_width': 2.0,
        'is_filled': False,
        'metadata': {'performance_test': True}
    }
    
    start_time = datetime.utcnow()
    
    # Create multiple annotations concurrently
    tasks = []
    for _ in range(10):
        tasks.append(
            annotation_service.create_drawing_annotation(
                video_id=TEST_VIDEO_ID,
                user_id=TEST_USER_ID,
                timestamp=TEST_TIMESTAMP,
                drawing_data=DrawingAnnotation(**large_drawing_data)
            )
        )
    
    results = await asyncio.gather(*tasks)
    end_time = datetime.utcnow()
    
    processing_time = (end_time - start_time).total_seconds()
    assert processing_time < 60  # Validate against technical spec requirement
    assert all(result is not None for result in results)

@pytest.mark.asyncio
async def test_concurrent_annotation_operations(annotation_service):
    """Tests concurrent annotation operations."""
    # Create multiple test annotations
    drawing_annotations = [
        DrawingAnnotation(**TEST_DRAWING_DATA) for _ in range(5)
    ]
    
    voice_over_annotations = [
        {
            'audio_data': b"test_audio_data",
            'file_name': f"voice_over_{i}.mp3",
            'metadata': {'duration': 5.0, 'format': 'audio/mp3'}
        } for i in range(5)
    ]
    
    # Execute operations concurrently
    tasks = []
    for drawing in drawing_annotations:
        tasks.append(
            annotation_service.create_drawing_annotation(
                video_id=TEST_VIDEO_ID,
                user_id=TEST_USER_ID,
                timestamp=TEST_TIMESTAMP,
                drawing_data=drawing
            )
        )
    
    for voice_over in voice_over_annotations:
        tasks.append(
            annotation_service.create_voice_over(
                video_id=TEST_VIDEO_ID,
                user_id=TEST_USER_ID,
                timestamp=TEST_TIMESTAMP,
                **voice_over
            )
        )
    
    results = await asyncio.gather(*tasks)
    assert len(results) == 10
    assert all(result is not None for result in results)

@pytest.mark.asyncio
async def test_annotation_validation(annotation_service):
    """Tests annotation validation logic."""
    # Test invalid drawing data
    with pytest.raises(ValueError):
        await annotation_service.create_drawing_annotation(
            video_id=TEST_VIDEO_ID,
            user_id=TEST_USER_ID,
            timestamp=TEST_TIMESTAMP,
            drawing_data=DrawingAnnotation(**MALFORMED_DATA)
        )
    
    # Test invalid voice-over data
    with pytest.raises(ValueError):
        await annotation_service.create_voice_over(
            video_id=TEST_VIDEO_ID,
            user_id=TEST_USER_ID,
            timestamp=TEST_TIMESTAMP,
            audio_data=b"",
            file_name="invalid.txt",
            metadata={}
        )

@pytest.mark.asyncio
async def test_annotation_security(annotation_service, mock_security_context):
    """Tests annotation security measures."""
    # Test unauthorized access
    mock_security_context.user_id = "unauthorized_user"
    
    with pytest.raises(ValueError, match="Unauthorized"):
        await annotation_service.delete_annotation(
            annotation_id=str(uuid4()),
            user_id=mock_security_context.user_id
        )
    
    # Test authorized access
    mock_security_context.user_id = TEST_USER_ID
    result = await annotation_service.delete_annotation(
        annotation_id=str(uuid4()),
        user_id=mock_security_context.user_id
    )
    assert result is True

@pytest.mark.asyncio
async def test_error_handling(annotation_service, mock_annotation_repository):
    """Tests error handling and recovery."""
    # Test repository timeout
    mock_annotation_repository.create.side_effect = mock_annotation_repository.simulate_timeout
    
    with pytest.raises(TimeoutError):
        await annotation_service.create_drawing_annotation(
            video_id=TEST_VIDEO_ID,
            user_id=TEST_USER_ID,
            timestamp=TEST_TIMESTAMP,
            drawing_data=DrawingAnnotation(**TEST_DRAWING_DATA)
        )
    
    # Test database error
    mock_annotation_repository.create.side_effect = mock_annotation_repository.simulate_db_error
    
    with pytest.raises(Exception, match="Database connection failed"):
        await annotation_service.create_drawing_annotation(
            video_id=TEST_VIDEO_ID,
            user_id=TEST_USER_ID,
            timestamp=TEST_TIMESTAMP,
            drawing_data=DrawingAnnotation(**TEST_DRAWING_DATA)
        )

@pytest.mark.asyncio
async def test_metrics_collection(annotation_service, mock_metrics_service):
    """Tests metrics collection during annotation operations."""
    await annotation_service.create_drawing_annotation(
        video_id=TEST_VIDEO_ID,
        user_id=TEST_USER_ID,
        timestamp=TEST_TIMESTAMP,
        drawing_data=DrawingAnnotation(**TEST_DRAWING_DATA)
    )
    
    mock_metrics_service.track_storage_operation.assert_called_with(
        "annotation_create",
        "success"
    )

@pytest.mark.asyncio
async def test_annotation_retrieval(annotation_service):
    """Tests annotation retrieval functionality."""
    annotations = await annotation_service.get_video_annotations(
        video_id=TEST_VIDEO_ID,
        annotation_type='drawing',
        page_size=10,
        page_number=1
    )
    
    assert isinstance(annotations, list)
    assert len(annotations) > 0
    assert all(isinstance(a, Annotation) for a in annotations)
    assert all(a.video_id == TEST_VIDEO_ID for a in annotations)