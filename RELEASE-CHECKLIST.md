# Brooklyn MCP Release Checklist

**Project**: Brooklyn MCP - Enterprise Browser Automation Platform  
**Current Target**: v0.2.2-rc.12  
**Release Type**: Release Candidate  
**Governance**: Fulmen Ecosystem Standards

---

## 🚨 CRITICAL: Repository State Validation

**MANDATORY before any release operations - This prevents release contamination**

### Clean Working Tree Enforcement ✅

- [ ] **Repository State Clean**: `bun run validate:clean-working-tree:strict` passes
- [ ] **No Uncommitted Changes**: All modifications committed with proper attribution
- [ ] **Version Artifacts Handled**: Version embedding artifacts properly committed
- [ ] **Quality Gates Verified**: All prepush validations complete

**What this prevents:**

- ❌ Version embedding artifacts left uncommitted (like our rc.11 incident)
- ❌ Partial changes pushed to release branches
- ❌ Repository state divergence from origin
- ❌ Failed CI/CD pipelines due to dirty working tree

**If validation fails:**

1. Review validation output for specific issues
2. Use `bun run version:commit` for automated version artifact handling
3. Stage and commit any remaining changes with proper attribution
4. Re-run `bun run validate:clean-working-tree:strict` until clean
5. Only proceed when validation passes

---

## Pre-Release Preparation

### Code Quality ✅

- [ ] **Tests Passing**: All test suites pass (`bun run test`)
- [ ] **Code Formatting**: Code properly formatted (`bun run format:code`)
- [ ] **Linting**: No linting violations (`bun run lint`)
- [ ] **Type Checking**: No TypeScript errors (`bun run typecheck`)
- [ ] **Build Success**: Project builds without errors (`bun run build`)
- [ ] **MCP Schema Compliance**: Protocol compliance validated (`bun run check:mcp-schema`)
- [ ] **Clean Working Tree**: Repository ready for release (`bun run validate:clean-working-tree:strict`)

### Version Management ✅

- [ ] **Version Updated**: VERSION file contains target version (0.2.2-rc.12)
- [ ] **Package.json Sync**: package.json version matches VERSION file
- [ ] **Changelog Updated**: CHANGELOG.md reflects all rc.12 changes
- [ ] **Version Workflow Complete**: `bun run version:commit` executed successfully
- [ ] **Artifacts Committed**: All version embedding changes properly committed
- [ ] **Working Tree Clean**: No uncommitted version artifacts remain

### Cross-Platform Builds ✅

- [ ] **All Target Platforms**: Builds successful for all supported targets
  - [ ] **Linux AMD64**: Binary builds and functions correctly
  - [ ] **Linux ARM64**: Binary builds and functions correctly
  - [ ] **macOS AMD64**: Binary builds and functions correctly
  - [ ] **macOS ARM64**: Binary builds and functions correctly
  - [ ] **Windows AMD64**: Binary builds and functions correctly
  - [ ] **Windows ARM64**: Binary builds and functions correctly
- [ ] **Binary Testing**: All platform binaries functional on target systems
- [ ] **Binary Size**: Reasonable size (< 15MB each, target: ~12MB)
- [ ] **Distribution Optimization**: No browser binaries included in distribution

### Brooklyn MCP Specific ✅

- [ ] **MCP Server Functional**: `brooklyn mcp start` works correctly on all platforms
- [ ] **Tool Discovery**: All 50+ MCP tools discoverable and functional
- [ ] **Claude Code Integration**: Compatible with Claude Code MCP client
- [ ] **Browser Automation**: Playwright integration works on all platforms
- [ ] **Domain Security**: Domain validation and team isolation functional
- [ ] **Resource Management**: Browser pool management working correctly

### Documentation ✅

- [ ] **README Current**: Installation and usage instructions updated
- [ ] **User Guide Complete**: All rc.12 features documented
- [ ] **MCP Tools Reference**: All MCP tools documented with examples
- [ ] **API Documentation**: Public APIs documented
- [ ] **Standards Current**: All development standards documents updated

### Licensing Compliance ✅

- [ ] **License Audit Clean**: `bun run license:scan:strict` passes (no GPL/LGPL/AGPL/MPL/CDDL)
- [ ] **Dependency Check**: All dependencies compatible with MIT license
- [ ] **Third-Party Notices**: License inventory updated (`dist/licenses/THIRD_PARTY_NOTICES.md`)
- [ ] **License Inventory**: Complete license JSON generated (`dist/licenses/licenses.json`)

---

## Release Execution

### Pre-Release Validation Gates ✅

