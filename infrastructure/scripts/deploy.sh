#!/bin/bash

# Video Coaching Platform Deployment Script
# Version: 1.0.0
# Dependencies:
# - kubectl v1.27.x
# - aws-cli v2.x
# - helm v3.x

set -euo pipefail

# Global Configuration
readonly ENVIRONMENTS=('dev' 'staging' 'prod')
readonly REGIONS=('us-east-1' 'us-west-2' 'eu-central-1' 'ap-southeast-1')
readonly SERVICES=('api-gateway' 'video-service' 'chat-service' 'coach-service' 'payment-service' 'user-service')
readonly KUBECTL_TIMEOUT="300s"
readonly HEALTH_CHECK_INTERVAL="10s"
readonly MAX_RETRY_ATTEMPTS=5
readonly LOG_LEVEL="INFO"

# Logging Configuration
log() {
    local level="$1"
    local message="$2"
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] [$level] $message"
}

# Environment Validation
validate_environment() {
    local environment="$1"
    local region="$2"
    
    log "INFO" "Validating environment: $environment in region: $region"
    
    # Verify environment and region validity
    if [[ ! " ${ENVIRONMENTS[@]} " =~ " ${environment} " ]]; then
        log "ERROR" "Invalid environment: $environment"
        return 1
    fi
    
    if [[ ! " ${REGIONS[@]} " =~ " ${region} " ]]; then
        log "ERROR" "Invalid region: $region"
        return 1
    }
    
    # Check cluster connectivity
    if ! kubectl version --short > /dev/null 2>&1; then
        log "ERROR" "Failed to connect to Kubernetes cluster"
        return 1
    }
    
    # Validate required resources
    log "INFO" "Validating cluster resources..."
    kubectl get namespace videocoach-system > /dev/null 2>&1 || kubectl apply -f ../kubernetes/base/namespace.yaml
    
    # Verify RBAC permissions
    if ! kubectl auth can-i create deployments --namespace videocoach-system; then
        log "ERROR" "Insufficient permissions to manage deployments"
        return 1
    }
    
    return 0
}

# Service Deployment
deploy_service() {
    local service_name="$1"
    local environment="$2"
    local region="$3"
    
    log "INFO" "Deploying service: $service_name to $environment in $region"
    
    # Apply service configuration
    local config_file="../kubernetes/services/${service_name}.yaml"
    if [[ ! -f "$config_file" ]]; then
        log "ERROR" "Service configuration not found: $config_file"
        return 1
    }
    
    # Execute deployment with health checks
    if ! kubectl apply -f "$config_file" --namespace videocoach-system; then
        log "ERROR" "Failed to deploy service: $service_name"
        return 1
    }
    
    # Wait for deployment rollout
    if ! kubectl rollout status deployment/"$service_name" \
        --namespace videocoach-system \
        --timeout="$KUBECTL_TIMEOUT"; then
        log "ERROR" "Deployment rollout failed for: $service_name"
        rollback_deployment "$service_name" "$environment" "$region"
        return 1
    }
    
    # Verify service health
    if ! health_check "$service_name" "$environment" "$region"; then
        log "ERROR" "Health check failed for: $service_name"
        rollback_deployment "$service_name" "$environment" "$region"
        return 1
    }
    
    log "INFO" "Successfully deployed service: $service_name"
    return 0
}

# Deployment Rollback
rollback_deployment() {
    local service_name="$1"
    local environment="$2"
    local region="$3"
    
    log "WARN" "Initiating rollback for service: $service_name"
    
    # Execute rollback
    if ! kubectl rollout undo deployment/"$service_name" --namespace videocoach-system; then
        log "ERROR" "Failed to rollback deployment: $service_name"
        return 1
    }
    
    # Wait for rollback completion
    if ! kubectl rollout status deployment/"$service_name" \
        --namespace videocoach-system \
        --timeout="$KUBECTL_TIMEOUT"; then
        log "ERROR" "Rollback failed for: $service_name"
        return 1
    }
    
    log "INFO" "Successfully rolled back service: $service_name"
    return 0
}

# Health Check
health_check() {
    local service_name="$1"
    local environment="$2"
    local region="$3"
    local attempts=0
    
    while [ $attempts -lt $MAX_RETRY_ATTEMPTS ]; do
        # Check pod status
        local ready_pods=$(kubectl get pods -l app="$service_name" \
            --namespace videocoach-system \
            -o jsonpath='{.items[*].status.containerStatuses[*].ready}' | tr ' ' '\n' | grep -c "true")
            
        local total_pods=$(kubectl get pods -l app="$service_name" \
            --namespace videocoach-system \
            --no-headers | wc -l)
            
        if [ "$ready_pods" -eq "$total_pods" ] && [ "$total_pods" -gt 0 ]; then
            # Verify endpoints
            if kubectl get endpoints "$service_name" --namespace videocoach-system | grep -q "[0-9]"; then
                log "INFO" "Health check passed for service: $service_name"
                return 0
            fi
        fi
        
        log "WARN" "Health check attempt $((attempts+1)) failed for: $service_name"
        attempts=$((attempts+1))
        sleep "$HEALTH_CHECK_INTERVAL"
    done
    
    log "ERROR" "Health check failed after $MAX_RETRY_ATTEMPTS attempts for: $service_name"
    return 1
}

# Main Deployment Function
deploy_all() {
    local environment="$1"
    local region="$2"
    
    log "INFO" "Starting deployment to environment: $environment in region: $region"
    
    # Validate environment
    if ! validate_environment "$environment" "$region"; then
        log "ERROR" "Environment validation failed"
        return 1
    }
    
    # Deploy services
    for service in "${SERVICES[@]}"; do
        if ! deploy_service "$service" "$environment" "$region"; then
            log "ERROR" "Failed to deploy service: $service"
            return 1
        fi
    done
    
    log "INFO" "Successfully completed deployment to $environment in $region"
    return 0
}

# Main Script Execution
main() {
    if [ "$#" -ne 2 ]; then
        log "ERROR" "Usage: $0 <environment> <region>"
        exit 1
    }
    
    local environment="$1"
    local region="$2"
    
    if deploy_all "$environment" "$region"; then
        log "INFO" "Deployment completed successfully"
        exit 0
    else
        log "ERROR" "Deployment failed"
        exit 1
    fi
}

# Execute main function with provided arguments
main "$@"