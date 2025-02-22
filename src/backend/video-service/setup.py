import os
from setuptools import setup, find_packages

# Read the README file for long description
with open("README.md", encoding="utf-8") as f:
    long_description = f.read()

# Package metadata and configuration
setup(
    name="video-service",
    version="1.0.0",
    description="High-performance video processing service for analyzing, annotating and managing coaching videos with support for format validation, compression and variant generation",
    long_description=long_description,
    long_description_content_type="text/markdown",
    author="Video Coaching Platform",
    author_email="dev@videocoachingplatform.com",
    url="https://github.com/videocoachingplatform/video-service",
    
    # Python version requirement
    python_requires=">=3.11,<3.12",
    
    # Package discovery
    packages=find_packages(where="src"),
    package_dir={"": "src"},
    
    # Core dependencies
    install_requires=[
        "fastapi==0.104.0",
        "uvicorn==0.24.0",
        "pydantic==2.4.2",
        "opencv-python-headless==4.8.1",  # Headless version for server deployment
        "numpy==1.24.3",
        "boto3==1.28.44",
        "sqlalchemy==2.0.22",
        "pymongo==4.5.0",
        "python-jose==3.3.0",
        "elastic-apm==6.18.0",
        "prometheus-fastapi-instrumentator==6.1.0",
        "python-multipart==0.0.6",
        "redis==5.0.1",
        "python-magic==0.4.27",
        "tenacity==8.2.3",
        "typing-extensions==4.8.0",
    ],
    
    # Optional dependencies
    extras_require={
        "dev": [
            "pytest>=7.4.0",
            "pytest-cov>=4.1.0",
            "black>=23.9.1",
            "isort>=5.12.0",
            "flake8>=6.1.0",
            "mypy>=1.5.1",
        ],
        "docs": [
            "sphinx>=7.1.0",
            "sphinx-rtd-theme>=1.3.0",
        ],
        "gpu": [
            "opencv-python-headless-gpu==4.8.1",  # GPU-accelerated version
        ],
    },
    
    # Entry points for CLI
    entry_points={
        "console_scripts": [
            "video-service=src.app:main",
        ],
    },
    
    # Package data including type hints
    package_data={
        "video-service": [
            "py.typed",
            "*.pyi",
            "**/*.pyi",
            "*.json",
            "**/*.json",
        ],
    },
    
    # Package classifiers
    classifiers=[
        "Development Status :: 5 - Production/Stable",
        "Intended Audience :: Developers",
        "Topic :: Multimedia :: Video",
        "License :: OSI Approved :: MIT License",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.11",
        "Operating System :: POSIX :: Linux",
        "Operating System :: MacOS :: MacOS X",
        "Environment :: GPU :: NVIDIA CUDA",
        "Framework :: FastAPI",
        "Typing :: Typed",
    ],
    
    # Additional metadata
    keywords="video processing, coaching, annotations, compression, streaming",
    platforms=["Linux", "MacOS X"],
    include_package_data=True,
    zip_safe=False,
    
    # Project URLs
    project_urls={
        "Bug Reports": "https://github.com/videocoachingplatform/video-service/issues",
        "Documentation": "https://docs.videocoachingplatform.com/video-service/",
        "Source Code": "https://github.com/videocoachingplatform/video-service",
    },
)