/**
 * Enhanced tool definitions with rich metadata for MCP discovery
 * Architecture Committee - Sprint 1 Priority
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";

export interface EnhancedTool extends Tool {
  category: string;
  examples?: Array<{
    description: string;
    input: unknown;
    expectedOutput?: unknown;
  }>;
  errors?: Array<{
    code: string;
    message: string;
    solution: string;
  }>;
}

/**
 * Browser lifecycle tools with examples
 */
export const browserLifecycleTools: EnhancedTool[] = [
  {
    name: "launch_browser",
    category: "browser-lifecycle",
    description:
      "Launch a new browser instance (Chromium, Firefox, or WebKit) with optional configuration",
    inputSchema: {
      type: "object",
      properties: {
        browserType: {
          type: "string",
          enum: ["chromium", "firefox", "webkit"],
          description: "Browser engine to launch",
          default: "chromium",
        },
        headless: {
          type: "boolean",
          description: "Run browser in headless mode",
          default: true,
        },
        viewport: {
          type: "object",
          properties: {
            width: { type: "number", default: 1280 },
            height: { type: "number", default: 720 },
          },
          description: "Browser viewport dimensions",
        },
      },
    },
    examples: [
      {
        description: "Launch headless Chrome for testing",
        input: {
          browserType: "chromium",
          headless: true,
          viewport: { width: 1920, height: 1080 },
        },
        expectedOutput: {
          browserId: "browser-123",
          status: "launched",
          browserType: "chromium",
        },
      },
      {
        description: "Launch visible Firefox for debugging",
        input: {
          browserType: "firefox",
          headless: false,
        },
        expectedOutput: {
          browserId: "browser-456",
          status: "launched",
          browserType: "firefox",
        },
      },
    ],
    errors: [
      {
        code: "BROWSER_LAUNCH_FAILED",
        message: "Failed to launch browser",
        solution: "Ensure browsers are installed via 'brooklyn setup'",
      },
      {
        code: "BROWSER_LIMIT_REACHED",
        message: "Maximum browser limit reached",
        solution: "Close unused browsers or increase BROOKLYN_MAX_BROWSERS",
      },
    ],
  },
  {
    name: "close_browser",
    category: "browser-lifecycle",
    description: "Close a browser instance and release resources",
    inputSchema: {
      type: "object",
      properties: {
        browserId: {
          type: "string",
          description:
            "Optional. ID of the browser to close. If omitted or invalid, the server will resolve based on 'target'.",
        },
        target: {
          type: "string",
          enum: ["latest", "current", "byId"],
          description:
            "Optional targeting strategy when browserId is omitted or invalid. latest: most recently launched active browser (default). current: your last-used browser. byId: require valid browserId.",
          default: "latest",
        },
      },
    },
    examples: [
      {
        description: "Close a browser after testing",
        input: { browserId: "browser-123" },
        expectedOutput: { status: "closed", browserId: "browser-123" },
      },
    ],
  },
  {
    name: "list_active_browsers",
    category: "browser-lifecycle",
    description: "Retrieve a list of all currently active browser instances",
    inputSchema: {
      type: "object",
      properties: {},
    },
    examples: [
      {
        description: "Get all active browsers",
        input: {},
        expectedOutput: {
          browsers: [
            {
              browserId: "browser-123",
              browserType: "chromium",
              headless: true,
              launchedAt: "2024-01-19T10:30:00Z",
              currentUrl: "https://example.com",
            },
          ],
        },
      },
    ],
  },
];

/**
 * Navigation tools with examples
 */
