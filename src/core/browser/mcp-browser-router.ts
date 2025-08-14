/**
 * MCP Browser Router - Routes MCP tool requests to browser pool
 * Integrates the enterprise browser infrastructure with MCP protocol
 */

import { getLogger } from "../../shared/pino-logger.js";
import type { BrowserPoolManager } from "../browser-pool-manager.js";
import type { ScreenshotQuery as DBScreenshotQuery } from "../database/types.js";
import { ScreenshotStorageManager } from "../screenshot-storage-manager.js";
import type { MCPRequestContext } from "./mcp-request-context.js";

const logger = getLogger("mcp-browser-router");

export interface BrowserToolRequest {
  tool: string;
  params: Record<string, unknown>;
  context: MCPRequestContext;
}

export interface BrowserToolResponse {
  success: boolean;
  result?: unknown;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  metadata?: {
    browserId?: string;
    executionTime: number;
    teamId?: string;
  };
}

/**
 * Router that handles MCP browser tool requests
 */
export class MCPBrowserRouter {
  private poolManager: BrowserPoolManager;
  private activeSessions: Map<string, { teamId?: string; createdAt: Date }>;
  private screenshotStorage: ScreenshotStorageManager;

  constructor(poolManager: BrowserPoolManager) {
    this.poolManager = poolManager;
    this.activeSessions = new Map();
    this.screenshotStorage = new ScreenshotStorageManager();
  }

