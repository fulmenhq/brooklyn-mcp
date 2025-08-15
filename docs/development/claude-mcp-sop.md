# Claude MCP Update Standard Operating Procedures

## 🚨 CRITICAL: MCP Tool Discovery & Caching Behavior

**Key Finding**: Claude Code **does NOT have a cache refresh command** for MCP tools. When new tools are added to Brooklyn, the **complete remove/add cycle** is the ONLY way to force tool re-discovery.

### Available Claude MCP Commands

- `claude mcp list` - List configured servers
- `claude mcp add <name> <command>` - Add new MCP server
- `claude mcp remove <name>` - Remove MCP server
- `claude mcp get <name>` - Get server details
- **NO** cache refresh or tool re-discovery command exists

### Development Iteration Impact

**DEFINITIVE DISCOVERY**: Claude Code has a **two-level caching architecture** that affects different types of changes differently.

#### Understanding Claude Code's Caching Architecture

Claude Code maintains **two separate caches**:

1. **Schema Cache**: Tool definitions, descriptions, parameters (partially auto-refreshed)
2. **Function Binding Cache**: Callable tool registry that enables `mcp__brooklyn__*` function calls (manual refresh only)

#### Schema Changes vs Functionality Changes

**🔧 SCHEMA CHANGES** (Always require `/mcp` reconnection):

- **New tools added** (e.g., `focus_element`)
- **Tool parameter changes** (new required/optional parameters)
- **Tool description/example updates**
- **Tool category changes**

**⚡ FUNCTIONALITY CHANGES** (HTTP + Project Scope auto-detected):

- **Tool implementation fixes** (e.g., `analyze_specificity` token limits)
- **Bug fixes in existing tools**
- **Performance improvements**
- **Server version updates**

#### Ultra-Fast Development for Functionality Changes

**✅ HTTP + Project Scope**: Backend functionality changes auto-detected instantly:

```bash
# 1. Make functionality changes and verify quality
bun run check-all

# 2. Deploy changes (automatic detection!)
bun run version:bump:patch  # Version confidence tracking
bun run build && bun run install
brooklyn web cleanup --port 3000
brooklyn web start --port 3000 --daemon

# 3. ✅ DONE! Changes detected automatically in 2-3 seconds
# No MCP commands needed for functionality changes
```

**Proven Results** (Testing 1.4.31 → 1.4.32):

- **Bug fixes**: ✅ `analyze_specificity` 72K→1.2K token fix applied instantly
- **Performance improvements**: ✅ Detected automatically
- **Server updates**: ✅ Version changes visible immediately
- **Zero disruption**: ✅ Continue working in same Claude session

#### Schema Changes Require Manual Reconnection

**🔧 ALL SCHEMA CHANGES** need `/mcp` reconnection (all transport/scope combinations):

```bash
# 1-2. Same as above (build and restart server)

# 3. REQUIRED: Reconnect for schema changes
# Use Claude Code's built-in reconnection:
/mcp  # Built-in reconnection command

# Alternative: Manual remove/add cycle
claude mcp remove brooklyn
claude mcp add brooklyn http://127.0.0.1:3000  # or -- brooklyn mcp start

# 4. Verify new tools appear and are callable
# Use brooklyn_list_tools in Claude, then test calling new tools
```

**Why This Happens**:

- **Schema Cache**: Updated automatically (tools appear in lists)
- **Function Binding Cache**: Requires manual refresh (tools become callable)

## MCP Message Format Reference

Brooklyn implements the MCP JSON-RPC 2.0 protocol. Key details from debugging Claude integration:

### Initialize Request (from Claude)

**CRITICAL**: Claude sends `id: 0`, not `id: 1`. Earlier documentation versions incorrectly showed `id: 1`, causing "two days of chasing tails" debugging issues.

Claude sends:

```json
{
  "method": "initialize",
  "params": {
    "protocolVersion": "2025-06-18",
    "capabilities": { "roots": {} },
    "clientInfo": { "name": "claude-code", "version": "1.0.61" }
  },
  "jsonrpc": "2.0",
  "id": 0
}
```

