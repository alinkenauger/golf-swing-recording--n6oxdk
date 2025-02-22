# Core Terraform functionality for variable definition and validation
terraform {
  required_version = ">= 1.0.0"
}

variable "environment" {
  type        = string
  description = "Environment name (e.g., dev, staging, prod) for resource isolation and management"

  validation {
    condition     = can(regex("^(dev|staging|prod)$", var.environment))
    error_message = "Environment must be one of: dev, staging, prod"
  }
}

variable "vpc_cidr" {
  type        = string
  description = "CIDR block for the VPC network space"
  default     = "10.0.0.0/16"

  validation {
    condition     = can(cidrhost(var.vpc_cidr, 0)) && can(regex("^([0-9]{1,3}\\.){3}[0-9]{1,3}/[0-9]{1,2}$", var.vpc_cidr))
    error_message = "VPC CIDR must be a valid IPv4 CIDR block in format x.x.x.x/x"
  }
}

variable "region" {
  type        = string
  description = "AWS region for VPC deployment (e.g., us-east-1)"

  validation {
    condition     = can(regex("^[a-z]{2}-[a-z]+-\\d{1}$", var.region))
    error_message = "Region must be a valid AWS region format (e.g., us-east-1)"
  }
}

variable "availability_zones" {
  type        = list(string)
  description = "List of availability zones for high availability subnet distribution"

  validation {
    condition     = length(var.availability_zones) >= 2
    error_message = "At least 2 availability zones must be specified for high availability"
  }
}

variable "enable_nat_gateway" {
  type        = bool
  description = "Whether to create NAT Gateways for private subnet internet access"
  default     = true
}

variable "tags" {
  type        = map(string)
  description = "Additional tags for VPC resources including cost allocation and management"
  default = {
    Terraform = "true"
    Project   = "video-coaching-platform"
  }
}