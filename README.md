# Brooklyn - Fulmen MCP Browser Automation Platform

**Enterprise-ready MCP server for browser automation with multi-team support**

Brooklyn is a Model Context Protocol (MCP) server that provides AI developers and teams with powerful browser automation capabilities. Built on the Fulmen ecosystem principles, Brooklyn serves as a bridge between AI models and web browsers, enabling seamless automation, testing, and monitoring workflows.

## 🚀 Quick Start

### Prerequisites

- **Bun** (>= 1.0.0) - [Install Bun](https://bun.sh)
- **Node.js** (>= 18.0.0) - For compatibility
- **Claude Code** - [Install Claude Code](https://claude.ai/code)

### Installation

```bash
# Clone the repository
git clone https://github.com/3leaps/fulmen-mcp-forge-brooklyn.git
cd fulmen-mcp-forge-brooklyn

# Install dependencies
bun install

# Set up browsers
bun run setup

# Start the server
bun run server:start
```

### Connect to Claude

Add Brooklyn to your Claude Code configuration:

**macOS/Linux:** `~/.config/claude/claude_desktop_config.json`  
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "brooklyn": {
      "command": "bun",
      "args": ["run", "start"],
      "cwd": "/absolute/path/to/fulmen-mcp-forge-brooklyn"
    }
  }
}
```

### Test Connection

Restart Claude Code and test the connection:

```
# In Claude Code, try:
brooklyn_status

# Or launch your first browser:
Launch a chromium browser for team 'demo'
```

## 🎯 Use Cases

### AI Development

- **Smart Web Automation**: Let Claude navigate websites and extract data
- **Dynamic Testing**: Generate and run tests based on UI changes
- **Form Automation**: Automate complex form filling and submission

### E2E Testing

- **Cross-Browser Testing**: Chromium, Firefox, and WebKit support
- **Visual Regression**: Screenshot comparison and validation
- **Test Orchestration**: AI-driven test execution and debugging

### Team Workflows

- **Multi-Team Isolation**: Separate browser pools and configurations
- **Resource Management**: Intelligent browser pooling and cleanup
- **Security Controls**: Domain allowlisting and access controls

## 📋 Available Commands

### Core Browser Automation

```bash
# Launch a browser
launch_browser type=chromium headless=true teamId=my-team

# Navigate to a website
navigate browserId=browser_123 url=https://example.com

# Take a screenshot
screenshot browserId=browser_123 fullPage=true

# Close browser
close_browser browserId=browser_123
```

### Onboarding & Discovery

```bash
# Get server status
brooklyn_status

# List all capabilities
brooklyn_capabilities

# Get getting started guide
brooklyn_getting_started use_case=ai_development

# Get practical examples
brooklyn_examples task=basic_navigation format=claude_commands

# Set up team configuration
brooklyn_team_setup team_id=my-team use_cases=["e2e_testing"]

# Get troubleshooting help
brooklyn_troubleshooting issue=connection_failed
```

## 🛠️ Server Management

### Development

```bash
# Start development server
bun run dev

# Start server (production)
bun run server:start

# Stop server
bun run server:stop

# Check server status
bun run server:status

# Clean up resources
bun run server:cleanup
```

### Quality Assurance

```bash
# Run all quality checks
bun run check-all

# Type checking
bun run typecheck

# Linting
bun run lint
bun run lint:fix

# Code formatting
bun run format:code

# File-level validation
bun run check:file src/path/to/file.ts
bun run check:file:fix src/path/to/file.ts

# Version management
bun run version:get
bun run version:set 1.2.3
bun run version:bump patch
bun run check:versions
```

### Testing

```bash
# Run all tests
bun run test

# Watch mode
bun run test:watch

# Coverage report
bun run test:coverage

