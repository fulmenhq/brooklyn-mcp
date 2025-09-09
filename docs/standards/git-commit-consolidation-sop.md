# Git Commit Consolidation SOP

**Purpose**: Provide comprehensive standard operating procedures for
consolidating multiple work commits into a single, clean, push-ready commit
using `git reset --soft` to the last pushed commit.

## 🎯 Quick Reference

### Core Workflow

```bash
# 1. Backup current state
git branch backup/pre-consolidation-$(date +%Y%m%d-%H%M%S)

# 2. Identify last pushed commit
git log --oneline --decorate --graph -10

# 3. Soft reset to last pushed commit
git reset --soft <last-pushed-commit-hash>

# 4. Create consolidated commit
git add -A
git commit -m "feat: comprehensive feature implementation"
```

### Emergency Recovery

```bash
# Recover from backup
git reset --hard backup/pre-consolidation-YYYYMMDD-HHMMSS

# Use reflog
git reflog -20
git reset --hard <reflog-entry>
```

## Overview

This document describes the standard operating procedure for **consolidating
multiple work commits into a single, clean, push-ready commit** before pushing
to the remote repository. This process uses `git reset --soft` to the last
pushed commit, combining all work-in-progress commits into one comprehensive
commit that follows Lanyte's quality and attribution standards.

## When to Use

- **Before pushing work commits**: When you have multiple incremental commits
  that should be consolidated into a single push-ready commit
- **Following typical PR workflow**: Where work-in-progress commits are
  condensed into one clean commit for the pull request
- **After feature development**: When consolidating all checkpoint commits from
  a development session into one comprehensive commit
- **Cleaning commit history**: When removing internal task IDs, phase numbers,
  or "WIP" markers before sharing with the team

## Prerequisites

**CRITICAL**: Repository working tree must be clean before beginning consolidation:

```bash
# REQUIRED: Verify clean working tree
git status
# Output should show: "nothing to commit, working tree clean"
```

Additional requirements:

- Git version 2.0 or higher
- Understanding of git reset, rebase, and commit concepts
- Backup strategy in place (automatic or manual)
- Brooklyn-specific: Familiarity with `bun run prepush` and quality gates

## Safety First: Always Create a Backup

Before any history rewriting operation, **always** create a backup branch:

```bash
# Create a timestamped backup branch
git branch backup/pre-consolidation-$(date +%Y%m%d-%H%M%S)
```

This saved us during our consolidation operation when we needed to recover from
an incomplete state.

## Step-by-Step Process

### 0. Verify Clean Working Tree (REQUIRED)

**STOP**: Before proceeding, ensure your working tree is clean:

```bash
# Check repository status
git status

# Required output: "nothing to commit, working tree clean"
# If you have uncommitted changes, commit or stash them first
```

### 1. Identify the Target Commit

First, identify the oldest commit that should NOT be consolidated (typically the
last pushed commit):

```bash
# View commit history
git log --oneline --decorate --graph -20

# Get the commit hash of the target
git rev-parse HEAD~N  # where N is the number of commits to include
```

### 2. Create Safety Backup

```bash
# Create backup branch at current HEAD
git branch backup/pre-consolidation-$(date +%Y%m%d-%H%M%S)

# Verify backup was created
git branch -vv | grep backup
```

### 3. Perform Soft Reset

Use soft reset to preserve all changes in the staging area:

```bash
# Reset to the commit AFTER which you want to consolidate everything
git reset --soft <commit-hash>

# Example: Reset to initial commit
git reset --soft $(git rev-list --max-parents=0 HEAD)
```

### 4. Lanyte-Specific: Pre-Commit Validation

**CRITICAL**: Before creating the consolidated commit, ensure all changes pass
Lanyte's quality gates:

```bash
# Run full pre-push validation
make pre-push

# If pre-push passes, proceed with commit
# If issues found, fix them before consolidation
```

### 5. Create Clean Commit Message

Prepare a commit message that follows Lanyte's standards:

- Summarizes the feature/changes comprehensively
- Excludes project-specific task numbers or phase identifiers
- Follows conventional commit format
- Includes co-author attributions following
  [Agentic Attribution Standard](../standards/agentic-attribution.md)

```bash
# Create commit message file
cat > /tmp/consolidation-message.txt << 'EOF'
feat: implement comprehensive feature with detailed subsystems

- Major component A with specific capabilities
- Integration layer B with external systems
- Testing infrastructure achieving X% coverage
- Documentation for user guides and architecture
- Performance optimizations reducing latency by Y%

Coverage: X% (meets phase requirements)
Security: Zero vulnerabilities detected

Co-authored-by: Nova Prime <noreply@lanytehq.dev>
Authored-by: Dave Thompson <dave.thompson@3leaps.net> [@3leapsdave](https://github.com/3leapsdave)
EOF
```

### 6. Create the Squashed Commit

```bash
# Option A: With pre-commit hooks (recommended for Lanyte)
git add -A
git commit -F /tmp/consolidation-message.txt

# Option B: Bypass hooks if they're causing issues
git add -A
git commit --no-verify -F /tmp/consolidation-message.txt
```

### 7. Handle Pre-commit Hook Issues

If pre-commit hooks fail (especially golangci-lint typecheck errors):

```bash
# First, verify code actually passes tests
make test  # or your test command
make pre-commit  # or your pre-commit command

# If tests pass but hooks fail, bypass hooks
git commit --no-verify -F /tmp/consolidation-message.txt
```

Common issues:

- **golangci-lint typecheck errors**: Often cache-related in hook context
- **Auto-formatters**: May modify files during commit - stage changes and
  re-commit

### 8. Verify Final State

```bash
# Check commit history
git log --oneline --decorate --graph -5

# Verify working directory is clean
git status
```

