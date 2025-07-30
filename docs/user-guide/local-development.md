# Local Development Mode Guide

## Introduction

Brooklyn's local development mode enables developers to test and iterate on MCP server changes without disrupting active Claude Code sessions. This mode uses named pipes (FIFOs) for communication, allowing a detached Brooklyn process to run independently. It's particularly useful for rapid development cycles while maintaining full MCP protocol compatibility.

**Key Benefits:**

- ✅ No Claude Code session restarts needed for MCP development
- ✅ Independent background Brooklyn process for testing
- ✅ Full browser automation through dev mode pipes
- ✅ Production-identical MCP protocol compliance
- ✅ Proper process lifecycle management

For architectural details, see [docs/development/dev-mode-pipes.md](../development/dev-mode-pipes.md).

**Note**: This mode is intended for development use only. Do not use in production environments.

## Prerequisites

- Brooklyn built and installed: `bun run build && bun install`
- Brooklyn CLI available globally: `brooklyn --version` should show version 1.2.2+
- Playwright browsers installed (run `bun run setup` if needed)
- Familiarity with Brooklyn's core concepts and MCP protocol

## Quick Start

The fastest way to get started with dev mode:

```bash
# 1. Build and install Brooklyn CLI
bun run build && bun install

# 2. Start dev mode (runs in foreground!)
brooklyn mcp dev-start

# 3. Check status (in separate terminal)
brooklyn mcp dev-status

# 4. Test communication (optional)
node examples/brooklyn-dev-test.js

# 5. Stop when done
brooklyn mcp dev-stop
```

## Configuration

Brooklyn dev mode uses temporary named pipes in `/tmp` by default with the pattern:

- Input pipe: `/tmp/brooklyn-mcp-dev-{id}-in`
- Output pipe: `/tmp/brooklyn-mcp-dev-{id}-out`

No additional configuration is required. The dev mode automatically:

- Creates unique pipe names per session
- Manages process lifecycle and cleanup
- Stores pipe information in `~/.brooklyn/dev/pipes.json`

## CLI Commands

All dev mode operations use the Brooklyn CLI. The commands are available after running `bun run build && bun install`.

### Starting Dev Mode

Launch the development server with named pipes:

```bash
# Terminal 1: Start dev mode (runs in foreground!)
brooklyn mcp dev-start

# For AI agents: Background the process
brooklyn mcp dev-start &
```

⚠️ **Important**: Dev mode runs in the foreground by default. Use a separate terminal for other commands or background the process.

This command:

- Creates unique named pipes in `/tmp`
- Starts a detached Brooklyn MCP server process
- Stores pipe information for status checking
- Automatically cleans up stale resources from previous runs

### Checking Status

Verify the server is running and get pipe information:

```bash
brooklyn mcp dev-status
```

Example output:

```
📊 Brooklyn MCP Development Mode Status
Process: 🟢 Running
PID: 28164
Input Pipe: ✅ /tmp/brooklyn-mcp-dev-b99y20-1753385852073-in
Output Pipe: ✅ /tmp/brooklyn-mcp-dev-b99y20-1753385852073-out
```

### Testing Connection

Test MCP communication through the pipes:

```bash
# Use provided test clients
node examples/brooklyn-dev-test.js       # Basic MCP protocol test
node examples/dev-mode-client.js         # Non-blocking client example
node test-browser-automation.js          # Full browser automation test
```

### Stopping Dev Mode

Gracefully stop the server and clean up all resources:

```bash
brooklyn mcp dev-stop
```

This command:

- Terminates the Brooklyn MCP process
- Removes named pipes
- Cleans up temporary files
- Ensures no orphaned processes remain

### Restarting

Restart the development server (stop + start):

```bash
brooklyn mcp dev-restart
```

### Manual Cleanup

If needed, manually clean up orphaned processes and resources:

```bash
brooklyn mcp dev-cleanup
```

**Note**: The `brooklyn mcp dev-*` commands are also available as bun scripts (`bun run dev:brooklyn:*`) for repository-based development.

## Development Workflow

### Typical Development Cycle

