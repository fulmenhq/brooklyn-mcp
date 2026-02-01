# Publishing brooklyn-mcp

> **Quick Reference**: See [RELEASE_CHECKLIST.md](../RELEASE_CHECKLIST.md) at repo root for the condensed checklist.

This guide provides step-by-step instructions for publishing brooklyn-mcp to npm.

## Prerequisites

- npm account with publish access to the `brooklyn-mcp` package (or `@fulmenhq` scope if scoped)
- Clean working tree (`git status` reports no changes)
- All quality gates passing (`make quality` or `bun run check-all`)
- GitHub release created and signed

## Distribution Model

Brooklyn MCP has two distribution channels:

1. **GitHub Releases** (Primary): Pre-compiled binaries for all platforms
   - darwin-amd64, darwin-arm64
   - linux-amd64, linux-arm64
   - windows-amd64, windows-arm64
   - Signed with minisign + GPG

2. **npm Registry**: Source package for `bun run` execution
   - Allows `npx brooklyn-mcp` usage
   - Requires Bun runtime

## Publishing Workflow

### 1. Version Bump (if not already done)

```bash
# Update VERSION file
echo "X.Y.Z" > VERSION
bun run version:sync

# Update CHANGELOG.md and RELEASE_NOTES.md
# Commit changes
git add VERSION package.json CHANGELOG.md RELEASE_NOTES.md
git commit -m "chore: bump to vX.Y.Z"
```

### 2. Quality Gates

```bash
# Run all quality checks
bun run check-all

# Or individually:
bun run format
bun run typecheck
bun run lint
bun run test
```

### 3. GitHub Release (Binary Distribution)

```bash
# Tag and push
git tag -a vX.Y.Z -m "Release vX.Y.Z"
git push origin main
git push origin vX.Y.Z

# Wait for release workflow to create draft release
# Then sign and publish:
export BROOKLYN_RELEASE_TAG=vX.Y.Z
make release-download
make release-sign
make release-upload  # Signs and publishes the release
```

### 4. npm Dry-Run

Before publishing to npm, verify the package contents:

```bash
npm publish --dry-run
```

Check that:

- Only intended files are included (see `files` in package.json)
- Package size is reasonable
- No secrets or test fixtures included

### 5. Publish to npm

```bash
# For unscoped packages:
npm publish

# For scoped packages (@fulmenhq/brooklyn-mcp):
npm publish --access public
```

> **Note**: Scoped packages default to private. Always use `--access public` for public packages.

### 6. Post-Publish Verification

```bash
# Install and test the published package
npm install -g brooklyn-mcp@X.Y.Z
brooklyn --version
brooklyn --help

# Or test via npx
npx brooklyn-mcp@X.Y.Z --version
```

## Package Contents

The npm package includes (via `files` in package.json):

- `src/` - TypeScript source code
- `dist/` - Build artifacts (if present)
- `configs/` - Configuration files
- `schemas/` - JSON schemas
- `README.md` - Documentation
- `LICENSE` - MIT license
- `CHANGELOG.md` - Version history

## Troubleshooting

### `402 Payment Required`

Re-run with `--access public` for scoped packages.

### `npm ERR! private`

Remove `"private": true` from package.json.

### Package too large

Check `files` field in package.json. Run `npm pack` and inspect the tarball.

### Missing files in published package

Verify `files` array includes all necessary paths. Files in `.npmignore` or `.gitignore` may be excluded.

## Security Considerations

- Never publish with secrets in the package
- Verify no `.env` files or credentials are included
- Run `npm pack` and inspect contents before publishing
- Use `npm publish --dry-run` to preview

## Related Documentation

- [RELEASE_CHECKLIST.md](../RELEASE_CHECKLIST.md) - Condensed release checklist
- [GitHub Release Workflow](.github/workflows/release.yml) - Automated release process
- [Makefile Release Targets](../Makefile) - `release-*` targets for signing
