# Brooklyn HTTP Mode API Documentation

**Status**: Phase 3 Complete ✅  
**Version**: 1.4.35  
**Author**: Architect Brooklyn (🏛️)

Brooklyn HTTP Mode provides REST API endpoints for programmatic tool testing and CI/CD integration. This mode enables automated testing of all MCP tools via standard HTTP requests.

## Quick Start

### Starting HTTP Mode

Server modes overview:

- brooklyn web start (recommended for Claude Code)
  - Runs the MCP HTTP transport on a single port
  - Serves OAuth 2.0 PKCE endpoints and MCP JSON-RPC over the same server
  - Endpoints:
    - OAuth Discovery: GET /.well-known/oauth-authorization-server
    - Authorization: GET /oauth/authorize (PKCE)
    - Manual helper: GET /oauth/auth-help
    - Token: POST /oauth/token
    - Callback: GET /oauth/callback
    - Connectivity: GET / and GET /health
    - MCP JSON-RPC: POST /
    - SSE (optional): GET / with Accept: text/event-stream
- brooklyn mcp dev-http (developer REST API mode)
  - Runs a REST API server for tools and MCP testing
  - Endpoints:
    - Tools: GET /tools, POST /tools/{name}
    - MCP JSON-RPC: POST /mcp
    - Health/Metrics: GET /health, GET /metrics

Notes:

- One port is sufficient for OAuth and MCP when using brooklyn web start. You do not need a second port for auth.
- dev-http is a separate server intended for CI/programmatic testing; run it on a different port when needed (e.g., 8080).

```bash
# Production HTTP server with OAuth PKCE (recommended for Claude Code)
brooklyn web start --port 3000

# Development HTTP mode for direct API access (runs in background by default)
brooklyn mcp dev-http --port 8080 --team-id my-team

# Foreground mode (for debugging)
brooklyn mcp dev-http --port 8080 --team-id my-team --foreground --verbose

# Custom configuration
brooklyn mcp dev-http --port 3000 --host localhost --no-cors
```

### Authentication Modes & Trusted Proxies

The HTTP transport enforces one of three auth modes. Choose them via `--auth-mode <required|localhost|disabled>` or the `BROOKLYN_HTTP_AUTH_MODE` environment variable.

| Mode        | Description                                                               | Default Command         |
| ----------- | ------------------------------------------------------------------------- | ----------------------- |
| `required`  | Every MCP/SSE request must supply `Authorization: Bearer <token>`         | `brooklyn web start`    |
| `localhost` | Loopback clients (127.0.0.1/::1/::ffff:127.0.0.1) may connect anonymously | Manual opt-in           |
| `disabled`  | No auth checks; intended only for isolated CI/dev servers                 | `brooklyn mcp dev-http` |

- OAuth endpoints (`/oauth/*`), discovery (`/.well-known/...`), `/health`, and `/metrics` stay reachable without a token regardless of mode.
- SSE subscriptions (`GET /` with `Accept: text/event-stream`) are blocked unless the guard accepts the request.
- Set `BROOKLYN_HTTP_TRUSTED_PROXIES=10.0.0.5,10.0.0.6` to allow Brooklyn to honor `X-Forwarded-For` from those hops when evaluating `authMode=localhost`.
- See `docs/deployment/mcp-configuration.md#property-file-examples-mcpjson-opencodejson` for `.mcp.json` and `opencode.json` entries that point IDEs at your chosen HTTP URL.

### Streamable HTTP sessions (`Mcp-Session-Id`)

Brooklyn supports MCP Streamable HTTP session correlation via `Mcp-Session-Id` (server-generated if missing).

SSOT: `docs/architecture/adr/ADR-0001-mcp-session-id.md`

Examples:

```bash
# Production-safe defaults
brooklyn web start --port 3000 --auth-mode required --daemon

# Loopback-only bypass for local debugging

brooklyn web start --port 3000 --auth-mode localhost

# Secure dev-http in CI
brooklyn mcp dev-http --port 8080 --team-id qa --auth-mode required

# Trust a reverse proxy while still enforcing tokens
BROOKLYN_HTTP_AUTH_MODE=required \
BROOKLYN_HTTP_TRUSTED_PROXIES=10.0.0.5 \
brooklyn web start --host 0.0.0.0 --port 3000 --daemon
```

### OAuth PKCE Authentication (NEW)

