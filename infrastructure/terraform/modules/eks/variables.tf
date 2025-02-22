# Terraform ~> 1.0

variable "environment" {
  type        = string
  description = "Environment name (dev/staging/prod)"
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be one of: dev, staging, prod"
  }
}

variable "vpc_id" {
  type        = string
  description = "ID of the VPC where EKS cluster will be deployed"
}

variable "private_subnet_ids" {
  type        = list(string)
  description = "List of private subnet IDs for worker nodes"
}

variable "cluster_version" {
  type        = string
  description = "Kubernetes version for the EKS cluster"
  default     = "1.27"
}

variable "enable_cluster_logging" {
  type        = bool
  description = "Enable/disable EKS cluster logging"
  default     = true
}

variable "cluster_log_types" {
  type        = list(string)
  description = "List of log types to enable for the EKS cluster"
  default = [
    "api",
    "audit",
    "authenticator",
    "controllerManager",
    "scheduler",
    "cluster-autoscaler",
    "application",
    "security"
  ]
}

variable "node_groups" {
  type = map(object({
    instance_types = list(string)
    desired_size   = number
    min_size      = number
    max_size      = number
    labels        = map(string)
    taints = list(object({
      key    = string
      value  = string
      effect = string
    }))
    capacity_type = string
  }))
  description = "Configuration for EKS node groups"
  default = {
    api-services = {
      instance_types = ["t3.medium", "t3.large"]
      desired_size   = 2
      min_size      = 1
      max_size      = 4
      labels = {
        role         = "api"
        service-type = "backend"
      }
      taints        = []
      capacity_type = "ON_DEMAND"
    }
    video-processing = {
      instance_types = ["g4dn.xlarge", "g4dn.2xlarge"]
      desired_size   = 2
      min_size      = 1
      max_size      = 6
      labels = {
        role = "video-processing"
        gpu  = "true"
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
    general-workloads = {
      instance_types = ["t3.large", "t3.xlarge"]
      desired_size   = 3
      min_size      = 2
      max_size      = 8
      labels = {
        role = "general"
      }
      taints        = []
      capacity_type = "ON_DEMAND"
    }
  }
}

variable "tags" {
  type        = map(string)
  description = "Resource tags to apply to all EKS resources"
  default = {
    Project             = "VideoCoachingPlatform"
    ManagedBy          = "Terraform"
    CostCenter         = "Platform-Infrastructure"
    DataClassification = "Confidential"
    BusinessUnit       = "Engineering"
  }
}