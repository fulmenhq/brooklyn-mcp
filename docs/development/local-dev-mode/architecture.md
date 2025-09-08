# Brooklyn Development Mode Architecture

This document covers the technical architecture of Brooklyn's two development modes: **Source Execution Mode** (`--development-only`) and **Development Server Mode** (`dev-start`).

## Overview

Brooklyn provides two distinct development architectures optimized for different use cases:

1. **Source Execution Mode** - Direct TypeScript execution for rapid AI development
2. **Development Server Mode** - Persistent MCP server with alternative transports

## 🚀 Source Execution Mode Architecture

### Execution Model

**Source Execution Mode** bypasses the traditional build process by executing TypeScript directly through Bun, enabling instant iteration for AI developers.

```
Claude Code → stdio → bun src/cli/brooklyn.ts mcp start --development-only → Brooklyn MCP Server
```

### Key Components

**1. Direct Source Execution**

- **Runtime**: Bun executes TypeScript source directly
- **No bundling**: Avoids native dependency compilation issues
- **Full npm access**: All packages available without constraints

**2. Authentication Override**

- **Mode**: "none" authentication (development only)
- **Safety**: Validates development environment before allowing
- **Security**: Refuses to run in production environments

**3. Standard MCP Transport**

- **Protocol**: Standard JSON-RPC over stdio
- **Compatibility**: 100% compatible with Claude Code
- **Integration**: Works with `/mcp` command for instant reconnection

### Process Flow

```typescript
// Simplified execution flow
1. Claude Code starts: bun src/cli/brooklyn.ts mcp start --development-only
2. CLI validates --development-only flag
3. Sets authentication.mode = "none" + developmentOnly = true
4. Starts standard MCP server with stdio transport
5. Brooklyn runs directly from source (no build step)
6. Changes reflected on next /mcp command
```

### Benefits for AI Developers

- **🚀 Zero build time** - TypeScript executed directly
- **📦 Dependency freedom** - No bundling constraints (native issues bypassed)
- **⚡ Instant iteration** - Edit → `/mcp` → Test
- **🎯 Claude Code native** - Perfect stdio integration

---

## 🔧 Development Server Mode Architecture

### Communication Model

**Development Server Mode** creates a persistent MCP server that communicates via Unix domain sockets or named pipes instead of stdio.

```
Client → Transport (Socket/Pipe) → Brooklyn MCP Server (Background Process)
```

### Transport Options

#### Socket Transport (Recommended)

**Architecture**:

```
MCP Client ↔ Unix Domain Socket ↔ Brooklyn Server Process
```

**Implementation**:

- **Location**: `/tmp/brooklyn-mcp-dev-{uuid}-{timestamp}.sock`
- **Type**: Unix domain socket (bidirectional)
- **Permissions**: 600 (owner read/write only)
- **Reliability**: No hanging issues, standard interface

**Advantages**:

- ✅ Reliable bidirectional communication
- ✅ Works with standard tools (`nc`, `socat`)
- ✅ No Node.js blocking limitations
- ✅ Established Unix pattern

#### Pipe Transport (Experimental - Go Roadmap)

**Architecture**:

```
MCP Client → Input Pipe → Brooklyn Server → Output Pipe → MCP Client
```

**Current Implementation (Node.js/TypeScript)**:

- **Location**: `/tmp/brooklyn-mcp-dev-{uuid}-{timestamp}-{in|out}`
- **Type**: FIFO (First In, First Out) named pipes
- **Permissions**: 600 (owner read/write only)
- **Limitations**: Node.js blocking behavior, coordination required

**Node.js Limitations**:

- ⚠️ Blocking I/O can cause hanging
- ⚠️ Requires careful reader/writer coordination
- ⚠️ FIFO operations have fundamental Node.js issues

**Go Implementation Roadmap**:

- ✅ **Full pipe support** planned for Go implementation
- ✅ **No blocking issues** with Go's superior FIFO handling
- ✅ **Reference implementation** will demonstrate proper pipe usage
- ✅ **Performance benefits** from native pipe operations

