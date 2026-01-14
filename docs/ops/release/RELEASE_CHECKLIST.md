# Brooklyn MCP Release Checklist

> **📋 Reference Copy** - This is a reference copy of the release checklist.  
> **🔗 Authority**: See `RELEASE_CHECKLIST.md` in the project root for the authoritative version.

This checklist ensures all requirements are met before releasing Brooklyn MCP to the public. Based on the goneat release template and adapted for Brooklyn's specific needs.

---

**⚠️ IMPORTANT**: Always refer to the top-level `RELEASE_CHECKLIST.md` for the most current version. This file may be embedded in documentation or binaries and should not be edited directly.

## Pre-Release Preparation

### Code Quality ✅

- [ ] **Tests Passing**: All tests pass (`bun run test`)
- [ ] **Code Formatting**: Code properly formatted (`bun run format:code`)
- [ ] **Linting**: No linting issues (`bun run lint`)
- [ ] **Type Checking**: No TypeScript errors (`bun run typecheck`)
- [ ] **Build Success**: Project builds without errors (`bun run build`)
- [ ] **MCP Schema Compliance**: MCP protocol compliance validated (`bun run check:mcp-schema`)

### Version Management ✅

- [ ] **Version Updated**: VERSION file contains correct version
- [ ] **Package.json**: package.json version matches VERSION file
- [ ] **Changelog Updated**: CHANGELOG.md reflects all changes
- [ ] **Embedded Version**: Binary embeds correct version info (`bun run version:embed`)

### Cross-Platform Builds ✅

- [ ] **All Platforms**: Build successful for all supported targets
  - [ ] Linux AMD64
  - [ ] Linux ARM64
  - [ ] macOS AMD64
  - [ ] macOS ARM64
  - [ ] Windows AMD64
  - [ ] Windows ARM64
- [ ] **Binary Testing**: All binaries functional on target platforms
- [ ] **Binary Size**: Reasonable size (< 15MB each, target: ~12MB)
- [ ] **Distribution Optimization**: No browser binaries included (`bun run optimize-distribution`)

### Documentation ✅

- [ ] **README Updated**: Installation and usage instructions current
- [ ] **User Guide**: Complete for all features
- [ ] **API Documentation**: All MCP tools documented
- [ ] **Standards**: All standards documents current
- [ ] **Lifecycle Phase**: LIFECYCLE_PHASE and RELEASE_PHASE files updated

### Licensing Compliance ✅

- [ ] **License Audit**: `bun run license:scan` passes (no GPL/LGPL/AGPL/MPL/CDDL)
- [ ] **Strict Policy**: `bun run license:scan:strict` passes for GA release
- [ ] **Inventory Updated**: `dist/licenses/licenses.json` generated
- [ ] **License Texts Saved**: `dist/licenses/THIRD_PARTY_NOTICES.md` updated
- [ ] **Third-Party Notices**: Attached to GitHub release

## Release Execution

### Git Operations ✅

- [ ] **Version Commit**: Version update committed with proper attribution
- [ ] **Git Tag**: Annotated tag created (`git tag -a v0.2.2`)
- [ ] **Primary Push**: Pushed to GitHub (`git push origin v0.2.2`)

### Pre-Release Validation Gates ✅

- [ ] **Build All Success**: `bun run build:all` produces binaries for all platforms
- [ ] **Packaging Successful**: `bun run package:all` creates distribution artifacts
- [ ] **License Audit Clean**: `bun run license:scan:strict` passes
- [ ] **Pre-push Gates**: All quality gates pass after build-all
- [ ] **Binary Verification**: All platform binaries functional
- [ ] **Size Validation**: Distribution size within targets

### GitHub Release ✅

- [ ] **Release Created**: New release on GitHub
- [ ] **Tag Selected**: Correct version tag (v0.2.2)
- [ ] **Title Formatted**: "Brooklyn MCP v0.2.2"
- [ ] **Release Notes**: Comprehensive changelog from CHANGELOG.md
- [ ] **Binaries Attached**: All platform binaries uploaded
- [ ] **Checksums Included**: SHA256SUMS files for all platforms
- [ ] **License Notices**: THIRD_PARTY_NOTICES.md attached

### MCP Protocol Verification ✅

- [ ] **MCP Server Functional**: `brooklyn mcp start` works correctly
- [ ] **Tool Discovery**: All 50+ MCP tools discoverable
- [ ] **Claude Integration**: Compatible with Claude Code integration
- [ ] **Cross-Platform**: MCP server works on all target platforms

## Post-Release Validation

### Distribution Channels ✅

- [ ] **GitHub Downloads**: All binaries downloadable
- [ ] **Cross-Platform**: Binaries work on target platforms
- [ ] **Installation**: `bun install` and manual installation work
- [ ] **MCP Integration**: Compatible with MCP clients

### Community & Communication ✅

- [ ] **Release Announced**: Relevant channels notified
- [ ] **Documentation**: Installation docs updated if needed
- [ ] **Issues Checked**: No critical issues from release
- [ ] **MCP Ecosystem**: Compatible with MCP ecosystem tools

