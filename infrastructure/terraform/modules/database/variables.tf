# Environment validation
variable "environment" {
  type        = string
  description = "Deployment environment (dev, staging, prod)"
  validation {
    condition     = can(regex("^(dev|staging|prod)$", var.environment))
    error_message = "Environment must be one of: dev, staging, prod"
  }
}

# VPC configuration
variable "vpc_id" {
  type        = string
  description = "VPC ID where database resources will be deployed"
  validation {
    condition     = can(regex("^vpc-[a-z0-9]+$", var.vpc_id))
    error_message = "VPC ID must be in format: vpc-xxxxxxxx"
  }
}

variable "private_subnet_ids" {
  type        = list(string)
  description = "List of private subnet IDs for database deployment"
  validation {
    condition     = length(var.private_subnet_ids) >= 2
    error_message = "At least 2 private subnets are required for high availability"
  }
}

# Backup configuration
variable "backup_retention_period" {
  type        = number
  description = "Number of days to retain automated backups"
  default     = 7
  validation {
    condition = (
      var.environment == "prod" ? var.backup_retention_period >= 30 :
      var.environment == "staging" ? var.backup_retention_period >= 14 :
      var.backup_retention_period >= 7
    )
    error_message = "Backup retention must be >= 30 days for prod, >= 14 for staging, >= 7 for dev"
  }
}

# RDS configuration
variable "rds_instance_class" {
  type        = string
  description = "RDS instance class"
  default     = "db.t3.medium"
  validation {
    condition = (
      var.environment == "prod" ? can(regex("^db\\.(r5|r6g)", var.rds_instance_class)) :
      var.environment == "staging" ? can(regex("^db\\.(t3|r5|r6g)", var.rds_instance_class)) :
      can(regex("^db\\.(t3|t4g)", var.rds_instance_class))
    )
    error_message = "Invalid instance class for environment. Prod must use r5/r6g, staging can use t3/r5/r6g, dev can use t3/t4g"
  }
}

# DocumentDB configuration
variable "docdb_instance_class" {
  type        = string
  description = "DocumentDB instance class"
  default     = "db.t3.medium"
  validation {
    condition = (
      var.environment == "prod" ? can(regex("^db\\.(r5|r6g)", var.docdb_instance_class)) :
      can(regex("^db\\.(t3|r5|r6g)", var.docdb_instance_class))
    )
    error_message = "Invalid DocumentDB instance class. Prod must use r5/r6g, non-prod can use t3/r5/r6g"
  }
}

# Redis configuration
variable "redis_node_type" {
  type        = string
  description = "ElastiCache Redis node type"
  default     = "cache.t3.medium"
  validation {
    condition = (
      var.environment == "prod" ? can(regex("^cache\\.(r5|r6g)", var.redis_node_type)) :
      can(regex("^cache\\.(t3|r5|r6g)", var.redis_node_type))
    )
    error_message = "Invalid Redis node type. Prod must use r5/r6g, non-prod can use t3/r5/r6g"
  }
}

variable "redis_num_cache_nodes" {
  type        = number
  description = "Number of cache nodes in the Redis cluster"
  default     = 2
  validation {
    condition = (
      var.environment == "prod" ? var.redis_num_cache_nodes >= 3 :
      var.redis_num_cache_nodes >= 2
    )
    error_message = "Prod requires minimum 3 nodes, non-prod requires minimum 2 nodes"
  }
}

# Maintenance configuration
variable "maintenance_window" {
  type        = string
  description = "Preferred maintenance window"
  default     = "sun:03:00-sun:04:00"
  validation {
    condition     = can(regex("^(mon|tue|wed|thu|fri|sat|sun):[0-2][0-9]:[0-5][0-9]-(mon|tue|wed|thu|fri|sat|sun):[0-2][0-9]:[0-5][0-9]$", var.maintenance_window))
    error_message = "Maintenance window must be in format: ddd:hh:mm-ddd:hh:mm"
  }
}

# Security configuration
variable "encryption_enabled" {
  type        = bool
  description = "Enable encryption at rest for database resources"
  default     = true
}

# Tagging configuration
variable "tags" {
  type        = map(string)
  description = "Resource tags"
  default     = {}
  validation {
    condition = (
      can(var.tags["Environment"]) &&
      can(var.tags["ManagedBy"]) &&
      can(var.tags["Project"])
    )
    error_message = "Required tags: Environment, ManagedBy, Project"
  }
}