# MCP Protocol Guide for Brooklyn

This guide covers the Model Context Protocol (MCP) implementation requirements for Brooklyn's transport layers.

## Official Specification References

- **MCP Specification**: https://modelcontextprotocol.io/specification
- **TypeScript SDK**: https://github.com/modelcontextprotocol/typescript-sdk
- **Tool Response Format**: https://github.com/modelcontextprotocol/typescript-sdk (search for "content" examples)

## Critical Message Formats

### Tool Call Request Format

```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "launch_browser",
    "arguments": {
      "headless": true,
      "browserType": "chromium"
    }
  },
  "id": 1
}
```

### Tool Call Response Format (REQUIRED)

**✅ CORRECT - MCP Protocol Format**:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"success\": true, \"browserId\": \"browser-123\"}"
      }
    ]
  }
}
```

**❌ INCORRECT - Brooklyn's Previous Format**:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "success": true,
    "browserId": "browser-123"
  }
}
```

### Key Differences

1. **Content Wrapper**: All tool responses MUST be wrapped in a `content` array
2. **Content Type**: Each content item must specify a `type` (usually "text")
3. **Text Serialization**: Complex objects should be JSON.stringify'd in the text field

## Content Types

### Text Response

```json
{
  "type": "text",
  "text": "Tool execution result or JSON string"
}
```

### Resource Link Response

```json
{
  "type": "resource_link",
  "uri": "file:///path/to/resource",
  "name": "Filename",
  "mimeType": "text/plain",
  "description": "Resource description"
}
```

### Image Response

```json
{
  "type": "image",
  "data": "base64-encoded-image-data",
  "mimeType": "image/png"
}
```

## Transport Implementation Requirements

### stdio Transport

- **MUST** follow exact MCP protocol format
- **MUST NOT** pollute stdout with logs (use stderr or files only)
- **MUST** handle line-buffered JSON-RPC messages
- **MUST** implement proper `content` array wrapping

### HTTP Transport

- **SHOULD** follow MCP protocol format for consistency
- **MAY** be more lenient for Claude Code compatibility
- **MUST** implement proper `content` array wrapping for future compatibility

## Brooklyn-Specific Considerations

### Tool Response Transformation

Brooklyn tools return objects like:

```typescript
{ success: true, browserId: "browser-123", metadata: {...} }
```

These MUST be transformed to MCP format:

```typescript
function toMCPResponse(toolResult: any): MCPToolResponse {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(toolResult),
      },
    ],
  };
}
```

### Error Responses

For tool execution errors, use JSON-RPC error format:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32603,
    "message": "Tool execution failed",
    "data": {
      "toolName": "launch_browser",
      "error": "Browser launch timeout"
    }
  }
}
```

## Testing Protocol Compliance

### Manual Testing

```bash
# Test stdio transport with proper format
echo '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"brooklyn_status","arguments":{}},"id":1}' | brooklyn mcp start --log-level debug
```

### Automated Testing

- Use `scripts/check-mcp-schema-compliance.ts` for tool schema validation
- Use `tests/e2e/mcp-protocol.test.ts` for protocol compliance testing
- Verify responses have proper `content` array structure

## Common Mistakes

1. **Missing Content Wrapper**: Returning raw tool result instead of content array
2. **Wrong Content Type**: Not specifying "text" type for text responses
3. **stdout Pollution**: Logging to stdout in stdio mode breaks protocol
4. **Response Munging**: Over-processing tool results breaks MCP format

## Historical Notes

- **Pre-v1.4.34**: Brooklyn used direct tool result format (worked with HTTP, failed with stdio)
- **v1.4.34+**: Implemented proper MCP content array format for both transports
- **HTTP Transport**: Maintained backward compatibility comments for debugging

## Reference Implementation

See working MCP servers:

- `alexanderop/mcp-server-starter-ts` - Official SDK usage patterns
- `modelcontextprotocol/typescript-sdk` - Reference transport implementations

---

**Remember**: When in doubt, check the official MCP specification and reference implementations. stdio transport is strict about protocol compliance, while HTTP transport may be more forgiving.
