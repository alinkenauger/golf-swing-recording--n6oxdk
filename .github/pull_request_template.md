<!-- 
Pull Request Template v1.1.0
Last Updated: 2024-01-20
Required Technical Reviewers: 2
Required Security Reviewers: 1
Required Performance Reviewers: 1
-->

## Change Overview
### Title
<!-- Follow format: type(scope): description
Examples: feat(video): add frame extraction API, fix(auth): resolve token refresh issue -->

### Description
<!-- Provide detailed description of changes (min 100 characters) -->

### Change Type
<!-- Select one primary change type -->
- [ ] FEATURE - New functionality addition
- [ ] BUGFIX - Error correction
- [ ] REFACTOR - Code improvement without functional changes
- [ ] PERFORMANCE - Performance optimization
- [ ] DOCUMENTATION - Documentation updates

### Related Issues
<!-- Link related issues with relationship type -->
- Fixes #
- Related to #

## Technical Impact
### Affected Platforms
<!-- Select all that apply -->
- [ ] iOS
- [ ] Android
- [ ] Web
- [ ] Backend

### Affected Components
<!-- Select all that apply -->
- [ ] UI
- [ ] API
- [ ] Database
- [ ] Authentication
- [ ] Video_Processing
- [ ] Payment
- [ ] Chat
- [ ] Analytics

### Database Changes
<!-- If applicable, describe schema/data changes and migration plan -->
```sql
-- Migration scripts here
```

### API Changes
<!-- If applicable, describe API changes and backward compatibility -->
```diff
+ Added endpoints
- Removed endpoints
~ Modified endpoints
```

### Dependency Updates
<!-- List dependency changes with security implications -->
- Package: version (from -> to)
  - Security impact:
  - Breaking changes:

## Testing
### Test Coverage
<!-- Must meet minimum thresholds -->
- Unit Test Coverage: % (min 80%)
- Integration Test Coverage: % (min 70%)

### Test Types
<!-- Select all implemented -->
- [ ] Unit Tests
- [ ] Integration Tests
- [ ] E2E Tests
- [ ] Performance Tests

### Performance Test Results
```json
{
  "baseline_metrics": {
    "response_time": "",
    "throughput": "",
    "resource_usage": ""
  },
  "new_metrics": {
    "response_time": "",
    "throughput": "",
    "resource_usage": ""
  },
  "impact_analysis": ""
}
```

## Performance Impact
### Performance Analysis
```json
{
  "cpu_impact": "",
  "memory_impact": "",
  "network_impact": "",
  "storage_impact": ""
}
```

### Affected Metrics
<!-- List metrics with before/after measurements -->
- Metric 1: before -> after
- Metric 2: before -> after

### Optimization Efforts
<!-- Describe implemented optimizations -->

## Deployment
### Deployment Strategy
```json
{
  "type": "rolling|canary|blue-green",
  "phases": [
    {
      "phase": "1",
      "target": "",
      "duration": "",
      "success_criteria": []
    }
  ],
  "monitoring_requirements": {
    "metrics": [],
    "alerts": [],
    "thresholds": {}
  }
}
```

### Rollback Plan
```json
{
  "triggers": [
    "threshold_breach",
    "error_rate_increase",
    "manual_decision"
  ],
  "steps": [
    "step1",
    "step2"
  ],
  "verification": {
    "checks": [],
    "metrics": []
  }
}
```

## Security Considerations
### Security Impact Analysis
```json
{
  "risk_assessment": {
    "impact": "LOW|MEDIUM|HIGH",
    "likelihood": "LOW|MEDIUM|HIGH",
    "details": ""
  },
  "vulnerability_scan_results": {
    "critical": 0,
    "high": 0,
    "medium": 0,
    "low": 0
  },
  "mitigation_measures": []
}
```

### Security Testing
```json
{
  "penetration_test_results": {
    "status": "PASS|FAIL",
    "findings": []
  },
  "security_scan_results": {
    "status": "PASS|FAIL",
    "findings": []
  },
  "compliance_check_results": {
    "status": "PASS|FAIL",
    "findings": []
  }
}
```

## Checklist
<!-- Ensure all items are checked before requesting review -->
- [ ] Code follows project style guidelines
- [ ] Changes are tested thoroughly
- [ ] Documentation is updated
- [ ] Performance impact is assessed
- [ ] Security implications are evaluated
- [ ] Breaking changes are documented
- [ ] Rollback plan is defined
- [ ] Required reviewers are assigned