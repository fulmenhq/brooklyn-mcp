# Claude MCP Update Standard Operating Procedures

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

## Critical Discovery: Binary Caching

Claude Code caches MCP binary references at session initialization. **Complete session restart required** for binary updates.

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

**Use HTTP when**:

- Debugging MCP communication issues
- stdio transport is experiencing problems
- Need to monitor network traffic
- Multiple concurrent Claude sessions

**Use stdio when**:

- Maximum performance needed
- Transport is working reliably
- Single Claude session workflows
- Following MCP best practices

## Update Procedure

### 1. Build and Install New Binary

```bash
bun run version:bump:patch
bun run build
bun run install
brooklyn --version  # Verify new version
```

### 2. Kill ALL Brooklyn Processes

```bash
# Check running processes
ps aux | grep brooklyn | grep -v grep

# Kill all Brooklyn processes
ps aux | grep brooklyn | grep -v grep | awk '{print $2}' | xargs kill -9

# Or use Brooklyn's cleanup (dev mode only)
brooklyn mcp dev-cleanup
```

### 3. Remove MCP Configuration

```bash
claude mcp remove brooklyn
```

### 4. Close ALL Claude Sessions

**CRITICAL**: Must close EVERY Claude session on the machine

- All terminal sessions running `claude`
- All IDE integrations
- All background Claude processes

### 5. Re-add MCP Configuration

```bash
# For stdio transport (note the -- separator)
claude mcp add -s user brooklyn -- brooklyn mcp start

# For HTTP transport (remember to start server first)
brooklyn web start --port 3000 --daemon
claude mcp add -s user brooklyn http://127.0.0.1:3000

# Verify configuration
claude mcp list
claude mcp get brooklyn
```

### 6. Restart Claude Sessions

Only after complete restart will new binary be recognized.

## Troubleshooting

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

**Claude still using old version**:

- Incomplete session restart
- Check: `ps aux | grep claude`
- Solution: Kill all Claude processes

**Connection timeouts**:

- Check for stderr output contamination
- Verify silent logger working: `brooklyn mcp start 2>&1 | head`
- Should see only JSON-RPC, no logs

**Multiple Brooklyn processes**:

- Previous sessions not cleaned up
- Use process kill commands above
- Consider `pkill -f brooklyn` (careful!)

## Development Workflow Impact

- Plan version updates during breaks
- Coordinate with team (affects all Claude work)
- Batch changes before version bumps
- Consider using dev mode for rapid iteration

## Quick Reference

```bash
# Full update cycle
bun run version:bump:patch && bun run build && bun run install
pkill -f brooklyn
claude mcp remove brooklyn
# [Close all Claude sessions]

# Stdio transport
claude mcp add -s user brooklyn -- brooklyn mcp start
# OR HTTP transport
brooklyn web start --port 3000 --daemon && claude mcp add -s user brooklyn http://127.0.0.1:3000

# [Restart Claude]
```

---

Last Updated: July 26, 2025
Critical Change: v1.2.17+ implements silent MCP startup
