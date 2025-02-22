# Video Coaching Platform - Development Environment Configuration
# Provider version: AWS ~> 5.0
# Terraform version: >= 1.6.0

terraform {
  required_version = ">= 1.6.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket         = "videocoach-terraform-state-dev"
    key            = "dev/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "videocoach-terraform-locks"
    kms_key_id     = "alias/terraform-state-key"
  }
}

# Provider configuration
provider "aws" {
  region = local.region
  default_tags {
    tags = local.common_tags
  }
}

# Local variables
locals {
  environment = "dev"
  region     = "us-east-1"
  availability_zones = ["us-east-1a", "us-east-1b"]
  
  common_tags = {
    Environment   = "development"
    Project      = "VideoCoach"
    ManagedBy    = "Terraform"
    CostCenter   = "Development"
    AutoShutdown = "true"
  }
}

# VPC Module
module "vpc" {
  source = "../../modules/vpc"

  environment         = local.environment
  region             = local.region
  availability_zones = local.availability_zones
  vpc_cidr           = "10.0.0.0/16"
  enable_nat_gateway = true
  single_nat_gateway = true
  enable_vpn_gateway = false
  tags               = local.common_tags
}

# EKS Module
module "eks" {
  source = "../../modules/eks"

  environment        = local.environment
  vpc_id            = module.vpc.vpc_id
  private_subnet_ids = module.vpc.private_subnets
  instance_types    = ["t3.medium"]
  use_spot_instances = true
  desired_size      = 2
  min_size         = 1
  max_size         = 3
  tags             = local.common_tags

  node_groups = {
    api-services = {
      instance_types = ["t3.medium"]
      desired_size   = 2
      min_size      = 1
      max_size      = 3
      labels = {
        role = "api"
      }
      taints        = []
      capacity_type = "SPOT"
    }
    video-processing = {
      instance_types = ["t3.large"]
      desired_size   = 1
      min_size      = 1
      max_size      = 2
      labels = {
        role = "video-processing"
      }
      taints = [
        {
          key    = "video-processing"
          value  = "true"
          effect = "NO_SCHEDULE"
        }
      ]
      capacity_type = "SPOT"
    }
  }
}

# API Gateway Module
module "api_gateway" {
  source = "../../modules/api_gateway"

  environment   = local.environment
  vpc_id       = module.vpc.vpc_id
  cluster_name = module.eks.cluster_name
  instance_type = "t3.small"
  min_size     = 1
  max_size     = 2
  tags         = local.common_tags

  rate_limiting_config = {
    public_api = {
      requests_per_minute = 100
    }
    authenticated_api = {
      requests_per_minute = 1000
    }
    video_upload = {
      requests_per_hour = 10
    }
    analytics = {
      requests_per_minute = 500
    }
  }

  auth_config = {
    token_exp  = 3600
    algorithms = ["RS256"]
  }
}

# Database Module
module "database" {
  source = "../../modules/database"

  environment          = local.environment
  vpc_id              = module.vpc.vpc_id
  private_subnet_ids  = module.vpc.private_subnets
  rds_instance_class  = "db.t3.medium"
  redis_node_type     = "cache.t3.micro"
  mongodb_instance_class = "db.t3.medium"
  backup_retention_period = 7
  skip_final_snapshot = true
  db_username        = "videocoach_dev"
  db_password        = var.db_password
  mongodb_username   = "videocoach_dev"
  mongodb_password   = var.mongodb_password
  tags               = local.common_tags
}

# Variables
variable "db_password" {
  type        = string
  description = "Password for RDS database"
  sensitive   = true
}

variable "mongodb_password" {
  type        = string
  description = "Password for MongoDB database"
  sensitive   = true
}

# Outputs
output "vpc_id" {
  description = "ID of the created development VPC"
  value       = module.vpc.vpc_id
}

output "eks_cluster_endpoint" {
  description = "Development EKS cluster endpoint URL"
  value       = module.eks.cluster_endpoint
}

output "api_gateway_endpoint" {
  description = "Development Kong API Gateway endpoint URL"
  value       = module.api_gateway.api_endpoint
}

output "database_endpoints" {
  description = "Map of database endpoints for RDS, Redis, and MongoDB"
  value = {
    rds     = module.database.rds_endpoint
    redis   = module.database.redis_endpoint
    mongodb = module.database.mongodb_endpoint
  }
  sensitive = true
}