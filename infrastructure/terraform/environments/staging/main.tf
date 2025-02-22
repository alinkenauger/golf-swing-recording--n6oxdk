# Video Coaching Platform - Staging Environment Infrastructure
# Provider versions:
# aws ~> 5.0
# kubernetes ~> 2.0

terraform {
  backend "s3" {
    bucket         = "videocoach-terraform-state"
    key            = "staging/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "videocoach-terraform-locks"
    encrypt        = true
  }

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.0"
    }
  }
}

locals {
  environment = "staging"
  region     = "us-east-1"
  common_tags = {
    Environment = "staging"
    Project     = "VideoCoach"
    ManagedBy   = "Terraform"
  }
}

# AWS Provider configuration
provider "aws" {
  region = local.region
  default_tags = local.common_tags
}

# Kubernetes Provider configuration
provider "kubernetes" {
  host                   = module.eks.endpoint
  cluster_ca_certificate = module.eks.certificate_authority
  exec {
    api_version = "client.authentication.k8s.io/v1beta1"
    command     = "aws"
    args        = ["eks", "get-token", "--cluster-name", module.eks.cluster_id]
  }
}

# VPC Module
module "vpc" {
  source = "../../modules/vpc"

  environment         = "staging"
  vpc_cidr           = "10.1.0.0/16"
  region             = local.region
  availability_zones = ["us-east-1a", "us-east-1b"]
  private_subnets    = ["10.1.1.0/24", "10.1.2.0/24"]
  public_subnets     = ["10.1.11.0/24", "10.1.12.0/24"]
  database_subnets   = ["10.1.21.0/24", "10.1.22.0/24"]
  enable_nat_gateway = true
  single_nat_gateway = true
  enable_vpn_gateway = false
  enable_dns_hostnames = true
  enable_dns_support   = true
}

# EKS Module
module "eks" {
  source = "../../modules/eks"

  environment        = "staging"
  vpc_id            = module.vpc.vpc_id
  private_subnet_ids = module.vpc.private_subnets
  cluster_version    = "1.27"

  node_groups = {
    general = {
      desired_size    = 2
      min_size       = 1
      max_size       = 3
      instance_types = ["t3.medium"]
      capacity_type  = "SPOT"
    }
    video_processing = {
      desired_size    = 1
      min_size       = 1
      max_size       = 2
      instance_types = ["t3.large"]
      capacity_type  = "SPOT"
    }
  }

  enable_cluster_autoscaler = true
  enable_metrics_server     = true
  enable_cluster_logging    = ["api", "audit", "authenticator", "controllerManager", "scheduler"]
}

# API Gateway Module
module "api_gateway" {
  source = "../../modules/api_gateway"

  environment   = "staging"
  vpc_id        = module.vpc.vpc_id
  cluster_name  = module.eks.cluster_id

  rate_limiting = {
    enabled              = true
    requests_per_second = 50
    burst_size         = 100
  }

  monitoring = {
    enable_access_logs = true
    enable_metrics     = true
    retention_days    = 30
  }

  authentication = {
    enable_jwt   = true
    enable_api_key = true
    enable_cors    = true
  }
}

# Variables
variable "aws_account_id" {
  type        = string
  description = "AWS account ID where resources will be created"
}

variable "domain_name" {
  type        = string
  description = "Domain name for the staging environment"
  default     = "staging.videocoach.com"
}

# Outputs
output "vpc_id" {
  description = "ID of the staging VPC"
  value       = module.vpc.vpc_id
}

output "eks_cluster_endpoint" {
  description = "EKS cluster endpoint URL"
  value       = module.eks.endpoint
}

output "api_gateway_endpoint" {
  description = "Kong API Gateway endpoint"
  value       = module.api_gateway.api_endpoint
}