Notes:

- **Uses `id: 0`** (treated as request, not notification) - this is critical!
- **Declares `"roots": {}` capability** - required for handshake success
- **Full params object** - protocolVersion, capabilities, clientInfo all required
- Protocol version may differ from MCP spec default
- No embedded newlines; terminated by single \n
  **Historical Issue**: Earlier Brooklyn documentation incorrectly showed `id: 1` format, which our server would reject, causing silent connection failures.

### Brooklyn Response

Brooklyn responds:

```json
{
  "jsonrpc": "2.0",
  "id": 0,
  "result": {
    "protocolVersion": "2025-06-18",
    "serverInfo": { "name": "brooklyn-mcp-server", "version": "1.2.22" },
    "capabilities": { "tools": { "listChanged": true }, "resources": {}, "roots": {} }
  }
}
```

Notes:

- Echoes requested protocolVersion
- Declares matching capabilities including "roots": {}
- This format is MCP standard, not Claude-specific. Our initial implementation missed proper handling of id:0 (treating it as notification) and declaring roots capability, causing connection failures. Claude requires exact capability matching for successful handshake.

For full MCP spec: https://modelcontextprotocol.io/specification/latest

## Critical Discovery: Binary and Tool Caching

### Binary Caching (stdio transport)

Claude Code caches MCP binary references at session initialization. **Complete session restart required** for binary updates when using stdio transport.

### Tool Caching (both transports)

Claude Code caches MCP tool definitions and **has no refresh command**. **Complete remove/add cycle required** for new tools to be discovered, regardless of transport type.

## Claude Code Configuration

Brooklyn supports two transport modes for Claude Code MCP integration with two configuration scopes:

### Configuration Scopes

Choose your preferred scope for MCP configuration:

- **`-s user`**: User-wide configuration - available to all Claude Code instances for this user
- **`-s project`**: Project-specific configuration - available only within current project directory

**Recommendation**: Use `-s project` when developing Brooklyn itself, as it allows you to set up different configurations in different project locations. This is particularly valuable since updating the binary when using stdio transport can be difficult.

**Scope Comparison**:

| Aspect                   | `-s user`                       | `-s project`                      |
| ------------------------ | ------------------------------- | --------------------------------- |
| **Availability**         | All Claude sessions system-wide | Only in current project directory |
| **Configuration file**   | User's global Claude config     | Project's `.claude_mcp.json`      |
| **Binary updates**       | Requires global session restart | Can isolate to project            |
| **Development workflow** | Good for stable releases        | Better for active development     |
| **Team sharing**         | Personal configuration          | Can be version controlled         |

**When developing Brooklyn**: Project scope (`-s project`) is preferable because:

1. You can have different configurations for different Brooklyn development environments
2. Binary updates don't affect your global Claude configuration
3. You can test different Brooklyn versions simultaneously in different project directories
4. Easier to troubleshoot issues in isolation

### stdio Transport (Standard)

**Current Status**: Broken in recent versions - switching to HTTP temporarily.

**Add stdio configuration**:

```bash
# User scope (available everywhere for this user)
claude mcp add -s user -t stdio brooklyn -- brooklyn mcp start

# Project scope (recommended for Brooklyn development)
claude mcp add -s project -t stdio brooklyn -- brooklyn mcp start

# With additional args (team-id example)
claude mcp add -s project -t stdio brooklyn -- brooklyn mcp start --team-id myteam
```

**Key Points**:

- Notice the `--` separator before brooklyn command arguments
- Claude runs `brooklyn mcp start` in foreground mode
- Uses stdin/stdout for MCP communication
- Default transport mode (most efficient)
- Currently experiencing connection issues

**Development Iteration (stdio)**:

```bash
# For binary changes (requires full session restart)
bun run build && bun run install
pkill -f brooklyn
claude mcp remove brooklyn
# [Close ALL Claude sessions]
claude mcp add brooklyn -- brooklyn mcp start
# [Restart Claude sessions]

# For new tools only (no binary change needed)
claude mcp remove brooklyn
claude mcp add brooklyn -- brooklyn mcp start
# No session restart needed for tool discovery refresh
```

