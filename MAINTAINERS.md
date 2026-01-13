# Maintainers

**Project**: brooklyn-mcp
**Purpose**: Enterprise-ready MCP server for browser automation
**Governance**: FulmenHQ / 3 Leaps Initiative

## Human Maintainers

| Name          | GitHub        | Email                    | Role         |
| ------------- | ------------- | ------------------------ | ------------ |
| Dave Thompson | [@3leapsdave] | dave.thompson@3leaps.net | Project Lead |

[@3leapsdave]: https://github.com/3leapsdave

## Autonomous Agents

_None configured. This repository uses supervised mode only._

## AI-Assisted Development

This repository uses AI assistants in **supervised mode**. See [AGENTS.md](AGENTS.md) for:

- Operating model and role definitions
- Commit attribution format
- Session protocols and quality gates

### Recommended Roles for brooklyn-mcp

| Role       | Slug       | When to Use                                   |
| ---------- | ---------- | --------------------------------------------- |
| Dev Lead   | `devlead`  | Implementation, MCP tools, browser automation |
| Dev Review | `devrev`   | Code review, four-eyes audit                  |
| UX Dev     | `uxdev`    | CLI interface, help text                      |
| QA         | `qa`       | Testing, coverage, validation                 |
| Prod Mktg  | `prodmktg` | README, documentation, release notes          |
| Security   | `secrev`   | Security analysis (when needed)               |

## Governance

### Approvals Required

- **Releases**: Maintainer approval required for version tags
- **Breaking changes**: Maintainer review before merge
- **Security issues**: Report privately to maintainers first
- **Architecture decisions**: Discuss with maintainers before implementation

### Quality Standards

All contributors (human and AI) must:

- Run `bun run check-all` before commits
- Maintain test coverage (70%+ for new code)
- Follow MCP protocol compliance requirements
- Adhere to browser automation safety protocols
- Use proper commit attribution format

### Override Process

Quality gate bypasses (`--no-verify`) require:

1. Explicit maintainer approval
2. Documented justification
3. Commitment to fix in next immediate commit

See [BROOKLYN-SAFETY-PROTOCOLS.md](BROOKLYN-SAFETY-PROTOCOLS.md) for emergency procedures.

## Communication

- **Primary**: GitHub Issues and Pull Requests
- **Escalation**: Direct contact with @3leapsdave
- **Security**: Private disclosure to maintainers

## Adding Maintainers

New maintainers are added by existing maintainers. Update this file and relevant access controls.

## References

- [AGENTS.md](AGENTS.md) - AI agent operating model
- [BROOKLYN-SAFETY-PROTOCOLS.md](BROOKLYN-SAFETY-PROTOCOLS.md) - Safety requirements
- [FulmenHQ Governance](https://github.com/fulmenhq/.github) - Ecosystem policies
- [Agentic Attribution Standard](https://github.com/fulmenhq/crucible/blob/main/docs/standards/agentic-attribution.md)
