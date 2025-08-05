# Brooklyn Local Development Guide

## Introduction

Brooklyn provides two powerful development modes for testing browser automation without disrupting Claude Code sessions:

- **🔄 REPL Mode**: Interactive command-line interface for manual testing and learning
- **🌐 HTTP Mode**: REST API server for programmatic access and CI/CD integration

Both modes run independently from production MCP servers, enabling rapid development cycles with full Brooklyn capabilities.

**Key Benefits:**

- ✅ No Claude Code session restarts needed for development
- ✅ Independent background processes for testing
- ✅ Full browser automation capabilities
- ✅ Production-identical tool behavior
- ✅ Proper process lifecycle management with background daemon support

**Note**: These modes are intended for development use only. Do not use in production environments.

## Prerequisites

- Brooklyn built and installed: `bun run build && bun install`
- Brooklyn CLI available globally: `brooklyn --version` should show version 1.4.0+
- Playwright browsers installed (run `bun run setup` if needed)
- Basic understanding of Brooklyn's browser automation capabilities

## Quick Start

Choose your development mode based on your needs:

### 🔄 REPL Mode (Interactive Testing)

```bash
# 1. Build and install Brooklyn CLI
bun run build && bun install

# 2. Start interactive REPL
brooklyn repl

# 3. Try some commands
brooklyn> help
brooklyn> launch_browser chromium
brooklyn> navigate_to_url browser-123 https://google.com
brooklyn> take_screenshot browser-123
brooklyn> exit
```

### 🌐 HTTP Mode (Programmatic Testing)

```bash
# 1. Build and install Brooklyn CLI
bun run build && bun install

# 2. Start HTTP server in background
brooklyn mcp dev-http --port 8080 --team-id my-team --background

# 3. Test via API
curl -s http://localhost:8080/health

# 4. Use tools programmatically
curl -X POST http://localhost:8080/tools/launch_browser \
  -H "Content-Type: application/json" \
  -d '{"browserType": "chromium", "headless": true}'

# 5. Stop when done
brooklyn mcp dev-http-stop --port 8080
```

## Configuration

Both development modes support flexible configuration:

### REPL Mode Configuration

```bash
# Basic REPL session
brooklyn repl

# With team context
brooklyn repl --team-id my-team

# With verbose logging
brooklyn repl --verbose
```

### HTTP Mode Configuration

```bash
# Basic HTTP server (foreground)
brooklyn mcp dev-http

# Background daemon mode (recommended)
brooklyn mcp dev-http --port 8080 --team-id my-team --background

# Custom host and CORS settings
brooklyn mcp dev-http --host localhost --no-cors --verbose
```

**Configuration Options:**

- `--port <port>`: HTTP server port (default: 8080)
- `--host <host>`: Server host (default: 0.0.0.0)
- `--team-id <team>`: Team identifier for resource isolation
- `--background`: Run as background daemon (returns terminal control)
- `--verbose`: Enable detailed logging
- `--no-cors`: Disable CORS headers

## CLI Commands

### REPL Mode Commands

```bash
# Start interactive REPL
brooklyn repl [--team-id <team>] [--verbose]

# REPL commands are entered interactively:
brooklyn> help                          # List available commands
brooklyn> launch_browser chromium       # Launch browser
brooklyn> take_screenshot browser-123   # Take screenshot
brooklyn> exit                          # Exit REPL
```

### HTTP Mode Commands

**Server Management:**

```bash
# Start HTTP server (foreground)
brooklyn mcp dev-http [options]

# Start HTTP server (background daemon)
brooklyn mcp dev-http --background [options]

# Stop HTTP server on specific port
brooklyn mcp dev-http-stop --port 8080

# Stop all HTTP servers
brooklyn mcp dev-http-stop --all

# List running HTTP servers
brooklyn mcp dev-http-list

# Detailed status for HTTP servers
brooklyn mcp dev-http-status [--port 8080]
```

**Universal Status Command:**

```bash
# Check all Brooklyn processes (REPL, HTTP, MCP)
brooklyn status
```

Example output:

```
📊 Brooklyn Process Status:

  🌐 HTTP Servers:
    • dev-http:8080 (PID: 70219, team: my-team)

  📡 MCP Servers:
    • stdio mode (PID: 67485)
    • stdio mode (PID: 67470)

Total: 3 Brooklyn processes running
```

## Development Workflow

### REPL Mode Workflow (Interactive Testing)

**Best for**: Learning Brooklyn, manual testing, debugging specific automation flows

```bash
# 1. Start REPL session
brooklyn repl --team-id my-project

# 2. Explore available commands
brooklyn> help

# 3. Test browser automation interactively
brooklyn> launch_browser chromium --headless false
brooklyn> navigate_to_url browser-abc123 https://example.com
brooklyn> take_screenshot browser-abc123 --full-page
brooklyn> close_browser browser-abc123

# 4. Exit when done
brooklyn> exit
```

### HTTP Mode Workflow (Programmatic Testing)

**Best for**: CI/CD integration, automated testing, API development

```bash
# 1. Start HTTP server in background
brooklyn mcp dev-http --port 8080 --team-id ci-tests --background

# 2. Develop/test via HTTP API
curl -s http://localhost:8080/health
curl -s http://localhost:8080/tools | jq '.data.tools[].name'

# 3. Create automation scripts
./scripts/test-browser-workflow.sh

# 4. Stop server when done
brooklyn mcp dev-http-stop --port 8080
```

### HTTP API Discovery Workflow

**How to translate Brooklyn tools to HTTP endpoints:**

