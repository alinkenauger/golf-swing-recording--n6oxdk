# Provider configuration
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

# Local variables
locals {
  common_tags = {
    Project     = "VideoCoach"
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}

# Random password generation for database clusters
resource "random_password" "db_password" {
  length           = 32
  special          = true
  override_special = "!#$%&*()-_=+[]{}<>:?"
}

# Security group for RDS
resource "aws_security_group" "rds" {
  name_prefix = "rds-${var.environment}"
  vpc_id      = var.vpc_id
  description = "Security group for RDS PostgreSQL cluster"

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.app.id]
  }

  tags = merge(local.common_tags, {
    Name = "rds-${var.environment}"
  })
}

# RDS Aurora PostgreSQL Cluster
resource "aws_rds_cluster" "postgresql" {
  cluster_identifier     = "videocoach-${var.environment}"
  engine                = "aurora-postgresql"
  engine_version        = "15.3"
  database_name         = "videocoach"
  master_username       = "admin"
  master_password       = random_password.db_password.result
  vpc_security_group_ids = [aws_security_group.rds.id]
  db_subnet_group_name  = aws_db_subnet_group.rds.name
  
  backup_retention_period          = var.backup_retention_period
  preferred_backup_window         = "02:00-03:00"
  preferred_maintenance_window    = var.maintenance_window
  storage_encrypted              = true
  deletion_protection            = true
  skip_final_snapshot           = false
  final_snapshot_identifier     = "videocoach-${var.environment}-final-snapshot"
  
  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]
  performance_insights_enabled    = true
  monitoring_interval            = 60
  
  auto_minor_version_upgrade     = true
  copy_tags_to_snapshot         = true
  
  tags = local.common_tags
}

# Security group for DocumentDB
resource "aws_security_group" "docdb" {
  name_prefix = "docdb-${var.environment}"
  vpc_id      = var.vpc_id
  description = "Security group for DocumentDB cluster"

  ingress {
    from_port       = 27017
    to_port         = 27017
    protocol        = "tcp"
    security_groups = [aws_security_group.app.id]
  }

  tags = merge(local.common_tags, {
    Name = "docdb-${var.environment}"
  })
}

# DocumentDB Cluster
resource "aws_docdb_cluster" "main" {
  cluster_identifier     = "videocoach-docdb-${var.environment}"
  engine                = "docdb"
  master_username       = "admin"
  master_password       = random_password.db_password.result
  vpc_security_group_ids = [aws_security_group.docdb.id]
  db_subnet_group_name  = aws_docdb_subnet_group.main.name
  
  backup_retention_period          = var.backup_retention_period
  preferred_backup_window         = "02:00-03:00"
  preferred_maintenance_window    = var.maintenance_window
  storage_encrypted              = true
  deletion_protection            = true
  skip_final_snapshot           = false
  final_snapshot_identifier     = "videocoach-docdb-${var.environment}-final-snapshot"
  
  enabled_cloudwatch_logs_exports = ["audit", "profiler"]
  auto_minor_version_upgrade     = true
  
  tags = local.common_tags
}

# Security group for Redis
resource "aws_security_group" "redis" {
  name_prefix = "redis-${var.environment}"
  vpc_id      = var.vpc_id
  description = "Security group for Redis cluster"

  ingress {
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.app.id]
  }

  tags = merge(local.common_tags, {
    Name = "redis-${var.environment}"
  })
}

# Redis ElastiCache Cluster
resource "aws_elasticache_cluster" "main" {
  cluster_id           = "videocoach-redis-${var.environment}"
  engine              = "redis"
  engine_version      = "7.2"
  node_type           = var.redis_node_type
  num_cache_nodes     = var.redis_num_cache_nodes
  parameter_group_family = "redis7"
  port                = 6379
  
  subnet_group_name    = aws_elasticache_subnet_group.main.name
  security_group_ids   = [aws_security_group.redis.id]
  
  snapshot_retention_limit = 7
  snapshot_window         = "02:00-03:00"
  maintenance_window      = var.maintenance_window
  
  auto_minor_version_upgrade = true
  
  tags = local.common_tags
}

# Subnet groups
resource "aws_db_subnet_group" "rds" {
  name       = "rds-${var.environment}"
  subnet_ids = var.private_subnet_ids
  tags       = local.common_tags
}

resource "aws_docdb_subnet_group" "main" {
  name       = "docdb-${var.environment}"
  subnet_ids = var.private_subnet_ids
  tags       = local.common_tags
}

resource "aws_elasticache_subnet_group" "main" {
  name       = "redis-${var.environment}"
  subnet_ids = var.private_subnet_ids
  tags       = local.common_tags
}

# Application security group (referenced by database security groups)
resource "aws_security_group" "app" {
  name_prefix = "app-${var.environment}"
  vpc_id      = var.vpc_id
  description = "Security group for application instances"
  
  tags = merge(local.common_tags, {
    Name = "app-${var.environment}"
  })
}

# Outputs
output "rds_endpoint" {
  value = aws_rds_cluster.postgresql.endpoint
}

output "rds_port" {
  value = aws_rds_cluster.postgresql.port
}

output "docdb_endpoint" {
  value = aws_docdb_cluster.main.endpoint
}

output "docdb_port" {
  value = aws_docdb_cluster.main.port
}

output "redis_endpoint" {
  value = aws_elasticache_cluster.main.cache_nodes[0].address
}

output "redis_port" {
  value = aws_elasticache_cluster.main.port
}