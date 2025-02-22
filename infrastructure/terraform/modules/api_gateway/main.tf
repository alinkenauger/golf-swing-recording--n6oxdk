# Video Coaching Platform - Kong API Gateway Configuration
# Provider versions:
# aws ~> 5.0
# helm ~> 2.0
# kubernetes ~> 2.0

terraform {
  required_version = ">= 1.0.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.0"
    }
  }
}

locals {
  namespace = "kong-${var.environment}"
  service_name = "kong-gateway"
  monitoring_config = {
    metrics_port = 8100
    prometheus_scrape = true
    grafana_dashboard = true
  }
}

# Data sources for VPC and EKS cluster information
data "aws_vpc" "selected" {
  id = var.vpc_id
}

data "aws_eks_cluster" "selected" {
  name = var.cluster_name
}

# Kong API Gateway Helm deployment
resource "helm_release" "kong" {
  name       = local.service_name
  repository = "https://charts.konghq.com"
  chart      = "kong"
  version    = var.kong_version
  namespace  = local.namespace
  create_namespace = true

  values = [
    yamlencode({
      env = {
        database = "off"
        proxy_access_log = "/dev/stdout"
        proxy_error_log = "/dev/stderr"
        admin_access_log = "/dev/stdout"
        admin_error_log = "/dev/stderr"
        log_level = "debug"
      }
      
      ingressController = {
        enabled = true
        installCRDs = false
      }
      
      proxy = {
        enabled = true
        type = "LoadBalancer"
        annotations = {
          "service.beta.kubernetes.io/aws-load-balancer-type" = "nlb"
          "service.beta.kubernetes.io/aws-load-balancer-internal" = "false"
        }
      }
      
      metrics = {
        enabled = var.enable_metrics
        serviceMonitor = {
          enabled = true
          interval = "30s"
        }
      }
      
      plugins = {
        configMaps = ["kong-config"]
      }
      
      resources = {
        requests = {
          cpu = "500m"
          memory = "1Gi"
        }
        limits = {
          cpu = "2000m"
          memory = "2Gi"
        }
      }
      
      autoscaling = {
        enabled = true
        minReplicas = 2
        maxReplicas = 10
        targetCPUUtilizationPercentage = 75
      }
    })
  ]
}

# Kong configuration for rate limiting, authentication, and monitoring
resource "kubernetes_config_map" "kong_config" {
  metadata {
    name      = "kong-config"
    namespace = local.namespace
  }

  data = {
    "rate-limiting.conf" = jsonencode({
      plugins = [
        {
          name = "rate-limiting"
          config = {
            public_api = {
              minute = var.rate_limiting_config.public_api.requests_per_minute
              policy = "local"
              fault_tolerant = true
              hide_client_headers = false
              redis_timeout = 2000
              redis_database = 0
            }
            authenticated_api = {
              minute = var.rate_limiting_config.authenticated_api.requests_per_minute
              policy = "local"
              fault_tolerant = true
            }
            video_upload = {
              hour = var.rate_limiting_config.video_upload.requests_per_hour
              policy = "local"
              fault_tolerant = true
            }
            analytics = {
              minute = var.rate_limiting_config.analytics.requests_per_minute
              policy = "local"
              fault_tolerant = true
            }
          }
        }
      ]
    })

    "auth-config.conf" = jsonencode({
      plugins = [
        {
          name = "jwt"
          config = {
            uri_param_names = ["jwt"]
            cookie_names = ["jwt"]
            key_claim_name = "kid"
            claims_to_verify = ["exp", "nbf"]
            maximum_expiration = var.auth_config.token_exp
            algorithms = var.auth_config.algorithms
          }
        },
        {
          name = "acl"
          config = {
            allow = ["admin", "coach", "athlete"]
            hide_groups_header = true
          }
        }
      ]
    })

    "monitoring.conf" = jsonencode({
      plugins = [
        {
          name = "prometheus"
          config = {
            status_code = true
            latency = true
            bandwidth = true
            per_consumer = true
          }
        },
        {
          name = "file-log"
          config = {
            path = "/dev/stdout"
            reopen = false
          }
        }
      ]
    })
  }
}

# Security group for Kong API Gateway
resource "aws_security_group" "kong" {
  name        = "${local.service_name}-sg"
  description = "Security group for Kong API Gateway"
  vpc_id      = var.vpc_id

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = local.monitoring_config.metrics_port
    to_port     = local.monitoring_config.metrics_port
    protocol    = "tcp"
    cidr_blocks = [data.aws_vpc.selected.cidr_block]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name        = "${local.service_name}-sg"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}