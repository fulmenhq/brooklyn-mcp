# Brooklyn Development Mode Usage

## Core Commands

Brooklyn dev mode provides multiple transport options for MCP testing:

```bash
# Check status (ALWAYS first!)
brooklyn mcp dev-status

# Start dev mode with socket transport (RECOMMENDED)
brooklyn mcp dev-start --transport socket

# Start dev mode with named pipes (experimental)
brooklyn mcp dev-start --transport pipe --experimental

# Stop dev mode
brooklyn mcp dev-stop

# Clean up resources
brooklyn mcp dev-cleanup

# Restart (stop + start)
brooklyn mcp dev-restart
```

## Step-by-Step Usage

### 1. Start Dev Mode

```bash
# Always check status first to avoid conflicts
brooklyn mcp dev-status

# Start the dev mode server with socket transport (recommended)
brooklyn mcp dev-start --transport socket
```

**Socket Transport** creates a Unix domain socket:

- Socket: `/tmp/brooklyn-mcp-dev-{uuid}-{timestamp}.sock`

**Pipe Transport** (experimental) creates two named pipes:

- Input pipe: `/tmp/brooklyn-mcp-dev-{uuid}-{timestamp}-in`
- Output pipe: `/tmp/brooklyn-mcp-dev-{uuid}-{timestamp}-out`

### 2. Communicate with Dev Mode

Dev mode uses **identical MCP protocol** to production. Send JSON-RPC messages:

#### Socket Transport (Recommended)

**Initialize Connection:**

```bash
# Get socket path from status
SOCKET_PATH=$(brooklyn mcp dev-status | grep Socket | awk '{print $NF}')

# Send initialize message
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{"roots":{}},"clientInfo":{"name":"test-client","version":"1.0.0"}}}' | nc -U $SOCKET_PATH
```

**List Available Tools:**

```bash
echo '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' | nc -U $SOCKET_PATH
```

**Call a Tool:**

```bash
echo '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"launch_browser","arguments":{"browserType":"chromium","headless":true}}}' | nc -U $SOCKET_PATH
```

**Interactive Mode:**

```bash
# Open interactive session with netcat
nc -U $SOCKET_PATH
# Type JSON-RPC messages directly
```

#### Named Pipe Transport (Experimental)

**Setup Reader (Required):**

```bash
# Must set up reader BEFORE writing (prevents hanging)
cat /tmp/brooklyn-mcp-dev-{uuid}-{timestamp}-out &
```

**Initialize Connection:**

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{"roots":{}},"clientInfo":{"name":"test-client","version":"1.0.0"}}}' > /tmp/brooklyn-mcp-dev-{uuid}-{timestamp}-in
```

**List Available Tools:**

```bash
echo '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' > /tmp/brooklyn-mcp-dev-{uuid}-{timestamp}-in
```

**Call a Tool:**

```bash
echo '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"launch_browser","arguments":{"browserType":"chromium","headless":true}}}' > /tmp/brooklyn-mcp-dev-{uuid}-{timestamp}-in
```

### 3. Stop Dev Mode

```bash
# Clean shutdown
brooklyn mcp dev-stop

# Or force cleanup if stuck
brooklyn mcp dev-cleanup
```

## Important Notes

### 🔌 Socket vs Pipe Transport

**Socket Transport (Recommended):**

- ✅ No hanging/blocking issues
- ✅ Bidirectional communication
- ✅ Works with standard tools (`nc`, `socat`)
- ✅ Reliable for AI agent development

**Named Pipe Transport (Experimental):**

- ⚠️ Blocking behavior - requires careful reader/writer coordination
- ⚠️ Node.js limitations can cause hanging
- ⚠️ Must set up reader before writing

### ✅ Correct MCP Protocol

Dev mode uses **identical JSON-RPC** to production Brooklyn:

- Same message format
- Same tool definitions
- Same error handling
- Same capabilities

### 🔄 Development Workflow

1. Start dev mode once: `brooklyn mcp dev-start --transport socket`
2. Send MCP messages to test features
3. Make code changes
4. Restart dev mode: `brooklyn mcp dev-restart`
5. Test again - no Claude Code restart needed!

## Examples

### Complete Socket Test Session (Recommended)

```bash
# 1. Start dev mode with socket transport
brooklyn mcp dev-start --transport socket

# 2. Get socket path
SOCKET_PATH=$(brooklyn mcp dev-status | grep Socket | awk '{print $NF}')
echo "Using socket: $SOCKET_PATH"

# 3. Initialize MCP session
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{"roots":{}},"clientInfo":{"name":"test","version":"1.0"}}}' | nc -U $SOCKET_PATH

# 4. List available tools
echo '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' | nc -U $SOCKET_PATH

# 5. Launch a browser
echo '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"launch_browser","arguments":{"browserType":"chromium","headless":true}}}' | nc -U $SOCKET_PATH

# 6. When done, stop dev mode
brooklyn mcp dev-stop
```

### Interactive Testing

```bash
# Start socket session
brooklyn mcp dev-start --transport socket
SOCKET_PATH=$(brooklyn mcp dev-status | grep Socket | awk '{print $NF}')

# Interactive mode with netcat
nc -U $SOCKET_PATH
# Now type JSON-RPC messages directly:
# {"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}
# {"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}
```

For troubleshooting, see [troubleshooting.md](troubleshooting.md).