Brooklyn now supports OAuth 2.0 PKCE for secure authentication with Claude Code:

**OAuth Discovery**:

```bash
curl http://localhost:3000/.well-known/oauth-authorization-server
```

**OAuth Flow for Custom Clients**:

1. **Authorization Request**: Redirect user to `/oauth/authorize` with PKCE parameters
2. **Token Exchange**: Exchange authorization code for access token at `/oauth/token`
3. **API Access**: Use Bearer token in Authorization header for MCP requests

**Supported PKCE Methods**: S256 (recommended), plain

**For Claude Code Integration**:

```bash
# Brooklyn handles the OAuth flow automatically
claude mcp add -s user -t http brooklyn http://127.0.0.1:3000
```

### API Base URL

```
http://localhost:8080  # Default
```

### HTTP API Discovery

**The key to using Brooklyn's HTTP API is understanding how to discover and translate tools:**

```bash
# 1. Start server (runs in background by default)
brooklyn mcp dev-http --port 8080

# 2. Discover available tools
curl -s http://localhost:8080/tools | jq '.data.tools[].name'

# 3. Get tool schema (shows exact parameters needed)
curl -s http://localhost:8080/tools | jq '.data.tools[] | select(.name == "launch_browser")'

# 4. Use tool with correct format
curl -X POST http://localhost:8080/tools/launch_browser \
  -H "Content-Type: application/json" \
  -d '{"browserType": "chromium", "headless": true}'
```

## API Endpoints

### Health & Status

#### `GET /health`

Server health check and basic information.

**Response:**

```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "version": "1.3.3",
    "uptime": 123.45,
    "tools": 20,
    "teamId": "http-session"
  },
  "executionTime": 2,
  "timestamp": "2025-07-31T16:58:21.123Z"
}
```

#### `GET /metrics`

Performance metrics and resource usage.

**Response:**

```json
{
  "success": true,
  "data": {
    "memory": {
      "rss": "45MB",
      "heapUsed": "32MB",
      "heapTotal": "48MB"
    },
    "uptime": "123s",
    "version": "1.3.3",
    "tools": 20
  },
  "executionTime": 1,
  "timestamp": "2025-07-31T16:58:21.123Z"
}
```

### Tools API

#### `GET /tools`

List all available MCP tools with metadata.

**Response:**

```json
{
  "success": true,
  "data": {
    "tools": [
      {
        "name": "launch_browser",
        "description": "Launch a new browser instance (Chromium, Firefox, or WebKit)",
        "category": "browser-lifecycle",
        "inputSchema": {
          "type": "object",
          "properties": {
            "browserType": {
              "type": "string",
              "enum": ["chromium", "firefox", "webkit"],
              "default": "chromium"
            },
            "headless": {
              "type": "boolean",
              "default": true
            }
          }
        }
      }
    ],
    "total": 20
  },
  "executionTime": 3,
  "timestamp": "2025-07-31T16:58:21.123Z"
}
```

#### `POST /tools/{toolName}`

Execute a specific MCP tool with parameters.

**Request Format (parameters go directly in JSON body):**

```json
{
  "browserType": "chromium",
  "headless": false
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "browserId": "browser-abc-123",
    "browserType": "chromium",
    "headless": false,
    "userAgent": "Mozilla/5.0...",
    "viewport": {
      "width": 1280,
      "height": 720
    }
  },
  "executionTime": 1234,
  "timestamp": "2025-07-31T16:58:21.123Z"
}
```

**⚠️ Important**: Parameters go directly in the JSON body, NOT wrapped in an `"arguments"` object.

### MCP Protocol

#### `POST /mcp`

Standard MCP JSON-RPC protocol endpoint.

**Tools List Request:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list",
  "params": {}
}
```

**Tools List Response:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "tools": [
      {
        "name": "launch_browser",
        "description": "Launch a new browser instance",
        "input_schema": { ... }
      }
    ]
  }
}
```

Note:

- Streamable HTTP wire format uses snake_case for the tool schema key: use input_schema on the wire. Internally (TypeScript), tools are defined with inputSchema and normalized by the transport.
- Clients should include an Accept header listing application/json and text/event-stream and, after initialization, include MCP-Protocol-Version: 2025-06-18 on subsequent requests as per the MCP spec.

**Tool Call Request:**

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "launch_browser",
    "arguments": {
      "browserType": "chromium",
      "headless": true
    }
  }
}
```

**Tool Call Response:**

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"browserId\":\"browser-abc-123\",\"type\":\"chromium\"}"
      }
    ]
  }
}
```