**Run these commands in sequence - all must pass:**

```bash
# Repository state validation (CRITICAL - run first)
bun run validate:clean-working-tree:strict

# Quality validation
bun run test                              # All tests pass
bun run check-all                        # All quality gates pass
bun run typecheck                        # TypeScript compilation clean
bun run lint                             # Linting clean
bun run format:code                      # Code formatting clean

# Build validation (with 4-minute timeouts)
timeout 240 bun run build:all            # Cross-platform builds
timeout 240 bun run package:all          # Distribution artifacts
bun run license:scan:strict              # License compliance

# Final validation
bun run validate:clean-working-tree:strict # Ensure still clean after builds
```

**Validation Requirements:**

- [ ] **Repository Clean**: Working tree clean before and after all operations
- [ ] **All Platforms Build**: Successful builds for all 6 target platforms
- [ ] **Packaging Success**: Distribution artifacts created successfully
- [ ] **License Compliance**: Strict license scan passes
- [ ] **Quality Gates**: All automated checks pass with 4-minute timeout support
- [ ] **Final State Clean**: Repository remains clean throughout entire process

### Git Operations ✅

**Version Tagging and Push (with timeouts):**

```bash
# Verify clean state one final time
bun run validate:clean-working-tree:strict

# Create annotated release tag (4-minute timeout)
export VERSION="0.2.2-rc.12"
timeout 240 git tag -a v$VERSION -m "Brooklyn MCP v$VERSION

🌉 Brooklyn MCP Release Candidate 12

✨ Features:
- Clean working tree validation prevents release contamination
- Automated version artifact commit workflow
- Enhanced prepush validation with strict repository state checks
- Windows CI timeout fixes for HTTP transport layer
- Comprehensive release checklist compliance automation

🔧 Improvements:
- Zero-tolerance policy for uncommitted version artifacts
- 4-minute timeout support for all git operations
- Programmatic enforcement of release quality standards
- Automated detection and handling of repository state issues

📋 Quality Metrics:
- MCP Protocol: Full compliance with 50+ tools
- Cross-Platform: 6 target platforms validated
- License Compliance: MIT license with clean dependency audit
- Repository State: Guaranteed clean working tree

🚀 Ready for production deployment and final release preparation.

Generated by Paris Brooklyn ([Claude Code](https://claude.ai/code)) under supervision of [@3leapsdave](https://github.com/3leapsdave)"

# Push tag to remote (4-minute timeout)
timeout 240 git push origin v$VERSION

# Push commits if not already pushed (4-minute timeout)
timeout 240 git push origin main
```

**Git Validation Requirements:**

- [ ] **Tag Created**: Annotated tag v0.2.2-rc.12 created successfully
- [ ] **Tag Pushed**: Tag successfully pushed to origin
- [ ] **Commits Pushed**: All commits successfully pushed to origin
- [ ] **Repository Sync**: Local and remote repositories in sync
- [ ] **No Timeouts**: All git operations complete within 4-minute timeouts

### GitHub Release ✅

- [ ] **Release Created**: New GitHub release created for v0.2.2-rc.12
- [ ] **Tag Selected**: Correct version tag selected (v0.2.2-rc.12)
- [ ] **Release Title**: "Brooklyn MCP v0.2.2-rc.12"
- [ ] **Release Notes**: Comprehensive changelog from tag message
- [ ] **Binaries Attached**: All 6 platform binaries uploaded
- [ ] **Checksums Included**: SHA256SUMS files for all platforms
- [ ] **License Notices**: THIRD_PARTY_NOTICES.md attached
- [ ] **Pre-release Flag**: Marked as pre-release (RC status)

---

## Post-Release Validation

### Distribution Verification ✅

- [ ] **GitHub Downloads**: All binaries downloadable from release page
- [ ] **Cross-Platform Testing**: Binaries verified on target platforms
- [ ] **Installation Methods**: Both GitHub releases and manual installation work
- [ ] **File Integrity**: SHA256 checksums verify correctly
- [ ] **Size Validation**: All binaries under size limits (<15MB each)

### MCP Integration Testing ✅

- [ ] **MCP Server Startup**: `brooklyn mcp start` works on all platforms
- [ ] **Tool Discovery**: All MCP tools discoverable by clients
- [ ] **Claude Code Integration**: Successfully integrates with Claude Code
- [ ] **Protocol Compliance**: Full MCP protocol compliance verified
- [ ] **Cross-Platform MCP**: MCP server functional on all target platforms

### Community & Communication ✅

