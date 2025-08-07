# 🌉 **Hello Brooklyn MCP Server!**

Hey there! You're about to set up Brooklyn - our enterprise-ready MCP server for AI-powered browser automation. This will connect your Claude Code, opencode, Cline or other environment to powerful browser automation capabilities.

## 📁 **Start from Repository Root**

**Important**: Make sure you're in the Brooklyn repository root directory before running any commands. This is the directory that contains `package.json`, `README.md`, and the `docs/` folder.

```bash
# Navigate to your Brooklyn repository root
cd /path/to/fulmen-mcp-forge-brooklyn

# Verify you're in the right place
ls -la
# You should see: package.json, README.md, src/, docs/, etc.
```

## 🚀 **Quick Setup (5 minutes)**

### **Option A: Quick Setup with Claude MCP CLI (Recommended)**

Use the modern Claude MCP CLI for seamless integration:

```bash
# From the Brooklyn repository - build and install Brooklyn CLI
bun install
bun run build && bun run install

# Add Brooklyn to Claude Code (user-wide)
claude mcp add -s user brooklyn "brooklyn mcp start"

# Verify configuration
claude mcp list
brooklyn version  # Should show current version
```

This approach:

- ✅ Uses the official Claude MCP CLI (no manual JSON editing)
- ✅ Works across all your projects automatically
- ✅ Leverages Brooklyn's silent logger for reliable MCP connections
- ✅ Supports the revolutionary development mode for rapid iteration

**After setup completes, skip to Step 4 below!**

### **Option B: Manual Setup**

### **Step 1: Read the Welcome Guide**

Start here: **[docs/welcome.md](docs/welcome.md)**

This guide has everything you need - from installation to your first automation workflow.

### **Step 2: Get Server Started**

**🚨 IMPORTANT**: Brooklyn server needs to be running before you can connect!

**If you have access to the Brooklyn repository:**

```bash
# Navigate to Brooklyn repo
cd /path/to/fulmen-mcp-forge-brooklyn

# Install dependencies (first time only)
bun install

# Set up browsers (first time only)
brooklyn setup

# Build and install Brooklyn CLI
bun run build && bun run install

# Add to Claude Code (recommended)
claude mcp add -s user brooklyn "brooklyn mcp start"
```

**If you DON'T have access to the Brooklyn repository:**

```bash
# Ask your team lead or Brooklyn administrator to start the server
# The server runs on port 50000 by default
# You'll need to know the server's location for Claude Code configuration
```

**Local Dev HTTP (optional)**

```bash
# Start a local HTTP server (defaults to background)
brooklyn mcp dev-http --port 8081 --host 127.0.0.1 --team-id local
# Check status
brooklyn mcp dev-http-status --port 8081
# Health endpoint
curl -sS http://127.0.0.1:8081/health | jq .
# Stop/cleanup
brooklyn cleanup --http
```

SOP note: dev-http now defaults to background mode (AI-friendly). Use --foreground for debugging (blocks terminal). Use dev-http-status to verify.

### **Step 3: Connect to Claude Code**

Add Brooklyn to your Claude Code configuration:

**File**: `~/.config/claude/claude_desktop_config.json` (macOS/Linux) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows)

Preferred (Claude MCP CLI already set this up):

```bash
claude mcp add -s user brooklyn "brooklyn mcp start"
```

Manual fallback (when not using global CLI):

```json
{
  "mcpServers": {
    "brooklyn": {
      "command": "bun",
      "args": ["src/cli/brooklyn.ts", "mcp", "start"],
      "cwd": "/absolute/path/to/fulmen-mcp-forge-brooklyn"
    }
  }
}
```

**Important**: Replace `/absolute/path/to/fulmen-mcp-forge-brooklyn` with the actual path to your Brooklyn repository root!

### **Step 4: Test with Claude**

Restart Claude Code, then try:

Ask Claude to run an MCP status against Brooklyn (e.g. “Check Brooklyn status”).

You should see Brooklyn's status and capabilities!

## 🎯 **Your First Automation**

Try this in Claude Code:

```bash
# Launch a browser
Launch a chromium browser for team 'your-team-name'

# Navigate to a website
Navigate to https://example.com

# Take a screenshot
Take a full-page screenshot

# List your screenshots
List all screenshots for my team

# Find specific screenshots
List screenshots from today tagged 'example'

# Clean up
Close the browser
```

## 📊 **Screenshot Inventory**

Brooklyn now includes a powerful screenshot inventory system with database storage:

```bash
# List all your screenshots
List all screenshots for my team

# Filter by date range
List screenshots from the last 7 days

# Find by tag or session
List screenshots tagged 'testing' from today

# Advanced filtering
List screenshots from session 'browser-123' in PNG format

# Get statistics
Show screenshot statistics for my team
```

**Screenshot Database Features:**

- 🗄️ **Centralized Storage**: All screenshots stored in database with fast querying
- 🔍 **Rich Filtering**: Filter by team, tag, date, format, session, and more
- 📈 **Performance**: <100ms query times with intelligent caching
- 🛡️ **Security**: Team isolation ensures you only see your screenshots
- 📊 **Analytics**: Built-in statistics and usage tracking

## 🆘 **Need Help?**

- **Server issues**: `bun run server:logs:recent`
- **Built-in help**: `brooklyn_troubleshooting issue=general`
- **Examples**: `brooklyn_examples task=basic_navigation`

## 📚 **More Resources**

- **[Complete User Guide](user-guide/index.md)** - Everything about browser automation
- **[Team Management](user-guide/team-management.md)** - Multi-team setup
- **[Development Guide](development/index.md)** - Server management
- **[Welcome Guide](welcome.md)** - Comprehensive onboarding

## 🔧 **Server Management**

### Using Brooklyn CLI (Recommended)

After running the bootstrap script, you can manage Brooklyn from anywhere:

```bash
# Global CLI commands (work from any directory)
brooklyn-server start       # Start the server
brooklyn-server stop        # Stop the server
brooklyn-server restart     # Restart the server
brooklyn-server status      # Check server status
brooklyn-server logs        # View server logs
brooklyn-server logs --recent  # View recent logs only
brooklyn-server cleanup     # Clean up resources
brooklyn-server info        # Show Brooklyn installation info

# Get help for any command
brooklyn-server --help
brooklyn-server logs --help
```

### Direct Repository Commands

If you're working from the Brooklyn repository:

```bash
# Check server status
bun run server:status

# View recent logs
bun run server:logs:recent

# Stop server
bun run server:stop

# Restart server
bun run server:restart

# Install CLI locally (for this project only)
bun run install
```

## 🌟 **Pro Tips**

1. **Always work from repo root** - Commands expect to be run from the main directory
2. **Use absolute paths** - When configuring Claude Code, use the full path to your repo
3. **Test connection first** - Always run `brooklyn_status` to verify everything works
4. **Clean up browsers** - Always close browsers when done to free resources

**Ready to bridge AI and browser automation? Let's go! 🚀**

---

_Built with 💙 by the 3leaps Team_  
_Part of the [Fulmen Ecosystem](https://github.com/3leaps/fulmen-ecosystem)_
