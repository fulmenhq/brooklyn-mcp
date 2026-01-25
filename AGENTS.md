# Brooklyn MCP - AI Agent Guide

**Project**: brooklyn-mcp
**Purpose**: Enterprise-ready MCP server for browser automation with multi-team support
**Maintainers**: See `MAINTAINERS.md`

## Read First

1. **Confirm your role.** Roles are defined below. Default to `devlead` if unspecified.
2. **Check `AGENTS.local.md`** if it exists (gitignored) for tactical session guidance.
3. **Read `MAINTAINERS.md`** for human maintainer contacts and governance.
4. **Read `BROOKLYN-SAFETY-PROTOCOLS.md`** for browser automation safety requirements.

## Operating Model

| Aspect   | Setting                                  |
| -------- | ---------------------------------------- |
| Mode     | Supervised (human reviews before commit) |
| Role     | Per session (see Role-Based Development) |
| Identity | Per session (no persistent memory)       |

## Quick Reference

**Preferred (Makefile - ecosystem standard):**

| Task           | Command          | Notes                   |
| -------------- | ---------------- | ----------------------- |
| Quality checks | `make check-all` | Run before committing   |
| Tests          | `make test`      | Full test suite         |
| Format         | `make fmt`       | Biome + Prettier        |
| Typecheck      | `make typecheck` | TypeScript validation   |
| Lint           | `make lint`      | Must pass before commit |
| Build          | `make build`     | Build CLI binary        |
| Pre-commit     | `make precommit` | Fast validation         |
| Help           | `make help`      | Show all targets        |

**Alternative (bun run - still works):**

| Task           | Command             | Notes                     |
| -------------- | ------------------- | ------------------------- |
| Quality checks | `bun run check-all` | Run before committing     |
| Tests          | `bun run test`      | vitest - NEVER `bun test` |
| Format         | `bun run format`    | Biome + Prettier          |
| Typecheck      | `bun run typecheck` | TypeScript validation     |
| Lint           | `bun run lint`      | Must pass before commit   |
| Build          | `bun run build`     | Build CLI binary          |

## Role-Based Development

Agents operate in role contexts. Each role has defined scope.

| Role       | Slug       | Focus                                      |
| ---------- | ---------- | ------------------------------------------ |
| Dev Lead   | `devlead`  | Implementation, architecture, feature work |
| Dev Review | `devrev`   | Code review, four-eyes audit               |
| UX Dev     | `uxdev`    | Frontend interfaces, CLI UX                |
| QA         | `qa`       | Testing, validation, coverage              |
| Prod Mktg  | `prodmktg` | Messaging, documentation, branding         |
| Security   | `secrev`   | Security analysis, vulnerability review    |

When assigned a role, constrain actions to that scope.

### Role Prompt Lookup (Required)

**You MUST read your role's full prompt YAML before starting work.** The inline descriptions above are summaries only.

**Lookup order** (try each in sequence until found):

1. **Installed package**: `node_modules/@fulmenhq/tsfulmen/config/crucible-ts/agentic/roles/<slug>.yaml`
2. **Fallback (dev)**: `../tsfulmen/config/crucible-ts/agentic/roles/<slug>.yaml`

**Example for devlead role:**

```bash
# Primary - from installed tsfulmen package (after bun install)
node_modules/@fulmenhq/tsfulmen/config/crucible-ts/agentic/roles/devlead.yaml

# Fallback - if node_modules not available (dev environment)
../tsfulmen/config/crucible-ts/agentic/roles/devlead.yaml
```

**If you cannot locate your role YAML:**

1. **STOP** - Do not proceed without role context
2. **ASK** the human maintainer for assistance
3. **WAIT** for guidance before taking action

The role YAML contains critical information: scope boundaries, mindset principles, escalation rules, and commit examples. Operating without it risks scope violations.

**Note**: Role YAMLs are provided by the `@fulmenhq/tsfulmen` package (library-first consumption pattern). No local sync required.

