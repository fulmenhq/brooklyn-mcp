# 🌉 **Hello Brooklyn MCP Server!**

Hey there! You're about to set up Brooklyn - our enterprise-ready MCP server for AI-powered browser automation. This will connect your Claude Code, opencode, Cline or other environment to powerful browser automation capabilities.

## 📁 **Start from Repository Root**

**Important**: Make sure you're in the Brooklyn repository root directory before running any commands. This is the directory that contains `package.json`, `README.md`, and the `docs/` folder.

```bash
# Navigate to your Brooklyn repository root
cd /path/to/brooklyn-mcp

# Verify you're in the right place
ls -la
# You should see: package.json, README.md, src/, docs/, etc.
```

## 🚀 **Quick Setup (5 minutes)**

### **Option A: Quick Setup with Claude MCP CLI (Recommended, HTTP-first)**

Use the modern Claude MCP CLI for seamless integration over HTTP (multi-agent ready):

```bash
# From the Brooklyn repository - build and install Brooklyn CLI
bun install
bun run build && bun run install

# Start Brooklyn HTTP server (auth required by default)
brooklyn web start --port 3000 --auth-mode required --daemon

# Add Brooklyn to Claude Code (user-wide, HTTP transport)
claude mcp add -s user -t http brooklyn http://127.0.0.1:3000

# Verify configuration
brooklyn_status          # In Claude Code - shows version + tools
brooklyn doctor --json   # In terminal - health check
```

This approach:

- ✅ HTTP-first; supports multiple agents sharing one server
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
cd /path/to/brooklyn-mcp

# Install dependencies (first time only)
bun install

# Set up browsers (first time only)
brooklyn setup

# Build and install Brooklyn CLI
bun run build && bun run install

# Start HTTP server (recommended for multi-agent)
brooklyn web start --port 3000 --auth-mode required --daemon

