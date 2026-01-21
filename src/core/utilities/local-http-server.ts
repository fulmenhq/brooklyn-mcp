/**
 * Local HTTP Server Utility for Brooklyn MCP
 * Serves local files via HTTP to bypass browser security restrictions
 * MIT License - No external dependencies
 */

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { extname, join } from "node:path";
import type { Server } from "bun";
import { getLogger, type Logger } from "../../shared/pino-logger.js";

// Lazy logger initialization per AGENT.md requirements
let logger: Logger | null = null;
function ensureLogger(): Logger {
  if (!logger) {
    logger = getLogger("local-http-server");
  }
  return logger;
}

export interface LocalHttpServerConfig {
  port?: number; // Specific port or auto-find
  host?: string; // Default: "127.0.0.1"
  sessionId?: string; // Track server per session
}

export interface ServeResult {
  url: string; // Full URL to access file
  serverId: string; // Server instance ID
  port: number; // Actual port being used
}

export class LocalHttpServer {
  private static instances: Map<string, LocalHttpServer> = new Map();
  private static assetsPath?: string;
  private server?: Server<unknown>;
  private port?: number;
  private serverId: string;
  private fileRegistry: Map<string, string> = new Map(); // fileId -> path
  private pdfViewerRegistry: Map<string, { pdfPath: string; fileId: string }> = new Map(); // viewerId -> { pdfPath, fileId }

  constructor(serverId: string) {
    this.serverId = serverId;
  }

  /**
   * Get or create server instance for session
   */
  static async getInstance(sessionId?: string): Promise<LocalHttpServer> {
    const id = sessionId || "default";
    if (!LocalHttpServer.instances.has(id)) {
      const server = new LocalHttpServer(id);
      await server.start();
      LocalHttpServer.instances.set(id, server);
    }
    const instance = LocalHttpServer.instances.get(id);
    if (!instance) {
      throw new Error(`Failed to get server instance for ${id}`);
    }
    return instance;
  }

  /**
   * Start the HTTP server
   */
  async start(config?: LocalHttpServerConfig): Promise<void> {
    if (this.server) {
      ensureLogger().debug("Server already running", { serverId: this.serverId, port: this.port });
      return;
    }

    this.port = config?.port || (await this.findAvailablePort());

    this.server = Bun.serve({
      port: this.port,
      hostname: "127.0.0.1", // Localhost only!
      fetch: this.handleRequest.bind(this),
      error: this.handleError.bind(this),
    });

    ensureLogger().info("Local HTTP server started", {
      serverId: this.serverId,
      port: this.port,
      url: `http://127.0.0.1:${this.port}`,
    });
  }

