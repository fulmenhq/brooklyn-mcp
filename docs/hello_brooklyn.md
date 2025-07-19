# 🌉 **Hello Brooklyn MCP Server!**

Hey there! You're about to set up Brooklyn - our enterprise-ready MCP server for AI-powered browser automation. This will connect your Claude Code environment to powerful browser automation capabilities.

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

### **Option A: Automated Bootstrap (Recommended)**

Run our interactive bootstrap script that handles everything:

```bash
# From the Brooklyn repository
bun run bootstrap

# Or run directly
bun scripts/bootstrap-brooklyn.ts
```

The bootstrap script will:

- ✅ Detect your OS and set appropriate paths
- ✅ Install or configure Brooklyn MCP server
- ✅ Configure Claude Code integration automatically
- ✅ Install global `brooklyn-server` command
- ✅ Test the server connection

**After bootstrap completes, skip to Step 4 below!**

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
bun run setup

# Start the server
bun run server:start
```

**If you DON'T have access to the Brooklyn repository:**

```bash
# Ask your team lead or Brooklyn administrator to start the server
# The server runs on port 50000 by default
# You'll need to know the server's location for Claude Code configuration
```

**Server Status Check:**

```bash
# Check if server is running (if you have repo access)
bun run server:status

# Or check if port 50000 is active
lsof -i :50000
```

You'll see something like:

```
Server started successfully with PID 12345
Brooklyn MCP Server running on port 50000
Logs are written to: /Users/you/.local/share/fulmen-brooklyn/logs/server.log
```

### **Step 3: Connect to Claude Code**

Add Brooklyn to your Claude Code configuration:

**File**: `~/.config/claude/claude_desktop_config.json` (macOS/Linux) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows)

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

**Important**: Replace `/absolute/path/to/fulmen-mcp-forge-brooklyn` with the actual path to your Brooklyn repository root!

### **Step 4: Test with Claude**

Restart Claude Code, then try:

```bash
brooklyn_status
```

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

# Clean up
Close the browser
```

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
