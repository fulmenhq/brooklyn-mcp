# MCP JSON Schema Standards

**Version**: 1.0.1  
**Status**: Active  
**Category**: Development Standards  
**Tags**: [mcp, json-schema, claude-code, compatibility, tool-definitions]

---

## Overview

This document defines JSON Schema standards for MCP (Model Context Protocol) tool definitions to ensure compatibility across different MCP clients, particularly Claude Code. These standards prevent schema validation errors and ensure consistent tool behavior.

## Wire vs Internal Field Naming (inputSchema vs input_schema)

To ensure MCP client compatibility while keeping strong TypeScript typings internally:

- Internal (TypeScript) definitions use `inputSchema` (camelCase)
  - Example: `EnhancedTool.inputSchema`
- MCP wire responses (e.g., tools/list over HTTP/JSON-RPC) MUST use `input_schema` (snake_case)
  - This matches the MCP schema reference and avoids client-side capability detection issues

Brooklyn implementation details:

- MCP HTTP transport (`src/transports/http-transport.ts`) normalizes each tool before sending to clients:
  - Emits `input_schema` on the wire (mapping from internal `inputSchema`)
- Brooklyn HTTP JSON-RPC shim (`src/core/brooklyn-http.ts` for `/mcp`) also emits `input_schema`
- REST developer endpoints (`/tools` in dev-http mode) may still show `inputSchema` because they are not MCP wire responses; this is acceptable and intentional for dev ergonomics. MCP endpoints must use `input_schema`.

Guidance:

- Do NOT rename internal fields across the codebase
- Always adapt at the transport boundary for MCP JSON-RPC responses
- Tests that validate wire payloads should assert `input_schema`
- Documentation examples for MCP JSON-RPC must use `input_schema`

## Critical Client Compatibility Requirements

### Claude Code Restrictions

**🚨 BREAKING CONSTRAINT**: Claude Code does not support `oneOf`, `allOf`, or `anyOf` at the **top level** of tool input schemas.

```typescript
// ❌ FORBIDDEN - Will cause API Error 400
inputSchema: {
  type: "object",
  properties: { /* ... */ },
  anyOf: [{ required: ["fieldA"] }, { required: ["fieldB"] }], // ❌ Top-level constraint
}

// ✅ CORRECT - Alternative approaches
inputSchema: {
  type: "object",
  properties: {
    fieldA: {
      type: "string",
      description: "Field A (optional if fieldB provided)",
    },
    fieldB: {
      type: "string", 
      description: "Field B (optional if fieldA provided)",
    },
  },
  // Move validation logic to server-side implementation
}
```

### Nested Schema Constraints

```typescript
// ✅ ALLOWED - oneOf/anyOf within property definitions
properties: {
  target: {
    oneOf: [ // ✅ OK within property
      { enum: ["latest", "current"] },
      { pattern: "^browser-[a-zA-Z0-9]+$" }
    ]
  }
}
```

## Brooklyn Schema Standards

### 1. Tool Definition Structure

```typescript
interface EnhancedTool extends Tool {
  name: string;                    // Tool identifier
  category: string;                // Organizational category
  description: string;             // Clear, action-oriented description
  inputSchema: JSONSchema7;        // Claude Code compatible schema
  examples?: ToolExample[];        // Usage examples (highly recommended)
  errors?: ToolError[];           // Common error scenarios
}
```

### 2. Parameter Design Patterns

#### Optional Parameter Pattern
```typescript
// For tools that accept either parameter A or B
{
  name: "flexible_tool",
  description: "Tool description. Either 'paramA' or 'paramB' must be provided.",
  inputSchema: {
    type: "object",
    properties: {
      paramA: {
        type: "string",
        description: "Parameter A (optional if paramB provided)",
      },
      paramB: {
        type: "string", 
        description: "Parameter B (optional if paramA provided)",
      },
    },
    // No required array - validation handled server-side
  },
}
```

#### Browser Targeting Pattern
```typescript
// Standard pattern for browser-related tools
{
  properties: {
    browserId: {
      type: "string",
      description: "Optional. ID of the browser. If omitted or invalid, the server will resolve based on 'target'.",
    },
    target: {
      type: "string",
      enum: ["latest", "current", "byId"],
      description: "Optional targeting strategy when browserId is omitted or invalid.",
      default: "latest",
    },
  },
}
```

