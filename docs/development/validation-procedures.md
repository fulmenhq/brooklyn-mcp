# Brooklyn MCP - Validation Procedures & Quality Exceptions

This document outlines the validation procedures for the Brooklyn MCP platform and documents justified exceptions to our quality standards.

## Overview

Brooklyn maintains zero-tolerance quality standards with specific justified exceptions for:

1. **Dynamic MCP interfaces** requiring runtime flexibility
2. **Test mocks** for complex external dependencies
3. **CLI user interaction** requiring direct console output

## File-Level Biome Exceptions

### Dynamic MCP Protocol Interfaces

These files contain `any` types that are justified due to the dynamic nature of MCP tool arguments:

| File                                    | Justification                                                          | Exception Type                                                          |
| --------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `src/core/brooklyn-engine.ts`           | MCP tool arguments are runtime-dynamic from external Claude Code calls | `noExplicitAny`                                                         |
| `src/core/onboarding-tools.ts`          | Onboarding tool handlers receive dynamic parameters from MCP protocol  | `noExplicitAny`                                                         |
| `src/core/server.ts`                    | Legacy MCP server with dynamic tool arguments                          | `noExplicitAny`                                                         |
| `src/core/config.ts`                    | Environment variable parsing with dynamic types and complex merging    | `noExplicitAny`, `noNonNullAssertion`, `noExcessiveCognitiveComplexity` |
| `src/cli/brooklyn.ts`                   | Configuration initialization with dynamic environment variables        | `noExplicitAny`                                                         |
| `src/cli/brooklyn-server.ts`            | Claude Code configuration with CLI user interaction                    | `noExplicitAny`, `noConsoleLog`, `noForEach`, `noUnusedVariables`       |
| `src/shared/structured-logger.ts`       | Winston logging with dynamic error objects                             | `noExplicitAny`, `noDelete`                                             |
| `src/transports/http-transport.ts`      | Node.js HTTP request/response objects (built-in any types)             | `noExplicitAny`                                                         |
| `src/transports/mcp-stdio-transport.ts` | Process stdin/stdout replacement for named pipe development mode       | `noExplicitAny`                                                         |

**Technical Rationale**: MCP (Model Context Protocol) tools receive arguments from Claude Code that cannot be statically typed at compile time. The protocol requires runtime flexibility for tool parameters.

### Test Mocks & Fixtures

These files use `any` types for mocking complex external dependencies:

| File                                                   | Justification                                                            | Exception Type  |
| ------------------------------------------------------ | ------------------------------------------------------------------------ | --------------- |
| `src/core/browser-pool-manager.test.ts`                | Playwright browser/context/page interfaces are too complex to fully mock | `noExplicitAny` |
| `tests/integration/team-onboarding-functional.test.ts` | Dynamic test result validation with variable structure                   | `noExplicitAny` |

**Technical Rationale**: Playwright interfaces contain 20+ complex generic properties. Creating complete mock interfaces would be brittle and break with library updates. Using `any` for test mocks is standard practice.

### CLI User Interaction

These files require direct console output for user interaction:

| File                         | Justification                                       | Exception Type |
| ---------------------------- | --------------------------------------------------- | -------------- |
| `src/cli/brooklyn-server.ts` | CLI tool output for user feedback and error display | `noConsoleLog` |
| `scripts/install-cli.ts`     | Installation progress and success messages          | `noConsoleLog` |
| `scripts/build-cli.ts`       | Build progress and completion messages              | `noConsoleLog` |

**Technical Rationale**: CLI tools require direct console output for user interaction. These are intentional user-facing messages, not debugging statements.

## Occurrence-Level Ignores

### Architecture Pattern Exceptions

| Pattern           | File                           | Justification                                                     |
| ----------------- | ------------------------------ | ----------------------------------------------------------------- |
| Static-only class | `src/core/onboarding-tools.ts` | Namespace pattern for related tool handlers with shared state     |
| forEach usage     | `src/cli/brooklyn-server.ts`   | CLI output formatting where functional style improves readability |

### Performance & Readability Exceptions

When occurrence-level `biome-ignore` comments are needed:

```typescript
// Example: Complex external interface
// biome-ignore lint/suspicious/noExplicitAny: RouteMatch has 20+ complex generic properties. Using 'any' for test mock is more maintainable than recreating full interface.
const mockRouteMatch = {
  id: "test-route",
  pathname: "/test",
  params: {},
} as any;
```

## Quality Gate Process

### File-Level Exception Process

1. **Identify need**: Determine if `any` type or other exception is truly justified
2. **Document rationale**: Add entry to this document with technical justification
3. **Configure biome.json**: Add file to appropriate override section
4. **Code review**: All exceptions require review by Integration Lead (@paris-brooklyn)

### Exception Criteria

**Justified exceptions:**

- ✅ Dynamic MCP protocol interfaces (runtime flexibility required)
- ✅ Test mocks for complex external dependencies (maintainability)
- ✅ CLI user output (intentional user interaction)
- ✅ Architecture patterns (static utility classes, etc.)

**Rejected exceptions:**

- ❌ Lazy typing (use proper interfaces instead)
- ❌ Debugging console.log (use structured logging)
- ❌ Avoiding TypeScript complexity (learn proper patterns)
- ❌ "It's faster to use any" (technical debt)

## Validation Commands

### File-Level Validation

```bash
# Check specific file after changes
bun run check:file path/to/file.ts
bun run check:file:fix path/to/file.ts  # Auto-fix where possible
```

### Project-Level Validation

```bash
# Complete quality pipeline
bun run check-all  # format → typecheck → lint → test

# Individual steps
bun run format     # Format code and docs
bun run typecheck  # TypeScript compilation
bun run lint       # Linting with exceptions
bun run test       # Test execution
```

### Exception Verification

```bash
# Verify exceptions are working correctly
bunx biome check .  # Should show justified errors only
bunx biome check --verbose .  # Detailed exception reporting
```

## Monitoring & Review

### Regular Reviews

**Monthly**: Review all exceptions in this document

- Verify exceptions are still justified
- Check if upstream libraries have improved typing
- Update documentation as needed

**Per Release**: Exception audit

- Confirm all exceptions have proper justification
- Remove exceptions that are no longer needed
- Update biome.json configurations

### Exception Metrics

Track exception count over time:

- **Dynamic MCP interfaces**: Expected to remain stable
- **Test mocks**: May decrease with improved typing
- **CLI output**: Expected to remain stable
- **Architecture patterns**: Should decrease over time

## Updates & Maintenance

This document is maintained by the Integration Lead (@paris-brooklyn) and updated whenever:

- New exceptions are added to biome.json
- Exception criteria change
- Quality standards are updated
- File-level overrides are modified

Last updated: 2025-07-19
Next review: 2025-08-19
