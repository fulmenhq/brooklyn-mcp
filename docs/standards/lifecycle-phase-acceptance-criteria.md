ti

# Lifecycle Phase Acceptance Criteria SOP

_Standard Operating Procedures for lifecycle phase transitions and acceptance
validation_

**Version:** 1.0 **Last Updated:** September 3, 2025 **Authority:** DevOps/CI-CD
Team, Architecture Review Board

## Overview

This document establishes the standard operating procedures for validating and
accepting lifecycle phase transitions in the Brooklyn MCP repository. Each phase
transition requires specific validation procedures, approval workflows, and
documentation standards.

## Phase Acceptance Matrix

### Experimental Phase

**Entry Requirements:** Repository creation **Exit Validation:** Basic
functionality proof-of-concept

```bash
# Experimental Acceptance Checklist
- [ ] Repository initialized with basic structure
- [ ] Core concept documented in README
- [ ] Initial code compiles and runs
- [ ] Basic `bun run --help` available
```

**Approval Authority:** Development Team Lead **Documentation:** Concept
documentation, basic README

---

### Alpha Phase

**Entry Requirements:** Core features implemented **Exit Validation:**
Production-ready foundation

```bash
# Alpha Phase Acceptance Validation
bun run check-all                    # Quality gates pass
bun run test --coverage             # 50%+ coverage required
bun run security-scan               # Basic security scan
bun run build                       # Successful build

# Coverage validation
COVERAGE=$(cat coverage/coverage-summary.json | grep -o '"total":\s*[0-9.]*' | grep -o '[0-9.]*' | head -1)
if [ "${COVERAGE%.*}" -ge "50" ]; then
  echo "✅ Alpha coverage requirement met: ${COVERAGE}%"
else
  echo "❌ Alpha coverage requirement NOT met: ${COVERAGE}% (requires 50%+)"
  exit 1
fi
```

**Acceptance Criteria:**

- ✅ Core CLI commands implemented (`version`, `help`, primary features)
- ✅ Test coverage ≥ 50%
- ✅ Basic security scanning clean (`bun run security-scan`)
- ✅ Code quality gates passing (`bun run check-all`)
- ✅ Basic documentation (setup, usage)
- ✅ Successful multi-platform builds

**Approval Authority:** Technical Lead **Required Documentation:** Setup guide,
command reference, basic API docs

---

### Beta Phase

**Entry Requirements:** Feature-complete implementation **Exit Validation:**
Limited production readiness

```bash
# Beta Phase Acceptance Validation
bun run check-all                 # Enhanced quality gates
bun run security-scan             # Full security validation
bun run build                     # Multi-platform builds

# Coverage validation (70%+ required)
COVERAGE=$(cat coverage/coverage-summary.json | grep -o '"total":\s*[0-9.]*' | grep -o '[0-9.]*' | head -1)
if [ "${COVERAGE%.*}" -ge "70" ]; then
  echo "✅ Beta coverage requirement met: ${COVERAGE}%"
else
  echo "❌ Beta coverage requirement NOT met: ${COVERAGE}% (requires 70%+)"
  exit 1
fi

# Security validation
bun run security-scan
if [ $? -eq 0 ]; then
  echo "✅ Beta security requirements met"
else
  echo "❌ Beta security requirements NOT met"
  exit 1
fi
```

**Acceptance Criteria:**

- ✅ Feature-complete core functionality
- ✅ Test coverage ≥ 70%
- ✅ Full security scan compliance (`bun run security-scan`)
- ✅ Pre-commit validation passing (`bun run check-all`)
- ✅ Comprehensive documentation suite
- ✅ Limited production testing successful
- ✅ Performance benchmarks established

**Approval Authority:** Technical Lead + Senior Engineer Review **Required
Documentation:** User guides, API documentation, deployment guides

---

### Production Phase

**Entry Requirements:** Enterprise deployment readiness **Exit Validation:**
Full production compliance