  /**
   * Route a browser tool request to the appropriate handler
   */
  async route(request: BrowserToolRequest): Promise<BrowserToolResponse> {
    const startTime = Date.now();
    const { tool, params, context } = request;

    logger.info("Routing MCP browser tool request", {
      tool,
      teamId: context.teamId,
      requestId: context.requestId,
    });

    const browserIdFromParams = (params && (params as Record<string, unknown>)["browserId"]) as
      | string
      | undefined;

    try {
      const result = await this.dispatch(tool, params, context);
      const metadata: BrowserToolResponse["metadata"] = {
        executionTime: Date.now() - startTime,
        teamId: context.teamId,
        browserId: browserIdFromParams,
      };

      logger.info("Browser tool request completed", {
        tool,
        teamId: context.teamId,
        executionTime: metadata.executionTime,
      });

      return {
        success: true,
        result,
        metadata,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;

      logger.error("Browser tool request failed", {
        tool,
        teamId: context.teamId,
        error: error instanceof Error ? error.message : String(error),
        executionTime,
      });

      const browserIdVal =
        browserIdFromParams ||
        (typeof (error as { browserId?: string }).browserId === "string"
          ? (error as { browserId?: string }).browserId
          : undefined);

      return {
        success: false,
        error: this.formatError(
          (error instanceof Error ? error : new Error(String(error))).message.includes(
            "session not found",
          ) ||
            (error instanceof Error ? error : new Error(String(error))).message.includes(
              "Browser session not found",
            )
            ? new Error(`Browser session not found: ${browserIdVal ?? "unknown"}`)
            : error instanceof Error
              ? error
              : new Error(String(error)),
          tool,
        ),
        metadata: {
          executionTime,
          teamId: context.teamId,
          browserId: browserIdVal,
        },
      };
    }
  }

  // Split dispatch into a dedicated method to reduce cognitive complexity
  private async dispatch(
    tool: string,
    params: Record<string, unknown>,
    context: MCPRequestContext,
  ): Promise<unknown> {
    // Normalize legacy parameter aliases early
    if (!params["browserId"] && (params as Record<string, unknown>)["id"]) {
      params["browserId"] = (params as Record<string, unknown>)["id"] as string;
    }
    if (!params["browserId"] && (params as Record<string, unknown>)["browser_id"]) {
      params["browserId"] = (params as Record<string, unknown>)["browser_id"] as string;
    }

    switch (tool) {
      case "launch_browser":
        return await this.launchBrowser(params, context);
      case "navigate_to_url":
        return await this.navigateToUrl(params, context);
      case "take_screenshot":
        return await this.takeScreenshot(params, context);
      case "find_elements":
        return await this.findElements(params, context);
      case "click_element":
        return await this.clickElement(params, context);
      case "fill_form_fields":
        return await this.fillFormFields(params, context);
      case "execute_javascript":
        return await this.executeJavaScript(params, context);
      case "get_page_content":
        return await this.getPageContent(params, context);
      case "close_browser":
        return await this.closeBrowser(params, context);
      case "fill_text":
        return await this.fillText(params, context);
      case "wait_for_element":
        return await this.waitForElement(params, context);
      case "get_text_content":
        return await this.getTextContent(params, context);
      case "validate_element_presence":
        return await this.validateElementPresence(params, context);
      case "go_back":
        return await this.goBack(params, context);
      case "list_screenshots":
        return await this.listScreenshots(params, context);
      case "get_screenshot":
        return await this.getScreenshot(params, context);
      // JavaScript Execution Tools (UX Speed)
      case "execute_script":
        return await this.executeScript(params, context);
      case "evaluate_expression":
        return await this.evaluateExpression(params, context);
      case "get_console_messages":
        return await this.getConsoleMessages(params, context);
      case "add_script_tag":
        return await this.addScriptTag(params, context);
      // CSS Analysis Tools (UX Understanding)
      case "extract_css":
        return await this.extractCSS(params, context);
      case "get_computed_styles":
        return await this.getComputedStyles(params, context);
      case "diff_css":
        return await this.diffCSS(params, context);
      case "analyze_specificity":
        return await this.analyzeSpecificity(params, context);
      default:
        throw new Error(`Unknown browser tool: ${tool}`);
    }
  }

  /**
   * Launch a new browser instance
   */
  private async launchBrowser(
    params: Record<string, unknown>,
    context: MCPRequestContext,
  ): Promise<unknown> {
    const {
      headless = true,
      viewport = { width: 1280, height: 720 },
      userAgent,
      timeout = 30000,
    } = params as {
      headless?: boolean;
      viewport?: { width: number; height: number };
      userAgent?: string;
      timeout?: number;
    };

    const result = await this.poolManager.launchBrowser({
      teamId: context.teamId,
      // honor requested browserType when provided; default to chromium
      browserType: ((params as { browserType?: "chromium" | "firefox" | "webkit" }).browserType ??
        "chromium") as "chromium" | "firefox" | "webkit",
      headless: headless as boolean,
      viewport: viewport as { width: number; height: number },
      userAgent: userAgent as string | undefined,
      timeout: timeout as number,
    });

    // Track session for team isolation
    this.activeSessions.set(result.browserId, {
      teamId: context.teamId,
      createdAt: new Date(),
    });

    // Standardize launch result for transports/tests expecting result.browserId at top-level
    return {
      success: true,
      browserId: result.browserId,
      status: "launched",
      browserType: result.browserType,
      headless: result.headless,
      viewport: result.viewport,
      userAgent: result.userAgent,
      teamId: context.teamId,
    };
  }

  /**
   * Navigate to a URL
   */
  private async navigateToUrl(
    params: Record<string, unknown>,
    context: MCPRequestContext,
  ): Promise<unknown> {
    const {
      url,
      waitUntil = "load",
      timeout = 30000,
    } = params as {
      url?: string;
      waitUntil?: "load" | "domcontentloaded" | "networkidle";
      timeout?: number;
    };

    if (!url) {
      throw new Error("navigate_to_url requires 'url'");
    }

    const resolvedBrowserId = this.resolveBrowserId(params, context.teamId);

    // validate access after resolving
    this.validateBrowserAccess(resolvedBrowserId, context.teamId);

    return this.poolManager.navigate({
      browserId: resolvedBrowserId,
      url,
      waitUntil,
      timeout: timeout as number,
    });
  }

  /**
   * Take a screenshot
   */
  private async takeScreenshot(
    params: Record<string, unknown>,
    context: MCPRequestContext,
  ): Promise<unknown> {
    const {
      fullPage = false,
      clip,
      type = "png",
      quality,
      returnFormat = "file",
    } = params as {
      fullPage?: boolean;
      clip?: { x: number; y: number; width: number; height: number };
      type?: "png" | "jpeg";
      quality?: number;
      returnFormat?: "file" | "url" | "base64_thumbnail";
    };

    const resolvedBrowserId = this.resolveBrowserId(params, context.teamId);

    this.validateBrowserAccess(resolvedBrowserId, context.teamId);

    return this.poolManager.screenshot({
      browserId: resolvedBrowserId,
      fullPage: fullPage as boolean,
      clip: clip as { x: number; y: number; width: number; height: number } | undefined,
      type: type as "png" | "jpeg",
      quality: quality as number | undefined,
      returnFormat: returnFormat as "file" | "url" | "base64_thumbnail",
    });
  }

  /**
   * Find elements on the page
   */
  private async findElements(
    params: Record<string, unknown>,
    context: MCPRequestContext,
  ): Promise<unknown> {
    const { selector } = params as { selector?: string };

    const resolvedBrowserId = this.resolveBrowserId(params, context.teamId);
    this.validateBrowserAccess(resolvedBrowserId, context.teamId);

    return this.poolManager.findElements({
      browserId: resolvedBrowserId,
      selector: selector as string,
    });
  }

  /**
   * Click an element
   */
  private async clickElement(
    params: Record<string, unknown>,
    context: MCPRequestContext,
  ): Promise<unknown> {
    const { selector } = params as { selector?: string };

    const resolvedBrowserId = this.resolveBrowserId(params, context.teamId);
    this.validateBrowserAccess(resolvedBrowserId, context.teamId);

    return this.poolManager.clickElement({
      browserId: resolvedBrowserId,
      selector: selector as string,
    });
  }

  /**
   * Fill form fields
   */
  private async fillFormFields(
    params: Record<string, unknown>,
    context: MCPRequestContext,
  ): Promise<unknown> {
    const { fields } = params as { fields?: Array<{ selector: string; value: string }> };

    const resolvedBrowserId = this.resolveBrowserId(params, context.teamId);
    this.validateBrowserAccess(resolvedBrowserId, context.teamId);

    const fieldMapping: Record<string, string> = {};
    const fieldArray = (fields ?? []) as Array<{ selector: string; value: string }>;
    for (const field of fieldArray) {
      fieldMapping[field.selector] = field.value;
    }

    return this.poolManager.fillForm({
      browserId: resolvedBrowserId,
      fieldMapping,
    });
  }

  /**
   * Execute JavaScript on the page
   */
  private async executeJavaScript(
    params: Record<string, unknown>,
    context: MCPRequestContext,
  ): Promise<unknown> {
    const resolvedBrowserId = this.resolveBrowserId(params, context.teamId);
    this.validateBrowserAccess(resolvedBrowserId, context.teamId);
    throw new Error("JavaScript execution not yet implemented");
  }

  /**
   * Get page content
   */
  private async getPageContent(
    params: Record<string, unknown>,
    context: MCPRequestContext,
  ): Promise<unknown> {
    const resolvedBrowserId = this.resolveBrowserId(params, context.teamId);
    this.validateBrowserAccess(resolvedBrowserId, context.teamId);
    throw new Error("Page content retrieval not yet implemented");
  }

  /**
   * Close a browser instance
   */
  private async closeBrowser(
    params: Record<string, unknown>,
    context: MCPRequestContext,
  ): Promise<unknown> {
    // Allow explicit browserId if provided, else resolve
    const explicit = (params as { browserId?: string }).browserId;
    const resolvedBrowserId = explicit ?? this.resolveBrowserId(params, context.teamId);

    // Treat missing session as idempotent success on close (teardown races)
    try {
      this.validateBrowserAccess(resolvedBrowserId, context.teamId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("Browser session not found")) {
        this.activeSessions.delete(resolvedBrowserId);
        return { success: true, browserId: resolvedBrowserId, status: "already_closed" };
      }
      throw e;
    }

    const result = await this.poolManager.closeBrowser({
      browserId: resolvedBrowserId,
      force: true,
    });

    this.activeSessions.delete(resolvedBrowserId);

    return result;
  }

  /**
   * Fill text in an element
   */
  private async fillText(
    params: Record<string, unknown>,
    context: MCPRequestContext,
  ): Promise<unknown> {
    const {
      selector,
      text,
      timeout = 30000,
    } = params as {
      selector?: string;
      text?: string;
      timeout?: number;
    };

    const resolvedBrowserId = this.resolveBrowserId(params, context.teamId);
    this.validateBrowserAccess(resolvedBrowserId, context.teamId);

    return this.poolManager.fillText({
      browserId: resolvedBrowserId,
      selector: selector as string,
      text: text as string,
      timeout: timeout as number,
    });
  }

  /**
   * Wait for an element to appear
   */
  private async waitForElement(
    params: Record<string, unknown>,
    context: MCPRequestContext,
  ): Promise<unknown> {
    const {
      selector,
      timeout = 30000,
      state = "visible",
    } = params as {
      selector?: string;
      timeout?: number;
      state?: "attached" | "detached" | "visible" | "hidden";
    };

    const resolvedBrowserId = this.resolveBrowserId(params, context.teamId);
    this.validateBrowserAccess(resolvedBrowserId, context.teamId);

    return this.poolManager.waitForElement({
      browserId: resolvedBrowserId,
      selector: selector as string,
      timeout: timeout as number,
      state: state as "attached" | "detached" | "visible" | "hidden",
    });
  }

  /**
   * Get text content from an element
   */
  private async getTextContent(
    params: Record<string, unknown>,
    context: MCPRequestContext,
  ): Promise<unknown> {
    const { selector, timeout = 30000 } = params as {
      selector?: string;
      timeout?: number;
    };

    const resolvedBrowserId = this.resolveBrowserId(params, context.teamId);
    this.validateBrowserAccess(resolvedBrowserId, context.teamId);

    return this.poolManager.getTextContent({
      browserId: resolvedBrowserId,
      selector: selector as string,
      timeout: timeout as number,
    });
  }

  /**
   * Validate element presence on the page
   */
  private async validateElementPresence(
    params: Record<string, unknown>,
    context: MCPRequestContext,
  ): Promise<unknown> {
    const {
      selector,
      shouldExist = true,
      timeout = 30000,
    } = params as {
      selector?: string;
      shouldExist?: boolean;
      timeout?: number;
    };

    const resolvedBrowserId = this.resolveBrowserId(params, context.teamId);
    this.validateBrowserAccess(resolvedBrowserId, context.teamId);

    return this.poolManager.validateElementPresence({
      browserId: resolvedBrowserId,
      selector: selector as string,
      shouldExist: shouldExist as boolean,
      timeout: timeout as number,
    });
  }

  /**
   * Navigate back in browser history
   */
  private async goBack(
    params: Record<string, unknown>,
    context: MCPRequestContext,
  ): Promise<unknown> {
    const resolvedBrowserId = this.resolveBrowserId(params, context.teamId);
    this.validateBrowserAccess(resolvedBrowserId, context.teamId);

    return this.poolManager.goBack({
      browserId: resolvedBrowserId,
    });
  }

  /**
   * List screenshots from database inventory
   * Supports all parameters from the list_screenshots tool definition
   */
  private async listScreenshots(
    params: Record<string, unknown>,
    context: MCPRequestContext,
  ): Promise<unknown> {
    // Extract and map parameters to database query format
    const {
      instanceId,
      sessionId,
      teamId: _teamId = context.teamId, // SECURITY: Ignored - always use context.teamId
      userId,
      tag,
      format,
      maxAge,
      startDate,
      endDate,
      orderBy = "created_at",
      orderDirection = "DESC",
      limit = 10,
      offset = 0,
      // Legacy parameters for backward compatibility
      browserId,
      since,
      includeMetadata = true,
    } = params as {
      // New database-backed parameters
      instanceId?: string;
      sessionId?: string;
      teamId?: string;
      userId?: string;
      tag?: string;
      format?: "png" | "jpeg";
      maxAge?: number;
      startDate?: string;
      endDate?: string;
      orderBy?: "created_at" | "file_size" | "filename";
      orderDirection?: "ASC" | "DESC";
      limit?: number;
      offset?: number;
      // Legacy parameters
      browserId?: string;
      since?: string;
      includeMetadata?: boolean;
    };

    // Build database query from parameters
    // SECURITY: Always enforce team isolation - use context.teamId, never params.teamId
    const query: DBScreenshotQuery = {
      instanceId,
      sessionId: sessionId || browserId, // Map legacy browserId to sessionId
      teamId: context.teamId, // CRITICAL: Enforce team context over request parameters
      userId,
      tag,
      format,
      maxAge:
        maxAge || (since ? Math.floor((Date.now() - new Date(since).getTime()) / 1000) : undefined),
      startDate: startDate ? new Date(startDate) : since ? new Date(since) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      orderBy,
      orderDirection,
      limit: Math.min(limit, 100), // Cap at 100 as per tool definition
      offset,
    };

    try {
      // Use the database-backed screenshot inventory
      const result = await this.screenshotStorage.listScreenshots(query);

      logger.info("Listed screenshots from inventory", {
        teamId: context.teamId,
        count: result.items.length,
        total: result.total,
        hasMore: result.hasMore,
      });

      // Transform result to match expected MCP response format
      return {
        items: includeMetadata
          ? result.items
          : result.items.map((item) => ({
              id: item.id,
              filename: item.filename,
              filePath: item.filePath,
              sessionId: item.sessionId,
              browserId: item.browserId,
              format: item.format,
              fileSize: item.fileSize,
              width: item.width,
              height: item.height,
              tag: item.tag,
              createdAt: item.createdAt,
            })),
        total: result.total,
        hasMore: result.hasMore,
        nextOffset: result.nextOffset,
      };
    } catch (error) {
      logger.error("Failed to list screenshots", {
        error: error instanceof Error ? error.message : String(error),
        teamId: context.teamId,
      });

      // Fallback to filesystem scan if database fails
      logger.info("Falling back to filesystem scan");

      return this.fallbackFilesystemScan({
        since,
        limit,
        includeMetadata,
      });
    }
  }

  /**
   * Fallback filesystem scan for screenshots when database is unavailable
   */
  private async fallbackFilesystemScan(params: {
    since?: string;
    limit?: number;
    includeMetadata?: boolean;
  }): Promise<{ items: unknown[]; total: number }> {
    // Helper functions
    const toDate = (s?: string): Date | undefined => (s ? new Date(s) : undefined);
    const earlyReturn = (cond: boolean, value: unknown) => (cond ? value : undefined);
    const { since, limit = 20, includeMetadata = true } = params;
    const sinceDate = toDate(since);

    const home =
      (globalThis as unknown as { process?: { env?: Record<string, string> } }).process?.env?.[
        "HOME"
      ] || "";
    const baseDir = `${home}/.brooklyn/screenshots`;

    // Simple recursive scan utility (extracted to reduce complexity)
    const walkDirForPngs = async (dir: string, acc: string[] = []): Promise<string[]> => {
      try {
        const fsP = await import("node:fs/promises");
        const entries = await fsP.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const full = `${dir}/${entry.name}`;
          if (entry.isDirectory()) {
            await walkDirForPngs(full, acc);
          } else if (entry.name.endsWith(".png") || entry.name.endsWith(".jpeg")) {
            acc.push(full);
          }
        }
      } catch {
        // ignore errors and return current acc
      }
      return acc;
    };

    const allPngs = await walkDirForPngs(baseDir);
    // Early exit to reduce complexity when nothing found
    const nothing = earlyReturn(allPngs.length === 0, { items: [], total: 0 });
    if (nothing) return nothing as { items: unknown[]; total: number };

    // Map to stat + filter + sort desc by mtime
    const fsP = await import("node:fs/promises");
    const itemsRaw: Array<{
      filePath: string;
      filename: string;
      createdAt: string;
      fileSize?: number;
      metadataPath?: string;
    }> = [];

    for (const p of allPngs) {
      try {
        const st = await fsP.stat(p);
        if (sinceDate && st.mtime < sinceDate) continue;

        // Optional metadata file alongside
        const metaPath = p.replace(/\.(png|jpeg)$/i, ".metadata.json");
        let hasMeta = false;
        try {
          await fsP.access(metaPath);
          hasMeta = true;
        } catch {
          hasMeta = false;
        }

        itemsRaw.push({
          filePath: p,
          filename: p.split("/").pop() as string,
          createdAt: st.mtime.toISOString(),
          fileSize: st.size,
          metadataPath: hasMeta ? metaPath : undefined,
        });
      } catch {
        // ignore
      }
    }

    // Sort newest first
    itemsRaw.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    const limited = itemsRaw.slice(0, Number(limit) || 20);

    if (!includeMetadata) {
      return {
        items: limited,
        total: itemsRaw.length,
      };
    }

    // Attach dimensions if metadata is requested and available
    const withMeta = [];
    // helper for metadata merge
    const mergeMeta = async (it: {
      filePath: string;
      filename: string;
      createdAt: string;
      fileSize?: number;
      metadataPath?: string;
    }) => {
      if (!it.metadataPath) return it;
      try {
        const content = await fsP.readFile(it.metadataPath, "utf8");
        const parsed = JSON.parse(content);
        return {
          ...it,
          auditId: parsed?.auditId,
          dimensions: parsed?.dimensions,
        };
      } catch {
        return it;
      }
    };

    for (const it of limited) {
      withMeta.push(await mergeMeta(it));
    }

    return {
      items: withMeta,
      total: itemsRaw.length,
    };
  }