### HTTP Transport (Production Ready - RECOMMENDED)

Brooklyn now fully supports HTTP-based MCP transport with OAuth 2.0 PKCE authentication, making it compatible with Claude Code and other web-based MCP clients.

**✅ FIXED: PKCE Support Added**  
Brooklyn now implements complete OAuth 2.0 PKCE (Proof Key for Code Exchange) support with S256 code challenge method, resolving previous "Incompatible auth server" errors in Claude Code.

**Add HTTP configuration**:

Important:

- Claude Code cannot start HTTP servers. You must start the Brooklyn HTTP server yourself and keep it running while using Claude.
- After starting the server, add the HTTP transport in Claude with the -t http flag and an IPv4 URL.

```bash
# Start Brooklyn HTTP server (required; Claude will NOT start this for you)
# Option 1: Foreground mode (stays in terminal)
brooklyn web start --port 3000 --host 0.0.0.0

# Option 2: Background daemon mode
brooklyn web start --port 3000 --host 0.0.0.0 --daemon

# Add to Claude Code using explicit HTTP transport and IPv4 URL
# User scope (available everywhere for this user)
claude mcp add -s user -t http brooklyn http://127.0.0.1:3000

# Project scope (recommended for Brooklyn development)
claude mcp add -s project -t http brooklyn http://127.0.0.1:3000

# With team-id in the URL (if needed)
claude mcp add -s project -t http brooklyn http://127.0.0.1:3000/team/myteam

# Verify configuration
claude mcp list
claude mcp get brooklyn
```

**Development Iteration (HTTP)**:

```bash
# For server changes (project scope - no cache refresh needed!)
bun run version:bump:patch  # Version tracking confidence
bun run build && bun run install
brooklyn web cleanup --port 3000  # Stop old server
brooklyn web start --port 3000 --daemon  # Start new server
# ✅ Claude automatically detects schema changes (project scope)

# For user scope configurations (cache refresh required)
claude mcp remove brooklyn
claude mcp add brooklyn http://127.0.0.1:3000
# No session restart needed for tool discovery refresh
```

**Server Startup Options**:

- **Foreground mode**: Server runs in the terminal window and stops when you close it
- **Daemon mode**: Server runs in the background using `--daemon` option
- **Port selection**: Use `--port <port>` to specify different port (default: 3000)
- **Host binding**: Use `--host <IP>` to bind to specific IP (default: 127.0.0.1)
- **Team configuration**: Add `--team-id <teamId>` for team-specific configurations

**Key Benefits**:

- **✅ OAuth 2.0 PKCE compliant** - Works with Claude Code's security requirements
- **✅ No client secrets needed** - Uses public client flow (PKCE)
- **✅ Better debugging** - Can monitor HTTP requests and responses
- **✅ Multiple concurrent sessions** - Each Claude instance gets independent access
- **✅ Production ready** - Full MCP protocol compliance
- **✅ No binary caching issues** - Server updates work without Claude session restarts
- **✅ Better development iteration** - Only need remove/add for new tools, not server changes

### Endpoints Summary (Single Port)

When using `brooklyn web start`, the MCP HTTP transport serves BOTH OAuth 2.0 PKCE and MCP over a single port.

Default base URL (example): `http://localhost:3000`

- OAuth discovery (RFC 8414): GET `/.well-known/oauth-authorization-server`
- Authorization (PKCE): GET `/oauth/authorize`
- Manual auth helper (fallback): GET `/oauth/auth-help`
- Token exchange: POST `/oauth/token`
- Callback: GET `/oauth/callback`
- Connectivity: GET `/` and GET `/health`
- MCP JSON-RPC: POST `/`
- SSE (optional): GET `/` with `Accept: text/event-stream`

Notes:

