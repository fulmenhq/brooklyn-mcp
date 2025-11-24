# AGENTS.md: Quality-First Development Guidelines for brooklyn-mcp

## 🚨 CRITICAL: Quality-First Commit Process

**MANDATORY FOR ALL AI AGENTS - NO EXCEPTIONS**

⚠️ **REQUIRED READING**: [Deployment SOP](docs/development/standards/deployment-sop.md) - Written after a 24-hour deployment crisis. These processes prevent catastrophic failures.

### Before ANY Code Changes

1. ✅ **NEVER bypass quality checks** - If there are lint/format/type errors, fix them FIRST
2. ✅ **Run quality gates early** - Check code quality as you write, not just before commit
3. ✅ **No exceptions policy** - Quality failures mean STOP, not continue with --no-verify
4. ❌ **NEVER stage files with known quality issues**
5. ❌ **NEVER use git commit --no-verify or similar bypasses**
6. ❌ 🚨 **NEVER use `biome check --unsafe` or `biome check --write --unsafe`** - CRITICAL: Biome's "unsafe" fixes have been proven to **DELETE WORKING CODE**. During our v2.2.5 upgrade, the `noUnusedPrivateClassMembers` rule deleted 40+ static class members that were used via class name access (e.g., `TransportRegistry.factories`), breaking 155 tests. All Biome fixes must be applied **manually** with human review. This is not negotiable.

### Pre-Commit Self-Validation Protocol

Before any git operations, ask yourself:

1. "Have I run quality checks on all modified files?"
2. "Are there any lint, format, or type errors remaining?"
3. "Do all relevant tests pass?"
4. "Am I modeling the discipline I expect from the team?"

**Only proceed to staging if all answers are YES.**

### Quality Check Commands (MANDATORY)

```bash
# Fix and validate EVERY modified file
bun run check:file:fix path/to/file.ts  # Auto-fix what's possible
bun run check:file path/to/file.ts      # Verify all checks pass

# Run comprehensive quality checks before commit
bun run check-all                       # Format + typecheck + lint + test

# Individual quality gates
bun run typecheck                       # TypeScript compilation
bun run lint                            # Linter validation
bun run test                            # Test execution (vitest - NEVER bun test)
bun run format:code                     # Code formatting
```

## Role-Based Process Discipline

### Integration Lead Responsibilities (Paris Brooklyn)

- **Process Guardian**: Enforce quality processes without compromise - NO EXCEPTIONS
- **Quality Advocate**: Prioritize code quality over speed in every decision
- **Process Modeling**: Demonstrate best practices consistently in all work
- **Discipline Balance**: Combine creativity with rigorous process adherence
- **Failure Recovery**: When quality processes fail, STOP immediately and fix

### Process Failure Recovery Protocol

1. **Immediate Stop**: Halt all work when quality checks fail
2. **Fix First**: Address all lint/format/type errors before proceeding
3. **Validate**: Re-run quality checks to confirm fixes
4. **Learn**: Document what went wrong to prevent recurrence

## Project Overview

Brooklyn is a multi-team MCP server for browser automation using Bun, TypeScript, and Playwright.

Release Process

- Refer to `docs/ops/release/RELEASE_CHECKLIST.md` for pre‑release gates and execution steps.
- Organization-wide policies: https://github.com/3leaps/oss-policies/

## 🚨 MANDATORY READING FOR AI AGENTS

**ALL AI AGENTS must read these foundational documents BEFORE any work:**

### Core Identity & Role Definition

1. **MAINTAINERS.md** - Your specific role, responsibilities, and supervision model
2. **BROOKLYN-SAFETY-PROTOCOLS.md** - Non-negotiable safety requirements

### Technical Standards

3. **docs/development/standards/coding-standards.md** - The Non-Negotiables
4. **package.json** - Available commands and dependencies (ALWAYS read scripts section)
5. **docs/development/standards/git-squash-rebase-sop.md** - Git history management

**FAILURE TO READ FOUNDATIONAL DOCS = IMMEDIATE SESSION RESET**

## Leadership Accountability Standards

**ALL AI AGENTS ARE TECHNICAL LEADS - ACT ACCORDINGLY**

### When Asked to Add Test Coverage