# Add to Claude Code (HTTP transport)
claude mcp add -s user -t http brooklyn http://127.0.0.1:3000
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
brooklyn mcp dev-http --port 8081 --host 127.0.0.1 --team-id local --auth-mode required
# Check status
brooklyn mcp dev-http-status --port 8081
# Health endpoint
curl -sS http://127.0.0.1:8081/health | jq .
# Stop/cleanup
brooklyn cleanup --http
```

SOP note: dev-http now defaults to background mode (AI-friendly). Use --foreground for debugging (blocks terminal). Use dev-http-status to verify. Use `--auth-mode localhost` only for loopback-only prototyping.

### **Step 3: Connect to Claude Code**

Add Brooklyn to your Claude Code configuration:

**File**: `~/.config/claude/claude_desktop_config.json` (macOS/Linux) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows)

Preferred (Claude MCP CLI already set this up):

```bash
claude mcp add -s user -t stdio brooklyn "brooklyn mcp start"
```

Manual fallback (when not using global CLI):

```json
{
  "mcpServers": {
    "brooklyn": {
      "command": "bun",
      "args": ["src/cli/brooklyn.ts", "mcp", "start"],
      "cwd": "/absolute/path/to/brooklyn-mcp"
    }
  }
}
```

**Important**: Replace `/absolute/path/to/brooklyn-mcp` with the actual path to your Brooklyn repository root!

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

## ⚡ Quick Start: Layout + Cascade

Use this lightning sequence when a UI looks “off” and you’re not sure why:

1. Visualize target and spacing

- `highlight_element_bounds(<selector>)`
- `measure_whitespace(<containerSelector>)`

2. Preview a CSS fix safely (no code edits)

- `simulate_css_change(<selector>, { position: "relative", top: "-16px" })`
- If unchanged, run `why_style_not_applied(<selector>, "top", "-16px")`

3. Inspect what actually applies

- `get_applicable_rules(<selector>)` to see which rules matter
- `get_effective_computed(<selector>, <property>)` to find the winning rule

4. Apply then revert once verified

- `apply_css_override(<selector>, { ... })` → validate → `revert_css_changes(overrideId)`

## 🧰 Tool Inventory (v1.6.4)

Brooklyn groups tools by category. Use `brooklyn_list_tools` to see everything and `brooklyn_tool_help <name>` for details and examples.

- browser-lifecycle: launch_browser, close_browser, list_active_browsers
- navigation: navigate_to_url, go_back, wait_for_url, wait_for_navigation, wait_for_network_idle
- interaction: click_element, fill_text, wait_for_element, get_text_content, validate_element_presence, find_elements, focus_element, hover_element, select_option, clear_element, drag_and_drop, generate_selector, scroll_into_view, scroll_to, scroll_by, highlight_element_bounds, show_layout_grid, remove_overlay
- styling: apply_css_override, revert_css_changes, simulate_css_change, why_style_not_applied, get_applicable_rules, get_effective_computed
- content-capture: take_screenshot, list_screenshots, get_screenshot, get_html, describe_html, get_attribute, get_bounding_box, is_visible, is_enabled, get_layout_tree, measure_whitespace, find_layout_containers, extract_css, get_computed_styles, diff_css, analyze_specificity
- javascript: execute_script, evaluate_expression, get_console_messages, add_script_tag
- rendering: render_pdf
- image-processing: compress_svg, analyze_svg, convert_svg_to_png, convert_svg_to_multi_png, list_processed_assets, get_processed_asset, purge_processed_assets
- documentation: brooklyn_docs
- discovery: brooklyn_list_tools, brooklyn_tool_help

Tips:

- Start with `brooklyn_list_tools` to discover available tools per category
- Use `brooklyn_tool_help <tool>` for parameters, examples, and common errors
- For layout debugging, use the "Quick Start: Layout + Cascade" workflow above for fastest results
- New CSS troubleshooting tools prevent trial-and-error: `simulate_css_change` shows what will happen before you apply changes

## 📦 Response Format (Unified Envelope)

All tools return a unified response envelope to make automation predictable and easier to parse:

```json
{
  "success": true,
  "data": { "...tool specific fields..." },
  "diagnostics": { "durationMs": 123 },
  "traceId": "brooklyn-1736123456-abc123xyz"
}
```

- Use `data` for the payload. The deprecated `result` field may still appear for backward compatibility during the v1.6.4 transition.
- `diagnostics.durationMs` helps with performance baselining and flaky checks.
- `traceId` lets you correlate logs and multi-step runs across tools.

Example: applying and reverting a CSS override

```json
{
  "success": true,
  "data": { "overrideId": "brooklyn-override-7g8k3z" },
  "diagnostics": { "durationMs": 42 },
  "traceId": "brooklyn-1736123456-abc123xyz"
}
```

If a tool fails, you’ll get:

```json
{
  "success": false,
  "data": null,
  "error": { "code": "ELEMENT_NOT_FOUND", "message": "...", "details": {} },
  "diagnostics": { "durationMs": 150 },
  "traceId": "brooklyn-..."
}
```

Tip: In Claude/Cursor/Codex, ask the assistant to parse `data` and ignore deprecated fields.

## 🧭 CSS Cascade Troubleshooter

New to CSS layout or battling precedence? Start here.

- Diagnose no-ops quickly:
  - Use `simulate_css_change(selector, cssRules)` to preview before/after values and avoid random changes
  - Use `why_style_not_applied(selector, property, desiredValue?)` to get reasons and actionable fixes

- Common pitfalls the tools reveal:
  - Offsets (`top/left/right/bottom`) need `position != static` (e.g., `position: relative`)
  - `z-index` matters only in positioned/flex/grid contexts; “static” won’t stack
  - `width/height` and vertical margins don’t affect inline non-replaced elements
  - Cascading specificity and source order might win over your rule — consider reducing specificity, not adding `!important`

- Example workflow:
  1. `highlight_element_bounds(".main-frame")` to visualize target
  2. `simulate_css_change(".main-frame", { position: "relative", top: "-16px" })`
  3. If unchanged, check `why_style_not_applied(".main-frame", "top", "-16px")`
  4. Apply a temporary fix with `apply_css_override` once verified
  5. Use `revert_css_changes` after capturing your notes

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
