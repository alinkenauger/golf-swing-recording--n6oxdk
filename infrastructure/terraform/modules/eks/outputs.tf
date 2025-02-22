# Output definitions for the EKS cluster module
# Terraform ~> 1.0

output "cluster_name" {
  description = "The name of the EKS cluster for reference in other modules and configurations"
  value       = aws_eks_cluster.main.name
}

output "cluster_endpoint" {
  description = "The endpoint URL of the EKS cluster API server for multi-region access"
  value       = aws_eks_cluster.main.endpoint
}

output "cluster_ca_certificate" {
  description = "The base64 encoded certificate authority data required for cluster authentication"
  value       = aws_eks_cluster.main.certificate_authority[0].data
  sensitive   = true
}

output "cluster_security_group_id" {
  description = "The ID of the security group attached to the EKS cluster for network configuration"
  value       = aws_security_group.cluster.id
}

output "cluster_oidc_issuer_url" {
  description = "The URL of the OpenID Connect identity provider for service account integration"
  value       = aws_eks_cluster.main.identity[0].oidc[0].issuer
}