- You do NOT need a second server or port for OAuth; Claude Code works against this single port.
- The separate `brooklyn mcp dev-http` server is for CI/programmatic testing (e.g. `/tools`); run it on a different port (e.g. 8080) if needed.
- Wire schema key: MCP tools/list responses use `input_schema` (snake_case). Internally (TypeScript) we define `inputSchema`; the HTTP transport normalizes to `input_schema` on the wire.

### Startup Tips (Claude HTTP Transport)

- Rebuild + reinstall the CLI when code changes:
  - `bun run build && bun run install`
- Prefer explicit IPv4 binding to avoid localhost/::1 pitfalls:
  - `brooklyn web start --port 3000 --host 0.0.0.0` (foreground)
  - `brooklyn web start --port 3000 --host 0.0.0.0 --daemon` (background)
- Quick verification (new terminal):
  - `curl -v http://localhost:3000/health`
  - `curl -v http://localhost:3000/.well-known/oauth-authorization-server`
- Manual authorization when auto-open fails:
  - Open `http://localhost:3000/oauth/auth-help` in your browser and follow the link.
- If Claude still references an old binary or URL:
  - `claude mcp remove brooklyn`
  - For HTTP: `claude mcp add -s project brooklyn http://localhost:3000`
  - For stdio: `claude mcp add -s project brooklyn -- brooklyn mcp start`
  - Fully restart Claude sessions.

### Networking and Cleanup

- Default bind for `brooklyn web start` is IPv4 127.0.0.1 to avoid localhost resolving to ::1 on some systems
- Explicit control:
  - Force IPv4: `brooklyn web start --port 3000 --ipv4`
  - Force IPv6: `brooklyn web start --port 3000 --ipv6`
  - Bind all interfaces: `brooklyn web start --port 3000 --host 0.0.0.0`
- If requests to `http://localhost:3000` time out, try IPv4 explicitly: `http://127.0.0.1:3000`

Unified cleanup:

- Global cleanup:
  - `brooklyn cleanup --http` — best-effort stop of HTTP servers discovered by the process manager
  - `brooklyn cleanup --http --port 3000` — also kill any listeners (IPv4/IPv6) bound to port 3000
  - `brooklyn cleanup --mcp` — MCP stdio cleanup for the current project
  - `brooklyn cleanup --mcp-all` — MCP stdio cleanup across all projects
  - Add `--force` to escalate to SIGKILL if needed
- Web-specific cleanup:
  - `brooklyn web cleanup --port 3000` — kill listeners (IPv4/IPv6) on a given port

**OAuth Discovery Endpoint**:
Brooklyn provides standard OAuth server metadata:

```bash
curl http://localhost:3000/.well-known/oauth-authorization-server
```

Response includes:

```json
{
  "issuer": "http://localhost:3000",
  "authorization_endpoint": "http://localhost:3000/oauth/authorize",
  "token_endpoint": "http://localhost:3000/oauth/token",
  "code_challenge_methods_supported": ["S256", "plain"],
  "token_endpoint_auth_methods_supported": ["client_secret_basic", "client_secret_post", "none"],
  "grant_types_supported": ["authorization_code"],
  "response_types_supported": ["code"]
}
```

**Environment Variables for HTTP Mode**:

```bash
# Server Configuration
BROOKLYN_HTTP_PORT=3000                    # HTTP server port
BROOKLYN_HTTP_CORS_ORIGIN=*                # CORS allowed origins
BROOKLYN_HTTP_RATE_LIMIT_REQUESTS=100     # Rate limit requests per window
BROOKLYN_HTTP_RATE_LIMIT_WINDOW=60000     # Rate limit window (ms)

# OAuth Configuration
BROOKLYN_OAUTH_ISSUER=http://localhost:3000  # OAuth issuer URL
BROOKLYN_OAUTH_CLIENT_ID=brooklyn-client     # Default client ID

# Security
BROOKLYN_HTTP_SECURE_COOKIES=false        # Use secure cookies (HTTPS only)
BROOKLYN_HTTP_COOKIE_DOMAIN=localhost     # Cookie domain
```

**Testing HTTP Transport**:

