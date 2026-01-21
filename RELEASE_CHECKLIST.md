# Brooklyn MCP Release Checklist

Standard release procedures for Brooklyn MCP, following FulmenHQ ecosystem patterns.

**Project**: Brooklyn MCP - Enterprise Browser Automation Platform
**Current Release**: See `VERSION` file
**Governance**: FulmenHQ Ecosystem Standards

---

## Release Workflow Philosophy

**Always use `make` targets** instead of standalone commands. The Makefile orchestrates complex workflows, ensures proper sequencing, and maintains consistency across development and CI/CD environments.

**Git hooks delegate to `make`**: Pre-commit and pre-push hooks invoke make targets (not direct tool invocations), ensuring developer workflows match CI validation.

**Manual signing by design**: Release signing happens locally after CI builds, ensuring cryptographic keys never touch CI infrastructure.

---

## Pre-Release Preparation

### Code Quality

- [ ] **Tests Passing**: `make test`
- [ ] **Code Formatting**: `make fmt`
- [ ] **Linting**: `make lint`
- [ ] **Type Checking**: `make typecheck`
- [ ] **Build Success**: `make build`
- [ ] **All Quality Gates**: `make check-all`

### Version Management

- [ ] **VERSION Updated**: VERSION file contains target version
- [ ] **Package.json Sync**: package.json version matches VERSION
- [ ] **Changelog Updated**: CHANGELOG.md reflects all changes
- [ ] **Release Notes**: docs/releases/v<version>.md created

### Cross-Platform Builds

- [ ] **All Platforms Build**: `make build-all` produces binaries for:
  - Linux AMD64/ARM64
  - macOS AMD64/ARM64
  - Windows AMD64/ARM64
- [ ] **Binary Size**: Reasonable size (< 15MB each, target: ~12MB)
- [ ] **Distribution Optimization**: No browser binaries included

### Documentation

- [ ] **README Updated**: Installation and usage instructions current
- [ ] **User Guide**: All features documented
- [ ] **MCP Tools**: All 79 tools documented with examples
- [ ] **Release Notes**: docs/releases/v<version>.md complete

### Licensing Compliance

- [ ] **License Audit**: `bun run license:scan:strict` passes
- [ ] **No Forbidden Licenses**: GPL/LGPL/AGPL/MPL/CDDL excluded
- [ ] **Third-Party Notices**: Generated in dist/licenses/

---

## Release Execution

### Pre-Release Validation

```bash
# Full validation (run before tagging)
make prepush

# This internally runs:
#   - make check-all (format, typecheck, lint, test)
#   - goneat assess (if available)
#   - all quality gates
```

### Tagging

```bash
# 1. Ensure VERSION file is updated
cat VERSION

# 2. Create annotated git tag
git tag -a v<version> -m "Release v<version>"

# 3. Push commits and tag
git push origin main
git push origin v<version>
```

### CI Pipeline (Automatic)

After pushing the tag, GitHub Actions will:

1. Validate release readiness
2. Build all platform binaries (cross-compilation on Ubuntu)
3. Generate license inventory
4. Create distribution archives
5. Upload to GitHub Release:
   - Binary archives (`.zip`, `.tar.gz`)
   - Checksums (`SHA256SUMS`, `SHA512SUMS`)
   - License files (`licenses.json`, `THIRD_PARTY_NOTICES.md`)
   - Release notes (`RELEASE.md`)

---

## Release Signing (Manual - Required)

**After CI completes**, sign the release artifacts locally:

### 1. Set Environment Variables

```bash
export BROOKLYN_RELEASE_TAG=v<version>

# Minisign (required)
export BROOKLYN_MINISIGN_KEY=$HOME/.minisign/fulmenhq-release.key
export BROOKLYN_MINISIGN_PUB=$HOME/.minisign/fulmenhq-release.pub

# PGP (optional but recommended)
export BROOKLYN_PGP_KEY_ID=security@fulmenhq.dev
export BROOKLYN_GPG_HOMEDIR=${GNUPGHOME:-$HOME/.gnupg}
```

### 2. Download CI Artifacts

```bash
make release-clean
BROOKLYN_RELEASE_TAG=$BROOKLYN_RELEASE_TAG make release-download
```

### 3. Verify and Sign

```bash
# Verify checksums match downloaded artifacts
BROOKLYN_RELEASE_TAG=$BROOKLYN_RELEASE_TAG make release-verify-checksums

# Sign manifests (minisign required, PGP optional)
# NOTE: On macOS with Ghostty terminal, you may need:
#   TERM=xterm-256color make release-sign
BROOKLYN_RELEASE_TAG=$BROOKLYN_RELEASE_TAG make release-sign

# Export public keys
BROOKLYN_RELEASE_TAG=$BROOKLYN_RELEASE_TAG make release-export-keys

# Verify exported keys are public-only (safety check before upload)
make release-verify-keys

# Verify signatures
BROOKLYN_RELEASE_TAG=$BROOKLYN_RELEASE_TAG make release-verify-signatures
```

### 4. Copy Release Notes

```bash
# Copy docs/releases/v<version>.md to dist/release (not signed, documentation only)
BROOKLYN_RELEASE_TAG=$BROOKLYN_RELEASE_TAG make release-notes
```

### 5. Upload Provenance

```bash
BROOKLYN_RELEASE_TAG=$BROOKLYN_RELEASE_TAG make release-upload
```

### Signing Workflow One-Liner