# E2E tests
bun run test:e2e
```

## 🏢 Team Configuration

### Multi-Team Setup

Brooklyn supports multiple teams with isolated configurations:

```json
{
  "teams": {
    "frontend": {
      "allowedDomains": ["localhost:3000", "staging.example.com"],
      "maxBrowsers": 5,
      "rateLimit": { "requests": 100, "window": 60000 }
    },
    "qa": {
      "allowedDomains": ["*.example.com", "test.internal"],
      "maxBrowsers": 10,
      "customTools": ["visual_regression"]
    }
  }
}
```

### Environment Variables

Brooklyn uses a dedicated port range (50xxx) to avoid conflicts:

```bash
# Server configuration - Brooklyn reserves 50xxx port range
export BROOKLYN_MCP_PORT=50000        # Main MCP server
export BROOKLYN_HEALTH_PORT=50001     # Health check endpoint
export BROOKLYN_METRICS_PORT=50002    # Metrics endpoint
export BROOKLYN_ADMIN_PORT=50003      # Admin interface (future)

# Core settings
export BROOKLYN_ENVIRONMENT=development
export BROOKLYN_MAX_BROWSERS=10
export BROOKLYN_HEADLESS=true
export BROOKLYN_LOG_LEVEL=info

# Security settings
export BROOKLYN_RATE_LIMIT_REQUESTS=100
export BROOKLYN_RATE_LIMIT_WINDOW=60000
export BROOKLYN_ALLOWED_DOMAINS="localhost,*.example.com"

# Copy .env.example to .env and customize for your setup
cp .env.example .env
```

## 🔐 Security Features

- **Domain Allowlisting**: Restrict which domains teams can access
- **Resource Limits**: Per-team browser and memory limits
- **Audit Logging**: Complete audit trail of all automation activities
- **Secure Contexts**: Isolated browser contexts for each team

## 🎭 Browser Support

| Browser      | Status          | Use Cases                            |
| ------------ | --------------- | ------------------------------------ |
| **Chromium** | ✅ Full Support | AI development, general automation   |
| **Firefox**  | ✅ Full Support | Cross-browser testing, compatibility |
| **WebKit**   | ✅ Full Support | Safari simulation, mobile testing    |

## 📊 Monitoring

### Health Checks

```bash
# Check server health
curl http://localhost:3000/health

# Get detailed metrics
curl http://localhost:3000/metrics

# Version information
curl http://localhost:3000/version
```

### Observability

- **Structured Logging**: All activities logged with team attribution
- **Metrics Collection**: Resource usage, performance, and error rates
- **Distributed Tracing**: OpenTelemetry integration (optional)

## 🔧 Development

### Project Structure

```
brooklyn/
├── src/
│   ├── core/           # Core MCP server logic
│   ├── adapters/       # Playwright integration
│   ├── ports/          # Interface definitions
│   ├── shared/         # Shared utilities
│   └── plugins/        # Team-specific extensions
├── tests/             # Test suite
├── configs/           # Team configurations
├── scripts/           # Management scripts
└── docs/              # Documentation
```

### Contributing

1. **Fork** the repository
2. **Create** a feature branch
3. **Make** your changes following our coding standards
4. **Run** quality checks: `bun run check-all`
5. **Submit** a pull request

### Quality Standards

- **Zero-tolerance TypeScript**: All code must pass strict type checking
- **Test Coverage**: 90%+ critical paths, 80%+ business logic
- **File-level Validation**: Every modified file must pass `bun run check:file`

## 🆘 Support

### Getting Help

```bash
# Built-in troubleshooting
brooklyn_troubleshooting issue=general

# Check server logs
bun run server:logs

# Get examples
brooklyn_examples task=all
```

### Communication Channels

- **Slack Integration**: Coming soon
- **Mattermost Integration**: Coming soon
- **GitHub Issues**: [Report issues](https://github.com/3leaps/fulmen-mcp-forge-brooklyn/issues)

## 📜 License

MIT License - see [LICENSE](LICENSE) for details.

## 🌉 About Brooklyn

Brooklyn is named after the Brooklyn Bridge - a testament to engineering excellence that connects communities while handling massive scale with grace and reliability. Our Brooklyn MCP server aspires to the same standard, bridging AI developers with powerful browser automation capabilities.

---

**Built with 💙 by the 3leaps Team**  
Part of the [Fulmen Ecosystem](https://github.com/3leaps/fulmen-ecosystem)
