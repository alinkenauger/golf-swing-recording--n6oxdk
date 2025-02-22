#!/bin/bash

# Video Coaching Platform - Monitoring Management Script
# Version: 1.0.0
# Dependencies:
# - kubectl v1.27.x
# - curl v7.x
# - jq v1.6

set -euo pipefail

# Global Configuration
NAMESPACE="${NAMESPACE:-videocoach-system}"
PROMETHEUS_PORT="${PROMETHEUS_PORT:-9090}"
GRAFANA_PORT="${GRAFANA_PORT:-3000}"
ALERTMANAGER_PORT="${ALERTMANAGER_PORT:-9093}"
LOG_FILE="${LOG_FILE:-/var/log/monitoring.log}"
BACKUP_DIR="${BACKUP_DIR:-/var/backup/monitoring}"
RETRY_ATTEMPTS="${RETRY_ATTEMPTS:-3}"
RETRY_INTERVAL="${RETRY_INTERVAL:-5}"
HEALTH_CHECK_TIMEOUT="${HEALTH_CHECK_TIMEOUT:-30}"
METRIC_RETENTION_DAYS="${METRIC_RETENTION_DAYS:-30}"

# Logging Configuration
log() {
    local level="$1"
    local message="$2"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [$level] $message" | tee -a "$LOG_FILE"
}

# Error Handling
handle_error() {
    local exit_code=$?
    local line_no=$1
    log "ERROR" "Failed at line $line_no with exit code $exit_code"
    exit $exit_code
}
trap 'handle_error ${LINENO}' ERR

# Health Check Function
check_monitoring_stack() {
    local component_name="$1"
    local retry_count="${2:-$RETRY_ATTEMPTS}"
    local timeout="${3:-$HEALTH_CHECK_TIMEOUT}"
    local status=1
    local attempt=1

    log "INFO" "Checking health of $component_name"

    while [ $attempt -le $retry_count ] && [ $status -ne 0 ]; do
        case $component_name in
            "prometheus")
                timeout $timeout kubectl -n "$NAMESPACE" exec -it svc/prometheus-service -- curl -s http://localhost:$PROMETHEUS_PORT/-/healthy && status=0
                ;;
            "grafana")
                timeout $timeout kubectl -n "$NAMESPACE" exec -it svc/grafana-service -- curl -s http://localhost:$GRAFANA_PORT/api/health && status=0
                ;;
            "alertmanager")
                timeout $timeout kubectl -n "$NAMESPACE" exec -it svc/alertmanager-service -- curl -s http://localhost:$ALERTMANAGER_PORT/-/healthy && status=0
                ;;
            *)
                log "ERROR" "Unknown component: $component_name"
                return 1
                ;;
        esac

        if [ $status -ne 0 ]; then
            log "WARN" "Health check failed for $component_name (attempt $attempt/$retry_count)"
            sleep $RETRY_INTERVAL
            ((attempt++))
        fi
    done

    if [ $status -eq 0 ]; then
        log "INFO" "$component_name is healthy"
        return 0
    else
        log "ERROR" "$component_name health check failed after $retry_count attempts"
        return 1
    fi
}

# Deploy Monitoring Stack
deploy_monitoring() {
    local environment="$1"
    local version="$2"
    local backup_first="${3:-true}"

    log "INFO" "Deploying monitoring stack to $environment (version: $version)"

    # Backup existing configuration if requested
    if [ "$backup_first" = true ]; then
        backup_monitoring_config
    fi

    # Deploy components
    for component in prometheus grafana alertmanager; do
        log "INFO" "Deploying $component"
        kubectl apply -f "infrastructure/kubernetes/monitoring/$component.yaml"
        
        # Wait for deployment
        kubectl -n "$NAMESPACE" rollout status deployment "$component"
        
        # Verify health
        check_monitoring_stack "$component" || {
            log "ERROR" "Failed to deploy $component"
            return 1
        }
    done

    log "INFO" "Monitoring stack deployment completed successfully"
}

