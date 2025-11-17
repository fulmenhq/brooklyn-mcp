# Brooklyn Testing Strategy & Implementation Guide

## Overview

Brooklyn uses a three-tier test strategy with a hybrid test runner approach to ensure fast developer feedback while maintaining comprehensive test coverage at scale. This guide explains our test categories, test runner selection, and when to use each approach for optimal scalability and coverage.

## Test Categories

### 1. Unit Tests (Pre-commit)

**Location**: `tests/unit/`  
**Run Time**: <5 seconds  
**Dependencies**: None  
**When to Run**: Every commit (automatically via git hook)

Unit tests validate isolated components without external dependencies:

- Business logic functions
- Data transformations
- Utility functions
- Mock-based component testing

**Examples**:

- `security-middleware.test.ts` - Security logic with mocked dependencies
- `screenshot-storage-manager.test.ts` - Storage logic with mocked filesystem
- `version-consistency.test.ts` - Version validation logic

### 2. Integration Tests (Pre-push/CI)

**Location**: `tests/integration/`  
**Run Time**: 10-30 seconds  
**Dependencies**: May require browsers, processes, or services  
**When to Run**: Before pushing, in CI pipeline

Integration tests validate component interactions:

#### Mock-Based Integration (Pre-commit eligible)

- Tests that use mocked external dependencies
- Example: `team-onboarding-functional.test.ts`

#### Browser-Dependent Integration (CI only)

- Require Playwright browsers installed
- Examples:
  - `browser-router-integration.test.ts`
  - `router-performance.test.ts`
  - `mcp-browser-e2e.test.ts`

#### Process-Dependent Integration (CI only)

- Spawn Brooklyn processes
- Examples:
  - `stdout-purity.test.ts`
  - `mcp-discovery-integration.test.ts`

### 3. E2E Tests (CI/Manual)

**Location**: `tests/e2e/`  
**Run Time**: 1-5 minutes  
**Dependencies**: Full system setup  
**When to Run**: CI pipeline, release validation

End-to-end tests validate complete user workflows:

- Full MCP protocol communication
- Claude Code integration scenarios
- Multi-team browser automation flows

**Example**: `mcp-protocol.test.ts` (currently skipped pending enterprise browser infrastructure)

## Test Scripts

### Quick Reference

```bash
# Developer Workflow
bun run test:unit                    # Unit tests only
bun run test:precommit               # Fast tests for commits
bun run test:prepush                 # Full test suite

# Specific Test Groups
bun run test:integration:mock        # Mock-based integration
bun run test:integration:browser     # Browser-dependent tests
bun run test:integration:process     # Process-dependent tests
bun run test:e2e                     # End-to-end tests

# CI Pipeline
bun run test:ci                      # Full suite with coverage
```

## Test Runner Strategy

Brooklyn uses a **hybrid test runner approach** to optimize for both scalability and comprehensive testing coverage:

### Vitest (Primary Test Runner)

**Used for**: All core tests, including unit tests, standard integration tests, and browser automation

Vitest is the **mandatory default** runner for anything that participates in quality gates:

- Pre-commit hooks
- Pre-push hooks
- CI pipelines (including `test:ci`)
- Release validation (`release:validate` and the GitHub Release workflow)

**Why Vitest**:

- **Parallel execution** with worker thread isolation (`pool: 'forks'`)
- **Excellent scalability** for large test suites (hundreds of tests)
- **Test isolation** prevents side effects between test suites
- **Mature ecosystem** with comprehensive tooling and coverage reporting
- **Fast watch mode** with hot module replacement (HMR)

**Configuration**:

```json
// vitest.config.ts
export default defineConfig({
  test: {
    pool: 'forks',      // Critical for scalability
    isolate: true,      // Prevent test interference
    coverage: {
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 70,
        statements: 70
      }
    }
  }
})
```

### Bun Test Runner (Strategic Integration Testing)

**Used for**: A small number of specialized tests requiring Bun-specific runtime APIs

**Why Bun Test**:

- **Native Bun API access** - can test `Bun.serve()`, `Bun.hash()`, HTTP server functionality
- **8x faster execution** than Vitest for runtime-specific operations
- **Production runtime alignment** - tests run in same environment as production

**When to Use Bun Test** (advanced/optional):

- LocalHttpServer integration testing (requires `Bun.serve()`), e.g. `tests/integration/bun/local-http-server-bun.bun-test.ts`
- File ID generation testing (requires `Bun.hash()`)
- Performance benchmarking of Bun-specific code
- HTTP transport protocol validation

These suites:

- Are **never** wired into pre-commit, pre-push, or `release:validate`
- Are intended for targeted runtime validation or manual runs
- Should not be treated as part of the core quality gates

**Limitations**:

- **No parallel execution** - single process, sequential test execution
- **No test isolation** - global state shared between test suites
- **Limited scalability** - unsuitable for large test suites
- **Feature gaps** - missing fake timers, limited ecosystem

### Test Runner Selection Matrix

