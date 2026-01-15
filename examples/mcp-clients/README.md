# MCP Client Configuration Examples

Sample configurations for connecting various AI agents to Brooklyn MCP.

## Files

| File | Client | Description |
|------|--------|-------------|
| `opencode.json` | [OpenCode](https://opencode.ai) | Place in project root |
| `claude-code.mcp.json` | [Claude Code](https://claude.ai/code) | Use `claude mcp add` or place as `.mcp.json` |
| `kilocode.mcp.json` | [Kilocode](https://kilocode.ai) | Place in `.kilocode/mcp.json` |

## Transport Options

### stdio (recommended for local development)
- Direct process communication
- No server setup required
- Brooklyn starts/stops with the client

### HTTP (for shared/remote access)
- Requires `brooklyn web start` running
- Supports multiple concurrent clients
- Auth modes: `required`, `localhost`, `disabled`

## Quick Start

### OpenCode
```bash
# Copy to project root
cp examples/mcp-clients/opencode.json ./opencode.json
```

### Claude Code
```bash
# Via CLI (recommended)
claude mcp add brooklyn brooklyn mcp start

# Or for HTTP transport
claude mcp add -t http brooklyn-http http://127.0.0.1:3000
```

### Kilocode
```bash
# Copy to .kilocode directory
mkdir -p .kilocode
cp examples/mcp-clients/kilocode.mcp.json .kilocode/mcp.json
```

## HTTP Server Setup

For HTTP transport, start the server first:

```bash
# Development (localhost bypass)
brooklyn web start --auth-mode localhost

# Production (requires auth)
brooklyn web start --auth-mode required
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `BROOKLYN_TEAM_ID` | Team identifier for multi-tenant setups | - |
| `BROOKLYN_LOG_LEVEL` | Log verbosity (debug, info, warn, error) | info |

## Troubleshooting

```bash
# Check Brooklyn installation
brooklyn version --extended

# Verify browser setup
brooklyn browser info

# Install browsers if needed
brooklyn setup

# Full diagnostics
brooklyn doctor
```