```bash
# 1. Test OAuth discovery
curl -s http://localhost:3000/.well-known/oauth-authorization-server | jq

# 2. Manual authorization (if browser doesn't open automatically)
open http://localhost:3000/oauth/auth-help

# 3. Test MCP protocol (after OAuth flow)
curl -X POST http://localhost:3000 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "method": "tools/list",
    "params": {},
    "jsonrpc": "2.0",
    "id": 1
  }'
```

**Manual Authorization Fallback**:
If Claude Code says "A browser window will open" but no browser opens:

1. **Go to the auth helper page**: `http://localhost:3000/oauth/auth-help`
2. **Copy the authorization URL** provided on that page
3. **Paste into your browser** and complete authorization
4. **Return to Claude Code** - it should now be connected

This is similar to how AWS CLI and Azure CLI handle OAuth when browsers don't open automatically.

### Configuration Management

**Remove configuration**:

```bash
# Remove from default scope
claude mcp remove brooklyn

# Remove from specific scope (if multiple configurations exist)
claude mcp remove -s user brooklyn
claude mcp remove -s project brooklyn
```

**List and test configurations**:

```bash
claude mcp list
```

- Shows both user and project scope configurations
- Actually starts servers temporarily to test if they work
- Useful for debugging configuration issues

**Configuration scopes**:

- `-s user`: Available to all Claude Code instances for this user
- `-s project`: Available only within current project directory (recommended for Brooklyn development)
- Default: `-s user` if no scope specified

**Environment variables** (optional):

```bash
# For stdio transport (note the -- separator)
claude mcp add -s user -e BROOKLYN_LOG_LEVEL=debug brooklyn -- brooklyn mcp start

# For HTTP transport
claude mcp add -s user -e BROOKLYN_LOG_LEVEL=debug brooklyn http://127.0.0.1:3000
```

### Transport Selection Guidelines

**Use HTTP when** (RECOMMENDED for development):

- Adding new tools frequently (no session restarts needed)
- Debugging MCP communication issues
- stdio transport is experiencing problems
- Need to monitor network traffic
- Multiple concurrent Claude sessions
- Rapid development iteration cycles

**Use stdio when**:

- Maximum performance needed
- Transport is working reliably
- Single Claude session workflows
- Following MCP best practices
- Stable tool set (not adding new tools frequently)

## 🚨 CRITICAL: Tool Registration Requirements

**NEW REQUIREMENT**: When adding new MCP tools to Brooklyn, **THREE LOCATIONS** must be updated to prevent "Tool not found" errors:

### Required Registration Steps

1. **Tool Schema Definition** (`src/core/tool-definitions.ts`)
   - Add tool to appropriate category array (e.g., `javascriptTools`, `stylingTools`)
   - Define complete `inputSchema` with required parameters
   - Include examples and error cases

2. **Tool Classification** (`src/core/brooklyn-engine.ts`)
   - Add tool name to `isCoreTools()` array (for core tools)
   - OR add to `isOnboardingTools()` array (for help/status tools)
   - **CRITICAL**: Missing this causes "Tool not found" error

3. **Execution Routing** (`src/core/brooklyn-engine.ts`)
   - Add case to `handleCoreTool()` switch statement
   - Route through browser router with proper parameter handling
   - **CRITICAL**: Missing this causes "Unknown core tool" error

### Automated Prevention

**Quality Gate**: Run this test before adding tools:

```bash
bun run test tests/quality-gates/tool-registration-completeness.test.ts
```

This test automatically catches:

- ✅ Tools defined but not classified
- ✅ Tools classified but missing execution routing
- ✅ Missing category registrations
- ✅ Inconsistent tool definitions

**Integration**: This test runs as part of `bun run check-all` and will **fail the build** if registration gaps exist.

### Historical Context

This requirement was discovered after **two separate incidents** where tools were properly implemented but missing from registration locations:

1. **Category Registration Gap**: New tool categories not added to discovery endpoints
2. **Execution Routing Gap**: Tools registered and classified but missing from switch cases

Both resulted in working implementations that returned "Tool not found" errors, requiring investigation and manual fixes.

### Complete Development Workflow

