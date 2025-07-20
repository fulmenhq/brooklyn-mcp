# Brooklyn Tool Implementation Standards

## Overview

This document defines the standards for implementing tools in the Brooklyn MCP server. These standards ensure consistency, discoverability, and quality across all tool implementations.

## Tool Naming Convention

### Format: `verb_noun_modifier`

**Examples:**
- `launch_browser` - Clear action and target
- `navigate_to_url` - Specific navigation action
- `take_screenshot` - Capture action
- `fill_form_fields` - Specific form action

**Avoid:**
- Technical jargon: `executePlaywrightCommand` ❌
- Ambiguous names: `process`, `handle` ❌  
- Implementation details: `callBrowserPoolManager` ❌
- Overly generic: `do_action` ❌

### Special Prefixes

- `brooklyn_*` - Reserved for meta/discovery tools
- `team_*` - Team-specific tools from plugins
- `test_*` - Testing/debugging tools (dev only)

## Tool Structure

Every tool MUST implement the `EnhancedTool` interface:

```typescript
export interface EnhancedTool extends Tool {
  // Standard MCP fields
  name: string;
  description: string;
  inputSchema: any; // JSON Schema
  
  // Enhanced fields
  category: string;
  examples?: ToolExample[];
  errors?: ToolError[];
}
```

## Required Components

### 1. Clear Description

**Good:**
```typescript
description: "Launch a new browser instance (Chromium, Firefox, or WebKit) with optional configuration"
```

**Bad:**
```typescript
description: "Browser launch" // Too vague
description: "This tool launches a browser" // Redundant
```

### 2. Comprehensive Input Schema

Use JSON Schema with:
- Clear property descriptions
- Proper types and constraints
- Sensible defaults
- Required fields marked

```typescript
inputSchema: {
  type: "object",
  properties: {
    browserType: {
      type: "string",
      enum: ["chromium", "firefox", "webkit"],
      description: "Browser engine to launch",
      default: "chromium"
    },
    headless: {
      type: "boolean", 
      description: "Run browser in headless mode",
      default: true
    }
  },
  required: ["browserType"] // Minimal required fields
}
```

### 3. At Least 2 Examples

Provide realistic examples showing common use cases:

```typescript
examples: [
  {
    description: "Launch headless Chrome for testing",
    input: {
      browserType: "chromium",
      headless: true,
      viewport: { width: 1920, height: 1080 }
    },
    expectedOutput: {
      browserId: "browser-123",
      status: "launched"
    }
  },
  {
    description: "Launch visible Firefox for debugging",
    input: {
      browserType: "firefox", 
      headless: false
    }
  }
]
```

### 4. Common Error Scenarios

Document predictable errors with solutions:

```typescript
errors: [
  {
    code: "BROWSER_LAUNCH_FAILED",
    message: "Failed to launch browser",
    solution: "Ensure browsers are installed via 'brooklyn setup'"
  },
  {
    code: "DOMAIN_NOT_ALLOWED",
    message: "URL domain is not in allowlist",
    solution: "Add domain to BROOKLYN_ALLOWED_DOMAINS"
  }
]
```

## Implementation Pattern

### Basic Structure

```typescript
// In browser-pool-manager.ts or appropriate module
async launchBrowser(args: LaunchBrowserArgs): Promise<LaunchBrowserResult> {
  // 1. Validate inputs
  this.validateBrowserType(args.browserType);
  
  // 2. Check permissions/limits
  await this.security.checkBrowserLimit();
  
  // 3. Execute with proper error handling
  try {
    const browser = await this.pool.launch({
      browserType: args.browserType,
      headless: args.headless ?? true,
      // ... other options
    });
    
    // 4. Track resources
    this.trackBrowser(browser.id);
    
    // 5. Return structured result
    return {
      browserId: browser.id,
      status: "launched",
      browserType: args.browserType,
      launchedAt: new Date().toISOString()
    };
  } catch (error) {
    // 6. Transform errors to user-friendly format
    throw this.transformError(error);
  }
}
```

### Error Handling

Always transform technical errors to user-friendly messages:

```typescript
private transformError(error: unknown): Error {
  if (error instanceof BrowserLimitError) {
    return new Error("Maximum browser limit reached. Close unused browsers or increase BROOKLYN_MAX_BROWSERS");
  }
  
  if (error instanceof PlaywrightError && error.message.includes("executable doesn't exist")) {
    return new Error("Browser not installed. Run 'brooklyn setup' to install browsers");
  }
  
  // Log technical error, return friendly message
  this.logger.error("Browser launch failed", { error });
  return new Error("Failed to launch browser. Check logs for details");
}
```

