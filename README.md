# Brooklyn - Fulmen MCP Browser Automation Platform ⚡

[![Developer Spark Enabled](https://img.shields.io/badge/Developer%20Spark-Enabled%20⚡-brightgreen?style=for-the-badge&logo=lightning&logoColor=white)](docs/fulmen/spark/README.md)
[![Brooklyn Forge](https://img.shields.io/badge/Brooklyn-Forge%20🌉-blue?style=for-the-badge&logo=bridge&logoColor=white)](docs/fulmen/forges/fulmen-brooklyn-forge-principles.md)
[![TypeScript Spark](https://img.shields.io/badge/TypeScript%20Spark-Enabled%20⚡-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](docs/fulmen/spark/README.md)
[![Architecture Approved](https://img.shields.io/badge/Architecture-Committee%20Approved%20🏆-gold?style=for-the-badge&logo=award&logoColor=white)](docs/fulmen/spark/README.md)

**Enterprise-ready MCP server for browser automation with multi-team support**

> **⚡ 15-minute onboarding**: Read [CLAUDE.md 5-minute section](CLAUDE.md#5-minute-team-onboarding-start-here-first) for instant productivity

🎯 **Latest**: v1.1.4 introduces **file-based screenshots** eliminating MCP token limitations and enabling enterprise-scale browser automation workflows.

Brooklyn is a Model Context Protocol (MCP) server that provides AI developers and teams with powerful browser automation capabilities. Built on the Fulmen ecosystem principles, Brooklyn serves as a bridge between AI models and web browsers, enabling seamless automation, testing, and monitoring workflows.

## 🚀 Quick Start

**New to Brooklyn?** Choose your path:

- **👤 Users**: **[docs/welcome.md](docs/welcome.md)** - Complete setup and first automation
- **👥 Team Members**: **[docs/ONBOARDING.md](docs/ONBOARDING.md)** - Architecture, development, and team context
- **⚡ 5-Minute Start**: **[CLAUDE.md 5-minute section](CLAUDE.md#5-minute-team-onboarding-start-here-first)** - Instant productivity

### Prerequisites

- **Bun** (>= 1.0.0) - [Install Bun](https://bun.sh)
- **Node.js** (>= 18.0.0) - For compatibility
- **Claude Code** - [Install Claude Code](https://claude.ai/code)

### Installation

#### Option A: Automated Bootstrap (Recommended)

Run our interactive bootstrap script that handles everything:

```bash
# Clone the repository
git clone https://github.com/3leaps/fulmen-mcp-forge-brooklyn.git
cd fulmen-mcp-forge-brooklyn

# Install dependencies
bun install

# Run the bootstrap script
bun run bootstrap

# The script will:
# ✅ Detect your OS and set appropriate paths
# ✅ Install or configure Brooklyn MCP server
# ✅ Configure Claude Code integration automatically
# ✅ Install global `brooklyn-server` command
# ✅ Test the server connection
```

#### Option B: Manual Installation

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

#### Bootstrap Script Commands

```bash
# Install Brooklyn (interactive)
bun run bootstrap

# Install Brooklyn (explicit)
bun run bootstrap:install

# Remove Brooklyn installation
bun run bootstrap:remove
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

# Take a screenshot (v1.1.4+ returns file paths, not base64)
screenshot browserId=browser_123 fullPage=true returnFormat=file

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

### Brooklyn CLI (Recommended)

Brooklyn includes a built-in CLI for easy server management from anywhere:

```bash
# Install Brooklyn CLI globally
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
```

**CLI Installation Options:**

- **Project-local**: `bun run install` (CLI manages this specific Brooklyn instance)
- **User-wide**: Use bootstrap script for system-wide installation
- **Deprovisioning**: `bun run bootstrap:remove` to uninstall completely

> **⚠️ Important**: `bun run install` always overwrites existing installations without version checking or `--force` option. See [Brooklyn CLI Documentation](docs/user-guide/brooklyn-cli.md#installation-behavior) for detailed behavior and version handling.

### Development Commands

```bash
# Start development server
bun run dev

# Direct server management (from repo)
bun run server:start
bun run server:stop
bun run server:status
bun run server:cleanup
bun run server:logs:recent
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

# Version management (ALWAYS use these scripts - never edit manually)
bun run version:get                    # Check current version
bun run version:set 1.2.3             # Set specific version
bun run version:bump:patch             # Bump patch version (1.1.6 → 1.1.7)
bun run version:bump:minor             # Bump minor version (1.1.6 → 1.2.0)
bun run version:bump:major             # Bump major version (1.1.6 → 2.0.0)
bun run check:versions                 # Verify version consistency
```

### Testing

```bash
# Run all tests
bun run test

# Unit tests only (fast - for pre-commit)
bun run test:unit

# Integration tests
bun run test:integration

# E2E tests
bun run test:e2e

# Coverage report
bun run test:coverage

# ⚠️ Note: test:watch is intentionally not provided
# Watch mode can leave orphaned processes and consume excessive memory
# Use targeted test runs instead
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
- **File-based Storage**: Screenshots stored with path validation and team isolation (v1.1.4+)

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
- **File Storage Metrics**: Screenshot storage analytics and audit trails (v1.1.4+)

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

⚠️ **CRITICAL**: Read [Logger Usage SOP](docs/development/LOGGER-USAGE-SOP.md) FIRST to avoid common bundling failures!

1. **Fork** the repository
2. **Create** a feature branch
3. **Make** your changes following our coding standards
4. **Run** quality checks: `bun run check-all`
5. **Submit** a pull request

### Quality Standards

- **Zero-tolerance TypeScript**: All code must pass strict type checking
- **Test Coverage**: 90%+ critical paths, 80%+ business logic
- **File-level Validation**: Every modified file must pass `bun run check:file`

## 📚 Documentation

### Complete Documentation

**For Users**:

- **[Welcome Guide](docs/welcome.md)** - Complete setup and first automation
- **[User Guide](docs/user-guide/index.md)** - Comprehensive browser automation guide
- **[Advanced Features](docs/user-guide/advanced-features.md)** - Complex automation scenarios
- **[Team Management](docs/user-guide/team-management.md)** - Multi-team configuration

**For Team Members**:

- **[Team Onboarding](docs/ONBOARDING.md)** - Architecture, development philosophy, and team context
- **[Development Guide](docs/development/index.md)** - Server management and troubleshooting
- **[5-Minute Onboarding](CLAUDE.md#5-minute-team-onboarding-start-here-first)** - Instant productivity

**For Maintainers**:

- **[Fulmen Spark Framework](docs/fulmen/spark/README.md)** - Strategic onboarding initiative
- **[Maintainer Guide](docs/fulmen/spark/maintainer-guide.md)** - Multi-language implementation

## 🆘 Support

### Getting Help

```bash
# Built-in troubleshooting
brooklyn_troubleshooting issue=general

# Check server logs (follows continuously)
bun run server:logs

# Check recent logs (last 20 lines)
bun run server:logs:recent

# Get examples
brooklyn_examples task=all
```

### Communication Channels

- **Documentation**: See [docs/](docs/) directory for comprehensive guides
- **GitHub Issues**: [Report issues](https://github.com/3leaps/fulmen-mcp-forge-brooklyn/issues)

## 📜 License

MIT License - see [LICENSE](LICENSE) for details.

## 🌉 About Brooklyn

Brooklyn is named after the Brooklyn Bridge - a testament to engineering excellence that connects communities while handling massive scale with grace and reliability. Our Brooklyn MCP server aspires to the same standard, bridging AI developers with powerful browser automation capabilities.

---

**Built with 🧡 by the 3 Leaps team**  
Part of the [Fulmen Ecosystem](https://github.com/fulmenhq/fulmen-ecosystem)

---

**Fulmen Ecosystem**

This project is part of the [Fulmen ecosystem](https://fulmen.dev), supported and maintained by [3 Leaps](https://3leaps.net).

Released under MIT License. See [LICENSE](LICENSE) for details.

For contributions, see [CONTRIBUTING.md](CONTRIBUTING.md).

## Trademark Notices

"3 Leaps®" is a registered trademark of 3 Leaps, LLC, a Florida LLC with offices in South Carolina. "Fulmen™" is a trademark of 3 Leaps, LLC, claimed through use in commerce, with plans for USPTO registration. "Fulmens" and "FulmenHQ" are trademarks of 3 Leaps, LLC.

While code and documentation are open under MIT, usage of these trademarks is reserved for official implementations to prevent confusion and benefit the ecosystem. Use of these marks in derivative works does not imply endorsement by 3 Leaps, LLC. For the benefit of the community, please rename your project folder and configurations to avoid using "3leaps", "fulmen", "fulmens", or "fulmenhq" in derivative works.

For questions regarding trademark usage, contact legal@3leaps.net.
