# SOP: Client MCP Configuration Management

## Purpose

Define a safe, repeatable process for managing MCP client configurations across editors and agent CLIs using Brooklyn's `client` commands.

## Golden Rules

- Never destroy unrelated config: only modify the `brooklyn` entry
- Always backup before writing (`.bak.YYYYMMDD-HHMMSS`)
- Prefer dry-run previews in automation; require `--apply` for changes
- Be explicit when targeting editors with `--product Code|VSCodium|Cursor|Windsurf`
- Recommend `http` transport for multi-editor setups; `stdio` for simple local usage

## Commands

- `brooklyn client configure` – add/update Brooklyn entry
- `brooklyn client remove` – remove Brooklyn entry only
- `brooklyn client list` – list detected clients and MCP servers
- `brooklyn client doctor` – diagnostics + transport recommendation
- `brooklyn client snapshot` – backup configs to a timestamped bundle (future)
- `brooklyn client reconcile` – enforce policy (future)

## Safety Checklist

1. Run `brooklyn client doctor --json` and review detected configs
2. Decide transport policy (stdio vs http) for this machine/team
3. Run `brooklyn client configure --dry-run` to preview changes
4. Backup is created automatically on `--apply` (keep for rollback)
5. Reload editors (e.g., Developer: Reload Window) after changes

## JSON Patch Strategy

- Ensure `mcpServers` exists; set/remove `mcpServers.brooklyn`
- Retain all other keys/servers
- Pretty-print with 2 spaces; always add trailing newline

## TOML Patch Strategy (Codex)

- Parse `~/.codex/config.toml`
- Add/replace only `[mcp_servers.brooklyn]` section
- Note: comments/order may change; rely on backups for rollback

## Rollback

- Use `.bak.*` files in-place to restore previous state
- `brooklyn client snapshot` (future) will create a single zip + manifest