```bash
# Production Phase Acceptance Validation
bun run check-all                # Full quality validation
bun run test --coverage          # Complete CI pipeline
bun run version                  # Version management confirmed

# Coverage validation (80%+ required for production)
COVERAGE=$(cat coverage/coverage-summary.json | grep -o '"total":\s*[0-9.]*' | grep -o '[0-9.]*' | head -1)
if [ "${COVERAGE%.*}" -ge "80" ]; then
  echo "✅ Production coverage requirement met: ${COVERAGE}%"
else
  echo "❌ Production coverage requirement NOT met: ${COVERAGE}% (requires 80%+)"
  exit 1
fi

# Full validation suite
echo "Running production readiness validation..."
bun run check-all
bun run security-scan
bun run build

# Validate documentation completeness
if [ -f "README.md" ] && [ -f "docs/brooklyn-overview.md" ] && [ -f "docs/standards/repository-operations-sop.md" ]; then
  echo "✅ Production documentation requirements met"
else
  echo "❌ Production documentation requirements NOT met"
  exit 1
fi
```

**Acceptance Criteria:**

- ✅ Test coverage ≥ 80%
- ✅ Zero security vulnerabilities
- ✅ Full quality gates passing (`bun run check-all`)
- ✅ Complete documentation suite with SOPs
- ✅ Production deployment validated
- ✅ Monitoring and alerting configured
- ✅ Professional tooling and automation

**Approval Authority:** Architecture Review Board **Required Documentation:**
Complete documentation suite, SOPs, user guides

---

### Mature Phase

**Entry Requirements:** Proven production stability **Exit Validation:**
Optimization and maintenance focus

**Validation Commands:**

- bun run test --coverage - Run continuous integration tests
- bun run perf-test - Performance validation
- bun run security-scan - Security analysis

**Acceptance Criteria:**

- ✅ Test coverage ≥ 90%
- ✅ 30+ days production stability (error rate <1%)
- ✅ Advanced monitoring and observability
- ✅ Performance optimization validated
- ✅ Comprehensive troubleshooting documentation
- ✅ Maintenance procedures documented

**Approval Authority:** Architecture Review Board + Business Stakeholders
**Required Documentation:** Advanced guides, performance analysis, maintenance
procedures

---

## Phase Transition Procedures

### 1. Pre-Transition Validation

```bash
#!/bin/bash
# Pre-transition validation script

CURRENT_PHASE=$(cat LIFECYCLE_PHASE 2>/dev/null || echo "alpha")
TARGET_PHASE=$1

echo "Validating transition: ${CURRENT_PHASE} → ${TARGET_PHASE}"

case $TARGET_PHASE in
  "alpha")
    bun run check-all && echo "✅ Alpha validation passed"
    ;;
  "beta")
    bun run check-all && bun run security-scan && echo "✅ Beta validation passed"
    ;;
  "production")
    bun run check-all && bun run test --coverage && echo "✅ Production validation passed"
    ;;
  "mature")
    bun run test --coverage && bun run perf-test && echo "✅ Mature validation passed"
    ;;
  *)
    echo "❌ Unknown target phase: ${TARGET_PHASE}"
    exit 1
    ;;
esac
```

### 2. Approval Workflow

#### Technical Approval

```bash
# Create transition request
git checkout -b lifecycle/transition-to-${TARGET_PHASE}

# Update documentation
echo $TARGET_PHASE > LIFECYCLE_PHASE
git add LIFECYCLE_PHASE

# Update README badges and documentation
# ... make necessary updates ...

git commit -m "lifecycle: transition to ${TARGET_PHASE} phase

Validation results:
- Coverage: ${COVERAGE}%
- Security: Clean
- Quality gates: Passing
- Documentation: Complete

Approved by: [Technical Lead Name]
Validation date: $(date -u +%Y-%m-%d)"

# Create pull request for review
git push origin lifecycle/transition-to-${TARGET_PHASE}
```

#### Architecture Review Board Approval (Production/Mature)

- **Review Period:** 5 business days minimum
- **Required Artifacts:** Validation results, performance benchmarks, security
  reports
- **Approval Criteria:** Unanimous approval from ARB members
- **Documentation:** Formal approval recorded in repository

### 3. Post-Transition Activities

```bash
# Update repository metadata
echo $NEW_PHASE > LIFECYCLE_PHASE

# Update README badges
sed -i.bak "s/phase-[a-z]*/phase-${NEW_PHASE}/g" README.md

# Update documentation references
# Update quality gate thresholds in Makefile if needed

# Tag the transition
git tag -a "lifecycle-${NEW_PHASE}" -m "Lifecycle transition to ${NEW_PHASE} phase"
git push origin lifecycle-${NEW_PHASE}
```

## Quality Gate Integration

### Make Target Adjustments

