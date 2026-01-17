# Brooklyn MCP Configuration Guide

## Overview

Brooklyn is **HTTP-first**: run one long-lived Brooklyn HTTP server and connect multiple agent clients to it.

This guide covers how to configure Brooklyn after installation, with a focus on MCP integration for agent clients.

## Installation

Brooklyn installs as a single binary to your system:

```bash
# User installation (recommended)
bun run install

# This installs brooklyn to:
# macOS/Linux: ~/.local/bin/brooklyn
# Windows: %LOCALAPPDATA%\Brooklyn\brooklyn.exe
```

After installation, the `brooklyn` command is available system-wide (assuming `~/.local/bin` is in your PATH).

## MCP Configuration for Claude Code

### Quick Setup (Recommended)

Use the Claude Code CLI to add Brooklyn:

```help-text-mcp-setup
Recommended: Start Brooklyn HTTP server for multi-agent workflows

1. Start server (once per machine):
   brooklyn web start --port 3000 --auth-mode required --daemon

2. Add to Claude Code:
   claude mcp add -s user -t http brooklyn http://127.0.0.1:3000

3. Verify installation:
   brooklyn_status  # Run in Claude Code - shows version and 50+ tools
   brooklyn doctor --json  # Run in terminal - comprehensive health check

For detailed setup: docs/deployment/unified-deployment.md

Legacy single-agent only (stdio transport):
  claude mcp add -s user -t stdio brooklyn brooklyn mcp start
  Warning: stdio does not support multiple agents simultaneously
```

> `--auth-mode` defaults to `required`. For loopback-only prototypes you may temporarily run `brooklyn web start --auth-mode localhost`, but switch back to `required` (or supply a token) before exposing the port outside your machine.

### With Environment Variables

Add Brooklyn with team-specific configuration:

```bash
# Add with environment variables (HTTP transport)
claude mcp add -s user -t http brooklyn http://127.0.0.1:3000 \
  -e BROOKLYN_TEAM_ID=your-team \
  -e BROOKLYN_HTTP_AUTH_MODE=required \
  -e BROOKLYN_LOG_LEVEL=info
```

### Legacy Manual Configuration (Not Recommended)

**⚠️ WARNING**: Manual JSON configuration is for Claude Desktop app only, not Claude Code CLI.

For manual configuration, see the Claude Code documentation for setting up MCP servers.

### Configuration Scopes

Brooklyn supports different configuration scopes:

```bash
# User-wide configuration (recommended HTTP default)
brooklyn config agent --client claude --scope user --transport http --host 127.0.0.1 --port 3000 --apply

# Project-specific configuration (HTTP transport)
brooklyn config agent --client cursor --scope project --transport http --host 127.0.0.1 --port 3000 --apply

# Legacy stdio (single-agent only; avoid for multi-agent workflows)
brooklyn config agent --client claude --scope user --transport stdio --apply

# Check current configuration
brooklyn mcp status
```

### HTTP Authentication Modes

| Mode        | Behavior                                                      | Default Command         |
| ----------- | ------------------------------------------------------------- | ----------------------- |
| `required`  | Non-OAuth routes demand `Authorization: Bearer <token>`       | `brooklyn web start`    |
| `localhost` | Loopback clients may connect anonymously; others need a token | Manual opt-in           |
| `disabled`  | No auth checks (CI/dev only)                                  | `brooklyn mcp dev-http` |

Set modes via `--auth-mode <value>` or environment variables:

```bash
# Enforce tokens but trust a proxy chain
BROOKLYN_HTTP_AUTH_MODE=required \
BROOKLYN_HTTP_TRUSTED_PROXIES=10.0.0.5,10.0.0.6 \
brooklyn web start --host 0.0.0.0 --port 3000 --daemon

# Secure dev-http for integration tests
brooklyn mcp dev-http --port 8080 --team-id qa --auth-mode required
```

Use `--auth-mode localhost` sparingly for loopback-only machines, and keep `BROOKLYN_HTTP_AUTH_MODE=required` anywhere the port is reachable over the network.

## Streamable HTTP sessions (`Mcp-Session-Id`)

Brooklyn supports MCP Streamable HTTP session correlation via `Mcp-Session-Id`, but it is not required in v0.3.x.

SSOT: `docs/architecture/adr/ADR-0001-mcp-session-id.md`

## Dual-Mode Operation

### Understanding the Modes

**MCP Mode (Claude Code)**:

- Started automatically by Claude Code when needed
- Communicates via stdin/stdout using MCP protocol
- No persistent process - starts/stops with Claude Code
- Logs to stderr and log files (never stdout)
- Designed for AI tool integration

**Web Mode (Monitoring & APIs)**:

