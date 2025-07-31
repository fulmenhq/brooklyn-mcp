# Brooklyn Local Development Mode Overview

Brooklyn's development mode enables rapid iteration on MCP servers without requiring full Claude Code session restarts. It uses named pipes for communication, providing **identical MCP protocol behavior** to production while avoiding stdin/stdout conflicts.

## What is Dev Mode?

Dev mode creates a Brooklyn MCP server that:

- **Reads MCP requests** from a named pipe (instead of stdin)
- **Writes MCP responses** to a named pipe (instead of stdout)
- **Uses identical protocol** - same JSON-RPC messages as production
- **Runs persistently** - no need to restart between tests
- **Isolates communication** - won't interfere with Claude Code sessions

## Key Features

- **Named pipe communication** - Avoids stdin/stdout conflicts
- **Persistent server** - Runs in background until explicitly stopped
- **Full MCP protocol** - Identical behavior to production Brooklyn
- **Secure permissions** - Pipes created with 600 permissions
- **Process management** - Clean startup/shutdown with PID tracking

## When to Use Dev Mode

✅ **Use dev mode for:**

- Testing MCP protocol changes without restarting Claude Code
- Debugging MCP message handling
- Developing new MCP tools
- Integration testing with custom MCP clients

❌ **Don't use dev mode for:**

- Normal Claude Code usage (use `brooklyn mcp start`)
- Production deployments
- When you need web interface access

For usage details, see [usage.md](usage.md).  
For troubleshooting, see [troubleshooting.md](troubleshooting.md).  
For architecture details, see [architecture.md](architecture.md).
