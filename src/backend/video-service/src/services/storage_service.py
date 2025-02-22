"""
Storage Service Module
Provides secure and optimized video storage operations with CDN integration.

External Dependencies:
boto3==1.28.0
botocore==1.31.0
"""

import os
from typing import Dict, Optional, Tuple
from uuid import UUID
import boto3
from botocore.exceptions import ClientError
from botocore.config import Config

from ..utils.logger import VideoServiceLogger
from ..config import (
    S3_BUCKET as S3_BUCKET_NAME,
    AWS_REGION,
    CDN_DOMAIN,
    URL_EXPIRY_SECONDS,
    MAX_RETRIES
)
from ..models.video import Video

class StorageService:
    """Enhanced service class for managing video storage operations with security and performance optimizations."""

    def __init__(self) -> None:
        """Initialize storage service with enhanced configuration and monitoring."""
        # Configure boto3 client with retry strategy and timeouts
        boto_config = Config(
            region_name=AWS_REGION,
            retries={'max_attempts': MAX_RETRIES, 'mode': 'adaptive'},
            connect_timeout=5,
            read_timeout=60
        )
        
        self._s3_client = boto3.client('s3', config=boto_config)
        self._bucket_name = S3_BUCKET_NAME
        self._cdn_domain = CDN_DOMAIN
        self._logger = VideoServiceLogger("storage_service")
        self._url_cache: Dict[str, Dict] = {}
        self._max_retries = MAX_RETRIES
        self._url_expiry_seconds = URL_EXPIRY_SECONDS

        # Validate configuration
        if not all([self._bucket_name, self._cdn_domain]):
            raise ValueError("Missing required storage configuration")

        # Initialize metrics
        self._logger.info("Storage service initialized", {
            "bucket": self._bucket_name,
            "cdn": self._cdn_domain,
            "region": AWS_REGION
        })

    def upload_video(self, file_content: bytes, file_name: str, video_id: UUID) -> Tuple[bool, str, Optional[str]]:
        """
        Uploads a video file to cloud storage with enhanced security and validation.

        Args:
            file_content: Raw video file bytes
            file_name: Original file name
            video_id: Unique video identifier

        Returns:
            Tuple containing:
            - Success status (bool)
            - Error message if any (str)
            - CDN URL if successful (Optional[str])
        """
        try:
            # Generate secure storage key
            storage_key = f"videos/{video_id}/{os.path.basename(file_name)}"
            
            # Log upload attempt
            self._logger.info("Starting video upload", {
                "video_id": str(video_id),
                "file_name": file_name,
                "size_bytes": len(file_content)
            })

            # Upload with content type detection and encryption
            content_type = "video/" + file_name.split(".")[-1].lower()
            upload_args = {
                "Bucket": self._bucket_name,
                "Key": storage_key,
                "Body": file_content,
                "ContentType": content_type,
                "ServerSideEncryption": "AES256",
                "Metadata": {
                    "video_id": str(video_id),
                    "original_name": file_name
                }
            }

            # Perform upload with retry logic
            for attempt in range(self._max_retries):
                try:
                    self._s3_client.put_object(**upload_args)
                    break
                except ClientError as e:
                    if attempt == self._max_retries - 1:
                        raise e
                    self._logger.warning(f"Upload retry {attempt + 1}/{self._max_retries}", {
                        "error": str(e),
                        "video_id": str(video_id)
                    })

            # Generate CDN URL
            cdn_url = f"https://{self._cdn_domain}/{storage_key}"
            
            # Cache URL mapping
            self._url_cache[storage_key] = {
                "cdn_url": cdn_url,
                "video_id": str(video_id)
            }

            # Log successful upload
            self._logger.info("Video upload completed", {
                "video_id": str(video_id),
                "storage_key": storage_key,
                "cdn_url": cdn_url
            })

            return True, "", cdn_url

        except Exception as e:
            error_msg = f"Video upload failed: {str(e)}"
            self._logger.error(error_msg, {
                "video_id": str(video_id),
                "file_name": file_name
            })
            return False, error_msg, None

    def upload_variant(self, variant_content: bytes, video_id: UUID, quality: str) -> Tuple[bool, str, Optional[str]]:
        """
        Uploads a processed video variant with enhanced security.

        Args:
            variant_content: Processed variant file content
            video_id: Parent video identifier
            quality: Quality level of the variant

        Returns:
            Tuple containing:
            - Success status (bool)
            - Error message if any (str)
            - CDN URL if successful (Optional[str])
        """
        try:
            # Generate secure variant key
            variant_key = f"videos/{video_id}/variants/{quality}.mp4"
            
            # Upload with encryption and metadata
            upload_args = {
                "Bucket": self._bucket_name,
                "Key": variant_key,
                "Body": variant_content,
                "ContentType": "video/mp4",
                "ServerSideEncryption": "AES256",
                "Metadata": {
                    "video_id": str(video_id),
                    "quality": quality
                }
            }

            self._s3_client.put_object(**upload_args)
            
            # Generate and cache CDN URL
            cdn_url = f"https://{self._cdn_domain}/{variant_key}"
            self._url_cache[variant_key] = {
                "cdn_url": cdn_url,
                "video_id": str(video_id),
                "quality": quality
            }

            self._logger.info("Variant upload completed", {
                "video_id": str(video_id),
                "quality": quality,
                "storage_key": variant_key
            })

            return True, "", cdn_url

        except Exception as e:
            error_msg = f"Variant upload failed: {str(e)}"
            self._logger.error(error_msg, {
                "video_id": str(video_id),
                "quality": quality
            })
            return False, error_msg, None

    def delete_video(self, video: Video) -> bool:
        """
        Securely deletes a video and all its variants with verification.

        Args:
            video: Video model instance to delete

        Returns:
            bool: Success status
        """
        try:
            # Collect all keys to delete
            delete_keys = [
                f"videos/{video.id}/{os.path.basename(variant.url)}"
                for variant in video.variants
            ]
            delete_keys.append(f"videos/{video.id}/original.mp4")

            # Delete objects in batch
            delete_objects = {
                "Objects": [{"Key": key} for key in delete_keys],
                "Quiet": True
            }

            response = self._s3_client.delete_objects(
                Bucket=self._bucket_name,
                Delete=delete_objects
            )

            # Verify deletion
            if "Errors" in response and response["Errors"]:
                raise Exception(f"Deletion errors: {response['Errors']}")

            # Clear URL cache
            for key in delete_keys:
                self._url_cache.pop(key, None)

            self._logger.info("Video deletion completed", {
                "video_id": str(video.id),
                "deleted_keys": delete_keys
            })

            return True

        except Exception as e:
            self._logger.error(f"Video deletion failed: {str(e)}", {
                "video_id": str(video.id)
            })
            return False

    def get_signed_url(self, storage_key: str, expiry_seconds: Optional[int] = None) -> Optional[str]:
        """
        Generates a secure temporary signed URL with caching.

        Args:
            storage_key: Storage key of the video
            expiry_seconds: URL expiration time in seconds

        Returns:
            Optional[str]: Signed URL if successful, None otherwise
        """
        try:
            # Check cache first
            cache_entry = self._url_cache.get(storage_key)
            if cache_entry and "signed_url" in cache_entry:
                return cache_entry["signed_url"]

            # Generate signed URL
            expiry = expiry_seconds or self._url_expiry_seconds
            signed_url = self._s3_client.generate_presigned_url(
                'get_object',
                Params={
                    'Bucket': self._bucket_name,
                    'Key': storage_key
                },
                ExpiresIn=expiry
            )

            # Cache signed URL
            if cache_entry:
                cache_entry["signed_url"] = signed_url
                cache_entry["expiry"] = expiry
            else:
                self._url_cache[storage_key] = {
                    "signed_url": signed_url,
                    "expiry": expiry
                }

            return signed_url

        except Exception as e:
            self._logger.error(f"Signed URL generation failed: {str(e)}", {
                "storage_key": storage_key
            })
            return None