```makefile
# Lifecycle-aware quality gates
LIFECYCLE_PHASE := $(shell cat LIFECYCLE_PHASE 2>/dev/null || echo "alpha")

ifeq ($(LIFECYCLE_PHASE),alpha)
    COVERAGE_THRESHOLD := 50
else ifeq ($(LIFECYCLE_PHASE),beta)
    COVERAGE_THRESHOLD := 70
else ifeq ($(LIFECYCLE_PHASE),production)
    COVERAGE_THRESHOLD := 80
else ifeq ($(LIFECYCLE_PHASE),mature)
    COVERAGE_THRESHOLD := 90
else
    COVERAGE_THRESHOLD := 10
endif

coverage-check-lifecycle: test
	@COVERAGE=$$(go tool cover -func=$(COVERAGE_DIR)/coverage.out | grep total | awk '{print $$3}' | sed 's/%//'); \
	if [ "$${COVERAGE%.*}" -lt "$(COVERAGE_THRESHOLD)" ]; then \
		echo "Coverage $${COVERAGE}% below $(LIFECYCLE_PHASE) threshold $(COVERAGE_THRESHOLD)%"; \
		exit 1; \
	fi
```

## Compliance and Auditing

### Transition Documentation

- **Date and time of transition**
- **Validation results and metrics**
- **Approving authority**
- **Transition justification**
- **Post-transition verification**

### Audit Requirements

- All transitions logged in git history
- Approval documentation retained
- Validation results archived
- Periodic phase compliance reviews

---

## Emergency Procedures

### Emergency Phase Rollback

```bash
# Emergency rollback to previous stable phase
PREVIOUS_PHASE=$(git log --oneline --grep="lifecycle:" | head -2 | tail -1 | grep -o "to [a-z]*" | cut -d' ' -f2)
echo $PREVIOUS_PHASE > LIFECYCLE_PHASE

git commit -m "emergency: rollback to ${PREVIOUS_PHASE} phase

Emergency rollback due to: [REASON]
Authority: [EMERGENCY_CONTACT]
Timestamp: $(date -u)"
```

### Emergency Override Authority

- **Production Issues:** On-call Engineer + Engineering Manager
- **Security Issues:** Security Team + CISO
- **Business Critical:** Business Stakeholders + CTO

---

## Contacts and Escalation

**Phase Transition Approvals:**

- **Alpha/Beta:** Technical Lead
- **Production:** Architecture Review Board
- **Mature:** ARB + Business Stakeholders

**Emergency Contacts:**

- **Technical Issues:** Engineering Manager
- **Security Issues:** Security Officer
- **Business Issues:** Product Owner

## General Phase Validation Framework

### Automated Validation Script Template