```bash
# 1. Verify system integrity BEFORE adding tools
bun run test tests/quality-gates/tool-registration-completeness.test.ts

# 2. Add tool following all three requirements
# See: docs/development/adding-new-commands.md

# 3. Verify quality gates pass
bun run check-all

# 4. Test the complete flow
bun run build && bun run install
brooklyn web cleanup --port 3000
brooklyn web start --port 3000 --daemon
claude mcp remove brooklyn
claude mcp add brooklyn http://127.0.0.1:3000
```

**Documentation**: See `docs/development/adding-new-commands.md` for complete step-by-step guide.

## Update Procedure

### For HTTP Transport (RECOMMENDED)

```bash
# 1. Build and install new binary
bun run version:bump:patch
bun run build
bun run install
brooklyn --version  # Verify new version

# 2. Restart Brooklyn HTTP server
brooklyn web cleanup --port 3000
brooklyn web start --port 3000 --daemon

# 3. For new tools: Force tool cache refresh
claude mcp remove brooklyn
claude mcp add brooklyn http://127.0.0.1:3000

# No Claude session restart needed!
```

### For stdio Transport

```bash
# 1. Build and install new binary
bun run version:bump:patch
bun run build
bun run install
brooklyn --version  # Verify new version

# 2. Kill ALL Brooklyn processes
ps aux | grep brooklyn | grep -v grep | awk '{print $2}' | xargs kill -9

# 3. Remove MCP configuration
claude mcp remove brooklyn

# 4. Close ALL Claude sessions (REQUIRED for binary updates)
# - All terminal sessions running `claude`
# - All IDE integrations
# - All background Claude processes

# 5. Re-add MCP configuration
claude mcp add -s user brooklyn -- brooklyn mcp start

# 6. Restart Claude sessions
# Only after complete restart will new binary be recognized
```

### Quick Tool Addition Workflow (Both Transports)

When adding **new tools only** (no binary changes needed):

```bash
# HTTP Transport
claude mcp remove brooklyn
claude mcp add brooklyn http://127.0.0.1:3000

# stdio Transport
claude mcp remove brooklyn
claude mcp add brooklyn -- brooklyn mcp start

# No session restarts needed for tool discovery refresh!
```

## Troubleshooting

### Tool Discovery Issues

**Symptoms**: New tools not appearing in Claude, tool count doesn't increase

**Root Cause**: Claude Code caches tool definitions with no refresh command

**Solution**:

```bash
# Always required for new tools
claude mcp remove brooklyn
claude mcp add brooklyn [your-transport-config]
```

### Silent Logger Issues (v1.2.17+)

Brooklyn now starts completely silent in MCP mode:

- No stderr output until transport determined
- Logs go to `~/.brooklyn/logs/brooklyn-mcp-{pid}-{timestamp}.log`
- Use `brooklyn_logs` MCP tool to access logs

### Testing Silent Operation

```bash
# Test with flow wrapper
bun scripts/flow-wrapper-stdio.ts "brooklyn mcp start" --pipe-log-base test-silent

# Should see NO stderr output, only JSON-RPC on stdout
echo '{"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{"roots":{}},"clientInfo":{"name":"claude-code","version":"1.0.61"}},"jsonrpc":"2.0","id":0}' | brooklyn mcp start

# Historical Note: Earlier versions of our docs incorrectly showed
# echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' | brooklyn mcp start
# This caused "two days of chasing tails" - Claude actually uses id:0, not id:1
```

### Common Issues

**Claude still using old version** (stdio transport):

- Incomplete session restart
- Check: `ps aux | grep claude`
- Solution: Kill all Claude processes and restart sessions

**New tools not appearing** (both transports):

- Tool caching in Claude Code
- Check: `brooklyn_list_tools` shows old count
- Solution: Complete remove/add cycle (no session restart needed)

**Connection timeouts**:

- Check for stderr output contamination
- Verify silent logger working: `brooklyn mcp start 2>&1 | head`
- Should see only JSON-RPC, no logs

**Multiple Brooklyn processes**:

