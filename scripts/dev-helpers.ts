/**
 * Claude-side Development Helpers
 *
 * Provides seamless pipe communication with Brooklyn development mode.
 * Makes development mode look identical to MCP from Claude's perspective.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

interface DevPipeInfo {
  processId: number;
  startTime: string;
  inputPipe: string;
  outputPipe: string;
  pipesPrefix: string;
  logFile: string;
}

interface MCPRequest {
  jsonrpc: "2.0";
  method: string;
  params: Record<string, unknown>;
  id: string | number;
}

interface MCPResponse<T = unknown> {
  jsonrpc: "2.0";
  result?: T;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
  id: string | number;
}

interface BrowserLaunchResult {
  browserId: string;
}

interface BrowserCloseResult {
  success: boolean;
}

interface BrowserListResult {
  browsers: Array<{
    id: string;
    type: string;
    headless: boolean;
  }>;
}

interface NavigationResult {
  success: boolean;
  url: string;
}

interface GoBackResult {
  success: boolean;
  url: string;
}

interface ScreenshotResult {
  filePath: string;
  filename: string;
  instanceId: string;
  tag: string;
  metadata: {
    sessionId: string;
    browserId: string;
    userId?: string;
    teamId?: string;
    timestamp: string;
    filename: string;
    format: string;
    dimensions: { width: number; height: number };
    fileSize: number;
    hash: string;
    auditId: string;
    instanceId: string;
    tag: string;
  };
}

interface StatusResult {
  service: string;
  version: string;
  status: string;
  environment: string;
  uptime: number;
  capabilities: {
    browsers: string[];
    core_tools: string[];
    features: string[];
  };
  configuration?: {
    max_browsers: number;
    headless: boolean;
    rate_limit: {
      requests: number;
      window: number;
    };
  };
  resource_usage?: {
    memory: object;
    cpu_usage: object;
  };
  browser_pool?: unknown;
}

interface CapabilitiesResult {
  core_tools?: {
    description: string;
    tools: Array<{ name: string; description: string }>;
  };
  onboarding_tools?: {
    description: string;
    tools: Array<{ name: string; description: string }>;
  };
  plugin_tools?: {
    description: string;
    tools: Array<{ name: string; description: string }>;
  };
  testing_tools?: {
    description: string;
    tools: Array<{ name: string; description: string }>;
  };
}

interface ListToolsResult {
  category?: string;
  tools?: Array<{
    name: string;
    description: string;
    examples?: string[];
  }>;
  count?: number;
  categories?: Record<
    string,
    Array<{
      name: string;
      description: string;
      examples?: string[];
    }>
  >;
}

interface ToolHelpResult {
  toolName: string;
  help: string;
  examples: string[];
}

interface ExamplesResult {
  task: string;
  examples: string[];
}

let nextRequestId = 1;

/**
 * Load development mode pipe information
 */
function loadPipeInfo(): DevPipeInfo | null {
  const pipesFile = path.join(os.homedir(), ".brooklyn", "dev", "pipes.json");

  try {
    if (fs.existsSync(pipesFile)) {
      const data = fs.readFileSync(pipesFile, "utf-8");
      return JSON.parse(data);
    }
  } catch (error) {
    console.error("Failed to load pipe info:", error);
  }

  return null;
}

/**
 * Check if development mode is active
 */