# Collect Metrics
collect_metrics() {
    local metric_type="$1"
    local time_range="${2:-5m}"
    local format="${3:-json}"
    local prometheus_url="http://prometheus-service:$PROMETHEUS_PORT"

    log "INFO" "Collecting $metric_type metrics for past $time_range"

    case $metric_type in
        "system")
            local queries=(
                "cpu_usage:sum(rate(container_cpu_usage_seconds_total[5m])) by (pod)"
                "memory_usage:sum(container_memory_usage_bytes) by (pod)"
                "disk_usage:sum(container_fs_usage_bytes) by (pod)"
            )
            ;;
        "application")
            local queries=(
                "request_rate:sum(rate(http_requests_total[5m])) by (service)"
                "error_rate:sum(rate(http_requests_total{status=~\"5..\"}[5m])) by (service)"
                "latency:histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le))"
            )
            ;;
        "business")
            local queries=(
                "active_users:sum(user_sessions_total)"
                "video_uploads:sum(rate(video_upload_total[5m]))"
                "subscription_status:sum(subscription_active) by (plan)"
            )
            ;;
        *)
            log "ERROR" "Unknown metric type: $metric_type"
            return 1
            ;;
    esac

    local results=()
    for query in "${queries[@]}"; do
        local result=$(kubectl -n "$NAMESPACE" exec -it svc/prometheus-service -- curl -s -G --data-urlencode "query=$query" "$prometheus_url/api/v1/query")
        results+=("$result")
    done

    if [ "$format" = "json" ]; then
        printf '%s\n' "${results[@]}" | jq -s '.'
    else
        printf '%s\n' "${results[@]}"
    fi
}

# Rotate Logs
rotate_logs() {
    local retention_days="$1"
    local compression_type="${2:-gzip}"

    log "INFO" "Rotating logs with $retention_days days retention"

    # Create backup directory if it doesn't exist
    mkdir -p "$BACKUP_DIR"

    # Compress and archive current log
    if [ -f "$LOG_FILE" ]; then
        local archive_name="monitoring_$(date +%Y%m%d_%H%M%S).log"
        cp "$LOG_FILE" "$BACKUP_DIR/$archive_name"
        
        case $compression_type in
            "gzip")
                gzip "$BACKUP_DIR/$archive_name"
                ;;
            "bzip2")
                bzip2 "$BACKUP_DIR/$archive_name"
                ;;
            *)
                log "WARN" "Unknown compression type: $compression_type, skipping compression"
                ;;
        esac

        # Clear current log file
        truncate -s 0 "$LOG_FILE"
    fi

    # Remove old logs
    find "$BACKUP_DIR" -type f -mtime +$retention_days -delete

    log "INFO" "Log rotation completed"
}

# Backup Monitoring Configuration
backup_monitoring_config() {
    local backup_path="$BACKUP_DIR/config_$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$backup_path"

    log "INFO" "Backing up monitoring configuration to $backup_path"

    # Backup Kubernetes resources
    for resource in configmaps secrets deployments services; do
        kubectl -n "$NAMESPACE" get "$resource" -l "app.kubernetes.io/part-of=video-coaching-platform" -o yaml > "$backup_path/$resource.yaml"
    done

    # Compress backup
    tar -czf "$backup_path.tar.gz" -C "$backup_path" .
    rm -rf "$backup_path"

    log "INFO" "Backup completed: $backup_path.tar.gz"
}

# Main execution
main() {
    local command="$1"
    shift

    case $command in
        "check")
            check_monitoring_stack "$@"
            ;;
        "deploy")
            deploy_monitoring "$@"
            ;;
        "collect")
            collect_metrics "$@"
            ;;
        "rotate")
            rotate_logs "$@"
            ;;
        "backup")
            backup_monitoring_config
            ;;
        *)
            log "ERROR" "Unknown command: $command"
            echo "Usage: $0 {check|deploy|collect|rotate|backup} [args...]"
            exit 1
            ;;
    esac
}

# Execute main function with all arguments
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    if [ $# -eq 0 ]; then
        echo "Usage: $0 {check|deploy|collect|rotate|backup} [args...]"
        exit 1
    fi
    main "$@"
fi