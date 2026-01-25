# Lanyte Repository Operations SOP

_Standard Operating Procedures for repository management, commits, and
deployments_

**Version:** 1.1 (Updated for v0.1.0) **Last Updated:** August 25, 2025
**Maintainers:** DevOps/CI-CD Team

## Overview

This document establishes standard operating procedures for Lanyte repository
operations, ensuring consistent quality gates, security compliance, and
professional development practices. Lanyte v0.1.0 has achieved **76.2% test
coverage** with zero security vulnerabilities, establishing a strong foundation
for future development.

> **Required Reading**: [CI/CD Developer Experience Principles](../development/cicd-developer-experience.md) - Quality gates must reflect what developers experience when cloning the repo. CI jobs validate DX, not just code correctness.

## Quality Gates Summary

| Gate           | Target           | Coverage | Security | Time  |
| -------------- | ---------------- | -------- | -------- | ----- |
| **check-all**  | Development      | N/A      | Basic    | ~5s   |
| **pre-commit** | Commit Ready     | 10%+     | Basic    | ~30s  |
| **pre-push**   | Production Ready | 80%+     | Full     | ~2min |

## Commit Operations

### Standard Commit Workflow

#### 1. Pre-Commit Quality Check

```bash
# MANDATORY: Run quality checks before any commit work
make check-all
```

**Requirements:**

- All formatting checks pass (`fmt-strict`)
- Static analysis clean (`vet`)
- Linting passes with 0 issues (`lint`)

#### 2. File Staging Strategy

##### Full Repository Staging

```bash
# For feature completion, refactoring, or comprehensive changes
git add .
```

**Use Cases:**

- Initial commits
- Version releases
- Major feature completion
- Documentation updates

##### Selective File Staging

```bash
# For targeted fixes or incremental development
git add specific/file/path.go
git add specific/directory/
```

**Use Cases:**

- Bug fixes
- Single feature development
- Security patches
- Dependency updates

#### 3. Staged File Inspection & Cleanup

```bash
# MANDATORY: Review staged files before commit
git status
git diff --cached --name-only

# Remove extraneous files if needed
git reset HEAD unwanted/file.go

# Update .gitignore for new patterns
# Edit .gitignore, then:
git add .gitignore
```

**Critical Checks:**

- No temporary files (`.tmp`, `.cache`, etc.)
- No build artifacts in `dist/`, `coverage/`
- No IDE files (`.vscode/`, `.idea/`)
- No sensitive data or credentials
- No AI tool artifacts (`.claude/`, `.cursor/`)

#### 4. Pre-Commit Validation

```bash
# MANDATORY: Full pre-commit validation
make pre-commit
```

**Validation Includes:**

- Code quality checks (`check-all`)
- Fast test suite (`test-short`)
- Coverage threshold validation (10%+ minimum, currently 76.2%)
- Documentation formatting (`fmt-docs`)

#### 5. Commit Execution

```bash
# Standard commit with descriptive message
git commit -m "feat: enhance version command with Git integration

- Add Git status detection (branch, ahead/behind, dirty state)
- Implement environment detection (development/production)
- Add extended output mode with build metadata
- Support JSON output format for automation
- Enhance error handling for Git operations

Coverage: 76.2%"
```

**Commit Message Standards:**

- **Type:** `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `perf:`, `chore:`
- **Description:** Clear, actionable summary
- **Body:** Detailed changes and impact
- **Footer:** Issue references, coverage metrics
- **Attribution:** Follow
  [Agentic Attribution Standard](../standards/agentic-attribution.md) for AI
  agent contributions

### Emergency Bypass Procedures

#### --no-verify Override

**RESTRICTED OPERATION - Requires Supervisor Approval**

##### Minimum Requirements (Even in Emergency)

```bash
# ALWAYS run formatting - no excuse for unformatted code
make fmt          # Go code formatting
make fmt-docs     # Documentation formatting (best effort)
```

**Rationale:** Formatting is trivial to fix and prevents unnecessary diff noise
in emergency commits.

##### Emergency Bypass Execution

```bash
# Emergency bypass (SUPERVISOR APPROVAL REQUIRED)
git commit --no-verify -m "hotfix: critical security patch

EMERGENCY BYPASS: Pre-commit checks skipped
Supervisor: [Name]
Ticket: URGENT-001
Reason: Production security vulnerability
Formatting: Applied (make fmt + make fmt-docs)

Will address quality gates in follow-up commit"
```

##### In-Development Override

```bash
# Development bypass (SUPERVISOR APPROVAL REQUIRED)
git commit --no-verify -m "wip: partial authentication implementation