## Usage Examples

### Complete Browser Automation Workflow

```bash
# 1. Start HTTP server in background
brooklyn mcp dev-http --port 8080 --team-id demo --background

# 2. Verify server is running
curl -s http://localhost:8080/health

# 3. Discover available tools
curl -s http://localhost:8080/tools | jq '.data.tools[].name'

# 4. Launch browser (get actual browser ID from response)
BROWSER_RESPONSE=$(curl -s -X POST http://localhost:8080/tools/launch_browser \
  -H "Content-Type: application/json" \
  -d '{"browserType": "chromium", "headless": true}')

BROWSER_ID=$(echo $BROWSER_RESPONSE | jq -r '.data.browserId')
echo "Browser ID: $BROWSER_ID"

# 5. Navigate to page
curl -X POST http://localhost:8080/tools/navigate_to_url \
  -H "Content-Type: application/json" \
  -d "{\"browserId\": \"$BROWSER_ID\", \"url\": \"https://example.com\"}"

# 6. Take screenshot
curl -X POST http://localhost:8080/tools/take_screenshot \
  -H "Content-Type: application/json" \
  -d "{\"browserId\": \"$BROWSER_ID\", \"fullPage\": true}"

# 7. Close browser
curl -X POST http://localhost:8080/tools/close_browser \
  -H "Content-Type: application/json" \
  -d "{\"browserId\": \"$BROWSER_ID\"}"

# 8. Stop HTTP server
brooklyn mcp dev-http-stop --port 8080
```

### API Discovery Pattern

```bash
# Always start with tool discovery
curl -s http://localhost:8080/tools | jq '.data.tools[] | {name, description}'

# Get schema for specific tool
curl -s http://localhost:8080/tools | jq '.data.tools[] | select(.name == "navigate_to_url")'

# Use the exact parameter names from schema
curl -X POST http://localhost:8080/tools/navigate_to_url \
  -H "Content-Type: application/json" \
  -d '{"browserId": "browser-123", "url": "https://example.com", "waitUntil": "load"}'
```

### Error Handling Pattern

```bash
# Always check response success field
RESPONSE=$(curl -s -X POST http://localhost:8080/tools/launch_browser \
  -H "Content-Type: application/json" \
  -d '{"browserType": "chromium"}')

SUCCESS=$(echo $RESPONSE | jq -r '.success')
if [ "$SUCCESS" = "true" ]; then
  BROWSER_ID=$(echo $RESPONSE | jq -r '.data.browserId')
  echo "✅ Browser launched: $BROWSER_ID"
else
  ERROR=$(echo $RESPONSE | jq -r '.error')
  echo "❌ Error: $ERROR"
fi
```

### JavaScript/Node.js Integration

```javascript
const BASE_URL = "http://localhost:8080";

async function callTool(toolName, params = {}) {
  const response = await fetch(`${BASE_URL}/tools/${toolName}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params), // Parameters go directly, no "arguments" wrapper
  });
  return response.json();
}

// Launch browser
const browserResult = await callTool("launch_browser", {
  browserType: "chromium",
  headless: true,
});

if (browserResult.success) {
  const browserId = browserResult.data.browserId;
  console.log("✅ Browser launched:", browserId);

  // Navigate to page
  const navResult = await callTool("navigate_to_url", {
    browserId: browserId,
    url: "https://example.com",
  });

  if (navResult.success) {
    console.log("✅ Navigation completed");

    // Take screenshot
    const screenshotResult = await callTool("take_screenshot", {
      browserId: browserId,
      fullPage: true,
    });

    if (screenshotResult.success) {
      console.log("✅ Screenshot taken:", screenshotResult.data);
    }
  }

  // Clean up
  await callTool("close_browser", { browserId: browserId });
} else {
  console.error("❌ Failed to launch browser:", browserResult.error);
}
```

### Python Integration

```python
import requests
import json

BASE_URL = 'http://localhost:8080'

def call_tool(tool_name, params=None):
    """Call Brooklyn tool via HTTP API"""
    response = requests.post(
        f'{BASE_URL}/tools/{tool_name}',
        headers={'Content-Type': 'application/json'},
        json=params or {}  # Parameters go directly, no "arguments" wrapper
    )
    return response.json()

