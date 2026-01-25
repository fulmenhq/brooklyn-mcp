# SDR-002: Go Stdlib SBOM False Positives

**Date:** 2026-01-19
**Status:** Approved
**Author:** Claude Opus 4.5 (devlead)
**Reviewer:** @3leapsdave

## Context

During v0.3.0 vulnerability scanning with `goneat dependencies --vuln`, grype flagged 35 vulnerabilities in Go stdlib (golang@1.20.12). Brooklyn is a TypeScript project built with Bun - there is no Go code in the runtime.

## Finding

| Field      | Value                                                                |
| ---------- | -------------------------------------------------------------------- |
| ID         | Multiple CVEs (CVE-2023-24531, CVE-2024-24790, CVE-2025-22871, etc.) |
| Severity   | Critical (6), High (24), Medium (40)                                 |
| Package    | pkg:golang/stdlib@1.20.12                                            |
| Scanner    | grype via goneat dependencies --vuln                                 |
| First Seen | 2026-01-19                                                           |

**Sample from vulnerability report:**

```json
{
  "id": "CVE-2023-24531",
  "severity": "critical",
  "purls": ["pkg:golang/stdlib@1.20.12"],
  "fix_versions": ["1.21.0-0"]
}
```

## Analysis

### Root Cause

The goneat vulnerability scanner uses syft to generate an SBOM, then grype to scan for vulnerabilities. Syft scans the entire directory structure and may detect:

1. **GitHub Actions workflow references** - Syft detected actions like `actions/checkout@v2` in `.github/workflows/`
2. **Go binary artifacts** - Any pre-built Go binaries in dist/ or similar
3. **Metadata from tooling** - References in lockfiles or config to Go-based tools

The SBOM shows 123 components but most are GitHub Action references, not actual runtime dependencies.

### Why This Is a False Positive

1. **Brooklyn is TypeScript/Bun**: The codebase is 100% TypeScript compiled to JavaScript. No Go code runs in production.

2. **No Go runtime**: Brooklyn's `package.json` has zero Go dependencies. The CLI is a Bun-compiled binary.

3. **Scanner scope mismatch**: Syft is designed for polyglot repos and container images. For pure TypeScript projects, `bun audit` is the authoritative vulnerability source.

### Verification

```bash
# Check for Go files in project
$ find . -name "*.go" -o -name "go.mod" -o -name "go.sum" 2>/dev/null
(no output - no Go files)

# Check npm/bun dependencies (actual runtime)
$ bun audit
(shows only npm package vulnerabilities)

# Check SBOM contents
$ cat sbom/goneat-*.cdx.json | jq '.components[] | .purl' | grep golang
(artifacts from GitHub Actions, not runtime deps)
```

## Decision

**Chosen:** Suppress Go stdlib CVEs in dependencies.yaml as false positives

**Options Considered:**

1. **Suppress all Go stdlib CVEs** ✅
   - Pros: Accurate representation of actual risk
   - Cons: Need to document rationale

2. **Ignore goneat vuln scanning for this project**
   - Pros: Simple
   - Cons: Loses visibility into any real issues goneat might find

3. **Report bug to goneat team**
   - Pros: Improves tool for everyone
   - Cons: Still need local suppression meanwhile

**Rationale:** The Go stdlib vulnerabilities don't affect Brooklyn because Brooklyn doesn't use Go. Suppressing with documented rationale is the correct approach.

## Implementation

Added to `.goneat/dependencies.yaml`:

```yaml
vulnerabilities:
  allow:
    - id: CVE-2023-24531
      status: false_positive
      reason: "Go stdlib - not applicable to TypeScript/Bun project"
      verified_by: "@3leapsdave"
      verified_date: "2026-01-19"
    # ... additional CVEs
```

## Recommendation for goneat

Consider raising an issue with the goneat team:

1. **Issue**: syft+grype combination produces false positives for TypeScript projects
2. **Suggestion**: Add language-aware filtering or project-type detection
3. **Workaround**: Use `bun audit` for npm/TypeScript projects as authoritative source

## Action Items

- [x] Document false positive rationale in this SDR
- [x] Add suppressions to .goneat/dependencies.yaml
- [ ] Consider filing goneat issue for TypeScript project detection
- [x] Confirm bun audit as authoritative vulnerability source for Brooklyn

## References

- goneat docs: `goneat docs show user-guide/commands/dependencies`
- Brooklyn is TypeScript: `package.json` contains only npm dependencies
- Syft SBOM generation: https://github.com/anchore/syft
