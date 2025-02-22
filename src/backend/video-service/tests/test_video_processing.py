"""
Video Processing Service Test Suite
Comprehensive tests for video processing functionality including format validation,
processing pipeline, variant generation and error handling.

External Dependencies:
pytest==7.4.0
pytest-asyncio==0.21.0
mock==5.1.0
pytest-timeout==2.1.0
"""

import pytest
from mock import Mock, patch
from datetime import datetime
from uuid import uuid4

from ...src.services.video_processing_service import VideoProcessingService
from ...src.models.video import Video, VideoMetadata
from ...src.services.storage_service import StorageService

# Test constants
SAMPLE_VIDEO_METADATA = {
    'duration': 60.0,
    'width': 1920,
    'height': 1080,
    'fps': 30.0,
    'codec': 'h264',
    'format': 'mp4',
    'size_bytes': 1024000,
    'mime_type': 'video/mp4',
    'checksum': 'sha256:sample_checksum'
}

INVALID_VIDEO_CONTENT = b'invalid_binary_content'

PROCESSING_TIMEOUT = 60

VARIANT_CONFIGS = {
    'HD': {'width': 1920, 'height': 1080, 'bitrate': '4000k'},
    'SD': {'width': 1280, 'height': 720, 'bitrate': '2000k'},
    'MOBILE': {'width': 854, 'height': 480, 'bitrate': '1000k'}
}

@pytest.fixture
def storage_service():
    """Mock storage service fixture"""
    mock_storage = Mock(spec=StorageService)
    mock_storage.upload_variant.return_value = (True, "", "https://cdn.example.com/video.mp4")
    return mock_storage

@pytest.fixture
def processing_service(storage_service):
    """Video processing service fixture"""
    return VideoProcessingService(storage_service)

@pytest.fixture
def test_video():
    """Test video model fixture"""
    return Video(
        user_id="test_user",
        title="Test Video",
        description="Test video for processing",
        file_content=b"test_content",
        filename="test.mp4"
    )

@pytest.mark.asyncio
async def test_video_format_validation(processing_service):
    """Tests comprehensive video format validation including MIME types, codecs, file size and corruption checks"""
    
    # Test valid video format
    valid_content = b"valid_video_content"
    with patch('magic.from_buffer') as mock_magic:
        mock_magic.return_value = "video/mp4"
        is_valid, error = await processing_service.validate_format(valid_content)
        assert is_valid
        assert not error

    # Test invalid MIME type
    with patch('magic.from_buffer') as mock_magic:
        mock_magic.return_value = "application/pdf"
        is_valid, error = await processing_service.validate_format(INVALID_VIDEO_CONTENT)
        assert not is_valid
        assert "Unsupported MIME type" in error

    # Test corrupt file
    corrupt_content = b"corrupt_video_data"
    is_valid, error = await processing_service.validate_format(corrupt_content)
    assert not is_valid
    assert "Invalid video format" in error

    # Test empty file
    is_valid, error = await processing_service.validate_format(b"")
    assert not is_valid
    assert "Empty file content" in error

@pytest.mark.asyncio
@pytest.mark.timeout(PROCESSING_TIMEOUT)
async def test_video_processing_pipeline(processing_service, test_video, storage_service):
    """Tests end-to-end video processing pipeline including security, performance and quality checks"""
    
    test_content = b"test_video_content"
    
    # Mock security scan
    with patch.object(processing_service, 'scan_security') as mock_scan:
        mock_scan.return_value = (True, "")
        
        # Mock format validation
        with patch.object(processing_service, 'validate_format') as mock_validate:
            mock_validate.return_value = (True, "")
            
            # Mock variant generation
            with patch.object(processing_service, 'generate_variant') as mock_generate:
                mock_generate.return_value = (b"variant_content", VideoMetadata(**SAMPLE_VIDEO_METADATA))
                
                # Process video
                start_time = datetime.now()
                success = await processing_service.process_video(test_video, test_content)
                processing_time = (datetime.now() - start_time).total_seconds()
                
                # Verify processing success
                assert success
                assert processing_time < PROCESSING_TIMEOUT
                assert test_video.status == "ready"
                
                # Verify variant generation
                assert len(test_video.variants) == len(VARIANT_CONFIGS)
                
                # Verify storage integration
                storage_service.upload_variant.assert_called()

@pytest.mark.asyncio
async def test_variant_generation(processing_service):
    """Tests video variant generation with quality validation and performance monitoring"""
    
    test_content = b"test_video_content"
    
    for quality, config in VARIANT_CONFIGS.items():
        # Generate variant
        with patch('ffmpeg') as mock_ffmpeg:
            mock_ffmpeg.input.return_value.output.return_value.run.return_value = (b"variant_content", None)
            
            variant_content, metadata = await processing_service.generate_variant(
                test_content,
                quality,
                config
            )
            
            # Verify variant content
            assert variant_content
            assert isinstance(metadata, VideoMetadata)
            
            # Verify variant configuration
            assert metadata.width == config['width']
            assert metadata.height == config['height']
            assert metadata.codec == 'h264'

@pytest.mark.asyncio
async def test_error_handling(processing_service, storage_service):
    """Tests comprehensive error handling scenarios including security, resource and integration failures"""
    
    test_video = Video(
        user_id="test_user",
        title="Test Video",
        description="Test video for error handling",
        file_content=b"test_content",
        filename="test.mp4"
    )
    
    # Test malicious file detection
    with patch.object(processing_service, 'scan_security') as mock_scan:
        mock_scan.return_value = (False, "Malware detected")
        with pytest.raises(ValueError) as exc_info:
            await processing_service.process_video(test_video, b"malicious_content")
        assert "Security scan failed" in str(exc_info.value)
        assert test_video.status == "failed"

    # Test storage failure
    storage_service.upload_variant.return_value = (False, "Storage error", None)
    with pytest.raises(ValueError) as exc_info:
        await processing_service.process_video(test_video, b"test_content")
    assert "Failed to upload" in str(exc_info.value)
    
    # Test timeout handling
    with patch.object(processing_service, 'generate_variant') as mock_generate:
        mock_generate.side_effect = TimeoutError("Processing timeout")
        with pytest.raises(TimeoutError):
            await processing_service.process_video(test_video, b"test_content")
    
    # Verify cleanup on failure
    storage_service.cleanup_failed_upload.assert_called_with(test_video.id)