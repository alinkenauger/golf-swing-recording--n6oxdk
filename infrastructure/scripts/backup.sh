#!/bin/bash

# Video Coaching Platform Backup Script
# Version: 1.0.0
# Dependencies:
# - aws-cli v2.x
# - kubectl v1.27.x

set -euo pipefail

# Global Variables
BACKUP_ROOT="/mnt/backups"
S3_BUCKET="videocoach-backups"
RETENTION_DAYS=90
LOG_FILE="/var/log/videocoach/backup.log"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
AWS_REGIONS=("us-east-1" "eu-west-1") # Primary and DR regions

# Logging setup
log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" | tee -a "${LOG_FILE}"
}

error() {
    log "ERROR: $1" >&2
    return 1
}

# Error handling decorator
error_handler() {
    if [ $? -ne 0 ]; then
        error "Failed in $1"
        notify_backup_failure "$1"
        exit 1
    fi
}

# Logging decorator
log_execution() {
    log "Starting $1"
    trap 'error_handler "$1"' ERR
}

# Initialize backup environment
init_backup() {
    log_execution "init_backup"
    
    # Create backup directories
    mkdir -p "${BACKUP_ROOT}/{databases,videos,configs,logs}"
    
    # Verify AWS credentials
    aws sts get-caller-identity >/dev/null || error "AWS credentials not valid"
    
    # Verify kubectl access
    kubectl cluster-info >/dev/null || error "Kubectl not configured"
    
    # Create backup metadata file
    cat > "${BACKUP_ROOT}/metadata.json" <<EOF
{
    "backup_id": "${TIMESTAMP}",
    "start_time": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
    "version": "1.0.0"
}
EOF
}

# Database backup function
backup_databases() {
    local environment=$1
    local backup_type=$2
    log_execution "backup_databases"

    # Get list of RDS instances
    local instances=$(aws rds describe-db-instances --query 'DBInstances[*].DBInstanceIdentifier' --output text)
    
    for instance in $instances; do
        # Create snapshot with proper tags
        local snapshot_id="${instance}-${TIMESTAMP}"
        aws rds create-db-snapshot \
            --db-instance-identifier "$instance" \
            --db-snapshot-identifier "$snapshot_id" \
            --tags "Key=Environment,Value=${environment}" "Key=BackupType,Value=${backup_type}"
        
        # Wait for snapshot completion
        aws rds wait db-snapshot-available --db-snapshot-identifier "$snapshot_id"
        
        # Cross-region replication
        for region in "${AWS_REGIONS[@]}"; do
            if [ "$region" != "$(aws configure get region)" ]; then
                aws rds copy-db-snapshot \
                    --source-db-snapshot-identifier "$snapshot_id" \
                    --target-db-snapshot-identifier "${snapshot_id}-${region}" \
                    --region "$region"
            fi
        done
    done
}

# Video content backup
backup_video_content() {
    local source_bucket=$1
    local destination_bucket=$2
    log_execution "backup_video_content"

    # Calculate total size and create transfer plan
    local total_size=$(aws s3api list-objects-v2 --bucket "$source_bucket" --query 'sum(Contents[].Size)' --output text)
    local chunk_size=5368709120 # 5GB in bytes

    # Perform chunked transfer
    aws s3 sync "s3://${source_bucket}" "s3://${destination_bucket}/videos/${TIMESTAMP}" \
        --storage-class GLACIER \
        --metadata "BackupTimestamp=${TIMESTAMP}" \
        --exclude "*" \
        --include "*.mp4" \
        --include "*.mov" \
        --include "*.mkv"

    # Verify transfer
    local dest_size=$(aws s3api list-objects-v2 --bucket "$destination_bucket" --prefix "videos/${TIMESTAMP}" --query 'sum(Contents[].Size)' --output text)
    
    if [ "$total_size" != "$dest_size" ]; then
        error "Video backup size mismatch: Source=$total_size, Destination=$dest_size"
    fi
}

