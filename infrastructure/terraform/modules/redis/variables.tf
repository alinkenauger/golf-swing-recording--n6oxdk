# Core Terraform functionality for variable definitions
# terraform ~> 1.0

variable "environment" {
  type        = string
  description = "Deployment environment name (dev/staging/prod)"

  validation {
    condition     = can(regex("^(dev|staging|prod)$", var.environment))
    error_message = "Environment must be dev, staging, or prod."
  }
}

variable "redis_node_type" {
  type        = string
  description = "AWS ElastiCache node instance type for Redis cluster. Determines CPU, memory, and network capabilities"
  default     = "cache.t3.medium"

  validation {
    condition     = can(regex("^cache\\.(t3|r6g|r6|m6g)\\.(micro|small|medium|large|xlarge|2xlarge)$", var.redis_node_type))
    error_message = "Invalid Redis node type. Must be a valid AWS ElastiCache instance type."
  }
}

variable "redis_port" {
  type        = number
  description = "Port number for Redis cluster connections. Default is standard Redis port"
  default     = 6379

  validation {
    condition     = var.redis_port > 0 && var.redis_port < 65536
    error_message = "Redis port must be between 1 and 65535."
  }
}

variable "redis_num_cache_clusters" {
  type        = number
  description = "Number of cache clusters (primary + replicas) for high availability and read scaling"
  default     = 2

  validation {
    condition     = var.redis_num_cache_clusters >= 2 && var.redis_num_cache_clusters <= 6
    error_message = "Number of cache clusters must be between 2 and 6."
  }
}

variable "redis_parameter_group_family" {
  type        = string
  description = "Redis parameter group family version for feature compatibility"
  default     = "redis7.0"

  validation {
    condition     = can(regex("^redis[5-7]\\.[0-9]$", var.redis_parameter_group_family))
    error_message = "Parameter group family must be a valid Redis version (5.0-7.0)."
  }
}

variable "maintenance_window" {
  type        = string
  description = "Weekly time range for maintenance operations (UTC)"
  default     = "sun:05:00-sun:09:00"

  validation {
    condition     = can(regex("^(mon|tue|wed|thu|fri|sat|sun):[0-9]{2}:[0-9]{2}-(mon|tue|wed|thu|fri|sat|sun):[0-9]{2}:[0-9]{2}$", var.maintenance_window))
    error_message = "Maintenance window must be in format day:HH:MM-day:HH:MM."
  }
}

variable "snapshot_retention_limit" {
  type        = number
  description = "Number of days to retain automatic Redis snapshots for backup and recovery"
  default     = 7

  validation {
    condition     = var.snapshot_retention_limit >= 0 && var.snapshot_retention_limit <= 35
    error_message = "Snapshot retention must be between 0 and 35 days."
  }
}

variable "vpc_id" {
  type        = string
  description = "VPC ID where Redis cluster will be deployed for network isolation"

  validation {
    condition     = can(regex("^vpc-", var.vpc_id))
    error_message = "VPC ID must begin with 'vpc-'."
  }
}

variable "subnet_ids" {
  type        = list(string)
  description = "List of subnet IDs for Redis cluster placement across availability zones"

  validation {
    condition     = length(var.subnet_ids) >= 2
    error_message = "At least two subnet IDs are required for high availability."
  }
}

variable "tags" {
  type        = map(string)
  description = "Additional tags to apply to Redis resources for resource management and cost allocation"
  default     = {}
}