  /**
   * Get a screenshot by path or auditId
   * params:
   *  - path?: string
   *  - auditId?: string
   */
  private async getScreenshot(
    params: Record<string, unknown>,
    _context: MCPRequestContext,
  ): Promise<unknown> {
    const { path, auditId } = params as { path?: string; auditId?: string };

    if (!(path || auditId)) {
      throw new Error("get_screenshot requires either 'path' or 'auditId'");
    }

    const fsP = await import("node:fs/promises");

    const resolveByAudit = async (aid: string): Promise<string | undefined> => {
      const home =
        (globalThis as unknown as { process?: { env?: Record<string, string> } }).process?.env?.[
          "HOME"
        ] || "";
      const baseDir = `${home}/.brooklyn/screenshots`;

      // split into two helpers to drop cognitive complexity
      const readDir = async (dir: string) => {
        try {
          return await fsP.readdir(dir, { withFileTypes: true });
        } catch {
          return [];
        }
      };

      const checkMeta = async (filePath: string): Promise<string | undefined> => {
        try {
          const txt = await fsP.readFile(filePath, "utf8");
          const js = JSON.parse(txt);
          if (js?.auditId === aid) {
            return filePath.replace(/\.metadata\.json$/i, ".png");
          }
        } catch {
          // ignore
        }
        return undefined;
      };

      const searchDir = async (dir: string): Promise<string | undefined> => {
        const entries = await readDir(dir);
        for (const entry of entries) {
          const full = `${dir}/${entry.name}`;
          if (entry.isDirectory()) {
            const found = await searchDir(full);
            if (found) return found;
            continue;
          }
          if (entry.isFile() && entry.name.endsWith(".metadata.json")) {
            const maybe = await checkMeta(full);
            if (maybe) return maybe;
          }
        }
        return undefined;
      };

      return await searchDir(baseDir);
    };

    let targetPath = path;
    if (!targetPath && auditId) {
      targetPath = await resolveByAudit(auditId);
    }

    // Reduce branching complexity
    if (!targetPath) return { exists: false };

    try {
      // Normalize to string to satisfy fs.stat
      const normalizedPath = String(targetPath);
      const st = await fsP.stat(normalizedPath);
      const metaPath = normalizedPath.replace(/\.png$/i, ".metadata.json");
      let createdAt: string | undefined;
      let metadataPath: string | undefined;

      try {
        const metaStat = await fsP.stat(metaPath);
        if (metaStat) {
          createdAt = st.mtime.toISOString();
          metadataPath = metaPath;
        }
      } catch {
        createdAt = st.mtime.toISOString();
      }

      return {
        exists: true,
        filePath: normalizedPath,
        fileSize: st.size,
        createdAt,
        metadataPath,
      };
    } catch {
      return { exists: false };
    }
  }

