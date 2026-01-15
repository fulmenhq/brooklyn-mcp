/**
 * Asset Test Helper Utilities
 * Common utilities for testing Brooklyn asset management
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface MockAssetFile {
  filename: string;
  sources: string[];
  expectedSize: number;
  contentType: string;
  checksums?: {
    sha256?: string;
  };
}

export interface MockAssetConfig {
  version: string;
  description?: string;
  enabled: boolean;
  files: MockAssetFile[];
}

export interface MockAssetsManifest {
  version: string;
  assets: Record<string, MockAssetConfig>;
}

/**
 * Create a mock asset manifest with valid structure
 */
export function createMockAssetManifest(): MockAssetsManifest {
  return {
    version: "1.0.0",
    assets: {
      pdfjs: {
        version: "4.8.69",
        description: "PDF.js library for browser-based PDF rendering",
        enabled: true,
        files: [
          {
            filename: "pdf.min.mjs",
            sources: [
              "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.8.69/build/pdf.min.mjs",
              "https://unpkg.com/pdfjs-dist@4.8.69/build/pdf.min.mjs",
            ],
            expectedSize: 148576,
            contentType: "application/javascript",
            checksums: {
              sha256: "a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456",
            },
          },
          {
            filename: "pdf.worker.min.mjs",
            sources: ["https://cdn.jsdelivr.net/npm/pdfjs-dist@4.8.69/build/pdf.worker.min.mjs"],
            expectedSize: 821304,
            contentType: "application/javascript",
          },
        ],
      },
      mermaid: {
        version: "10.6.1",
        description: "Mermaid diagram library",
        enabled: false,
        files: [
          {
            filename: "mermaid.min.js",
            sources: ["https://cdn.jsdelivr.net/npm/mermaid@10.6.1/dist/mermaid.min.js"],
            expectedSize: 1247890,
            contentType: "application/javascript",
          },
        ],
      },
    },
  };
}

/**
 * Create temporary assets directory for testing
 */
export function createTempAssetsDir(baseTempDir: string): string {
  const assetsDir = join(baseTempDir, ".brooklyn", "assets");
  mkdirSync(assetsDir, { recursive: true });
  return assetsDir;
}

/**
 * Create mock PDF.js assets in a directory
 */
export function createMockPdfJsAssets(assetsDir: string): void {
  const pdfJsDir = join(assetsDir, "pdfjs");
  mkdirSync(pdfJsDir, { recursive: true });

  // Create mock PDF.js library file
  writeFileSync(
    join(pdfJsDir, "pdf.min.mjs"),
    `// Mock PDF.js Library v4.8.69
export const pdfjsLib = {
  version: "4.8.69",
  GlobalWorkerOptions: { workerSrc: null },
  getDocument: () => ({ promise: Promise.resolve({ numPages: 1 }) })
};
export default pdfjsLib;`,
  );

  // Create mock PDF.js worker file
  writeFileSync(
    join(pdfJsDir, "pdf.worker.min.mjs"),
    `// Mock PDF.js Worker v4.8.69
self.addEventListener("message", (e) => {
  self.postMessage({ type: "ready", data: { version: "4.8.69" } });
});`,
  );
}

/**
 * Mock network response for fetch operations
 */
export function mockNetworkResponse(
  status: number,
  content?: string,
  contentType?: string,
): Response {
  const headers = new Headers();
  if (contentType) {
    headers.set("content-type", contentType);
  }

  return new Response(content || "", {
    status,
    statusText: status === 200 ? "OK" : "Error",
    headers,
  });
}

/**
 * Create invalid manifest for schema validation testing
 */
export function createInvalidAssetManifest(): object {
  return {
    version: "invalid-version-format",
    assets: {
      pdfjs: {
        // Missing required version field
        enabled: "not-a-boolean", // Should be boolean
        files: [
          {
            filename: "pdf.min.mjs",
            // Missing required sources field
            expectedSize: "not-a-number", // Should be number
            contentType: "application/javascript",
          },
        ],
      },
    },
  };
}

/**
 * Create partial manifest missing required fields
 */