```bash
export BROOKLYN_RELEASE_TAG=v<version>
export BROOKLYN_MINISIGN_KEY=$HOME/.minisign/fulmenhq-release.key
make release-clean && \
  BROOKLYN_RELEASE_TAG=$BROOKLYN_RELEASE_TAG make release-download && \
  BROOKLYN_RELEASE_TAG=$BROOKLYN_RELEASE_TAG make release-sign && \
  make release-export-keys release-verify-keys && \
  BROOKLYN_RELEASE_TAG=$BROOKLYN_RELEASE_TAG make release-notes && \
  BROOKLYN_RELEASE_TAG=$BROOKLYN_RELEASE_TAG make release-upload
```

> **Ghostty Terminal Note**: If minisign prompts fail on macOS with Ghostty,
> prefix the signing command with `TERM=xterm-256color`.

---

## Post-Release Validation

### Distribution Verification

- [ ] **GitHub Downloads**: All binaries downloadable from release page
- [ ] **Checksums Verify**: `shasum -a 256 -c SHA256SUMS`
- [ ] **Signatures Verify**:

  ```bash
  # Minisign
  minisign -Vm SHA256SUMS -p fulmenhq-release-minisign.pub

  # GPG
  gpg --import fulmenhq-release-signing-key.asc
  gpg --verify SHA256SUMS.asc SHA256SUMS
  ```

### MCP Integration Testing

- [ ] **MCP Server Startup**: `brooklyn mcp start` works
- [ ] **Tool Discovery**: All 79 MCP tools discoverable
- [ ] **Claude Code Integration**: Successfully integrates with Claude Code
- [ ] **Cross-Platform**: MCP server works on all target platforms

### Communication

- [ ] **Release Announced**: Relevant channels notified
- [ ] **Documentation Updated**: Installation docs point to correct release
- [ ] **Issue Monitoring**: No critical issues reported

---

## Verifying Signed Releases (For Users)

Users can verify release authenticity:

```bash
VERSION=v0.3.0

# Download verification files
curl -LO "https://github.com/fulmenhq/brooklyn-mcp/releases/download/${VERSION}/SHA256SUMS"
curl -LO "https://github.com/fulmenhq/brooklyn-mcp/releases/download/${VERSION}/SHA256SUMS.minisig"
curl -LO "https://github.com/fulmenhq/brooklyn-mcp/releases/download/${VERSION}/fulmenhq-release-minisign.pub"

# Verify minisign signature
minisign -Vm SHA256SUMS -p fulmenhq-release-minisign.pub

# Verify checksums
shasum -a 256 -c SHA256SUMS
```

For GPG verification:

```bash
curl -LO "https://github.com/fulmenhq/brooklyn-mcp/releases/download/${VERSION}/SHA256SUMS.asc"
curl -LO "https://github.com/fulmenhq/brooklyn-mcp/releases/download/${VERSION}/fulmenhq-release-signing-key.asc"

gpg --import fulmenhq-release-signing-key.asc
gpg --verify SHA256SUMS.asc SHA256SUMS
```

---

## Emergency Procedures

### Rollback Plan

```bash
# Delete tag locally and remotely
git tag -d v<version>
git push origin :refs/tags/v<version>

# Delete GitHub release (via UI or gh CLI)
gh release delete v<version> --repo fulmenhq/brooklyn-mcp --yes

# Revert VERSION if needed
echo "previous-version" > VERSION
```

### Recovery Checklist

- [ ] **Repository State**: Local and remote repos in sync
- [ ] **Tag Cleanup**: Rolled-back tags removed
- [ ] **Team Notification**: All stakeholders informed
- [ ] **Issue Tracking**: Rollback reasons documented

---

## Quality Gates

### Minimum Requirements

- [ ] **Test Coverage**: > 70% for new code
- [ ] **Zero Critical Issues**: No blocking bugs
- [ ] **Documentation Complete**: All features documented
- [ ] **Cross-Platform Verified**: All target platforms tested
- [ ] **MCP Compliance**: Full MCP protocol compliance
- [ ] **License Clean**: No incompatible licenses

### Success Metrics

- **Installation Success**: > 95% successful installations
- **MCP Integration**: Seamless Claude Code integration
- **Performance**: No significant regressions
- **Compatibility**: Backward compatibility maintained
- **Binary Size**: < 15MB per platform binary

---

## Release Assets Summary

After a complete release (CI + signing), the GitHub Release should contain:

**Binaries** (12 files):

- `brooklyn-{darwin,linux,windows}-{amd64,arm64}.{tar.gz,zip}`

**Checksums** (2 files):

- `SHA256SUMS`
- `SHA512SUMS`

**Signatures** (4 files):

- `SHA256SUMS.minisig`, `SHA256SUMS.asc`
- `SHA512SUMS.minisig`, `SHA512SUMS.asc`

**Public Keys** (2 files):

- `fulmenhq-release-minisign.pub`
- `fulmenhq-release-signing-key.asc`

**Licenses** (2 files):

- `licenses.json`
- `THIRD_PARTY_NOTICES.md`

**Release Notes** (2 files):

- `RELEASE.md` (CI-generated)
- `release-notes-v<version>.md` (copied from docs/releases/)

**Total**: 24 files for a fully signed release

---

## Contact Information

### For Release Issues

- **Primary**: GitHub Issues (https://github.com/fulmenhq/brooklyn-mcp/issues)
- **Security**: security@fulmenhq.dev
- **Urgent**: Direct team communication

### Release Coordination

- **Release Manager**: @3leapsdave
- **AI Co-Maintainers**: Architect Brooklyn, Paris Brooklyn

---

**Document Version**: 3.1 (FulmenHQ Signing Pattern)
**Last Updated**: 2026-01-21
**Next Review**: With each major release or significant process change
