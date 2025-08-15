# Adding New Commands to Brooklyn MCP Server

**Complete Guide**: From tool definition to integration - preventing registration gaps and ensuring quality.

## 📋 Quick Checklist

### ⚠️ Before You Start

**ALWAYS run this test first** to verify current system integrity:

```bash
bun run test tests/quality-gates/tool-registration-completeness.test.ts
```

If this test fails, **DO NOT add new tools** until existing registration gaps are fixed.

### 🎯 Critical Success Factors

**The #1 reason new tools fail**: Missing core tools registration (Step 6). Your tool will appear in lists but won't be callable.

**Must-Do Steps for Every New Tool:**

1. ✅ **Tool Definition** (`tool-definitions.ts`) - Schema and examples
2. ✅ **Implementation** (service, pool manager, router) - Tool logic
3. 🚨 **Core Registration** (`brooklyn-engine.ts`) - **THIS IS WHERE MOST PEOPLE FAIL**
   - Add to `isCoreTools` array (6a)
   - Add to `handleCoreTool` switch (6b)
4. ✅ **Test Both**: Schema shows in lists AND tool is callable
5. ✅ **Schema Changes**: Use `/mcp` reconnection for new tools

## 🎯 Step-by-Step Process

### Step 1: Design Your Tool

Before writing any code, define:

1. **Purpose**: What does this tool accomplish?
2. **Category**: Which existing category does it fit? (browser-lifecycle, navigation, interaction, content-capture, javascript, styling, discovery, onboarding)
3. **Input Schema**: What parameters does it need?
4. **Output Format**: What does it return?
5. **Error Cases**: How should it fail gracefully?

### Step 2: Add Tool Definition

**File**: `src/core/tool-definitions.ts`

Add your tool to the appropriate category array:

```typescript
// Example: Adding to javascriptTools array
export const javascriptTools: EnhancedTool[] = [
  // ... existing tools
  {
    name: "my_new_tool",
    category: "javascript",
    description: "Clear description of what this tool does",
    inputSchema: {
      type: "object",
      properties: {
        browserId: {
          type: "string",
          description: "Browser instance ID (optional, defaults to latest)",
        },
        myParam: {
          type: "string",
          description: "Description of what this parameter does",
        },
      },
      required: ["myParam"],
    },
    examples: [
      {
        description: "Example usage scenario",
        input: {
          myParam: "example value",
        },
        expectedOutput: {
          success: true,
          result: "expected result format",
        },
      },
    ],
  },
];
```

**📝 New Category?** If you need a new category:

1. Add the category export array (e.g., `export const myNewCategoryTools: EnhancedTool[] = [...]`)
2. Add it to `getAllTools()` function: `...myNewCategoryTools,`
3. Add category metadata to tool listing endpoints

### Step 3: Implement Service Logic (If Needed)

If your tool needs new service functionality:

**Location**: `src/core/[category-name]/` (e.g., `src/core/javascript/`)

Create or extend service classes:

```typescript
// Example: src/core/javascript/my-new-feature.ts
export interface MyNewToolArgs {
  browserId: string;
  myParam: string;
}

export interface MyNewToolResult {
  success: boolean;
  result: string;
}

export class MyFeatureService {
  async executeMyTool(page: Page, args: MyNewToolArgs): Promise<MyNewToolResult> {
    // Implementation here
    return {
      success: true,
      result: "tool result",
    };
  }
}
```

### Step 4: Add Browser Pool Manager Methods

**File**: `src/core/browser-pool-manager.ts`

Add the method that your tool will call:

```typescript
// 1. Add to imports at top
import { MyFeatureService, type MyNewToolArgs, type MyNewToolResult } from "./my-category/my-new-feature.js";

// 2. Add service instance as private property
private myFeatureService: MyFeatureService;

// 3. Initialize in constructor
constructor() {
  // ... existing initialization
  this.myFeatureService = new MyFeatureService();
}

// 4. Add the method
async myNewTool(args: MyNewToolArgs): Promise<MyNewToolResult> {
  const session = this.pool.getSession(args.browserId);
  if (!session) {
    throw new Error(`Browser session not found: ${args.browserId}`);
  }

  return await this.myFeatureService.executeMyTool(session.page, args);
}
```

### Step 5: Add Router Handler

**File**: `src/core/browser/mcp-browser-router.ts`

Add the case to the `dispatch` method switch statement:

```typescript
// In the dispatch method switch statement
case "my_new_tool":
  return await this.myNewTool(params, context);

// Add the private handler method
private async myNewTool(
  params: Record<string, unknown>,
  context: MCPRequestContext
): Promise<unknown> {
  const { browserId, myParam } = params as {
    browserId: string;
    myParam: string;
  };

  if (!myParam) {
    throw new Error("my_new_tool requires 'myParam' parameter");
  }

  const resolvedBrowserId = this.resolveBrowserId(params, context.teamId);
  this.validateBrowserAccess(resolvedBrowserId, context.teamId);

  const result = await this.poolManager.myNewTool({
    browserId: resolvedBrowserId,
    myParam
  });

  return result;
}
```

## 🚨 Step 6: **CRITICAL** - Core Tools Registration

> **⚠️ THIS IS THE #1 REASON NEW TOOLS FAIL**
>
> **Symptoms if you skip this**: Tool appears in `brooklyn_list_tools` but returns "Tool not found" error when called
>
> **Why**: Tool is defined (schema) but not registered (function binding)

**File**: `src/core/brooklyn-engine.ts`

### 6a. **REQUIRED** - Add to `isCoreTools` Array

Find the `isCoreTools` method and add your tool to the appropriate category section:

```typescript
private isCoreTools(toolName: string): boolean {
  const coreTools = [
    // Browser lifecycle
    "launch_browser",
    "close_browser",
    // Navigation
    "navigate_to_url",
    "go_back",
    // Element interaction ← ADD YOUR TOOL HERE IF IT'S INTERACTION
    "click_element",
    "focus_element",  // ← Example: your new tool
    "fill_text",
    // ... other sections
  ];
  return coreTools.includes(toolName);
}
```

### 6b. **REQUIRED** - Add Switch Case to `handleCoreTool`

Find the `handleCoreTool` method and add your case in the appropriate section:

```typescript
// Find the Element interaction tools section
case "click_element":
  // ... existing case

case "my_new_tool":  // ← ADD YOUR CASE HERE
  if (this.browserRouter) {
    const request = {
      tool: name,
      params: args as Record<string, unknown>,
      context: MCPRequestContextFactory.create({
        teamId: context.teamId,
        userId: context.userId,
        metadata: {
          permissions: context.permissions,
          correlationId: context.correlationId,
        },
      }),
    };
    const response = await this.browserRouter.route(request);
    if (!response.success) {
      throw new Error(response.error?.message || `${name} failed`);
    }
    return response.result;
  }
  throw new Error(`${name} requires browser pool connection`);

case "fill_text":
  // ... next case
```

### ✅ Verification Checklist

After completing both 6a and 6b:

- [ ] Tool name added to `isCoreTools` array in correct category section
- [ ] Switch case added to `handleCoreTool` method in correct location
- [ ] Case follows the exact pattern shown above
- [ ] Test: `brooklyn_list_tools` shows your tool
- [ ] Test: Tool is callable via `mcp__brooklyn__your_tool_name`

## 🧪 Step 7: Write Tests

### Unit Tests

**File**: `tests/unit/my-new-tool.test.ts`

```typescript
import { describe, expect, it } from "vitest";
import { MyFeatureService } from "../../src/core/my-category/my-new-feature.js";

describe("MyNewTool", () => {
  it("should execute successfully with valid parameters", async () => {
    const service = new MyFeatureService();
    const mockPage = {} as any; // Create proper mock

    const result = await service.executeMyTool(mockPage, {
      browserId: "test-browser",
      myParam: "test-value",
    });

    expect(result.success).toBe(true);
    expect(result.result).toBe("expected value");
  });
});
```

### Integration Tests

**File**: `tests/integration/my-new-tool-integration.test.ts`

Test the complete flow from MCP call to result.

## 🔍 Step 8: Quality Validation

Run the **complete validation suite**:

```bash
# 1. Run registration completeness test (catches missing registrations)
bun run test tests/quality-gates/tool-registration-completeness.test.ts

# 2. Run all quality checks
bun run check-all

# 3. Run file-level validation on your changes
bun run check:file:fix src/core/tool-definitions.ts
bun run check:file:fix src/core/brooklyn-engine.ts
bun run check:file:fix src/core/browser-pool-manager.ts
bun run check:file:fix src/core/browser/mcp-browser-router.ts

# 4. Verify all tests pass
bun run test
```

## 🚀 Step 9: Test the Tool

### Build and Deploy