- [ ] **Release Announced**: Relevant channels notified of rc.12 availability
- [ ] **Documentation Links**: Installation docs point to correct release
- [ ] **Issue Monitoring**: No critical issues reported from release
- [ ] **MCP Ecosystem**: Compatible with other MCP ecosystem tools

---

## Brooklyn-Specific Quality Standards

### Minimum Requirements for RC Release

- [ ] **Test Coverage**: >70% line coverage maintained
- [ ] **MCP Tools**: All 50+ tools fully functional and tested
- [ ] **Browser Automation**: Playwright integration stable across platforms
- [ ] **Security Validation**: Domain allowlists and rate limiting functional
- [ ] **Resource Management**: Browser pool management working correctly
- [ ] **Multi-Team Support**: Team isolation and configuration management working

### Success Metrics

- [ ] **Installation Success**: >95% successful installations across platforms
- [ ] **MCP Integration**: Seamless Claude Code integration
- [ ] **Performance**: No significant performance regressions from previous RC
- [ ] **Compatibility**: Backward compatibility maintained for configurations
- [ ] **Stability**: No critical bugs or crashes in core functionality

---

## Emergency Procedures

### Rollback Plan

If critical issues are discovered after release:

```bash
# Delete tag locally and remotely (4-minute timeouts)
timeout 240 git tag -d v0.2.2-rc.12
timeout 240 git push origin :refs/tags/v0.2.2-rc.12

# Delete GitHub release
# (Manual process through GitHub UI or gh CLI)

# Revert version if needed
bun run version:set 0.2.2-rc.11
bun run version:commit

# Communicate rollback
# Notify all stakeholders of rollback and reasons
```

### Recovery Checklist

- [ ] **Repository State**: Local and remote repositories cleaned up
- [ ] **Tag Cleanup**: Rolled-back tags removed from all locations
- [ ] **Team Notification**: All stakeholders informed of rollback
- [ ] **Issue Tracking**: Rollback reasons documented in issues
- [ ] **Next Steps**: Plan for addressing rollback reasons documented

---

## Release Command Sequence

**Complete release workflow for Brooklyn MCP v0.2.2-rc.12:**

```bash
# 1. Repository state validation (CRITICAL)
bun run validate:clean-working-tree:strict

# 2. Version management (if not already done)
export VERSION="0.2.2-rc.12"
bun run version:set $VERSION
bun run version:commit
bun run validate:clean-working-tree:strict

# 3. Quality validation
bun run test
bun run check-all
bun run typecheck
bun run lint

# 4. Build and package (with timeouts)
timeout 240 bun run build:all
timeout 240 bun run package:all
bun run license:scan:strict

# 5. Final validation
bun run validate:clean-working-tree:strict

# 6. Tag and push (with timeouts)
timeout 240 git tag -a v$VERSION -m "Brooklyn MCP v$VERSION - [Release Notes]"
timeout 240 git push origin v$VERSION
timeout 240 git push origin main

# 7. Create GitHub release with binaries
# (Manual process or automation script)

# 8. Verify and communicate
# Test downloads, verify functionality, announce availability
```

---

## Automation Integration

### Current Automation ✅

- [ ] **Clean Working Tree Validation**: `scripts/validate-clean-working-tree.ts` functional
- [ ] **Version Commit Workflow**: `scripts/version-commit.ts` functional
- [ ] **Build Pipeline**: `scripts/build-with-signature.ts` functional
- [ ] **License Scanner**: `scripts/compliance/license-scan.ts` functional
- [ ] **Quality Gates**: Comprehensive test and validation suite
- [ ] **4-Minute Timeouts**: All git operations support timeout configuration

### Future Automation Targets

- [ ] **GitHub Release Creation**: Automate release creation with binaries
- [ ] **Cross-Platform Testing**: Automated testing on all target platforms
- [ ] **MCP Protocol Validation**: Automated MCP compliance testing
- [ ] **Integration Testing**: Automated Claude Code integration testing

---

## Contact Information

### Release Team

- **Release Manager**: @3leapsdave
- **Integration Lead**: Paris Brooklyn (AI Co-Maintainer)
- **Platform Lead**: Architect Brooklyn (AI Co-Maintainer)

### Emergency Contacts

- **Critical Issues**: GitHub Issues (https://github.com/fulmenhq/brooklyn-mcp/issues)
- **Security Issues**: security@fulmenhq.dev
- **Release Coordination**: Direct team communication channels

---

**Release Checklist Version**: 2.0 (Updated for Brooklyn MCP v0.2.2-rc.12)  
**Last Updated**: 2025-09-12  
**Next Review**: After rc.12 release completion  
**Based On**: Fulmen Ecosystem Release Standards