### Process Architecture

#### Core Components

**1. MCPDevManager** (`src/core/mcp-dev-manager.ts`)

```typescript
class MCPDevManager {
  // Manages development server lifecycle
  async start(options: { transport: "socket" | "pipe" });
  async stop();
  async cleanup();

  // Creates transport files and spawns server
  private setupTransportPaths();
  private createTransportFiles();
}
```

**2. Brooklyn MCP Server Process**

```bash
# Spawned process
brooklyn mcp start --dev-mode --socket-path /path/to/socket
# OR
brooklyn mcp start --dev-mode --input-pipe /path --output-pipe /path
```

**3. Transport Implementations**

**Socket Transport** (`src/transports/mcp-socket-transport.ts`):

```typescript
// Reliable Unix domain socket I/O
// Bidirectional communication
// Standard socket operations
```

**FIFO Transport** (`src/transports/mcp-fifo-transport.ts`):

```typescript
// Named pipe I/O operations
// Handles Node.js blocking behavior
// Coordination between reader/writer
```

#### Process Lifecycle

```bash
# 1. Start sequence (socket transport)
brooklyn mcp dev-start --transport socket
    ↓
MCPDevManager.start() → spawn('brooklyn mcp start --dev-mode --socket-path /path')
    ↓
Creates Unix socket + sets BROOKLYN_DEV_SOCKET_PATH environment variable
    ↓
Background process starts and listens on socket
```

**Process Management Features**:

- **Detached Process**: Runs independently in background
- **PID Tracking**: Process ID stored in `~/.brooklyn/dev/pipes.json`
- **Log Redirection**: stdout/stderr → `~/.brooklyn/dev/logs/brooklyn-mcp-dev-{timestamp}.log`
- **Resource Cleanup**: Automatic transport file removal on shutdown

### Environment Variables

**Source Execution Mode**:

- `BROOKLYN_AUTH_DEVELOPMENT_ONLY=true` (set by --development-only flag)

**Development Server Mode**:

- **Socket**: `BROOKLYN_DEV_SOCKET_PATH=/path/to/socket`
- **Pipes**: `BROOKLYN_DEV_INPUT_PIPE` and `BROOKLYN_DEV_OUTPUT_PIPE`

---

## Protocol Compliance

### MCP Protocol Compatibility

Both development modes maintain **100% protocol compatibility** with production Brooklyn:

| **Aspect**           | **Source Execution** | **Development Server** | **Production** |
| -------------------- | -------------------- | ---------------------- | -------------- |
| **JSON-RPC Format**  | ✅ Identical         | ✅ Identical           | ✅ Standard    |
| **Tool Definitions** | ✅ Same              | ✅ Same                | ✅ Same        |
| **Error Responses**  | ✅ Same              | ✅ Same                | ✅ Same        |
| **Capabilities**     | ✅ Same              | ✅ Same                | ✅ Same        |
| **Authentication**   | None (dev only)      | Configurable           | Required       |

### Transport Differences

| **Aspect**             | **Source Execution** | **Development Server**              | **Production**     |
| ---------------------- | -------------------- | ----------------------------------- | ------------------ |
| **Input**              | stdin                | Socket/Pipe                         | stdin              |
| **Output**             | stdout               | Socket/Pipe                         | stdout             |
| **Transport Type**     | stdio                | IPC                                 | stdio/HTTP         |
| **Reliability**        | High                 | Socket: High, Pipe: Node.js limited | High               |
| **Lifecycle**          | Claude Code managed  | Persistent daemon                   | Process per client |
| **Claude Integration** | ✅ Native            | ❌ Manual testing                   | ✅ Native          |

---

## Security Model

### Source Execution Mode Security

**Development Environment Validation**:

```typescript
// Checks for production environment indicators
if (process.env.NODE_ENV === "production") throw error;
if (process.env.KUBERNETES_SERVICE_HOST) throw error;
if (process.env.AWS_EXECUTION_ENV) throw error;
// Additional production detection logic
```