- Started manually by users
- Runs as HTTP server on configurable port
- Can run as foreground process or daemon
- Provides REST APIs and monitoring dashboard
- Designed for human interaction and system integration

### Running Both Modes

Both modes can run simultaneously without conflict:

```bash
# Terminal 1: Start web server for monitoring
brooklyn web start --port 3000

# Terminal 2: Claude Code automatically starts MCP mode
# (No action needed - Claude manages this)
```

The modes share:

- Browser pool (prevents resource duplication)
- Configuration settings
- Log collection system
- Security policies

The modes differ in:

- Communication protocol (stdin/stdout vs HTTP)
- Lifecycle management (Claude-managed vs user-managed)
- Primary use case (AI tools vs human/system APIs)

## Environment Variables

Brooklyn respects environment variables for configuration:

```bash
# Core settings
export BROOKLYN_PORT=3000              # Web server port
export BROOKLYN_LOG_LEVEL=debug        # Logging verbosity
export BROOKLYN_TEAM_ID=engineering    # Team identifier
export BROOKLYN_HTTP_AUTH_MODE=required      # required|localhost|disabled
export BROOKLYN_HTTP_TRUSTED_PROXIES=10.0.0.5,10.0.0.6  # optional proxy allowlist

# Browser settings
export BROOKLYN_MAX_BROWSERS=5         # Browser pool limit
export BROOKLYN_HEADLESS=true          # Headless browser mode

# Security settings
export BROOKLYN_ALLOWED_DOMAINS=example.com,test.com
export BROOKLYN_RATE_LIMIT=100         # Requests per minute
```

### Configuration Precedence

1. Command-line flags (highest priority)
2. Environment variables in MCP config
3. System environment variables
4. Configuration file (if specified)
5. Built-in defaults (lowest priority)

## Client Property Files

Brooklyn ships a safe patcher so you do not have to hand-edit configuration files. Use `brooklyn config agent --client <name> ... --apply` to populate the file that each IDE/agent reads.

### `.mcp.json` (Claude Desktop, Cursor)

Lives in the project root and is ideal for stdio transports:

```json
{
  "mcpServers": {
    "brooklyn": {
      "command": "brooklyn",
      "args": ["mcp", "start"],
      "env": {
        "BROOKLYN_TEAM_ID": "demo"
      }
    }
  }
}
```

Create/update it with:

```bash
brooklyn config agent --client project --scope project --transport stdio --team-id demo --apply
```

### `opencode.json` (OpenCode / Windsurf)

Supports HTTP remotes in either user scope (`~/.config/opencode/opencode.json`) or the current repo:

```json
{
  "mcp": {
    "brooklyn": {
      "type": "remote",
      "url": "http://127.0.0.1:3000",
      "enabled": true
    }
  }
}
```

Generate it with:

```bash
brooklyn config agent --client opencode --scope user --transport http --host 127.0.0.1 --port 3000 --apply
```

Pair remote entries with `brooklyn web start --auth-mode required` so tokens are enforced, or temporarily run `--auth-mode localhost` when everything stays on the same machine.

### `~/.codex/config.toml`

Codex CLI uses TOML:

```toml
[mcp_servers.brooklyn]
url = "http://127.0.0.1:3000/mcp"
```

Populate it with:

```bash
brooklyn config agent --client codex --scope user --transport http --host 127.0.0.1 --port 3000 --apply

# Codex expects the MCP endpoint path:
#   http://127.0.0.1:3000/mcp
```

## Validating Your Setup

After configuration, validate everything works:

```bash
# Check Brooklyn installation
brooklyn version

# Validate MCP configuration
brooklyn mcp status

# Test MCP connection (requires Claude Code restart)
# In Claude Code, you should see Brooklyn tools available
```

## Troubleshooting

### MCP Mode Issues

```help-text-mcp-troubleshooting
## Quick Diagnostics

Run health check first:
  brooklyn doctor --json     # Comprehensive system check
  brooklyn_status            # Verify version and tools (in Claude Code)

## Tools Not Appearing

For HTTP transport:
  1. Verify server running: brooklyn status
  2. Reconnect MCP: /mcp (in Claude Code)
  3. Check server health: curl http://localhost:3000/health
  4. Restart server if needed:
     brooklyn web cleanup --port 3000
     brooklyn web start --port 3000 --daemon

For stdio transport:
  1. Reconnect MCP: /mcp (in Claude Code)
  2. Clean up processes: brooklyn mcp cleanup
  3. Verify binary: which brooklyn && brooklyn --version
  4. Alternative: Remove and re-add:
     claude mcp remove brooklyn
     claude mcp add -s user -t stdio brooklyn brooklyn mcp start

## Connection Errors

HTTP transport:
  1. Port conflicts: brooklyn web cleanup --port 3000
  2. Check network: curl http://127.0.0.1:3000/health
  3. Firewall rules: ensure localhost access allowed

stdio transport:
  1. Process cleanup: brooklyn mcp cleanup --force
  2. Check for orphaned processes: ps aux | grep brooklyn
  3. Verify stdout purity: no log output to terminal

## Post-Install Verification

After rebuild (bun run build && bun run install):
  1. Verify binary version: brooklyn --version
  2. Test via HTTP: curl http://localhost:3000/tools/brooklyn_status
  3. Confirm in Claude Code: brooklyn_status (check version matches)

For detailed troubleshooting: docs/deployment/unified-deployment.md
```