  /**
   * Validate that a team has access to a browser
   */
  private validateBrowserAccess(browserId: string, teamId?: string): void {
    const session = this.activeSessions.get(browserId);

    if (!session) {
      throw new Error(`Browser session not found: ${browserId}`);
    }

    // If both have team IDs, they must match
    if (teamId && session.teamId && teamId !== session.teamId) {
      throw new Error(`Access denied: Browser ${browserId} belongs to team ${session.teamId}`);
    }
  }

  /**
   * Format errors for AI-friendly consumption
   */
  private formatError(error: unknown, tool: string): BrowserToolResponse["error"] {
    if (error instanceof Error) {
      // Common browser errors with AI-friendly messages
      if (error.message.includes("Timeout")) {
        return {
          code: "BROWSER_TIMEOUT",
          message: "The browser operation timed out. The page may be slow to load or unresponsive.",
          details: {
            tool,
            originalError: error.message,
            suggestion: "Try increasing the timeout or checking if the page is accessible.",
          },
        };
      }

      if (
        error.message.includes("Browser session not found") ||
        error.message.includes("No active browser session found") ||
        error.message.toLowerCase().includes("session not found")
      ) {
        // Normalize message to include the canonical phrase expected by tests
        const normalized =
          error.message.includes("Browser session not found") ||
          error.message.includes("No active browser session found")
            ? error.message
            : "Browser session not found";
        return {
          code: "BROOKLYN_SESSION_MISSING",
          message: normalized,
          details: { tool },
        };
      }

      if (error.message.includes("not found")) {
        return {
          code: "ELEMENT_NOT_FOUND",
          message:
            "Could not find the requested element on the page. The selector may be incorrect or the element may not have loaded yet.",
          details: {
            tool,
            originalError: error.message,
            suggestion: "Verify the selector is correct or wait for the page to fully load.",
          },
        };
      }

      if (error.message.includes("Access denied")) {
        return {
          code: "ACCESS_DENIED",
          message: error.message,
          details: { tool },
        };
      }

      // Default error formatting
      return {
        code: "BROWSER_ERROR",
        message: error.message,
        details: {
          tool,
          type: error.constructor.name,
        },
      };
    }

    // Unknown error type
    return {
      code: "UNKNOWN_ERROR",
      message: String(error),
      details: { tool },
    };
  }