export const navigationTools: EnhancedTool[] = [
  {
    name: "navigate_to_url",
    category: "navigation",
    description:
      "Navigate browser to a specific URL and wait for page load. If browserId is omitted, the most recently launched active browser for your team is used (target=latest).",
    inputSchema: {
      type: "object",
      properties: {
        browserId: {
          type: "string",
          description:
            "Optional. ID of the browser to navigate. If omitted or invalid, the server will resolve based on 'target'.",
        },
        target: {
          type: "string",
          enum: ["latest", "current", "byId"],
          description:
            "Optional targeting strategy when browserId is omitted or invalid. latest: most recently launched active browser (default). current: your last-used browser. byId: require valid browserId.",
          default: "latest",
        },
        url: {
          type: "string",
          description: "URL to navigate to (must be in allowed domains)",
        },
        waitUntil: {
          type: "string",
          enum: ["load", "domcontentloaded", "networkidle"],
          description: "Wait condition for navigation",
          default: "load",
        },
      },
      required: ["url"],
    },
    examples: [
      {
        description: "Navigate using defaults (no browserId) to latest active browser",
        input: {
          url: "https://example.com",
          waitUntil: "networkidle",
        },
        expectedOutput: {
          status: "navigated",
          url: "https://example.com",
          loadTime: 1234,
          browserId: "resolved-latest",
        },
      },
      {
        description: "Navigate by explicit browserId",
        input: {
          browserId: "browser-123",
          url: "https://example.com/docs",
        },
        expectedOutput: {
          status: "navigated",
          url: "https://example.com/docs",
          browserId: "browser-123",
        },
      },
    ],
    errors: [
      {
        code: "DOMAIN_NOT_ALLOWED",
        message: "URL domain is not in allowlist",
        solution: "Add domain to BROOKLYN_ALLOWED_DOMAINS or team config",
      },
      {
        code: "NAVIGATION_TIMEOUT",
        message: "Page load timed out",
        solution: "Increase timeout or check network connectivity",
      },
      {
        code: "NO_ACTIVE_BROWSER",
        message: "No active browser session found to navigate",
        solution: "Run launch_browser first or provide a valid browserId.",
      },
    ],
  },
  {
    name: "go_back",
    category: "navigation",
    description: "Navigate to the previous page in browser history",
    inputSchema: {
      type: "object",
      properties: {
        browserId: {
          type: "string",
          description:
            "Optional. ID of the browser. If omitted or invalid, the server will resolve based on 'target'.",
        },
        target: {
          type: "string",
          enum: ["latest", "current", "byId"],
          description:
            "Optional targeting strategy when browserId is omitted or invalid. latest: most recently launched active browser (default). current: your last-used browser. byId: require valid browserId.",
          default: "latest",
        },
      },
    },
    examples: [
      {
        description: "Go back to previous page",
        input: { browserId: "browser-123" },
        expectedOutput: { status: "navigated_back", url: "https://previous.com" },
      },
    ],
  },
];

/**
 * Content capture tools with examples
 */
