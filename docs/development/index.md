# Brooklyn MCP Server - Development Guide

Welcome to the Brooklyn MCP server development documentation. This guide covers server management, configuration, troubleshooting, and development workflows.

## Overview

Brooklyn is an enterprise-ready MCP (Model Context Protocol) server that provides browser automation capabilities through Playwright. It's designed for multi-team environments with proper resource management, security controls, and comprehensive logging.

## Quick Start

### Bootstrap Script (Recommended)

For new installations, use the automated bootstrap script:

```bash
# Interactive installation
bun run bootstrap

# Install command
bun run bootstrap:install

# Remove installation
bun run bootstrap:remove
```

The bootstrap script will:
- ✅ Detect your OS and set appropriate paths
- ✅ Configure Claude Code integration automatically
- ✅ Install global `brooklyn-server` command
- ✅ Set up and test the server connection

### Starting the Server

```bash
# Development mode (with file watching)
bun run dev

# Production mode
bun run build
bun run start

# Using server management scripts
bun run server:start
bun run server:status
bun run server:stop
```

### Brooklyn CLI (Global Management)

Brooklyn includes a built-in CLI that can be installed locally or globally:

```bash
# Install CLI for current project
bun run install

# Global server management (works from anywhere)
brooklyn-server start       # Start the server
brooklyn-server stop        # Stop the server
brooklyn-server restart     # Restart the server
brooklyn-server status      # Check server status
brooklyn-server logs        # View server logs (continuous)
brooklyn-server logs --recent  # View recent logs only
brooklyn-server cleanup     # Clean up resources
brooklyn-server info        # Show installation information

# Get comprehensive help
brooklyn-server --help
brooklyn-server logs --help
```

**CLI Installation Types:**
- **Project-local**: `bun run install` (manages this specific Brooklyn instance)
- **User-wide**: Use bootstrap script (`bun run bootstrap`) for system-wide installation
- **Multiple instances**: Each Brooklyn installation can have its own CLI

**Deprovisioning:**
- **Remove CLI**: `bun run bootstrap:remove` 
- **Check installation**: `brooklyn-server info`
- **Verify removal**: CLI commands will no longer work

### Basic Configuration

The server uses environment variables for configuration:

```bash
# Server configuration
export WEBPILOT_ENV=development
export WEBPILOT_PORT=3000
export WEBPILOT_LOG_LEVEL=debug

# Browser pool configuration
export WEBPILOT_MAX_BROWSERS=10
export WEBPILOT_BROWSER_TIMEOUT=30000
export WEBPILOT_HEADLESS=true

# Security configuration
export WEBPILOT_RATE_LIMIT_REQUESTS=100
export WEBPILOT_RATE_LIMIT_WINDOW=60000
```

## Server Management

### Server Management Scripts

Brooklyn includes comprehensive server management scripts for production deployment:

```bash
# Start server as daemon
bun run server:start

# Stop server gracefully
bun run server:stop

# Restart server
bun run server:restart

# Check server status
bun run server:status

# Clean up resources
bun run server:cleanup

# View recent logs (last 20 lines)
bun run server:logs:recent

# View server logs (continuous)
bun run server:logs
```

### Process Management

The server management system uses PID files and proper process lifecycle management:

- **PID file**: `~/.local/share/fulmen-brooklyn/server.pid`
- **Graceful shutdown**: SIGTERM with 3-second timeout
- **Force kill**: SIGKILL as fallback
- **Process monitoring**: Health checks and status reporting

### Server Lifecycle

1. **Initialization**: Logger setup, browser pool initialization, plugin loading
2. **Runtime**: MCP protocol handling, browser session management
3. **Cleanup**: Browser pool cleanup, resource deallocation
4. **Shutdown**: Graceful shutdown with resource cleanup

## Logging and Monitoring

### Log Configuration

Brooklyn uses Winston for structured logging with multiple output options:

