# Brooklyn Development Mode Usage

This guide covers both **Source Execution Mode** (`--development-only`) for rapid AI development and **Development Server Mode** (`dev-start`) for advanced protocol testing.

## 🚀 Source Execution Mode (Primary for AI Developers)

### Quick Start

**Most AI developers should start here** - this mode lets you execute Brooklyn directly from source code, bypassing bundling issues and enabling instant iteration.

```bash
# Direct source execution (bypasses all bundling constraints)
bun src/cli/brooklyn.ts mcp start --development-only

# Claude Code integration (recommended workflow)
claude mcp add -s project brooklyn-dev -- bun src/cli/brooklyn.ts mcp start --development-only
```

### Why Use Source Execution Mode?

✅ **Bundling Issues Solved** - Bypasses native dependency problems (browser-based rendering for images)  
✅ **Instant Iteration** - Changes reflected immediately without rebuilds  
✅ **Full npm Ecosystem** - Access to all packages without bundling constraints  
✅ **Claude Code Native** - Works perfectly with `/mcp` command  
✅ **Zero Build Time** - TypeScript executed directly via Bun

### Complete AI Development Workflow

```bash
# 1. Remove any existing Brooklyn setup
claude mcp remove brooklyn

# 2. Add Brooklyn in source execution mode
claude mcp add -s project brooklyn-dev -- bun src/cli/brooklyn.ts mcp start --development-only

# 3. Verify it's working
/mcp  # In Claude Code - should connect successfully

# 4. Now you can edit source and test immediately:
#    - Edit src/core/tool-definitions.ts to add new tools
#    - Edit src/core/brooklyn-engine.ts to modify behavior
#    - Edit src/adapters/playwright-adapter.ts for browser changes

# 5. Test changes instantly
/mcp  # Reconnects with your latest source changes!

# 6. No build step, no restart - just edit and test
```

### Source Execution Features

**Authentication**: Uses "none" mode (development only) - no authentication required  
**Transport**: Standard stdio - fully compatible with Claude Code  
**Dependencies**: All npm packages available - no bundling limitations  
**Iteration Speed**: Instant - changes reflected on next `/mcp` command

### When Source Execution Mode is Perfect

- 🔧 **Adding new MCP tools** - Immediate testing without build cycles
- 🐛 **Debugging bundling issues** - Bypass all native dependency problems
- ⚡ **Rapid prototyping** - Fastest possible iteration cycle
- 🤖 **AI agent development** - Perfect for Claude Code workflows
- 📦 **Testing npm packages** - Full ecosystem access without constraints

---

## 🔧 Development Server Mode (Advanced Protocol Testing)

### When You Need Development Server Mode

Use this mode when you need to:

- **Test MCP protocol compliance** with direct JSON-RPC messages
- **Debug transport layer issues** - socket vs pipe communication
- **Validate tools before Claude Code integration** - protocol testing
- **Run persistent server** for advanced debugging scenarios

### Core Commands

```bash
# Check status (ALWAYS first!)
brooklyn mcp dev-status

# Start dev mode with socket transport (RECOMMENDED)
brooklyn mcp dev-start --transport socket

# Start dev mode with named pipes (experimental - Node.js limitations)
brooklyn mcp dev-start --transport pipe --experimental

# Stop dev mode
brooklyn mcp dev-stop

# Clean up resources
brooklyn mcp dev-cleanup

# Restart (stop + start)
brooklyn mcp dev-restart
```

### Socket Transport (Recommended for dev-start)

**Why Socket Transport?**

- ✅ No hanging/blocking issues
- ✅ Bidirectional communication
- ✅ Works with standard tools (`nc`, `socat`)
- ✅ Reliable for protocol testing

```bash
# 1. Start development server
brooklyn mcp dev-start --transport socket

# 2. Get socket path
SOCKET_PATH=$(brooklyn mcp dev-status | grep Socket | awk '{print $NF}')
echo "Using socket: $SOCKET_PATH"

# 3. Initialize MCP session
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{"roots":{}},"clientInfo":{"name":"test","version":"1.0"}}}' | nc -U $SOCKET_PATH

# 4. List available tools
echo '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' | nc -U $SOCKET_PATH

# 5. Call a tool (launch browser)
echo '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"launch_browser","arguments":{"browserType":"chromium","headless":true}}}' | nc -U $SOCKET_PATH

# 6. Interactive mode
nc -U $SOCKET_PATH
# Now type JSON-RPC messages directly
```

### Pipe Transport (Experimental - Go Roadmap)

**Current Status**: Node.js has fundamental limitations with FIFO operations  
**Future**: Go implementation will fully support pipe transport  
**Current Recommendation**: Use socket transport for reliability

```bash
# Only use with --experimental flag (acknowledges Node.js limitations)
brooklyn mcp dev-start --transport pipe --experimental

# Must set up reader BEFORE writing (prevents hanging)
cat /tmp/brooklyn-mcp-dev-*-out &

# Then send messages
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' > /tmp/brooklyn-mcp-dev-*-in
```

