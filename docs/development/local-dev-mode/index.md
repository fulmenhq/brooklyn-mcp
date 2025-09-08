# Brooklyn Development Modes for AI Developers

Brooklyn provides two primary development approaches for AI developers working on MCP servers: **Source Execution Mode** (`--development-only`) for rapid prototyping and **Development Server Mode** (`dev-start`) for advanced debugging.

## 🚀 Quick Start for AI Developers

**For most AI development work, use Source Execution Mode:**

```bash
# Run Brooklyn directly from source (bypasses bundling issues)
bun src/cli/brooklyn.ts mcp start --development-only

# Add to Claude Code for immediate iteration
claude mcp add -s project brooklyn-dev -- bun src/cli/brooklyn.ts mcp start --development-only

# Make changes to source → Use /mcp command → Changes reflected immediately!
```

## Development Mode Options

### ⚡ Source Execution Mode (`--development-only`)

**Best for**: Active MCP server development, rapid prototyping, AI agent iteration

**Key Benefits**:

- 🚀 **No build step** - Changes reflected immediately
- 🔧 **Full dependency access** - All npm packages work without bundling constraints
- ⚡ **Faster iteration** - Edit code, use `/mcp` command, test immediately
- 🛠️ **Development flexibility** - Perfect for testing new tool implementations

```bash
# Direct source execution
bun src/cli/brooklyn.ts mcp start --development-only

# Claude Code integration (recommended)
claude mcp add -s project brooklyn-dev -- bun src/cli/brooklyn.ts mcp start --development-only
```

### 🔧 Development Server Mode (`dev-start`)

**Best for**: Advanced MCP protocol debugging, transport testing, persistent server needs

**Key Features**:

- **Socket Transport** - Reliable Unix domain socket communication (recommended)
- **Pipe Transport** - Named pipes (experimental, Node.js limitations)
- **Persistent Server** - Background daemon with process management
- **Direct JSON-RPC** - Send raw MCP messages for protocol testing

```bash
# Start development server with socket transport (recommended)
brooklyn mcp dev-start --transport socket

# Test with direct JSON-RPC messages
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | nc -U /tmp/brooklyn-*.sock
```

## When to Use Each Mode

### 🎯 Decision Matrix for AI Developers

| **Scenario**                | **Recommended Mode** | **Why**                                   |
| --------------------------- | -------------------- | ----------------------------------------- |
| **Adding new MCP tools**    | `--development-only` | Immediate source changes, no build step   |
| **Fixing bundling issues**  | `--development-only` | Bypasses native dependency problems       |
| **Rapid prototyping**       | `--development-only` | Fastest iteration cycle                   |
| **Claude Code integration** | `--development-only` | Works with `/mcp` command                 |
| **MCP protocol debugging**  | `dev-start`          | Direct JSON-RPC message testing           |
| **Transport layer testing** | `dev-start`          | Socket/pipe communication testing         |
| **Persistent server needs** | `dev-start`          | Background daemon with process management |

### ✅ Source Execution Mode Features

- **🚀 Zero build time** - TypeScript executed directly via Bun
- **📦 Full npm ecosystem** - No bundling constraints on dependencies
- **🔄 Hot reload workflow** - Edit → `/mcp` → Test (no restart needed)
- **🎯 Claude Code native** - Perfect for AI agent development
- **🛠️ Development auth** - Uses "none" authentication mode safely

### 🔧 Development Server Mode Features

- **🔌 Socket transport** - Reliable Unix domain socket communication
- **📡 Pipe transport** - Named pipes (experimental, Go roadmap)
- **⚙️ Process management** - Background daemon with lifecycle controls
- **🧪 Protocol testing** - Direct JSON-RPC message validation
- **📊 Advanced debugging** - Transport layer inspection

## Recommended AI Development Workflow

### 🎯 Primary Workflow: Source Execution Mode

```bash
# 1. Set up source-based MCP server
claude mcp remove brooklyn  # Remove any existing Brooklyn
claude mcp add -s project brooklyn-dev -- bun src/cli/brooklyn.ts mcp start --development-only

# 2. Make changes to Brooklyn source code
# Edit src/core/tool-definitions.ts
# Edit src/core/brooklyn-engine.ts
# Add new tools, fix bugs, etc.

# 3. Test changes immediately
/mcp  # In Claude Code - picks up source changes instantly!

# 4. Iterate rapidly
# No build step, no restart - just edit and test
```

### 🔧 Advanced Workflow: Development Server Mode

```bash
# 1. Start development server for protocol testing
brooklyn mcp dev-start --transport socket

# 2. Test with direct JSON-RPC messages
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | nc -U /tmp/brooklyn-*.sock

# 3. Validate MCP compliance before Claude Code integration
# Perfect for testing new tools before adding to main workflow

# 4. When ready, switch back to source execution mode for Claude Code
brooklyn mcp dev-stop
```

### 🚨 Important Notes for AI Developers

**Source Execution Mode (`--development-only`):**

- ✅ **Primary choice** for MCP server development
- ✅ **Claude Code compatible** - works with `/mcp` command
- ✅ **Bundling workaround** - bypasses native dependency issues
- ✅ **Authentication disabled** - uses "none" mode (development only)

**Development Server Mode (`dev-start`):**

- 🔧 **Advanced debugging only** - not for regular development
- 🔧 **Protocol validation** - test JSON-RPC messages directly
- 🔧 **Transport testing** - socket works, pipes experimental (Go roadmap)
- 🔧 **Not Claude Code compatible** - different transport mechanism

## Quick Reference for AI Developers

| **Feature**        | **Source Execution<br>(`--development-only`)** | **Development Server<br>(`dev-start`)** | **Production<br>(`mcp start`)** |
| ------------------ | ---------------------------------------------- | --------------------------------------- | ------------------------------- |
| **Primary Use**    | Active MCP development                         | Protocol debugging                      | Production deployment           |
| **Transport**      | stdio (Claude Code)                            | Socket/Pipe (manual)                    | stdio/HTTP                      |
| **Build Required** | ❌ No                                          | ✅ Yes                                  | ✅ Yes                          |
| **Hot Reload**     | ✅ Instant                                     | ⚠️ Restart needed                       | ❌ Rebuild needed               |
| **Claude Code**    | ✅ Native (`/mcp`)                             | ❌ Not compatible                       | ✅ Full integration             |
| **Dependencies**   | ✅ All npm packages                            | ⚠️ Bundling constraints                 | ⚠️ Bundling constraints         |
| **Authentication** | None (dev only)                                | Configurable                            | Required                        |
| **Best For**       | AI developers                                  | MCP protocol testing                    | End users                       |

## Transport Details

### Source Execution Mode

- **Command**: `bun src/cli/brooklyn.ts mcp start --development-only`
- **Transport**: Standard stdio (works with Claude Code)
- **Authentication**: "none" mode (development only)
- **Dependencies**: Full access to npm ecosystem

### Development Server Mode

- **Socket**: `brooklyn mcp dev-start --transport socket` (✅ **Recommended**)
- **Pipes**: `brooklyn mcp dev-start --transport pipe --experimental` (⚠️ **Node.js limitations**)
- **Go Roadmap**: Pipe transport will be fully supported in Go implementation

---

**📚 Next Steps:**

- **Usage Examples**: [usage.md](usage.md) - Detailed workflows and commands
- **Architecture**: [architecture.md](architecture.md) - Technical implementation details
- **Troubleshooting**: [troubleshooting.md](troubleshooting.md) - Common issues and solutions