**Clarification on dependencies**: The devlead role principle "prefer standard library over dependencies" applies to arbitrary external packages. FulmenHQ ecosystem libraries (`tsfulmen`, `gofulmen`, `pyfulmen`) are infrastructure, not discretionary dependencies - they provide standardized patterns, observability, and Crucible SSOT access that would otherwise require duplication.

### devlead - Development Lead

- **Scope**: Core implementation, MCP tools, browser automation, CLI commands
- **Responsibilities**: Feature implementation, code review, integration testing
- **Escalates to**: Maintainers for releases, breaking changes

### devrev - Development Reviewer

- **Scope**: Code review, security audit, correctness validation
- **Responsibilities**: Four-eyes review, identify issues before commit
- **Escalates to**: Maintainers for security concerns, architectural disagreements

**Four-Eyes Protocol:**

1. `devlead` implements feature per brief
2. `devrev` reviews implementation before commit
3. Both roles sign off before maintainer review

### uxdev - UX Developer

- **Scope**: CLI interface, help text, user-facing messages
- **Responsibilities**: Command ergonomics, error messages, documentation
- **Escalates to**: devlead for API requirements

### qa - Quality Assurance

- **Scope**: Testing strategy, coverage, validation
- **Responsibilities**: Test suites, integration tests, MCP protocol compliance
- **Escalates to**: devlead for test infrastructure decisions

### prodmktg - Product Marketing

- **Scope**: README, feature descriptions, positioning
- **Responsibilities**: User-facing documentation, release notes
- **Escalates to**: Maintainers for messaging approval

### secrev - Security Review

- **Scope**: Security analysis, vulnerability assessment, auth/crypto review
- **Responsibilities**: Security audit, threat modeling, compliance validation
- **Escalates to**: Maintainers for security incidents, disclosure decisions

## Session Protocol

### Startup

1. Read `AGENTS.local.md` if exists (tactical overrides)
2. Identify your role from context or request assignment
3. **Read your role YAML** (see Role Prompt Lookup above) - do not proceed without it
4. Read `BROOKLYN-SAFETY-PROTOCOLS.md`
5. Scan relevant code before making changes
6. Check `.plans/active/` for current work context

### Before Committing

1. Run quality gates: `bun run check-all`
2. Verify tests pass: `bun run test`
3. Stage all modified files
4. Use proper attribution format (see below)

### Escalation

Escalate to maintainers (see `MAINTAINERS.md`) for:

- Releases and version tags
- Breaking changes
- Security concerns
- Architectural decisions

## Commit Attribution