export function createPartialAssetManifest(): object {
  return {
    version: "1.0.0",
    // Missing required 'assets' field
  };
}

/**
 * Mock file size validation with tolerance
 */
export function validateFileSize(
  actualSize: number,
  expectedSize: number,
  tolerance = 0.15,
): boolean {
  return Math.abs(actualSize - expectedSize) / expectedSize < tolerance;
}

/**
 * Generate mock text content for PDF testing
 */
export function generateMockPdfTextContent(
  pageNumber = 1,
): Array<{ str: string; transform: number[] }> {
  if (pageNumber === 1) {
    return [
      { str: "R", transform: [12, 0, 0, 12, 74, 669] },
      { str: "e", transform: [12, 0, 0, 12, 88, 669] },
      { str: "t", transform: [12, 0, 0, 12, 102, 669] },
      { str: "a", transform: [12, 0, 0, 12, 116, 669] },
      { str: "i", transform: [12, 0, 0, 12, 130, 669] },
      { str: "l", transform: [12, 0, 0, 12, 144, 669] },
    ];
  }

  // Generate mock text for other pages
  return Array.from({ length: 10 }, (_, i) => ({
    str: `Page ${pageNumber} Word ${i + 1}`,
    transform: [10, 0, 0, 10, 72 + (i % 3) * 100, 700 - Math.floor(i / 3) * 30],
  }));
}

/**
 * Mock PDF viewer HTML template
 */
export function generateMockPdfViewerHtml(pdfUrl: string, port: number): string {
  return `<!DOCTYPE html>
<html>
<head>
    <title>PDF Viewer - Brooklyn MCP</title>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body { margin: 0; font-family: sans-serif; }
        #pdf-container { width: 100%; height: 100vh; }
        .text-layer { position: absolute; top: 0; left: 0; pointer-events: none; }
        .text-layer div { position: absolute; color: transparent; }
    </style>
</head>
<body>
    <div id="pdf-container">
        <div class="text-layer"></div>
    </div>
  
    <script type="module">
        import { pdfjsLib } from "/assets/pdf.js/pdf.min.mjs";
  
        // Configure worker
        pdfjsLib.GlobalWorkerOptions.workerSrc = "http://127.0.0.1:${port}/assets/pdf.js/pdf.worker.min.mjs";
  
        // PDF URL injected by server
        window.pdfUrl = "${pdfUrl}";
  
        // Mock PDF.js helpers for character-level extraction
        window.brooklynPdfHelpers = {
            getTextElements: () => document.querySelectorAll('.text-layer div'),
            getTextLines: (page) => Array.from(document.querySelectorAll(\`[data-page="\${page}"]\`))
        };
  
        console.log("Brooklyn PDF Viewer initialized");
    </script>
</body>
</html>`;
}

/**
 * Create mock asset schema for validation testing
 */
export function createMockAssetSchema(): object {
  return {
    $schema: "http://json-schema.org/draft-07/schema#",
    $id: "https://brooklyn.fulmenhq.com/schemas/brooklyn-assets-v1",
    title: "Brooklyn MCP Asset Configuration",
    type: "object",
    required: ["version", "assets"],
    properties: {
      version: {
        type: "string",
        pattern: "^\\\\d+\\\\.\\\\d+\\\\.\\\\d+(-[a-zA-Z0-9-]+)?$",
      },
      assets: {
        type: "object",
        additionalProperties: {
          type: "object",
          required: ["version", "enabled", "files"],
          properties: {
            version: { type: "string" },
            description: { type: "string" },
            enabled: { type: "boolean" },
            files: {
              type: "array",
              items: {
                type: "object",
                required: ["filename", "sources", "expectedSize", "contentType"],
                properties: {
                  filename: { type: "string" },
                  sources: {
                    type: "array",
                    items: { type: "string", format: "uri" },
                    minItems: 1,
                  },
                  expectedSize: { type: "number", minimum: 1 },
                  contentType: { type: "string" },
                  checksums: {
                    type: "object",
                    properties: {
                      sha256: { type: "string", pattern: "^[a-f0-9]{64}$" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    additionalProperties: false,
  };
}