### Binary Path Issues

**"Command not found" errors**:

1. Use full path to binary in MCP config
2. Don't use shell expansions (~, $HOME)
3. Verify binary exists: `ls -la ~/.local/bin/brooklyn`

### Process Management

**Brooklyn MCP Cleanup Command (v1.2.4+)**

Brooklyn includes a built-in cleanup command to handle orphaned or competing MCP processes:

```bash
# Standard cleanup (graceful termination with SIGTERM)
brooklyn mcp cleanup

# Force cleanup (immediate SIGKILL if processes are stuck)
brooklyn mcp cleanup --force
```

**When to Use**:

- `claude mcp list` shows "Failed to connect" errors
- Multiple Brooklyn processes are competing for resources
- After version updates to ensure clean state
- Before reconfiguring MCP settings

**How it Works**:

1. **Process Detection**: Scans for all `brooklyn mcp start` processes
2. **Graceful Termination**: Sends SIGTERM with 5-second timeout
3. **Force Kill**: Uses SIGKILL if graceful termination fails
4. **Verification**: Confirms all processes are actually terminated

**Example Output**:

```
Starting Brooklyn MCP process cleanup
Found Brooklyn MCP processes to terminate (count: 2)
Attempting graceful termination (SIGTERM)...
Waiting up to 5s for processes to terminate gracefully...
✅ All processes terminated gracefully
```

**Advantages over Manual Process Killing**:

- No need to find PIDs manually with `ps aux | grep brooklyn`
- Works without access to the Brooklyn repository
- Handles edge cases (permission errors, stuck processes)
- Cross-platform compatible (Windows, macOS, Linux)

## Security Considerations

When configuring Brooklyn:

1. **Team Isolation**: Set `BROOKLYN_TEAM_ID` appropriately
2. **Domain Restrictions**: Configure `BROOKLYN_ALLOWED_DOMAINS`
3. **Rate Limiting**: Adjust `BROOKLYN_RATE_LIMIT` for your needs
4. **Headless Mode**: Use `BROOKLYN_HEADLESS=true` in production

## Version Updates

### Critical: Complete Session Restart Required

**IMPORTANT**: When updating Brooklyn binary versions, Claude Code requires **complete session restart** to recognize the new version.

### Version Update Procedure

```bash
# 1. Update Brooklyn binary
cd /path/to/brooklyn-mcp
bun run version:bump:patch    # Updates VERSION file
bun run build                 # Build with new version
bun run install              # Install updated binary globally
brooklyn --version           # Verify version updated

# 2. MCP Configuration Cleanup
claude mcp remove brooklyn

# 3. CRITICAL: Clean up any running Brooklyn processes
brooklyn mcp cleanup
# If processes are stuck, use force mode:
# brooklyn mcp cleanup --force
# Note: MCP removal does NOT automatically kill running processes

# 4. Re-add MCP Configuration
claude mcp add -s user -t stdio brooklyn brooklyn mcp start

# 5. COMPLETE CLAUDE SESSION RESTART (Required!)
# Close ALL Claude Code sessions on the machine
# Then restart Claude sessions - only then will new version be recognized
```

### Why Complete Restart is Required

Claude Code caches MCP binary references at session initialization. Simply restarting the MCP server or removing/re-adding configurations is insufficient.

**Impact**:

- Must halt work on all other projects using Claude
- Version updates become expensive operations requiring coordination

### Version Verification

After complete restart:

```bash
# In new Claude session, test Brooklyn version
# Should show updated version in MCP response
brooklyn_status  # Check "version" field
```

### Development Workflow Considerations

- **Plan updates during dedicated time blocks**
- **Coordinate with other project work**
- **Consider batching multiple changes** before version update
- **Document team communication** around version update windows

For detailed procedures, see: [docs/development/index.md](../development/index.md)

## Next Steps

1. Install browsers: `brooklyn setup`
2. Start using Brooklyn tools in Claude Code
3. (Optional) Set up web monitoring: `brooklyn web start`
4. Configure team-specific settings as needed
