# Brooklyn HTTP Mode API Documentation

**Status**: Phase 3 Complete ✅  
**Version**: 1.3.3  
**Author**: Architect Brooklyn (🏛️)

Brooklyn HTTP Mode provides REST API endpoints for programmatic tool testing and CI/CD integration. This mode enables automated testing of all MCP tools via standard HTTP requests.

## Quick Start

### Starting HTTP Mode

```bash
# Basic usage (default port 8080)
brooklyn mcp dev-http

# Custom configuration
brooklyn mcp dev-http --port 3000 --host localhost --team-id my-team

# With verbose logging
brooklyn mcp dev-http --verbose --no-cors
```

### API Base URL

```
http://localhost:8080  # Default
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

**Request:**

```json
{
  "arguments": {
    "browserType": "chromium",
    "headless": false
  }
}
```

**Response:**

```json
{
  "success": true,
  "data": {
    "browserId": "browser-abc-123",
    "type": "chromium",
    "headless": false,
    "pid": 12345
  },
  "executionTime": 1234,
  "timestamp": "2025-07-31T16:58:21.123Z"
}
```

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
        "inputSchema": { ... }
      }
    ]
  }
}
```

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

### Browser Automation Workflow

```bash
# 1. Start HTTP server
brooklyn mcp dev-http --port 8080

# 2. Launch browser
curl -X POST http://localhost:8080/tools/launch_browser \
  -H "Content-Type: application/json" \
  -d '{"arguments": {"browserType": "chromium", "headless": false}}'

# 3. Navigate to page
curl -X POST http://localhost:8080/tools/navigate_to_url \
  -H "Content-Type: application/json" \
  -d '{"arguments": {"browserId": "browser-abc-123", "url": "https://example.com"}}'

# 4. Take screenshot
curl -X POST http://localhost:8080/tools/take_screenshot \
  -H "Content-Type: application/json" \
  -d '{"arguments": {"browserId": "browser-abc-123", "fullPage": true}}'

# 5. Close browser
curl -X POST http://localhost:8080/tools/close_browser \
  -H "Content-Type: application/json" \
  -d '{"arguments": {"browserId": "browser-abc-123"}}'
```

### Form Automation

```bash
# Fill form fields
curl -X POST http://localhost:8080/tools/fill_form \
  -H "Content-Type: application/json" \
  -d '{
    "arguments": {
      "browserId": "browser-abc-123",
      "fieldMapping": {
        "input[name=\"email\"]": "test@example.com",
        "input[name=\"password\"]": "secretpassword"
      }
    }
  }'

# Submit form
curl -X POST http://localhost:8080/tools/click_element \
  -H "Content-Type: application/json" \
  -d '{
    "arguments": {
      "browserId": "browser-abc-123",
      "selector": "button[type=\"submit\"]"
    }
  }'
```

### JavaScript/Node.js Integration

```javascript
const BASE_URL = "http://localhost:8080";

// Launch browser
const launchResponse = await fetch(`${BASE_URL}/tools/launch_browser`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    arguments: { browserType: "chromium", headless: true },
  }),
});

const { data: browser } = await launchResponse.json();
console.log("Browser launched:", browser.browserId);

// Navigate to page
await fetch(`${BASE_URL}/tools/navigate_to_url`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    arguments: {
      browserId: browser.browserId,
      url: "https://httpbin.org/forms/post",
    },
  }),
});

// Take screenshot
const screenshotResponse = await fetch(`${BASE_URL}/tools/take_screenshot`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    arguments: { browserId: browser.browserId },
  }),
});

const { data: screenshot } = await screenshotResponse.json();
console.log("Screenshot saved:", screenshot.path);
```

### Python Integration

```python
import requests
import json

BASE_URL = 'http://localhost:8080'

def call_tool(tool_name, arguments=None):
    response = requests.post(
        f'{BASE_URL}/tools/{tool_name}',
        headers={'Content-Type': 'application/json'},
        json={'arguments': arguments or {}}
    )
    return response.json()

# Launch browser
browser = call_tool('launch_browser', {
    'browserType': 'chromium',
    'headless': True
})
browser_id = browser['data']['browserId']

# Navigate and interact
call_tool('navigate_to_url', {
    'browserId': browser_id,
    'url': 'https://example.com'
})

call_tool('click_element', {
    'browserId': browser_id,
    'selector': 'a[href="/about"]'
})

# Clean up
call_tool('close_browser', {'browserId': browser_id})
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: E2E Browser Tests
on: [push, pull_request]

jobs:
  browser-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Brooklyn
        run: |
          npm install -g brooklyn
          brooklyn browser install chromium

      - name: Start Brooklyn HTTP Mode
        run: |
          brooklyn mcp dev-http --port 8080 --team-id ci-tests &
          sleep 5  # Wait for server to start

      - name: Run Browser Tests
        run: |
          # Test browser automation
          curl -f -X POST http://localhost:8080/tools/launch_browser \
            -H "Content-Type: application/json" \
            -d '{"arguments": {"browserType": "chromium", "headless": true}}'
            
          # Add more test steps...

      - name: Cleanup
        run: pkill -f "brooklyn mcp dev-http"
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

---

**Next Steps**: See [CI Test Harness Documentation](./ci-test-harness.md) for advanced automation patterns and [Phase 4 Planning](../../.plans/active/architecture-brooklyn/20250731-devmode-refactor.md) for upcoming features.
