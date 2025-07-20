/**
 * Enhanced tool definitions with rich metadata for MCP discovery
 * Architecture Committee - Sprint 1 Priority
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";

export interface EnhancedTool extends Tool {
  category: string;
  examples?: Array<{
    description: string;
    input: any;
    expectedOutput?: any;
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
          description: "ID of the browser to close",
        },
      },
      required: ["browserId"],
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
    description: "List all currently active browser instances",
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
    description: "Navigate browser to a specific URL and wait for page load",
    inputSchema: {
      type: "object",
      properties: {
        browserId: {
          type: "string",
          description: "ID of the browser to navigate",
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
      required: ["browserId", "url"],
    },
    examples: [
      {
        description: "Navigate to a website and wait for full load",
        input: {
          browserId: "browser-123",
          url: "https://example.com",
          waitUntil: "networkidle",
        },
        expectedOutput: {
          status: "navigated",
          url: "https://example.com",
          loadTime: 1234,
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
          description: "ID of the browser",
        },
      },
      required: ["browserId"],
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
    description: "Capture a screenshot of the current page or specific element",
    inputSchema: {
      type: "object",
      properties: {
        browserId: {
          type: "string",
          description: "ID of the browser",
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
        format: {
          type: "string",
          enum: ["png", "jpeg"],
          description: "Screenshot format",
          default: "png",
        },
      },
      required: ["browserId"],
    },
    examples: [
      {
        description: "Capture full page screenshot",
        input: {
          browserId: "browser-123",
          fullPage: true,
          format: "png",
        },
        expectedOutput: {
          status: "captured",
          format: "png",
          size: { width: 1920, height: 3000 },
          dataUrl: "data:image/png;base64,...",
        },
      },
      {
        description: "Capture specific element",
        input: {
          browserId: "browser-123",
          selector: "#main-content",
          format: "jpeg",
        },
        expectedOutput: {
          status: "captured",
          format: "jpeg",
          selector: "#main-content",
          dataUrl: "data:image/jpeg;base64,...",
        },
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
    description: "List all available Brooklyn tools organized by category",
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
 * Get all tools with enhanced metadata
 */
export function getAllTools(): EnhancedTool[] {
  return [...browserLifecycleTools, ...navigationTools, ...contentCaptureTools, ...discoveryTools];
}

/**
 * Get tools by category
 */
export function getToolsByCategory(category: string): EnhancedTool[] {
  return getAllTools().filter((tool) => tool.category === category);
}

/**
 * Get tool categories
 */
export function getToolCategories(): string[] {
  const categories = new Set(getAllTools().map((tool) => tool.category));
  return Array.from(categories);
}
