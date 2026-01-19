# ADR: Tool Inventory Generation

**Status**: Accepted
**Date**: 2026-01-18
**Authors**: prodmktg, devlead

## Context

Brooklyn MCP exposes 79 tools across 11 categories. However, discovering these tools required:
- Running a Brooklyn server and using MCP's `tools/list` method
- Reading source code (`tool-definitions.ts`, `onboarding-tools.ts`)
- Trusting documentation that may be out of date

This created problems for:
- **Human users** browsing the GitHub repository
- **AI agents** trying to understand Brooklyn's capabilities without running it
- **Documentation** that referenced "50+ tools" when the actual count was 79

## Decision

We generate and **commit** tool inventory files as part of the release process:

- `docs/tools/tool-inventory.json` - Machine-readable, full schemas
- `docs/tools/tool-inventory.md` - Human-readable markdown tables

### Why Commit Rather Than Build Artifacts

| Consideration | Build Artifact | Committed File |
|---------------|----------------|----------------|
| GitHub search indexing | No | Yes |
| Visible without cloning/building | No | Yes |
| Can link from README | Via raw URL only | Relative links |
| AI agent discoverability | Requires fetch | Direct read |
| Potential commit churn | N/A | Mitigated (see below) |

The commit churn risk is acceptable because the generator is **deterministic**:
- Tools sorted alphabetically by name
- JSON keys sorted recursively
- No timestamps or build IDs
- Idempotent output (same input = identical output)

### Generator Design

Location: `scripts/generate-tool-inventory.ts`

```bash
# Generate inventory (development)
bun scripts/generate-tool-inventory.ts

# Check for drift (CI)
bun scripts/generate-tool-inventory.ts --check
```

The `--check` flag enables CI to fail if the committed files are out of sync with the source tool definitions.

## Consequences

### Positive

1. **Discoverability**: Users and AI agents can explore tools without running Brooklyn
2. **Searchability**: GitHub indexes the files for repository search
3. **Documentation accuracy**: Tool count and descriptions always match source
4. **AI-friendly**: JSON format enables programmatic capability discovery

### Negative

1. **Maintenance overhead**: Must regenerate when tools change
2. **Review noise**: Tool changes produce two additional file diffs

### Mitigations

- CI check ensures inventory stays in sync
- Deterministic output minimizes unnecessary diffs
- Clear header in markdown warns against manual edits

## Related

- [AGENTS.md](../../../AGENTS.md) - Policy on generated files
- [scripts/generate-tool-inventory.ts](../../../scripts/generate-tool-inventory.ts) - Generator implementation
- [docs/tools/tool-inventory.md](../../tools/tool-inventory.md) - Generated output
