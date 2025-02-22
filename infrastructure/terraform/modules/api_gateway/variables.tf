# Core Terraform functionality
terraform {
  required_version = ">= 1.0.0"
}

variable "vpc_id" {
  type        = string
  description = "ID of the VPC where Kong API Gateway will be deployed"
}

variable "environment" {
  type        = string
  description = "Environment name (dev, staging, prod)"
  validation {
    condition     = can(regex("^(dev|staging|prod)$", var.environment))
    error_message = "Environment must be dev, staging, or prod."
  }
}

variable "kong_version" {
  type        = string
  description = "Version of Kong API Gateway to deploy"
  default     = "2.8.1"
  validation {
    condition     = can(regex("^\\d+\\.\\d+\\.\\d+$", var.kong_version))
    error_message = "Kong version must be in semantic versioning format (x.y.z)."
  }
}

variable "rate_limiting_config" {
  type = map(object({
    rate        = number
    per_minute  = number
    burst       = number
    enabled     = bool
  }))
  description = "Rate limiting configuration for different API categories"
  default = {
    public_api = {
      rate       = 100
      per_minute = 1
      burst      = 150
      enabled    = true
    }
    authenticated_api = {
      rate       = 1000
      per_minute = 1
      burst      = 1500
      enabled    = true
    }
    video_upload = {
      rate       = 10
      per_minute = 60
      burst      = 15
      enabled    = true
    }
    webhook_events = {
      rate       = 50
      per_minute = 1
      burst      = 75
      enabled    = true
    }
  }
}

variable "auth_config" {
  type = object({
    issuer                 = string
    jwks_uri              = string
    algorithms            = list(string)
    token_lifetime        = number
    refresh_token_lifetime = number
  })
  description = "Authentication configuration for Auth0 integration"
  default = {
    issuer                 = ""
    jwks_uri              = ""
    algorithms            = ["RS256"]
    token_lifetime        = 3600
    refresh_token_lifetime = 86400
  }
  validation {
    condition     = length(var.auth_config.algorithms) > 0
    error_message = "At least one authentication algorithm must be specified."
  }
}

variable "monitoring_config" {
  type = object({
    prometheus_enabled = bool
    grafana_enabled   = bool
    retention_days    = number
    metrics_path      = string
    scrape_interval   = string
  })
  description = "Monitoring configuration for the API Gateway"
  default = {
    prometheus_enabled = true
    grafana_enabled   = true
    retention_days    = 30
    metrics_path      = "/metrics"
    scrape_interval   = "15s"
  }
}

variable "load_balancer_config" {
  type = object({
    type         = string
    internal     = bool
    ssl_enabled  = bool
    ssl_policy   = string
  })
  description = "Load balancer configuration for API Gateway"
  default = {
    type        = "nlb"
    internal    = false
    ssl_enabled = true
    ssl_policy  = "ELBSecurityPolicy-TLS-1-2-2017-01"
  }
  validation {
    condition     = contains(["nlb", "alb"], var.load_balancer_config.type)
    error_message = "Load balancer type must be either 'nlb' or 'alb'."
  }
}

variable "scaling_config" {
  type = object({
    min_replicas            = number
    max_replicas            = number
    target_cpu_utilization = number
  })
  description = "Auto-scaling configuration for API Gateway pods"
  default = {
    min_replicas            = 2
    max_replicas            = 10
    target_cpu_utilization = 70
  }
}

variable "private_subnet_ids" {
  type        = list(string)
  description = "List of private subnet IDs where API Gateway will be deployed"
}

variable "enable_waf" {
  type        = bool
  description = "Enable AWS WAF for additional security"
  default     = true
}

variable "cors_config" {
  type = object({
    enabled          = bool
    allowed_origins  = list(string)
    allowed_methods  = list(string)
    allowed_headers  = list(string)
    expose_headers   = list(string)
    max_age_seconds = number
  })
  description = "CORS configuration for API endpoints"
  default = {
    enabled          = true
    allowed_origins  = ["*"]
    allowed_methods  = ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
    allowed_headers  = ["Authorization", "Content-Type"]
    expose_headers   = ["Content-Length", "Content-Range"]
    max_age_seconds = 3600
  }
}

variable "tags" {
  type        = map(string)
  description = "Additional tags to apply to all resources"
  default     = {}
}