**Authentication Bypass**:

- **Mode**: "none" authentication only
- **Requirement**: `developmentOnly: true` flag mandatory
- **Validation**: Production environment detection prevents usage
- **Safety**: Prominent security warnings displayed

### Development Server Mode Security

**Transport Security**:

- **File Permissions**: 600 (owner-only access) for sockets and pipes
- **Process Isolation**: Detached from parent terminal
- **Temporary Files**: Cleaned up on shutdown
- **No Network Exposure**: Local filesystem only

**Authentication**:

- **Configurable**: Can use any authentication provider
- **Development Default**: Often uses "none" mode with validation
- **Production Ready**: Can be configured for secure authentication

---

## Performance Characteristics

### Source Execution Mode Performance

**Startup Time**:

- ✅ **Instant**: No build step required
- ✅ **Direct execution**: Bun handles TypeScript natively
- ✅ **Hot reload**: Changes reflected on next connection

**Resource Usage**:

- **Memory**: Higher (no dead code elimination)
- **CPU**: Comparable (Bun optimization)
- **Disk**: Source files only (no build artifacts)

### Development Server Mode Performance

**Startup Time**:

- ⚠️ **Build required**: Must compile before starting
- ⚠️ **Transport setup**: Socket/pipe creation overhead
- ⚠️ **Process spawning**: Background daemon startup cost

**Runtime Performance**:

- **Socket Transport**: Excellent (standard Unix IPC)
- **Pipe Transport**: Good (with Node.js limitations)
- **Memory**: Standard (compiled binary)

---

## Future Roadmap

### Go Implementation Benefits

**Pipe Transport Improvements**:

- **Native FIFO Support**: Go handles pipes reliably
- **No Blocking Issues**: Superior I/O model
- **Better Performance**: Native pipe operations
- **Reference Implementation**: Will demonstrate best practices

**Architecture Evolution**:

```
Current: Node.js/TypeScript (pipes experimental)
    ↓
Future: Go implementation (pipes fully supported)
    ↓
Hybrid: TypeScript for rapid development, Go for production
```

### Development Mode Evolution

**Source Execution Mode** (Stable):

- ✅ **Current state**: Excellent for AI development
- ✅ **Future**: Continue as primary development approach
- ✅ **Bun improvements**: Even faster execution over time

**Development Server Mode** (Evolving):

- 🔧 **Current**: Socket transport recommended
- 🔧 **Go transition**: Pipe transport will become viable
- 🔧 **Enhanced debugging**: More protocol inspection tools

---

## Implementation Details

### Source Execution Mode Implementation

**CLI Integration**:

```typescript
// src/cli/brooklyn.ts
.option('--development-only', 'Allow "none" authentication mode (development only)')
.action(async (options) => {
  if (options.developmentOnly) {
    // Set authentication override
    config.authentication = {
      mode: 'none',
      developmentOnly: true
    }
  }
})
```

**Authentication Provider**:

```typescript
// src/core/auth/none-provider.ts
export class NoneAuthProvider {
  protected async doInitialize(config: BrooklynConfig) {
    if (!config.authentication.developmentOnly) {
      throw new AuthenticationError("developmentOnly: true required");
    }
    // Production environment detection
    if (this.isProductionEnvironment()) {
      throw new AuthenticationError("Cannot use in production");
    }
  }
}
```

### Development Server Mode Implementation

**Process Management**:

```typescript
// src/core/mcp-dev-manager.ts
export class MCPDevManager {
  async start(options: { transport: "socket" | "pipe" }) {
    const transportPaths = this.setupTransportPaths(options.transport);
    await this.createTransportFiles(options.transport, transportPaths);

    if (options.transport === "socket") {
      await this.startSocketServer(transportPaths.socketPath);
    } else {
      await this.startPipeServer(transportPaths.inputPipe, transportPaths.outputPipe);
    }
  }
}
```

This architecture enables both rapid AI development through source execution and advanced protocol testing through development servers, providing flexibility for different development needs while maintaining production compatibility.
