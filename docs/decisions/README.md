# Decision Records

This directory contains all decision records for Brooklyn MCP, organized by type:

| Type    | Directory | Purpose                                                                             |
| ------- | --------- | ----------------------------------------------------------------------------------- |
| **ADR** | `adr/`    | Architecture Decision Records - technical architecture, API design, infrastructure  |
| **SDR** | `sdr/`    | Security Decision Records - vulnerability management, security policies, compliance |
| **DDR** | `ddr/`    | Design Decision Records - UX/UI decisions, CLI ergonomics, frontend design          |

## Index

### Architecture Decision Records (ADR)

| ID                                                    | Title                        | Status   | Date       |
| ----------------------------------------------------- | ---------------------------- | -------- | ---------- |
| [ADR-0001](adr/ADR-0001-mcp-session-id.md)            | MCP HTTP Session Correlation | Accepted | 2026-01-13 |
| [ADR-0002](adr/ADR-0002-tool-inventory-generation.md) | Tool Inventory Generation    | Accepted | 2026-01-18 |

### Security Decision Records (SDR)

| ID                                                            | Title                               | Status   | Date       |
| ------------------------------------------------------------- | ----------------------------------- | -------- | ---------- |
| [SDR-001](sdr/SDR-001-npm-transitive-dependency-overrides.md) | NPM Transitive Dependency Overrides | Approved | 2026-01-19 |
| [SDR-002](sdr/SDR-002-go-stdlib-sbom-false-positives.md)      | Go Stdlib SBOM False Positives      | Approved | 2026-01-19 |

### Design Decision Records (DDR)

_No DDRs recorded yet._

## Creating New Decision Records

### Naming Convention

- **ADR**: `ADR-NNNN-short-title.md` (e.g., `ADR-0003-http-transport-priority.md`)
- **SDR**: `SDR-NNN-short-title.md` (e.g., `SDR-003-cve-remediation-policy.md`)
- **DDR**: `DDR-NNN-short-title.md` (e.g., `DDR-001-cli-color-scheme.md`)

### Templates

- **ADR Template**: See [ADR-0001](adr/ADR-0001-mcp-session-id.md) for format
- **SDR Template**: See [sdr/TEMPLATE.md](sdr/TEMPLATE.md)
- **DDR Template**: See [ddr/TEMPLATE.md](ddr/TEMPLATE.md)

### When to Create a Decision Record

| Trigger                                                               | Record Type |
| --------------------------------------------------------------------- | ----------- |
| API design, protocol changes, infrastructure choices                  | ADR         |
| Vulnerability findings, security policy changes, compliance decisions | SDR         |
| CLI UX changes, frontend design choices, user-facing behavior         | DDR         |

## Role Responsibilities

- **cicd**: Reviews ADRs affecting CI/CD, SDRs for vulnerability management
- **qa**: Validates decision implementations match documented behavior
- **secrev**: Authors and reviews SDRs, security-related ADRs
- **uxdev**: Authors DDRs, reviews user-facing ADRs
- **devlead**: Authors ADRs, implements decisions
- **devrev**: Reviews all decision records for correctness

## SSOT Principle

This directory is the **Single Source of Truth** for decisions. Other documentation should link here rather than duplicating decision rationale.

## References

- [AGENTS.md](../../AGENTS.md) - Agent guidelines and commit attribution
- [RELEASE_CHECKLIST.md](../../RELEASE_CHECKLIST.md) - Release process including decision review
- [FulmenHQ Crucible](https://github.com/fulmenhq/crucible) - Ecosystem standards