### Development Server Features

**Transport Options**:

- Socket: `/tmp/brooklyn-mcp-dev-{uuid}-{timestamp}.sock` (recommended)
- Pipes: `/tmp/brooklyn-mcp-dev-{uuid}-{timestamp}-{in|out}` (experimental)

**Process Management**:

- Background daemon mode
- PID tracking and cleanup
- Log redirection to `~/.brooklyn/dev/logs/`
- Proper resource cleanup on shutdown

**Protocol Compliance**:

- 100% identical to production Brooklyn MCP protocol
- Same JSON-RPC message format
- Same tool definitions and capabilities
- Same error handling

---

## 🎯 Choosing the Right Mode

### Decision Tree for AI Developers

```
Are you developing the MCP server itself?
├─ YES → Use Source Execution Mode (--development-only)
│   ├─ Need to add new tools? → Source Execution Mode
│   ├─ Fixing bundling issues? → Source Execution Mode
│   ├─ Rapid prototyping? → Source Execution Mode
│   └─ Working with Claude Code? → Source Execution Mode
│
└─ NO → Do you need to test MCP protocol compliance?
    ├─ YES → Use Development Server Mode (dev-start)
    │   ├─ Protocol debugging? → dev-start with socket
    │   ├─ Transport testing? → dev-start with socket
    │   └─ Advanced debugging? → dev-start with socket
    │
    └─ NO → Use Production Mode (standard brooklyn mcp start)
```

### Comparison Table

| **Feature**          | **Source Execution** | **Development Server** | **Production**      |
| -------------------- | -------------------- | ---------------------- | ------------------- |
| **Use Case**         | AI development       | Protocol testing       | End-user deployment |
| **Build Required**   | ❌ No                | ✅ Yes                 | ✅ Yes              |
| **Hot Reload**       | ✅ Instant           | ⚠️ Restart needed      | ❌ Rebuild needed   |
| **Claude Code**      | ✅ Native            | ❌ Not compatible      | ✅ Full integration |
| **JSON-RPC Testing** | ❌ No                | ✅ Direct access       | ❌ No               |
| **Dependencies**     | ✅ Full npm access   | ⚠️ Bundling limits     | ⚠️ Bundling limits  |
| **Authentication**   | None (dev only)      | Configurable           | Required            |
| **Transport**        | stdio                | Socket/Pipe            | stdio/HTTP          |

---

## 🔄 Common Development Workflows

### Workflow 1: Adding New MCP Tools (Recommended)

```bash
# 1. Set up source execution mode
claude mcp remove brooklyn
claude mcp add -s project brooklyn-dev -- bun src/cli/brooklyn.ts mcp start --development-only

# 2. Add your new tool to src/core/tool-definitions.ts
# 3. Implement the tool handler in appropriate adapter
# 4. Test immediately
/mcp  # Reconnects with new tool available

# 5. Iterate rapidly - no build step needed
```

### Workflow 2: Protocol Validation Before Integration

```bash
# 1. Start development server for protocol testing
brooklyn mcp dev-start --transport socket

# 2. Test new tool with direct JSON-RPC
SOCKET_PATH=$(brooklyn mcp dev-status | grep Socket | awk '{print $NF}')
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"your_new_tool","arguments":{}}}' | nc -U $SOCKET_PATH

# 3. Validate MCP compliance
# 4. When ready, switch to source execution mode for Claude Code integration
brooklyn mcp dev-stop
```

### Workflow 3: Debugging Bundling Issues

```bash
# If your production build fails due to native dependencies:

# 1. Switch to source execution mode immediately
claude mcp remove brooklyn
claude mcp add -s project brooklyn-dev -- bun src/cli/brooklyn.ts mcp start --development-only

# 2. Continue development without bundling constraints
# 3. Fix bundling issues separately while maintaining productivity
```

---

## 🚨 Important Notes

**Source Execution Mode:**

- ✅ **Primary choice** for all MCP server development
- ✅ **Authentication disabled** - uses "none" mode (safe for development)
- ✅ **Full dependency access** - no bundling constraints
- ⚠️ **Development only** - not suitable for production

**Development Server Mode:**

- 🔧 **Advanced tool** for protocol testing only
- 🔧 **Not Claude Code compatible** - different transport
- 🔧 **Socket transport recommended** - pipes have Node.js limitations
- 🔧 **Go roadmap** - pipe transport will work properly in Go implementation

**Transport Selection for dev-start:**

- ✅ **Socket** (`--transport socket`) - Reliable, recommended
- ⚠️ **Pipes** (`--transport pipe --experimental`) - Node.js limitations, experimental

Ready to start developing? See [troubleshooting.md](troubleshooting.md) for common issues and solutions.
