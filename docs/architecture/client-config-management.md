# Client Configuration Management (MCP)

This document describes Brooklyn's approach to managing MCP client configurations across popular IDEs and agent CLIs while preserving existing user setups.

## Goals

- Safe, non-destructive updates to client config files
- One unified UX to configure multiple clients (Cursor, VSCodium/Cline, Kilocode, Codex CLI)
- Clear transport policy (stdio vs http) with machine-wide recommendations
- Extensible registry of clients with capabilities and schema-aware patching

## Design Principles

- Non-destructive writes: only patch the `brooklyn` entry; never wipe other MCP servers
- Backups by default: timestamped `.bak.YYYYMMDD-HHMMSS` before any write
- Dry-run first: preview changes unless `--apply` is given
- Explicit targeting: `--product Code|VSCodium|Cursor|Windsurf` for user-wide writes
- Minimal footprint: leave Cursor on `stdio` by default; use `http` for multi-editor setups

## Client Registry

Each client definition includes:

- Supported transports: `stdio` and/or `http`
- Locations: user and/or project file paths
- Read/patch/write handlers for file format (JSON or TOML)
- Capability flags (e.g., Cursor supports stdio only)

The registry enables a data-driven approach to adding new clients.

## Patch Strategy

- JSON clients (Cursor, Cline, Kilocode):
  - Parse → ensure `mcpServers` → set/remove `mcpServers.brooklyn` only
  - Preserve other servers and keys; pretty-print with 2-space indent
- TOML client (Codex CLI):
  - Parse → modify only `[mcp_servers.brooklyn]` table → serialize
  - Note: comments/order may change; backups mitigate risk

## Transport Policy

- stdio: simplest local workflows; editor manages lifecycle
- http: machine-wide, multi-editor; run a single background server
- remote: inherently http

Brooklyn Doctor recommends `http` when multiple editors with MCP configs are detected; otherwise stdio.

### Client-specific constraints

- Cline (Claude Dev): Today, Cline’s remote MCP expects Server‑Sent Events (SSE). Brooklyn’s dev-http currently exposes JSON/JSON‑RPC endpoints (not SSE). Therefore, configure Cline with stdio. When SSE support lands, we can enable HTTP for Cline.

## Command Model

- `brooklyn client configure` – add/update Brooklyn MCP entry
- `brooklyn client remove` – remove Brooklyn MCP entry only
- `brooklyn client list` – list detected clients/locations/servers
- `brooklyn client doctor` – focused client diagnostics and suggestions
- `brooklyn client snapshot` – backup all configs + manifest (future)
- `brooklyn client reconcile` – enforce intended state across products (future)

## Testing & Safety

- Always exercise dry-run first in automated flows
- Use snapshots before reconcile/cleanup operations
- Verify IDEs reload configs (e.g., Developer: Reload Window)