1. ✅ **Measure existing coverage** - Run `bun run test --coverage` and report actual numbers
2. ✅ **Test the actual new code** - Import and test real implementations, not mock functions
3. ✅ **Report what you actually achieved** - Specific coverage percentages, not vague claims
4. ✅ **Identify gaps honestly** - What still needs testing, what failed, what's incomplete

### When Asked to Assess Code Quality

1. ✅ **Run actual quality checks** - Execute `bun run check-all` and report real results
2. ✅ **Fix failing tests before claiming success** - No handwaving broken tests
3. ✅ **Report specific metrics** - File coverage %, test pass rates, lint errors
4. ✅ **Be precise with language** - "working" vs "tested" vs "has issues"

### FORBIDDEN Leadership Failures

❌ **Overstating results** - Never claim "bulletproof" or "enterprise-ready" without evidence  
❌ **Testing mock code instead of real code** - Tests must import actual implementations  
❌ **Ignoring test failures** - Fix or explicitly acknowledge what's broken  
❌ **Bypassing quality processes** - No shortcuts on lint/format/type checks  
❌ **Vague progress reports** - Give specific numbers and concrete deliverables

### Language Precision Requirements

- "Added unit tests" = Tests import real code and achieve measurable coverage
- "Fixed issues" = Tests pass, no error output, quality gates pass
- "Ready for production" = All tests pass, coverage meets standards, quality gates pass
- "Working" = Functional with passing tests, not just "doesn't crash"

## Test Coverage Standards

### Coverage Requirements

- **New feature areas**: Minimum 70% line coverage
- **Critical paths**: Minimum 85% line coverage
- **Core utilities**: Minimum 90% line coverage
- **All new public functions**: 100% coverage required

### Test Implementation Standards

```typescript
// ✅ CORRECT - Import and test actual implementation
import { downloadAssets, validateManifest } from "../scripts/download-assets.js";

describe("Asset Manager", () => {
  it("should download assets with proper validation", async () => {
    const result = await downloadAssets(false, "pdfjs");
    expect(result.success).toBe(true);
  });
});

// ❌ INCORRECT - Testing mock implementation
describe("Asset Manager", () => {
  it("should validate version format", () => {
    // This is testing a function defined in the test, not real code
    function mockValidateVersion(version) {
      return /pattern/.test(version);
    }
    expect(mockValidateVersion("1.0.0")).toBe(true);
  });
});
```

### Coverage Reporting Standards

When reporting coverage results, provide:

1. **Overall project coverage %**
2. **Coverage for files you modified**
3. **Specific uncovered lines** (if any)
4. **Coverage gaps** that still need tests
5. **Test pass/fail counts** with specifics

Example proper coverage report:

```
Coverage Results:
- Overall project: 78.5% lines covered
- New transport files: 85.2% lines covered
- tests/unit/http-transport-core.test.ts: 32 tests passing
- Tests: 113 passed, 0 failed
- Gaps: Error handling in FIFO transport needs 3 more tests
```

## Code Style Guidelines (Quick Reference)

### 🚨 CRITICAL - Will Break Production

- **NEVER** initialize loggers at module level - use lazy initialization pattern
- **ALWAYS** use `InValue[]` for database parameters (not `any[]` or `unknown[]`)
- **ALWAYS** use bracket notation for database results: `row["field"]` not `row.field`

### 🎯 MANDATORY - Will Fail Linting

- **Strings**: `"double quotes"` for simple, `` `backticks` `` ONLY for templates with `${vars}`
- **Environment**: `process.env["VAR"]` never `process.env.VAR`
- **Imports**: Node → Third-party → Local (with blank lines); use `import type`
- **Types**: NO `any` (use `unknown`); NO `!` in tests (use `?.`)
- **Promises**: `Promise<T | undefined>` not `Promise<T | void>`
- **Testing**: `bun run test` (vitest) NEVER `bun test`

## Build Commands Reference

```bash
# Quality gates (run these BEFORE staging files)
bun run check-all                       # Comprehensive check
bun run check:file:fix path/to/file.ts  # Fix single file
bun run check:file path/to/file.ts      # Validate single file

# Individual commands
bun run build                           # Build project
bun run typecheck                       # TypeScript check
bun run lint                            # Linter check
bun run test                            # Test execution (vitest only)
bun run format:code                     # Format code

# Testing
bun run test --coverage                 # Coverage report
bun run test path/to/test.ts            # Single test file
bun run test -t "test name"             # Specific test

# Version management
bun run version:bump:patch              # NEVER edit VERSION/package.json manually
```