### 3. Description Standards

#### Action-Oriented Descriptions
```typescript
// ✅ GOOD - Clear action and context
"Navigate browser to a specific URL and wait for page load"
"Capture a screenshot and store as file to avoid MCP token limits"
"Extract text content from an element using CSS selector"

// ❌ AVOID - Vague or technical jargon
"URL navigation functionality"
"Screenshot utility"  
"Text extraction"
```

#### Parameter Descriptions
```typescript
properties: {
  selector: {
    type: "string",
    description: "CSS selector for element to capture (optional)", // Clear purpose and optionality
  },
  timeout: {
    type: "number",
    description: "Timeout in milliseconds", // Include units
    default: 5000,                        // Show defaults
    minimum: 100,                         // Include constraints
    maximum: 30000,
  },
}
```

### 4. Category System

**Standard Categories:**
- `browser-lifecycle` - Launch, close, manage browsers
- `navigation` - URL navigation, history management 
- `content-capture` - Screenshots, page content extraction
- `interaction` - Clicking, form filling, waiting
- `discovery` - Tool help, capability discovery

```typescript
// Category naming convention: lowercase-with-hyphens
export const contentCaptureTools: EnhancedTool[] = [
  {
    name: "take_screenshot",
    category: "content-capture", // Consistent category
    // ...
  },
];
```

## Schema Validation Patterns

### 1. Type Safety
```typescript
// ✅ STRICT - Use specific types
type: "string" | "number" | "boolean" | "object" | "array"

// ❌ AVOID - Generic types
type: "any"
```

### 2. Enum Constraints
```typescript
// ✅ GOOD - Explicit allowed values
browserType: {
  type: "string",
  enum: ["chromium", "firefox", "webkit"],
  description: "Browser engine to launch",
  default: "chromium",
}

// ❌ AVOID - Open-ended strings without validation
browserType: {
  type: "string",
  description: "Browser type", // Too vague, no constraints
}
```

### 3. Numeric Constraints
```typescript
quality: {
  type: "number",
  description: "JPEG quality (1-100, ignored for PNG)",
  minimum: 1,      // Always specify ranges
  maximum: 100,
  default: 90,
}
```

### 4. Object Properties
```typescript
viewport: {
  type: "object",
  properties: {
    width: { type: "number", default: 1280 },
    height: { type: "number", default: 720 },
  },
  description: "Browser viewport dimensions",
  // additionalProperties: false, // Consider for strict validation
}
```

## Testing and Validation

### 1. Schema Validation Testing
```typescript
// Test schema compatibility
describe("MCP Schema Compatibility", () => {
  test("tools should not use top-level anyOf/oneOf/allOf", () => {
    const tools = getAllTools();
    
    tools.forEach(tool => {
      const schema = tool.inputSchema;
      expect(schema).not.toHaveProperty("anyOf");
      expect(schema).not.toHaveProperty("oneOf"); 
      expect(schema).not.toHaveProperty("allOf");
    });
  });
  
  test("all tools should have valid JSON schema", () => {
    const tools = getAllTools();
    const validator = ajv.compile(metaSchema);
    
    tools.forEach(tool => {
      const isValid = validator(tool.inputSchema);
      expect(isValid).toBe(true);
    });
  });
});
```

### 2. Claude Code Compatibility Testing
```bash
# Manual testing process
bun run build && bun run install
claude mcp remove brooklyn  
claude mcp add -s user brooklyn brooklyn mcp start
claude mcp list  # Should show no errors

# Test in Claude Code with any command
# Should not see "oneOf, allOf, or anyOf" errors
```

### 3. Tool Definition Validation
```typescript
// Validate tool definitions at build time
export function validateToolDefinitions(tools: EnhancedTool[]): void {
  tools.forEach(tool => {
    // Check required fields
    if (!tool.name || !tool.category || !tool.description) {
      throw new Error(`Invalid tool definition: ${tool.name}`);
    }
    
    // Check schema compliance
    validateSchemaCompliance(tool.inputSchema);
    
    // Check examples if provided
    if (tool.examples) {
      validateExamples(tool, tool.examples);
    }
  });
}
```