```bash
# Log levels
export WEBPILOT_LOG_LEVEL=debug|info|warn|error

# Log file (optional)
export WEBPILOT_LOG_FILE=server.log

# Use stderr for all output (useful for CLI tools)
export WEBPILOT_USE_STDERR=true
```

### Log Locations

**Development logs**: Console output with pretty formatting
**Production logs**:

- File: `~/.local/share/fulmen-brooklyn/logs/server.log`
- Console: JSON format
- Rotation: 10MB max, 5 files retained

**Cross-platform log directories**:

- **Linux/macOS**: `~/.local/share/fulmen-brooklyn/logs/`
- **Windows**: `~/AppData/Local/fulmen-brooklyn/logs/`

### Log Formats

```bash
# Pretty format (development)
2025-07-18T16:22:11.327Z info: [main] Starting server {"version":"1.0.1"}

# JSON format (production)
{"timestamp":"2025-07-18T16:22:11.327Z","level":"info","message":"Starting server","service":"fulmen-brooklyn","version":"1.0.1"}

# Compact format
16:22:11 info[main]: Starting server
```

### Monitoring Browser Pool

```bash
# Check browser pool status
curl http://localhost:3000/health

# View active sessions
bun run server:status
```

## Configuration Management

### Environment Variables

| Variable                       | Default       | Description                    |
| ------------------------------ | ------------- | ------------------------------ |
| `WEBPILOT_ENV`                 | `development` | Environment mode               |
| `WEBPILOT_PORT`                | `3000`        | Server port                    |
| `WEBPILOT_LOG_LEVEL`           | `info`        | Log level                      |
| `WEBPILOT_LOG_FILE`            | -             | Log file name                  |
| `WEBPILOT_MAX_BROWSERS`        | `10`          | Maximum concurrent browsers    |
| `WEBPILOT_BROWSER_TIMEOUT`     | `30000`       | Browser operation timeout (ms) |
| `WEBPILOT_HEADLESS`            | `true`        | Run browsers in headless mode  |
| `WEBPILOT_RATE_LIMIT_REQUESTS` | `100`         | Rate limit requests per window |
| `WEBPILOT_RATE_LIMIT_WINDOW`   | `60000`       | Rate limit window (ms)         |

### Configuration Files

- **Main config**: `src/shared/config.ts`
- **Build config**: `src/shared/build-config.ts`
- **Team configs**: `configs/` directory (planned)

### Browser Configuration

```typescript
// Browser launch options
{
  browserType: "chromium" | "firefox" | "webkit",
  headless: boolean,
  viewport: { width: number, height: number },
  userAgent: string,
  timeout: number
}
```

## Development Workflow

### Quality Gates

Before committing any changes:

```bash
# Run all quality checks
bun run check-all

# Individual checks
bun run typecheck
bun run lint
bun run test
bun run format:code
```

### File-level Validation

```bash
# Check specific file
bun run check:file src/path/to/file.ts

# Fix specific file
bun run check:file:fix src/path/to/file.ts
```

### Testing

```bash
# Run all tests
bun run test

# Run specific test file
bun run test src/core/browser-pool-manager.test.ts

# Run tests with coverage
bun run test:coverage

# Run tests in watch mode
bun run test:watch
```

### Version Management

```bash
# Get current version
bun run version:get

# Bump version
bun run version:bump patch|minor|major

# Sync version across files
bun run version:sync
```

## Browser Pool Management

### Browser Pool Concepts

- **Sessions**: Individual browser instances with unique IDs
- **Pool limits**: Maximum concurrent browsers (default: 10)
- **Idle cleanup**: Automatic cleanup after 30 minutes
- **Team isolation**: Browser sessions can be tagged by team
- **Resource management**: Proper cleanup on shutdown

### Browser Pool Status

```typescript
{
  activeSessions: number,
  maxBrowsers: number,
  sessions: Array<{
    id: string,
    teamId?: string,
    createdAt: Date,
    lastUsed: Date,
    isActive: boolean
  }>
}
```

