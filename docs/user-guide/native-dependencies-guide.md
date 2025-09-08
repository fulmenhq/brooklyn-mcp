# Native Dependencies Installation Guide (v0.2.0)

As of v0.2.0, Brooklyn introduces image processing (SVG→PNG initially) uses browser‑based rendering.
This guide covers the remaining native dependencies (primarily SVGO) and general setup tips.

## Overview

- SVGO: SVG optimization toolkit for compression and analysis
- HarfBuzz (future): Advanced text shaping for typography features

## Quick Installation

```bash
npm install svgo
```

## Platform Notes

- macOS: Ensure Xcode CLI tools are installed (`xcode-select --install`) for general native builds.
- Linux: Ensure build tools are installed (e.g., `build-essential` on Debian/Ubuntu) for general development.
- Windows: Install Visual Studio Build Tools for native module support.

## Common Issues

- Use `brooklyn doctor --json` for quick diagnostics.
- Ensure npm global bins are in PATH if using SVGO CLI.

## Verification and Testing

- Use Brooklyn SVG tools to validate rendering: `convert_svg_to_png`, `convert_svg_to_multi_png`.

## Best Practices

- Prefer browser-based rendering for image operations to avoid native dependencies.
- Keep SVGO updated for security patches.
- Document your SVGO version for reproducibility.