| Test Type            | Dependencies             | Runner     | Rationale                     |
| -------------------- | ------------------------ | ---------- | ----------------------------- |
| Unit Tests           | Pure functions, mocks    | **Vitest** | Parallel execution, isolation |
| Integration (Mocked) | External services mocked | **Vitest** | Scalability, isolation        |
| Browser Automation   | Playwright browsers      | **Vitest** | Process isolation critical    |
| HTTP Server Testing  | `Bun.serve()` required   | **Bun**    | Runtime dependency            |
| MCP Protocol         | Real HTTP transport      | **Bun**    | End-to-end validation         |
| Performance Testing  | Bun-specific benchmarks  | **Bun**    | Production alignment          |

### Script Configuration

```bash
# Primary test commands (Vitest; used in hooks, CI, release)
bun run test                      # All tests (hybrid execution)
bun run test:unit                 # Vitest unit tests
bun run test:integration          # Vitest integration tests
bun run test:watch                # Vitest watch mode

# Bun-specific tests (advanced / optional; not part of hooks or release gates)
bun run test:integration:bun      # Bun test runner for HTTP server (✅ IMPLEMENTED)
bun run test:performance          # Bun performance benchmarks (included in :integration:bun)
```

### Future Migration Considerations

**We will consider migrating fully to Bun test runner only when**:

- Parallel execution with worker isolation is implemented
- Test suite isolation prevents side effects between suites
- Fake timers and ecosystem maturity reaches Vitest levels
- Performance gains justify the scalability trade-offs

**Current Decision (2025)**: Hybrid approach optimizes for Brooklyn's needs - maintaining scalability while enabling comprehensive testing of Bun-specific functionality.

### Git Hooks

**Pre-commit** (Fast feedback - <10s):

1. Code formatting
2. TypeScript validation
3. Linting
4. Unit tests + mock integration tests

**Pre-push** (Comprehensive - varies):

- Full test suite
- Includes all integration tests
- May fail locally if browsers not installed

## Setting Up Your Environment

### Basic Setup (Required)

```bash
bun install
```

### Full Testing Setup (Optional)

```bash
# Install Playwright browsers for integration tests
bun run setup:browsers
```

### Running Tests

#### Quick Unit Test

```bash
bun run test:unit
```

#### Pre-commit Simulation

```bash
bun run test:precommit
```

#### Full Test Suite

```bash
# Install browsers first if running browser tests
bun run setup:browsers

# Run all tests
bun run test
```

## CI/CD Configuration

The CI pipeline runs all tests with proper environment setup:

```yaml
# Example CI configuration
steps:
  - name: Install dependencies
    run: bun install

  - name: Install browsers
    run: bun run setup:browsers

  - name: Run tests with coverage
    run: bun run test:ci
```

## Writing New Tests

### Choosing the Right Category

1. **Write a Unit Test when**:
   - Testing pure functions
   - Logic has no external dependencies
   - Can use mocks for all dependencies
   - Test should run in milliseconds

2. **Write an Integration Test when**:
   - Testing component interactions
   - Need real browser instances
   - Testing MCP protocol flows
   - Validating system boundaries

3. **Write an E2E Test when**:
   - Testing complete user journeys
   - Validating Claude Code integration
   - Testing multi-team scenarios
   - Acceptance criteria validation

### Test File Naming

- Unit: `tests/unit/<component>.test.ts`
- Integration: `tests/integration/<feature>-integration.test.ts`
- E2E: `tests/e2e/<scenario>-e2e.test.ts`

## Troubleshooting

### Common Issues

**"Browser tests failing locally"**

- Run `bun run setup:browsers` to install Playwright browsers
- Or use `bun run test:unit` for quick local testing

**"Pre-commit hook taking too long"**

- Check that only unit tests are running
- Verify `test:precommit` uses the correct config

**"Tests passing locally but failing in CI"**

- Check for environment-specific dependencies
- Ensure all external services are mocked in unit tests
- Verify CI has proper browser setup

## Best Practices

1. **Keep Unit Tests Fast**: <100ms per test ideal
2. **Mock External Dependencies**: Use proper mocks in unit tests
3. **Test One Thing**: Each test should verify a single behavior
4. **Use Descriptive Names**: Test names should explain what and why
5. **Maintain Test Independence**: Tests should not depend on order

## Migration Guide

If you have existing tests in the wrong category:

1. **Identify Dependencies**: Check what the test requires
2. **Move to Correct Location**: Based on dependencies
3. **Update Imports**: Adjust paths as needed
4. **Verify Category**: Run the specific test command
5. **Update CI**: Ensure CI runs the test in the right phase

## Summary

Our test categorization ensures:

- ✅ Fast feedback for developers (unit tests in <5s)
- ✅ Comprehensive validation before push
- ✅ Full system verification in CI
- ✅ No false failures from missing dependencies
- ✅ Clear boundaries for test types

Follow this guide to write tests in the appropriate category and maintain a fast, reliable test suite.