  /**
   * Get router statistics
   */
  getStatistics(): {
    activeSessions: number;
    sessionsByTeam: Record<string, number>;
  } {
    const sessionsByTeam: Record<string, number> = {};

    for (const session of this.activeSessions.values()) {
      const team = session.teamId || "default";
      sessionsByTeam[team] = (sessionsByTeam[team] || 0) + 1;
    }

    return {
      activeSessions: this.activeSessions.size,
      sessionsByTeam,
    };
  }

  /**
   * Resolve a browserId from params and team context using a targeting strategy.
   * Supports:
   *  - params.browserId when valid
   *  - params.target: "latest" | "current" | "byId" (default "latest")
   * Fallback:
   *  - latest: most recently launched active session for this team
   *  - current: alias to most recently used for this team (tracked by createdAt usage)
   */
  private resolveBrowserId(params: Record<string, unknown>, teamId?: string): string {
    const explicit = (params as { browserId?: string }).browserId;
    const target = ((params as { target?: string }).target ?? "latest") as
      | "latest"
      | "current"
      | "byId";

    if (explicit) {
      if (this.activeSessions.has(explicit)) {
        const s = this.activeSessions.get(explicit);
        if (s) this.activeSessions.set(explicit, { ...s, createdAt: new Date() });
        return explicit;
      }
      if (target === "byId") {
        throw new Error(`Browser session not found: ${explicit}`);
      }
    }

    const entries = Array.from(this.activeSessions.entries()).filter(([, v]) => {
      if (!teamId) return true;
      return v.teamId === teamId;
    });

    if (entries.length === 0) {
      // Normalize to canonical phrase expected by tests
      throw new Error("Browser session not found");
    }

    entries.sort((a, b) => b[1].createdAt.getTime() - a[1].createdAt.getTime());
    const chosenEntry = entries[0];
    if (!chosenEntry) {
      throw new Error("No active browser session found. Launch a browser first.");
    }
    const chosen = chosenEntry[0];

    const existing = this.activeSessions.get(chosen);
    if (existing) {
      this.activeSessions.set(chosen, { ...existing, createdAt: new Date() });
    }

    return chosen;
  }

