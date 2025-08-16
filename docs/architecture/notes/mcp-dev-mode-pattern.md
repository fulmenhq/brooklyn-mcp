# MCP Dev Mode Pattern

## Overview

The MCP Dev Mode is an architectural pattern designed to enable isolated development and testing of Brooklyn's MCP server functionality without disrupting production Claude Code instances. This mode uses **Unix domain sockets** (recommended) or named pipes (experimental) for communication, allowing developers to simulate MCP interactions in a detached process. It addresses the limitation where updating an MCP server requires shutting down all Claude Code sessions on a machine, which is highly disruptive in multi-project environments.

Key goals:

- Provide a parallel, non-interfering MCP server for development iteration.
- Maintain full MCP JSON-RPC protocol compatibility.
- Enable chat-based testing and tool calls without full Claude Code infrastructure.
- Support rapid prototyping and debugging for the Brooklyn team.
- Offer reliable transport options across different runtime environments.

This pattern is primarily for internal use by the Brooklyn development team but has potential extensions for CI/CD pipelines.

## Implementation Details

### Core Components

- **Detached Process**: The dev mode launches a background Brooklyn MCP server process using `brooklyn mcp start --dev-mode`. This process runs independently and does not interfere with production MCP servers.
- **Transport Options**: Communication occurs via two transport mechanisms:
  - **Unix Socket Transport** (recommended): Bidirectional communication over Unix domain sockets (e.g., `/tmp/brooklyn-mcp-dev-{uuid}-{timestamp}.sock`)
  - **Named Pipes** (experimental): FIFO pipes for legacy compatibility (e.g., `/tmp/brooklyn-dev-in-{timestamp}`, `/tmp/brooklyn-dev-out-{timestamp}`)
- **Enhanced MCP Transport**: Custom transport implementations that properly integrate with the MCP SDK for reliable message handling.
- **Process Management**: Commands for start, stop, restart, status, and cleanup via CLI with PID files and signal handling.
- **Full Tool Support**: All 21 Brooklyn tools available (15 core tools including element interaction functions + 6 onboarding tools) through the development mode.

### Key Files

- **CLI Integration**: Handled in `src/cli/brooklyn.ts` via the `--dev-mode` flag on `mcp start`.
- **Socket Transport**: `src/transports/mcp-socket-transport.ts` - Unix domain socket MCP transport with reliable bidirectional communication.
- **FIFO Transport**: `src/transports/mcp-fifo-transport.ts` - Named pipe MCP transport (experimental, Node.js limitations).
- **Transport Factory**: `src/transports/index.ts` - Automatic transport selection based on configuration.
- **Dev Mode Core**: `src/core/mcp-dev-manager.ts` - Transport creation, process info management, and cleanup handlers.
- **Configuration**: Transport locations configurable (default: `/tmp`), with automatic cleanup on exit and process monitoring.

### Security and Limitations

- Transport files have restrictive permissions (0600) to prevent unauthorized access.
- Intended for local dev only— not for production or remote use.
- No authentication in v1; rely on OS-level isolation.
- **Transport-Specific Limitations**:
  - **Socket Transport**: Reliable, recommended for all use cases
  - **Named Pipes**: Experimental only, requires `--experimental` flag due to Node.js FIFO limitations
- Cleanup is automatic on process termination with manual override via `brooklyn mcp dev-cleanup`.

## Usage Guide

### Starting Dev Mode

Launch the dev server using the CLI commands:

```bash
# Socket transport (recommended, default)
brooklyn mcp dev-start

# Socket transport with team ID
brooklyn mcp dev-start --team-id frontend

# Foreground mode for debugging
brooklyn mcp dev-start --foreground

# Named pipe transport (experimental)
brooklyn mcp dev-start --transport pipe --experimental
```

⚠️ **Important**: Dev mode runs in background by default. Use `--foreground` flag to keep the process attached to the terminal for debugging. Socket transport is recommended for reliability.

### Management Commands

Brooklyn provides comprehensive development mode management:

```bash
# Process Management
brooklyn mcp dev-start       # Start development mode server
brooklyn mcp dev-stop        # Stop development mode server
brooklyn mcp dev-status      # Check server status and transport health
brooklyn mcp dev-cleanup     # Clean up orphaned processes and files
brooklyn mcp dev-restart     # Restart development mode server

# Development Options
brooklyn mcp dev-start --transport socket --team-id frontend
brooklyn mcp dev-start --transport pipe --experimental
brooklyn mcp dev-start --foreground  # Debug mode
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

1. Start dev mode: `brooklyn mcp dev-start`
2. Test connection and tools using the provided instructions
3. Use chat/helpers to test features (e.g., screenshot storage, browser automation)
4. Iterate on code without restarting Claude Code sessions
5. Stop/cleanup when done: `brooklyn mcp dev-stop`

**Socket Transport Usage:**

```bash
# Test connection
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' | nc -U /tmp/brooklyn-mcp-dev-*.sock

# Interactive mode
nc -U /tmp/brooklyn-mcp-dev-*.sock
```

**Named Pipe Transport Usage (Experimental):**

```bash
# Send messages (requires reader first to avoid hanging)
tail -f /tmp/brooklyn-mcp-dev-*-out &
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' > /tmp/brooklyn-mcp-dev-*-in
```

## Benefits

- **Non-Disruptive**: Test MCP changes without affecting other projects.
- **Rapid Iteration**: Instant feedback via chat-based tool calls.
- **Protocol Fidelity**: Exact MCP behavior for accurate testing.
- **Isolation**: Multiple dev instances can run in parallel.
- **Transport Flexibility**: Choose reliable socket transport or experimental pipes.
- **Cross-Platform**: Socket transport works reliably across all platforms.

## Potential for CI/CD Use Cases

While designed for local dev, this pattern extends naturally to CI/CD pipelines:

- **Automated Testing**: In GitHub Actions/Jenkins, start a dev-mode server with socket transport, run MCP tool tests, and assert responses—without full Claude Code setup.
- **Integration Tests**: Simulate multi-instance scenarios by launching multiple dev servers in a pipeline, testing cross-communication or load.
- **Artifact Generation**: Use dev mode to generate screenshots/reports during builds, storing them as artifacts.
- **Headless CI**: Combine with headless browsers for end-to-end tests in isolated environments.
- **Cross-Platform CI**: Socket transport ensures reliable operation across Linux, macOS, and Windows (WSL) CI environments.
- **Extensions Needed**: Add `--ci-mode` flag for non-interactive operation (e.g., auto-cleanup, JSON output for assertions). Backlog this for Phase 2 to make Brooklyn more testable in pipelines.

## Transport Implementation Notes

### Socket Transport (Recommended)

- **File**: `src/transports/mcp-socket-transport.ts`
- **Reliability**: Fully reliable in all Node.js and Bun environments
- **Features**: Bidirectional, connection-oriented, multi-client support
- **Usage**: Default transport, no special flags required

### Named Pipe Transport (Experimental)

- **File**: `src/transports/mcp-fifo-transport.ts`
- **Reliability**: Known issues in Node.js runtime environments
- **Limitations**: Requires `--experimental` flag, can hang without proper reader/writer order
- **Usage**: For compatibility testing only, not recommended for regular development

### Cross-Language Implementation

This pattern serves as a reference for implementing similar development modes in other languages:

- **Go**: Can use either sockets or named pipes reliably with goroutines
- **Rust**: Excellent async support for both transport types
- **Python**: asyncio works well with socket transport

This pattern enhances our dev velocity and could evolve into a powerful testing primitive. For questions, consult the Brooklyn team.

— Brooklyn Architecture Committee  
Last Updated: August 16, 2025
