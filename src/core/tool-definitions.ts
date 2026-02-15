/**
 * Enhanced tool definitions with rich metadata for MCP discovery
 * Architecture Committee - Sprint 1 Priority
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";

export interface EnhancedTool extends Tool {
  category: string;
  nativeDependencies?: string[];
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
        extraHttpHeaders: {
          type: "object",
          additionalProperties: { type: "string" },
          description:
            "Optional HTTP headers to send with every request (e.g. Authorization, Cookie). Falls back to BROOKLYN_HTTP_HEADERS env var (JSON string) when not provided. Sensitive header values are masked in all log output.",
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
      {
        description: "Launch with auth headers for SaaS dashboard access",
        input: {
          browserType: "chromium",
          headless: true,
          extraHttpHeaders: {
            Authorization: "Bearer <token>",
            "X-API-Key": "<key>",
          },
        },
        expectedOutput: {
          browserId: "browser-789",
          status: "launched",
          browserType: "chromium",
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
  {
    name: "wait_for_url",
    category: "navigation",
    description: "Wait until the current URL matches an exact string or pattern",
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
        exact: {
          type: "string",
          description: "Exact URL to wait for (mutually exclusive with 'pattern')",
        },
        pattern: {
          type: "string",
          description: "Substring or regex pattern string to match against URL",
        },
        timeout: {
          type: "number",
          description: "Timeout in milliseconds",
          default: 30000,
          minimum: 100,
          maximum: 300000,
        },
      },
    },
    examples: [
      {
        description: "Wait for exact docs page URL",
        input: { exact: "https://example.com/docs/intro", timeout: 10000 },
        expectedOutput: {
          success: true,
          url: "https://example.com/docs/intro",
          matched: "exact",
        },
      },
      {
        description: "Wait for URL containing '/dashboard'",
        input: { pattern: "/dashboard", timeout: 15000 },
        expectedOutput: {
          success: true,
          url: "https://example.com/app/dashboard?tab=home",
          matched: "pattern",
        },
      },
    ],
    errors: [
      {
        code: "INVALID_MATCH_CRITERIA",
        message: "Provide exactly one of 'exact' or 'pattern'",
        solution: "Remove the extra field or add the missing one",
      },
      {
        code: "NAVIGATION_TIMEOUT",
        message: "URL did not match within timeout",
        solution: "Increase timeout or verify navigation occurs",
      },
    ],
  },
  {
    name: "wait_for_navigation",
    category: "navigation",
    description: "Wait for a navigation event with a specified readiness state",
    inputSchema: {
      type: "object",
      properties: {
        browserId: { type: "string" },
        target: {
          type: "string",
          enum: ["latest", "current", "byId"],
          default: "latest",
        },
        waitUntil: {
          type: "string",
          enum: ["load", "domcontentloaded", "networkidle"],
          default: "load",
        },
        timeout: { type: "number", default: 30000, minimum: 100, maximum: 300000 },
      },
    },
    examples: [
      {
        description: "Wait for navigation network idle",
        input: { waitUntil: "networkidle" },
        expectedOutput: { success: true, url: "https://example.com/app", state: "networkidle" },
      },
    ],
  },
  {
    name: "wait_for_network_idle",
    category: "navigation",
    description: "Wait until the page reaches network idle state",
    inputSchema: {
      type: "object",
      properties: {
        browserId: { type: "string" },
        target: {
          type: "string",
          enum: ["latest", "current", "byId"],
          default: "latest",
        },
        timeout: { type: "number", default: 30000, minimum: 100, maximum: 300000 },
      },
    },
    examples: [
      {
        description: "Wait for network idle after triggering data load",
        input: { timeout: 20000 },
        expectedOutput: { success: true, state: "networkidle" },
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
    name: "get_layout_tree",
    category: "content-capture",
    description: "Return a bounded layout tree with tag, classes, position, and bounds",
    inputSchema: {
      type: "object",
      properties: {
        browserId: { type: "string" },
        target: { type: "string", enum: ["latest", "current", "byId"], default: "latest" },
        rootSelector: { type: "string", description: "Optional root to start from" },
        maxDepth: { type: "number", default: 3, minimum: 1, maximum: 6 },
        maxChildren: { type: "number", default: 20, minimum: 1, maximum: 200 },
      },
    },
    examples: [
      {
        description: "Get layout tree for main content",
        input: { rootSelector: "main", maxDepth: 3 },
        expectedOutput: { tree: { tag: "main" } },
      },
    ],
  },
  {
    name: "measure_whitespace",
    category: "content-capture",
    description: "Measure vertical whitespace gaps between stacked children in a container",
    inputSchema: {
      type: "object",
      properties: {
        browserId: { type: "string" },
        target: { type: "string", enum: ["latest", "current", "byId"], default: "latest" },
        containerSelector: { type: "string", description: "Container whose children to analyze" },
        minGap: { type: "number", default: 1 },
      },
      required: ["containerSelector"],
    },
    examples: [
      {
        description: "Measure whitespace in content wrapper",
        input: { containerSelector: ".content-wrapper", minGap: 10 },
        expectedOutput: { gaps: [], totalWhitespace: 0 },
      },
    ],
  },
  {
    name: "find_layout_containers",
    category: "content-capture",
    description: "Identify flex, grid, and positioned layout containers with key properties",
    inputSchema: {
      type: "object",
      properties: {
        browserId: { type: "string" },
        target: { type: "string", enum: ["latest", "current", "byId"], default: "latest" },
      },
    },
    examples: [
      {
        description: "List layout containers",
        input: {},
        expectedOutput: { containers: [{ selector: "main", type: "flex" }] },
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
    description: "Extract CSS styles for an element with token limits to prevent overflow",
    inputSchema: {
      type: "object",
      properties: {
        browserId: { type: "string" },
        selector: { type: "string" },
        maxTokens: {
          type: "number",
          description: "Maximum tokens to return (default: 10000)",
          minimum: 100,
          maximum: 50000,
          default: 10000,
        },
        includeComputed: {
          type: "boolean",
          description: "Include computed styles (default: true)",
          default: true,
        },
        includeInherited: {
          type: "boolean",
          description: "Include inherited styles (default: false)",
          default: false,
        },
        properties: {
          type: "array",
          items: { type: "string" },
          description: "Specific CSS properties to extract (default: all)",
        },
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
    description: "Analyze CSS specificity with conflict detection and AI-friendly responses",
    inputSchema: {
      type: "object",
      properties: {
        browserId: {
          type: "string",
          description: "Browser instance ID (optional, defaults to latest)",
        },
        selector: {
          type: "string",
          description: "CSS selector to analyze",
        },
        conflictsOnly: {
          type: "boolean",
          description: "Only show conflicting rules (default: true)",
          default: true,
        },
        properties: {
          type: "array",
          items: { type: "string" },
          description: "Filter to specific CSS properties",
        },
        maxRules: {
          type: "number",
          description: "Limit rules returned (default: 10)",
          default: 10,
        },
        summarize: {
          type: "boolean",
          description: "Summary vs detailed analysis (default: true)",
          default: true,
        },
        includeInherited: {
          type: "boolean",
          description: "Include inherited rules (default: false)",
          default: false,
        },
        pseudoElements: {
          type: "array",
          items: { type: "string" },
          description: "Analyze pseudo-elements like :hover, :focus",
        },
        timeout: {
          type: "number",
          description: "Timeout in milliseconds",
          default: 30000,
        },
      },
      required: ["selector"],
    },
    examples: [
      {
        description: "Find CSS conflicts for a button element",
        input: {
          selector: ".button",
          conflictsOnly: true,
          summarize: true,
        },
        expectedOutput: {
          success: true,
          selector: ".button",
          summary: {
            totalRules: 8,
            conflicts: 2,
            highestSpecificity: [0, 1, 1, 0],
            appliedRule: ".nav .button:hover",
          },
          conflicts: [
            {
              property: "background-color",
              winningRule: {
                selector: ".nav .button:hover",
                specificity: [0, 1, 1, 0],
                value: "blue",
              },
              overriddenRules: [
                {
                  selector: ".button",
                  specificity: [0, 0, 1, 0],
                  value: "red",
                },
              ],
              reason: "Higher specificity",
            },
          ],
          recommendations: [
            "Use .button:hover instead of .nav .button:hover to reduce specificity",
            "Consider using CSS custom properties for theme consistency",
          ],
        },
      },
      {
        description: "Detailed analysis of color properties",
        input: {
          selector: ".text",
          properties: ["color", "background-color"],
          conflictsOnly: false,
          maxRules: 5,
        },
        expectedOutput: {
          success: true,
          selector: ".text",
          summary: {
            totalRules: 3,
            conflicts: 0,
            highestSpecificity: [0, 0, 1, 0],
            appliedRule: ".text",
          },
          rules: [
            {
              selector: ".text",
              specificity: [0, 0, 1, 0],
              properties: {
                color: "black",
                "background-color": "white",
              },
              source: "stylesheet.css",
            },
          ],
        },
      },
    ],
  },
  {
    name: "get_html",
    category: "content-capture",
    description: "Extract HTML content from page or specific element for AI analysis",
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
          description: "CSS selector for specific element (optional, defaults to entire page)",
        },
        includeStyles: {
          type: "boolean",
          description: "Include computed styles in the output",
          default: false,
        },
        prettify: {
          type: "boolean",
          description: "Format HTML for readability",
          default: true,
        },
        timeout: {
          type: "number",
          description: "Timeout in milliseconds",
          default: 5000,
          minimum: 100,
          maximum: 300000,
        },
        maxTokens: {
          type: "number",
          description: "Maximum tokens to allow (uses appropriate tokenizer based on clientModel)",
          minimum: 1000,
          maximum: 200000,
        },
        clientModel: {
          type: "string",
          enum: ["claude", "gpt-4", "gpt-3.5", "default"],
          description:
            "Client model for accurate token counting (default uses conservative limits)",
          default: "default",
        },
      },
    },
    examples: [
      {
        description: "Get entire page HTML for content analysis",
        input: {
          prettify: true,
        },
        expectedOutput: {
          success: true,
          html: "<!DOCTYPE html><html>...</html>",
          source: "full-page",
          length: 15432,
        },
      },
      {
        description: "Extract specific component HTML",
        input: {
          selector: "[data-testid='product-card']",
          includeStyles: true,
        },
        expectedOutput: {
          success: true,
          html: "<div data-testid='product-card'>...</div>",
          source: "[data-testid='product-card']",
          length: 892,
          computedStyles: { display: "flex", flexDirection: "column" },
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
        code: "HTML_EXTRACTION_FAILED",
        message: "Failed to extract HTML content",
        solution: "Check page state and retry operation",
      },
    ],
  },
  {
    name: "describe_html",
    category: "content-capture",
    description: "Analyze page structure and provide actionable insights without token overflow",
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
        maxDepth: {
          type: "number",
          description: "Maximum DOM depth to analyze (optional)",
          default: 20,
        },
        timeout: {
          type: "number",
          description: "Timeout in milliseconds",
          default: 10000,
          minimum: 100,
          maximum: 300000,
        },
      },
    },
    examples: [
      {
        description: "Analyze complex page structure before extraction",
        input: {},
        expectedOutput: {
          success: true,
          pageStats: {
            totalSize: "2.3MB",
            tokenEstimate: 830127,
            domDepth: 15,
            totalElements: 4521,
          },
          structure: {
            sections: [
              {
                selector: "main",
                size: "1.8MB",
                elements: 3102,
                description: "Main content area",
                tokenEstimate: 650000,
              },
            ],
            forms: [
              {
                selector: "#search-form",
                inputs: 3,
                description: "Form: search-form",
                hasPassword: false,
                hasSubmit: true,
              },
            ],
            media: {
              images: 145,
              videos: 8,
              iframes: 12,
            },
          },
          interactiveElements: {
            buttons: 67,
            links: 234,
            inputs: 8,
            selects: 0,
            textareas: 2,
          },
          recommendations: [
            "Page too large (830,127 tokens). Use get_html with specific selectors.",
            "Try extracting: 'main' (1.8MB), 'header' (45KB), 'footer' (120KB)",
            "1 forms found. Use find_elements to locate form inputs.",
            "67 buttons found. Use click_element for interaction.",
          ],
        },
      },
    ],
    errors: [
      {
        code: "PAGE_ANALYSIS_FAILED",
        message: "Failed to analyze page structure",
        solution: "Ensure page is fully loaded and retry",
      },
    ],
  },
  {
    name: "get_attribute",
    category: "content-capture",
    description: "Get attribute value(s) from an element for inspection and validation",
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
          description: "CSS selector for the element",
        },
        attribute: {
          type: "string",
          description: "Specific attribute name to get (optional, returns all if omitted)",
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
        description: "Get specific attribute value",
        input: {
          selector: "#submit-button",
          attribute: "disabled",
        },
        expectedOutput: {
          success: true,
          selector: "#submit-button",
          attribute: "disabled",
          value: null,
          exists: false,
        },
      },
      {
        description: "Get all attributes for element analysis",
        input: {
          selector: "[data-testid='user-avatar']",
        },
        expectedOutput: {
          success: true,
          selector: "[data-testid='user-avatar']",
          attributes: {
            "data-testid": "user-avatar",
            src: "https://example.com/avatar.jpg",
            alt: "User Profile Picture",
            class: "avatar rounded-full",
            width: "64",
            height: "64",
          },
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
    name: "get_bounding_box",
    category: "content-capture",
    description: "Get element geometry and positioning information for layout analysis",
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
          description: "CSS selector for the element",
        },
        includeViewport: {
          type: "boolean",
          description: "Include viewport-relative positioning",
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
        description: "Get element positioning for layout analysis",
        input: {
          selector: ".main-navigation",
          includeViewport: true,
        },
        expectedOutput: {
          success: true,
          selector: ".main-navigation",
          boundingBox: {
            x: 0,
            y: 0,
            width: 1200,
            height: 60,
          },
          viewport: {
            x: 0,
            y: 0,
            visible: true,
          },
          center: {
            x: 600,
            y: 30,
          },
        },
      },
      {
        description: "Check if element is within viewport",
        input: {
          selector: ".footer-content",
        },
        expectedOutput: {
          success: true,
          selector: ".footer-content",
          boundingBox: {
            x: 0,
            y: 2400,
            width: 1200,
            height: 200,
          },
          viewport: {
            x: 0,
            y: 1680,
            visible: false,
          },
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
    name: "is_visible",
    category: "content-capture",
    description: "Check if an element is visible in the viewport for UX validation",
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
          description: "CSS selector for the element",
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
        description: "Check if call-to-action button is visible",
        input: {
          selector: "#cta-button",
        },
        expectedOutput: {
          success: true,
          selector: "#cta-button",
          visible: true,
          inViewport: true,
          opacity: 1,
          display: "block",
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
    name: "is_enabled",
    category: "content-capture",
    description: "Check if an element is enabled and interactive for form validation",
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
          description: "CSS selector for the element",
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
        description: "Check if form submit button is enabled",
        input: {
          selector: "#submit-form",
        },
        expectedOutput: {
          success: true,
          selector: "#submit-form",
          enabled: false,
          disabled: true,
          readonly: false,
          interactive: false,
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
    name: "extract_table_data",
    category: "content-capture",
    description:
      "Extract structured data from an HTML table element. Parses rows and columns including rowspan/colspan into a JSON array of objects (keyed by header) or CSV string. Ideal for analyst workflows extracting data from dashboards and reports.",
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
          description:
            "CSS selector for the table element (e.g. 'table.dashboard-table', '#results-table')",
        },
        format: {
          type: "string",
          enum: ["json", "csv"],
          description:
            "Output format. 'json' returns array of objects keyed by header. 'csv' adds a csv string field.",
          default: "json",
        },
        timeout: {
          type: "number",
          description: "Timeout in milliseconds for locating the table element",
          default: 5000,
          minimum: 100,
          maximum: 300000,
        },
      },
      required: ["selector"],
    },
    examples: [
      {
        description: "Extract dashboard table as JSON",
        input: {
          selector: "table.metrics-table",
        },
        expectedOutput: {
          success: true,
          headers: ["Metric", "Value", "Change"],
          data: [
            { Metric: "Revenue", Value: "$1.2M", Change: "+12%" },
            { Metric: "Users", Value: "45,230", Change: "+5%" },
          ],
          rows: 2,
          columns: 3,
          selector: "table.metrics-table",
          format: "json",
        },
      },
      {
        description: "Extract table as CSV for export",
        input: {
          selector: "#report-table",
          format: "csv",
        },
        expectedOutput: {
          success: true,
          headers: ["Name", "Status", "Date"],
          data: [{ Name: "Task 1", Status: "Done", Date: "2025-01-15" }],
          rows: 1,
          columns: 3,
          selector: "#report-table",
          format: "csv",
          csv: "Name,Status,Date\nTask 1,Done,2025-01-15",
        },
      },
    ],
    errors: [
      {
        code: "ELEMENT_NOT_FOUND",
        message: "Table element not found with specified selector",
        solution:
          "Verify the CSS selector targets a <table> element. Use browser DevTools to inspect the table.",
      },
      {
        code: "BROWSER_NOT_FOUND",
        message: "Browser session not found",
        solution: "Check browserId or launch a new browser first",
      },
    ],
  },
  {
    name: "inspect_network",
    category: "content-capture",
    description:
      "Inspect recent network requests and responses for the browser session. Returns sanitized request/response pairs with sensitive headers redacted by default. Useful for debugging auth flows (e.g. verifying Bearer tokens are being sent). Captures last 50 requests with a 5-minute TTL.",
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
        filter: {
          type: "object",
          description: "Optional filter to narrow results",
          properties: {
            urlPattern: {
              type: "string",
              description: "Filter requests by URL substring match (e.g. '/api/')",
            },
            method: {
              type: "string",
              description: "Filter by HTTP method (e.g. 'GET', 'POST')",
            },
          },
        },
        redact: {
          type: "array",
          items: { type: "string" },
          description:
            "Header names to redact. Defaults to ['Authorization', 'Cookie', 'Set-Cookie', 'Proxy-Authorization', 'X-API-Key', 'X-Auth-Token'].",
        },
        includeRaw: {
          type: "boolean",
          description:
            "Include unredacted header values. Requires BROOKLYN_FULL_HEADER_SUPPORT=true env var. Limited to 10 requests when enabled. An audit log entry is generated.",
          default: false,
        },
      },
    },
    examples: [
      {
        description: "Inspect all recent requests for auth debugging",
        input: {},
        expectedOutput: {
          success: true,
          requests: [
            {
              url: "https://app.example.com/api/data",
              method: "GET",
              requestHeaders: { Authorization: "[REDACTED]", Accept: "application/json" },
              status: 200,
              responseHeaders: { "Content-Type": "application/json" },
              timestamp: "2025-01-20T12:00:00.000Z",
            },
          ],
          count: 1,
          redacted: true,
        },
      },
      {
        description: "Filter requests by URL pattern and method",
        input: {
          filter: { urlPattern: "/api/", method: "POST" },
        },
        expectedOutput: {
          success: true,
          requests: [],
          count: 0,
          redacted: true,
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
        code: "RAW_HEADERS_NOT_ALLOWED",
        message: "includeRaw requires BROOKLYN_FULL_HEADER_SUPPORT=true",
        solution:
          "Set the BROOKLYN_FULL_HEADER_SUPPORT=true environment variable to enable raw header access",
      },
    ],
  },
  {
    name: "paginate_table",
    category: "content-capture",
    description:
      "Automatically paginate through a multi-page table by repeatedly clicking a 'next' button, extracting data from each page, and merging results. Deduplicates rows by content. Requires an explicit nextButton selector (no auto-detect in v0.3.3).",
    inputSchema: {
      type: "object",
      properties: {
        browserId: {
          type: "string",
          description:
            "ID of the browser instance. Required — must be a browser with an already-loaded page containing the table.",
        },
        tableSelector: {
          type: "string",
          description: "CSS selector for the table element to extract from each page",
        },
        nextButton: {
          type: "string",
          description: "CSS selector for the 'next page' button. Must be provided explicitly.",
        },
        maxPages: {
          type: "number",
          description: "Maximum number of pages to paginate through",
          default: 10,
          minimum: 1,
          maximum: 100,
        },
      },
      required: ["browserId", "tableSelector", "nextButton"],
    },
    examples: [
      {
        description: "Paginate through a dashboard table",
        input: {
          browserId: "browser-123",
          tableSelector: "table.results",
          nextButton: "button.next-page",
          maxPages: 5,
        },
        expectedOutput: {
          success: true,
          allData: [
            { Name: "Item 1", Value: "100" },
            { Name: "Item 2", Value: "200" },
          ],
          headers: ["Name", "Value"],
          pages: 3,
          totalRows: 2,
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
        code: "ELEMENT_NOT_FOUND",
        message: "Table or next button element not found",
        solution: "Verify the CSS selectors for the table and next button",
      },
      {
        code: "MAX_PAGES_REACHED",
        message: "Reached maximum page limit",
        solution: "Increase maxPages if more data is needed",
      },
    ],
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
    name: "focus_element",
    category: "interaction",
    description: "Focus an element on the page for accessibility and keyboard navigation",
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
          description: "CSS selector for element to focus",
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
        description: "Focus on an input field for keyboard entry",
        input: {
          browserId: "browser-123",
          selector: "#username",
        },
        expectedOutput: {
          success: true,
          selector: "#username",
          focused: true,
        },
      },
      {
        description: "Focus on a button for keyboard navigation",
        input: {
          browserId: "browser-123",
          selector: ".submit-btn",
          timeout: 3000,
        },
        expectedOutput: {
          success: true,
          selector: ".submit-btn",
          focused: true,
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
        code: "ELEMENT_NOT_FOCUSABLE",
        message: "Element is not focusable (disabled or hidden)",
        solution: "Ensure element is visible and focusable",
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
  {
    name: "hover_element",
    category: "interaction",
    description: "Hover over an element to trigger hover states and CSS transitions",
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
          description: "CSS selector for element to hover over",
        },
        timeout: {
          type: "number",
          description: "Timeout in milliseconds",
          default: 5000,
          minimum: 100,
          maximum: 300000,
        },
        force: {
          type: "boolean",
          description: "Force hover even if element is not actionable",
          default: false,
        },
        position: {
          type: "object",
          properties: {
            x: { type: "number" },
            y: { type: "number" },
          },
          description: "Hover at specific position relative to element (optional)",
        },
        index: {
          type: "number",
          description:
            "Zero-based index of element to hover when selector matches multiple (default: 0)",
          default: 0,
          minimum: 0,
        },
      },
      required: ["selector"],
    },
    examples: [
      {
        description: "Hover over a navigation menu item to reveal dropdown",
        input: {
          selector: "[data-testid='nav-menu-item']",
          timeout: 3000,
        },
        expectedOutput: {
          success: true,
          selector: "[data-testid='nav-menu-item']",
          boundingBox: { x: 100, y: 50, width: 120, height: 30 },
        },
      },
      {
        description: "Hover at specific position on a large element",
        input: {
          selector: ".interactive-canvas",
          position: { x: 50, y: 100 },
        },
        expectedOutput: {
          success: true,
          selector: ".interactive-canvas",
          position: { x: 50, y: 100 },
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
        code: "ELEMENT_NOT_ACTIONABLE",
        message: "Element is not actionable (hidden or covered)",
        solution: "Ensure element is visible or use force: true",
      },
    ],
  },
  {
    name: "select_option",
    category: "interaction",
    description: "Select an option from a dropdown or select element",
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
          description: "CSS selector for the select element",
        },
        value: {
          type: "string",
          description: "Value of the option to select",
        },
        label: {
          type: "string",
          description: "Label text of the option to select (alternative to value)",
        },
        index: {
          type: "number",
          description: "Zero-based index of the option to select (alternative to value/label)",
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
        description: "Select option by value in a country dropdown",
        input: {
          selector: "#country-select",
          value: "US",
          timeout: 3000,
        },
        expectedOutput: {
          success: true,
          selector: "#country-select",
          selectedValue: "US",
          selectedLabel: "United States",
        },
      },
      {
        description: "Select option by label text",
        input: {
          selector: "[data-testid='language-selector']",
          label: "English",
        },
        expectedOutput: {
          success: true,
          selector: "[data-testid='language-selector']",
          selectedValue: "en",
          selectedLabel: "English",
        },
      },
      {
        description: "Select option by index (third option)",
        input: {
          selector: ".priority-dropdown",
          index: 2,
        },
        expectedOutput: {
          success: true,
          selector: ".priority-dropdown",
          selectedValue: "high",
          selectedLabel: "High Priority",
        },
      },
    ],
    errors: [
      {
        code: "SELECT_NOT_FOUND",
        message: "Select element not found with specified selector",
        solution: "Verify the CSS selector targets a <select> element",
      },
      {
        code: "OPTION_NOT_FOUND",
        message: "Option not found with specified value, label, or index",
        solution: "Check available options or use a different selection method",
      },
      {
        code: "SELECT_NOT_ACTIONABLE",
        message: "Select element is disabled or not visible",
        solution: "Ensure the select element is enabled and visible",
      },
    ],
  },
  {
    name: "clear_element",
    category: "interaction",
    description: "Clear the content of an input field, textarea, or editable element",
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
          description: "CSS selector for the element to clear",
        },
        timeout: {
          type: "number",
          description: "Timeout in milliseconds",
          default: 5000,
          minimum: 100,
          maximum: 300000,
        },
        force: {
          type: "boolean",
          description: "Force clear even if element is not actionable",
          default: false,
        },
      },
      required: ["selector"],
    },
    examples: [
      {
        description: "Clear a search input field",
        input: {
          selector: "#search-input",
          timeout: 3000,
        },
        expectedOutput: {
          success: true,
          selector: "#search-input",
          cleared: true,
          previousValue: "previous search terms",
        },
      },
      {
        description: "Clear a textarea with force option",
        input: {
          selector: "[data-testid='comment-textarea']",
          force: true,
        },
        expectedOutput: {
          success: true,
          selector: "[data-testid='comment-textarea']",
          cleared: true,
          previousValue: "draft comment text",
        },
      },
      {
        description: "Clear a contenteditable element",
        input: {
          selector: ".rich-text-editor[contenteditable='true']",
        },
        expectedOutput: {
          success: true,
          selector: ".rich-text-editor[contenteditable='true']",
          cleared: true,
          previousValue: "rich text content",
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
        code: "ELEMENT_NOT_CLEARABLE",
        message: "Element is not an input, textarea, or contenteditable",
        solution: "Use a selector that targets a clearable element type",
      },
      {
        code: "ELEMENT_NOT_ACTIONABLE",
        message: "Element is disabled or not visible",
        solution: "Ensure element is enabled and visible, or use force: true",
      },
    ],
  },
  {
    name: "drag_and_drop",
    category: "interaction",
    description: "Drag an element from a source location to a target location",
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
        sourceSelector: {
          type: "string",
          description: "CSS selector for the element to drag",
        },
        targetSelector: {
          type: "string",
          description: "CSS selector for the drop target element",
        },
        sourcePosition: {
          type: "object",
          properties: {
            x: { type: "number" },
            y: { type: "number" },
          },
          description: "Specific position within source element to start drag (optional)",
        },
        targetPosition: {
          type: "object",
          properties: {
            x: { type: "number" },
            y: { type: "number" },
          },
          description: "Specific position within target element to drop (optional)",
        },
        timeout: {
          type: "number",
          description: "Timeout in milliseconds",
          default: 5000,
          minimum: 100,
          maximum: 300000,
        },
        force: {
          type: "boolean",
          description: "Force drag even if elements are not actionable",
          default: false,
        },
      },
      required: ["sourceSelector", "targetSelector"],
    },
    examples: [
      {
        description: "Drag a file from list to upload area",
        input: {
          sourceSelector: "[data-file-id='document.pdf']",
          targetSelector: "#upload-dropzone",
          timeout: 3000,
        },
        expectedOutput: {
          success: true,
          sourceSelector: "[data-file-id='document.pdf']",
          targetSelector: "#upload-dropzone",
          dragCompleted: true,
        },
      },
      {
        description: "Drag task card to different column in kanban board",
        input: {
          sourceSelector: "[data-task-id='TASK-123']",
          targetSelector: "[data-column='in-progress']",
          sourcePosition: { x: 10, y: 10 },
          targetPosition: { x: 50, y: 20 },
        },
        expectedOutput: {
          success: true,
          sourceSelector: "[data-task-id='TASK-123']",
          targetSelector: "[data-column='in-progress']",
          dragCompleted: true,
        },
      },
      {
        description: "Drag slider handle to adjust value",
        input: {
          sourceSelector: ".slider-handle",
          targetSelector: ".slider-track",
          targetPosition: { x: 75, y: 0 },
          force: true,
        },
        expectedOutput: {
          success: true,
          sourceSelector: ".slider-handle",
          targetSelector: ".slider-track",
          dragCompleted: true,
        },
      },
    ],
    errors: [
      {
        code: "SOURCE_NOT_FOUND",
        message: "Source element not found with specified selector",
        solution: "Verify the source CSS selector and ensure element exists",
      },
      {
        code: "TARGET_NOT_FOUND",
        message: "Target element not found with specified selector",
        solution: "Verify the target CSS selector and ensure element exists",
      },
      {
        code: "DRAG_NOT_ACTIONABLE",
        message: "Source or target element is not actionable for drag operations",
        solution: "Ensure elements are visible and enabled, or use force: true",
      },
      {
        code: "DRAG_OPERATION_FAILED",
        message: "Drag and drop operation failed to complete",
        solution: "Check if elements support drag/drop events or adjust positioning",
      },
    ],
  },
  {
    name: "generate_selector",
    category: "interaction",
    description: "Generate robust CSS selectors from natural language descriptions",
    inputSchema: {
      type: "object",
      properties: {
        browserId: {
          type: "string",
          description: "Browser instance ID (optional, defaults to latest)",
        },
        description: {
          type: "string",
          description: "Natural language description of element to find",
        },
        context: {
          type: "string",
          description: "Parent element context for scoping",
        },
        preferStable: {
          type: "boolean",
          description: "Prefer data-* attributes over classes (default: true)",
          default: true,
        },
        maxSelectors: {
          type: "number",
          description: "Maximum number of selectors to return (default: 5)",
          default: 5,
        },
        timeout: {
          type: "number",
          description: "Timeout in milliseconds",
          default: 30000,
        },
      },
      required: ["description"],
    },
    examples: [
      {
        description: "Find a blue submit button",
        input: {
          description: "the blue submit button",
          preferStable: true,
        },
        expectedOutput: {
          success: true,
          description: "the blue submit button",
          selectors: [
            {
              selector: '[data-action="submit"]',
              confidence: 0.9,
              stability: "high",
              matches: 1,
              description: "Matches 1 element",
              reasoning: "Selected based on stable data attributes with high confidence match",
            },
            {
              selector: 'button[type="submit"]',
              confidence: 0.8,
              stability: "medium",
              matches: 1,
              description: "Matches 1 element",
              reasoning: "Selected based on semantic HTML element with good confidence match",
            },
          ],
          recommendations: [],
        },
      },
      {
        description: "Find navigation menu with context",
        input: {
          description: "main navigation menu",
          context: "header",
          maxSelectors: 3,
        },
        expectedOutput: {
          success: true,
          description: "main navigation menu",
          selectors: [
            {
              selector: 'header nav[role="navigation"]',
              confidence: 0.95,
              stability: "high",
              matches: 1,
              description: "Matches 1 element",
              reasoning: "Selected based on accessibility attributes with high confidence match",
            },
            {
              selector: "header .navbar",
              confidence: 0.7,
              stability: "low",
              matches: 1,
              description: "Matches 1 element",
              reasoning: "Selected based on CSS class matching description",
            },
          ],
          recommendations: ["Consider adding data-testid attributes for better stability"],
        },
      },
    ],
  },
  {
    name: "scroll_into_view",
    category: "interaction",
    description: "Scroll the page so that the element is visible in the viewport",
    inputSchema: {
      type: "object",
      properties: {
        browserId: { type: "string" },
        target: {
          type: "string",
          enum: ["latest", "current", "byId"],
          default: "latest",
        },
        selector: { type: "string", description: "CSS selector of the element" },
        timeout: { type: "number", default: 5000, minimum: 100, maximum: 300000 },
      },
      required: ["selector"],
    },
    examples: [
      {
        description: "Scroll a CTA button into view",
        input: { selector: ".cta-button" },
        expectedOutput: { success: true, selector: ".cta-button" },
      },
    ],
  },
  {
    name: "scroll_to",
    category: "interaction",
    description: "Scroll to an absolute page position",
    inputSchema: {
      type: "object",
      properties: {
        browserId: { type: "string" },
        target: { type: "string", enum: ["latest", "current", "byId"], default: "latest" },
        x: { type: "number", description: "Horizontal scroll position" },
        y: { type: "number", description: "Vertical scroll position" },
        behavior: { type: "string", enum: ["auto", "smooth"], default: "auto" },
      },
      required: ["x", "y"],
    },
  },
  {
    name: "scroll_by",
    category: "interaction",
    description: "Scroll by a relative offset",
    inputSchema: {
      type: "object",
      properties: {
        browserId: { type: "string" },
        target: { type: "string", enum: ["latest", "current", "byId"], default: "latest" },
        dx: { type: "number", description: "Delta X" },
        dy: { type: "number", description: "Delta Y" },
        behavior: { type: "string", enum: ["auto", "smooth"], default: "auto" },
      },
      required: ["dx", "dy"],
    },
  },
  {
    name: "highlight_element_bounds",
    category: "interaction",
    description: "Overlay a visual highlight around the element bounds for layout debugging",
    inputSchema: {
      type: "object",
      properties: {
        browserId: { type: "string" },
        target: { type: "string", enum: ["latest", "current", "byId"], default: "latest" },
        selector: { type: "string" },
        options: {
          type: "object",
          properties: {
            color: { type: "string", default: "rgba(255,0,0,0.35)" },
            outline: { type: "string", default: "2px solid rgba(255,0,0,0.9)" },
            showMargin: { type: "boolean", default: false },
            showPadding: { type: "boolean", default: false },
          },
        },
        timeout: { type: "number", default: 5000 },
      },
      required: ["selector"],
    },
    examples: [
      {
        description: "Highlight main frame bounds",
        input: { selector: ".main-frame" },
        expectedOutput: {
          success: true,
          highlightId: "overlay-123",
          bounds: { x: 0, y: 592, width: 1280, height: 11482 },
        },
      },
    ],
  },
  {
    name: "show_layout_grid",
    category: "interaction",
    description: "Overlay a page-wide grid to aid layout analysis",
    inputSchema: {
      type: "object",
      properties: {
        browserId: { type: "string" },
        target: { type: "string", enum: ["latest", "current", "byId"], default: "latest" },
        gridSize: { type: "number", default: 20 },
        color: { type: "string", default: "rgba(255,0,0,0.3)" },
      },
    },
    examples: [
      {
        description: "Show a 20px layout grid",
        input: { gridSize: 20 },
        expectedOutput: { success: true, overlayId: "grid-xyz", gridSize: 20 },
      },
    ],
  },
  {
    name: "remove_overlay",
    category: "interaction",
    description: "Remove a previously added visual overlay by ID",
    inputSchema: {
      type: "object",
      properties: {
        browserId: { type: "string" },
        target: { type: "string", enum: ["latest", "current", "byId"], default: "latest" },
        overlayId: { type: "string", description: "ID returned by overlay tools" },
      },
      required: ["overlayId"],
    },
    examples: [
      {
        description: "Remove a highlight overlay",
        input: { overlayId: "overlay-123" },
        expectedOutput: { success: true, removed: true },
      },
    ],
  },
];

/**
 * Styling tools extensions (CSS Overrides)
 */