  // ========== JavaScript Execution Handlers (UX Speed Tools) ==========

  /**
   * Execute JavaScript in browser context
   * Enables instant UX modifications
   */
  private async executeScript(
    params: Record<string, unknown>,
    _context: MCPRequestContext,
  ): Promise<unknown> {
    const {
      browserId: _browserId,
      script,
      args,
      timeout,
      awaitPromise,
    } = params as {
      browserId: string;
      script: string;
      args?: unknown[];
      timeout?: number;
      awaitPromise?: boolean;
    };

    if (!script) {
      throw new Error("execute_script requires 'script' parameter");
    }

    const resolvedBrowserId = this.resolveBrowserId(params, _context.teamId);
    this.validateBrowserAccess(resolvedBrowserId, _context.teamId);

    const result = await this.poolManager.executeScript({
      browserId: resolvedBrowserId,
      script,
      args,
      timeout,
      awaitPromise,
    });

    return result;
  }

  /**
   * Evaluate JavaScript expression and return value
   */
  private async evaluateExpression(
    params: Record<string, unknown>,
    _context: MCPRequestContext,
  ): Promise<unknown> {
    const {
      browserId: _browserId,
      expression,
      timeout,
      awaitPromise,
    } = params as {
      browserId: string;
      expression: string;
      timeout?: number;
      awaitPromise?: boolean;
    };

    if (!expression) {
      throw new Error("evaluate_expression requires 'expression' parameter");
    }

    const resolvedBrowserId = this.resolveBrowserId(params, _context.teamId);
    this.validateBrowserAccess(resolvedBrowserId, _context.teamId);

    const result = await this.poolManager.evaluateExpression({
      browserId: resolvedBrowserId,
      expression,
      timeout,
      awaitPromise,
    });

    return result;
  }

