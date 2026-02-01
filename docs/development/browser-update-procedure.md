# Browser Update Procedure

This document describes how to update Playwright browsers in Brooklyn MCP and avoid version drift issues.

## Overview

Brooklyn uses Playwright for browser automation. Playwright bundles specific browser revisions that must be installed to match the package version. Version mismatches cause runtime errors like:

```
Executable doesn't exist at /path/to/ms-playwright/chromium_headless_shell-1208/...
```

## Quick Reference

| Task                         | Command                                                       |
| ---------------------------- | ------------------------------------------------------------- |
| Check installed versions     | `brooklyn browser info`                                       |
| Validate version consistency | `bun run test tests/unit/browser-version-consistency.test.ts` |
| Install/update browsers      | `bunx playwright install --force`                             |
| Update Playwright package    | `bun update playwright playwright-core`                       |

## Version Components

| Component          | Location                                                                       | Purpose                                     |
| ------------------ | ------------------------------------------------------------------------------ | ------------------------------------------- |
| Playwright package | `package.json`                                                                 | Defines expected browser revisions          |
| Lock file          | `bun.lock`                                                                     | Pins exact Playwright version               |
| browsers.json      | `node_modules/playwright-core/browsers.json`                                   | Maps Playwright version → browser revisions |
| Browser cache      | `~/.cache/ms-playwright/` (Linux) or `~/Library/Caches/ms-playwright/` (macOS) | Installed browser binaries                  |

## Common Scenarios

### Scenario 1: Fresh Clone / CI Environment

```bash
bun install --frozen-lockfile
bunx playwright install chromium --force
```

The `--force` flag ensures browsers are downloaded even if a cache exists.

### Scenario 2: Upgrading Playwright

1. **Update the package**:

   ```bash
   bun update playwright playwright-core
   ```

2. **Check what changed**:

   ```bash
   cat node_modules/playwright-core/browsers.json | jq '.browsers[] | select(.installByDefault) | {name, revision}'
   ```

3. **Install new browser versions**:

   ```bash
   bunx playwright install --force
   ```

4. **Verify**:

   ```bash
   brooklyn browser info
   bun run test tests/unit/browser-version-consistency.test.ts
   ```

5. **Commit lock file**:
   ```bash
   git add bun.lock
   git commit -m "chore(deps): update playwright to X.Y.Z"
   ```

### Scenario 3: Version Mismatch Error

If you see an error about missing browser executable with a specific revision:

1. **Check expected vs installed**:

   ```bash
   # Expected (from Playwright)
   cat node_modules/playwright-core/browsers.json | jq '.browsers[] | select(.name=="chromium") | .revision'

   # Installed
   ls ~/Library/Caches/ms-playwright/ | grep chromium
   ```

2. **Reinstall browsers**:

   ```bash
   bunx playwright install --force
   ```

3. **If using Docker/CI**, ensure the cache isn't stale (see CI section).

## CI/CD Considerations

### Cache Key Strategy

The CI workflow uses `hashFiles('bun.lock')` as part of the cache key:

```yaml
- name: Cache Playwright browsers
  uses: actions/cache@v4
  with:
    path: ~/.cache/ms-playwright
    key: playwright-${{ runner.os }}-${{ hashFiles('bun.lock') }}
    restore-keys: |
      playwright-${{ runner.os }}-
```

**Important**: The `restore-keys` fallback can restore stale caches when Playwright is updated. The workflow includes `--force` on install to mitigate this:

```yaml
- name: Install Chromium (Playwright + OS deps)
  run: bunx playwright install --with-deps chromium --force
```

### Docker Images

For Brooklyn's CI Docker image (`Dockerfile.local-ci`), browsers are baked in:

```dockerfile
RUN bunx playwright install --with-deps chromium
```

When updating Playwright, rebuild the Docker image:

```bash
docker build -f Dockerfile.local-ci -t brooklyn-ci:latest .
```

## Validation Tests

The test suite includes browser version consistency checks:

```bash
# Run version validation tests
bun run test tests/unit/browser-version-consistency.test.ts

# Run all browser-related tests
bun run test:integration:browser
```

These tests:

- Read expected revisions from `browsers.json`
- Compare against installed revisions in the Playwright cache
- Report mismatches with actionable fix commands

## Troubleshooting

### "Browser executable not found"

**Symptoms**:

```
Error: Failed to launch chromium: Executable doesn't exist at...
```

**Fix**:

```bash
bunx playwright install --force
```

### Different revision numbers

**Symptoms**: brooklyn browser info shows revision 1200, but error mentions 1208

**Cause**: Playwright package was updated but browsers weren't reinstalled

**Fix**:

```bash
bun install --frozen-lockfile  # Ensure correct Playwright version
bunx playwright install --force
```

### CI cache issues

**Symptoms**: Tests pass locally but fail in CI with browser errors

**Cause**: Stale CI cache with old browser revisions

**Fix**:

1. Clear GitHub Actions cache for `playwright-*` keys
2. Or bump cache key version in workflow

### Multiple Playwright versions

**Symptoms**: Different projects have different Playwright versions

**Note**: Playwright cache is shared globally. If you work on multiple projects:

- Each project should use `--force` when installing
- Consider using `PLAYWRIGHT_BROWSERS_PATH` to isolate caches

## Reference

- [Playwright Browser Installation](https://playwright.dev/docs/browsers)
- [Brooklyn CI Workflow](.github/workflows/ci.yml)
- [Browser Version Consistency Test](tests/unit/browser-version-consistency.test.ts)