  /**
   * Register a file for serving
   */
  async serveFile(filePath: string): Promise<ServeResult> {
    // Validate file exists and is readable
    if (!existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    // Generate secure file ID
    const fileId = this.generateFileId(filePath);
    this.fileRegistry.set(fileId, filePath);

    const url = `http://127.0.0.1:${this.port}/serve/${fileId}`;

    ensureLogger().debug("File registered for serving", {
      serverId: this.serverId,
      fileId,
      filePath,
      url,
    });

    return {
      url,
      serverId: this.serverId,
      port: this.port || 8080,
    };
  }

  /**
   * Handle HTTP requests
   */
  private async handleRequest(req: Request): Promise<Response> {
    const url = new URL(req.url);

    // Only accept localhost connections
    const host = req.headers.get("host");
    if (!(host?.startsWith("127.0.0.1") || host?.startsWith("localhost"))) {
      ensureLogger().warn("Rejected non-localhost request", { host, url: req.url });
      return new Response("Forbidden", { status: 403 });
    }

    // Add CORS headers for browser access
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    // Handle preflight
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // Route: /serve/:fileId
    if (url.pathname.startsWith("/serve/")) {
      const fileId = url.pathname.substring(7);
      const filePath = this.fileRegistry.get(fileId);

      if (!filePath) {
        ensureLogger().warn("File ID not found", { fileId, url: req.url });
        return new Response("Not Found", { status: 404, headers: corsHeaders });
      }

      return this.serveStaticFile(filePath, corsHeaders);
    }

    // Route: /assets/pdf.js/*
    if (url.pathname.startsWith("/assets/pdf.js/")) {
      return this.servePdfJsAsset(url.pathname, corsHeaders);
    }

    // Route: /viewer/pdf/:viewerId
    if (url.pathname.startsWith("/viewer/pdf/")) {
      const viewerId = url.pathname.substring(12);
      return this.servePdfViewer(viewerId, corsHeaders);
    }

    // Route: /health
    if (url.pathname === "/health") {
      return Response.json(
        {
          status: "ok",
          serverId: this.serverId,
          port: this.port,
          files: this.fileRegistry.size,
        },
        { headers: corsHeaders },
      );
    }

    return new Response("Not Found", { status: 404, headers: corsHeaders });
  }

  /**
   * Handle server errors
   */
  private handleError(error: Error): Response {
    ensureLogger().error("HTTP server error", {
      serverId: this.serverId,
      error: error.message,
    });
    return new Response("Internal Server Error", { status: 500 });
  }

  /**
   * Serve a static file with proper headers
   */
  private async serveStaticFile(
    filePath: string,
    corsHeaders: Record<string, string>,
  ): Promise<Response> {
    try {
      const file = Bun.file(filePath);
      const exists = await file.exists();

      if (!exists) {
        ensureLogger().warn("File not found on disk", { filePath });
        return new Response("Not Found", { status: 404, headers: corsHeaders });
      }

      // Set appropriate headers based on file type
      const headers: HeadersInit = {
        ...corsHeaders,
        "Cache-Control": "no-cache", // Always fresh for testing
      };

      // Add content-type based on extension
      const ext = extname(filePath).toLowerCase();
      const contentTypes: Record<string, string> = {
        ".pdf": "application/pdf",
        ".html": "text/html",
        ".svg": "image/svg+xml",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".json": "application/json",
        ".js": "application/javascript",
        ".mjs": "application/javascript", // ES modules for PDF.js worker
        ".css": "text/css",
        ".md": "text/markdown",
      };

      if (contentTypes[ext]) {
        headers["Content-Type"] = contentTypes[ext];
      }

      // Add Content-Disposition for PDFs to ensure browser renders them
      if (ext === ".pdf") {
        headers["Content-Disposition"] = "inline";
      }

      ensureLogger().debug("Serving file", {
        filePath,
        contentType: headers["Content-Type"],
        size: file.size,
      });

      // Stream the file
      return new Response(file.stream(), { headers });
    } catch (error) {
      ensureLogger().error("Failed to serve file", {
        filePath,
        error: error instanceof Error ? error.message : String(error),
      });
      return new Response("Internal Server Error", { status: 500, headers: corsHeaders });
    }
  }

  /**
   * Find an available port
   */
  private async findAvailablePort(start = 8080, end = 9000): Promise<number> {
    for (let port = start; port <= end; port++) {
      try {
        const testServer = Bun.serve({
          port,
          hostname: "127.0.0.1",
          fetch: () => new Response("test"),
        });
        testServer.stop();
        ensureLogger().debug("Found available port", { port });
        return port;
      } catch {}
    }
    throw new Error(`No available ports between ${start} and ${end}`);
  }

  /**
   * Generate secure file ID
   */
  private generateFileId(filePath: string): string {
    // Use hash of path + timestamp for security
    const input = `${filePath}-${Date.now()}-${Math.random()}`;
    const hash = Bun.hash(input);
    return hash.toString(36).substring(0, 16);
  }

  /**
   * Get server status
   */
  getStatus(): { running: boolean; port?: number; files: number } {
    return {
      running: !!this.server,
      port: this.port,
      files: this.fileRegistry.size,
    };
  }

  /**
   * Cleanup and shutdown
   */
  async stop(): Promise<void> {
    if (this.server) {
      this.server.stop();
      this.server = undefined;
      ensureLogger().info("Local HTTP server stopped", {
        serverId: this.serverId,
        filesServed: this.fileRegistry.size,
      });
    }
    this.fileRegistry.clear();
    LocalHttpServer.instances.delete(this.serverId);
  }

  /**
   * Cleanup all instances
   */
  static async stopAll(): Promise<void> {
    ensureLogger().info("Stopping all HTTP servers", { count: LocalHttpServer.instances.size });
    for (const [_id, server] of LocalHttpServer.instances) {
      await server.stop();
    }
    LocalHttpServer.instances.clear();
  }

  /**
   * Register PDF for viewer-based rendering
   */
  async servePdfWithViewer(pdfPath: string): Promise<ServeResult> {
    // Verify PDF.js assets are available (fail-fast)
    this.ensurePdfJsAssetsAvailable();

    // Register the PDF file and capture its fileId
    const pdfResult = await this.serveFile(pdfPath);
    const fileId = pdfResult.url.split("/").pop(); // Extract fileId from URL

    // Create viewer ID that maps to both the PDF path and fileId
    const viewerId = this.generateFileId(`${pdfPath}-viewer`);
    if (!fileId) {
      throw new Error("FileId is required for PDF viewer registration");
    }
    this.pdfViewerRegistry.set(viewerId, { pdfPath, fileId });

    const viewerUrl = `http://127.0.0.1:${this.port}/viewer/pdf/${viewerId}`;

    ensureLogger().debug("PDF registered with viewer", {
      serverId: this.serverId,
      viewerId,
      pdfPath,
      viewerUrl,
    });

    return {
      url: viewerUrl,
      serverId: this.serverId,
      port: this.port || 8080,
    };
  }

  /**
   * Verify PDF.js assets are available (fail-fast approach)
   */
  private ensurePdfJsAssetsAvailable(): void {
    const assetsPath = this.getAssetsPath();
    const pdfJsDir = join(assetsPath, "pdfjs");
    const pdfJsPath = join(pdfJsDir, "pdf.min.mjs");
    const pdfWorkerPath = join(pdfJsDir, "pdf.worker.min.mjs");

    if (!(existsSync(pdfJsPath) && existsSync(pdfWorkerPath))) {
      const missingFiles = [];
      if (!existsSync(pdfJsPath)) missingFiles.push("pdf.min.mjs");
      if (!existsSync(pdfWorkerPath)) missingFiles.push("pdf.worker.min.mjs");

      ensureLogger().error("PDF.js assets not found (fail-fast)", {
        assetsPath,
        pdfJsDir,
        missingFiles,
      });

      throw new Error(
        `PDF.js assets not found: ${missingFiles.join(", ")}. Run 'bun run setup:assets' to download required assets. Expected location: ${pdfJsDir}`,
      );
    }

    // Cache the assets path for serving
    if (!LocalHttpServer.assetsPath) {
      LocalHttpServer.assetsPath = assetsPath;
      ensureLogger().debug("PDF.js assets verified", { assetsPath: pdfJsDir });
    }
  }

  /**
   * Get configured assets path
   */
  private getAssetsPath(): string {
    // TODO: Load from brooklyn configuration when available
    // For now, use the standard location
    return join(homedir(), ".brooklyn", "assets");
  }

  /**
   * Serve PDF.js library assets from pre-downloaded location
   */
  private async servePdfJsAsset(
    pathname: string,
    corsHeaders: Record<string, string>,
  ): Promise<Response> {
    try {
      this.ensurePdfJsAssetsAvailable();
    } catch (error) {
      ensureLogger().warn("PDF.js assets not available", { error });
      return new Response(
        `PDF.js assets not available. Run 'bun run setup:assets' to download required assets.`,
        { status: 503, headers: corsHeaders },
      );
    }

    const assetName = pathname.substring(15); // Remove "/assets/pdf.js/"
    const pdfJsDir = join(this.getAssetsPath(), "pdfjs");
    const assetPath = join(pdfJsDir, assetName);

    if (!existsSync(assetPath)) {
      ensureLogger().warn("PDF.js asset not found", { assetName, assetPath });
      return new Response(
        `Asset not found: ${assetName}. Available assets should be in ${pdfJsDir}`,
        { status: 404, headers: corsHeaders },
      );
    }

    return this.serveStaticFile(assetPath, corsHeaders);
  }

  /**
   * Serve PDF viewer HTML page
   */
  private async servePdfViewer(
    viewerId: string,
    corsHeaders: Record<string, string>,
  ): Promise<Response> {
    const viewerData = this.pdfViewerRegistry.get(viewerId);
    if (!viewerData) {
      return new Response("Viewer not found", { status: 404, headers: corsHeaders });
    }

    // Use the existing fileId that was registered when the PDF was served
    const { fileId: pdfFileId } = viewerData;

    // Generate HTML viewer page
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>PDF Viewer - Brooklyn MCP</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: system-ui, -apple-system, sans-serif;
      overflow: hidden;
      background: #525659;
    }
    #pdf-container {
      position: relative;
      width: 100vw;
      height: 100vh;
      overflow: auto;
    }
    .pdf-page {
      position: relative;
      margin: 10px auto;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
      background: white;
    }
    .pdf-page canvas {
      display: block;
      width: 100%;
      height: auto;
    }
    /* Text layer for DOM accessibility */
    .textLayer {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      overflow: hidden;
      opacity: 0.2;
      line-height: 1;
    }
    .textLayer > div {
      color: transparent;
      position: absolute;
      white-space: pre;
      cursor: text;
      transform-origin: 0% 0%;
    }
    /* Make text selectable but invisible */
    .textLayer ::selection {
      background: rgba(0, 100, 255, 0.3);
    }
    /* Header/footer detection helpers */
    .textLayer > div[data-page-region="header"] {
      /* Top 10% of page */
    }
    .textLayer > div[data-page-region="footer"] {
      /* Bottom 10% of page */
    }
    #loading {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      color: white;
      font-size: 24px;
    }
  </style>
