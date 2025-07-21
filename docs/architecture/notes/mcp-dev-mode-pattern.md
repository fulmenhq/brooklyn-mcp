# MCP Dev Mode Pattern

## Overview

The MCP Dev Mode is an architectural pattern designed to enable isolated development and testing of Brooklyn's MCP server functionality without disrupting production Claude Code instances. This mode uses named pipes (FIFOs) for communication, allowing developers to simulate MCP interactions in a detached process. It addresses the limitation where updating an MCP server requires shutting down all Claude Code sessions on a machine, which is highly disruptive in multi-project environments.

Key goals:

- Provide a parallel, non-interfering MCP server for development iteration.
- Maintain full MCP JSON-RPC protocol compatibility.
- Enable chat-based testing and tool calls without full Claude Code infrastructure.
- Support rapid prototyping and debugging for the Brooklyn team.

This pattern is primarily for internal use by the Brooklyn development team but has potential extensions for CI/CD pipelines.

## Implementation Details

### Core Components

- **Detached Process**: The dev mode launches a background Brooklyn MCP server process using `brooklyn mcp start --dev-mode`. This process runs independently and does not interfere with production MCP servers.
- **Named Pipes**: Communication occurs over timestamped FIFO pipes (e.g., `/tmp/brooklyn-dev-in-{timestamp}`, `/tmp/brooklyn-dev-out-{timestamp}`).
  - Input pipe: Client writes MCP requests (JSON-RPC format).
  - Output pipe: Server writes responses.
- **Process Management**: Commands for start, stop, restart, status, and cleanup, managed via PID files and signals.
- **Helper Functions**: In `dev-helpers.ts` (or integrated), functions like `dev_launch_browser()` and `dev_take_screenshot()` provide a seamless interface for chat-based testing, returning the same data structures as production MCP tools.

### Key Files

- **CLI Integration**: Handled in `src/cli/brooklyn.ts` via the `--dev-mode` flag on `mcp start`.
- **Transport**: Uses a custom pipe-based transport that implements the MCP protocol.
- **Configuration**: Pipe locations are configurable (default: `/tmp`), with auto-cleanup on exit to prevent residue.

### Security and Limitations

- Pipes have restrictive permissions (0600) to prevent unauthorized access.
- Intended for local dev only— not for production or remote use.
- No authentication in v1; rely on OS-level isolation.
- Cleanup is manual via `brooklyn mcp dev-cleanup` (backlog: auto-cleanup).

## Usage Guide

### Starting Dev Mode

Launch the dev server:

```
brooklyn mcp start --dev-mode --team-id=blossflow
```

- This creates pipes and a detached process.
- Control returns immediately to the terminal.

### Interacting via Chat or Scripts

Use helper functions for tool calls:

```typescript
// In a chat context or script
const browser = await dev_launch_browser({ browserType: "chromium", headless: true });
const screenshot = await dev_take_screenshot({
  browserId: browser.browserId,
  returnFormat: "file",
});
```

- These send JSON-RPC requests over pipes and parse responses.
- Full MCP methods are supported (e.g., `tools/call`).

### Management Commands

- Status: `brooklyn mcp dev-status`
- Stop: `brooklyn mcp dev-stop`
- Restart: `brooklyn mcp dev-restart`
- Cleanup: `brooklyn mcp dev-cleanup` (removes pipes/PID files)

Note: These are hidden from main help output; use `--internal` to view.

### Development Workflow

1. Start dev mode.
2. Use chat/helpers to test features (e.g., screenshot storage, browser automation).
3. Iterate on code.
4. Stop/cleanup when done.
5. For production testing: Shut down Claude Code instances, update, and restart.

## Benefits

- **Non-Disruptive**: Test MCP changes without affecting other projects.
- **Rapid Iteration**: Instant feedback via chat-based tool calls.
- **Protocol Fidelity**: Exact MCP behavior for accurate testing.
- **Isolation**: Multiple dev instances can run in parallel.

## Potential for CI/CD Use Cases

While designed for local dev, this pattern extends naturally to CI/CD pipelines:

- **Automated Testing**: In GitHub Actions/Jenkins, start a dev-mode server, run MCP tool tests via pipes, and assert responses—without full Claude Code setup.
- **Integration Tests**: Simulate multi-instance scenarios by launching multiple dev servers in a pipeline, testing cross-communication or load.
- **Artifact Generation**: Use dev mode to generate screenshots/reports during builds, storing them as artifacts.
- **Headless CI**: Combine with headless browsers for end-to-end tests in isolated environments.
- **Extensions Needed**: Add `--ci-mode` flag for non-interactive operation (e.g., auto-cleanup, JSON output for assertions). Backlog this for Phase 2 to make Brooklyn more testable in pipelines.

This pattern enhances our dev velocity and could evolve into a powerful testing primitive. For questions, consult the Brooklyn team.

— Brooklyn Architecture Committee  
Last Updated: July 21, 2025
