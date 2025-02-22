# Configure AWS provider requirements
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# Primary S3 bucket for video content storage
resource "aws_s3_bucket" "video_storage" {
  bucket = "${var.project_name}-${var.environment}-video-storage"
  tags   = merge(var.tags, {
    Environment = var.environment
    Purpose     = "Video content storage"
  })

  # Prevent accidental bucket deletion in production
  force_destroy = var.environment != "prod"
}

# Enable intelligent tiering for cost optimization
resource "aws_s3_bucket_intelligent_tiering_configuration" "video_storage" {
  count  = var.enable_intelligent_tiering ? 1 : 0
  bucket = aws_s3_bucket.video_storage.id
  name   = "EntireStorage"

  tiering {
    access_tier = "DEEP_ARCHIVE_ACCESS"
    days        = 180
  }

  tiering {
    access_tier = "ARCHIVE_ACCESS"
    days        = 90
  }
}

# Configure versioning for data protection
resource "aws_s3_bucket_versioning" "video_storage" {
  bucket = aws_s3_bucket.video_storage.id
  versioning_configuration {
    status = var.enable_versioning ? "Enabled" : "Disabled"
  }
}

# Implement lifecycle rules for video retention
resource "aws_s3_bucket_lifecycle_rule" "video_retention" {
  bucket = aws_s3_bucket.video_storage.id
  id     = "video-retention"
  status = "Enabled"

  transition {
    days          = 30
    storage_class = "STANDARD_IA"
  }

  transition {
    days          = var.video_retention_days
    storage_class = "GLACIER"
  }

  expiration {
    days = var.video_retention_days + 90
  }

  noncurrent_version_expiration {
    days = 30
  }
}

# Configure server-side encryption
resource "aws_s3_bucket_server_side_encryption_configuration" "video_storage" {
  bucket = aws_s3_bucket.video_storage.id

  rule {
    apply_server_side_encryption_by_default {
      kms_master_key_id = var.kms_key_id
      sse_algorithm     = var.encryption_algorithm
    }
    bucket_key_enabled = true
  }
}

# Set up CORS configuration
resource "aws_s3_bucket_cors_configuration" "video_storage" {
  bucket = aws_s3_bucket.video_storage.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "PUT", "POST", "DELETE", "HEAD"]
    allowed_origins = var.cors_allowed_origins
    expose_headers  = ["ETag"]
    max_age_seconds = 3600
  }
}

# Configure bucket policy
resource "aws_s3_bucket_policy" "video_storage" {
  bucket = aws_s3_bucket.video_storage.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "EnforceHTTPS"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource  = [
          aws_s3_bucket.video_storage.arn,
          "${aws_s3_bucket.video_storage.arn}/*"
        ]
        Condition = {
          Bool = {
            "aws:SecureTransport" = "false"
          }
        }
      },
      {
        Sid       = "AllowCloudFrontAccess"
        Effect    = "Allow"
        Principal = {
          Service = "cloudfront.amazonaws.com"
        }
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.video_storage.arn}/*"
      }
    ]
  })
}

# Enable access logging
resource "aws_s3_bucket_logging" "video_storage" {
  bucket = aws_s3_bucket.video_storage.id

  target_bucket = aws_s3_bucket.video_storage.id
  target_prefix = "access-logs/"
}

# Configure transfer acceleration
resource "aws_s3_bucket_accelerate_configuration" "video_storage" {
  count  = var.enable_transfer_acceleration ? 1 : 0
  bucket = aws_s3_bucket.video_storage.id
  status = "Enabled"
}

# Block public access
resource "aws_s3_bucket_public_access_block" "video_storage" {
  bucket = aws_s3_bucket.video_storage.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Enable object ownership controls
resource "aws_s3_bucket_ownership_controls" "video_storage" {
  bucket = aws_s3_bucket.video_storage.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}