### Browser Operations

```typescript
// Launch browser
await browserPool.launchBrowser({
  teamId: "echo-team",
  browserType: "chromium",
  headless: true,
  viewport: { width: 1920, height: 1080 },
});

// Navigate
await browserPool.navigate({
  browserId: "browser-id",
  url: "https://example.com",
  waitUntil: "domcontentloaded",
});

// Screenshot
await browserPool.screenshot({
  browserId: "browser-id",
  fullPage: true,
  type: "png",
});

// Close browser
await browserPool.closeBrowser({
  browserId: "browser-id",
});
```

## Troubleshooting

### Common Issues

#### Server Won't Start

```bash
# Check if already running
bun run server:status

# Check logs
bun run server:logs

# Clean up and restart
bun run server:cleanup
bun run server:start
```

#### Browser Pool Issues

```bash
# Check browser pool status
curl http://localhost:3000/health

# Force cleanup idle sessions
bun run server:cleanup

# Check Playwright installation
bunx playwright install
```

#### Log File Issues

```bash
# Check log directory permissions
ls -la ~/.local/share/fulmen-brooklyn/logs/

# Check disk space
df -h ~/.local/share/fulmen-brooklyn/

# Rotate logs manually
rm ~/.local/share/fulmen-brooklyn/logs/server.log.*
```

### Debug Mode

```bash
# Start with debug logging
export WEBPILOT_LOG_LEVEL=debug
bun run server:start

# Show browser during automation (non-headless)
export WEBPILOT_HEADLESS=false
bun run dev
```

### Performance Tuning

```bash
# Reduce browser pool size
export WEBPILOT_MAX_BROWSERS=5

# Increase timeout for slow operations
export WEBPILOT_BROWSER_TIMEOUT=60000

# Enable browser debugging
export PWDEBUG=1
```

## Security Considerations

### Domain Validation

- URL validation before navigation
- Configurable domain allowlists (planned)
- Rate limiting per team (planned)

### Resource Limits

- Browser pool limits prevent resource exhaustion
- Automatic cleanup prevents memory leaks
- Timeout controls prevent hanging operations

### Process Isolation

- Each browser runs in isolated context
- Team-specific browser sessions
- Proper cleanup on termination

## API Reference

### MCP Tools

The server exposes these MCP tools:

- `launch_browser`: Launch a new browser instance
- `navigate`: Navigate to a URL
- `screenshot`: Capture page screenshot
- `close_browser`: Close browser instance

### HTTP Endpoints

- `GET /health`: Server health check
- `GET /version`: Server version information
- `GET /status`: Browser pool status

## Development Tips

### IDE Configuration

For VS Code, install these extensions:

- Biome (formatting and linting)
- TypeScript Hero (import organization)
- Playwright Test (test runner)

### Debugging

```bash
# Debug Playwright in headed mode
export WEBPILOT_HEADLESS=false
export PWDEBUG=1
bun run dev

# Debug with Node.js debugger
node --inspect-brk dist/index.js
```

### Performance Monitoring

```bash
# Monitor resource usage
top -p $(cat ~/.local/share/fulmen-brooklyn/server.pid)

# Monitor log file size
watch -n 1 'ls -lh ~/.local/share/fulmen-brooklyn/logs/'
```

## Contributing

### Code Standards

- Follow TypeScript strict mode
- Use structured logging with context
- Write comprehensive tests
- Document public APIs with JSDoc

### Commit Process

1. Run `bun run check-all`
2. Ensure all tests pass
3. Use conventional commit messages
4. Include co-authoring for AI assistance

### Pull Request Guidelines

- Include test coverage for new features
- Update documentation
- Follow existing code patterns
- Ensure quality gates pass

## Related Documentation

- [User Guide](../user-guide/index.md) - End-user documentation
- [API Reference](../api/index.md) - Detailed API documentation
- [Architecture](../architecture/index.md) - System architecture
- [Security](../security/index.md) - Security considerations
