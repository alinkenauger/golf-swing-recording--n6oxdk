"""
Test package initialization for video processing service.
Configures pytest environment with custom markers, timeouts, and async test support.

Required packages:
pytest==7.4.0
pytest-asyncio==0.21.0
"""

import logging
import os
from typing import List

import pytest
from _pytest.config import Config
from _pytest.config.argparsing import Parser
from _pytest.nodes import Item

# Required pytest plugins
pytest_plugins = ["pytest_asyncio", "pytest_timeout"]

# Test configuration constants
TEST_MARKERS: List[str] = [
    "unit",
    "integration", 
    "performance",
    "video_processing",
    "async_test",
    "cleanup_required"
]

TEST_TIMEOUT: int = 60  # Default timeout for video processing tests
TEST_ENVIRONMENTS: List[str] = ["development", "staging", "production"]
LOG_LEVEL: str = "DEBUG"

def pytest_configure(config: Config) -> None:
    """
    Configure pytest environment with custom markers, timeouts, and test settings.
    
    Args:
        config: pytest configuration object
    """
    # Register custom markers
    config.addinivalue_line("markers", "unit: Mark test as a unit test")
    config.addinivalue_line("markers", "integration: Mark test as an integration test")
    config.addinivalue_line("markers", "performance: Mark test as a performance test")
    config.addinivalue_line("markers", "video_processing: Mark test as video processing related")
    config.addinivalue_line("markers", "async_test: Mark test as requiring async support")
    config.addinivalue_line("markers", "cleanup_required: Mark test as requiring cleanup")

    # Configure test timeouts
    config.addinivalue_line("timeout", "60")
    config.addinivalue_line("timeout_method", "thread")

    # Configure async test settings
    config.addinivalue_line("asyncio_mode", "auto")

    # Configure logging
    logging.basicConfig(
        level=getattr(logging, LOG_LEVEL),
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )

    # Set test environment
    os.environ.setdefault("TEST_ENV", "development")

    # Configure test parallelization
    if not config.option.numprocesses:
        config.option.numprocesses = "auto"

    # Configure coverage reporting
    config.option.cov_report = ["term-missing", "html"]
    config.option.cov_config = ".coveragerc"

def pytest_sessionstart(session: pytest.Session) -> None:
    """
    Initialize test session with required setup and validations.
    
    Args:
        session: pytest session object
    """
    # Validate test environment
    test_env = os.getenv("TEST_ENV")
    if test_env not in TEST_ENVIRONMENTS:
        raise ValueError(f"Invalid test environment: {test_env}")

    # Initialize test logger
    logger = logging.getLogger("video_service_tests")
    logger.setLevel(getattr(logging, LOG_LEVEL))

    # Log test session start
    logger.info(f"Starting test session in {test_env} environment")

    # Configure test timeouts based on environment
    if test_env == "production":
        pytest.timeout = TEST_TIMEOUT * 2  # Double timeout for production tests
    else:
        pytest.timeout = TEST_TIMEOUT

def pytest_collection_modifyitems(config: Config, items: List[Item]) -> None:
    """
    Modify test items to apply environment-specific configurations.
    
    Args:
        config: pytest configuration object
        items: list of test items to be executed
    """
    for item in items:
        # Add async marker to all async test functions
        if item.get_closest_marker("asyncio"):
            item.add_marker(pytest.mark.async_test)

        # Add timeout to performance tests
        if item.get_closest_marker("performance"):
            item.add_marker(pytest.mark.timeout(TEST_TIMEOUT))

def pytest_addoption(parser: Parser) -> None:
    """
    Add custom command line options for test configuration.
    
    Args:
        parser: pytest argument parser
    """
    parser.addoption(
        "--test-env",
        action="store",
        default="development",
        help="Test environment (development/staging/production)"
    )
    parser.addoption(
        "--video-timeout",
        action="store",
        type=int,
        default=TEST_TIMEOUT,
        help="Timeout for video processing tests in seconds"
    )