export const contentCaptureTools: EnhancedTool[] = [
  {
    name: "take_screenshot",
    category: "content-capture",
    description:
      "Capture a screenshot and store as file to avoid MCP token limits (Architecture Committee approved). If browserId is omitted, the most recently launched active browser for your team is used (target=latest).",
    inputSchema: {
      type: "object",
      properties: {
        browserId: {
          type: "string",
          description:
            "Optional. ID of the browser. If omitted or invalid, the server will resolve based on 'target'.",
        },
        target: {
          type: "string",
          enum: ["latest", "current", "byId"],
          description:
            "Optional targeting strategy when browserId is omitted or invalid. latest: most recently launched active browser (default). current: your last-used browser. byId: require valid browserId.",
          default: "latest",
        },
        fullPage: {
          type: "boolean",
          description: "Capture full page instead of viewport",
          default: false,
        },
        selector: {
          type: "string",
          description: "CSS selector of element to capture (optional)",
        },
        type: {
          type: "string",
          enum: ["png", "jpeg"],
          description: "Screenshot format",
          default: "png",
        },
        quality: {
          type: "number",
          description: "JPEG quality (1-100, ignored for PNG)",
          minimum: 1,
          maximum: 100,
          default: 90,
        },
        returnFormat: {
          type: "string",
          enum: ["file", "url", "base64_thumbnail"],
          description:
            "How to return the screenshot data (file=path, url=HTTP endpoint, base64_thumbnail=small preview)",
          default: "file",
        },
        teamId: {
          type: "string",
          description: "Team identifier for directory isolation and quotas",
        },
        sessionId: {
          type: "string",
          description: "Session identifier for organizing screenshots",
        },
        encryption: {
          type: "boolean",
          description: "Encrypt screenshot at rest (enterprise mode)",
          default: true,
        },
        outputPath: {
          type: "string",
          description: "Custom output path (advanced usage, validated for security)",
        },
        tag: {
          type: "string",
          description:
            "User-provided tag for organizing screenshots (auto-generated if not provided)",
        },
        instanceId: {
          type: "string",
          description: "Override instance detection (advanced usage)",
        },
      },
    },
    examples: [
      {
        description: "Capture full page screenshot with file storage (recommended, no browserId)",
        input: {
          fullPage: true,
          type: "png",
          returnFormat: "file",
          teamId: "blossom-team",
          sessionId: "test-session-1",
        },
        expectedOutput: {
          filePath:
            "/Users/user/.brooklyn/screenshots/blossom-team/sessions/test-session-1/screenshot-2025-01-20T12-00-00-uuid.png",
          filename: "screenshot-2025-01-20T12-00-00-uuid.png",
          format: "png",
          dimensions: { width: 1920, height: 3000 },
          fileSize: 245760,
          auditId: "audit-uuid-123",
          returnFormat: "file",
          browserId: "resolved-latest",
        },
      },
      {
        description: "Capture with base64 thumbnail for backward compatibility",
        input: {
          browserId: "browser-123",
          returnFormat: "base64_thumbnail",
          teamId: "example-team",
        },
        expectedOutput: {
          filePath:
            "/Users/user/.brooklyn/screenshots/example-team/sessions/browser-session-browser-123/screenshot-2025-01-20T12-01-00-uuid.png",
          filename: "screenshot-2025-01-20T12-01-00-uuid.png",
          format: "png",
          dimensions: { width: 1280, height: 720 },
          fileSize: 98304,
          auditId: "audit-uuid-456",
          returnFormat: "base64_thumbnail",
          data: "iVBORw0KGgoAAAANSUhEUgAA...", // Small thumbnail only
        },
      },
      {
        description: "High quality JPEG for documentation",
        input: {
          browserId: "browser-123",
          type: "jpeg",
          quality: 95,
          fullPage: true,
          teamId: "documentation-team",
          sessionId: "docs-capture-1",
        },
        expectedOutput: {
          filePath:
            "/Users/user/.brooklyn/screenshots/documentation-team/sessions/docs-capture-1/screenshot-2025-01-20T12-02-00-uuid.jpeg",
          filename: "screenshot-2025-01-20T12-02-00-uuid.jpeg",
          format: "jpeg",
          dimensions: { width: 1920, height: 4200 },
          fileSize: 512000,
          auditId: "audit-uuid-789",
          returnFormat: "file",
        },
      },
      {
        description: "Organized screenshot with custom tag for multi-instance management",
        input: {
          browserId: "browser-456",
          type: "png",
          tag: "ui-testing-sprint-3",
          teamId: "qa-team",
          sessionId: "automated-tests",
        },
        expectedOutput: {
          filePath:
            "/Users/user/.brooklyn/screenshots/instances/abc123def456/ui-testing-sprint-3/screenshot-2025-01-20T12-03-00-uuid.png",
          filename: "screenshot-2025-01-20T12-03-00-uuid.png",
          format: "png",
          dimensions: { width: 1280, height: 720 },
          fileSize: 156000,
          auditId: "audit-uuid-abc",
          returnFormat: "file",
          instanceId: "abc123def456",
          tag: "ui-testing-sprint-3",
        },
      },
    ],
    errors: [
      {
        code: "BROWSER_NOT_FOUND",
        message: "Browser session not found",
        solution: "Check browserId or launch a new browser first",
      },
      {
        code: "STORAGE_QUOTA_EXCEEDED",
        message: "Screenshot storage quota exceeded",
        solution: "Clean up old screenshots or increase quota limits",
      },
      {
        code: "PATH_TRAVERSAL_DETECTED",
        message: "Security violation in output path",
        solution: "Use relative paths within allowed directories only",
      },
    ],
  },
  {
    name: "list_screenshots",
    category: "content-capture",
    description:
      "Retrieve stored screenshots from the inventory database with filtering and pagination support",
    inputSchema: {
      type: "object",
      properties: {
        instanceId: {
          type: "string",
          description: "Filter by Brooklyn instance ID (defaults to current instance)",
        },
        sessionId: {
          type: "string",
          description: "Filter by browser session ID",
        },
        teamId: {
          type: "string",
          description: "Filter by team ID",
        },
        userId: {
          type: "string",
          description: "Filter by user ID",
        },
        tag: {
          type: "string",
          description: "Filter by user-provided tag (prefix match)",
        },
        format: {
          type: "string",
          enum: ["png", "jpeg"],
          description: "Filter by screenshot format",
        },
        maxAge: {
          type: "number",
          description: "Maximum age in seconds (e.g., 3600 for last hour)",
          minimum: 1,
          maximum: 31536000,
        },
        startDate: {
          type: "string",
          format: "date-time",
          description: "Filter screenshots created after this date (ISO 8601)",
        },
        endDate: {
          type: "string",
          format: "date-time",
          description: "Filter screenshots created before this date (ISO 8601)",
        },
        orderBy: {
          type: "string",
          enum: ["created_at", "file_size", "filename"],
          description: "Field to order results by",
          default: "created_at",
        },
        orderDirection: {
          type: "string",
          enum: ["ASC", "DESC"],
          description: "Sort direction",
          default: "DESC",
        },
        limit: {
          type: "number",
          description: "Maximum number of results (1-100)",
          minimum: 1,
          maximum: 100,
          default: 10,
        },
        offset: {
          type: "number",
          description: "Number of results to skip for pagination",
          minimum: 0,
          default: 0,
        },
      },
    },
    examples: [
      {
        description: "List recent screenshots for current session",
        input: {
          sessionId: "session-123",
          limit: 5,
        },
        expectedOutput: {
          items: [
            {
              id: "screenshot-id-1",
              filename: "screenshot-2025-01-26T10-30-00-abc123.png",
              filePath: "/path/to/screenshot.png",
              sessionId: "session-123",
              browserId: "browser-456",
              format: "png",
              fileSize: 245678,
              width: 1920,
              height: 1080,
              tag: "happy-blue-fox",
              createdAt: "2025-01-26T10:30:00Z",
            },
          ],
          total: 15,
          hasMore: true,
          nextOffset: 5,
        },
      },
      {
        description: "List screenshots by tag from last hour",
        input: {
          tag: "login-test",
          maxAge: 3600,
          orderBy: "file_size",
          orderDirection: "DESC",
        },
        expectedOutput: {
          items: ["..."],
          total: 3,
          hasMore: false,
        },
      },
      {
        description: "List team screenshots with pagination",
        input: {
          teamId: "team-ux",
          limit: 20,
          offset: 40,
        },
        expectedOutput: {
          items: ["..."],
          total: 150,
          hasMore: true,
          nextOffset: 60,
        },
      },
    ],
    errors: [
      {
        code: "DATABASE_ERROR",
        message: "Failed to query screenshot database",
        solution: "Check database status with 'brooklyn ops db status'",
      },
      {
        code: "INVALID_DATE_FORMAT",
        message: "Invalid date format provided",
        solution: "Use ISO 8601 format: YYYY-MM-DDTHH:mm:ssZ",
      },
    ],
  },
  {
    name: "get_screenshot",
    category: "content-capture",
    description:
      "Fetch a specific screenshot by file path or audit ID with metadata. Either 'path' or 'auditId' must be provided.",
    inputSchema: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "File path to the screenshot (optional if auditId provided)",
        },
        auditId: {
          type: "string",
          description: "Unique audit ID of the screenshot to retrieve (optional if path provided)",
        },
      },
    },
    examples: [
      {
        description: "Get screenshot by file path",
        input: {
          path: "/Users/user/.brooklyn/screenshots/team-ux/sessions/session-123/screenshot-2025-01-26T10-30-00-abc123.png",
        },
        expectedOutput: {
          exists: true,
          filePath:
            "/Users/user/.brooklyn/screenshots/team-ux/sessions/session-123/screenshot-2025-01-26T10-30-00-abc123.png",
          fileSize: 245678,
          createdAt: "2025-01-26T10:30:00Z",
          metadataPath:
            "/Users/user/.brooklyn/screenshots/team-ux/sessions/session-123/screenshot-2025-01-26T10-30-00-abc123.metadata.json",
        },
      },
      {
        description: "Get screenshot by audit ID",
        input: {
          auditId: "audit-uuid-abc123",
        },
        expectedOutput: {
          exists: true,
          filePath:
            "/Users/user/.brooklyn/screenshots/team-ux/sessions/session-456/screenshot-2025-01-26T11-15-00-def456.png",
          fileSize: 312456,
          createdAt: "2025-01-26T11:15:00Z",
          metadataPath:
            "/Users/user/.brooklyn/screenshots/team-ux/sessions/session-456/screenshot-2025-01-26T11-15-00-def456.metadata.json",
        },
      },
      {
        description: "Screenshot not found",
        input: {
          auditId: "non-existent-audit-id",
        },
        expectedOutput: {
          exists: false,
        },
      },
    ],
    errors: [
      {
        code: "INVALID_PARAMETERS",
        message: "Either 'path' or 'auditId' must be provided",
        solution: "Provide either a file path or audit ID to retrieve the screenshot",
      },
      {
        code: "FILE_NOT_FOUND",
        message: "Screenshot file not found at specified path",
        solution: "Check the file path or use list_screenshots to find available screenshots",
      },
    ],
  },
  // CSS analysis tools moved here from stylingTools array
  {
    name: "extract_css",
    category: "content-capture",
    description: "Extract CSS styles for an element - understand current state in <1 second",
    inputSchema: {
      type: "object",
      properties: {
        browserId: { type: "string" },
        selector: { type: "string" },
      },
      required: ["selector"],
    },
  },
  {
    name: "get_computed_styles",
    category: "content-capture",
    description: "Get computed styles with inheritance information",
    inputSchema: {
      type: "object",
      properties: {
        browserId: { type: "string" },
        selector: { type: "string" },
      },
      required: ["selector"],
    },
  },
  {
    name: "diff_css",
    category: "content-capture",
    description: "Compare CSS styles to track changes after modifications",
    inputSchema: {
      type: "object",
      properties: {
        browserId: { type: "string" },
        selector: { type: "string" },
        baseline: { type: "object" },
      },
      required: ["selector", "baseline"],
    },
  },
  {
    name: "analyze_specificity",
    category: "content-capture",
    description: "Analyze CSS specificity to debug cascade issues",
    inputSchema: {
      type: "object",
      properties: {
        browserId: { type: "string" },
        selector: { type: "string" },
      },
      required: ["selector"],
    },
  },
];