## Categories

Tools MUST belong to one of these standard categories:

- `browser-lifecycle` - Launch, close, manage browsers
- `navigation` - URL navigation, history control
- `content-capture` - Screenshots, PDFs, content extraction  
- `interaction` - Click, type, form interactions
- `data-extraction` - Structured data extraction
- `wait-sync` - Waiting for conditions
- `discovery` - Tool discovery and help
- `onboarding` - Getting started tools
- `plugin` - Plugin-provided tools

## Security Requirements

### 1. Domain Validation

Navigation tools MUST validate domains:

```typescript
async navigate(args: NavigateArgs): Promise<NavigateResult> {
  // Always validate domain first
  await this.security.validateDomain(args.url);
  
  // Then navigate
  await page.goto(args.url);
}
```

### 2. Resource Cleanup

All tools MUST clean up resources:

```typescript
try {
  // Do work
} finally {
  // Always cleanup, even on error
  await this.cleanup(resourceId);
}
```

### 3. Rate Limiting

Tools respect rate limits automatically via security middleware.

## Testing Requirements

Each tool MUST have:

1. **Unit tests** - Test input validation, error cases
2. **Integration tests** - Test with real browser
3. **Example validation** - Examples must actually work

```typescript
describe("launch_browser", () => {
  it("should validate browser type", async () => {
    await expect(launchBrowser({ browserType: "invalid" }))
      .rejects.toThrow("Invalid browser type");
  });
  
  it("should launch browser successfully", async () => {
    const result = await launchBrowser({ browserType: "chromium" });
    expect(result.browserId).toBeDefined();
    expect(result.status).toBe("launched");
  });
  
  it("should enforce browser limit", async () => {
    // Launch max browsers
    for (let i = 0; i < MAX_BROWSERS; i++) {
      await launchBrowser({ browserType: "chromium" });
    }
    
    // Next should fail
    await expect(launchBrowser({ browserType: "chromium" }))
      .rejects.toThrow("Maximum browser limit reached");
  });
});
```

## Documentation Requirements

### In-Code Documentation

```typescript
/**
 * Launch a new browser instance
 * 
 * @param args - Browser launch configuration
 * @param args.browserType - Browser engine (chromium, firefox, webkit)
 * @param args.headless - Run in headless mode (default: true)
 * @returns Browser instance details including ID for subsequent operations
 * 
 * @throws {BrowserLimitError} When max browser limit reached
 * @throws {BrowserNotInstalledError} When browser executable not found
 */
async launchBrowser(args: LaunchBrowserArgs): Promise<LaunchBrowserResult>
```

### Tool Definition Documentation

The `description` field should be a single, clear sentence that:
- States what the tool does
- Mentions key options/variants
- Avoids redundancy

## Performance Guidelines

1. **Timeout handling** - All operations must have reasonable timeouts
2. **Resource efficiency** - Minimize browser resource usage
3. **Parallel safety** - Tools must be safe for concurrent execution
4. **Progress reporting** - Long operations should report progress

## Versioning & Deprecation

When updating tools:

1. **Backward compatibility** - Don't break existing usage
2. **Deprecation warnings** - Warn before removing features
3. **Migration guides** - Document how to update usage

## Discovery Integration

Every tool is automatically registered with the discovery service, which provides:

- Categorized listing via `brooklyn_list_tools`
- Detailed help via `brooklyn_tool_help`  
- Search functionality
- Documentation generation
- OpenAPI spec generation

## Checklist for New Tools

- [ ] Follows naming convention (`verb_noun_modifier`)
- [ ] Has clear, single-sentence description
- [ ] Comprehensive input schema with descriptions
- [ ] At least 2 realistic examples
- [ ] Common errors documented with solutions
- [ ] Belongs to appropriate category
- [ ] Validates inputs properly
- [ ] Handles errors gracefully
- [ ] Cleans up resources
- [ ] Has unit and integration tests
- [ ] JSDoc documentation complete
- [ ] Security validated (domains, resources)

## Example: Complete Tool Implementation

See `take_screenshot` in `src/core/tool-definitions.ts` for a complete example following all standards.