```bash
#!/bin/bash
# Generic Brooklyn MCP Lifecycle Phase Validation Script
# Usage: ./validate-phase.sh [experimental|alpha|beta|production|mature]

TARGET_PHASE=${1:-$(cat LIFECYCLE_PHASE 2>/dev/null || echo "alpha")}

echo "🔍 Brooklyn MCP Lifecycle Phase Validation: ${TARGET_PHASE}"
echo "=================================================="

# Dynamic threshold based on lifecycle phase
case $TARGET_PHASE in
  "experimental")
    COVERAGE_THRESHOLD=0
    ;;
  "alpha")
    COVERAGE_THRESHOLD=50
    ;;
  "beta")
    COVERAGE_THRESHOLD=70
    ;;
  "production")
    COVERAGE_THRESHOLD=80
    ;;
  "mature")
    COVERAGE_THRESHOLD=90
    ;;
  *)
    COVERAGE_THRESHOLD=10
    ;;
esac

# 1. Quality Gates Validation
echo "1. Running quality validation..."
bun run check-all
if [ $? -ne 0 ]; then
  echo "❌ Quality gates failed"
  exit 1
fi
echo "✅ Quality gates passed"

# 2. Security Validation (for non-experimental phases)
if [ "$TARGET_PHASE" != "experimental" ]; then
  echo "2. Running security validation..."
  bun run security-scan
  if [ $? -ne 0 ]; then
    echo "❌ Security scan failed"
    exit 1
  fi
  echo "✅ Security validation passed"
else
  echo "2. Security validation skipped for experimental phase"
fi

# 3. Coverage Validation
echo "3. Checking test coverage..."
if [ -f "coverage/coverage-summary.json" ]; then
  COVERAGE=$(cat coverage/coverage-summary.json | grep -o '"total":\s*[0-9.]*' | grep -o '[0-9.]*' | head -1)
  echo "📊 Current coverage: ${COVERAGE}% (threshold: ${COVERAGE_THRESHOLD}%)"
  if [ "${COVERAGE%.*}" -lt "$COVERAGE_THRESHOLD" ]; then
    echo "❌ Coverage below threshold: ${COVERAGE}% (requires ${COVERAGE_THRESHOLD}%+)"
    exit 1
  fi
  echo "✅ Coverage requirement met: ${COVERAGE}%"
else
  echo "⚠️  Coverage file not found - run tests first"
fi

# 4. Documentation Validation
echo "4. Validating documentation..."
REQUIRED_DOCS=("README.md")
if [ "$TARGET_PHASE" = "production" ] || [ "$TARGET_PHASE" = "mature" ]; then
  REQUIRED_DOCS+=("docs/brooklyn-overview.md" "docs/standards/repository-operations-sop.md")
fi

for doc in "${REQUIRED_DOCS[@]}"; do
  if [ ! -f "$doc" ]; then
    echo "❌ Required documentation missing: $doc"
    exit 1
  fi
done
echo "✅ Documentation requirements met"

# 5. Version and Lifecycle State
echo "5. Verifying version and lifecycle state..."
CURRENT_VERSION=$(cat VERSION 2>/dev/null || echo "0.0.0")
CURRENT_PHASE=$(cat LIFECYCLE_PHASE 2>/dev/null || echo "alpha")
echo "📋 Current version: ${CURRENT_VERSION}"
echo "📋 Current phase: ${CURRENT_PHASE}"

echo ""
echo "🎉 Brooklyn MCP ${TARGET_PHASE} Phase Validation Complete!"
echo "   Ready for ${TARGET_PHASE} phase operations."
```

## Dynamic Coverage Gating System

### Overview

Brooklyn MCP implements dynamic coverage gating based on lifecycle phases using a
centralized configuration system. This ensures appropriate quality standards for
each development stage while preventing configuration drift.

### Coverage Threshold Configuration

**Configuration File:** `config/coverage-thresholds.yaml`

```yaml
lifecycle_thresholds:
  experimental: 0 # No minimum coverage for proof-of-concept
  alpha: 50 # Basic coverage for core functionality
  beta: 70 # Enhanced coverage for feature-complete state
  production: 80 # Production-ready coverage standard
  mature: 90 # Mature state with comprehensive coverage
  deprecated: 0 # Maintain existing, no new coverage requirements
  retired: 0 # No coverage requirements for retired state

# Default fallback if lifecycle phase not found (same as production for safety)
default_threshold: 80

# Bootstrap development threshold (used during initial development)
bootstrap_threshold: 10
```

### Automated Validation Script

**Script:** `scripts/validate-coverage-threshold.sh`

```bash
# Validate coverage for current phase
./scripts/validate-coverage-threshold.sh

# Validate coverage for specific phase
./scripts/validate-coverage-threshold.sh production

# Example output:
# 🔍 Brooklyn MCP Coverage Threshold Validation
# ==========================================
# 📋 Current lifecycle phase: alpha
# 📊 Required coverage threshold: 50%
# 📈 Current coverage: 76.2%
#
# ✅ Coverage requirement met!
#    Current: 76.2% >= Required: 50%
#    Margin: 26% above threshold
```

### Integration with Build System

The coverage validation integrates with Make targets:

```bash
# Dynamic coverage check based on lifecycle phase
coverage-check-dynamic: test
	@./scripts/validate-coverage-threshold.sh

# Pre-commit with dynamic thresholds
pre-commit-dynamic: check-all test-short coverage-check-dynamic fmt-docs
	@echo "✅ Pre-commit checks passed with dynamic coverage gating!"
```

### Safety Features

1. **Default to Production Standards:** Unknown phases default to 80% coverage
   (production level)
2. **Hard-coded Fallback:** If configuration is missing, script defaults to 80%
   coverage
3. **Explicit Phase Validation:** Script validates that LIFECYCLE_PHASE file
   exists and is readable
4. **Clear Error Messages:** Detailed feedback on coverage deficits with
   remediation steps

**Last Updated:** September 3, 2025 **Next Review:** March 2026
