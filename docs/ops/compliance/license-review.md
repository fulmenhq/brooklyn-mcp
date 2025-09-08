---
title: "License Review (Minimal Tooling)"
description: "Process and obligations for third-party license compliance"
status: "draft"
---

# License Review (Minimal Tooling)

Goals

- Inventory all third-party dependencies (including transitive) with their licenses.
- Provide license texts/notices to end users as required.
- Flag unknown or disallowed licenses before GA.

Process

1. Run the license scanner:
   ```bash
   bun run license:scan           # inventory + notices
   bun run license:scan:strict    # fail on unknown/disallowed (CI gate for GA)
   ```
2. Outputs are written to:
   - `dist/licenses/licenses.json` (machine-readable inventory)
   - `dist/licenses/THIRD_PARTY_NOTICES.md` (human-readable notices)
3. Attach `THIRD_PARTY_NOTICES.md` to GitHub Releases and include in archives.

Policy

- Allowlist: MIT, BSD-2-Clause, BSD-3-Clause, Apache-2.0, ISC, CC0-1.0
- Disallowed: GPL/LGPL/AGPL families unless explicitly approved
- Unknown license: must be resolved before GA

Future

- Replace this minimal scanner with the org-wide binary tool when ready.
