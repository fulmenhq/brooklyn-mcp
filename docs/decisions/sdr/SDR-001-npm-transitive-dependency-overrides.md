# SDR-001: NPM Transitive Dependency Vulnerability Overrides

**Date:** 2026-01-19
**Status:** Approved
**Author:** Claude Opus 4.5 (devlead)
**Reviewer:** @3leapsdave

## Context

During v0.3.0 release preparation, `bun audit` identified 3 vulnerabilities in transitive npm dependencies. All vulnerabilities are in packages we don't control directly - they're dependencies of our dependencies. Patched versions exist upstream but our direct dependencies haven't updated yet.

## Findings

### Finding 1: qs DoS via Memory Exhaustion

| Field       | Value               |
| ----------- | ------------------- |
| ID          | GHSA-6rw7-vpxm-498p |
| Severity    | High                |
| Package     | qs@6.14.0           |
| Scanner     | bun audit           |
| First Seen  | 2026-01-19          |
| Fix Version | >=6.14.1            |

**Dependency Path:** `@modelcontextprotocol/sdk → express → body-parser → qs`

### Finding 2: body-parser DoS via URL Encoding

| Field       | Value               |
| ----------- | ------------------- |
| ID          | GHSA-wqch-xfxh-vrr4 |
| Severity    | Moderate            |
| Package     | body-parser@2.2.0   |
| Scanner     | bun audit           |
| First Seen  | 2026-01-19          |
| Fix Version | >=2.2.1             |

**Dependency Path:** `@modelcontextprotocol/sdk → express → body-parser`

### Finding 3: esbuild Dev Server CORS Issue

| Field       | Value               |
| ----------- | ------------------- |
| ID          | GHSA-67mh-4wv8-2f99 |
| Severity    | Moderate            |
| Package     | esbuild@0.24.2      |
| Scanner     | bun audit           |
| First Seen  | 2026-01-19          |
| Fix Version | >0.24.2             |

**Dependency Path:** `vitest → vite-node → vite → esbuild`

## Analysis

### Why Overrides Are Needed

1. **@modelcontextprotocol/sdk (v1.25.2)**: We're on the latest available version. The SDK bundles express which bundles body-parser which bundles qs. We cannot upgrade the transitive chain by updating our direct dependency.

2. **vitest (v2.0.0)**: We're on vitest 2.x. The esbuild vulnerability is in the vite toolchain used for test bundling. vitest would need to update its vite dependency to get a newer esbuild.

### Risk Assessment

| Vulnerability | Production Impact      | Development Impact | Risk   |
| ------------- | ---------------------- | ------------------ | ------ |
| qs            | HTTP endpoints exposed | N/A                | High   |
| body-parser   | HTTP endpoints exposed | N/A                | Medium |
| esbuild       | None (dev only)        | Dev server CORS    | Low    |

The qs and body-parser vulnerabilities affect Brooklyn's HTTP transport which serves MCP requests. An attacker could craft malicious payloads to cause DoS.

## Decision

**Chosen:** Apply npm/bun package overrides to force patched versions

**Options Considered:**

1. **Wait for upstream updates**
   - Pros: No compatibility risk, upstream-tested
   - Cons: Unknown timeline, leaves vulnerabilities unpatched

2. **Apply package overrides** ✅
   - Pros: Immediate remediation, patched versions are stable
   - Cons: Potential compatibility issues (mitigated by testing)

3. **Fork and patch dependencies**
   - Pros: Full control
   - Cons: Maintenance burden, overkill for simple version bumps

**Rationale:** The patched packages (qs@6.14.1, body-parser@2.2.1, esbuild@0.25.0) are minor version bumps with backward-compatible APIs. The overrides approach is standard practice for transitive vulnerability remediation.

## Implementation

Added to `package.json`:

```json
{
  "overrides": {
    "qs": ">=6.14.1",
    "body-parser": ">=2.2.1",
    "esbuild": ">=0.25.0"
  }
}
```

## Verification

```bash
# Before overrides
$ bun audit
3 vulnerabilities (1 high, 2 moderate)

# After overrides
$ bun install
$ bun audit
0 vulnerabilities found

# Full quality gate
$ make prepush
✅ All checks pass
```

## Action Items

- [x] Add overrides to package.json
- [x] Run bun install to update lockfile
- [x] Verify bun audit shows 0 vulnerabilities
- [x] Run full test suite to confirm compatibility
- [ ] Monitor upstream packages for native fixes
- [ ] Remove overrides when direct dependencies update

## Monitoring

When these dependencies are updated upstream, remove the corresponding override:

| Override    | Remove When                                             |
| ----------- | ------------------------------------------------------- |
| qs          | @modelcontextprotocol/sdk ships with qs>=6.14.1         |
| body-parser | @modelcontextprotocol/sdk ships with body-parser>=2.2.1 |
| esbuild     | vitest ships with esbuild>0.24.2                        |

## References

- https://github.com/advisories/GHSA-6rw7-vpxm-498p
- https://github.com/advisories/GHSA-wqch-xfxh-vrr4
- https://github.com/advisories/GHSA-67mh-4wv8-2f99
- https://bun.sh/docs/install/overrides