/**
 * Onboarding and discovery tools
 */
export const discoveryTools: EnhancedTool[] = [
  {
    name: "brooklyn_list_tools",
    category: "discovery",
    description: "Retrieve all available Brooklyn tools organized by category",
    inputSchema: {
      type: "object",
      properties: {
        category: {
          type: "string",
          description: "Filter by specific category (optional)",
        },
        includeExamples: {
          type: "boolean",
          description: "Include usage examples",
          default: true,
        },
      },
    },
    examples: [
      {
        description: "List all browser lifecycle tools",
        input: { category: "browser-lifecycle", includeExamples: true },
        expectedOutput: {
          category: "browser-lifecycle",
          tools: ["launch_browser", "close_browser", "list_active_browsers"],
          count: 3,
        },
      },
    ],
  },
  {
    name: "brooklyn_tool_help",
    category: "discovery",
    description: "Get detailed help and examples for a specific tool",
    inputSchema: {
      type: "object",
      properties: {
        toolName: {
          type: "string",
          description: "Name of the tool to get help for",
        },
      },
      required: ["toolName"],
    },
    examples: [
      {
        description: "Get help for screenshot tool",
        input: { toolName: "take_screenshot" },
        expectedOutput: {
          name: "take_screenshot",
          description: "Capture a screenshot of the current page or specific element",
          category: "content-capture",
          examples: ["..."],
          errors: ["..."],
        },
      },
    ],
  },
];

