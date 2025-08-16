# Brooklyn Development Mode Architecture

## Overview

Brooklyn dev mode creates a persistent MCP server that communicates via Unix domain sockets (recommended) or named pipes instead of stdin/stdout. This enables testing MCP protocol behavior without interfering with Claude Code sessions.

## Transport Options

### Socket Transport (Recommended)

- **Location**: `/tmp/brooklyn-mcp-dev-{uuid}-{timestamp}.sock`
- **Type**: Unix domain socket
- **Permissions**: 600 (owner read/write only)
- **Advantages**: No hanging issues, bidirectional, standard interface
- **Compatible with**: `nc`, `socat`, any Unix socket client

### Named Pipe Transport (Experimental)

- **Location**: `/tmp/brooklyn-mcp-dev-{uuid}-{timestamp}-{in|out}`
- **Type**: FIFO (First In, First Out) named pipes
- **Permissions**: 600 (owner read/write only)
- **Limitations**: Node.js blocking behavior, requires careful reader/writer coordination

### Communication Flow

**Socket Transport:**

```
MCP Client ↔ Unix Socket ↔ Brooklyn Server
```

**Pipe Transport:**

```
MCP Client → Input Pipe → Brooklyn Server → Output Pipe → MCP Client
```

**Processing Steps:**

1. **Client sends** JSON-RPC messages via transport
2. **Brooklyn receives** messages (replaces stdin)
3. **Brooklyn processes** MCP messages identically to production
4. **Brooklyn sends** JSON-RPC responses via transport (replaces stdout)
5. **Client receives** responses

## Process Architecture

### Core Components

1. **MCPDevManager** (`src/core/mcp-dev-manager.ts`)
   - Manages dev mode lifecycle
   - Creates and cleans up transport files (socket/pipes)
   - Spawns Brooklyn MCP server process

2. **Brooklyn MCP Server** (`src/cli/brooklyn.ts mcp start --dev-mode`)
   - Full MCP protocol implementation
   - Socket: Uses `BROOKLYN_DEV_SOCKET_PATH` environment variable
   - Pipes: Uses `BROOKLYN_DEV_INPUT_PIPE` and `BROOKLYN_DEV_OUTPUT_PIPE`

3. **Transport Implementations**
   - **Socket Transport** (`src/transports/mcp-socket-transport.ts`) - Recommended
     - Reliable Unix domain socket I/O
     - No blocking issues, bidirectional communication
   - **FIFO Transport** (`src/transports/mcp-fifo-transport.ts`) - Experimental
     - Named pipe I/O operations
     - Handles Node.js blocking behavior

### Process Management

```bash
# Start sequence (socket transport)
brooklyn mcp dev-start --transport socket
    ↓
MCPDevManager.start() → spawn('brooklyn mcp start --dev-mode --socket-path /path/to/socket')
    ↓
Creates Unix socket + sets BROOKLYN_DEV_SOCKET_PATH
```

- **Detached Process**: Runs in background independently
- **PID Tracking**: Process ID stored in `~/.brooklyn/dev/pipes.json`
- **Log Redirection**: stdout/stderr → `~/.brooklyn/dev/logs/brooklyn-mcp-dev-{timestamp}.log`
- **Environment Variables**:
  - Socket: `BROOKLYN_DEV_SOCKET_PATH`
  - Pipes: `BROOKLYN_DEV_INPUT_PIPE`, `BROOKLYN_DEV_OUTPUT_PIPE`

## Protocol Compliance

### Identical to Production

Dev mode maintains **100% protocol compatibility** with production Brooklyn:

- Same JSON-RPC message format
- Same MCP tool definitions
- Same error responses
- Same capabilities

### Key Differences from Production

| Aspect             | Production         | Socket Dev Mode   | Pipe Dev Mode       |
| ------------------ | ------------------ | ----------------- | ------------------- |
| Input              | stdin              | Unix socket       | Named pipe (input)  |
| Output             | stdout             | Unix socket       | Named pipe (output) |
| Transport          | stdio              | Bidirectional     | Unidirectional      |
| Reliability        | High               | High              | Node.js limitations |
| Lifecycle          | Process per client | Persistent server | Persistent server   |
| Claude Integration | Direct             | Manual testing    | Manual testing      |

## Security Model

- **Transport Permissions**: 600 (owner-only access) for both sockets and pipes
- **Process Isolation**: Detached from parent terminal
- **Temporary Files**: Cleaned up on shutdown (sockets auto-removed, pipes explicitly deleted)
- **No Network Exposure**: Local filesystem only

## Error Handling

- **Transport Creation Failures**: Graceful fallback and error reporting
- **Process Management**: PID tracking and cleanup on exit
- **Resource Cleanup**: Automatic transport file removal on stop/cleanup
- **Logging**: All errors captured in dev mode logs

## Transport Selection

**Recommended**: Use socket transport for reliability:

```bash
brooklyn mcp dev-start --transport socket
```

**Experimental**: Use pipe transport only if needed:

```bash
brooklyn mcp dev-start --transport pipe --experimental
```

This architecture enables rapid MCP development while maintaining production fidelity.