# Launch browser
browser_result = call_tool('launch_browser', {
    'browserType': 'chromium',
    'headless': True
})

if browser_result['success']:
    browser_id = browser_result['data']['browserId']
    print(f"✅ Browser launched: {browser_id}")

    # Navigate to page
    nav_result = call_tool('navigate_to_url', {
        'browserId': browser_id,
        'url': 'https://example.com'
    })

    if nav_result['success']:
        print("✅ Navigation completed")

        # Take screenshot
        screenshot_result = call_tool('take_screenshot', {
            'browserId': browser_id,
            'fullPage': True
        })

        if screenshot_result['success']:
            print(f"✅ Screenshot taken: {screenshot_result['data']}")

    # Clean up
    call_tool('close_browser', {'browserId': browser_id})
else:
    print(f"❌ Failed to launch browser: {browser_result['error']}")
```

### Tool Discovery in Python

```python
def discover_tools():
    """Discover available Brooklyn tools and their schemas"""
    response = requests.get(f'{BASE_URL}/tools')
    tools_data = response.json()

    for tool in tools_data['data']['tools']:
        print(f"Tool: {tool['name']}")
        print(f"Description: {tool['description']}")
        print(f"Category: {tool['category']}")
        print(f"Required params: {tool['inputSchema'].get('required', [])}")
        print("---")

# Discover all available tools
discover_tools()
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Brooklyn E2E Browser Tests
on: [push, pull_request]

jobs:
  browser-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v1

      - name: Install dependencies
        run: bun install

      - name: Build Brooklyn
        run: bun run build

      - name: Start Brooklyn HTTP Mode (Background)
        run: |
          ./dist/brooklyn mcp dev-http --port 8080 --team-id ci-tests --background
          sleep 3  # Wait for server to start

      - name: Verify Server Health
        run: |
          curl -f http://localhost:8080/health
          echo "✅ Brooklyn HTTP server is healthy"

      - name: Run Browser Automation Tests
        run: |
          # Launch browser and capture browser ID
          BROWSER_RESPONSE=$(curl -s -X POST http://localhost:8080/tools/launch_browser \
            -H "Content-Type: application/json" \
            -d '{"browserType": "chromium", "headless": true}')

          BROWSER_ID=$(echo $BROWSER_RESPONSE | jq -r '.data.browserId')
          echo "Browser launched: $BROWSER_ID"

          # Navigate to test page
          curl -X POST http://localhost:8080/tools/navigate_to_url \
            -H "Content-Type: application/json" \
            -d "{\"browserId\": \"$BROWSER_ID\", \"url\": \"https://httpbin.org\"}"

          # Take screenshot
          curl -X POST http://localhost:8080/tools/take_screenshot \
            -H "Content-Type: application/json" \
            -d "{\"browserId\": \"$BROWSER_ID\", \"fullPage\": true}"

          # Clean up browser
          curl -X POST http://localhost:8080/tools/close_browser \
            -H "Content-Type: application/json" \
            -d "{\"browserId\": \"$BROWSER_ID\"}"

      - name: Cleanup
        run: ./dist/brooklyn mcp dev-http-stop --port 8080
```

### Server Management in CI/CD

```bash
# Start background server (returns immediately)
brooklyn mcp dev-http --port 8080 --team-id ci --background

# Check server status
brooklyn status

# List running HTTP servers
brooklyn mcp dev-http-list

# Stop specific server
brooklyn mcp dev-http-stop --port 8080

# Stop all HTTP servers
brooklyn mcp dev-http-stop --all
```

### Docker Integration

```dockerfile
FROM node:18-slim

# Install Brooklyn
RUN npm install -g brooklyn
RUN brooklyn browser install chromium

