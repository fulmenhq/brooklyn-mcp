# Brooklyn Integration Test Guide

This guide helps you run Brooklyn's integration tests successfully, distinguishing between environment issues and actual test failures.

## Quick Start

### First Time Setup

```bash
# Prepare your environment for integration tests
bun run test:integration:prep

# Run integration tests
bun run test:integration

# Or combine both steps
bun run test:all:with-prep
```

### Environment Verification

Check if your environment is ready without making changes:

```bash
bun run test:integration:check
```

Expected output when ready:

```
🔍 Environment Status

✅ Playwright browsers: Installed
   All browsers installed (chromium, firefox, webkit)
✅ Brooklyn processes: None running
✅ Required ports: Available

✅ Environment: Ready for integration tests
```

## Test Categories

### Unit Tests (Fast, No Dependencies)

```bash
bun run test:unit
```

- ✅ No browser installation required
- ✅ No external dependencies
- ✅ Run in pre-commit hooks

### Integration Tests (Require Browsers)

```bash
# With automatic preparation
bun run test:integration:with-prep

# Without preparation (if already set up)
bun run test:integration
```

#### Integration Test Subcategories:

- **Mock Integration**: `bun run test:integration:mock` - No real browsers needed
- **Browser Integration**: `bun run test:integration:browser` - Requires Playwright browsers
- **Process Integration**: `bun run test:integration:process` - Tests process management

### E2E Tests (Currently Skipped)

```bash
bun run test:e2e
```

- Skipped pending enterprise browser infrastructure implementation

## Troubleshooting

### Common Issues and Solutions

#### "Browser not found" or "Failed to launch browser"

**Problem**: Playwright browsers are not installed.

**Solution**:

```bash
# Run the preparation script
bun run test:integration:prep

# Or install browsers manually
bun run setup:browsers
```

#### "Browser session already exists" or Similar Process Errors

**Problem**: Brooklyn processes are already running.

**Solution**:

```bash
# Check for running processes
brooklyn status

# Clean up all Brooklyn processes
brooklyn mcp cleanup

# Or use the prep script
bun run test:integration:prep
```

#### "Port 3000 already in use"

**Problem**: Another service is using a required port.

**Solution**:

```bash
# Find what's using port 3000
lsof -i :3000

# Kill the process or stop the service
kill -9 <PID>
```

#### Test Timeouts

**Problem**: Tests fail with timeout errors on slower machines.

**Solution**: Increase test timeouts in your test files or vitest config.

### Understanding Test Failures

#### Environment Failures vs Code Failures

**Environment Failure Indicators**:

- "Cannot find module 'playwright'"
- "Browser executable not found"
- "Failed to launch browser"
- "Port already in use"
- Process-related errors

**Code Failure Indicators**:

- Assertion errors (expected X but got Y)
- Type errors in test execution
- Logic errors in test scenarios
- API response mismatches

## CI/CD Integration

The same commands work in both local and CI environments. In addition, Brooklyn's release pipeline uses `release:validate` as the comprehensive quality gate before building and publishing artifacts.

```yaml
# GitHub Actions example
- name: Prepare and run integration tests
  run: bun run test:integration:with-prep

# Or separate steps
- name: Setup browsers
  run: bun run setup:browsers

- name: Run integration tests
  run: bun run test:integration

# Release validation (Ubuntu): format, typecheck, lint, tests, build, licenses, binaries
- name: Run release validation
  run: bun run release:validate
```

## Advanced Usage

### Selective Browser Installation

If you only need specific browsers:

```bash
# Install only Chromium
bunx playwright install chromium

# Install only Firefox
bunx playwright install firefox
```

### Browser Management

```bash
# Check installed browsers
brooklyn browser info

# Update browsers to latest versions
brooklyn browser update

# Clean browser cache
brooklyn browser clean
```

### Running Specific Test Suites

```bash
# Run only browser-based integration tests
bun run test:integration:browser

# Run only process-based integration tests
bun run test:integration:process

# Run tests matching a pattern
bun run test -- browser-router
```

## Best Practices

1. **Use Preparation Scripts**: Always use `test:integration:with-prep` for first-time runs
2. **Check Before Running**: Use `test:integration:check` to verify environment
3. **Clean Environment**: Ensure no Brooklyn processes are running before tests
4. **Isolate Failures**: Run unit tests first to isolate integration issues
5. **CI Parity**: Use the same commands locally and in CI

## Environment Variables

Useful environment variables for testing:

```bash
# Skip browser installation prompts
PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 bun run test

# Use specific browser versions
PLAYWRIGHT_CHROMIUM_VERSION=latest bun run test

# Enable debug logging
DEBUG=pw:api bun run test:integration:browser
```

## Quick Reference

| Command                              | Purpose               | Requirements       |
| ------------------------------------ | --------------------- | ------------------ |
| `bun run test:unit`                  | Fast unit tests       | None               |
| `bun run test:integration:check`     | Check environment     | None               |
| `bun run test:integration:prep`      | Prepare environment   | None               |
| `bun run test:integration`           | Run integration tests | Browsers installed |
| `bun run test:integration:with-prep` | Prep + run tests      | None               |
| `bun run test:all:with-prep`         | Prep + all tests      | None               |
| `brooklyn mcp cleanup`               | Clean processes       | None               |
| `brooklyn browser info`              | Check browsers        | None               |

## Getting Help

If you encounter issues not covered here:

1. Check the [Brooklyn documentation](../README.md)
2. Review [BROOKLYN-SAFETY-PROTOCOLS.md](../../BROOKLYN-SAFETY-PROTOCOLS.md)
3. Ask in the team chat with error details
4. File an issue with reproduction steps

Remember: Integration tests require a properly configured environment. When in doubt, run the preparation script!
