# Package Licensing Standards - Brooklyn MCP

**Version**: 1.0  
**Last Updated**: September 9, 2025  
**Maintained By**: Brooklyn MCP Platform Team  
**Review Cycle**: Quarterly

## Overview

Brooklyn MCP maintains strict licensing standards to ensure legal compliance, enterprise readiness, and open source compatibility. This document defines our approach to dependency licensing, automated scanning, and decision-making processes.

## 🚨 MANDATORY: License Compliance Gate

**ALL commits must pass license scanning before merge:**

```bash
# Pre-commit license validation
bun run license:scan:strict

# This command MUST exit with code 0 for commit approval
```

**Failure modes that block commits:**

- Unknown/missing license information
- GPL-family licenses (copyleft conflicts)
- Custom licenses requiring legal review
- Packages with no license file or declaration

## License Categories

### ✅ **APPROVED LICENSES** (Auto-Approved)

These licenses are pre-approved for use in Brooklyn MCP and pass automated scanning:

| License               | SPDX ID         | Use Case                 | Notes                                 |
| --------------------- | --------------- | ------------------------ | ------------------------------------- |
| MIT                   | `MIT`           | General use              | Most common, highly permissive        |
| Apache 2.0            | `Apache-2.0`    | General use              | Patent grant included                 |
| BSD 2-Clause          | `BSD-2-Clause`  | General use              | Original BSD with attribution         |
| BSD 3-Clause          | `BSD-3-Clause`  | General use              | BSD with non-endorsement clause       |
| ISC                   | `ISC`           | General use              | Simplified BSD variant                |
| Creative Commons Zero | `CC0-1.0`       | Public domain            | No rights reserved                    |
| Zero-Clause BSD       | `0BSD`          | Public domain equivalent | No attribution required               |
| Blue Oak Model        | `BlueOak-1.0.0` | General use              | Modern permissive with patent clarity |

**Dual-licensed packages** are approved when at least one license is from the approved list:

- `MIT OR Apache-2.0` ✅ (Biome, etc.)
- `(MIT OR CC0-1.0)` ✅ (type-fest, etc.)

### ⚠️ **REVIEW REQUIRED** (Manual Approval)

These licenses require case-by-case review by maintainers:

| License Category        | Examples                    | Review Criteria                       |
| ----------------------- | --------------------------- | ------------------------------------- |
| Non-standard permissive | Custom MIT variants         | Compatible with project goals?        |
| Weak copyleft           | LGPL-2.1+, MPL-2.0          | Linking restrictions acceptable?      |
| Business licenses       | Commercial licenses         | Terms compatible with enterprise use? |
| Academic licenses       | Various university licenses | Patent and attribution implications   |

**Review Process:**

1. Package identified by automated scanning
2. Legal review by @3leapsdave or designated maintainer
3. Decision documented in this file or commit message
4. Allowlist updated if approved

### ❌ **FORBIDDEN LICENSES** (Automatic Rejection)

These licenses are incompatible with Brooklyn MCP's enterprise mission:

| License Category    | SPDX Patterns            | Reason                                 |
| ------------------- | ------------------------ | -------------------------------------- |
| Strong Copyleft     | `GPL-*`, `AGPL-*`        | Copyleft conflicts with enterprise use |
| Proprietary         | Commercial-only licenses | Incompatible with open source          |
| Advertising Clauses | BSD-4-Clause variants    | Incompatible advertising requirements  |
| No License          | `UNLICENSED`             | No usage rights granted                |

**Automatic blocking patterns:**

- Any license starting with `GPL`, `LGPL`, `AGPL`
- Packages with no license declaration
- Licenses marked as `UNKNOWN` by scanner

## Automated License Scanning

### Scanner Implementation

Our license scanner (`scripts/compliance/license-scan.ts`) provides:

- **Comprehensive Coverage**: Scans all dependencies including nested packages
- **Strict Enforcement**: Fails CI/CD on policy violations
- **SPDX Normalization**: Uses standard license identifiers
- **Legal Documentation**: Generates THIRD_PARTY_NOTICES.md for compliance

