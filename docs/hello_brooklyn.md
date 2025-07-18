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

### **Step 1: Read the Welcome Guide**
Start here: **[docs/welcome.md](docs/welcome.md)**

This guide has everything you need - from installation to your first automation workflow.

### **Step 2: Install & Start Server**
```bash
# Install dependencies
bun install

# Set up browsers
bun run setup

# Start the server
bun run server:start
```

You'll see something like:
```
Server started successfully with PID 12345
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
```bash
# Check server status
bun run server:status

# View recent logs
bun run server:logs:recent

# Stop server
bun run server:stop

# Restart server
bun run server:restart
```

## 🌟 **Pro Tips**
1. **Always work from repo root** - Commands expect to be run from the main directory
2. **Use absolute paths** - When configuring Claude Code, use the full path to your repo
3. **Test connection first** - Always run `brooklyn_status` to verify everything works
4. **Clean up browsers** - Always close browsers when done to free resources

**Ready to bridge AI and browser automation? Let's go! 🚀**

---

*Built with 💙 by the 3leaps Team*  
*Part of the [Fulmen Ecosystem](https://github.com/3leaps/fulmen-ecosystem)*