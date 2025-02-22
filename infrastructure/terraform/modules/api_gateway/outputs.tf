# Video Coaching Platform - Kong API Gateway Output Definitions
# Terraform ~> 1.0
# Dependencies:
# - Kong Helm Chart ~> 2.0
# - AWS Provider ~> 5.0

output "api_gateway_endpoint" {
  description = "The public endpoint URL of the Kong API Gateway for service integration"
  value       = "${helm_release.kong.status}"
  sensitive   = false
}

output "api_gateway_admin_endpoint" {
  description = "The internal admin API endpoint for Kong configuration management (restricted access)"
  value       = "http://${helm_release.kong.status}:8001"
  sensitive   = true
}

output "api_gateway_security_group_id" {
  description = "ID of the security group controlling network access to the API Gateway"
  value       = aws_security_group.kong_sg.id
  sensitive   = false
}

output "api_gateway_namespace" {
  description = "Kubernetes namespace where Kong API Gateway is deployed"
  value       = helm_release.kong.namespace
  sensitive   = false
}

output "api_gateway_status" {
  description = "Current deployment status of the Kong API Gateway"
  value       = helm_release.kong.status
  sensitive   = false
}