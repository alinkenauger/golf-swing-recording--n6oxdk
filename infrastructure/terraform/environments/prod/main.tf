# Video Coaching Platform - Production Environment Infrastructure
# Provider versions:
# aws ~> 5.0
# kubernetes ~> 2.0

terraform {
  required_version = ">= 1.0.0"
  
  # Production state backend configuration with encryption and locking
  backend "s3" {
    bucket         = "videocoach-terraform-state-prod"
    key            = "prod/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "videocoach-terraform-locks"
    kms_key_id     = "arn:aws:kms:us-east-1:${var.aws_account_id}:key/terraform-state"
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

# Local variables for environment configuration
locals {
  environment = "prod"
  aws_region = "us-east-1"
  
  common_tags = {
    Environment       = "production"
    Project          = "VideoCoach"
    ManagedBy        = "Terraform"
    BusinessUnit     = "Engineering"
    CostCenter       = "Platform"
    DataClassification = "Confidential"
  }
}

# AWS Provider configuration with production account restrictions
provider "aws" {
  region = local.aws_region
  allowed_account_ids = [var.aws_account_id]
  default_tags = local.common_tags
}

# Kubernetes provider configuration for EKS cluster
provider "kubernetes" {
  host                   = module.eks.endpoint
  cluster_ca_certificate = base64decode(module.eks.certificate_authority)
  exec {
    api_version = "client.authentication.k8s.io/v1beta1"
    command     = "aws"
    args        = ["eks", "get-token", "--cluster-name", module.eks.cluster_id]
  }
}

# Production VPC module with multi-AZ setup
module "vpc" {
  source = "../modules/vpc"
  
  vpc_cidr           = "10.0.0.0/16"
  environment        = local.environment
  region            = local.aws_region
  azs               = ["us-east-1a", "us-east-1b", "us-east-1c"]
  enable_nat_gateway = true
  single_nat_gateway = false
  enable_vpn_gateway = false
  enable_dns_hostnames = true
  enable_dns_support   = true
  
  tags = local.common_tags
}

# Production EKS cluster with node groups
module "eks" {
  source = "../modules/eks"
  
  environment = local.environment
  vpc_id     = module.vpc.vpc_id
  private_subnet_ids = module.vpc.private_subnets
  cluster_version = "1.27"
  enable_irsa    = true
  
  cluster_encryption_config = {
    provider_key_arn = "arn:aws:kms:${local.aws_region}:${var.aws_account_id}:key/eks-encryption"
    resources        = ["secrets"]
  }
  
  tags = local.common_tags
}

# Production API Gateway configuration
module "api_gateway" {
  source = "../modules/api_gateway"
  
  environment = local.environment
  vpc_id      = module.vpc.vpc_id
  cluster_name = module.eks.cluster_id
  enable_rate_limiting = true
  enable_waf  = true
  
  ssl_certificate_arn = "arn:aws:acm:${local.aws_region}:${var.aws_account_id}:certificate/${var.domain_name}"
  
  tags = local.common_tags
}

# Variables for production environment
variable "aws_account_id" {
  type        = string
  description = "AWS account ID for production environment"
  
  validation {
    condition     = length(var.aws_account_id) == 12
    error_message = "AWS account ID must be 12 digits"
  }
}

variable "domain_name" {
  type        = string
  description = "Domain name for the production environment"
  default     = "api.videocoach.com"
}

# Outputs for reference by other modules
output "vpc_id" {
  description = "ID of the production VPC"
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