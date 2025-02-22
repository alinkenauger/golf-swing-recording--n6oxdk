# Required environment variable with strict validation
variable "environment" {
  type        = string
  description = "Deployment environment identifier (dev, staging, prod)"
  
  validation {
    condition     = can(regex("^(dev|staging|prod)$", var.environment))
    error_message = "Environment must be one of: dev, staging, prod"
  }
}

# Project name variable with default value
variable "project_name" {
  type        = string
  description = "Project identifier for resource naming and tagging"
  default     = "videocoach"
}

# Versioning control for data protection
variable "enable_versioning" {
  type        = bool
  description = "Enable versioning for S3 buckets to protect against accidental deletions"
  default     = true
}

# Video retention configuration with minimum period validation
variable "video_retention_days" {
  type        = number
  description = "Number of days to retain video content after last access"
  default     = 90

  validation {
    condition     = var.video_retention_days >= 90
    error_message = "Video retention period must be at least 90 days"
  }
}

# Encryption algorithm specification with AES256 requirement
variable "encryption_algorithm" {
  type        = string
  description = "Server-side encryption algorithm for S3 buckets"
  default     = "AES256"

  validation {
    condition     = var.encryption_algorithm == "AES256"
    error_message = "Encryption algorithm must be AES256 for compliance"
  }
}

# CORS configuration with validation for security
variable "cors_allowed_origins" {
  type        = list(string)
  description = "List of origins allowed to make cross-origin requests to S3 buckets"
  default     = []

  validation {
    condition     = length(var.cors_allowed_origins) > 0
    error_message = "At least one CORS origin must be specified"
  }
}

# Resource tagging configuration
variable "tags" {
  type        = map(string)
  description = "Resource tags to be applied to all S3 resources"
  default = {
    Terraform = "true"
    Project   = "videocoach"
  }
}