```bash
# 1. Start HTTP server
brooklyn mcp dev-http --port 8080 --background

# 2. Discover available tools
curl -s http://localhost:8080/tools | jq '.data.tools[] | {name, description}'

# 3. Get tool schema
curl -s http://localhost:8080/tools | jq '.data.tools[] | select(.name == "launch_browser")'

# 4. Use tool with correct parameters
curl -X POST http://localhost:8080/tools/launch_browser \
  -H "Content-Type: application/json" \
  -d '{"browserType": "chromium", "headless": true}'
```

**Key Translation Rules:**

- Tool name becomes URL path: `launch_browser` → `/tools/launch_browser`
- Parameters go directly in JSON body (no `"arguments"` wrapper)
- Always use `Content-Type: application/json` header
- Tool schema from `/tools` endpoint shows exact parameter format

### Mixed Development Approach

```bash
# 1. Use REPL to learn and test manually
brooklyn repl
brooklyn> launch_browser chromium
brooklyn> # interactive experimentation

# 2. Translate to HTTP for automation
brooklyn mcp dev-http --port 8080 --background
curl -X POST http://localhost:8080/tools/launch_browser \
  -H "Content-Type: application/json" \
  -d '{"browserType": "chromium", "headless": true}'

# 3. Build automated test scripts
# scripts/my-automation.js uses HTTP API
```

## Troubleshooting

### Common Issues

**REPL Mode Issues:**

```bash
# REPL won't start
brooklyn repl --verbose  # Check for error messages

# REPL commands not working
brooklyn> help           # Verify commands are available
brooklyn> exit            # Exit cleanly and restart
```

**HTTP Mode Issues:**

```bash
# HTTP server won't start
lsof -i :8080            # Check if port is in use
brooklyn mcp dev-http --port 8081  # Try different port

# HTTP server not responding
curl -v http://localhost:8080/health  # Verbose connection test
brooklyn status          # Check if server is running

# Background mode not working
brooklyn mcp dev-http-list           # List background servers
brooklyn mcp dev-http-stop --all     # Stop all servers
```

**Tool Execution Issues:**

```bash
# Tools returning errors
brooklyn mcp dev-http --verbose --background
curl -s http://localhost:8080/tools | jq '.data.tools[0]'  # Check tool schema

# Browser automation failing
# Check if Playwright browsers are installed
bun run setup
```

### Debugging HTTP API Calls

**Correct HTTP API Format:**

```bash
# ✅ Correct format
curl -X POST http://localhost:8080/tools/launch_browser \
  -H "Content-Type: application/json" \
  -d '{"browserType": "chromium", "headless": true}'

# ❌ Wrong format (don't use "arguments" wrapper)
curl -X POST http://localhost:8080/tools/launch_browser \
  -d '{"arguments": {"browserType": "chromium"}}'  # This will fail
```

**API Discovery:**

```bash
# List all available tools
curl -s http://localhost:8080/tools | jq '.data.tools[].name'

# Get specific tool schema
curl -s http://localhost:8080/tools | jq '.data.tools[] | select(.name == "navigate_to_url")'

# Test with verbose curl to see request/response
curl -v -X POST http://localhost:8080/tools/launch_browser \
  -H "Content-Type: application/json" \
  -d '{"browserType": "chromium"}'
```

### Process Management

**Check Running Processes:**

```bash
# Universal status check
brooklyn status

# HTTP server specific status
brooklyn mcp dev-http-list
brooklyn mcp dev-http-status --port 8080

# Manual process check
ps aux | grep brooklyn
```

**Clean Up Orphaned Processes:**

```bash
# Stop specific HTTP server
brooklyn mcp dev-http-stop --port 8080

# Stop all HTTP servers
brooklyn mcp dev-http-stop --all

# Manual cleanup if needed
pkill -f "brooklyn mcp dev-http"
```

### Debug Mode

**Verbose Logging:**

```bash
# REPL with verbose logging
brooklyn repl --verbose

# HTTP server with verbose logging
brooklyn mcp dev-http --verbose --background
```

## Technical Details

### REPL Architecture

- **Interactive shell**: Built on Node.js readline interface
- **Direct tool execution**: Calls Brooklyn tools directly (same as MCP mode)
- **Session management**: Maintains browser state across commands
- **Auto-completion**: Supports tab completion for commands

### HTTP Architecture

- **Express.js server**: Lightweight REST API server
- **Background daemon**: Proper process forking with PID file management
- **Tool mapping**: Direct mapping from HTTP endpoints to Brooklyn tools
- **Process isolation**: Each HTTP server runs with team-specific context

### Process Management

- **Background processes**: HTTP servers run as detached background daemons
- **PID file tracking**: Process IDs stored in `.brooklyn-http-{port}.pid` files
- **Signal handling**: Graceful shutdown on SIGTERM/SIGINT
- **Orphan detection**: Status commands detect processes via PID files and ps

## Limitations

- **Local development only**: Both modes designed for local testing
- **Resource management**: Multiple HTTP servers share browser pool limits
- **Platform compatibility**: Optimized for Unix-like systems (macOS, Linux)
- **Tool execution issues**: Current tool implementation has known issues (being addressed)

## Integration with Claude Code

Development modes are **completely separate** from production Claude Code integration:

- **Production MCP**: Uses `brooklyn mcp start` with stdin/stdout
- **REPL Mode**: Interactive shell for manual testing
- **HTTP Mode**: REST API server for programmatic access
- **No conflicts**: All modes can run simultaneously

For Claude Code integration setup, see [MCP Configuration Guide](../deployment/mcp-configuration.md).