</head>
<body>
  <div id="loading">Loading PDF...</div>
  <div id="pdf-container"></div>
  
  <script type="module">
    // Import PDF.js library
    import * as pdfjsLib from '/assets/pdf.js/pdf.min.mjs';
  
    // Make it globally available
    window.pdfjsLib = pdfjsLib;
  
    // Configure PDF.js worker
    pdfjsLib.GlobalWorkerOptions.workerSrc = '/assets/pdf.js/pdf.worker.min.mjs';
  
    // Load and render PDF
    const pdfUrl = '/serve/${pdfFileId}';
    const container = document.getElementById('pdf-container');
    const loading = document.getElementById('loading');
  
    // Store page dimensions for region detection
    window.pdfPageInfo = [];
  
    async function renderPdf() {
      try {
        const pdf = await pdfjsLib.getDocument(pdfUrl).promise;
        const numPages = pdf.numPages;
  
        // Store PDF metadata
        window.pdfMetadata = {
          numPages,
          pages: []
        };
  
        // Render all pages
        for (let pageNum = 1; pageNum <= numPages; pageNum++) {
          await renderPage(pdf, pageNum);
        }
  
        loading.style.display = 'none';
  
        // Expose helper functions for Brooklyn
        window.brooklynPdfHelpers = {
          // Get all text elements (divs or spans)
          getTextElements: () => {
            // Try divs first (proper PDF.js setup), fall back to spans
            let elements = document.querySelectorAll('.textLayer > div');
            if (elements.length === 0) {
              elements = document.querySelectorAll('.textLayer > span');
            }
            return Array.from(elements);
          },
          getHeaderElements: () => {
            const elements = window.brooklynPdfHelpers.getTextElements();
            return elements.filter(el => {
              const rect = el.getBoundingClientRect();
              const pageTop = el.closest('.pdf-page').getBoundingClientRect().top;
              return (rect.top - pageTop) < 100; // Within 100px of page top
            });
          },
          getFooterElements: () => {
            const elements = window.brooklynPdfHelpers.getTextElements();
            return elements.filter(el => {
              const rect = el.getBoundingClientRect();
              const page = el.closest('.pdf-page');
              const pageBottom = page.getBoundingClientRect().bottom;
              return (pageBottom - rect.bottom) < 100; // Within 100px of page bottom
            });
          },
          getColumnLayout: () => {
            const columns = {};
            const elements = window.brooklynPdfHelpers.getTextElements();
            elements.forEach(el => {
              const x = Math.round(el.getBoundingClientRect().left / 50) * 50; // Group by 50px columns
              if (!columns[x]) columns[x] = [];
              columns[x].push(el.textContent);
            });
            return columns;
          },
          getTextByRegion: (x1, y1, x2, y2) => {
            const elements = window.brooklynPdfHelpers.getTextElements();
            return elements.filter(el => {
              const rect = el.getBoundingClientRect();
              return rect.left >= x1 && rect.top >= y1 && rect.right <= x2 && rect.bottom <= y2;
            }).map(el => el.textContent).join(' ');
          },
          // Get text organized by lines (works with both divs and spans)
          getTextLines: (pageNum) => {
            const pageSelector = pageNum ? \`.pdf-page[data-page-num="\${pageNum}"] .textLayer\` : '.textLayer';
            const elements = document.querySelectorAll(\`\${pageSelector} > div, \${pageSelector} > span\`);
            const lineMap = new Map();
  
            Array.from(elements).forEach(el => {
              const top = Math.round(parseFloat(el.style.top || el.offsetTop) * 10) / 10;
              if (!lineMap.has(top)) lineMap.set(top, []);
              lineMap.get(top).push({
                text: el.textContent,
                left: parseFloat(el.style.left || el.offsetLeft)
              });
            });
  
            // Sort and concatenate to form lines
            const lines = [];
            lineMap.forEach((items, top) => {
              items.sort((a, b) => a.left - b.left);
              lines.push({
                top,
                text: items.map(s => s.text).join('').trim(),
                elements: items.length
              });
            });
  
            return lines.sort((a, b) => a.top - b.top).map(l => l.text).filter(t => t.length > 0);
          },
  
          // === PHASE 1: WORD & LINE SPANS ===
          spans: {
            // Generate unique IDs for spans
            _spanIdCounter: 0,
            _generateId: function(prefix) {
              return \`\${prefix}_\${++this._spanIdCounter}\`;
            },
  
            // Build word spans from character elements
            buildWords: function(pageNum) {
              const elements = window.brooklynPdfHelpers.getTextElements();
              const pageElements = pageNum ?
                elements.filter(el => el.closest('.pdf-page').getAttribute('data-page-number') == pageNum) :
                elements;
  
              if (pageElements.length === 0) return [];
  
              // Convert DOM elements to character data
              const chars = [];
              pageElements.forEach(el => {
                const rect = el.getBoundingClientRect();
                const style = window.getComputedStyle(el);
                const pageContainer = el.closest('.pdf-page');
                const pageRect = pageContainer.getBoundingClientRect();
  
                // Convert to page-relative coordinates
                const x = rect.left - pageRect.left;
                const y = rect.top - pageRect.top;
                const width = rect.width;
                const height = rect.height;
  
                chars.push({
                  id: window.brooklynPdfHelpers.spans._generateId('c'),
                  element: el,
                  text: el.textContent || '',
                  bbox: [x, y, x + width, y + height],
                  fontSize: parseFloat(style.fontSize) || 12,
                  fontFamily: style.fontFamily || 'unknown',
                  page: pageNum || 1
                });
              });
  
              // Group characters into words using proximity
              const words = [];
              if (chars.length === 0) return words;
  
              // Sort by Y position (lines) then X position (left to right)
              chars.sort((a, b) => (a.bbox[1] - b.bbox[1]) || (a.bbox[0] - b.bbox[0]));
  
              // Group into lines first (by Y proximity)
              const lines = [];
              let currentLine = [chars[0]];
  
              for (let i = 1; i < chars.length; i++) {
                const char = chars[i];
                const lastChar = currentLine[currentLine.length - 1];
                const yDiff = Math.abs(char.bbox[1] - lastChar.bbox[1]);
                const lineHeightTolerance = Math.max(lastChar.fontSize, char.fontSize) * 0.35;
  
                if (yDiff <= lineHeightTolerance) {
                  currentLine.push(char);
                } else {
                  lines.push(currentLine);
                  currentLine = [char];
                }
              }
              lines.push(currentLine);
  
              // Within each line, group characters into words
              lines.forEach(line => {
                if (line.length === 0) return;
  
                // Sort line by X position
                line.sort((a, b) => a.bbox[0] - b.bbox[0]);
  
                // Calculate average character advance for gap detection
                const avgFontSize = line.reduce((sum, c) => sum + c.fontSize, 0) / line.length;
                const wordGapThreshold = avgFontSize * 0.45; // Tunable parameter
  
                let currentWord = [line[0]];
  
                for (let i = 1; i < line.length; i++) {
                  const char = line[i];
                  const lastChar = currentWord[currentWord.length - 1];
                  const gap = char.bbox[0] - lastChar.bbox[2]; // Gap between characters
  
                  if (gap <= wordGapThreshold) {
                    currentWord.push(char);
                  } else {
                    // Finalize current word
                    if (currentWord.length > 0) {
                      const wordText = currentWord.map(c => c.text).join('');
                      if (wordText.trim().length > 0) {
                        const wordBbox = [
                          Math.min(...currentWord.map(c => c.bbox[0])),
                          Math.min(...currentWord.map(c => c.bbox[1])),
                          Math.max(...currentWord.map(c => c.bbox[2])),
                          Math.max(...currentWord.map(c => c.bbox[3]))
                        ];
  
                        // Calculate confidence based on character consistency
                        const fontSizes = currentWord.map(c => c.fontSize);
                        const avgFontSize = fontSizes.reduce((a, b) => a + b, 0) / fontSizes.length;
                        const fontVariance = fontSizes.reduce((sum, fs) => sum + Math.abs(fs - avgFontSize), 0) / fontSizes.length;
                        const conf = Math.max(0.6, Math.min(1.0, 1.0 - (fontVariance / avgFontSize)));
  
                        words.push({
                          id: window.brooklynPdfHelpers.spans._generateId('w'),
                          text: wordText.trim(),
                          bbox: wordBbox,
                          page: pageNum || 1,
                          charIds: currentWord.map(c => c.id),
                          conf: conf,
                          fontSize: avgFontSize,
                          fontFamily: currentWord[0].fontFamily
                        });
                      }
                    }
                    currentWord = [char];
                  }
                }
  
                // Handle final word in line
                if (currentWord.length > 0) {
                  const wordText = currentWord.map(c => c.text).join('');
                  if (wordText.trim().length > 0) {
                    const wordBbox = [
                      Math.min(...currentWord.map(c => c.bbox[0])),
                      Math.min(...currentWord.map(c => c.bbox[1])),
                      Math.max(...currentWord.map(c => c.bbox[2])),
                      Math.max(...currentWord.map(c => c.bbox[3]))
                    ];
  
                    const fontSizes = currentWord.map(c => c.fontSize);
                    const avgFontSize = fontSizes.reduce((a, b) => a + b, 0) / fontSizes.length;
                    const fontVariance = fontSizes.reduce((sum, fs) => sum + Math.abs(fs - avgFontSize), 0) / fontSizes.length;
                    const conf = Math.max(0.6, Math.min(1.0, 1.0 - (fontVariance / avgFontSize)));
  
                    words.push({
                      id: window.brooklynPdfHelpers.spans._generateId('w'),
                      text: wordText.trim(),
                      bbox: wordBbox,
                      page: pageNum || 1,
                      charIds: currentWord.map(c => c.id),
                      conf: conf,
                      fontSize: avgFontSize,
                      fontFamily: currentWord[0].fontFamily
                    });
                  }
                }
              });
  
              return words;
            },
  
            // Build line spans from word spans
            buildLines: function(pageNum) {
              const words = this.buildWords(pageNum);
              if (words.length === 0) return [];
  
              const lines = [];
  
              // Group words into lines by Y proximity
              words.sort((a, b) => (a.bbox[1] - b.bbox[1]) || (a.bbox[0] - b.bbox[0]));
  
              let currentLineWords = [words[0]];
              let readingOrderIndex = 0;
  
              for (let i = 1; i < words.length; i++) {
                const word = words[i];
                const lastWord = currentLineWords[currentLineWords.length - 1];
                const yDiff = Math.abs(word.bbox[1] - lastWord.bbox[1]);
                const lineHeightTolerance = Math.max(lastWord.fontSize, word.fontSize) * 0.5;
  
                if (yDiff <= lineHeightTolerance) {
                  currentLineWords.push(word);
                } else {
                  // Finalize current line
                  if (currentLineWords.length > 0) {
                    lines.push(this._createLineFromWords(currentLineWords, readingOrderIndex++, pageNum));
                  }
                  currentLineWords = [word];
                }
              }
  
              // Handle final line
              if (currentLineWords.length > 0) {
                lines.push(this._createLineFromWords(currentLineWords, readingOrderIndex, pageNum));
              }
  
              return lines;
            },
  
            // Helper function to create a line span from words
            _createLineFromWords: function(words, readingOrderIndex, pageNum) {
              // Sort words by X position (left to right)
              words.sort((a, b) => a.bbox[0] - b.bbox[0]);
  
              // Calculate line bounding box
              const lineBbox = [
                Math.min(...words.map(w => w.bbox[0])),
                Math.min(...words.map(w => w.bbox[1])),
                Math.max(...words.map(w => w.bbox[2])),
                Math.max(...words.map(w => w.bbox[3]))
              ];
  
              // Detect text alignment
              const pageWidth = document.querySelector('.pdf-page').clientWidth;
              const leftMargin = lineBbox[0];
              const rightMargin = pageWidth - lineBbox[2];
              const lineWidth = lineBbox[2] - lineBbox[0];
  
              let align = 'left';
              if (Math.abs(leftMargin - rightMargin) < 20) {
                align = 'center';
              } else if (rightMargin < leftMargin && lineWidth > pageWidth * 0.7) {
                align = 'right';
              }
  
              // Calculate confidence based on word alignment consistency
              const wordSpacings = [];
              for (let i = 1; i < words.length; i++) {
                wordSpacings.push(words[i].bbox[0] - words[i-1].bbox[2]);
              }
              const avgSpacing = wordSpacings.length > 0 ?
                wordSpacings.reduce((a, b) => a + b, 0) / wordSpacings.length : 0;
              const spacingVariance = wordSpacings.length > 0 ?
                wordSpacings.reduce((sum, s) => sum + Math.abs(s - avgSpacing), 0) / wordSpacings.length : 0;
              const conf = Math.max(0.6, Math.min(1.0, 1.0 - (spacingVariance / Math.max(avgSpacing, 1))));
  
              return {
                id: window.brooklynPdfHelpers.spans._generateId('l'),
                page: pageNum || 1,
                wordIds: words.map(w => w.id),
                bbox: lineBbox,
                align: align,
                readingOrderIndex: readingOrderIndex,
                conf: conf,
                text: words.map(w => w.text).join(' ')
              };
            },
  
            // Debug visualization overlay
            renderDebugOverlay: function(types = ['words', 'lines'], pageNum) {
              // Remove existing overlay
              const existing = document.querySelector('.brooklyn-spans-overlay');
              if (existing) existing.remove();
  
              const pageElement = pageNum ?
                document.querySelector(\`.pdf-page[data-page-number="\${pageNum}"]\`) :
                document.querySelector('.pdf-page');
  
              if (!pageElement) {
                console.warn('No page element found for debug overlay');
                return;
              }
  
              const overlay = document.createElement('div');
              overlay.className = 'brooklyn-spans-overlay';
              overlay.style.cssText = \`
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                pointer-events: none;
                z-index: 1000;
              \`;
  
              // Draw word spans
              if (types.includes('words')) {
                const words = this.buildWords(pageNum);
                words.forEach(word => {
                  const wordEl = document.createElement('div');
                  wordEl.style.cssText = \`
                    position: absolute;
                    left: \${word.bbox[0]}px;
                    top: \${word.bbox[1]}px;
                    width: \${word.bbox[2] - word.bbox[0]}px;
                    height: \${word.bbox[3] - word.bbox[1]}px;
                    border: 1px dashed rgba(255, 0, 0, 0.6);
                    background: rgba(255, 0, 0, 0.1);
                  \`;
                  wordEl.title = \`Word: "\${word.text}" (conf: \${word.conf.toFixed(2)})\`;
                  overlay.appendChild(wordEl);
                });
              }
  
              // Draw line spans
              if (types.includes('lines')) {
                const lines = this.buildLines(pageNum);
                lines.forEach(line => {
                  const lineEl = document.createElement('div');
                  lineEl.style.cssText = \`
                    position: absolute;
                    left: \${line.bbox[0]}px;
                    top: \${line.bbox[1]}px;
                    width: \${line.bbox[2] - line.bbox[0]}px;
                    height: \${line.bbox[3] - line.bbox[1]}px;
                    border: 2px solid rgba(0, 0, 255, 0.8);
                    background: rgba(0, 0, 255, 0.05);
                  \`;
                  lineEl.title = \`Line: "\${line.text.substring(0, 50)}..." (align: \${line.align}, conf: \${line.conf.toFixed(2)})\`;
                  overlay.appendChild(lineEl);
                });
              }
  
              pageElement.style.position = 'relative';
              pageElement.appendChild(overlay);
  
              console.log('Brooklyn Debug Overlay Added:', {
                types,
                pageNum,
                wordsCount: types.includes('words') ? this.buildWords(pageNum).length : 0,
                linesCount: types.includes('lines') ? this.buildLines(pageNum).length : 0
              });
            },
  
            // Get span by ID
            getSpanById: function(spanId, pageNum) {
              if (spanId.startsWith('w_')) {
                return this.buildWords(pageNum).find(w => w.id === spanId);
              } else if (spanId.startsWith('l_')) {
                return this.buildLines(pageNum).find(l => l.id === spanId);
              }
              return undefined;
            },
  
            // Get text organized by words
            getTextByWords: function(pageNum) {
              return this.buildWords(pageNum).map(w => w.text);
            },
  
            // Get text organized by lines (enhanced version)
            getTextByLines: function(pageNum) {
              return this.buildLines(pageNum).map(l => l.text);
            }
          }
        };
  
      } catch (error) {
        console.error('Failed to render PDF:', error);
        loading.textContent = 'Failed to load PDF';
      }
    }
  
    async function renderPage(pdf, pageNum) {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.5 });
  
      // Create page container
      const pageDiv = document.createElement('div');
      pageDiv.className = 'pdf-page';
      pageDiv.id = \`page-\${pageNum}\`;
      pageDiv.style.width = viewport.width + 'px';
      pageDiv.style.height = viewport.height + 'px';
      pageDiv.setAttribute('data-page-number', pageNum);
  
      // Create canvas for visual rendering
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
  
      // Render PDF page to canvas
      await page.render({
        canvasContext: context,
        viewport: viewport
      }).promise;
  
      // Create text layer for DOM access
      const textLayerDiv = document.createElement('div');
      textLayerDiv.className = 'textLayer';
      textLayerDiv.style.width = viewport.width + 'px';
      textLayerDiv.style.height = viewport.height + 'px';
      // PDF.js 3.x requires --scale-factor CSS variable
      textLayerDiv.style.setProperty('--scale-factor', viewport.scale);
  
      // Get text content
      const textContent = await page.getTextContent();
  
      // PDF.js 4.x TextLayer class approach - more reliable than deprecated renderTextLayer
  
      // Render text layer with PDF.js 4.x TextLayer class API
      try {
        // Use PDF.js 4.x TextLayer class - more reliable and performant
        const textLayer = new pdfjsLib.TextLayer({
          textContentSource: textContent,
          container: textLayerDiv,
          viewport: viewport
        });
  
        // Native-first approach: render directly without timeout
        await textLayer.render();
      } catch (error) {
        console.warn('Text layer rendering failed, using fallback:', error);
  
        // Improved fallback: group text items into lines and words
        const lineGroups = new Map();
        const lineHeight = 5; // Tolerance for grouping items on same line
  
        // Group items by vertical position (same line)
        textContent.items.forEach((item) => {
          if (item.str && item.str.trim()) {
            const y = Math.round(item.transform[5] / lineHeight) * lineHeight;
            if (!lineGroups.has(y)) {
              lineGroups.set(y, []);
            }
            lineGroups.get(y).push({
              text: item.str,
              x: item.transform[4],
              y: item.transform[5],
              fontSize: Math.abs(item.transform[0]),
              width: item.width
            });
          }
        });
  
        // Create spans for each line, grouping adjacent items
        lineGroups.forEach((items, lineY) => {
          // Sort items by horizontal position
          items.sort((a, b) => a.x - b.x);
  
          // Group adjacent items into words/phrases
          let currentGroup = [];
          const wordGap = 8; // Pixels gap to determine word boundaries
  
          for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const nextItem = items[i + 1];
  
            currentGroup.push(item);
  
            // Check if we should end the current group
            const shouldEndGroup = !nextItem || (nextItem.x - (item.x + (item.width || 0))) > wordGap;
  
            if (shouldEndGroup) {
              createGroupSpan(currentGroup, textLayerDiv);
              currentGroup = [];
            }
          }
        });
  
        function createGroupSpan(group, container) {
          const span = document.createElement('span');
          span.textContent = group.map(item => item.text).join('');
          span.style.position = 'absolute';
          span.style.left = group[0].x + 'px';
          span.style.top = group[0].y + 'px';
          span.style.fontSize = group[0].fontSize + 'px';
          container.appendChild(span);
        }
      }
  
      // Mark header/footer regions (works with both divs and spans)
      setTimeout(() => {
        const pageHeight = viewport.height;
        const textElements = textLayerDiv.querySelectorAll('div, span');
        textElements.forEach(el => {
          const top = parseFloat(el.style.top || '0');
          if (top < pageHeight * 0.1) {
            el.setAttribute('data-page-region', 'header');
          } else if (top > pageHeight * 0.9) {
            el.setAttribute('data-page-region', 'footer');
          }
          // Store position data
          el.setAttribute('data-page', pageNum);
          el.setAttribute('data-x', el.style.left || '0');
          el.setAttribute('data-y', el.style.top || '0');
        });
      }, 100);
  
      // Assemble page
      pageDiv.appendChild(canvas);
      pageDiv.appendChild(textLayerDiv);
      container.appendChild(pageDiv);
  
      // Store page info
      window.pdfMetadata.pages.push({
        number: pageNum,
        width: viewport.width,
        height: viewport.height,
        scale: 1.5
      });
    }
  
    // Start rendering
    renderPdf();
  </script>
</body>
</html>`;

    const headers = {
      ...corsHeaders,
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache",
    };

    return new Response(html, { headers });
  }
}
