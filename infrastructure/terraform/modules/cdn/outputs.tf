# Output the CloudFront distribution ID for DNS and routing configuration
output "cloudfront_distribution_id" {
  value       = aws_cloudfront_distribution.main.id
  description = "The ID of the CloudFront distribution"
}

# Output the CloudFront domain name for client-side integration
output "cloudfront_domain_name" {
  value       = aws_cloudfront_distribution.main.domain_name
  description = "The domain name of the CloudFront distribution"
}

# Output the Origin Access Identity ARN for S3 bucket policy configuration
output "cloudfront_origin_access_identity_arn" {
  value       = aws_cloudfront_origin_access_identity.video_oai.iam_arn
  description = "The ARN of the CloudFront Origin Access Identity"
}