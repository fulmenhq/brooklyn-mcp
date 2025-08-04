# Brooklyn Development Modes Overview

Brooklyn provides two powerful development modes for testing and automation without disrupting Claude Code sessions: **REPL Mode** and **HTTP Mode**. Both provide full Brooklyn capabilities with different interfaces optimized for different use cases.

## Development Mode Options

### 🔄 REPL Mode - Interactive Development

**Best for**: Manual testing, learning Brooklyn, debugging automation flows

```bash
brooklyn repl --team-id my-project
brooklyn> launch_browser chromium
brooklyn> navigate_to_url browser-123 https://example.com
brooklyn> take_screenshot browser-123
brooklyn> exit
```

### 🌐 HTTP Mode - Programmatic Access

**Best for**: CI/CD integration, automated testing, API development

```bash
brooklyn mcp dev-http --port 8080 --team-id my-project --background
curl -X POST http://localhost:8080/tools/launch_browser \
  -H "Content-Type: application/json" \
  -d '{"browserType": "chromium", "headless": true}'
```

## Key Features

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

### Use Production MCP for:

✅ **Claude Code integration** via `brooklyn mcp start`  
✅ **AI assistant interactions** and collaborative development  
✅ **Real-time** browser automation with Claude  

## Quick Reference

| Feature | REPL Mode | HTTP Mode | MCP Mode |
|---------|-----------|-----------|----------|
| **Interface** | Interactive CLI | REST API | stdin/stdout |
| **Use Case** | Manual Testing | Automation | AI Integration |
| **Background** | No | Yes (daemon) | No |
| **Programmatic** | No | Yes | No |
| **Learning** | Excellent | Good | Good |
| **CI/CD** | Limited | Excellent | No |

For detailed usage examples, see [usage.md](usage.md).  
For troubleshooting common issues, see [troubleshooting.md](troubleshooting.md).  
For technical architecture details, see [architecture.md](architecture.md).
