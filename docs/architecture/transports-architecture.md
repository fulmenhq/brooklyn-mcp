# Brooklyn Transports Architecture

## Overview

Brooklyn's transport system handles communication between the core engine and external clients like Claude Code via MCP. There are multiple transport implementations to support different use cases, particularly for development and production.

### Current Transports

1. **MCPStdioTransport** (`src/transports/mcp-stdio-transport.ts`)
   - Primary production transport
   - Uses stdin/stdout for MCP JSON-RPC
   - Handles line-based message processing
   - Used when no pipes specified

2. **MCPFifoTransport** (`src/transports/mcp-fifo-transport.ts`)
   - FIFO (named pipe) transport for dev mode
   - Uses low-level file descriptors
   - Avoids Node.js stream seek issues
   - Selected when input/output pipes provided

3. **MCPPipeTransport** (`src/transports/mcp-pipe-transport.ts`)
   - Alternative pipe transport with fallback polling
   - Handles problematic FIFO behaviors
   - Used in dev mode scenarios
   - Fallback to polling if standard streams fail

4. **MCPHTTPTransport** (`src/transports/http-transport.ts`)
   - Streamable HTTP transport per MCP spec
   - Handles JSON-RPC over POST
   - Supports SSE for streaming
   - Used for web mode (monitoring/APIs)

Note: Previously had MCPStdioTransportFixed, but removed as redundant after stdio fixes.

### Selection Logic

Transports are selected in `src/transports/index.ts`:

- If dev mode with pipes: MCPFifoTransport or MCPPipeTransport
- Standard MCP: MCPStdioTransport
- Web mode: MCPHTTPTransport

### Usage Assessment

- All transports are actively used:
  - Stdio for production Claude integration
  - FIFO/Pipe for dev mode isolation
  - HTTP for monitoring/dashboard

No cruft identified - each serves a specific purpose. HTTP follows different naming as it's not stdio-based but kept in transports/ for consistency.

### Recommendations

- Monitor for consolidation opportunities (e.g., unify pipe transports if possible)
- Add unit tests for each transport
- Document transport selection in dev guides

For dev mode details, see [notes/mcp-dev-mode-pattern.md](notes/mcp-dev-mode-pattern.md)

Last Updated: July 26, 2025