/**
 * Image Processing Tools - Brooklyn MCP v1.6.0
 * Enterprise-grade image processing and optimization for AI development workflows
 */
export const imageProcessingTools: EnhancedTool[] = [
  {
    name: "compress_svg",
    category: "image-processing",
    nativeDependencies: ["svgo"],
    description:
      "Compress SVG files to reduce size while preserving visual quality. Essential for optimizing documentation diagrams and design assets. Requires SVGO library.",
    inputSchema: {
      type: "object",
      properties: {
        filePath: {
          type: "string",
          description: "Path to the SVG file to compress",
        },
        outputPath: {
          type: "string",
          description:
            "Optional output path for compressed SVG. If not provided, adds '-compressed' suffix to original filename",
        },
        compressionLevel: {
          type: "number",
          minimum: 1,
          maximum: 10,
          default: 5,
          description: "Compression intensity: 1 (light) to 10 (aggressive)",
        },
        removeMetadata: {
          type: "boolean",
          default: true,
          description: "Remove metadata to reduce file size",
        },
        simplifyPaths: {
          type: "boolean",
          default: true,
          description: "Simplify path data for smaller file size",
        },
        preserveIds: {
          type: "boolean",
          default: true,
          description: "Preserve element IDs for JavaScript/CSS targeting",
        },
      },
      required: ["filePath"],
    },
    examples: [
      {
        description: "Compress a Mermaid diagram SVG with standard settings",
        input: {
          filePath: "/path/to/architecture-diagram.svg",
          compressionLevel: 5,
        },
        expectedOutput: {
          success: true,
          originalSize: 15420,
          compressedSize: 8934,
          compressionRatio: 42.1,
          outputPath: "/path/to/architecture-diagram-compressed.svg",
        },
      },
      {
        description: "Aggressive compression for maximum size reduction",
        input: {
          filePath: "/path/to/complex-logo.svg",
          compressionLevel: 9,
          removeMetadata: true,
          simplifyPaths: true,
          preserveIds: false,
        },
        expectedOutput: {
          success: true,
          compressionRatio: 67.3,
        },
      },
    ],
  },
  {
    name: "analyze_svg",
    category: "image-processing",
    nativeDependencies: ["svgo"],
    description:
      "Analyze SVG file complexity and get optimization recommendations. Useful for understanding SVG structure before compression. Requires SVGO library.",
    inputSchema: {
      type: "object",
      properties: {
        filePath: {
          type: "string",
          description: "Path to the SVG file to analyze",
        },
      },
      required: ["filePath"],
    },
    examples: [
      {
        description: "Analyze a complex SVG file for optimization opportunities",
        input: {
          filePath: "/path/to/design-system-icons.svg",
        },
        expectedOutput: {
          success: true,
          fileSize: 23450,
          elementCount: 156,
          pathCount: 89,
          complexityScore: 72,
          recommendations: [
            "Remove metadata to reduce file size",
            "Consider simplifying complex paths",
            "High element count - consider grouping or simplification",
          ],
          hasMetadata: true,
          hasComments: false,
        },
      },
    ],
  },
  {
    name: "convert_svg_to_png",
    category: "image-processing",
    description:
      "Convert SVG files to high-quality PNG images with configurable dimensions and quality. Uses headless browser rendering for accurate results.",
    inputSchema: {
      type: "object",
      properties: {
        svgPath: {
          type: "string",
          description: "Path to the SVG file to convert",
        },
        outputPath: {
          type: "string",
          description:
            "Optional output path for PNG file. If not provided, replaces SVG extension with .png",
        },
        width: {
          type: "number",
          minimum: 1,
          maximum: 8192,
          description: "Output width in pixels",
        },
        height: {
          type: "number",
          minimum: 1,
          maximum: 8192,
          description: "Output height in pixels",
        },
        quality: {
          type: "number",
          minimum: 1,
          maximum: 100,
          default: 90,
          description: "PNG quality (1-100)",
        },
        dpi: {
          type: "number",
          default: 96,
          description: "Target DPI for output image",
        },
        backgroundColor: {
          type: "string",
          description: "Background color for transparent SVGs (e.g., '#ffffff', 'white')",
        },
        maintainAspectRatio: {
          type: "boolean",
          default: true,
          description: "Maintain original aspect ratio when resizing",
        },
      },
      required: ["svgPath"],
    },
    examples: [
      {
        description: "Convert SVG logo to high-resolution PNG",
        input: {
          svgPath: "/path/to/company-logo.svg",
          width: 512,
          height: 512,
          quality: 95,
          backgroundColor: "white",
        },
        expectedOutput: {
          success: true,
          outputPath: "/path/to/company-logo.png",
          outputSize: 89234,
          dimensions: { width: 512, height: 512 },
        },
      },
      {
        description: "Batch convert at multiple sizes",
        input: {
          svgPath: "/path/to/icon.svg",
          width: 150,
        },
        expectedOutput: {
          success: true,
          outputPath: "/path/to/icon.png",
          dimensions: { width: 150, height: 150 },
        },
      },
    ],
  },
  {
    name: "convert_svg_to_multi_png",
    category: "image-processing",
    description:
      "Convert SVG to multiple PNG sizes in a single task-based operation using headless rendering. Perfect for generating website assets at different resolutions for responsive design and progressive loading.",
    inputSchema: {
      type: "object",
      properties: {
        svgPath: {
          type: "string",
          description: "Path to the SVG file to convert",
        },
        sizes: {
          type: "array",
          items: { type: "number" },
          description: "Array of sizes to generate (width=height for square images)",
          default: [150, 300, 512],
        },
        taskId: {
          type: "string",
          description: "Optional task ID for grouping related assets",
        },
        outputNamePattern: {
          type: "string",
          description: "Name pattern for output files, use {size} placeholder",
          default: "png-{size}.png",
        },
        options: {
          type: "object",
          properties: {
            quality: {
              type: "number",
              minimum: 1,
              maximum: 100,
              default: 90,
              description: "PNG quality",
            },
            dpi: {
              type: "number",
              default: 96,
              description: "Target DPI for output images",
            },
            backgroundColor: {
              type: "string",
              description: "Background color for transparent SVGs (e.g., '#ffffff')",
            },
            maintainAspectRatio: {
              type: "boolean",
              default: true,
              description: "Maintain original aspect ratio when resizing",
            },
          },
        },
      },
      required: ["svgPath", "sizes"],
    },
    examples: [
      {
        description: "Generate responsive website icons",
        input: {
          svgPath: "/path/to/logo.svg",
          sizes: [16, 32, 64, 128, 256],
          taskId: "website-icons",
          outputNamePattern: "logo-{size}.png",
        },
        expectedOutput: {
          success: true,
          taskId: "website-icons",
          results: [
            {
              size: 16,
              outputPath: "team-id/website-icons/logo-16.png",
              outputSize: 1234,
              dimensions: { width: 16, height: 16 },
            },
          ],
          totalOutputSize: 25678,
          processingTime: 450,
        },
      },
    ],
  },
  {
    name: "list_processed_assets",
    category: "image-processing",
    description:
      "List processed assets with filtering options. Shows task-based asset organization and supports pattern matching for efficient asset discovery.",
    inputSchema: {
      type: "object",
      properties: {
        taskId: {
          type: "string",
          description: "Filter by specific task ID",
        },
        pattern: {
          type: "string",
          description: "Glob pattern for task matching (e.g., 'logo-*', 'website-*')",
        },
        limit: {
          type: "number",
          default: 20,
          description: "Maximum number of tasks to return",
        },
        sortBy: {
          type: "string",
          enum: ["created", "modified", "size"],
          default: "modified",
          description: "Sort criteria",
        },
        sortDirection: {
          type: "string",
          enum: ["asc", "desc"],
          default: "desc",
          description: "Sort direction",
        },
      },
    },
    examples: [
      {
        description: "List recent processing tasks",
        input: {
          limit: 10,
          sortBy: "modified",
        },
        expectedOutput: {
          success: true,
          tasks: [
            {
              taskId: "logo-batch-2024-08-18",
              createdAt: "2024-08-18T10:30:00Z",
              assets: [
                { name: "compressed.svg", type: "svg", size: 1234 },
                { name: "png-150.png", type: "png", size: 2345 },
              ],
              totalSize: 3579,
            },
          ],
          totalTasks: 1,
        },
      },
    ],
  },
  {
    name: "get_processed_asset",
    category: "image-processing",
    description:
      "Retrieve a specific processed asset from a task. Returns the asset file content and metadata for download or further processing.",
    inputSchema: {
      type: "object",
      properties: {
        taskId: {
          type: "string",
          description: "Task ID containing the asset",
        },
        assetName: {
          type: "string",
          description: "Name of the asset file (e.g., 'compressed.svg', 'png-300.png')",
        },
        returnFormat: {
          type: "string",
          enum: ["file", "base64"],
          default: "file",
          description: "How to return the asset data",
        },
      },
      required: ["taskId", "assetName"],
    },
    examples: [
      {
        description: "Get compressed SVG from a task",
        input: {
          taskId: "logo-batch-2024-08-18",
          assetName: "compressed.svg",
        },
        expectedOutput: {
          success: true,
          assetPath: "team-id/logo-batch-2024-08-18/compressed.svg",
        },
      },
    ],
  },
  {
    name: "purge_processed_assets",
    category: "image-processing",
    description:
      "Delete processed assets using flexible filtering. Supports glob patterns, age-based cleanup, and partial retention strategies. Always use dryRun first.",
    inputSchema: {
      type: "object",
      properties: {
        pattern: {
          type: "string",
          description: "Glob pattern for tasks to purge (e.g., 'temp-*', 'old-*', '*' for all)",
        },
        strategy: {
          type: "string",
          enum: ["complete", "partial", "age-based"],
          description: "Purging strategy",
        },
        keepLast: {
          type: "number",
          description: "Keep last N tasks (for partial strategy)",
        },
        olderThan: {
          type: "string",
          description: "Delete tasks older than this (e.g., '7d', '24h', '30m')",
        },
        dryRun: {
          type: "boolean",
          default: true,
          description: "Preview what would be deleted without actually deleting",
        },
        confirm: {
          type: "boolean",
          default: false,
          description: "Explicit confirmation for destructive operations",
        },
      },
      required: ["pattern", "strategy"],
    },
    examples: [
      {
        description: "Preview cleanup of temporary tasks",
        input: {
          pattern: "temp-*",
          strategy: "complete",
          dryRun: true,
        },
        expectedOutput: {
          success: true,
          dryRun: true,
          tasksAffected: ["temp-12345", "temp-67890"],
          filesDeleted: 8,
          bytesFreed: 150000,
          errors: [],
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
  // CSS override utilities for live testing
  {
    name: "apply_css_override",
    category: "styling",
    description: "Apply a temporary CSS override rule scoped to a selector",
    inputSchema: {
      type: "object",
      properties: {
        browserId: { type: "string" },
        target: { type: "string", enum: ["latest", "current", "byId"], default: "latest" },
        selector: { type: "string", description: "CSS selector to target" },
        cssRules: {
          type: "object",
          description: "Map of CSS properties to values",
          additionalProperties: { type: "string" },
        },
        important: {
          type: "boolean",
          description: "Append !important to each rule",
          default: false,
        },
      },
      required: ["selector", "cssRules"],
    },
    examples: [
      {
        description: "Lift a shifted main frame temporarily",
        input: {
          selector: ".main-frame",
          cssRules: { transform: "translateY(-596px)", position: "relative" },
          important: true,
        },
        expectedOutput: {
          success: true,
          overrideId: "override-456",
        },
      },
    ],
  },
  {
    name: "revert_css_changes",
    category: "styling",
    description: "Revert a previously applied CSS override by ID",
    inputSchema: {
      type: "object",
      properties: {
        browserId: { type: "string" },
        target: { type: "string", enum: ["latest", "current", "byId"], default: "latest" },
        overrideId: { type: "string" },
      },
      required: ["overrideId"],
    },
  },
  {
    name: "simulate_css_change",
    category: "styling",
    description:
      "Simulate applying CSS rules to a selector and report computed style diffs (no persistence)",
    inputSchema: {
      type: "object",
      properties: {
        browserId: { type: "string" },
        target: { type: "string", enum: ["latest", "current", "byId"], default: "latest" },
        selector: { type: "string", description: "CSS selector to target" },
        cssRules: {
          type: "object",
          description: "Map of CSS properties to values to simulate",
          additionalProperties: { type: "string" },
        },
        important: {
          type: "boolean",
          description: "Attempt simulation with !important",
          default: false,
        },
      },
      required: ["selector", "cssRules"],
    },
    examples: [
      {
        description: "Simulate transform and position changes",
        input: {
          selector: ".hero",
          cssRules: { transform: "translateY(-64px)", position: "relative" },
        },
        expectedOutput: {
          success: true,
          overallChanged: true,
          changes: [
            { property: "transform", before: "none", after: "matrix(...)" },
            { property: "position", before: "static", after: "relative" },
          ],
        },
      },
    ],
    errors: [
      {
        code: "INVALID_PARAMS",
        message: "simulate_css_change requires 'selector' and 'cssRules'",
        solution: "Provide a valid CSS selector and a rules object mapping properties to values",
      },
      {
        code: "ELEMENT_NOT_FOUND",
        message: "Target element not found for selector",
        solution: "Verify the selector is correct or wait for the element to render",
      },
      {
        code: "CSS_SIMULATION_FAILED",
        message: "An error occurred during CSS simulation",
        solution: "Check property names/values and retry; try important: true for precedence",
      },
    ],
  },
  {
    name: "why_style_not_applied",
    category: "styling",
    description:
      "Explain why a CSS property change may not take effect; tests desiredValue and reports likely causes",
    inputSchema: {
      type: "object",
      properties: {
        browserId: { type: "string" },
        target: { type: "string", enum: ["latest", "current", "byId"], default: "latest" },
        selector: { type: "string" },
        property: { type: "string" },
        desiredValue: { type: "string", description: "Optional desired value to test" },
      },
      required: ["selector", "property"],
    },
    examples: [
      {
        description: "Explain why top doesn’t move the element",
        input: { selector: ".card", property: "top", desiredValue: "-20px" },
        expectedOutput: {
          success: true,
          computed: { before: "auto", after: "-20px" },
          reasons: ["Position is static; offsets only apply when position != static"],
        },
      },
    ],
    errors: [
      {
        code: "INVALID_PARAMS",
        message: "why_style_not_applied requires 'selector' and 'property'",
        solution: "Provide the CSS selector and property you are diagnosing",
      },
      {
        code: "ELEMENT_NOT_FOUND",
        message: "Target element not found for selector",
        solution: "Verify the selector is correct or wait for the element to render",
      },
    ],
  },
  {
    name: "get_applicable_rules",
    category: "styling",
    description: "List author rules that match the element, with specificity and properties",
    inputSchema: {
      type: "object",
      properties: {
        browserId: { type: "string" },
        target: { type: "string", enum: ["latest", "current", "byId"], default: "latest" },
        selector: { type: "string" },
        properties: {
          type: "array",
          items: { type: "string" },
          description: "Filter to these CSS properties",
        },
        limit: { type: "number", default: 50 },
      },
      required: ["selector"],
    },
    examples: [
      {
        description: "List rules that affect .card",
        input: { selector: ".card", limit: 10 },
        expectedOutput: {
          success: true,
          rules: [
            {
              selector: ".grid .card",
              specificity: [0, 1, 1],
              source: { origin: "author", href: "/styles/site.css" },
              order: 123,
              properties: [{ name: "margin-top", value: "16px", important: false }],
            },
          ],
        },
      },
    ],
  },
  {
    name: "get_effective_computed",
    category: "styling",
    description: "Return the final computed value for a property and the winning rule metadata",
    inputSchema: {
      type: "object",
      properties: {
        browserId: { type: "string" },
        target: { type: "string", enum: ["latest", "current", "byId"], default: "latest" },
        selector: { type: "string" },
        property: { type: "string" },
      },
      required: ["selector", "property"],
    },
    examples: [
      {
        description: "Find the winning rule for margin-top",
        input: { selector: ".card", property: "margin-top" },
        expectedOutput: {
          success: true,
          value: "16px",
          source: { type: "author", selector: ".grid .card", href: "/styles/site.css" },
          specificity: [0, 1, 1],
          important: false,
        },
      },
    ],
  },
];

/**
 * Rendering tools - Convert various formats to visual browser rendering
 * Includes PDF, Mermaid, PlantUML, Markdown, and other visual formats
 */
export const renderingTools: EnhancedTool[] = [
  {
    name: "render_pdf",
    category: "rendering",
    description:
      "Render a PDF file in the browser for visual analysis, interaction, and layout debugging",
    inputSchema: {
      type: "object",
      properties: {
        pdfPath: {
          type: "string",
          description: "Absolute path to the PDF file to render",
        },
        browserId: {
          type: "string",
          description:
            "Optional. ID of the browser. If omitted, uses the most recently launched browser.",
        },
        target: {
          type: "string",
          enum: ["latest", "current", "byId"],
          description: "Optional targeting strategy when browserId is omitted or invalid",
          default: "latest",
        },
        page: {
          type: "number",
          description: "Page number to navigate to (1-based)",
          default: 1,
          minimum: 1,
        },
        zoom: {
          type: "number",
          description: "Zoom level (1.0 = 100%)",
          default: 1.0,
          minimum: 0.5,
          maximum: 5.0,
        },
        waitForRender: {
          type: "number",
          description: "Milliseconds to wait for PDF to render",
          default: 2000,
          minimum: 500,
          maximum: 10000,
        },
      },
      required: ["pdfPath"],
    },
    examples: [
      {
        description: "Render a PDF for visual analysis",
        input: {
          pdfPath: "/Users/user/Documents/report.pdf",
        },
        expectedOutput: {
          success: true,
          message: "PDF rendered: report.pdf",
          pageCount: 10,
          currentPage: 1,
        },
      },
      {
        description: "Render specific page with zoom",
        input: {
          pdfPath: "/Users/user/Documents/report.pdf",
          page: 3,
          zoom: 1.5,
        },
        expectedOutput: {
          success: true,
          message: "PDF rendered: report.pdf",
          pageCount: 10,
          currentPage: 3,
        },
      },
    ],
  },
];

/**
 * Documentation and help tools - extensible framework for tool-specific docs
 */
export const documentationTools: EnhancedTool[] = [
  {
    name: "brooklyn_docs",
    category: "documentation",
    description:
      "Access Brooklyn documentation with smart retrieval, platform-aware guidance, and keyword search. Extensible framework for documentation access.",
    inputSchema: {
      type: "object",
      properties: {
        topic: {
          type: "string",
          enum: [
            "native-dependencies",
            "getting-started",
            "troubleshooting",
            "installation",
            "architecture",
            "examples",
            "all",
          ],
          description: "Specific documentation topic to retrieve",
        },
        search: {
          type: "string",
          description: "Keywords to search within documentation content",
        },
        platform: {
          type: "string",
          enum: ["darwin", "linux", "win32", "auto"],
          default: "auto",
          description: "Filter content for specific platform (auto-detects if not specified)",
        },
        format: {
          type: "string",
          enum: ["markdown", "summary", "structured"],
          default: "markdown",
          description: "Output format for documentation content",
        },
      },
    },
    examples: [
      {
        description: "Get native dependency installation guide for current platform",
        input: {
          topic: "native-dependencies",
          platform: "auto",
          format: "markdown",
        },
        expectedOutput: {
          success: true,
          topic: "native-dependencies",
          platform: "darwin",
          content: "# Native Dependencies Installation Guide...",
          relatedTopics: ["installation", "troubleshooting"],
        },
      },
      // Removed legacy native image troubleshooting example; consolidated under browser-based rendering
    ],
  },
];

/**
 * PDF Analysis and Content Extraction Tools
 * Built on word/line span foundation from v1.6.3
 */
export const pdfAnalysisTools: EnhancedTool[] = [
  {
    name: "analyze_pdf_content",
    category: "pdf-analysis",
    description:
      "Analyze PDF content structure using word and line spans for semantic understanding",
    inputSchema: {
      type: "object",
      properties: {
        browserId: {
          type: "string",
          description: "Browser instance ID (optional, defaults to latest)",
        },
        pageRange: {
          type: "object",
          properties: {
            start: { type: "number", minimum: 1 },
            end: { type: "number", minimum: 1 },
          },
          description: "Page range to analyze (optional, analyzes all if omitted)",
        },
        analysisTypes: {
          type: "array",
          items: {
            type: "string",
            enum: ["structure", "layout", "content", "metadata"],
          },
          description: "Types of analysis to perform",
          default: ["structure", "content"],
        },
        includeWordSpans: {
          type: "boolean",
          description: "Include detailed word span data",
          default: false,
        },
        timeout: {
          type: "number",
          description: "Timeout in milliseconds",
          default: 30000,
        },
      },
    },
  },
  {
    name: "extract_pdf_text",
    category: "pdf-analysis",
    description: "Extract structured text content from PDF using word/line spans",
    inputSchema: {
      type: "object",
      properties: {
        browserId: {
          type: "string",
          description: "Browser instance ID (optional, defaults to latest)",
        },
        pageRange: {
          type: "object",
          properties: {
            start: { type: "number", minimum: 1 },
            end: { type: "number", minimum: 1 },
          },
        },
        format: {
          type: "string",
          enum: ["structured", "plain", "markdown"],
          description: "Output format",
          default: "structured",
        },
        preserveLayout: {
          type: "boolean",
          description: "Preserve spatial layout in output",
          default: true,
        },
        includeMetadata: {
          type: "boolean",
          description: "Include font and style metadata",
          default: false,
        },
      },
    },
  },
  {
    name: "search_pdf_content",
    category: "pdf-analysis",
    description: "Search for text patterns in PDF using word spans for accurate matching",
    inputSchema: {
      type: "object",
      properties: {
        browserId: {
          type: "string",
          description: "Browser instance ID (optional, defaults to latest)",
        },
        query: {
          type: "string",
          description: "Search query (supports regex)",
        },
        caseSensitive: {
          type: "boolean",
          description: "Case sensitive search",
          default: false,
        },
        wholeWords: {
          type: "boolean",
          description: "Match whole words only",
          default: false,
        },
        pageRange: {
          type: "object",
          properties: {
            start: { type: "number", minimum: 1 },
            end: { type: "number", minimum: 1 },
          },
        },
        maxResults: {
          type: "number",
          description: "Maximum results to return",
          default: 50,
        },
      },
      required: ["query"],
    },
  },
  {
    name: "extract_pdf_tables",
    category: "pdf-analysis",
    description: "Extract tabular data from PDF using layout analysis and word spans",
    inputSchema: {
      type: "object",
      properties: {
        browserId: {
          type: "string",
          description: "Browser instance ID (optional, defaults to latest)",
        },
        pageRange: {
          type: "object",
          properties: {
            start: { type: "number", minimum: 1 },
            end: { type: "number", minimum: 1 },
          },
        },
        tableDetection: {
          type: "string",
          enum: ["auto", "manual"],
          description: "Table detection method",
          default: "auto",
        },
        outputFormat: {
          type: "string",
          enum: ["json", "csv", "markdown"],
          description: "Output format for extracted tables",
          default: "json",
        },
        includeHeaders: {
          type: "boolean",
          description: "Attempt to identify and include table headers",
          default: true,
        },
      },
    },
  },
  {
    name: "analyze_pdf_layout",
    category: "pdf-analysis",
    description: "Analyze PDF layout structure including columns, sections, and reading order",
    inputSchema: {
      type: "object",
      properties: {
        browserId: {
          type: "string",
          description: "Browser instance ID (optional, defaults to latest)",
        },
        pageRange: {
          type: "object",
          properties: {
            start: { type: "number", minimum: 1 },
            end: { type: "number", minimum: 1 },
          },
        },
        analysisDepth: {
          type: "string",
          enum: ["basic", "detailed", "comprehensive"],
          description: "Depth of layout analysis",
          default: "detailed",
        },
        detectColumns: {
          type: "boolean",
          description: "Detect multi-column layouts",
          default: true,
        },
        detectSections: {
          type: "boolean",
          description: "Detect document sections and headings",
          default: true,
        },
      },
    },
  },
  {
    name: "compare_pdf_versions",
    category: "pdf-analysis",
    description: "Compare two PDF versions using word spans to identify changes",
    inputSchema: {
      type: "object",
      properties: {
        browserId1: {
          type: "string",
          description: "Browser instance ID for first PDF",
        },
        browserId2: {
          type: "string",
          description: "Browser instance ID for second PDF",
        },
        comparisonType: {
          type: "string",
          enum: ["text", "layout", "structure"],
          description: "Type of comparison to perform",
          default: "text",
        },
        pageRange: {
          type: "object",
          properties: {
            start: { type: "number", minimum: 1 },
            end: { type: "number", minimum: 1 },
          },
        },
        includeDetails: {
          type: "boolean",
          description: "Include detailed change information",
          default: true,
        },
      },
      required: ["browserId1", "browserId2"],
    },
  },
  {
    name: "summarize_pdf_content",
    category: "pdf-analysis",
    description: "Generate structured summary of PDF content using word/line spans",
    inputSchema: {
      type: "object",
      properties: {
        browserId: {
          type: "string",
          description: "Browser instance ID (optional, defaults to latest)",
        },
        pageRange: {
          type: "object",
          properties: {
            start: { type: "number", minimum: 1 },
            end: { type: "number", minimum: 1 },
          },
        },
        summaryType: {
          type: "string",
          enum: ["overview", "detailed", "executive"],
          description: "Type of summary to generate",
          default: "overview",
        },
        includeStructure: {
          type: "boolean",
          description: "Include document structure in summary",
          default: true,
        },
        maxLength: {
          type: "number",
          description: "Maximum summary length in words",
          default: 500,
        },
      },
    },
  },
  {
    name: "extract_pdf_forms",
    category: "pdf-analysis",
    description: "Extract and analyze form fields and interactive elements from PDF",
    inputSchema: {
      type: "object",
      properties: {
        browserId: {
          type: "string",
          description: "Browser instance ID (optional, defaults to latest)",
        },
        pageRange: {
          type: "object",
          properties: {
            start: { type: "number", minimum: 1 },
            end: { type: "number", minimum: 1 },
          },
        },
        includeLayout: {
          type: "boolean",
          description: "Include form layout information",
          default: true,
        },
        extractValues: {
          type: "boolean",
          description: "Attempt to extract current form values",
          default: false,
        },
      },
    },
  },
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
    ...renderingTools,
    ...imageProcessingTools,
    ...documentationTools,
    ...javascriptTools,
    ...stylingTools,
    ...discoveryTools,
    ...pdfAnalysisTools,
  ];
}

/**
 * Get tools by category
 */
export function getToolCategories(): string[] {
  return [
    "browser-lifecycle",
    "navigation",
    "interaction",
    "styling",
    "content-capture",
    "rendering",
    "image-processing",
    "documentation",
    "discovery",
    "pdf-analysis",
  ];
}
