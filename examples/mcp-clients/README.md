# MCP Client Configuration Examples

Sample configurations for connecting various AI agents to Brooklyn MCP.

## Files

| File                    | Client                                                | Transport  | Status | Description                                                   |
| ----------------------- | ----------------------------------------------------- | ---------- | ------ | ------------------------------------------------------------- |
| `opencode.json`         | [OpenCode](https://opencode.ai)                       | stdio/HTTP | ✅     | Place in project root                                         |
| `claude-code.mcp.json`  | [Claude Code](https://claude.ai/code)                 | stdio/HTTP | ✅     | Use `claude mcp add` or place as `.mcp.json`                  |
| `kilocode.mcp.json`     | [Kilocode](https://kilo.ai)                           | HTTP       | ✅     | Place in `.kilocode/mcp.json` (requires `brooklyn web start`) |
| `codex-cli.config.toml` | [Codex CLI](https://developers.openai.com/codex/cli/) | HTTP       | ✅     | Merge into `~/.codex/config.toml`                             |

## Transport Options

### stdio (terminal-based agents)

- Direct process communication (no HTTP server)
- Best fit for terminal-native MCP clients (e.g., Claude Code when configured with stdio)

### HTTP (browser-based agents)

- Required for browser-based MCP clients (OpenCode, Kilocode)
- Start `brooklyn web start` first

### HTTP (streamable-http)

- Requires `brooklyn web start` running
- Supports multiple concurrent clients
- Auth modes: `required`, `localhost`, `disabled`

## Quick Start

### OpenCode

```bash
# Copy to project root
cp examples/mcp-clients/opencode.json ./opencode.json
```

### Claude Code

```bash
# Via CLI (recommended)
claude mcp add brooklyn brooklyn mcp start

# Or for HTTP transport
claude mcp add -t http brooklyn-http http://127.0.0.1:3000
```

### Kilocode (HTTP only)

```bash
# Start HTTP server first
brooklyn web start --auth-mode localhost

# Copy to .kilocode directory
mkdir -p .kilocode
cp examples/mcp-clients/kilocode.mcp.json .kilocode/mcp.json
```

### Codex CLI (HTTP only)

```bash
# Start HTTP server first
brooklyn web start --auth-mode localhost

# Add to ~/.codex/config.toml
cat examples/mcp-clients/codex-cli.config.toml >> ~/.codex/config.toml
```

> **Note**: Ensure `HTTP_PROXY` is unset when connecting to localhost, as Codex respects proxy environment variables which can interfere with local MCP connections.

## HTTP Server Setup

For HTTP transport, start the server first:

```bash
# Development (localhost bypass)
brooklyn web start --auth-mode localhost

# Production (requires auth)
brooklyn web start --auth-mode required
```

## Environment Variables

| Variable             | Description                              | Default |
| -------------------- | ---------------------------------------- | ------- |
| `BROOKLYN_TEAM_ID`   | Team identifier for multi-tenant setups  | -       |
| `BROOKLYN_LOG_LEVEL` | Log verbosity (debug, info, warn, error) | info    |

## Proxy Configuration (Development/Debugging)

For debugging MCP traffic with a proxy (e.g., mitmproxy, Charles, Fulminar):

### OpenCode

OpenCode respects standard proxy environment variables ([docs](https://opencode.ai/docs/network/)):

```bash
export HTTP_PROXY=http://127.0.0.1:8888
export HTTPS_PROXY=http://127.0.0.1:8888
export NO_PROXY=localhost,127.0.0.1
```

**Caveat:** These vars apply to the ENTIRE communication stack (LLM API calls included), not just MCP traffic. Not practical for MCP-only debugging.

### Claude Code

Claude Code supports proxy via environment variables ([docs](https://code.claude.com/docs/en/network-config)):

```bash
export HTTP_PROXY=http://127.0.0.1:8888
export HTTPS_PROXY=http://127.0.0.1:8888
```

**Known Issues:**

- [#15684](https://github.com/anthropics/claude-code/issues/15684) - VS Code extension may ignore proxy settings
- [#6637](https://github.com/anthropics/claude-code/issues/6637) - HTTP proxy settings inconsistencies

MCP HTTP transport may not route through proxy. Use curl for protocol debugging:

```bash
curl -v --proxy http://127.0.0.1:8888 \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"curl-test","version":"1.0.0"}}}' \
  http://127.0.0.1:3000/mcp
```

### Kilocode (Recommended for MCP debugging)

Kilocode supports per-server proxy configuration - proxies only MCP traffic, not LLM API calls:

```json
{
  "mcpServers": {
    "brooklyn": {
      "type": "streamable-http",
      "url": "http://127.0.0.1:3000/mcp",
      "proxy": "http://127.0.0.1:8888"
    }
  }
}
```

Place in `.kilocode/mcp.json`. See [Kilo Code MCP docs](https://kilo.ai/docs/features/mcp/server-transports) for transport options.

## Troubleshooting

```bash
# Check Brooklyn installation
brooklyn version --extended

# Verify browser setup
brooklyn browser info

# Install browsers if needed
brooklyn setup

# Full diagnostics
brooklyn doctor
```
