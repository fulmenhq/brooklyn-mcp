# Welcome to Brooklyn MCP Server! 🌉

**Your Enterprise-Ready Gateway to AI-Powered Browser Automation**

Brooklyn is a Model Context Protocol (MCP) server that bridges the gap between AI models and web browsers, enabling seamless automation, testing, and monitoring workflows. Named after the Brooklyn Bridge - a testament to engineering excellence - Brooklyn connects AI developers with powerful browser automation capabilities.

> **👥 Team Members**: Looking for comprehensive onboarding? See **[Team Onboarding Guide](ONBOARDING.md)** for architecture decisions, development philosophy, and team context.

[![Brooklyn MCP](https://img.shields.io/badge/Brooklyn-MCP%20🌉-blue?style=for-the-badge&logo=bridge&logoColor=white)](fulmen/forges/fulmen-brooklyn-forge-principles.md)

## 🚀 Quick Start

### Prerequisites

Before getting started, ensure you have:

- **Bun** (>= 1.0.0) - [Install Bun](https://bun.sh)
- **Node.js** (>= 18.0.0) - For compatibility
- **Claude Code** - [Install Claude Code](https://claude.ai/code)
- **2GB+ RAM** - For browser automation

### Installation

```bash
# Clone the repository
git clone https://github.com/fulmenhq/brooklyn-mcp.git
cd brooklyn-mcp

# Install dependencies
bun install

# Set up Playwright browsers
bun run setup

# Start the server
bun run server:start
```

### Connect to Claude Code

This is the critical step to connect Brooklyn to your Claude Code environment:

**Step 1:** Locate your Claude Code configuration file:

- **macOS/Linux:** `~/.config/claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

**Step 2:** Add Brooklyn to your configuration:

```json
{
  "mcpServers": {
    "brooklyn": {
      "command": "bun",
      "args": ["src/cli/brooklyn.ts", "mcp", "start"],
      "cwd": "/absolute/path/to/brooklyn"
    }
  }
}
```

**Important:** Replace `/absolute/path/to/brooklyn-mcp` with the actual path to your Brooklyn installation.

**Step 3:** Restart Claude Code to load the new configuration.

### Verify Your Setup

Test that Brooklyn is working by trying these commands in Claude Code:

```bash
# Check Brooklyn status
brooklyn_status

# Get your personalized getting started guide
brooklyn_getting_started use_case=ai_development team_id=your-team-name

# See all available capabilities
brooklyn_capabilities

# Get practical examples
brooklyn_examples task=basic_navigation format=claude_commands
```

## 🎯 Your First Automation

Once connected, try this simple workflow:

```bash
# Launch a browser
Launch a chromium browser for team 'your-team-name'

# Navigate to a website
Navigate to https://example.com

# Take a screenshot
Take a full-page screenshot

# Clean up
Close the browser
```

## 🏢 Team-Specific Setup

Brooklyn supports multiple teams with isolated configurations. Set up your team:

```bash
# Configure your team
brooklyn_team_setup team_id=your-team-name use_cases=["e2e_testing","ux_development"] domains=["*.yourcompany.com","localhost:*"]

# Get team-specific getting started guide
brooklyn_getting_started use_case=ai_development team_id=your-team-name
```

## 🛠️ Available Tools

### Core Browser Automation

- **`launch_browser`** - Launch new browser instance (Chromium, Firefox, WebKit)
- **`navigate`** - Navigate to any URL with custom wait conditions
- **`take_screenshot`** - Capture full-page or viewport screenshots with rich metadata
- **`list_screenshots`** - Query screenshot inventory with advanced filtering
- **`close_browser`** - Clean up browser resources

### Screenshot Inventory System

- **`list_screenshots`** - Browse and filter your screenshot database
  - Filter by team, tag, date range, format, session
  - Sort by creation date, file size, or filename
  - Pagination support for large result sets
  - Team isolation ensures security boundaries

### Self-Service Onboarding

- **`brooklyn_status`** - Server health and resource usage
- **`brooklyn_capabilities`** - Complete tool inventory
- **`brooklyn_getting_started`** - Personalized setup guide
- **`brooklyn_examples`** - Code examples and workflows
- **`brooklyn_team_setup`** - Team configuration assistant
- **`brooklyn_troubleshooting`** - Diagnostic and problem-solving

## 🔌 Choosing MCP Transport: stdio vs http

Pick the transport that best fits your workstation and workflow:

- stdio (recommended for most local dev)
  - Per-editor lifecycle: your IDE starts/stops Brooklyn automatically
  - No ports to manage; fewer security considerations
  - Easiest onboarding for single-machine, smaller workflows

- http (recommended for many-project or shared workflows)
  - One central server for multiple editors/tools on the same machine
  - Stable endpoint (e.g., http://127.0.0.1:3000), great for background/daemon usage
  - Better for remote or team-aligned setups

Rule of thumb:

- Many projects/resources on a dev machine → prefer http (user-wide), run `brooklyn web start --daemon` and configure clients with `brooklyn config agent --transport http`.
- Smaller/single-project workflows → prefer stdio (user-wide or project-wide) via `brooklyn config agent --transport stdio`.
- Remote servers are inherently http.

See the Assisted Configuration section in the User Guide for step-by-step commands.

## 🎨 Common Use Cases

### **Analyst Teams (NEW v0.3.3)**

> **Persona**: AI Analyst extracting dashboard insights for planning/reports.

- Auth-gated access: Stripe MRR tables, Mixpanel cohorts
- Table extraction: HTML → JSON/CSV
- Pagination: Multi-page data collection
- Example: `extract_table_data` on `.metrics-table` → churn analysis playbook

**Benefits**: Structured data without scrapers/APIs. From screenshot to spreadsheet-ready.

### For AI Developers

- **Smart Web Scraping** - Let Claude navigate and extract data
- **Dynamic Testing** - Generate tests based on UI changes
- **Content Generation** - Screenshot websites for documentation
- **Screenshot Management** - Query and organize screenshot collections
- **Visual Documentation** - Build libraries of UI states and changes

### For UX Teams

- **Responsive Design Testing** - Test across multiple viewport sizes
- **Visual Regression** - Compare designs before/after changes
- **Performance Monitoring** - Track page load times
- **Design History** - Maintain visual changelog with tagged screenshots
- **Component Libraries** - Build screenshot inventories of UI components

### For QA Teams

- **Cross-Browser Testing** - Test in Chromium, Firefox, and WebKit
- **Automated Regression** - Run test suites across browsers
- **CI/CD Integration** - Automated testing in pipelines
- **Test Evidence** - Maintain screenshot libraries for test results
- **Failure Analysis** - Query screenshots by test session and failure patterns

### For Monitoring Teams

- **Website Health Checks** - Monitor uptime and performance
- **Error Detection** - Capture screenshots of errors
- **Performance Benchmarking** - Track metrics over time
- **Incident Documentation** - Query screenshots by date for incident analysis
- **Trend Analysis** - Track visual changes and performance over time

## 📊 Screenshot Inventory System (New as of v1.4.11)

Brooklyn includes a comprehensive screenshot database that stores all your screenshots with rich metadata and provides powerful querying capabilities:

### Core Features

- **🗄️ Database Storage**: All screenshots automatically stored with metadata
- **🔍 Rich Filtering**: Query by team, tag, date, format, session, and more
- **📈 High Performance**: <100ms query times with intelligent caching
- **🛡️ Security First**: Team isolation prevents cross-team data access
- **📊 Analytics**: Built-in statistics and usage tracking

### Example Queries

```bash
# List all screenshots for your team
List all screenshots for my team

# Filter by date range
List screenshots from the last 7 days

# Find by tags
List screenshots tagged 'homepage' from yesterday

# Session-specific searches
List all screenshots from session 'test-run-123'

# Format and size filtering
List all PNG screenshots larger than 1MB

# Complex queries
List screenshots tagged 'error' from the last 24 hours in PNG format
```

### Database Schema

Each screenshot includes:

- **Metadata**: Team, user, session, timestamp
- **File Info**: Path, size, format, dimensions, hash
- **Context**: Tags, browser type, page URL
- **Performance**: Creation time, access patterns

## 📚 Learn More

### Essential Documentation

- **[User Guide](user-guide/index.md)** - Complete browser automation guide
- **[Advanced Features](user-guide/advanced-features.md)** - Complex automation patterns
- **[Team Management](user-guide/team-management.md)** - Multi-team configuration

### Development Resources

- **[Development Guide](development/index.md)** - Server management and troubleshooting
- **[API Reference](../README.md#available-commands)** - Complete command reference

## 🆘 Need Help?

### Built-in Help System

```bash
# Get help with common issues
brooklyn_troubleshooting issue=general

# See practical examples
brooklyn_examples task=all

# Check server status
brooklyn_status detail=full
```

### Server Management

#### Brooklyn CLI (Global Management)

Brooklyn includes a powerful CLI for server management from anywhere:

```bash
# Install CLI (project-local)
bun run install

# Global server management
brooklyn status              # Check server status
brooklyn version             # Show version information
brooklyn cleanup            # Clean up resources
brooklyn --help             # Comprehensive help

# MCP server management
brooklyn mcp start           # Start MCP server
brooklyn mcp dev-http        # Start HTTP server (background mode)
brooklyn mcp dev-http-status # Check HTTP server status
brooklyn mcp dev-http-stop   # Stop HTTP server
```

**Installation Options:**

- **Project-local**: `bun run install` - CLI manages this specific Brooklyn instance
- **User-wide**: Use bootstrap script for system-wide installation
- **Deprovisioning**: `bun run bootstrap:remove` to uninstall completely

#### Direct Repository Commands

From the Brooklyn repository directory:

```bash
# Development mode
bun run dev

# Build and install Brooklyn CLI
bun run build && bun run install

# Quality checks
bun run check-all           # Format + typecheck + lint + test

# Server management
bun run server:start        # Start development server
bun run server:status       # Check server status
bun run server:stop         # Stop development server
```

### Common Issues & Solutions

**Problem:** Brooklyn won't connect to Claude Code

- **Solution:** Check server is running with `bun run server:status`
- **Solution:** Verify Claude configuration file path is correct
- **Solution:** Test with `brooklyn_status` command

**Problem:** Browser won't launch

- **Solution:** Install browsers with `bun run setup`
- **Solution:** Check resource usage with `brooklyn_status detail=full`
- **Solution:** Verify sufficient system resources (2GB+ RAM)

**Problem:** Navigation fails

- **Solution:** Check URL format and accessibility
- **Solution:** Verify domain allowlist configuration
- **Solution:** Test with longer timeout settings

## 🌟 Pro Tips

1. **Start Small** - Begin with basic navigation and screenshots
2. **Use Team IDs** - Always specify your team for proper resource isolation
3. **Monitor Resources** - Check `brooklyn_status` to monitor browser pool usage
4. **Clean Up** - Always close browsers when done to free resources
5. **Leverage Examples** - Use `brooklyn_examples` for quick workflow templates

## 🔐 Security & Best Practices

- **Domain Allowlisting** - Configure allowed domains for your team
- **Resource Limits** - Respect browser pool limits (10 concurrent browsers)
- **Proper Cleanup** - Always close browsers when finished
- **Team Isolation** - Use team IDs for proper resource separation

## 🚨 Disaster Recovery Guide

**After Disk Failure, Machine Migration, or Fresh Checkout**

If you've recovered Brooklyn onto a new machine or after a disk failure, follow this comprehensive recovery process to ensure everything works correctly.

### Phase 1: Environment Setup

```bash
# 1. Verify your environment
node --version    # Should be >= 18.0.0
bun --version     # Should be >= 1.0.0

# 2. Navigate to your Brooklyn directory
cd /path/to/brooklyn

# 3. Clean any potential artifacts from previous installations
bun run clean:all

# 4. Fresh dependency installation
bun install
```

### Phase 2: Browser & Asset Recovery

```bash
# 1. Re-download Playwright browsers (essential for automation)
bun run setup:browsers

# 2. Download required assets (PDF.js, etc.)
bun run setup:assets

# 3. Verify browser installation
bunx playwright install --dry-run
```

### Phase 3: Build & Quality Validation

```bash
# 1. Run comprehensive quality checks
bun run check-all

# 2. Build the project
bun run build

# 3. Install Brooklyn CLI locally
bun run install
```

### Phase 4: Configuration Recovery

```bash
# 1. Verify Claude Code configuration exists
# macOS/Linux: ~/.config/claude/claude_desktop_config.json
# Windows: %APPDATA%\Claude\claude_desktop_config.json

# 2. Ensure Brooklyn is configured in Claude Code:
cat ~/.config/claude/claude_desktop_config.json
```

**Expected Claude Configuration:**

```json
{
  "mcpServers": {
    "brooklyn": {
      "command": "bun",
      "args": ["src/cli/brooklyn.ts", "mcp", "start"],
      "cwd": "/absolute/path/to/brooklyn"
    }
  }
}
```

### Phase 5: Functional Testing

```bash
# 1. Test HTTP server startup (recommended validation)
brooklyn http start --port 3000 --daemon

# 2. Verify server is running
curl http://localhost:3000/health || brooklyn http status

# 3. Test MCP server connection
brooklyn mcp start &
sleep 3
brooklyn_status

# 4. Test browser automation
# In Claude Code: "Launch a chromium browser for team 'test-team'"
# In Claude Code: "Navigate to https://example.com"
# In Claude Code: "Take a screenshot"
# In Claude Code: "Close the browser"

# 5. Stop test servers
brooklyn http stop
pkill -f "brooklyn.*mcp.*start"
```

### Phase 6: Fixture & Asset Verification

```bash
# 1. Check test fixtures exist
ls -la fixtures/
ls -la fixtures/test-*.svg
ls -la fixtures/assets/

# 2. Verify asset manifests
ls -la configs/brooklyn-assets-manifest.yaml
ls -la schemas/brooklyn-assets-v1.yaml

# 3. Check example files
ls -la examples/
```

### Phase 7: Database & Storage Setup

```bash
# 1. Initialize database (if using SQLite)
# Database will auto-initialize on first MCP server start

# 2. Verify screenshot storage directory exists
ls -la screenshots/ 2>/dev/null || echo "Screenshots directory will be created on first use"
```

### Recovery Checklist ✅

- [ ] **Environment**: Node.js ≥18, Bun ≥1.0 installed
- [ ] **Dependencies**: `bun install` completed successfully
- [ ] **Browsers**: `bun run setup:browsers` completed
- [ ] **Assets**: `bun run setup:assets` completed
- [ ] **Quality Gates**: `bun run check-all` passes
- [ ] **Build**: `bun run build` succeeds
- [ ] **CLI**: `bun run install` completed
- [ ] **Claude Config**: MCP server configured in Claude Code
- [ ] **HTTP Test**: `brooklyn http start --port 3000 --daemon` works
- [ ] **MCP Test**: `brooklyn_status` responds in Claude Code
- [ ] **Browser Test**: Can launch browser and navigate
- [ ] **Fixtures**: Test fixtures and assets present
- [ ] **Database**: Screenshot database initializes correctly

### Common Recovery Issues

**Problem:** `bun run setup:browsers` fails

```
# Solution: Check internet connection and disk space
# Alternative: bunx playwright install chromium firefox webkit
```

**Problem:** Quality checks fail after recovery

```
# Solution: Run individual checks to identify issues
bun run typecheck
bun run lint
bun run test
```

**Problem:** Claude Code can't connect to MCP server

```
# Solution: Verify absolute path in claude_desktop_config.json
# Restart Claude Code application completely
```

**Problem:** Browser automation fails

```
# Solution: Re-run browser setup
bun run setup:browsers
# Check system resources (need 2GB+ RAM)
```

**Problem:** Missing fixtures or assets

```
# Solution: Re-run asset setup
bun run setup:assets
# Check fixtures directory structure
```

### Emergency Recovery (If All Else Fails)

```bash
# Nuclear option - complete rebuild
cd /path/to/brooklyn
rm -rf node_modules bun.lockb dist coverage .cache
git clean -fdx  # ⚠️ WARNING: Removes untracked files
bun install
bun run setup:browsers
bun run setup:assets
bun run build
bun run install
```

### Post-Recovery Validation

After completing recovery, run this comprehensive test:

```bash
# Full system validation
brooklyn http start --port 3000 --daemon
sleep 2

# Test all major components
curl -s http://localhost:3000/health | jq .status
brooklyn_status
brooklyn_capabilities

# Stop servers
brooklyn http stop
```

**🎉 Recovery Complete!** Your Brooklyn MCP server is now fully operational on the new machine.

## 🎉 Welcome to the Brooklyn Community!

Brooklyn is designed to make browser automation accessible, reliable, and powerful. Whether you're testing user interfaces, monitoring websites, or building AI-powered web interactions, Brooklyn provides the foundation you need.

**Key Features:**

- ✅ **Multi-browser support** - Chromium, Firefox, WebKit
- ✅ **AI-friendly** - Seamless Claude integration
- ✅ **Team-oriented** - Multi-team isolation and management
- ✅ **Enterprise-ready** - Production-grade logging and monitoring
- ✅ **Self-service** - Comprehensive onboarding and help tools
- ✅ **Screenshot Database** - Advanced inventory with rich querying and analytics

## 🚀 Ready to Start?

1. **Complete the installation** above
2. **Connect to Claude Code** with the MCP configuration
3. **Run your first command:** `brooklyn_status`
4. **Explore with examples:** `brooklyn_examples task=basic_navigation`
5. **Set up your team:** `brooklyn_team_setup team_id=your-team-name`

**Welcome to Brooklyn - where AI meets browser automation! 🌉**

## 📚 Documentation Navigation

### For Users (Getting Started)

- **[This Guide](welcome.md)** - Complete user onboarding and setup
- **[User Guide](user-guide/index.md)** - Comprehensive browser automation guide
- **[Advanced Features](user-guide/advanced-features.md)** - Complex automation patterns
- **[Team Management](user-guide/team-management.md)** - Multi-team configuration

### For Team Members (Development)

- **[Team Onboarding](ONBOARDING.md)** - Architecture, philosophy, and team context
- **[Development Guide](development/index.md)** - Server management and troubleshooting
- **[5-Minute Onboarding](../CLAUDE.md#5-minute-team-onboarding-start-here-first)** - Instant productivity guide

---

_Built with 💙 by the 3leaps Team_  
_Part of the [Fulmen Ecosystem](https://github.com/3leaps/fulmen-ecosystem)_

### Quick Links

- [Complete User Guide](user-guide/index.md)
- [Advanced Features](user-guide/advanced-features.md)
- [Team Management](user-guide/team-management.md)
- [Development Guide](development/index.md)
- [GitHub Repository](https://github.com/fulmenhq/brooklyn-mcp)