export function isDevModeActive(): boolean {
  const pipeInfo = loadPipeInfo();

  if (!pipeInfo) {
    return false;
  }

  // Check if process is still running
  try {
    process.kill(pipeInfo.processId, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Send MCP request to development Brooklyn process
 */
export async function sendToDevBrooklyn<T = unknown>(
  toolName: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  const pipeInfo = loadPipeInfo();

  if (!pipeInfo) {
    throw new Error("Development mode not active. Run 'bun run dev:brooklyn:start' first.");
  }

  if (!isDevModeActive()) {
    throw new Error("Development process not running. Check with 'bun run dev:brooklyn:status'.");
  }

  // Check pipes exist
  if (!(fs.existsSync(pipeInfo.inputPipe) && fs.existsSync(pipeInfo.outputPipe))) {
    throw new Error("Development pipes not available. Try restarting development mode.");
  }

  const requestId = `dev-${nextRequestId++}`;

  const request: MCPRequest = {
    jsonrpc: "2.0",
    method: "tools/call",
    params: {
      name: toolName,
      arguments: params,
    },
    id: requestId,
  };

  try {
    // Write request to input pipe
    await writeToInputPipe(pipeInfo.inputPipe, JSON.stringify(request));

    // Read response from output pipe
    const response = await readFromOutputPipe(pipeInfo.outputPipe, requestId);

    if (response.error) {
      throw new Error(`Brooklyn tool error: ${response.error.message}`);
    }

    return response.result as T;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Development mode communication failed: ${errorMessage}`);
  }
}

/**
 * Write data to input pipe
 */
async function writeToInputPipe(inputPipe: string, data: string): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      // Open pipe for writing
      const stream = fs.createWriteStream(inputPipe, { flags: "a" });

      stream.write(`${data}\n`, (error) => {
        stream.end();

        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });

      stream.on("error", reject);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Read response from output pipe
 */
async function readFromOutputPipe(
  outputPipe: string,
  requestId: string | number,
): Promise<MCPResponse> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Response timeout"));
    }, 30000); // 30 second timeout

    try {
      // Read from pipe
      const stream = fs.createReadStream(outputPipe);
      let buffer = "";

      stream.on("data", (chunk) => {
        buffer += chunk.toString();

        // Try to parse complete JSON responses
        const lines = buffer.split("\n");
        buffer = lines.pop() || ""; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.trim()) {
            try {
              const response: MCPResponse = JSON.parse(line.trim());

              // Check if this is our response
              if (response.id === requestId) {
                clearTimeout(timeout);
                stream.destroy();
                resolve(response);
                return;
              }
            } catch (_parseError) {
              // Ignore parse errors for partial JSON
            }
          }
        }
      });

      stream.on("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });

      stream.on("end", () => {
        clearTimeout(timeout);
        reject(new Error("Pipe closed before response received"));
      });
    } catch (error) {
      clearTimeout(timeout);
      reject(error);
    }
  });
}

/**
 * Development mode Brooklyn tool functions
 * These look identical to MCP tools from Claude's perspective
 */

export async function dev_launch_browser(params: {
  browserType?: "chromium" | "firefox" | "webkit";
  headless?: boolean;
  teamId?: string;
  viewport?: { width: number; height: number };
}): Promise<BrowserLaunchResult> {
  return await sendToDevBrooklyn<BrowserLaunchResult>("launch_browser", params);
}

export async function dev_close_browser(params: {
  browserId: string;
}): Promise<BrowserCloseResult> {
  return await sendToDevBrooklyn<BrowserCloseResult>("close_browser", params);
}

export async function dev_list_active_browsers(): Promise<BrowserListResult> {
  return await sendToDevBrooklyn<BrowserListResult>("list_active_browsers", {});
}

export async function dev_navigate_to_url(params: {
  browserId: string;
  url: string;
  waitUntil?: "load" | "domcontentloaded" | "networkidle";
}): Promise<NavigationResult> {
  return await sendToDevBrooklyn<NavigationResult>("navigate_to_url", params);
}

export async function dev_go_back(params: {
  browserId: string;
}): Promise<GoBackResult> {
  return await sendToDevBrooklyn<GoBackResult>("go_back", params);
}

export async function dev_take_screenshot(params: {
  browserId: string;
  fullPage?: boolean;
  selector?: string;
  returnFormat?: "file" | "url" | "base64_thumbnail";
  type?: "png" | "jpeg";
  quality?: number;
  tag?: string;
}): Promise<ScreenshotResult> {
  return await sendToDevBrooklyn<ScreenshotResult>("take_screenshot", params);
}

// Onboarding and discovery tools
export async function dev_brooklyn_status(): Promise<StatusResult> {
  return await sendToDevBrooklyn<StatusResult>("brooklyn_status", {});
}

export async function dev_brooklyn_capabilities(): Promise<CapabilitiesResult> {
  return await sendToDevBrooklyn<CapabilitiesResult>("brooklyn_capabilities", {});
}

export async function dev_brooklyn_list_tools(): Promise<ListToolsResult> {
  return await sendToDevBrooklyn<ListToolsResult>("brooklyn_list_tools", {});
}

export async function dev_brooklyn_tool_help(params: {
  toolName: string;
}): Promise<ToolHelpResult> {
  return await sendToDevBrooklyn<ToolHelpResult>("brooklyn_tool_help", params);
}

export async function dev_brooklyn_examples(params?: {
  task?: string;
  format?: string;
}): Promise<ExamplesResult> {
  return await sendToDevBrooklyn<ExamplesResult>("brooklyn_examples", params || {});
}

/**
 * Development mode status check
 */
export function getDevModeStatus(): {
  active: boolean;
  processInfo?: DevPipeInfo;
  pipes?: { input: boolean; output: boolean };
} {
  const processInfo = loadPipeInfo();

  if (!processInfo) {
    return { active: false };
  }

  const active = isDevModeActive();

  const pipes = {
    input: fs.existsSync(processInfo.inputPipe),
    output: fs.existsSync(processInfo.outputPipe),
  };

  return {
    active,
    processInfo,
    pipes,
  };
}

/**
 * Quick development mode check with helpful messages
 */
export function checkDevMode(): void {
  const status = getDevModeStatus();

  if (!status.active) {
    console.log("❌ Development mode not active");
    console.log("   Run: bun run dev:brooklyn:start");
    return;
  }

  if (!(status.pipes?.input && status.pipes?.output)) {
    console.log("❌ Development pipes not available");
    console.log("   Try: bun run dev:brooklyn:restart");
    return;
  }

  console.log("✅ Development mode ready!");
  console.log(`   PID: ${status.processInfo?.processId}`);
}

/**
 * Test development mode with basic functionality
 */
export async function testDevMode(): Promise<boolean> {
  try {
    console.log("🧪 Testing development mode...");

    // Check status
    const _status = await dev_brooklyn_status();
    console.log("✅ Status check passed");

    // Test browser launch
    const browser = await dev_launch_browser({
      browserType: "chromium",
      headless: true,
    });
    console.log(`✅ Browser launched: ${browser.browserId}`);

    // Test navigation
    await dev_navigate_to_url({
      browserId: browser.browserId,
      url: "data:text/html,<h1>Brooklyn Development Mode Test</h1>",
    });
    console.log("✅ Navigation test passed");

    // Test screenshot
    const screenshot = await dev_take_screenshot({
      browserId: browser.browserId,
      returnFormat: "file",
      tag: "dev_mode_test",
    });
    console.log(`✅ Screenshot test passed: ${screenshot.filePath}`);

    // Close browser
    await dev_close_browser({ browserId: browser.browserId });
    console.log("✅ Browser cleanup passed");

    console.log("");
    console.log("🎉 Development mode test successful!");
    console.log("   All core functionality working");

    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("❌ Development mode test failed:", errorMessage);
    return false;
  }
}

// Export convenient aliases
export {
  dev_launch_browser as launch_browser,
  dev_close_browser as close_browser,
  dev_list_active_browsers as list_active_browsers,
  dev_navigate_to_url as navigate_to_url,
  dev_go_back as go_back,
  dev_take_screenshot as take_screenshot,
  dev_brooklyn_status as brooklyn_status,
  dev_brooklyn_capabilities as brooklyn_capabilities,
  dev_brooklyn_list_tools as brooklyn_list_tools,
  dev_brooklyn_tool_help as brooklyn_tool_help,
  dev_brooklyn_examples as brooklyn_examples,
};