## Migration Guidelines

### From Constrained Schemas
When migrating existing tools with `anyOf`/`oneOf`/`allOf` constraints:

1. **Document requirements in description**:
 ```typescript
   description: "Tool description. Either 'paramA' or 'paramB' must be provided."
 ```
2. **Make parameters optional in schema**:
 ```typescript
   // Remove from required array, handle validation server-side
 ```
3. **Add server-side validation**:
 ```typescript
   function validateInput(input: ToolInput): void {
     if (!input.paramA && !input.paramB) {
       throw new Error("Either paramA or paramB must be provided");
     }
   }
 ```

### Schema Evolution
```typescript
// Version your schemas for major changes
interface ToolSchemaV1 {
  // Original schema
}

interface ToolSchemaV2 {
  // Updated schema with backward compatibility
}

// Maintain compatibility handlers
function migrateSchemaV1ToV2(input: ToolSchemaV1): ToolSchemaV2 {
  // Migration logic
}
```

## Common Anti-Patterns

### 1. ❌ Top-Level Constraints
```typescript
// FORBIDDEN
inputSchema: {
  anyOf: [{ required: ["path"] }, { required: ["auditId"] }]
}
```

### 2. ❌ Vague Descriptions 
```typescript
// BAD
description: "Does something with browser"

// GOOD  
description: "Navigate browser to a specific URL and wait for page load"
```

### 3. ❌ Missing Parameter Context
```typescript
// BAD
browserId: {
  type: "string",
  description: "Browser ID", 
}

// GOOD
browserId: {
  type: "string", 
  description: "Optional. ID of the browser. If omitted or invalid, the server will resolve based on 'target'.",
}
```

### 4. ❌ Inconsistent Categorization
```typescript
// BAD - Mixed naming conventions
category: "Browser_Lifecycle"  // PascalCase
category: "content capture"    // spaces
category: "nav"               // abbreviation

// GOOD - Consistent kebab-case  
category: "browser-lifecycle"
category: "content-capture"
category: "navigation"
```

## Best Practices Summary

1. **✅ Never use `anyOf`/`oneOf`/`allOf` at top level of inputSchema**
2. **✅ Move complex validation to server-side implementation** 
3. **✅ Use clear, action-oriented descriptions**
4. **✅ Specify parameter optionality and relationships**
5. **✅ Include examples for complex tools**
6. **✅ Use consistent category naming (kebab-case)**
7. **✅ Add numeric constraints (min/max/default)**
8. **✅ Test schema compatibility during CI/CD**
9. **✅ Document migration paths for breaking changes**
10. **✅ Validate all tool definitions at build time**
11. **✅ Emit `input_schema` on MCP wire responses; keep `inputSchema` internally**

## Error Codes and Solutions

| Error | Cause | Solution |
|-------|-------|----------|
| `oneOf, allOf, or anyOf at the top level` | Top-level schema constraint | Move to server-side validation |
| `Invalid JSON Schema` | Malformed schema structure | Validate with JSON Schema validator |
| `Tool not found` | Missing tool in category exports | Check `getAllTools()` includes tool |
| `Parameter validation failed` | Server-side validation error | Check parameter requirements in description |
| `Schema key mismatch` | Emitting `inputSchema` on the wire | Normalize to `input_schema` at transport boundary |

## Related Documentation

- [Tool Implementation Standards](./tool-implementation-standards.md)
- [MCP Protocol Documentation](https://modelcontextprotocol.io/)
- [JSON Schema Specification](https://json-schema.org/)
- [Brooklyn Tool Definitions](../../../src/core/tool-definitions.ts)
- [HTTP Mode API](../http-mode-api.md) (see MCP examples with `input_schema`)
- [Claude MCP SOP](../claude_mcp_sop.md) (Claude integration specifics)

---

**Compliance Note**: All Brooklyn MCP tools must follow these standards. Schema validation is enforced during build process and CI/CD pipeline.

**Last Updated**: 2025-08-09 by Architect Brooklyn 🏛️  
**Review Cycle**: Monthly during Architecture Committee meetings