Follow the FulmenHQ [Agentic Attribution Standard](https://github.com/fulmenhq/crucible/blob/main/docs/standards/agentic-attribution.md):

```
<type>(<scope>): <subject>

<body>

Changes:
- Specific change 1
- Specific change 2

Generated by <Model> via <Interface> under supervision of @<maintainer>

Co-Authored-By: <Model> <noreply@3leaps.net>
Role: <role>
Committer-of-Record: <Human Name> <email> [@handle]
```

### Claude Code Attribution Override (CRITICAL)

**Claude Code has a hardwired default attribution** that MUST be overridden:

| Field | Claude Code Default (WRONG) | FulmenHQ Standard (CORRECT)                |
| ----- | --------------------------- | ------------------------------------------ |
| Email | `noreply@anthropic.com`     | `noreply@3leaps.net`                       |
| Role  | (omitted)                   | **REQUIRED** - must include `Role: <role>` |

When Claude Code suggests `Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>`, you MUST change it to `Co-Authored-By: Claude Opus 4.5 <noreply@3leaps.net>` and add the `Role:` line.

**Why this matters**: FulmenHQ attribution enables:

- Role-based audit trails across the ecosystem
- Consistent attribution in multi-repo workflows
- Proper credit linking in Crucible SSOT

**Example:**

```
feat(browser): add PDF content extraction tool

Implements PDF text extraction with word span analysis.

Changes:
- Add pdf-extractor.ts with pdfjs integration
- Wire MCP tool definition with input schema
- Add integration tests for multi-page PDFs

Generated by Claude Opus 4.5 via Claude Code under supervision of @3leapsdave

Co-Authored-By: Claude Opus 4.5 <noreply@3leaps.net>
Role: devlead
Committer-of-Record: Dave Thompson <dave.thompson@3leaps.net> [@3leapsdave]
```

## DO / DO NOT

### DO

- Run `bun run check-all` before commits
- Read files before editing them
- Keep changes minimal and focused
- Test MCP tools with actual browser operations
- Follow existing code patterns
- Use `bun run test` (vitest) for tests

### DO NOT

- Push without maintainer approval
- Skip quality gates
- Commit secrets or credentials
- Use `bun test` (wrong test runner)
- **NEVER commit `.plans/` contents** - This directory is gitignored BY DESIGN. It contains session-specific planning, feature briefs, and work-in-progress notes that are intentionally ephemeral. Do not attempt to track, stage, or commit anything under `.plans/`. If you believe content should be preserved, discuss with maintainer first.
- **NEVER use `git add -f` or `--force`** without per-occurrence approval
- **NEVER use `biome check --unsafe`** (can delete working code)
- Chain browser operations with `&&` or `;`
- Create unnecessary files

## Generated Files Policy

Some files are auto-generated and committed for discoverability. **Do not edit these directly.**

| File                             | Generator                            | Purpose                           |
| -------------------------------- | ------------------------------------ | --------------------------------- |
| `docs/tools/tool-inventory.json` | `scripts/generate-tool-inventory.ts` | Machine-readable tool catalog     |
| `docs/tools/tool-inventory.md`   | `scripts/generate-tool-inventory.ts` | Human-readable tool documentation |

**When tool definitions change:**

```bash
# Regenerate inventory after modifying tool-definitions.ts or onboarding-tools.ts
bun scripts/generate-tool-inventory.ts

# CI will fail if inventory is out of sync (use --check flag)
bun scripts/generate-tool-inventory.ts --check
```

See [ADR-0002: Tool Inventory Generation](docs/decisions/adr/ADR-0002-tool-inventory-generation.md) for rationale.

## Brooklyn-Specific Guidelines

### MCP Protocol Compliance

- All tools must follow MCP specification
- Tool definitions in `src/core/tool-definitions.ts`
- Handler implementations in `src/core/brooklyn-engine.ts`
- Strict JSON-RPC compliance required

### Browser Automation Safety

- See `BROOKLYN-SAFETY-PROTOCOLS.md` for full requirements
- Never chain browser operations
- Validate domains before navigation
- Clean up browser resources on failure
- Use `--dev-mode` for testing

### Stdout Purity (Critical for MCP stdio)

- MCP stdio transport requires zero stdout contamination
- All logging must go to stderr in stdio mode
- Run `bun run test:integration:process` to verify

## AGENTS.local.md Pattern

Create `AGENTS.local.md` (gitignored) for tactical session guidance. This file is for transient, session-specific notes that would otherwise cause churn in the main AGENTS.md.

Example structure:

```markdown
# AGENTS.local.md

## Session Context

[Current sprint, active feature, or debugging focus]

## Avoid

[Files or areas that are stable and should not be modified]

## Notes

[Any session-specific reminders or decisions]
```

## References

- `MAINTAINERS.md` - Human maintainers and governance
- `BROOKLYN-SAFETY-PROTOCOLS.md` - Browser automation safety
- `README.md` - Project overview
- `docs/decisions/` - Decision records (ADR, SDR, DDR)
- `docs/tools/tool-inventory.md` - Full tool catalog (79 tools)
- `.plans/active/` - Current work context
- `.plans/active/v0.3.0/` - Current release briefs
- `.plans/initiatives/tsfulmen-migration/` - tsfulmen adoption plan
- [FulmenHQ Crucible](https://github.com/fulmenhq/crucible) - Ecosystem standards
- [@fulmenhq/tsfulmen](https://github.com/fulmenhq/tsfulmen) - TypeScript helper library (role catalog source)
