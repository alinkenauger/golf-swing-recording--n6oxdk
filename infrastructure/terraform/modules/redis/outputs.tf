# Output definitions for Redis module exposing essential cluster information
# These outputs enable other modules and the application to connect to and interact with the Redis cluster

output "endpoint" {
  value       = aws_elasticache_replication_group.redis.primary_endpoint_address
  description = "Primary endpoint address for Redis cluster connections"
}

output "reader_endpoint" {
  value       = aws_elasticache_replication_group.redis.reader_endpoint_address
  description = "Read-only endpoint address for Redis cluster connections"
}

output "configuration_endpoint" {
  value       = aws_elasticache_replication_group.redis.configuration_endpoint_address
  description = "Configuration endpoint for Redis cluster management"
}

output "port" {
  value       = aws_elasticache_replication_group.redis.port
  description = "Port number for Redis cluster connections"
}

output "security_group_id" {
  value       = aws_security_group.redis.id
  description = "ID of the security group controlling Redis cluster access"
}

output "connection_string" {
  value       = "redis://${aws_elasticache_replication_group.redis.primary_endpoint_address}:${aws_elasticache_replication_group.redis.port}"
  description = "Full Redis connection string for application use"
  sensitive   = true
}

output "encryption_status" {
  value = {
    at_rest    = aws_elasticache_replication_group.redis.at_rest_encryption_enabled
    in_transit = aws_elasticache_replication_group.redis.transit_encryption_enabled
  }
  description = "Encryption configuration status for the Redis cluster"
}