/**
 * Interaction tools for form automation and UI testing
 */
export const interactionTools: EnhancedTool[] = [
  {
    name: "click_element",
    category: "interaction",
    description: "Click an element on the page using CSS selector",
    inputSchema: {
      type: "object",
      properties: {
        browserId: {
          type: "string",
          description:
            "Optional. ID of the browser instance. If omitted or invalid, the server will resolve based on 'target'.",
        },
        target: {
          type: "string",
          enum: ["latest", "current", "byId"],
          description:
            "Optional targeting strategy when browserId is omitted or invalid. latest: most recently launched active browser (default). current: your last-used browser. byId: require valid browserId.",
          default: "latest",
        },
        selector: {
          type: "string",
          description: "CSS selector for element to click",
        },
        waitForClickable: {
          type: "boolean",
          description: "Wait for element to be clickable before clicking",
          default: true,
        },
        timeout: {
          type: "number",
          description: "Timeout in milliseconds",
          default: 5000,
          minimum: 100,
          maximum: 300000,
        },
      },
      required: ["selector"],
    },
    examples: [
      {
        description: "Click a navigation tab",
        input: {
          browserId: "browser-123",
          selector: "[data-testid='products-tab']",
        },
        expectedOutput: {
          success: true,
          message: "Element clicked successfully",
          selector: "[data-testid='products-tab']",
        },
      },
      {
        description: "Click submit button with custom timeout",
        input: {
          browserId: "browser-123",
          selector: "#submit-form-btn",
          timeout: 10000,
        },
        expectedOutput: {
          success: true,
          message: "Element clicked successfully",
          selector: "#submit-form-btn",
        },
      },
    ],
    errors: [
      {
        code: "ELEMENT_NOT_FOUND",
        message: "Element not found with specified selector",
        solution: "Verify the CSS selector and ensure element exists",
      },
      {
        code: "ELEMENT_NOT_CLICKABLE",
        message: "Element is not clickable (disabled, hidden, or covered)",
        solution: "Wait for element to be enabled or use different selector",
      },
    ],
  },
  {
    name: "fill_text",
    category: "interaction",
    description: "Enter text into an input field using CSS selector",
    inputSchema: {
      type: "object",
      properties: {
        browserId: {
          type: "string",
          description:
            "Optional. ID of the browser instance. If omitted or invalid, the server will resolve based on 'target'.",
        },
        target: {
          type: "string",
          enum: ["latest", "current", "byId"],
          description:
            "Optional targeting strategy when browserId is omitted or invalid. latest: most recently launched active browser (default). current: your last-used browser. byId: require valid browserId.",
          default: "latest",
        },
        selector: {
          type: "string",
          description: "CSS selector for input element",
        },
        text: {
          type: "string",
          description: "Text to enter into the field",
        },
        clearFirst: {
          type: "boolean",
          description: "Clear existing text before filling",
          default: true,
        },
        timeout: {
          type: "number",
          description: "Timeout in milliseconds",
          default: 5000,
          minimum: 100,
          maximum: 300000,
        },
      },
      required: ["selector", "text"],
    },
    examples: [
      {
        description: "Fill operator ID in login form",
        input: {
          browserId: "browser-123",
          selector: "#operatorId",
          text: "driver001",
        },
        expectedOutput: {
          success: true,
          message: "Text filled successfully",
          selector: "#operatorId",
          textLength: 9,
        },
      },
      {
        description: "Fill card number in Collect.js iframe",
        input: {
          browserId: "browser-123",
          selector: "input[name='ccnumber']",
          text: "4111111111111111",
          clearFirst: true,
        },
        expectedOutput: {
          success: true,
          message: "Text filled successfully",
          selector: "input[name='ccnumber']",
          textLength: 16,
        },
      },
    ],
    errors: [
      {
        code: "ELEMENT_NOT_FOUND",
        message: "Input element not found with specified selector",
        solution: "Verify the CSS selector and ensure input element exists",
      },
      {
        code: "ELEMENT_NOT_EDITABLE",
        message: "Element is not editable (disabled or readonly)",
        solution: "Ensure element is enabled and not readonly",
      },
    ],
  },
  {
    name: "fill_form",
    category: "interaction",
    description: "Populate multiple form fields using a field mapping object",
    inputSchema: {
      type: "object",
      properties: {
        browserId: {
          type: "string",
          description:
            "Optional. ID of the browser instance. If omitted or invalid, the server will resolve based on 'target'.",
        },
        target: {
          type: "string",
          enum: ["latest", "current", "byId"],
          description:
            "Optional targeting strategy when browserId is omitted or invalid. latest: most recently launched active browser (default). current: your last-used browser. byId: require valid browserId.",
          default: "latest",
        },
        fieldMapping: {
          type: "object",
          description: "Object mapping CSS selectors to their text values",
          additionalProperties: {
            type: "string",
          },
        },
        timeout: {
          type: "number",
          description: "Timeout in milliseconds for each field",
          default: 5000,
          minimum: 100,
          maximum: 300000,
        },
      },
      required: ["fieldMapping"],
    },
    examples: [
      {
        description: "Fill user login form",
        input: {
          browserId: "browser-123",
          fieldMapping: {
            "#operatorId": "driver001",
            "#password": "testpass123",
          },
        },
        expectedOutput: {
          success: true,
          message: "Form filled successfully",
          fieldsProcessed: 2,
          results: [
            { selector: "#operatorId", success: true, textLength: 9 },
            { selector: "#password", success: true, textLength: 11 },
          ],
        },
      },
      {
        description: "Fill order creation form",
        input: {
          browserId: "browser-123",
          fieldMapping: {
            "#customerId": "CUST-123",
            "#amount": "150.00",
            "#invoiceId": "INV-456",
          },
        },
        expectedOutput: {
          success: true,
          message: "Form filled successfully",
          fieldsProcessed: 3,
          results: [
            { selector: "#customerId", success: true, textLength: 8 },
            { selector: "#amount", success: true, textLength: 6 },
            { selector: "#invoiceId", success: true, textLength: 7 },
          ],
        },
      },
    ],
    errors: [
      {
        code: "PARTIAL_FORM_FILL_FAILURE",
        message: "Some form fields could not be filled",
        solution: "Check individual field results and verify selectors",
      },
    ],
  },
  {
    name: "wait_for_element",
    category: "interaction",
    description: "Wait for an element to appear on the page",
    inputSchema: {
      type: "object",
      properties: {
        browserId: {
          type: "string",
          description:
            "Optional. ID of the browser instance. If omitted or invalid, the server will resolve based on 'target'.",
        },
        target: {
          type: "string",
          enum: ["latest", "current", "byId"],
          description:
            "Optional targeting strategy when browserId is omitted or invalid. latest: most recently launched active browser (default). current: your last-used browser. byId: require valid browserId.",
          default: "latest",
        },
        selector: {
          type: "string",
          description: "CSS selector for element to wait for",
        },
        state: {
          type: "string",
          enum: ["attached", "detached", "visible", "hidden"],
          description: "Element state to wait for",
          default: "visible",
        },
        timeout: {
          type: "number",
          description: "Timeout in milliseconds",
          default: 30000,
          minimum: 100,
          maximum: 300000,
        },
      },
      required: ["selector"],
    },
    examples: [
      {
        description: "Wait for success message",
        input: {
          browserId: "browser-123",
          selector: "[data-testid='form-success']",
          state: "visible",
          timeout: 10000,
        },
        expectedOutput: {
          success: true,
          message: "Element found",
          selector: "[data-testid='form-success']",
          state: "visible",
          waitTime: 2340,
        },
      },
    ],
    errors: [
      {
        code: "WAIT_TIMEOUT",
        message: "Element did not reach expected state within timeout",
        solution: "Increase timeout or verify element selector and expected state",
      },
    ],
  },
  {
    name: "get_text_content",
    category: "interaction",
    description: "Extract text content from an element",
    inputSchema: {
      type: "object",
      properties: {
        browserId: {
          type: "string",
          description:
            "Optional. ID of the browser instance. If omitted or invalid, the server will resolve based on 'target'.",
        },
        target: {
          type: "string",
          enum: ["latest", "current", "byId"],
          description:
            "Optional targeting strategy when browserId is omitted or invalid. latest: most recently launched active browser (default). current: your last-used browser. byId: require valid browserId.",
          default: "latest",
        },
        selector: {
          type: "string",
          description: "CSS selector for element",
        },
        timeout: {
          type: "number",
          description: "Timeout in milliseconds",
          default: 5000,
          minimum: 100,
          maximum: 300000,
        },
      },
      required: ["selector"],
    },
    examples: [
      {
        description: "Get success message text",
        input: {
          browserId: "browser-123",
          selector: "[data-testid='success-message']",
        },
        expectedOutput: {
          success: true,
          textContent: "Form submitted successfully",
          selector: "[data-testid='success-message']",
        },
      },
    ],
    errors: [
      {
        code: "ELEMENT_NOT_FOUND",
        message: "Element not found with specified selector",
        solution: "Verify the CSS selector and ensure element exists",
      },
    ],
  },
  {
    name: "validate_element_presence",
    category: "interaction",
    description: "Verify if an element exists on the page",
    inputSchema: {
      type: "object",
      properties: {
        browserId: {
          type: "string",
          description:
            "Optional. ID of the browser instance. If omitted or invalid, the server will resolve based on 'target'.",
        },
        target: {
          type: "string",
          enum: ["latest", "current", "byId"],
          description:
            "Optional targeting strategy when browserId is omitted or invalid. latest: most recently launched active browser (default). current: your last-used browser. byId: require valid browserId.",
          default: "latest",
        },
        selector: {
          type: "string",
          description: "CSS selector for element",
        },
        shouldExist: {
          type: "boolean",
          description: "Whether element should exist (true) or not exist (false)",
          default: true,
        },
        timeout: {
          type: "number",
          description: "Timeout in milliseconds",
          default: 5000,
          minimum: 100,
          maximum: 300000,
        },
      },
      required: ["selector"],
    },
    examples: [
      {
        description: "Validate error message is not present",
        input: {
          browserId: "browser-123",
          selector: "[data-testid='form-error']",
          shouldExist: false,
        },
        expectedOutput: {
          success: true,
          elementExists: false,
          message: "Element validation passed",
          selector: "[data-testid='form-error']",
        },
      },
    ],
  },
  {
    name: "find_elements",
    category: "interaction",
    description: "Locate all elements matching a CSS selector",
    inputSchema: {
      type: "object",
      properties: {
        browserId: {
          type: "string",
          description:
            "Optional. ID of the browser instance. If omitted or invalid, the server will resolve based on 'target'.",
        },
        target: {
          type: "string",
          enum: ["latest", "current", "byId"],
          description:
            "Optional targeting strategy when browserId is omitted or invalid. latest: most recently launched active browser (default). current: your last-used browser. byId: require valid browserId.",
          default: "latest",
        },
        selector: {
          type: "string",
          description: "CSS selector for elements",
        },
        timeout: {
          type: "number",
          description: "Timeout in milliseconds",
          default: 5000,
          minimum: 100,
          maximum: 300000,
        },
      },
      required: ["selector"],
    },
    examples: [
      {
        description: "Find all navigation tabs",
        input: {
          browserId: "browser-123",
          selector: "[data-testid*='nav-tab']",
        },
        expectedOutput: {
          success: true,
          elements: [
            { selector: "[data-testid='home-nav-tab']", text: "Home" },
            { selector: "[data-testid='products-nav-tab']", text: "Products" },
            { selector: "[data-testid='contact-nav-tab']", text: "Contact" },
          ],
          count: 3,
        },
      },
    ],
  },
  // JavaScript execution tools moved here from javascriptTools array
  {
    name: "execute_script",
    category: "interaction",
    description: "Execute JavaScript in browser context for instant UX modifications",
    inputSchema: {
      type: "object",
      properties: {
        browserId: {
          type: "string",
          description: "Browser instance ID (optional, defaults to latest)",
        },
        script: {
          type: "string",
          description: "JavaScript code to execute",
        },
        args: {
          type: "array",
          description: "Arguments to pass to the script",
          items: {},
        },
        timeout: {
          type: "number",
          description: "Timeout in milliseconds",
          default: 30000,
        },
        awaitPromise: {
          type: "boolean",
          description: "Whether to await Promise results",
          default: false,
        },
      },
      required: ["script"],
    },
    examples: [
      {
        description: "Instantly change button color for UX iteration",
        input: {
          script:
            "document.querySelector('.btn').style.background = 'blue'; return 'Style updated';",
        },
        expectedOutput: {
          success: true,
          result: "Style updated",
          executionTime: 45,
        },
      },
    ],
  },
  {
    name: "evaluate_expression",
    category: "interaction",
    description: "Evaluate JavaScript expression and return its value",
    inputSchema: {
      type: "object",
      properties: {
        browserId: {
          type: "string",
          description: "Browser instance ID (optional, defaults to latest)",
        },
        expression: {
          type: "string",
          description: "JavaScript expression to evaluate",
        },
        timeout: {
          type: "number",
          description: "Timeout in milliseconds",
          default: 30000,
        },
        awaitPromise: {
          type: "boolean",
          description: "Whether to await Promise results",
          default: false,
        },
      },
      required: ["expression"],
    },
    examples: [
      {
        description: "Get computed style value for UX analysis",
        input: {
          expression: "getComputedStyle(document.querySelector('.btn')).backgroundColor",
        },
        expectedOutput: {
          success: true,
          value: "rgb(255, 0, 0)",
          type: "string",
          serializable: true,
        },
      },
    ],
  },
  {
    name: "get_console_messages",
    category: "interaction",
    description: "Get console messages for debugging UX modifications",
    inputSchema: {
      type: "object",
      properties: {
        browserId: {
          type: "string",
          description: "Browser instance ID (optional, defaults to latest)",
        },
        level: {
          type: "string",
          enum: ["log", "info", "warn", "error", "debug"],
          description: "Filter by console message level",
        },
        since: {
          type: "string",
          description: "ISO timestamp to filter messages since",
        },
        limit: {
          type: "number",
          description: "Maximum number of messages to return",
          default: 100,
        },
      },
    },
    examples: [
      {
        description: "Check for JavaScript errors after UX modification",
        input: {
          level: "error",
          limit: 10,
        },
        expectedOutput: {
          messages: [
            {
              type: "error",
              text: "TypeError: Cannot read property 'style' of null",
              timestamp: "2025-01-13T10:30:00.000Z",
            },
          ],
          hasMore: false,
        },
      },
    ],
  },
  {
    name: "add_script_tag",
    category: "interaction",
    description: "Add script tag to inject utilities or libraries",
    inputSchema: {
      type: "object",
      properties: {
        browserId: {
          type: "string",
          description: "Browser instance ID (optional, defaults to latest)",
        },
        content: {
          type: "string",
          description: "JavaScript content to inject",
        },
        url: {
          type: "string",
          description: "External script URL to load",
        },
        type: {
          type: "string",
          description: "Script type attribute",
          default: "text/javascript",
        },
      },
    },
    examples: [
      {
        description: "Inject utility library for UX development",
        input: {
          content:
            "window.uxUtils = { updateStyles: (selector, styles) => { /* utility code */ } };",
        },
        expectedOutput: {
          success: true,
          elementHandle: "script-element",
        },
      },
    ],
  },
];

/**
 * JavaScript execution tools - moved to interactionTools
 * @deprecated Use interactionTools array instead
 */
export const javascriptTools: EnhancedTool[] = [
  // Tools moved to interactionTools array above
];

/**
 * CSS analysis tools - moved to contentCaptureTools
 * @deprecated Use contentCaptureTools array instead
 */
export const stylingTools: EnhancedTool[] = [
  // Tools moved to contentCaptureTools array above
];

/**
 * Get all tools with enhanced metadata
 */
export function getAllTools(): EnhancedTool[] {
  return [
    ...browserLifecycleTools,
    ...navigationTools,
    ...interactionTools,
    ...contentCaptureTools,
    ...javascriptTools,
    ...stylingTools,
    ...discoveryTools,
  ];
}

/**
 * Get tools by category
 */
export function getToolCategories(): string[] {
  return ["browser-lifecycle", "navigation", "interaction", "content-capture", "discovery"];
}