# Start HTTP API server
EXPOSE 8080
CMD ["brooklyn", "mcp", "dev-http", "--host", "0.0.0.0", "--port", "8080"]
```

## Available Tool Categories

### Browser Lifecycle

- `launch_browser` - Launch new browser instance
- `close_browser` - Close specific browser
- `list_active_browsers` - List all active browsers

### Navigation

- `navigate_to_url` - Navigate to URL
- `go_back` - Go back in history

### Element Interaction

- `click_element` - Click page element
- `fill_text` - Fill input field
- `fill_form` - Fill multiple form fields

### Content Capture

- `take_screenshot` - Capture page screenshot
- `get_text_content` - Extract text content
- `find_elements` - Find elements by selector

### Onboarding & Status

- `brooklyn_status` - Server status and capabilities
- `brooklyn_capabilities` - Available features
- `brooklyn_getting_started` - Quick start guide

## Error Handling

### HTTP Status Codes

- `200` - Success
- `400` - Bad Request (invalid parameters)
- `404` - Not Found (unknown tool/endpoint)
- `500` - Internal Server Error

### Error Response Format

```json
{
  "success": false,
  "error": "Tool not found: invalid_tool_name",
  "executionTime": 1,
  "timestamp": "2025-07-31T16:58:21.123Z"
}
```

### Common Error Scenarios

#### Tool Not Found

```bash
curl -X POST http://localhost:8080/tools/nonexistent_tool
# Response: 404 with error message
```

#### Invalid Parameters

```bash
curl -X POST http://localhost:8080/tools/launch_browser \
  -d '{"arguments": {"browserType": "invalid"}}'
# Response: 500 with parameter validation error
```

#### Malformed JSON

```bash
curl -X POST http://localhost:8080/tools/launch_browser \
  -d 'invalid json'
# Response: 500 with JSON parsing error
```

## Configuration Options

### Command Line Options

```bash
brooklyn mcp dev-http [options]

Options:
  --port <port>         HTTP server port (default: 8080)
  --host <host>         HTTP server host (default: 0.0.0.0)
  --no-cors            Disable CORS headers
  --team-id <teamId>   Team identifier for HTTP session
  --verbose            Enable verbose logging
```

### Environment Variables

```bash
export BROOKLYN_LOG_LEVEL=debug          # Verbose logging
export BROOKLYN_MAX_BROWSERS=10          # Browser pool limit
export BROOKLYN_BROWSER_TIMEOUT=30000    # Browser operation timeout
```

## Performance Considerations

### Response Times

- Health check: ~2ms
- Tool listing: ~3ms
- Browser operations: 200ms - 2s (depending on complexity)
- Screenshot capture: 500ms - 1s

### Resource Limits

- Maximum 10 concurrent browsers (configurable)
- HTTP request timeout: 30 seconds
- Memory usage: ~180MB with 3 active browsers

### Best Practices

1. **Reuse browsers** when possible instead of launching new ones
2. **Use headless mode** for better performance in CI/CD
3. **Set appropriate timeouts** for long-running operations
4. **Monitor memory usage** with many concurrent browsers
5. **Use connection pooling** for high-frequency API calls

## Security & CORS

### CORS Headers

By default, HTTP mode includes CORS headers for browser testing:

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
```

Disable with `--no-cors` flag for production use.

### Team Isolation

Each HTTP session runs with team-specific context:

- Team ID for resource isolation
- Separate browser pools per team
- Audit logging with team context

## Troubleshooting

### Server Won't Start

```bash
# Check if port is already in use
lsof -i :8080

# Try different port
brooklyn mcp dev-http --port 8081
```

### Tool Execution Failures

```bash
# Check server logs with verbose mode
brooklyn mcp dev-http --verbose

# Verify browser installation
brooklyn browser info
```

### High Memory Usage

```bash
# Monitor browser processes
brooklyn status

# Clean up orphaned browsers
brooklyn cleanup
```

### Connection Issues

```bash
# Test basic connectivity
curl http://localhost:8080/health

# Check CORS headers
curl -H "Origin: http://localhost:3000" http://localhost:8080/health
```

## Comparison with Other Modes

| Feature            | HTTP Mode         | REPL Mode           | MCP Mode                |
| ------------------ | ----------------- | ------------------- | ----------------------- |
| **Use Case**       | CI/CD, Automation | Interactive Testing | Claude Code Integration |
| **Interface**      | REST API          | Command Line        | stdin/stdout            |
| **Concurrency**    | High              | Single Session      | Single Session          |
| **Programmatic**   | ✅                | ❌                  | ❌                      |
| **Human-Friendly** | ❌                | ✅                  | ❌                      |
| **AI-Compatible**  | ✅                | ✅                  | ✅                      |

Choose HTTP mode for:

- ✅ Automated testing in CI/CD pipelines
- ✅ Integration with existing web applications
- ✅ Programmatic browser automation scripts
- ✅ Performance testing and monitoring

Choose REPL mode for:

- ✅ Interactive testing and development
- ✅ Learning Brooklyn's capabilities
- ✅ Debugging automation workflows