# Kubernetes config backup
backup_k8s_config() {
    local namespace=$1
    local backup_path=$2
    log_execution "backup_k8s_config"

    # Create backup directory
    local k8s_backup_dir="${backup_path}/k8s-${TIMESTAMP}"
    mkdir -p "$k8s_backup_dir"

    # Backup ConfigMaps
    kubectl get configmaps -n "$namespace" -o yaml > "${k8s_backup_dir}/configmaps.yaml"

    # Backup and encrypt Secrets
    kubectl get secrets -n "$namespace" -o yaml | \
        aws kms encrypt \
            --key-id alias/backup-key \
            --plaintext fileb:- \
            --output text \
            --query CiphertextBlob > "${k8s_backup_dir}/secrets.enc"

    # Backup StorageClass configurations
    kubectl get storageclass -o yaml > "${k8s_backup_dir}/storage-classes.yaml"

    # Create archive
    tar -czf "${backup_path}/k8s-${TIMESTAMP}.tar.gz" -C "$k8s_backup_dir" .
    
    # Upload to S3
    aws s3 cp "${backup_path}/k8s-${TIMESTAMP}.tar.gz" \
        "s3://${S3_BUCKET}/configs/k8s-${TIMESTAMP}.tar.gz" \
        --storage-class STANDARD_IA
}

# Log rotation
rotate_logs() {
    local log_dir=$1
    log_execution "rotate_logs"

    find "$log_dir" -type f -name "*.log" -mtime +1 | while read -r log_file; do
        gzip "$log_file"
        mv "${log_file}.gz" "${BACKUP_ROOT}/logs/"
    done

    # Clean old logs
    find "${BACKUP_ROOT}/logs" -type f -mtime +"$RETENTION_DAYS" -delete
}

# Backup validation
validate_backup() {
    local backup_id=$1
    log_execution "validate_backup"

    local validation_errors=0

    # Check database snapshots
    local snapshots=$(aws rds describe-db-snapshots --query "DBSnapshots[?contains(DBSnapshotIdentifier, '${backup_id}')]")
    if [ -z "$snapshots" ]; then
        ((validation_errors++))
        error "No database snapshots found for backup $backup_id"
    fi

    # Verify S3 objects
    aws s3 ls "s3://${S3_BUCKET}/videos/${backup_id}/" >/dev/null 2>&1 || {
        ((validation_errors++))
        error "Video backup not found in S3"
    }

    # Check K8s config backup
    aws s3 ls "s3://${S3_BUCKET}/configs/k8s-${backup_id}.tar.gz" >/dev/null 2>&1 || {
        ((validation_errors++))
        error "K8s config backup not found"
    }

    return $validation_errors
}

# Cleanup old backups
cleanup_old_backups() {
    log_execution "cleanup_old_backups"

    # Delete old RDS snapshots
    aws rds describe-db-snapshots --query "DBSnapshots[?SnapshotCreateTime<='${RETENTION_DAYS} days ago'].DBSnapshotIdentifier" --output text | \
    while read -r snapshot; do
        aws rds delete-db-snapshot --db-snapshot-identifier "$snapshot"
    done

    # Delete old S3 backups
    aws s3 rm "s3://${S3_BUCKET}/videos/" --recursive --exclude "*" --include "*" \
        --older-than "${RETENTION_DAYS}d"
    aws s3 rm "s3://${S3_BUCKET}/configs/" --recursive --exclude "*" --include "*" \
        --older-than "${RETENTION_DAYS}d"
}

# Notification function
notify_backup_failure() {
    local component=$1
    aws sns publish \
        --topic-arn "arn:aws:sns:${AWS_REGION}:${AWS_ACCOUNT_ID}:backup-notifications" \
        --message "Backup failure in component: $component at $(date)" \
        --subject "Backup Failure Alert"
}

# Main backup orchestration
backup_all() {
    log_execution "backup_all"

    # Initialize backup environment
    init_backup

    # Perform backups
    backup_databases "production" "daily"
    backup_video_content "videocoach-production" "${S3_BUCKET}"
    backup_k8s_config "videocoach-system" "${BACKUP_ROOT}/configs"
    
    # Rotate logs
    rotate_logs "/var/log/videocoach"
    
    # Validate backups
    validate_backup "${TIMESTAMP}"
    
    # Cleanup old backups
    cleanup_old_backups
    
    # Update backup metadata
    local end_time=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    jq --arg end_time "$end_time" \
       '.end_time = $end_time | .status = "completed"' \
       "${BACKUP_ROOT}/metadata.json" > "${BACKUP_ROOT}/metadata.json.tmp" && \
    mv "${BACKUP_ROOT}/metadata.json.tmp" "${BACKUP_ROOT}/metadata.json"

    log "Backup completed successfully"
}

# Script execution
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    backup_all
fi