  /**
   * Get console messages for debugging
   */
  private async getConsoleMessages(
    params: Record<string, unknown>,
    _context: MCPRequestContext,
  ): Promise<unknown> {
    const {
      browserId: _browserId,
      level,
      since,
      limit,
    } = params as {
      browserId: string;
      level?: "log" | "info" | "warn" | "error" | "debug";
      since?: string;
      limit?: number;
    };

    const resolvedBrowserId = this.resolveBrowserId(params, _context.teamId);
    this.validateBrowserAccess(resolvedBrowserId, _context.teamId);

    const result = await this.poolManager.getConsoleMessages({
      browserId: resolvedBrowserId,
      level,
      since,
      limit,
    });

    return result;
  }

  /**
   * Add script tag to inject utilities
   */
  private async addScriptTag(
    params: Record<string, unknown>,
    _context: MCPRequestContext,
  ): Promise<unknown> {
    const {
      browserId: _browserId,
      content,
      url,
      type,
    } = params as {
      browserId: string;
      content?: string;
      url?: string;
      type?: string;
    };

    if (!(content || url)) {
      throw new Error("add_script_tag requires either 'content' or 'url' parameter");
    }

    const resolvedBrowserId = this.resolveBrowserId(params, _context.teamId);
    this.validateBrowserAccess(resolvedBrowserId, _context.teamId);

    const result = await this.poolManager.addScriptTag({
      browserId: resolvedBrowserId,
      content,
      url,
      type,
    });

    return result;
  }