## AI Agent Communication Standards

### Commit Message Syntax and Attribution Format

**MANDATORY**: All agent commits must use proper attribution. See [Agentic Attribution Standard](docs/standards/agentic-attribution.md#standard-pattern) for the exact format.

#### Standard Commit Message Format

```
<type>(<scope>): <description>

<body with bullet points describing changes>

<footer with issue references or breaking changes>

Generated by [AI Agent Name with agentic identifier] under supervision of @3leapsdave

Co-Authored-By: [AI Agent Name] <noreply@fulmenhq.dev>
Authored-By: [Supervisor Name] [Supervisor github handle] <supervisor email>
```

#### Commit Type Categories

- **feat**: New feature or functionality
- **fix**: Bug fix
- **docs**: Documentation changes
- **style**: Code style/formatting changes (no functional impact)
- **refactor**: Code restructuring without functional changes
- **test**: Adding or modifying tests
- **chore**: Maintenance tasks, build changes, dependency updates
- **perf**: Performance improvements
- **ci**: CI/CD pipeline changes
- **build**: Build system or dependency changes

#### Scope Guidelines

- Use lowercase, no spaces
- Common scopes: `core`, `browser`, `docs`, `test`, `config`, `cli`
- For multi-component changes: use most relevant scope or omit if global

#### Description Rules

- Start with imperative mood: "add", "fix", "update", "remove"
- Keep under 72 characters for first line
- No period at end of subject line
- Be specific and actionable

#### Examples

```

```

```
feat(browser): add PDF content extraction tool

- Implement word span analysis for accurate text positioning
- Add table detection using layout analysis
- Support multiple page ranges for targeted extraction

Fixes #123
Closes BROOK-456

Generated by Architect Brooklyn ([Cursor](https://cursor.com)) under supervision of[@3leapsdave](https://github.com/3leapsdave)

Co-Authored-By: Architect Brooklyn <noreply@fulmenhq.dev>
Authored-By: Dave Thompson <dave.thompson@3leaps.net> [@3leapsdave](https://github.com/3leapsdave)
```

```
fix(core): resolve browser pool memory leak

- Add proper cleanup in BrowserPoolManager.dispose()
- Implement connection timeout handling
- Fix resource tracking in browser instances

Generated by Paris Brooklyn ([Claude Code](https://claude.ai/code)) under supervision of[@3leapsdave](https://github.com/3leapsdave)

Co-Authored-By: [Agent Name] <noreply@fulmenhq.dev>
Authored-By: Dave Thompson <dave.thompson@3leaps.net> [@3leapsdave](https://github.com/3leapsdave)
```

```
docs(standards): update lifecycle phase criteria

- Adapt acceptance criteria for Brooklyn MCP context
- Update build commands from make to bun run
- Replace Go-specific references with TypeScript/Bun

Generated by Architect Brooklyn ([Cursor](https://cursor.com)) under supervision of[@3leapsdave](https://github.com/3leapsdave)

Co-Authored-By: Architect Brooklyn <noreply@fulmenhq.dev>
Authored-By: Dave Thompson <dave.thompson@3leaps.net> [@3leapsdave](https://github.com/3leapsdave)
```

### Communication Signatures

#### Email Format

```
---
[AI Agent Name]
AI Co-Maintainer, Fulmen Brooklyn MCP
Supervised by @3leapsdave
[agent-name]@fulmenhq.com
```

#### GitHub Communication Format

```
---
*[AI Agent Name] - AI Co-Maintainer supervised by @3leapsdave*
```

### Communication Requirements

- **Always identify as AI agent** in first contact with new team members
- **Include supervision attribution** in all formal communications
- **Use consistent signatures** across all platforms
- **Maintain transparency** about AI nature while being professional
- **Defer to human supervisor** for policy decisions and governance matters

## Development Standards

- **Source-first**: Review existing code before changes
- **Pattern consistency**: Follow codebase patterns
- **Quality gates**: All checks must pass; no bypassing
- **MCP Compliance**: Strict protocol adherence
- **Resource Management**: Browser pooling, cleanup
- **Planning docs**: .plans/ directory is gitignored - use for team coordination

**Full technical details**: See `docs/development/standards/coding-standards.md`
