# Local Development Mode Guide

## Introduction

Brooklyn's local development mode enables developers to test and iterate on MCP server changes without disrupting active Claude Code sessions. This mode uses named pipes for communication, allowing a detached Brooklyn process to run independently. It's particularly useful for rapid development cycles while maintaining full MCP protocol compatibility.

For architectural details, see [docs/architecture/notes/mcp-dev-mode-pattern.md](../architecture/notes/mcp-dev-mode-pattern.md).

**Note**: This mode is intended for development use only. Do not use in production environments.

## Prerequisites

- Cloned Brooklyn repository
- Bun installed (version 1.2.x minimum)
- Playwright browsers installed (run `bun run setup` if needed)
- Familiarity with Brooklyn's core concepts

## Configuration

No special configuration is required beyond the standard Brooklyn setup. The dev mode uses temporary named pipes in `/tmp` by default.

If you need custom pipe locations, set the `BROOKLYN_DEV_PIPES_PREFIX` environment variable before starting.

## Usage

All commands are run via Bun scripts from the project root.

### Starting Dev Mode

Launch the development server:

```bash
bun run dev:brooklyn:start
```

This creates named pipes and starts a detached Brooklyn MCP server.

### Checking Status

Verify the server is running:

```bash
bun run dev:brooklyn:status
```

### Testing Connection

Test pipe communication:

```bash
bun run dev:brooklyn:test
```

### Viewing Logs

Show recent logs:

```bash
bun run dev:brooklyn:logs
```

### Stopping Dev Mode

Gracefully stop the server and clean up resources:

```bash
bun run dev:brooklyn:stop
```

### Restarting

Restart the development server:

```bash
bun run dev:brooklyn:restart
```

### Manual Cleanup

If needed, manually clean up resources:

```bash
bun run dev:brooklyn:cleanup
```

Note: Starting dev mode automatically cleans up stale resources from previous runs.

## Development Workflow

1. Start dev mode: `bun run dev:brooklyn:start`
2. Make code changes
3. Test using pipe communication tools (see architecture notes for details)
4. Verify with `bun run dev:brooklyn:test`
5. Stop when done: `bun run dev:brooklyn:stop`

## Troubleshooting

- **Process not starting**: Check for existing instances with `status` and run `stop` if needed.
- **Pipe errors**: Ensure `/tmp` is writable and no permission issues.
- **Connection issues**: Verify pipes exist using `bun run dev:brooklyn:pipes`.
- **Logs**: Always check logs for detailed errors.

For advanced troubleshooting, refer to the architecture notes.

## Limitations

- Local development only (no remote access)
- Single instance per machine (by design)
- Requires manual cleanup if process crashes

If you encounter issues, check the logs and status commands first.