- Previous sessions not cleaned up
- Use process kill commands above
- Consider `pkill -f brooklyn` (careful!)

## Development Workflow Impact

### For HTTP Transport (Recommended)

- **Server changes**: Restart server only, no Claude session restart
- **New tools**: Remove/add MCP config only, no Claude session restart
- **Rapid iteration**: Much faster development cycle
- **Team coordination**: Less disruptive to concurrent work

### For stdio Transport

- **Binary changes**: Full Claude session restart required
- **New tools**: Remove/add MCP config, no session restart needed
- **Slower iteration**: Must coordinate session restarts
- **Team coordination**: Affects all Claude work during updates

## Rapid Development SOP

### Ultra-Fast Brooklyn Development (HTTP + Project Scope)

**✅ BREAKTHROUGH**: Functionality changes are detected automatically, schema changes need `/mcp` reconnection.

#### For Functionality Changes (Bug Fixes, Performance, etc.)

```bash
# 1. Make backend functionality changes
# Edit src/core/javascript/ and src/core/styling/ services (existing tools)

# 2. Verify quality
bun run check-all

# 3. Deploy changes (automatic detection!)
bun run version:bump:patch  # Version confidence tracking
bun run build && bun run install
brooklyn web cleanup --port 3000
brooklyn web start --port 3000 --daemon

# 4. ✅ DONE! Test changes immediately
# Claude automatically detects functionality changes in 2-3 seconds
```

#### For Schema Changes (New Tools, Parameters, etc.)

```bash
# 1-3. Same as above (build and restart server)

# 4. Reconnect for schema changes
/mcp  # Use Claude Code's built-in reconnection

# 5. Test new tools immediately
# New tools are now callable via mcp__brooklyn__*
```

**Proven Results** (1.4.31 → 1.4.33 testing):

- **Functionality fixes**: ✅ `analyze_specificity` 72K→1.2K token fix (instant)
- **New tools**: ✅ `focus_element` required `/mcp` reconnection
- **Total cycle time**: ✅ ~30 seconds for functionality, ~60 seconds for schema
- **Zero disruption**: ✅ Continue working in same Claude session

### Fallback for Other Configurations

**For stdio transport or user scope HTTP** (manual refresh required for both):

```bash
# 1-3. Same as above

# 4. Refresh tool cache (< 10 seconds)
claude mcp remove brooklyn
claude mcp add brooklyn http://127.0.0.1:3000  # or -- brooklyn mcp start

# 5. Test new tools immediately
# Should see increased tool count (e.g., 24 → 32 tools)
```

**Expected Results**:

- **Tool discovery**: New tools appear in <10 seconds
- **No session restarts**: Continue working in same Claude session
- **Rapid iteration**: Sub-minute modification cycles

## Quick Reference

```bash
# HTTP Transport + Project Scope (FASTEST - Auto Schema Detection)
# Complete update cycle
bun run version:bump:patch && bun run build && bun run install
brooklyn web cleanup --port 3000 && brooklyn web start --port 3000 --daemon
# ✅ DONE! Claude auto-detects changes

# HTTP Transport + User Scope (Cache Refresh Required)
# Server update
bun run build && bun run install
brooklyn web cleanup --port 3000 && brooklyn web start --port 3000 --daemon

# Tool cache refresh
claude mcp remove brooklyn && claude mcp add brooklyn http://127.0.0.1:3000

# stdio Transport (Stable Release)
# Full update cycle
bun run version:bump:patch && bun run build && bun run install
pkill -f brooklyn && claude mcp remove brooklyn
# [Close all Claude sessions]
claude mcp add -s user brooklyn -- brooklyn mcp start
# [Restart Claude]

# Tool-only refresh (both transports)
claude mcp remove brooklyn && claude mcp add brooklyn [transport-config]
```

---

**Last Updated**: January 13, 2025  
**Critical Changes**:

- v1.2.17+ implements silent MCP startup
- **New**: Tool caching behavior and refresh procedures documented
- **New**: HTTP transport recommended for development iteration
- **New**: Remove/add cycle required for tool discovery refresh
