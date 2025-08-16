# Brooklyn Development Modes Overview

Brooklyn provides multiple development and testing modes: **Socket MCP Mode**, **REPL Mode**, and **HTTP Mode**. These are optional tools for debugging and testing, as Brooklyn's standard stdio and HTTP transports work reliably for regular development.

## Development Mode Options

### 🔌 Socket MCP Mode - Native MCP Testing

**Best for**: MCP protocol testing, AI agent development, reliable automation testing

```bash
# Start socket transport (recommended - no hanging issues)
brooklyn mcp dev-start --transport socket

# Test with netcat
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' | nc -U /tmp/brooklyn-socket.sock
echo '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"launch_browser","arguments":{}}}' | nc -U /tmp/brooklyn-socket.sock
```

### 🔄 REPL Mode - Interactive Development

**Best for**: Manual testing, learning Brooklyn, debugging automation flows

```bash
brooklyn mcp dev-repl --team-id my-project
brooklyn> launch_browser chromium
brooklyn> navigate_to_url browser-123 https://example.com
brooklyn> take_screenshot browser-123
brooklyn> exit
```

### 🌐 HTTP Mode - Programmatic Access

**Best for**: CI/CD integration, automated testing, API development

```bash
brooklyn mcp dev-http --port 8080 --team-id my-project
curl -X POST http://localhost:8080/tools/launch_browser \
  -H "Content-Type: application/json" \
  -d '{"browserType": "chromium", "headless": true}'
```

## Key Features

### Socket MCP Mode Features

- **Native MCP protocol** testing with full JSON-RPC compliance
- **Unix domain sockets** - no named pipe hanging issues
- **Reliable transport** - works with `nc`, `socat`, any socket client
- **AI agent development** - perfect for testing MCP integrations
- **Background daemon** with proper process management

### REPL Mode Features

- **Interactive shell** with command completion
- **Real-time testing** of browser automation workflows
- **Direct tool execution** (same as MCP mode)
- **Session state management** maintains browser contexts
- **Learning-friendly** with built-in help system

### HTTP Mode Features

- **Background daemon mode** returns terminal control immediately
- **REST API** for programmatic tool access
- **Built-in tool discovery** via `/tools` endpoint
- **Process management** with PID files and status monitoring
- **CI/CD integration** with proper lifecycle management

## When to Use Each Mode

### Use Socket MCP Mode for:

✅ **MCP protocol debugging** - detailed message flow inspection  
✅ **AI agent development** - testing MCP integrations outside Claude  
✅ **Transport testing** - reliable socket communication  
✅ **Message flow analysis** - debugging JSON-RPC communication

**Note**: Not required for regular Brooklyn development or Claude Code integration.

### Use REPL Mode for:

✅ **Interactive development** and manual testing  
✅ **Learning Brooklyn** capabilities and tool syntax  
✅ **Debugging** specific automation workflows  
✅ **Rapid prototyping** of browser automation scripts

### Use HTTP Mode for:

✅ **CI/CD pipelines** and automated testing  
✅ **Integration** with existing web applications  
✅ **Programmatic access** from scripts and applications  
✅ **Performance testing** and monitoring

### Use Standard Transports for:

✅ **Regular Brooklyn development** - stdio and HTTP both work reliably  
✅ **Claude Code integration** via `brooklyn mcp start`  
✅ **Production deployments** - stable and efficient  
✅ **Day-to-day browser automation** with Claude

## Quick Reference

| Feature          | Socket MCP     | REPL Mode       | HTTP Mode     | Standard (stdio/HTTP) |
| ---------------- | -------------- | --------------- | ------------- | --------------------- |
| **Interface**    | Unix Socket    | Interactive CLI | REST API      | stdin/stdout or HTTP  |
| **Use Case**     | MCP Debugging  | Manual Testing  | Automation    | Regular Development   |
| **Background**   | Yes (daemon)   | No              | Yes (daemon)  | Claude-managed        |
| **Programmatic** | Yes (JSON-RPC) | No              | Yes (REST)    | Yes (MCP)             |
| **Learning**     | Good           | Excellent       | Good          | Good                  |
| **CI/CD**        | Good           | Limited         | Excellent     | Recommended           |
| **Reliability**  | Excellent      | Good            | Excellent     | Excellent             |
| **Required**     | No (optional)  | No (optional)   | No (optional) | Yes (standard)        |

For detailed usage examples, see [usage.md](usage.md).  
For troubleshooting common issues, see [troubleshooting.md](troubleshooting.md).  
For technical architecture details, see [architecture.md](architecture.md).
