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
bun run install:user

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
  claude mcp add -s user brooklyn brooklyn mcp start

Alternative - add for current project only:
  claude mcp add brooklyn brooklyn mcp start

Verify configuration:
  claude mcp list
  claude mcp get brooklyn

For troubleshooting, see: https://github.com/fulmenhq/fulmen-mcp-brooklyn
```

### With Environment Variables

Add Brooklyn with team-specific configuration:

```bash
# Add with environment variables
claude mcp add -s user brooklyn brooklyn mcp start \
  -e BROOKLYN_TEAM_ID=your-team \
  -e BROOKLYN_LOG_LEVEL=info
```

### Configuration Scopes

Brooklyn supports different configuration scopes:

```bash
# User-wide (recommended for individual use)
claude mcp add -s user brooklyn brooklyn mcp start

# Project-specific (for team collaboration)
claude mcp add -s project brooklyn brooklyn mcp start

# Local (private to current project directory)
claude mcp add brooklyn brooklyn mcp start
```

### Legacy Manual Configuration (Not Recommended)

**⚠️ WARNING**: Manual JSON configuration is for Claude Desktop app only, not Claude Code CLI.

If you must use manual configuration for some reason, see the [Legacy Configuration Guide](../legacy/claude-desktop-config.md).

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

Connection errors:
  1. Ensure Brooklyn installed: brooklyn --version
  2. Test MCP directly: brooklyn mcp start --help
  3. Check Claude Code logs

Need help? Visit: https://github.com/fulmenhq/fulmen-mcp-brooklyn
```

### Binary Path Issues

**"Command not found" errors**:

1. Use full path to binary in MCP config
2. Don't use shell expansions (~, $HOME)
3. Verify binary exists: `ls -la ~/.local/bin/brooklyn`

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
cd /path/to/fulmen-mcp-forge-brooklyn
bun run version:bump:patch    # Updates VERSION file
bun run build                 # Build with new version
bun run install              # Install updated binary globally
brooklyn --version           # Verify version updated

# 2. MCP Configuration Cleanup
claude mcp remove brooklyn

# 3. CRITICAL: Kill any running Brooklyn processes
ps aux | grep brooklyn
kill -9 [pid]  # Kill all brooklyn processes
# Note: MCP removal does NOT automatically kill running processes

# 4. Re-add MCP Configuration
claude mcp add -s user brooklyn brooklyn mcp start

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

For detailed procedures, see: [docs/development/local_development_sop.md](../development/local_development_sop.md)

## Next Steps

1. Install browsers: `brooklyn setup`
2. Start using Brooklyn tools in Claude Code
3. (Optional) Set up web monitoring: `brooklyn web start`
4. Configure team-specific settings as needed
