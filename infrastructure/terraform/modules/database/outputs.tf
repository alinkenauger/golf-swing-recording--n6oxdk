# PostgreSQL RDS cluster outputs
output "rds_writer_endpoint" {
  value       = aws_rds_cluster.main.endpoint
  description = "Primary PostgreSQL RDS cluster endpoint for write operations"
}

output "rds_reader_endpoint" {
  value       = aws_rds_cluster.main.reader_endpoint
  description = "Read-only PostgreSQL RDS cluster endpoint for read scaling"
}

output "rds_port" {
  value       = aws_rds_cluster.main.port
  description = "PostgreSQL RDS cluster port number"
}

output "rds_cluster_id" {
  value       = aws_rds_cluster.main.cluster_identifier
  description = "RDS cluster identifier for monitoring and maintenance"
}

# DocumentDB cluster outputs
output "docdb_writer_endpoint" {
  value       = aws_docdb_cluster.main.endpoint
  description = "Primary DocumentDB cluster endpoint for write operations"
}

output "docdb_reader_endpoint" {
  value       = aws_docdb_cluster.main.reader_endpoint
  description = "Read-only DocumentDB cluster endpoint for read scaling"
}

output "docdb_port" {
  value       = aws_docdb_cluster.main.port
  description = "DocumentDB cluster port number"
}

output "docdb_cluster_id" {
  value       = aws_docdb_cluster.main.cluster_identifier
  description = "DocumentDB cluster identifier for monitoring and maintenance"
}

# Redis ElastiCache cluster outputs
output "redis_primary_endpoint" {
  value       = coalesce(aws_elasticache_cluster.main.cache_nodes[0].address, "")
  description = "Primary Redis ElastiCache node endpoint for cache operations"
}

output "redis_configuration_endpoint" {
  value       = aws_elasticache_cluster.main.configuration_endpoint
  description = "Redis ElastiCache configuration endpoint for automatic discovery"
}

output "redis_port" {
  value       = aws_elasticache_cluster.main.port
  description = "Redis ElastiCache port number"
}

output "redis_cluster_id" {
  value       = aws_elasticache_cluster.main.cluster_id
  description = "Redis cluster identifier for monitoring and maintenance"
}