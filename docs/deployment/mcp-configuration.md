# Brooklyn MCP Configuration Guide

## Overview

Brooklyn operates as a unified binary that supports two distinct modes:

- **MCP Mode**: For Claude Code integration (stdin/stdout communication)
- **Web Mode**: For monitoring, APIs, and browser management (HTTP server)

This guide covers how to configure Brooklyn after installation, with a focus on MCP integration for Claude Code.

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
Add Brooklyn for all your projects (user-wide):
  claude mcp add -s user -t stdio brooklyn brooklyn mcp start

Alternative - add for current project only:
  claude mcp add -t stdio brooklyn brooklyn mcp start

Verify configuration:
  claude mcp list
  claude mcp get brooklyn

For troubleshooting, see: https://github.com/fulmenhq/fulmen-mcp-brooklyn
```

### With Environment Variables

Add Brooklyn with team-specific configuration:

```bash
# Add with environment variables
claude mcp add -s user -t stdio brooklyn brooklyn mcp start \
  -e BROOKLYN_TEAM_ID=your-team \
  -e BROOKLYN_LOG_LEVEL=info
```

### Configuration Scopes

Brooklyn supports different configuration scopes:

```bash
# User-wide (recommended for individual use)
claude mcp add -s user -t stdio brooklyn brooklyn mcp start

# Project-specific (for team collaboration)
claude mcp add -s project -t stdio brooklyn brooklyn mcp start

# Local (private to current project directory)
claude mcp add -t stdio brooklyn brooklyn mcp start
```

### Legacy Manual Configuration (Not Recommended)

**⚠️ WARNING**: Manual JSON configuration is for Claude Desktop app only, not Claude Code CLI.

For manual configuration, see the Claude Code documentation for setting up MCP servers.

### Configuration Scopes

Brooklyn supports different configuration scopes:

```bash
# User-wide configuration (default)
brooklyn mcp configure --user

# Project-specific configuration
brooklyn mcp configure --project

# Check current configuration
brooklyn mcp status
```

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
Brooklyn tools not appearing in Claude Code:
  1. Restart Claude Code completely
  2. Check configuration: claude mcp get brooklyn
  3. Verify binary exists: which brooklyn

Connection errors or timeouts:
  1. Clean up orphaned processes: brooklyn mcp cleanup
  2. Ensure Brooklyn installed: brooklyn --version
  3. Test MCP directly: brooklyn mcp start --help
  4. Check Claude Code logs

Multiple processes running:
  brooklyn mcp cleanup              # Graceful cleanup
  brooklyn mcp cleanup --force      # Force cleanup if stuck

Need help? Visit: https://github.com/fulmenhq/fulmen-mcp-brooklyn
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
