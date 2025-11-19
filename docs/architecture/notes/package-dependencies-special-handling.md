# Package Dependencies - Special Handling

This document tracks dependencies that require special handling, pinning, or version constraints due to architectural requirements or compatibility issues.

---

## dotenv: Pinned to 16.x (MCP Stdout Purity Requirement)

**Status**: 🔴 **PINNED** - Cannot upgrade to 17.x
**Current Version**: [`dotenv@16.6.1`](../../package.json)
**Blocked Version**: `dotenv@17.x`
**Decision Date**: 2025-01-19
**Decided By**: Paris Brooklyn (@paris-brooklyn) under supervision of @3leapsdave

### Issue Summary

Brooklyn MCP server operates as a JSON-RPC service communicating via stdio (stdin/stdout). The **MCP protocol requires absolute stdout purity** - only JSON-RPC messages can be written to stdout. Any extraneous output breaks protocol compliance and causes client failures.

When upgrading to `dotenv@17.2.3`, integration tests failed with:

```
SyntaxError: Unexpected token 'd', "[dotenv@17."... is not valid JSON
```

The stdout purity tests detected package information being written to stdout during module initialization, polluting the JSON-RPC communication channel.

### Failed Tests

```
❌ Architecture Committee: MCP Stdout Purity Tests
  - should maintain stdout purity during MCP initialize
  - should maintain stdout purity during tool discovery
  - should maintain purity across multiple MCP requests
  - should maintain purity even during error conditions
```

All tests passed after rolling back to `dotenv@16.6.1`.

### Root Cause

Either:

1. `dotenv@17.x` outputs package/version information to stdout during initialization
2. Bun's module loader outputs dependency information when loading `dotenv@17.x`
3. New `dotenv@17.x` behavior triggers stdout pollution in bundled binaries

### Current Package Configuration

In [`package.json`](../../package.json):

```json
{
  "devDependencies": {
    "dotenv": "16.6.1" // ⚠️ Pinned - see docs/architecture/notes/package-dependencies-special-handling.md
  }
}
```

**Note**: Version is **pinned exactly** (no `^` prefix) to prevent automatic minor/patch updates that might introduce the issue.

### Unblock Criteria

This pin can be removed when **any** of the following conditions are met:

#### Option A: Accept Stdout Pollution (NOT RECOMMENDED)

- **Decision**: Team accepts that stdio purity is not critical for Brooklyn's use case
- **Impact**: Would violate MCP protocol standards and break JSON-RPC clients
- **Approval Required**: Architecture Committee + @3leapsdave
- **Likelihood**: ⛔ Extremely unlikely - MCP purity is a core requirement

#### Option B: dotenv Fix

- **Condition**: `dotenv@17.x` (or later) eliminates stdout output during initialization
- **Verification**: Run `bun run test tests/integration/stdout-purity.test.ts` after upgrade
- **Expected**: All 4 stdout purity tests pass
- **How to Check**: Monitor dotenv releases at https://github.com/motdotla/dotenv/releases

#### Option C: Invocation Mechanism

- **Condition**: Find a configuration option to suppress stdout output
- **Approach**: Pass options to `dotenvConfig()` in `src/core/config.ts:470`
- **Example**: `dotenvConfig({ debug: false, silent: true, ... })`
- **Verification**: Same as Option B - all stdout purity tests must pass

### Testing Procedure

Before upgrading dotenv in the future:

```bash
# 1. Update dotenv
bun add dotenv@^17.0.0  # Or latest version

# 2. Clean build
bun run clean:all
bun install

# 3. Run stdout purity tests
bun run test tests/integration/stdout-purity.test.ts

# 4. If tests pass, run full validation
bun run check-all

# 5. If any test fails, rollback immediately
bun remove dotenv && bun add dotenv@16.6.1
```

### Related Files

- **Implementation**: `src/core/config.ts:466-481` - `loadFromDotenv()` method
- **Tests**: `tests/integration/stdout-purity.test.ts` - MCP stdio purity validation
- **Package**: [`package.json`](../../package.json) - Dependency declaration
- **Plan**: `.plans/active/v0.2.3/dependency-updates-plan.md` - Phase 3 upgrade attempt

### Architecture Context

Brooklyn follows the **MCP (Model Context Protocol)** specification for AI agent communication:

- **Transport**: JSON-RPC 2.0 over stdio (stdin/stdout)
- **Stdout**: MUST contain only JSON-RPC messages (protocol requirement)
- **Stderr**: All logging, diagnostics, and informational output
- **Violation Impact**: Breaks Claude Code, Cursor, and other MCP clients

This is enforced by the Architecture Committee's comprehensive stdout purity test suite.

### Phase 3 Dependency Updates - Outcome

**Completed**:

- ✅ `pino` → 10.1.0 (major upgrade successful)
- ✅ `pino-pretty` → 13.1.2 (major upgrade successful)
- ✅ `inquirer` → 13.0.1 (major upgrade successful)

**Blocked**:

- ❌ `dotenv` → 17.x (breaks MCP protocol, rolled back to 16.6.1)

**Commit**: TBD - Phase 3 partial completion (pino + inquirer only)

---

_Document maintained by 🌉 Paris Brooklyn - MCP Platform Architect_
_Next Review_: Before any dotenv upgrade attempt
_Related_: [Deployment SOP](../../docs/development/standards/deployment-sop.md), [MCP Protocol Compliance](../standards/mcp-compliance.md)
