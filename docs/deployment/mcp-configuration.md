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

### Automatic Configuration

The simplest way to configure Claude Code:

```bash
brooklyn mcp configure
```

This command:

1. Detects your Claude Code installation
2. Adds Brooklyn to your MCP servers configuration
3. Points to the installed binary (not the development directory)
4. Validates the configuration

### Manual Configuration

If you prefer manual configuration, add this to your Claude Code settings:

**macOS/Linux** (`~/.config/claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "brooklyn": {
      "command": "/home/username/.local/bin/brooklyn",
      "args": ["mcp", "start"],
      "env": {
        "BROOKLYN_TEAM_ID": "your-team",
        "BROOKLYN_LOG_LEVEL": "info"
      }
    }
  }
}
```

**Windows** (`%APPDATA%\Claude\claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "brooklyn": {
      "command": "C:\\Users\\username\\AppData\\Local\\Brooklyn\\brooklyn.exe",
      "args": ["mcp", "start"],
      "env": {
        "BROOKLYN_TEAM_ID": "your-team",
        "BROOKLYN_LOG_LEVEL": "info"
      }
    }
  }
}
```

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

**Brooklyn tools not appearing in Claude Code**:

1. Restart Claude Code after configuration
2. Check logs: `brooklyn logs --mcp`
3. Validate config: `brooklyn mcp status`

**Connection errors**:

1. Ensure binary path is absolute in config
2. Check file permissions on brooklyn binary
3. Verify no stdout contamination in logs

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

## Next Steps

1. Install browsers: `brooklyn setup`
2. Start using Brooklyn tools in Claude Code
3. (Optional) Set up web monitoring: `brooklyn web start`
4. Configure team-specific settings as needed
