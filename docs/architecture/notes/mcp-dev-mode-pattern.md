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
- **Enhanced MCP Transport**: Custom pipe-based MCP stdio transport that properly integrates pipe streams with the MCP SDK by temporarily replacing stdin/stdout during connection.
- **Process Management**: Commands for start, stop, restart, status, and cleanup via `scripts/dev-brooklyn.ts` with PID files and signal handling.
- **Full Tool Support**: All 21 Brooklyn tools available (15 core tools including element interaction functions + 6 onboarding tools) through the development mode.

### Key Files

- **CLI Integration**: Handled in `src/cli/brooklyn.ts` via the `--dev-mode` flag on `mcp start`.
- **Enhanced Transport**: `src/transports/mcp-stdio-transport.ts` - Custom pipe-based MCP transport with proper stream integration.
- **Dev Mode Core**: `src/core/dev-mode.ts` - Named pipe creation, process info management, and cleanup handlers.
- **Management Script**: `scripts/dev-brooklyn.ts` - Process lifecycle management with start, stop, status, and test commands.
- **Configuration**: Pipe locations configurable (default: `/tmp`), with automatic cleanup on exit and process monitoring.

### Security and Limitations

- Pipes have restrictive permissions (0600) to prevent unauthorized access.
- Intended for local dev only— not for production or remote use.
- No authentication in v1; rely on OS-level isolation.
- Cleanup is manual via `brooklyn mcp dev-cleanup` (backlog: auto-cleanup).

## Usage Guide

### Starting Dev Mode

Launch the dev server using the management script:

```bash
# Terminal 1: Start dev mode (runs in foreground!)
bun run dev:brooklyn:start

# For AI agents: Background the process
bun run dev:brooklyn:start &
```

⚠️ **Important**: Dev mode runs in the foreground by default. This creates named pipes and spawns a Brooklyn MCP server process that stays attached to the terminal. Use a separate terminal for other commands or background the process for automation.

### Management Commands

Brooklyn provides comprehensive development mode management:

```bash
# Process Management
bun run dev:brooklyn:start    # Start development mode server
bun run dev:brooklyn:stop     # Stop development mode server
bun run dev:brooklyn:status   # Check server status and pipe health
bun run dev:brooklyn:logs     # View server logs
bun run dev:brooklyn:test     # Test MCP connection

# Alternative: Direct CLI access
brooklyn mcp start --dev-mode --team-id=<team>
```

### Available Tools in Dev Mode

All 21 Brooklyn tools are available through the development server:

**Core Tools (15)** - Including new element interaction functions:

- Browser lifecycle: `launch_browser`, `close_browser`, `list_active_browsers`
- Navigation: `navigate_to_url`, `go_back`
- Element interaction: `click_element`, `fill_text`, `fill_form`, `wait_for_element`, `get_text_content`, `validate_element_presence`, `find_elements`
- Content capture: `take_screenshot`
- Discovery: `brooklyn_list_tools`, `brooklyn_tool_help`

**Onboarding Tools (6)**: `brooklyn_status`, `brooklyn_capabilities`, `brooklyn_getting_started`, `brooklyn_examples`, `brooklyn_team_setup`, `brooklyn_troubleshooting`

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
