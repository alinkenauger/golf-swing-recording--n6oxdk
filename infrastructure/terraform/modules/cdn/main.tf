# Configure AWS provider requirements
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.0"
    }
  }
}

# Provider configuration for us-east-1 (required for CloudFront)
provider "aws" {
  region = "us-east-1"
  alias  = "us-east-1"
}

# Origin Access Identity for secure S3 access
resource "aws_cloudfront_origin_access_identity" "video_oai" {
  comment = "Origin Access Identity for ${var.project_name}-${var.environment}"
  
  tags = {
    Environment = var.environment
    Project     = var.project_name
    ManagedBy   = "terraform"
  }
}

# CloudFront distribution configuration
resource "aws_cloudfront_distribution" "main" {
  enabled             = true
  is_ipv6_enabled    = var.enable_ipv6
  http_version       = "http2and3"
  price_class        = var.price_class
  web_acl_id         = var.waf_web_acl_id
  retain_on_delete   = false
  wait_for_deployment = true

  # Video content origin configuration
  origin {
    domain_name = "${var.video_bucket_id}.s3.amazonaws.com"
    origin_id   = "S3-${var.project_name}-video"
    
    s3_origin_config {
      origin_access_identity = aws_cloudfront_origin_access_identity.video_oai.cloudfront_access_identity_path
    }
  }

  # Training content origin configuration
  origin {
    domain_name = "${var.training_bucket_id}.s3.amazonaws.com"
    origin_id   = "S3-${var.project_name}-training"
    
    s3_origin_config {
      origin_access_identity = aws_cloudfront_origin_access_identity.video_oai.cloudfront_access_identity_path
    }
  }

  # Default cache behavior for video content
  default_cache_behavior {
    allowed_methods  = ["GET", "HEAD", "OPTIONS"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "S3-${var.project_name}-video"
    compress         = true

    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = 0
    default_ttl            = var.default_ttl
    max_ttl                = 86400

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }

    lambda_function_association {
      event_type = "viewer-request"
      lambda_arn = var.auth_lambda_arn
    }
  }

  # Ordered cache behavior for training content
  ordered_cache_behavior {
    path_pattern     = "/training/*"
    allowed_methods  = ["GET", "HEAD", "OPTIONS"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "S3-${var.project_name}-training"
    compress         = true

    viewer_protocol_policy = "redirect-to-https"
    min_ttl                = 0
    default_ttl            = var.default_ttl
    max_ttl                = 86400

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }
  }

  # Custom error response configuration
  custom_error_response {
    error_code         = 403
    response_code      = 404
    response_page_path = "/404.html"
  }

  # Geographic restrictions
  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  # SSL certificate configuration
  viewer_certificate {
    cloudfront_default_certificate = true
    minimum_protocol_version       = "TLSv1.2_2021"
  }

  # Resource tags
  tags = {
    Environment = var.environment
    Project     = var.project_name
    ManagedBy   = "terraform"
  }

  # Logging configuration
  logging_config {
    include_cookies = false
    bucket         = "${var.logging_bucket}.s3.amazonaws.com"
    prefix         = "cloudfront-logs/"
  }
}

# Output the CloudFront distribution ID
output "cloudfront_distribution_id" {
  value       = aws_cloudfront_distribution.main.id
  description = "ID of the CloudFront distribution for reference in other modules and invalidations"
}

# Output the CloudFront domain name
output "cloudfront_domain_name" {
  value       = aws_cloudfront_distribution.main.domain_name
  description = "Domain name of the CloudFront distribution for DNS configuration and client access"
}