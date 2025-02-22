# Output definitions for video storage bucket
output "video_bucket_id" {
  value       = aws_s3_bucket.video_storage.id
  description = "ID of the S3 bucket storing video content - requires regular validation of service configurations"
}

output "video_bucket_arn" {
  value       = aws_s3_bucket.video_storage.arn
  description = "ARN of the S3 bucket storing video content - requires security audit for IAM policy usage"
}

output "video_bucket_domain" {
  value       = aws_s3_bucket.video_storage.bucket_domain_name
  description = "Domain name of the S3 bucket storing video content - requires secure CDN origin configuration"
}

# Output definitions for training content bucket
output "training_bucket_id" {
  value       = aws_s3_bucket.training_content.id
  description = "ID of the S3 bucket storing training materials - requires regular validation of service configurations"
}

output "training_bucket_arn" {
  value       = aws_s3_bucket.training_content.arn
  description = "ARN of the S3 bucket storing training materials - requires security audit for IAM policy usage"
}

output "training_bucket_domain" {
  value       = aws_s3_bucket.training_content.bucket_domain_name
  description = "Domain name of the S3 bucket storing training materials - requires secure CDN origin configuration"
}