# Claude MCP Update Standard Operating Procedures

## MCP Message Format Reference

Brooklyn implements the MCP JSON-RPC 2.0 protocol. Key details from debugging Claude integration:

### Initialize Request (from Claude)

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

- Uses id:0 (treated as request, not notification)
- Declares "roots": {} capability
- Protocol version may differ from MCP spec default
- No embedded newlines; terminated by single \n

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
claude mcp add -s user brooklyn brooklyn mcp start
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
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' | brooklyn mcp start
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
claude mcp add -s user brooklyn brooklyn mcp start
# [Restart Claude]
```

---

Last Updated: July 26, 2025
Critical Change: v1.2.17+ implements silent MCP startup
