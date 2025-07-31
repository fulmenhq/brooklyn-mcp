# Brooklyn Development Mode Architecture

## Overview

Brooklyn dev mode creates a persistent MCP server that communicates via named pipes instead of stdin/stdout. This enables testing MCP protocol behavior without interfering with Claude Code sessions.

## Named Pipe System

### Pipe Creation

- **Location**: `/tmp/brooklyn-mcp-dev-{uuid}-{timestamp}-{in|out}`
- **Permissions**: 600 (owner read/write only)
- **Type**: FIFO (First In, First Out) named pipes
- **Lifecycle**: Created on start, cleaned up on stop

### Communication Flow

```
MCP Client → Input Pipe → Brooklyn Server → Output Pipe → MCP Client
```

1. **Client writes** JSON-RPC messages to input pipe
2. **Brooklyn reads** from input pipe (replaces stdin)
3. **Brooklyn processes** MCP messages identically to production
4. **Brooklyn writes** JSON-RPC responses to output pipe (replaces stdout)
5. **Client reads** responses from output pipe

## Process Architecture

### Core Components

1. **MCPDevManager** (`src/core/mcp-dev-manager.ts`)
   - Manages dev mode lifecycle
   - Creates and cleans up named pipes
   - Spawns Brooklyn MCP server process

2. **Brooklyn MCP Server** (`src/cli/brooklyn.ts mcp start --dev-mode`)
   - Full MCP protocol implementation
   - Reads from `BROOKLYN_DEV_INPUT_PIPE` environment variable
   - Writes to `BROOKLYN_DEV_OUTPUT_PIPE` environment variable

3. **Named Pipe Transport** (`src/transports/mcp-fifo-transport.ts`)
   - Handles pipe I/O operations
   - Manages blocking pipe behavior
   - Ensures protocol compliance

### Process Management

```bash
# Start sequence
mcp dev-start → MCPDevManager.start() → spawn('brooklyn mcp start --dev-mode')
                                    ↓
                            Creates named pipes + sets env vars
```

- **Detached Process**: Runs in background independently
- **PID Tracking**: Process ID stored in `~/.brooklyn/dev/pipes.json`
- **Log Redirection**: stdout/stderr → `~/.brooklyn/dev/logs/brooklyn-mcp-dev-{timestamp}.log`
- **Environment Variables**: `BROOKLYN_DEV_INPUT_PIPE`, `BROOKLYN_DEV_OUTPUT_PIPE`

## Protocol Compliance

### Identical to Production

Dev mode maintains **100% protocol compatibility** with production Brooklyn:

- Same JSON-RPC message format
- Same MCP tool definitions
- Same error responses
- Same capabilities

### Key Differences from Production

| Aspect             | Production         | Dev Mode            |
| ------------------ | ------------------ | ------------------- |
| Input              | stdin              | Named pipe (input)  |
| Output             | stdout             | Named pipe (output) |
| Lifecycle          | Process per client | Persistent server   |
| Claude Integration | Direct             | Manual testing      |

## Security Model

- **Pipe Permissions**: 600 (owner-only access)
- **Process Isolation**: Detached from parent terminal
- **Temporary Files**: Cleaned up on shutdown
- **No Network Exposure**: Local filesystem only

## Error Handling

- **Pipe Creation Failures**: Graceful fallback and error reporting
- **Process Management**: PID tracking and cleanup on exit
- **Resource Cleanup**: Automatic pipe removal on stop/cleanup
- **Logging**: All errors captured in dev mode logs

This architecture enables rapid MCP development while maintaining production fidelity.