IN-DEVELOPMENT BYPASS: Incomplete implementation
Supervisor: [Name]
Ticket: DEV-456
Reason: End-of-day checkpoint, tests incomplete
Formatting: Applied (make fmt + make fmt-docs)

Will complete implementation and tests in next commit"
```

**Authorization Required:**

- **Supervisor/Maintainer approval** via Slack/email
- **Documented justification** in commit message
- **Formatting applied** (`make fmt` + `make fmt-docs`)
- **Follow-up commitment** to address quality gates
- **Post-deployment review** scheduled (emergency) or **next-day review**
  (development)

**Valid Emergency Scenarios:**

- Critical security vulnerabilities
- Production outages
- Data corruption fixes
- Regulatory compliance deadlines

**Valid In-Development Scenarios:**

- End-of-day work-in-progress checkpoints
- Incomplete feature implementations requiring backup
- Experimental code requiring version control
- Collaborative development handoffs

## Push Operations

### Standard Push Workflow

#### 1. Pre-Push Preparation

##### Version Confirmation

```bash
# Confirm current version
make version-get
cat VERSION

# Update version if needed (semantic versioning)
make version-bump-patch  # or minor/major
git add VERSION
```

##### Pre-Push Quality Validation

```bash
# MANDATORY: Full quality validation BEFORE commit consolidation
make pre-push
```

**Critical:** Run `pre-push` validation BEFORE any commit consolidation
operations to minimize rework.

#### 2. Commit Consolidation to Last Pushed Version

**📋 For comprehensive commit consolidation procedures, see:
[Git Commit Consolidation SOP](git-commit-consolidation-sop.md)**

##### Quick Reference

```bash
# 1. Create backup (ALWAYS!)
git branch backup/pre-consolidation-$(date +%Y%m%d-%H%M%S)

# 2. Run quality validation BEFORE consolidation
make pre-push

# 3. Soft reset to target commit
git reset --soft <commit-hash>

# 4. Create clean commit
git add -A
git commit -m "feat: comprehensive feature implementation"
```

##### Post-Consolidation Validation

```bash
# Verify consolidation success
git log --oneline -5
git status

# MANDATORY: Final pre-push check after consolidation
make pre-push
```

**⚠️ Important**: Always follow the
[Git Commit Consolidation SOP](git-commit-consolidation-sop.md) for complete
procedures including backup strategies, commit message standards, and recovery
options.

#### 3. Version Tagging (For Release Commits)

For version release commits, create and push annotated tags:

```bash
# Create annotated tag with release notes
git tag -a v0.1.1 -m "v0.1.1: [Brief Release Description]

✨ Features:
- [New features added]

🐛 Fixes:
- [Bug fixes included]

📊 Quality Metrics:
- Coverage: [X.X]% (meets [Phase] requirements)
- Security: Zero vulnerabilities
- Quality: Zero linting issues

🏗️ Architecture:
- [Any architectural improvements]

Ready for [Phase] development."

# Verify tag created
git tag -l -n9 v0.1.1
```

#### 4. Push Execution

```bash
# Standard push (set upstream on first push)
git push -u origin main

# Push tag immediately after successful branch push
git push origin v0.1.1

# Force push after rebase (if needed)
git push --force-with-lease origin main
```

**IMPORTANT**: Always push tags immediately after successful branch push to
maintain version consistency.

## Git Hooks Integration

### Automated Quality Validation

Lanyte includes git hooks for automated quality validation:

#### Pre-Commit Hook

- **Location**: `.git/hooks/pre-commit`
- **Purpose**: Runs `make pre-commit` before allowing commits
- **Validation**: Code quality, fast tests, dynamic coverage, documentation
  formatting
- **Bypass**: Use `git commit --no-verify` (requires supervisor approval per
  SOP)

#### Pre-Push Hook

- **Location**: `.git/hooks/pre-push`
- **Purpose**: Runs `make pre-push` before allowing pushes
- **Validation**: Full test suite, security scans, production-ready coverage
- **Bypass**: Use `git push --no-verify` (requires supervisor approval per SOP)

### Hook Setup Verification

```bash
# Verify hooks are executable
ls -la .git/hooks/pre-*

# Test pre-commit hook manually
./.git/hooks/pre-commit

# Test pre-push hook manually
./.git/hooks/pre-push
```

### Single Commit/Push Cycle

For simple changes that don't require consolidation:

```bash
# 1. Pre-push validation FIRST
make pre-push

