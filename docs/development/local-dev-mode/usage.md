# Brooklyn Development Mode Usage

## Core Commands

Brooklyn dev mode uses the built-in MCP CLI commands (NOT the deprecated scripts):

```bash
# Check status (ALWAYS first!)
bun run src/cli/brooklyn.ts mcp dev-status

# Start dev mode (runs in background)
bun run src/cli/brooklyn.ts mcp dev-start

# Stop dev mode
bun run src/cli/brooklyn.ts mcp dev-stop

# Clean up resources
bun run src/cli/brooklyn.ts mcp dev-cleanup

# Restart (stop + start)
bun run src/cli/brooklyn.ts mcp dev-restart
```

## Step-by-Step Usage

### 1. Start Dev Mode

```bash
# Always check status first to avoid conflicts
bun run src/cli/brooklyn.ts mcp dev-status

# Start the dev mode server (creates named pipes)
bun run src/cli/brooklyn.ts mcp dev-start
```

This creates two named pipes in `/tmp/` with format:

- Input pipe: `/tmp/brooklyn-mcp-dev-{uuid}-{timestamp}-in`
- Output pipe: `/tmp/brooklyn-mcp-dev-{uuid}-{timestamp}-out`

### 2. Communicate with Dev Mode

Dev mode uses **identical MCP protocol** to production. Send JSON-RPC messages:

#### Initialize Connection

```bash
# Send to input pipe (Brooklyn reads from this)
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{"roots":{}},"clientInfo":{"name":"test-client","version":"1.0.0"}}}' > /tmp/brooklyn-mcp-dev-{uuid}-{timestamp}-in
```

#### Read Responses

```bash
# Read from output pipe (Brooklyn writes to this)
cat /tmp/brooklyn-mcp-dev-{uuid}-{timestamp}-out
```

#### List Available Tools

```bash
echo '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' > /tmp/brooklyn-mcp-dev-{uuid}-{timestamp}-in
```

#### Call a Tool

```bash
echo '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"launch_browser","arguments":{"browserType":"chromium","headless":true}}}' > /tmp/brooklyn-mcp-dev-{uuid}-{timestamp}-in
```

### 3. Stop Dev Mode

```bash
# Clean shutdown
bun run src/cli/brooklyn.ts mcp dev-stop

# Or force cleanup if stuck
bun run src/cli/brooklyn.ts mcp dev-cleanup
```

## Important Notes

### ⚠️ Pipe Communication Behavior

- Named pipes are **blocking** - they wait for both reader and writer
- Always have a reader ready (e.g., `cat` in background) before writing
- Pipes have 600 permissions for security

### ✅ Correct MCP Protocol

Dev mode uses **identical JSON-RPC** to production Brooklyn:

- Same message format
- Same tool definitions
- Same error handling
- Same capabilities

### 🔄 Development Workflow

1. Start dev mode once
2. Send MCP messages to test features
3. Make code changes
4. Restart dev mode: `mcp dev-restart`
5. Test again - no Claude Code restart needed!

## Examples

### Complete Test Session

```bash
# 1. Start dev mode
bun run src/cli/brooklyn.ts mcp dev-start

# 2. In another terminal, set up reader
PIPES=$(ls /tmp/brooklyn-mcp-dev-*-out | head -1)
cat $PIPES &

# 3. Send initialize message
INPUT_PIPE=${PIPES/-out/-in}
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{"roots":{}},"clientInfo":{"name":"test","version":"1.0"}}}' > $INPUT_PIPE

# 4. List tools
echo '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' > $INPUT_PIPE

# 5. When done, stop dev mode
bun run src/cli/brooklyn.ts mcp dev-stop
```

For troubleshooting, see [troubleshooting.md](troubleshooting.md).