1. **Start dev mode**: `brooklyn mcp dev-start` (in Terminal 1, runs in foreground)
2. **Make code changes** to Brooklyn source (in Terminal 2)
3. **Test changes**: Use the provided client examples or create custom MCP clients
4. **Verify functionality**: `brooklyn mcp dev-status` to check health
5. **Iterate**: Repeat steps 2-4 as needed
6. **Stop when done**: `brooklyn mcp dev-stop` or Ctrl+C in Terminal 1

### Advanced Development

For more intensive development work:

```bash
# 1. Start dev mode (Terminal 1, runs in foreground)
brooklyn mcp dev-start

# 2. Monitor logs in real-time (Terminal 2)
tail -f ~/.brooklyn/dev/logs/brooklyn-mcp-dev-*.log

# 3. Test browser automation
node test-browser-automation.js

# 4. Make code changes and rebuild if needed
bun run build

# 5. Restart dev mode to pick up changes
brooklyn mcp dev-restart
```

### MCP Client Development

When developing MCP clients to test against Brooklyn:

```javascript
// Get current pipe information
const pipesInfo = JSON.parse(fs.readFileSync("~/.brooklyn/dev/pipes.json", "utf-8"));
const { inputPipe, outputPipe } = pipesInfo;

// Use streams for non-blocking communication
const writer = createWriteStream(inputPipe);
const reader = spawn("cat", [outputPipe]);

// Send MCP messages
writer.write(
  JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/list",
  }) + "\n",
);
```

## Troubleshooting

### Common Issues

**Process not starting:**

```bash
# Check for existing instances
brooklyn mcp dev-status

# Clean up if needed
brooklyn mcp dev-stop
brooklyn mcp dev-cleanup
```

**Pipe communication errors:**

```bash
# Verify pipes exist and are accessible
ls -la /tmp/brooklyn-mcp-dev-*
brooklyn mcp dev-status
```

**FIFO/pipe blocking issues:**

- Named pipes block until both reader and writer connect
- Use stream-based clients (see examples) instead of sync file operations
- Avoid `fs.readFileSync` on pipes - use `spawn('cat', [pipe])` instead

**Connection timeouts:**

```bash
# Check if Brooklyn process is actually running
brooklyn mcp dev-status

# View recent logs for errors
tail -20 ~/.brooklyn/dev/logs/brooklyn-mcp-dev-*.log
```

### Debug Mode

For detailed debugging, start dev mode with verbose logging:

```bash
# Stop existing instance first
brooklyn mcp dev-stop

# Start with debug logging (runs in foreground)
brooklyn mcp dev-start --log-level debug
```

### Log Locations

- **Dev mode logs**: `~/.brooklyn/dev/logs/brooklyn-mcp-dev-*.log`
- **Pipe information**: `~/.brooklyn/dev/pipes.json`
- **Process information**: `~/.brooklyn/dev/process-info.json`

## Technical Details

### Transport Architecture

Brooklyn dev mode uses the `MCPFifoTransport` which:

- Opens named pipes using `cat` subprocess (avoids Node.js stream issues)
- Uses low-level file descriptors for writing
- Handles FIFO blocking behavior correctly
- Provides identical MCP protocol compliance to production

### Process Management

- **Detached process**: Brooklyn runs independently of the parent shell
- **Process tracking**: PID and status stored in `~/.brooklyn/dev/`
- **Automatic cleanup**: Starting dev mode cleans up stale resources
- **Orphan detection**: Status command scans for orphaned Brooklyn processes

### Named Pipe Behavior

- **Blocking by design**: FIFOs block until both ends connect (standard Unix behavior)
- **Unique names**: Each session gets unique pipe names to avoid conflicts
- **Automatic creation**: Pipes created automatically using `mkfifo`
- **Cleanup**: Pipes removed when dev mode stops

## Limitations

- **Local development only**: No remote access capabilities
- **Single instance per machine**: By design for resource management
- **Manual cleanup**: May require cleanup if process crashes unexpectedly
- **Platform specific**: Currently optimized for Unix-like systems (macOS, Linux)

## Integration with Claude Code

Dev mode is **completely separate** from production Claude Code integration:

- **Production**: Uses `brooklyn mcp start` with stdin/stdout
- **Dev mode**: Uses `brooklyn mcp dev-start` with named pipes
- **No conflicts**: Both can run simultaneously if needed

For Claude Code integration setup, see [MCP Configuration Guide](../deployment/mcp-configuration.md).