# 2. Stage and commit
git add .
git commit -m "fix: resolve authentication timeout issue"

# 3. Push immediately
git push origin main
```

## Quality Gate Details

### make check-all (Development)

```bash
# Components:
make fmt-strict  # Code formatting compliance
make vet        # Static analysis
make lint       # Comprehensive linting (0 issues required)
```

**Purpose:** Fast feedback during development cycle **Time:** ~5 seconds
**Coverage:** Not enforced

### make pre-commit (Commit Ready)

```bash
# Components:
make check-all                    # Quality checks
make test-short                   # Fast test suite
make coverage-check-pre-commit    # 10% minimum coverage (currently 76.2%)
make fmt-docs                     # Documentation formatting
```

**Purpose:** Commit readiness validation **Time:** ~30 seconds **Coverage:** 10%
minimum (bootstrap phase, currently exceeding with 76.2%)

### make pre-push (Production Ready)

```bash
# Components:
make check-all         # Quality checks
make test             # Full test suite with race detection
make coverage-check   # 80% minimum coverage
make security-scan    # gosec + govulncheck
```

**Purpose:** Production deployment readiness **Time:** ~2 minutes **Coverage:**
80% minimum (production standard)

## Troubleshooting

### Common Issues

#### Pre-commit Failures

```bash
# Formatting issues
make fmt
git add .

# Test failures
go test -v ./...
# Fix failing tests, then retry

# Coverage below threshold
# Add tests to increase coverage
# Or document exception with supervisor approval
```

#### Pre-push Failures

```bash
# Security vulnerabilities
make security-scan
# Review and fix vulnerabilities

# Coverage insufficient
make test
# Add comprehensive tests
```

#### Rebase Conflicts

```bash
# Resolve conflicts manually
git status
# Edit conflicted files
git add resolved-file.go
git rebase --continue

# If rebase becomes complex, abort and seek guidance
git rebase --abort
```

## Compliance & Audit

### Required Documentation

- All emergency bypasses logged in commit messages
- Supervisor approvals documented
- Post-deployment reviews scheduled
- Quality gate exceptions justified

### Audit Trail

- Pre-commit/pre-push logs retained
- Coverage reports archived
- Security scan results stored
- Version bump history maintained

## Contacts

**Emergency Approvals:**

- **Lead Maintainer:** [Contact Info]
- **Security Officer:** [Contact Info]
- **DevOps Lead:** [Contact Info]

**Escalation Path:**

1. Team Lead → Senior Engineer → Engineering Manager
2. Security Issues → Security Team → CISO
3. Production Issues → On-Call → Engineering Manager

---

## Appendix: Make Targets Reference

**Available Make Targets:**

- `make help` - Show available commands
- `make check-all` - Development quality checks
- `make pre-commit` - Commit validation
- `make pre-push` - Push validation
- `make test` - Full test suite with coverage
- `make build` - Build binary
- `make security-scan` - Full security analysis
- `make fmt-docs` - Format documentation
- `make version-bump-patch` - Semantic version bump

## Lanyte v0.1.0 First Commit Preparation

### Current Status

- ✅ **76.2% test coverage** achieved (exceeds 75% threshold)
- ✅ **Zero security vulnerabilities** (gosec + govulncheck clean)
- ✅ **Zero linting issues** (golangci-lint clean)
- ✅ **Professional documentation** (README, overview, user guides)
- ✅ **Complete build system** with multi-platform support
- ✅ **Enterprise CLI architecture** following Fulmen patterns

### First Commit Checklist

- [x] All quality gates passing (`make check-all`)
- [x] Pre-commit validation successful (`make pre-commit`)
- [x] Documentation formatted (`make fmt-docs`)
- [x] Build system verified (`make build`)
- [x] Version file current (`cat VERSION` → 0.1.0)
- [x] Git repository configured and clean

### First Commit Message Template

```bash
git commit -m "Initial commit: Lanyte v0.1.0 - Professional CLI framework

- Enterprise-grade CLI with Cobra framework
- 76.2% test coverage with comprehensive testing
- Zero security vulnerabilities verified
- Professional tooling (linting, formatting, security scanning)
- Complete documentation and user guides
- Multi-platform build support
- Security-first implementation with secrets redaction

Ready for production deployment with clear path to v0.1.1"
```

**Last Updated:** August 25, 2025 **Next Review:** December 2025

## Release SOP References

- Use `docs/ops/release/RELEASE_CHECKLIST.md` to validate readiness and execute releases.
- Follow org policies from https://github.com/3leaps/oss-policies/ (Code of Conduct, Security, Contributing).
