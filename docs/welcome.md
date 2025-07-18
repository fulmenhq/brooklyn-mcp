# Welcome to Brooklyn MCP Server! 🌉

**Your Enterprise-Ready Gateway to AI-Powered Browser Automation**

Brooklyn is a Model Context Protocol (MCP) server that bridges the gap between AI models and web browsers, enabling seamless automation, testing, and monitoring workflows. Named after the Brooklyn Bridge - a testament to engineering excellence - Brooklyn connects AI developers with powerful browser automation capabilities.

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
git clone https://github.com/3leaps/fulmen-mcp-forge-brooklyn.git
cd fulmen-mcp-forge-brooklyn

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
      "args": ["run", "start"],
      "cwd": "/absolute/path/to/fulmen-mcp-forge-brooklyn"
    }
  }
}
```

**Important:** Replace `/absolute/path/to/fulmen-mcp-forge-brooklyn` with the actual path to your Brooklyn installation.

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
- **`screenshot`** - Capture full-page or viewport screenshots
- **`close_browser`** - Clean up browser resources

### Self-Service Onboarding
- **`brooklyn_status`** - Server health and resource usage
- **`brooklyn_capabilities`** - Complete tool inventory
- **`brooklyn_getting_started`** - Personalized setup guide
- **`brooklyn_examples`** - Code examples and workflows
- **`brooklyn_team_setup`** - Team configuration assistant
- **`brooklyn_troubleshooting`** - Diagnostic and problem-solving

## 🎨 Common Use Cases

### For AI Developers
- **Smart Web Scraping** - Let Claude navigate and extract data
- **Dynamic Testing** - Generate tests based on UI changes
- **Content Generation** - Screenshot websites for documentation

### For UX Teams
- **Responsive Design Testing** - Test across multiple viewport sizes
- **Visual Regression** - Compare designs before/after changes
- **Performance Monitoring** - Track page load times

### For QA Teams
- **Cross-Browser Testing** - Test in Chromium, Firefox, and WebKit
- **Automated Regression** - Run test suites across browsers
- **CI/CD Integration** - Automated testing in pipelines

### For Monitoring Teams
- **Website Health Checks** - Monitor uptime and performance
- **Error Detection** - Capture screenshots of errors
- **Performance Benchmarking** - Track metrics over time

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
```bash
# Start server
bun run server:start

# Check server status
bun run server:status

# View recent logs
bun run server:logs:recent

# View logs (continuous)
bun run server:logs

# Stop server
bun run server:stop
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

## 🎉 Welcome to the Brooklyn Community!

Brooklyn is designed to make browser automation accessible, reliable, and powerful. Whether you're testing user interfaces, monitoring websites, or building AI-powered web interactions, Brooklyn provides the foundation you need.

**Key Features:**
- ✅ **Multi-browser support** - Chromium, Firefox, WebKit
- ✅ **AI-friendly** - Seamless Claude integration
- ✅ **Team-oriented** - Multi-team isolation and management
- ✅ **Enterprise-ready** - Production-grade logging and monitoring
- ✅ **Self-service** - Comprehensive onboarding and help tools

## 🚀 Ready to Start?

1. **Complete the installation** above
2. **Connect to Claude Code** with the MCP configuration
3. **Run your first command:** `brooklyn_status`
4. **Explore with examples:** `brooklyn_examples task=basic_navigation`
5. **Set up your team:** `brooklyn_team_setup team_id=your-team-name`

**Welcome to Brooklyn - where AI meets browser automation! 🌉**

---

*Built with 💙 by the 3leaps Team*  
*Part of the [Fulmen Ecosystem](https://github.com/3leaps/fulmen-ecosystem)*

### Quick Links
- [Complete User Guide](user-guide/index.md)
- [Advanced Features](user-guide/advanced-features.md)
- [Team Management](user-guide/team-management.md)
- [Development Guide](development/index.md)
- [GitHub Repository](https://github.com/3leaps/fulmen-mcp-forge-brooklyn)