Choose MCP mode for:

- ✅ Claude Code integration
- ✅ AI assistant interactions
- ✅ Real-time collaborative development

## HTTP API Translation Guide

### From Brooklyn Tool to HTTP Endpoint

**Step-by-step process for using any Brooklyn tool via HTTP:**

1. **Start HTTP server**: `brooklyn mcp dev-http --port 8080 --background`

2. **Discover available tools**:

   ```bash
   curl -s http://localhost:8080/tools | jq '.data.tools[].name'
   ```

3. **Get tool schema**:

   ```bash
   curl -s http://localhost:8080/tools | jq '.data.tools[] | select(.name == "TOOL_NAME")'
   ```

4. **Translate to HTTP call**:
   - Tool name becomes URL path: `TOOL_NAME` → `/tools/TOOL_NAME`
   - Parameters from schema go directly in JSON body
   - Always use `Content-Type: application/json` header
   - No `"arguments"` wrapper needed

5. **Make the call**:
   ```bash
   curl -X POST http://localhost:8080/tools/TOOL_NAME \
     -H "Content-Type: application/json" \
     -d '{"param1": "value1", "param2": "value2"}'
   ```

### Common Translation Examples

| Brooklyn Tool     | HTTP Endpoint                 | JSON Body                                                    |
| ----------------- | ----------------------------- | ------------------------------------------------------------ |
| `launch_browser`  | `POST /tools/launch_browser`  | `{"browserType": "chromium", "headless": true}`              |
| `navigate_to_url` | `POST /tools/navigate_to_url` | `{"browserId": "browser-123", "url": "https://example.com"}` |
| `take_screenshot` | `POST /tools/take_screenshot` | `{"browserId": "browser-123", "fullPage": true}`             |
| `close_browser`   | `POST /tools/close_browser`   | `{"browserId": "browser-123"}`                               |

### Background Daemon Mode

**Key benefits of background mode:**

- ✅ **Returns terminal control immediately**
- ✅ **Perfect for CI/CD pipelines**
- ✅ **Process management via PID files**
- ✅ **Status monitoring and cleanup tools**

```bash
# Start background server
brooklyn mcp dev-http --port 8080 --team-id my-team --background

# Server starts and CLI returns immediately - terminal is available for other commands

# Check status
brooklyn status  # Shows running HTTP servers

# Stop when done
brooklyn mcp dev-http-stop --port 8080
```

## Networking and Cleanup

### IPv4/IPv6 Binding

- Default bind is IPv4 127.0.0.1 for `brooklyn web start` to avoid localhost → ::1 issues
- Explicit control:
  - Force IPv4: `brooklyn web start --port 3000 --ipv4`
  - Force IPv6: `brooklyn web start --port 3000 --ipv6`
  - Bind all interfaces: `brooklyn web start --port 3000 --host 0.0.0.0`
- If you hit timeouts on `localhost`, try `http://127.0.0.1:3000` to ensure IPv4

### Cleanup Commands

- Global cleanup (HTTP and/or MCP):
  - `brooklyn cleanup --http` — best-effort stop of HTTP servers discovered by the process manager
  - `brooklyn cleanup --http --port 3000` — additionally kill any listeners (IPv4/IPv6) bound to port 3000
  - `brooklyn cleanup --mcp` — MCP stdio cleanup for current project
  - `brooklyn cleanup --mcp-all` — MCP stdio cleanup across all projects
  - Use `--force` to escalate to SIGKILL when needed
- Web-specific cleanup:
  - `brooklyn web cleanup --port 3000` — kill listeners (IPv4/IPv6) on a given port

## Summary

The Brooklyn HTTP API provides:

1. **🚀 Easy server management** with background daemon mode
2. **🔍 Built-in tool discovery** via `/tools` endpoint
3. **📝 Clear parameter translation** from tool schemas to HTTP calls
4. **✅ Production-ready error handling** with structured responses
5. **🛠️ CI/CD integration** with proper process lifecycle management

**For developers**: Start with tool discovery, translate schemas to HTTP calls, always check response `success` field.

**For AI agents**: Use the `/tools` endpoint to discover capabilities, then make direct HTTP calls with proper error handling.

---

**Next Steps**:

- See [Local Development Guide](../user-guide/local-development.md) for REPL mode and development workflows
- Check [Brooklyn Status](../../README.md#current-status) for tool execution issue updates