```bash
# Build the updated server
bun run version:bump:patch  # For tracking confidence
bun run build && bun run install

# Restart server (HTTP transport)
brooklyn web cleanup --port 3000
brooklyn web start --port 3000 --daemon

# ✅ SCHEMA CHANGES: New tools always need MCP reconnection
# Use Claude Code's built-in reconnection (recommended):
/mcp

# Alternative: Manual remove/add cycle
claude mcp remove brooklyn
claude mcp add brooklyn http://127.0.0.1:3000  # or -- brooklyn mcp start
```

**Why Reconnection is Needed:**

- **Schema changes** (new tools, parameters) require function binding refresh
- **Functionality changes** (bug fixes, performance) auto-detect with HTTP + project scope

### Test in Claude

```bash
# 1. Verify tool appears in listings
# Use: brooklyn_list_tools (should show increased count)

# 2. Get tool documentation
# Use: brooklyn_tool_help my_new_tool

# 3. Test the tool
# Use: my_new_tool with appropriate parameters
```

## 🚨 Common Mistakes to Avoid

### 1. 🥇 Registration Gaps (#1 Cause of Tool Failures)

**THE EXACT BUG WE JUST FIXED**: `focus_element` was properly implemented but missing from core tools registration.

**Symptoms**:

- ✅ Tool appears in `brooklyn_list_tools`
- ❌ Tool returns "Tool not found" when called
- ❌ `mcp__brooklyn__your_tool` function doesn't exist

**Root Causes:**

- ❌ Adding to `tool-definitions.ts` but forgetting `isCoreTools` array (Step 6a)
- ❌ Adding to `isCoreTools` but forgetting `handleCoreTool` switch case (Step 6b)
- ❌ Typos in tool names between definition and registration

**Prevention:**

- ✅ **Always run the registration completeness test**: `bun run test tests/quality-gates/tool-registration-completeness.test.ts`
- ✅ **Use the verification checklist** in Step 6
- ✅ **Test both schema AND function calls** before considering tool complete

### 2. Category Misalignment

- ❌ Tool category doesn't match the array it's added to
- ❌ New category not added to getAllTools()
- ✅ Verify category consistency

### 3. Parameter Validation

- ❌ Not validating required parameters in router handler
- ❌ Missing browser session validation
- ✅ Always validate and provide clear error messages

### 4. TypeScript Issues

- ❌ Using `any` types instead of proper interfaces
- ❌ Missing type imports
- ✅ Define proper interfaces for all parameters and results

### 5. Testing Shortcuts

- ❌ Not testing the complete MCP flow
- ❌ Only testing service logic, not integration
- ✅ Test from MCP call to final result

## 🔧 Debugging New Tools

If your tool returns "Tool not found":

1. **Check registration completeness test**: `bun run test tests/quality-gates/tool-registration-completeness.test.ts`
2. **Verify tool in definitions**: Search tool-definitions.ts for your tool name
3. **Check isCoreTools array**: Your tool must be listed there
4. **Check handleCoreTool switch**: Your tool must have a case
5. **Force cache refresh**: Always remove/add after changes

If your tool is found but fails:

1. **Check router dispatch**: Verify your case is in the switch statement
2. **Check pool manager method**: Verify the method exists and is spelled correctly
3. **Check service implementation**: Test service logic independently
4. **Check parameter validation**: Ensure all required params are validated

## 📊 Registration Completeness Test

**File**: `tests/quality-gates/tool-registration-completeness.test.ts`

This test automatically catches the registration gaps that caused our current issue:

```typescript
describe("Tool Registration Completeness", () => {
  it("should have all tools from getAllTools() in isCoreTools() array", () => {
    // Prevents tools being defined but not classified
  });

  it("should have switch cases for all isCoreTools", () => {
    // Prevents tools being classified but not routed
  });

  it("should have categories for all tool groups", () => {
    // Prevents missing category registrations
  });
});
```

This test runs as part of the regular unit test suite and will **fail the build** if registration gaps exist.

## 🎯 Success Criteria

Your new tool is ready when:

- ✅ Registration completeness test passes
- ✅ All quality checks pass (`bun run check-all`)
- ✅ Tool appears in `brooklyn_list_tools`
- ✅ Tool help works (`brooklyn_tool_help your_tool`)
- ✅ Tool executes successfully with valid parameters
- ✅ Tool fails gracefully with invalid parameters
- ✅ Integration tests pass

## 📚 Reference Examples

For complete examples, see these existing tools:

- **Simple Tool**: `take_screenshot` (content-capture category)
- **Complex Tool**: `execute_script` (javascript category)
- **Multi-Parameter**: `extract_css` (styling category)

Each follows this exact pattern and can serve as a template for your new tools.

---

**Remember**: The registration completeness test is your safety net. Run it first, run it often, and never ignore its failures!