### 9. Push and Cleanup

After successful commit creation:

```bash
# Push the consolidated commit
git push origin main

# Verify push success
git log --oneline origin/main..HEAD  # Should show no commits

# 🗑️ CLEANUP: Delete backup branch after push verification
git branch -D backup/pre-consolidation-YYYYMMDD-HHMMSS

# List remaining backup branches (optional cleanup)
git branch | grep backup/pre-consolidation-
```

**⚠️ IMPORTANT**: Only delete backup branches AFTER verifying the push was
successful and you're satisfied with the result.

## Lanyte-Specific Considerations

### Quality Gate Integration

Before consolidation, ensure:

```bash
# All quality gates pass
make check-all      # Development checks
make pre-commit     # Commit-ready validation
make pre-push       # Production-ready validation
```

### Commit Message Standards

Follow Lanyte's
[Agentic Attribution Standard](../standards/agentic-attribution.md):

```bash
feat: implement comprehensive feature with detailed subsystems

🎯 Changes:
- Major component A with specific capabilities
- Integration layer B with external systems
- Testing infrastructure achieving X% coverage

📊 Coverage: X% (meets phase requirements)
🛡️ Security: Zero vulnerabilities detected

Generated by Nova Prime ([Cursor](https://cursor.com)) under supervision of [@3leapsdave](https://github.com/3leapsdave)

Co-Authored-By: Nova Prime <noreply@lanytehq.dev>
Authored-By: Dave Thompson <dave.thompson@3leaps.net> [@3leapsdave](https://github.com/3leapsdave)
```

### Version Management

For release commits, update version and create tags:

```bash
# Update version
make version-bump-patch  # or minor/major
git add VERSION

# Create annotated tag
git tag -a v0.1.1 -m "Release v0.1.1: [Brief description]"
```

## Best Practices

1. **Always backup before consolidation** - Create timestamped backup branches
2. **Test before consolidation** - Ensure all tests pass before rewriting
   history
3. **Use descriptive commit messages** - The consolidated commit should be
   self-contained and comprehensive
4. **Exclude internal references** - Remove task IDs, phase numbers, "WIP"
   markers
5. **Handle binary files carefully** - Large files may need special attention
   during consolidation
6. **Communicate with team** - Let others know before force-pushing consolidated
   commits
7. **Run quality gates** - Always validate with `make pre-push` before
   consolidation
8. **Delete backup branches** - Clean up backup branches after successful push
   verification

## When NOT to Use

- **For already-pushed commits**: Don't consolidate commits that have already
  been pushed and shared
- **For collaborative branches**: Avoid on branches being actively developed by
  multiple people
- **For release branches**: Consider if consolidation will affect release
  traceability
- **For audit-critical changes**: When individual commit history needs to be
  preserved for compliance

## Common Patterns

### Two-Commit Structure

For a clean "initial + feature" structure:

```bash
# Starting from: initial -> commit1 -> commit2 -> ... -> commitN
git reset --soft <initial-commit-hash>
git add -A
git commit -m "feat: comprehensive feature implementation"
# Result: initial -> feature
```

### Interactive Rebase Alternative

For more granular control:

```bash
git rebase -i <target-commit>
# Mark commits as 'squash' or 'fixup' in editor
```

## Troubleshooting

### Problem: Empty Commit After Reset

**Symptom**: `git status` shows changes but commit appears empty **Solution**:
Ensure all changes are staged with `git add -A`

### Problem: Pre-commit Hooks Failing

**Symptom**: Hooks fail but manual tests pass **Solution**: Use `--no-verify`
flag or fix hook configuration

### Problem: Lost Commits

**Symptom**: Commits disappeared after reset **Solution**: Use backup branch or
reflog to recover

### Problem: Quality Gates Failing

**Symptom**: `make pre-push` fails after squash **Solution**:

```bash
# Fix any issues found
make test              # Run tests
make security-scan     # Check security
# Then re-commit with fixes
git add -A
git commit --amend --no-verify
```

## Recovery Procedures

If something goes wrong:

```bash
# Option A: Recover from backup branch
git reset --hard backup/pre-consolidation-YYYYMMDD-HHMMSS

# Option B: Use reflog to find previous state
git reflog -20
git reset --hard <reflog-entry>

# Option C: Cherry-pick from backup
git cherry-pick backup/pre-consolidation-YYYYMMDD-HHMMSS
```

## Example Session

```bash
# 1. Check current state
git log --oneline -10

# 2. Create backup
git branch backup/pre-consolidation-$(date +%Y%m%d-%H%M%S)

# 3. Run quality validation BEFORE squashing
make pre-push

# 4. Soft reset to target
git reset --soft 27d3467

# 5. Create commit
cat > /tmp/msg.txt << 'EOF'
feat: implement comprehensive feature with detailed subsystems

🎯 Changes:
- Major component A with specific capabilities
- Integration layer B with external systems
- Testing infrastructure achieving X% coverage

📊 Coverage: X% (meets phase requirements)
🛡️ Security: Zero vulnerabilities detected

Generated by Nova Prime ([Cursor](https://cursor.com)) under supervision of [@3leapsdave](https://github.com/3leapsdave)

Co-Authored-By: Nova Prime <noreply@lanytehq.dev>
Authored-By: Dave Thompson <dave.thompson@3leaps.net> [@3leapsdave](https://github.com/3leapsdave)
EOF

git add -A
git commit -F /tmp/msg.txt

# 6. Verify
git log --oneline -3
```

## References

- [Git Documentation - Rewriting History](https://git-scm.com/book/en/v2/Git-Tools-Rewriting-History)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [Lanyte Agentic Attribution Standard](../standards/agentic-attribution.md)
- [Lanyte Repository Operations SOP](repository-operations-sop.md)
