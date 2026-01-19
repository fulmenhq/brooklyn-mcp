---
title: "Security Operations"
description: "Security posture, scanning, and disclosure procedures"
status: "active"
---

# Security Operations

This directory contains security documentation for Brooklyn MCP including vulnerability scanning configuration, security decision records, and disclosure procedures.

## Quick Reference

| Task | Command |
|------|---------|
| NPM vulnerability scan | `bun audit` |
| Goneat vulnerability scan | `goneat dependencies --vuln .` |
| License compliance | `bun run license:scan` |
| Full dependency check | `goneat dependencies --licenses --cooling --vuln .` |

## Security Decision Records (SDRs)

Security-related decisions are documented in `decisions/`:

| SDR | Title | Status |
|-----|-------|--------|
| [SDR-001](decisions/SDR-001-npm-transitive-dependency-overrides.md) | NPM Transitive Dependency Overrides | Approved |
| [SDR-002](decisions/SDR-002-go-stdlib-sbom-false-positives.md) | Go Stdlib SBOM False Positives | Approved |

### When to Create an SDR

Create a Security Decision Record when:

- Suppressing or allowing a vulnerability finding
- Adding package overrides for security reasons
- Making exceptions to security policies
- Documenting false positive analysis

Use [decisions/TEMPLATE.md](decisions/TEMPLATE.md) as starting point.

## Vulnerability Scanning

### Authoritative Sources

| Language | Scanner | Authority |
|----------|---------|-----------|
| TypeScript/npm | `bun audit` | Primary |
| Go | `goneat dependencies --vuln` | Primary |
| Multi-language | `goneat dependencies --vuln` | Secondary |

For Brooklyn (TypeScript project), `bun audit` is the authoritative vulnerability source. Goneat's syft+grype scanner may produce false positives for non-Go projects.

### Configuration

Vulnerability scanning is configured in `.goneat/dependencies.yaml`:

```yaml
vulnerabilities:
  enabled: true
  fail_on: none  # or: low, medium, high, critical
  allow:
    - id: CVE-YYYY-NNNNN
      status: false_positive
      reason: "Documented reason"
      sdr: docs/ops/security/decisions/SDR-NNN-title.md
```

## Runtime Safety

See [BROOKLYN-SAFETY-PROTOCOLS.md](../../../BROOKLYN-SAFETY-PROTOCOLS.md) for browser automation safety requirements.

## Disclosure

For security vulnerability reports, see [SECURITY.md](https://github.com/3leaps/oss-policies/blob/main/SECURITY.md).

## References

- [goneat dependency scanning](https://github.com/fulmenhq/goneat) - `goneat docs show user-guide/commands/dependencies`
- [Bun audit](https://bun.sh/docs/cli/audit)
- [OWASP Dependency Check](https://owasp.org/www-project-dependency-check/)