  // ========== CSS Analysis Handlers (UX Understanding Tools) ==========

  /**
   * Extract CSS styles for an element
   */
  private async extractCSS(
    params: Record<string, unknown>,
    _context: MCPRequestContext,
  ): Promise<unknown> {
    const {
      browserId: _browserId,
      selector,
      includeInherited,
      includeComputed,
      properties,
      pseudoElements,
      timeout,
    } = params as {
      browserId: string;
      selector: string;
      includeInherited?: boolean;
      includeComputed?: boolean;
      properties?: string[];
      pseudoElements?: string[];
      timeout?: number;
    };

    if (!selector) {
      throw new Error("extract_css requires 'selector' parameter");
    }

    const resolvedBrowserId = this.resolveBrowserId(params, _context.teamId);
    this.validateBrowserAccess(resolvedBrowserId, _context.teamId);

    const result = await this.poolManager.extractCSS({
      browserId: resolvedBrowserId,
      selector,
      includeInherited,
      includeComputed,
      properties,
      pseudoElements,
      timeout,
    });

    return result;
  }

  /**
   * Get computed styles with inheritance information
   */
  private async getComputedStyles(
    params: Record<string, unknown>,
    _context: MCPRequestContext,
  ): Promise<unknown> {
    const {
      browserId: _browserId,
      selector,
      properties,
      timeout,
    } = params as {
      browserId: string;
      selector: string;
      properties?: string[];
      timeout?: number;
    };

    if (!selector) {
      throw new Error("get_computed_styles requires 'selector' parameter");
    }

    const resolvedBrowserId = this.resolveBrowserId(params, _context.teamId);
    this.validateBrowserAccess(resolvedBrowserId, _context.teamId);

    const result = await this.poolManager.getComputedStyles({
      browserId: resolvedBrowserId,
      selector,
      properties,
      timeout,
    });

    return result;
  }

  /**
   * Diff CSS to track changes
   */
  private async diffCSS(
    params: Record<string, unknown>,
    _context: MCPRequestContext,
  ): Promise<unknown> {
    const {
      browserId: _browserId,
      selector,
      baseline,
      timeout,
    } = params as {
      browserId: string;
      selector: string;
      baseline: Record<string, string>;
      timeout?: number;
    };

    if (!selector) {
      throw new Error("diff_css requires 'selector' parameter");
    }
    if (!baseline) {
      throw new Error("diff_css requires 'baseline' parameter with previous styles");
    }

    const resolvedBrowserId = this.resolveBrowserId(params, _context.teamId);
    this.validateBrowserAccess(resolvedBrowserId, _context.teamId);

    const result = await this.poolManager.diffCSS({
      browserId: resolvedBrowserId,
      selector,
      baseline,
      timeout,
    });

    return result;
  }

  /**
   * Analyze CSS specificity to debug cascade issues
   */
  private async analyzeSpecificity(
    params: Record<string, unknown>,
    _context: MCPRequestContext,
  ): Promise<unknown> {
    const {
      browserId: _browserId,
      selector,
      timeout,
    } = params as {
      browserId: string;
      selector: string;
      timeout?: number;
    };

    if (!selector) {
      throw new Error("analyze_specificity requires 'selector' parameter");
    }

    const resolvedBrowserId = this.resolveBrowserId(params, _context.teamId);
    this.validateBrowserAccess(resolvedBrowserId, _context.teamId);

    const result = await this.poolManager.analyzeSpecificity({
      browserId: resolvedBrowserId,
      selector,
      timeout,
    });

    return result;
  }
}
