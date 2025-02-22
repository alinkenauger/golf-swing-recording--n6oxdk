# Project name variable with validation for naming standards
variable "project_name" {
  type        = string
  description = "Name of the project used for resource naming and tagging"

  validation {
    condition     = can(regex("^[a-z0-9-]+$", var.project_name))
    error_message = "Project name must be lowercase alphanumeric with hyphens only."
  }
}

# Environment variable with strict validation
variable "environment" {
  type        = string
  description = "Deployment environment for resource configuration and tagging"

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be one of: dev, staging, prod."
  }
}

# IPv6 support configuration
variable "enable_ipv6" {
  type        = bool
  default     = true
  description = "Enable IPv6 support for CloudFront distribution to enhance global reach and performance"
}

# Price class selection with validation
variable "price_class" {
  type        = string
  default     = "PriceClass_All"
  description = "CloudFront distribution price class determining edge location coverage"

  validation {
    condition     = contains(["PriceClass_100", "PriceClass_200", "PriceClass_All"], var.price_class)
    error_message = "Price class must be one of: PriceClass_100, PriceClass_200, PriceClass_All."
  }
}

# Cache TTL configuration with validation
variable "default_ttl" {
  type        = number
  default     = 3600
  description = "Default TTL for cached content in seconds, optimized for video delivery performance"

  validation {
    condition     = var.default_ttl >= 0 && var.default_ttl <= 31536000
    error_message = "Default TTL must be between 0 and 31536000 seconds (1 year)."
  }
}

# Resource tagging configuration
variable "tags" {
  type        = map(string)
  default     = {}
  description = "Additional resource tags for the CloudFront distribution for better resource management"
}

# Origin configuration variables
variable "video_bucket_origin" {
  type        = string
  description = "S3 bucket domain name for video content origin"
}

variable "content_bucket_origin" {
  type        = string
  description = "S3 bucket domain name for training content origin"
}

# Cache behavior configurations
variable "video_max_ttl" {
  type        = number
  default     = 86400
  description = "Maximum TTL for video content in seconds"

  validation {
    condition     = var.video_max_ttl >= 0 && var.video_max_ttl <= 31536000
    error_message = "Maximum TTL must be between 0 and 31536000 seconds (1 year)."
  }
}

variable "video_min_ttl" {
  type        = number
  default     = 0
  description = "Minimum TTL for video content in seconds"

  validation {
    condition     = var.video_min_ttl >= 0
    error_message = "Minimum TTL must be 0 or greater."
  }
}

# Security configurations
variable "waf_web_acl_id" {
  type        = string
  default     = null
  description = "WAF web ACL ID to associate with the CloudFront distribution"
}

variable "ssl_certificate_arn" {
  type        = string
  default     = null
  description = "ARN of the SSL certificate for custom domain support"
}

variable "custom_domain_names" {
  type        = list(string)
  default     = []
  description = "List of custom domain names for the CloudFront distribution"

  validation {
    condition     = alltrue([for domain in var.custom_domain_names : can(regex("^[a-z0-9-\\.]+$", domain))])
    error_message = "Custom domain names must be lowercase alphanumeric with hyphens and dots only."
  }
}

# Geo-restriction configuration
variable "geo_restriction_type" {
  type        = string
  default     = "none"
  description = "Type of geo-restriction (none, whitelist, or blacklist)"

  validation {
    condition     = contains(["none", "whitelist", "blacklist"], var.geo_restriction_type)
    error_message = "Geo-restriction type must be one of: none, whitelist, blacklist."
  }
}

variable "geo_restriction_locations" {
  type        = list(string)
  default     = []
  description = "List of country codes for geo-restriction"
}

# Performance optimization
variable "compress" {
  type        = bool
  default     = true
  description = "Enable compression for supported content types"
}

variable "viewer_protocol_policy" {
  type        = string
  default     = "redirect-to-https"
  description = "Protocol policy for viewer connections"

  validation {
    condition     = contains(["allow-all", "https-only", "redirect-to-https"], var.viewer_protocol_policy)
    error_message = "Viewer protocol policy must be one of: allow-all, https-only, redirect-to-https."
  }
}