### Scan Commands

```bash
# Development scanning (informational)
bun run license:scan

# CI/CD enforcement (exits 1 on violations)
bun run license:scan:strict

# Check specific dependency
cat dist/licenses/licenses.json | jq '.[] | select(.name == "package-name")'
```

### Output Files

| File                                   | Purpose                            |
| -------------------------------------- | ---------------------------------- |
| `dist/licenses/licenses.json`          | Machine-readable license inventory |
| `dist/licenses/THIRD_PARTY_NOTICES.md` | Legal compliance documentation     |

## Enterprise Policy Alignment

### Commercial Use Requirements

Brooklyn MCP dependencies must support:

- **Commercial Distribution**: No restrictions on commercial use
- **Proprietary Integration**: Can be bundled with proprietary software
- **Enterprise Deployment**: No viral licensing that affects enterprise customers
- **Patent Clarity**: Clear patent grant or no patent restrictions

### Open Source Compatibility

Our license choices maintain compatibility with:

- **MIT/Apache ecosystems**: Standard JavaScript/TypeScript tooling
- **Enterprise software**: Can be embedded in commercial products
- **Government use**: No restrictions on government deployment
- **International use**: No geographic restrictions

## Decision Framework

### Adding New Dependencies

Before adding any new dependency:

1. **Check License**: `npm info package-name license`
2. **Verify Compatibility**: Compare against approved license list
3. **Document Decision**: Add to commit message if non-standard
4. **Update Scanner**: Add to allowlist if approved

### Handling License Changes

When dependency licenses change:

1. **Immediate Scan**: Check if change affects compliance
2. **Risk Assessment**: Evaluate impact on enterprise use
3. **Decision Process**: Approve, find alternative, or remove dependency
4. **Documentation**: Update this SOP if needed

### Emergency Overrides

For critical security fixes or business needs:

1. **Temporary Approval**: Document in commit message
2. **Follow-up Required**: Legal review within 30 days
3. **Resolution Plan**: Replace, approve permanently, or remove

## Compliance Verification

### Release Checklist

Before any release:

- [ ] `bun run license:scan:strict` passes
- [ ] `dist/licenses/THIRD_PARTY_NOTICES.md` generated
- [ ] No unknown or forbidden licenses present
- [ ] All licenses documented and approved

### Audit Requirements

**Quarterly Reviews:**

- Review all dependencies for license changes
- Update scanner allowlist as needed
- Document any new license decisions
- Verify enterprise compliance requirements

**Annual Reviews:**

- Full legal review of license policy
- Update forbidden/review-required lists
- Align with evolving enterprise requirements
- Update scanner implementation if needed

## Legal References

### License Texts

- MIT: https://opensource.org/licenses/MIT
- Apache 2.0: https://opensource.org/licenses/Apache-2.0
- BSD variants: https://opensource.org/licenses/BSD-3-Clause
- Blue Oak Model: https://blueoakcouncil.org/license/1.0.0
- OSI Approved: https://opensource.org/licenses/

### Policy Documents

- Fulmen Enterprise Standards: `docs/fulmen/enterprise-standards.md`
- Brooklyn Safety Protocols: `BROOKLYN-SAFETY-PROTOCOLS.md`
- Release Process: `docs/ops/release/RELEASE_CHECKLIST.md`

## Implementation History

### v1.0 (September 2025)

- Initial license policy establishment
- Automated scanner implementation
- Approved license list based on Brooklyn MCP v0.2.1 audit
- Added BlueOak-1.0.0 and 0BSD to explicit allowlist

### Current Status

- ✅ 257 packages scanned, zero violations
- ✅ 100% permissive license compliance
- ✅ Enterprise-ready dependency licensing
- ✅ Automated CI/CD enforcement

---

**🌉 Paris Brooklyn - MCP Platform Architect**

_"License compliance enables enterprise trust"_

---

**Document Classification**: Public  
**Compliance Level**: Enterprise Required  
**Legal Review**: @3leapsdave approved
