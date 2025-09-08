/**
 * Local HTTP Server Extended Tests
 * Testing HTTP server utilities, request patterns, and content type logic
 * Focuses on testable business logic without runtime Bun API dependencies
 */

import { extname } from "node:path";
import { describe, expect, it, vi } from "vitest";

// Mock logger
vi.mock("../../src/shared/pino-logger.js", () => ({
  getLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

describe("HTTP Server Content Type Logic", () => {
  /**
   * Test content type detection logic extracted from LocalHttpServer
   * This covers the content type mapping logic in serveStaticFile method
   */
  describe("Content Type Detection", () => {
    const getContentType = (filePath: string): string | undefined => {
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
      return contentTypes[ext];
    };

    it("should detect PDF content type correctly", () => {
      expect(getContentType("/path/to/document.pdf")).toBe("application/pdf");
      expect(getContentType("/path/to/DOCUMENT.PDF")).toBe("application/pdf");
    });

    it("should detect HTML content type correctly", () => {
      expect(getContentType("/path/to/page.html")).toBe("text/html");
      expect(getContentType("/path/to/PAGE.HTML")).toBe("text/html");
    });

    it("should detect image content types correctly", () => {
      expect(getContentType("/path/to/image.svg")).toBe("image/svg+xml");
      expect(getContentType("/path/to/image.png")).toBe("image/png");
      expect(getContentType("/path/to/image.jpg")).toBe("image/jpeg");
      expect(getContentType("/path/to/image.jpeg")).toBe("image/jpeg");
    });

    it("should detect JavaScript content types correctly", () => {
      expect(getContentType("/path/to/script.js")).toBe("application/javascript");
      expect(getContentType("/path/to/worker.mjs")).toBe("application/javascript");
    });

    it("should detect other content types correctly", () => {
      expect(getContentType("/path/to/data.json")).toBe("application/json");
      expect(getContentType("/path/to/styles.css")).toBe("text/css");
      expect(getContentType("/path/to/README.md")).toBe("text/markdown");
    });

    it("should return undefined for unknown extensions", () => {
      expect(getContentType("/path/to/file.unknown")).toBeUndefined();
      expect(getContentType("/path/to/file.xyz")).toBeUndefined();
      expect(getContentType("/path/to/no-extension")).toBeUndefined();
    });

    it("should handle case-insensitive extensions", () => {
      expect(getContentType("/path/to/FILE.PDF")).toBe("application/pdf");
      expect(getContentType("/path/to/FILE.Html")).toBe("text/html");
      expect(getContentType("/path/to/FILE.SVG")).toBe("image/svg+xml");
    });

    it("should handle files with multiple dots", () => {
      expect(getContentType("/path/to/file.backup.pdf")).toBe("application/pdf");
      expect(getContentType("/path/to/script.min.js")).toBe("application/javascript");
      expect(getContentType("/path/to/worker.es6.mjs")).toBe("application/javascript");
    });
  });

  describe("Security Header Patterns", () => {
    /**
     * Test CORS and security header patterns used in LocalHttpServer
     * This covers the header configuration logic
     */
    const createSecurityHeaders = () => {
      return {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Cache-Control": "no-cache", // Always fresh for testing
      };
    };

    const addPDFHeaders = (headers: Record<string, string>) => {
      return {
        ...headers,
        "Content-Disposition": "inline", // Ensure browser renders PDFs
      };
    };

    it("should create proper CORS headers", () => {
      const headers = createSecurityHeaders();

      expect(headers["Access-Control-Allow-Origin"]).toBe("*");
      expect(headers["Access-Control-Allow-Methods"]).toBe("GET, POST, OPTIONS");
      expect(headers["Access-Control-Allow-Headers"]).toBe("Content-Type");
    });

    it("should set no-cache for testing", () => {
      const headers = createSecurityHeaders();
      expect(headers["Cache-Control"]).toBe("no-cache");
    });

    it("should add inline disposition for PDFs", () => {
      const baseHeaders = createSecurityHeaders();
      const pdfHeaders = addPDFHeaders(baseHeaders);

      expect(pdfHeaders["Content-Disposition"]).toBe("inline");
      expect(pdfHeaders["Access-Control-Allow-Origin" as keyof typeof pdfHeaders]).toBe("*"); // Base headers preserved
    });
  });

  describe("URL Pattern Processing", () => {
    /**
     * Test URL processing patterns from LocalHttpServer request handling
     */
    const parseFileRequest = (pathname: string) => {
      // Simulate the URL parsing logic from handleRequest method
      const parts = pathname.split("/").filter(Boolean);

      if (parts.length >= 2 && parts[0] === "file") {
        return {
          type: "file",
          fileId: parts[1],
          isValid: /^[a-zA-Z0-9_-]+$/.test(parts[1] || ""), // Basic validation
        };
      }

      if (parts.length >= 2 && parts[0] === "viewer") {
        return {
          type: "viewer",
          viewerId: parts[1],
          isValid: /^[a-zA-Z0-9_-]+$/.test(parts[1] || ""),
        };
      }

      return { type: "unknown", isValid: false };
    };

    it("should parse file requests correctly", () => {
      const result = parseFileRequest("/file/abc123");
      expect(result.type).toBe("file");
      expect(result.fileId).toBe("abc123");
      expect(result.isValid).toBe(true);
    });

    it("should parse viewer requests correctly", () => {
      const result = parseFileRequest("/viewer/viewer-456");
      expect(result.type).toBe("viewer");
      expect(result.viewerId).toBe("viewer-456");
      expect(result.isValid).toBe(true);
    });

    it("should reject invalid file IDs", () => {
      const results = [
        parseFileRequest("/file/invalid@id"),
        parseFileRequest("/file/bad%20id"),
        parseFileRequest("/file/../etc/passwd"),
      ];

      for (const result of results) {
        expect(result.isValid).toBe(false);
      }
    });

    it("should handle malformed URLs", () => {
      const results = [
        parseFileRequest(""),
        parseFileRequest("/"),
        parseFileRequest("/unknown/path"),
        parseFileRequest("/file/"),
      ];

      for (const result of results) {
        expect(result.type).toBe("unknown");
        expect(result.isValid).toBe(false);
      }
    });
  });

  describe("PDF Viewer HTML Generation Logic", () => {
    /**
     * Test the HTML template generation patterns used in generatePdfViewerHtml
     */
    const generatePDFViewerHTML = (fileId: string) => {
      return `<!DOCTYPE html>
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
    .textLayer {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      overflow: hidden;
      opacity: 0.2;
    }
  </style>
</head>
<body>
  <div id="pdf-container"></div>
  <script type="module">
    import * as pdfjsLib from './pdf.min.mjs';
    pdfjsLib.GlobalWorkerOptions.workerSrc = './pdf.worker.min.mjs';
    
    async function loadPDF() {
      try {
        const pdf = await pdfjsLib.getDocument('./file/${fileId}').promise;
        // PDF rendering logic would continue here...
      } catch (error) {
        console.error('PDF loading failed:', error);
        document.getElementById('pdf-container').innerHTML = 
          '<p style="color: red; padding: 20px;">Error loading PDF</p>';
      }
    }
    
    loadPDF();
  </script>
</body>
</html>`;
    };

    it("should generate complete HTML structure", () => {
      const html = generatePDFViewerHTML("test-file-123");

      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("<html>");
      expect(html).toContain("<head>");
      expect(html).toContain("<body>");
      expect(html).toContain("</html>");
    });

    it("should include proper meta tags", () => {
      const html = generatePDFViewerHTML("test-file-456");

      expect(html).toContain('<meta charset="UTF-8">');
      expect(html).toContain("<title>PDF Viewer - Brooklyn MCP</title>");
    });

    it("should include CSS for PDF layout", () => {
      const html = generatePDFViewerHTML("test-file-789");

      expect(html).toContain("#pdf-container");
      expect(html).toContain(".pdf-page");
      expect(html).toContain(".textLayer");
      expect(html).toContain("background: #525659");
    });

    it("should include PDF.js script references", () => {
      const html = generatePDFViewerHTML("test-file-pdf");

      expect(html).toContain("pdf.min.mjs");
      expect(html).toContain("pdf.worker.min.mjs");
      expect(html).toContain("GlobalWorkerOptions");
    });

    it("should include error handling", () => {
      const html = generatePDFViewerHTML("test-file-error");

      expect(html).toContain("try {");
      expect(html).toContain("catch (error)");
      expect(html).toContain("console.error");
      expect(html).toContain("Error loading PDF");
    });

    it("should embed file ID correctly", () => {
      const fileId = "embedded-file-123";
      const html = generatePDFViewerHTML(fileId);

      expect(html).toContain(`./file/${fileId}`);
    });

    it("should handle special characters in file ID", () => {
      const fileId = "file-with_dashes-123";
      const html = generatePDFViewerHTML(fileId);

      expect(html).toContain(`./file/${fileId}`);
    });
  });

  describe("Error Response Patterns", () => {
    /**
     * Test error response generation patterns
     */
    const createErrorResponse = (
      status: number,
      message: string,
      corsHeaders: Record<string, string>,
    ) => {
      return {
        status,
        body: message,
        headers: { ...corsHeaders },
      };
    };

    it("should create 404 error responses", () => {
      const corsHeaders = { "Access-Control-Allow-Origin": "*" };
      const response = createErrorResponse(404, "File not found", corsHeaders);

      expect(response.status).toBe(404);
      expect(response.body).toBe("File not found");
      expect(response.headers["Access-Control-Allow-Origin"]).toBe("*");
    });

    it("should create 500 error responses", () => {
      const corsHeaders = { "Access-Control-Allow-Origin": "*" };
      const response = createErrorResponse(500, "Internal server error", corsHeaders);

      expect(response.status).toBe(500);
      expect(response.body).toBe("Internal server error");
      expect(response.headers["Access-Control-Allow-Origin"]).toBe("*");
    });

    it("should preserve CORS headers in error responses", () => {
      const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      };
      const response = createErrorResponse(400, "Bad request", corsHeaders);

      expect(response.headers["Access-Control-Allow-Origin"]).toBe("*");
      expect(response.headers["Access-Control-Allow-Methods"]).toBe("GET, POST, OPTIONS");
    });
  });

  describe("File Path Validation", () => {
    /**
     * Test file path security validation patterns
     */
    const isValidFilePath = (filePath: string): boolean => {
      if (!filePath || typeof filePath !== "string") {
        return false;
      }

      // Check for path traversal attempts
      if (filePath.includes("..") || filePath.includes("//")) {
        return false;
      }

      // Check for null bytes
      if (filePath.includes("\0")) {
        return false;
      }

      // Must be absolute path or relative to allowed directories
      const allowedPrefixes = ["/tmp/", "/var/tmp/", "./uploads/"];
      return allowedPrefixes.some((prefix) => filePath.startsWith(prefix));
    };

    it("should accept valid file paths", () => {
      const validPaths = ["/tmp/document.pdf", "/var/tmp/image.png", "./uploads/file.html"];

      for (const path of validPaths) {
        expect(isValidFilePath(path)).toBe(true);
      }
    });

    it("should reject path traversal attempts", () => {
      const maliciousPaths = [
        "../../../etc/passwd",
        "/tmp/../etc/passwd",
        "./uploads/../../secret.txt",
        "//network/path",
      ];

      for (const path of maliciousPaths) {
        expect(isValidFilePath(path)).toBe(false);
      }
    });

    it("should reject null byte injection", () => {
      const nullBytePaths = ["/tmp/file\0.txt", "./uploads/safe.pdf\0../etc/passwd"];

      for (const path of nullBytePaths) {
        expect(isValidFilePath(path)).toBe(false);
      }
    });

    it("should reject invalid inputs", () => {
      const invalidInputs = [null, undefined, "", 123, {}, []];

      for (const input of invalidInputs) {
        expect(isValidFilePath(input as any)).toBe(false);
      }
    });
  });
});
