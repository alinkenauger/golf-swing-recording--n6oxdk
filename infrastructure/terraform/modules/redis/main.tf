# AWS ElastiCache Redis Module
# Provider versions
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
}

# Local variables for resource naming and tagging
locals {
  name_prefix = "${var.environment}-redis"
  common_tags = {
    Environment     = var.environment
    Terraform      = "true"
    Service        = "redis"
    Encryption     = "enabled"
    HighAvailability = "enabled"
    BackupEnabled  = "true"
  }
}

# Data source to get VPC details
data "aws_vpc" "selected" {
  id = var.vpc_id
}

# Redis replication group
resource "aws_elasticache_replication_group" "redis" {
  replication_group_id          = local.name_prefix
  replication_group_description = "Redis cluster for Video Coaching Platform with enhanced security and HA"
  node_type                     = var.redis_node_type
  port                         = var.redis_port
  num_cache_clusters           = var.redis_num_cache_clusters
  parameter_group_name         = aws_elasticache_parameter_group.redis.name
  subnet_group_name            = aws_elasticache_subnet_group.redis.name
  security_group_ids          = [aws_security_group.redis.id]
  
  # High Availability settings
  automatic_failover_enabled   = true
  multi_az_enabled            = true
  
  # Security settings
  at_rest_encryption_enabled  = true
  transit_encryption_enabled  = true
  
  # Maintenance and backup settings
  maintenance_window          = var.maintenance_window
  snapshot_retention_limit    = var.snapshot_retention_limit
  
  # Monitoring and notifications
  notification_topic_arn      = var.sns_topic_arn
  
  # Resource tags
  tags = merge(local.common_tags, var.tags)
  
  # Prevent accidental deletion
  lifecycle {
    prevent_destroy = true
  }
}

# Redis parameter group with optimized settings
resource "aws_elasticache_parameter_group" "redis" {
  family      = var.redis_parameter_group_family
  name        = "${local.name_prefix}-params"
  description = "Redis parameter group with optimized settings for Video Coaching Platform"
  
  # Performance and reliability parameters
  parameter {
    name  = "maxmemory-policy"
    value = "allkeys-lru"
  }
  
  parameter {
    name  = "timeout"
    value = "300"
  }
  
  parameter {
    name  = "tcp-keepalive"
    value = "300"
  }
  
  parameter {
    name  = "maxclients"
    value = "65000"
  }
  
  tags = local.common_tags
}

# Subnet group for multi-AZ deployment
resource "aws_elasticache_subnet_group" "redis" {
  name        = "${local.name_prefix}-subnet"
  subnet_ids  = var.subnet_ids
  description = "Subnet group for Redis cluster with multi-AZ support"
  tags        = local.common_tags
}

# Security group with strict access controls
resource "aws_security_group" "redis" {
  name        = "${local.name_prefix}-sg"
  vpc_id      = var.vpc_id
  description = "Security group for Redis cluster with strict access controls"
  
  # Inbound rule for Redis access
  ingress {
    from_port   = var.redis_port
    to_port     = var.redis_port
    protocol    = "tcp"
    cidr_blocks = [data.aws_vpc.selected.cidr_block]
    description = "Allow Redis access from within VPC"
  }
  
  # Outbound rule for all traffic
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow all outbound traffic"
  }
  
  tags = local.common_tags
}

# Outputs for use by other modules
output "primary_endpoint_address" {
  value       = aws_elasticache_replication_group.redis.primary_endpoint_address
  description = "Redis primary endpoint address"
}

output "reader_endpoint_address" {
  value       = aws_elasticache_replication_group.redis.reader_endpoint_address
  description = "Redis reader endpoint address"
}

output "port" {
  value       = aws_elasticache_replication_group.redis.port
  description = "Redis port number"
}