## Emergency Procedures

### Rollback Plan

- [ ] **Tag Deletion**: `git tag -d v0.2.2 && git push origin :v0.2.2`
- [ ] **Release Deletion**: Delete GitHub release
- [ ] **Version Revert**: Update VERSION to previous version
- [ ] **Communication**: Notify users of rollback

### Recovery Checklist

- [ ] **Repository State**: Local and remote repos in sync
- [ ] **Team Notified**: All stakeholders informed
- [ ] **MCP Clients**: Notify MCP client users if needed

## Automation Status

### Current Automation ✅

- [ ] **Build Script**: `scripts/build-with-signature.ts` functional
- [ ] **Build All Script**: `scripts/build-all.ts` functional (to be created)
- [ ] **Package Script**: `scripts/package-all.ts` functional (to be created)
- [ ] **License Scanner**: `scripts/compliance/license-scan.ts` functional
- [ ] **Test Suite**: Automated test execution
- [ ] **GitHub Actions**: Automated builds and releases

### Future Automation 🎯

- [ ] **Release Automation**: Automated GitHub release creation
- [ ] **Binary Upload**: Automated asset uploads
- [ ] **Changelog Generation**: Automated from commits
- [ ] **MCP Validation**: Automated MCP protocol compliance

## Quality Gates

### Minimum Requirements

- [ ] **Test Coverage**: > 70% for new code
- [ ] **Zero Critical Issues**: No blocking bugs
- [ ] **Documentation Complete**: All features documented
- [ ] **Cross-Platform Verified**: All target platforms tested
- [ ] **MCP Compliance**: Full MCP protocol compliance
- [ ] **License Clean**: No incompatible licenses

### Success Metrics

- [ ] **Installation Success**: > 95% successful installations
- [ ] **MCP Integration**: Seamless Claude Code integration
- [ ] **Performance**: No significant performance regressions
- [ ] **Compatibility**: Backward compatibility maintained
- [ ] **Binary Size**: < 15MB per platform binary

## Release Scope Profiles

### Initial Public Release (v0.2.2)

- [ ] **Core MCP Tools Ready**: All 50+ MCP tools fully functional
- [ ] **Documentation Complete**: README, user guide, and tool reference cover all features
- [ ] **Test Suite Adequate**: Comprehensive test coverage across all modules
- [ ] **Cross-Platform Builds**: Successful builds for all target OS/arch combinations
- [ ] **MCP Protocol Compliance**: Full compliance with MCP specification
- [ ] **License Compliance**: Clean license audit with no incompatible dependencies

### Ongoing Releases

- [ ] **Breaking Changes Managed**: Major version bump when required
- [ ] **Deprecations Tracked**: Deprecation notices with timelines
- [ ] **Performance Benchmarks**: Include performance data for significant changes
- [ ] **MCP Evolution**: Track MCP protocol evolution and compatibility

## Release Command Sequence

```bash
# Pre-release preparation
bun run test                    # Run all tests
bun run check-all              # Run all quality gates
bun run build:all              # Build all platforms
bun run license:scan:strict    # Verify license compliance

# Version management
export VERSION="0.2.2"
bun run version:set $VERSION   # Update version
bun run version:embed          # Embed version in binary

# RC validation (do not tag until all pass)
bun run build:all              # Build platform binaries
bun run package:all            # Create distribution artifacts
bun run license:scan:strict    # Verify license compliance
bun run check-all              # Run all quality gates

# Tag/push only after above succeed
git tag -a v$VERSION -m "release: v$VERSION" && git push origin v$VERSION
```

## Commit Consolidation (Required before push)

Follow the Git Commit Consolidation SOP to squash work-in-progress commits into a single, clean commit using `git reset --soft` to the last pushed commit.

Reference: `docs/standards/git-squash-rebase-sop.md`

Quick flow:

```bash
# 0) Create a safety backup branch
git branch backup/pre-consolidation-$(date +%Y%m%d-%H%M%S)

# 1) Identify last pushed commit
LAST_PUSHED=$(git rev-parse --verify --quiet @{u} || git rev-parse --verify origin/main)

# 2) Soft reset to last pushed commit (keeps changes staged)
git reset --soft "$LAST_PUSHED"

# 3) Create consolidated commit (run gates first)
bun run check-all              # Run all quality gates
git add -A
git commit -m "<consolidated message with attribution>"
```

## Contact Information

### For Release Issues

- **Primary**: GitHub Issues
- **Urgent**: Direct team communication
- **Security**: security@3leaps.net

### Release Coordination

- **Release Manager**: @3leapsdave
- **AI Co-Maintainer**: Architect Brooklyn (Enterprise Infrastructure Lead)
- **MCP Specialist**: Paris Brooklyn (Platform & Integration Lead)
- **Documentation**: Technical writer
- **Testing**: QA team

---

**Release Checklist Version**: 1.0  
**Last Updated**: 2025-09-09  
**Next Review**: With each major release  
**Based On**: goneat RELEASE_CHECKLIST.md v1.0
