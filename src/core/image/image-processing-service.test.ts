/**
 * Unit tests for Image Processing Service
 * Tests SVG compression, analysis, and format conversion functionality
 */

import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ImageProcessingService } from "./image-processing-service.js";

// Mock node:fs/promises
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  stat: vi.fn(),
}));

// Mock svgo
vi.mock("svgo", () => ({
  optimize: vi.fn(),
}));

const { mockNewContext, mockRoute, mockSetContent } = vi.hoisted(() => {
  type RouteHandler = (route: {
    request(): { url(): string };
    continue(): Promise<unknown>;
    abort(errorCode?: string): Promise<unknown>;
  }) => Promise<unknown> | unknown;
  const mockRoute = vi.fn<(url: string, handler: RouteHandler) => Promise<void>>(async () => {});
  const mockSetContent = vi.fn<(html: string, options?: unknown) => Promise<void>>(async () => {});
  const mockNewContext = vi.fn(async () => ({
    newPage: async () => ({
      setViewportSize: async () => {},
      setContent: mockSetContent,
      screenshot: async () => Buffer.from("fake-png-data"),
      route: mockRoute,
    }),
  }));
  return { mockNewContext, mockRoute, mockSetContent };
});

// Mock Playwright
vi.mock("playwright", () => ({
  chromium: {
    launch: vi.fn(async () => ({
      newContext: mockNewContext,
      close: async () => {},
    })),
  },
}));

// Mock xml2js
vi.mock("xml2js", () => ({
  parseString: vi.fn(),
}));

describe("ImageProcessingService", () => {
  let service: ImageProcessingService;
  let mockReadFile: ReturnType<typeof vi.fn>;
  let mockWriteFile: ReturnType<typeof vi.fn>;
  let mockStat: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    service = new ImageProcessingService();

    // Get fresh mock references
    const fs = await import("node:fs/promises");
    mockReadFile = vi.mocked(fs.readFile);
    mockWriteFile = vi.mocked(fs.writeFile);
    mockStat = vi.mocked(fs.stat);

    // Reset all mocks
    vi.clearAllMocks();
  });

  describe("compressSVG", () => {
    it("should compress SVG file successfully", async () => {
      // Arrange
      const mockSVGContent = '<svg><rect width="100" height="100"/></svg>';
      const mockOptimizedContent = '<svg><rect width="100" height="100"/></svg>'; // Simplified for test

      mockReadFile.mockResolvedValue(mockSVGContent);
      mockStat.mockResolvedValue({ size: 100 });

      const { optimize } = await import("svgo");
      vi.mocked(optimize).mockReturnValue({
        data: mockOptimizedContent,
      } as any);

      const args = {
        filePath: "/test/input.svg",
        outputPath: "/test/output.svg",
      };

      // Act
      const result = await service.compressSVG(args);

      // Assert
      expect(result.success).toBe(true);
      expect(result.originalSize).toBe(100);
      expect(result.outputPath).toBe("/test/output.svg");
      expect(mockWriteFile).toHaveBeenCalledWith("/test/output.svg", mockOptimizedContent, "utf-8");
    });

    it("should handle SVG compression errors gracefully", async () => {
      // Arrange
      mockReadFile.mockRejectedValue(new Error("File not found"));

      const args = {
        filePath: "/test/nonexistent.svg",
      };

      // Act
      const result = await service.compressSVG(args);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain("File not found");
    });

    it("should generate default output path when not provided", async () => {
      // Arrange
      const mockSVGContent = '<svg><rect width="100" height="100"/></svg>';

      mockReadFile.mockResolvedValue(mockSVGContent);
      mockStat.mockResolvedValue({ size: 100 });

      const { optimize } = await import("svgo");
      vi.mocked(optimize).mockReturnValue({
        data: mockSVGContent,
      } as any);

      const args = {
        filePath: "/test/input.svg",
      };

      // Act
      const result = await service.compressSVG(args);

      // Assert
      expect(result.success).toBe(true);
      expect(result.outputPath).toBe(join("/test", "input-compressed.svg"));
    });
  });

  describe("analyzeSVG", () => {
    it("should analyze SVG file successfully", async () => {
      // Arrange
      const mockSVGContent = '<svg><rect width="100" height="100"/><path d="M10,10 L20,20"/></svg>';

      mockReadFile.mockResolvedValue(mockSVGContent);
      mockStat.mockResolvedValue({ size: 200 });

      const { parseString } = await import("xml2js");
      vi.mocked(parseString).mockImplementation((...args: any[]) => {
        const callback = args[args.length - 1];
        callback(null, {
          svg: {
            rect: [{}],
            path: [{}],
          },
        });
      });

      const args = {
        filePath: "/test/input.svg",
      };

      // Act
      const result = await service.analyzeSVG(args);

      // Assert
      expect(result.success).toBe(true);
      expect(result.fileSize).toBe(200);
      expect(result.elementCount).toBeGreaterThan(0);
      expect(result.pathCount).toBeGreaterThan(0);
      expect(Array.isArray(result.recommendations)).toBe(true);
    });

    it("should handle SVG analysis errors gracefully", async () => {
      // Arrange
      mockReadFile.mockRejectedValue(new Error("Permission denied"));

      const args = {
        filePath: "/test/protected.svg",
      };

      // Act
      const result = await service.analyzeSVG(args);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain("Permission denied");
    });
  });

  describe("convertSVGToPNG", () => {
    it("should convert SVG to PNG successfully", async () => {
      // Arrange
      const mockSVGBuffer = Buffer.from('<svg><rect width="100" height="100"/></svg>');
      const _mockPNGBuffer = Buffer.from("fake-png-data");

      mockReadFile.mockResolvedValue(mockSVGBuffer);

      const args = {
        svgPath: "/test/input.svg",
        outputPath: "/test/output.png",
        options: {
          width: 100,
          height: 100,
        },
      };

      // Act
      const result = await service.convertSVGToPNG(args);

      // Assert
      expect(result.success).toBe(true);
      expect(result.outputPath).toBe("/test/output.png");
      expect(result.dimensions.width).toBe(100);
      expect(result.dimensions.height).toBe(100);
      expect(mockWriteFile).toHaveBeenCalled();
      expect(mockNewContext).toHaveBeenCalledWith({ javaScriptEnabled: false });
      expect(mockRoute).toHaveBeenCalledWith("**/*", expect.any(Function));
      const html = mockSetContent.mock.calls[0]?.[0];
      expect(html).toBeDefined();
      expect(html).toContain("Content-Security-Policy");
      expect(html).toContain("default-src 'none'");
    });

    it("aborts outbound SVG image/filter fetches and allows data URLs", async () => {
      const hostileSvg =
        Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10">
  <image href="https://evil.example/exfil.png" width="10" height="10"/>
  <rect width="10" height="10" fill="url(https://evil.example/filter)"/>
</svg>`);
      mockReadFile.mockResolvedValue(hostileSvg);

      await service.convertSVGToPNG({
        svgPath: "/test/hostile.svg",
        outputPath: "/test/hostile.png",
      });

      const handler = mockRoute.mock.calls[0]?.[1];
      expect(handler).toBeTypeOf("function");
      if (!handler) {
        throw new Error("expected page.route handler");
      }

      const abort = vi.fn(async () => {});
      const cont = vi.fn(async () => {});
      await handler({
        request: () => ({ url: () => "https://evil.example/exfil.png" }),
        continue: cont,
        abort,
      });
      expect(abort).toHaveBeenCalledWith("blockedbyclient");
      expect(cont).not.toHaveBeenCalled();

      abort.mockClear();
      cont.mockClear();
      await handler({
        request: () => ({ url: () => "data:image/png;base64,AAAA" }),
        continue: cont,
        abort,
      });
      expect(cont).toHaveBeenCalled();
      expect(abort).not.toHaveBeenCalled();
    });

    it("should handle SVG to PNG conversion errors gracefully", async () => {
      // Arrange
      mockReadFile.mockRejectedValue(new Error("Invalid SVG format"));

      const args = {
        svgPath: "/test/invalid.svg",
      };

      // Act
      const result = await service.convertSVGToPNG(args);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid SVG format");
    });

    it("should generate default PNG path when not provided", async () => {
      // Arrange
      const mockSVGBuffer = Buffer.from('<svg><rect width="100" height="100"/></svg>');
      mockReadFile.mockResolvedValue(mockSVGBuffer);

      const args = {
        svgPath: "/test/input.svg",
      };

      // Act
      const result = await service.convertSVGToPNG(args);

      // Assert
      expect(result.success).toBe(true);
      expect(result.outputPath).toBe(join("/test", "input.png"));
    });
  });

  describe("Edge Cases and Performance", () => {
    it("should handle very large SVG files", async () => {
      // Arrange
      const largeSVGContent = `<svg>${'<rect width="100" height="100"/>'.repeat(1000)}</svg>`;

      mockReadFile.mockResolvedValue(largeSVGContent);
      mockStat.mockResolvedValue({ size: 50000 });

      const { optimize } = await import("svgo");
      vi.mocked(optimize).mockReturnValue({
        data: largeSVGContent.substring(0, 25000), // Simulate compression
      } as any);

      const args = {
        filePath: "/test/large.svg",
      };

      // Act
      const result = await service.compressSVG(args);

      // Assert
      expect(result.success).toBe(true);
      expect(result.compressionRatio).toBeGreaterThan(0);
    });

    it("should handle malformed SVG content gracefully", async () => {
      // Arrange
      const malformedSVG = '<svg><rect width="100"'; // Incomplete tag

      mockReadFile.mockResolvedValue(malformedSVG);
      mockStat.mockResolvedValue({ size: 100 });

      const { optimize } = await import("svgo");
      vi.mocked(optimize).mockImplementation(() => {
        throw new Error("Malformed SVG");
      });

      const args = {
        filePath: "/test/malformed.svg",
      };

      // Act
      const result = await service.compressSVG(args);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error).toContain("Malformed SVG");
    });

    it("should measure processing time accurately", async () => {
      // Arrange
      const mockSVGContent = '<svg><rect width="100" height="100"/></svg>';

      mockReadFile.mockResolvedValue(mockSVGContent);
      mockStat.mockResolvedValue({ size: 100 });

      const { optimize } = await import("svgo");
      vi.mocked(optimize).mockReturnValue({
        data: mockSVGContent,
      } as any);

      const args = {
        filePath: "/test/input.svg",
      };

      // Act
      const result = await service.compressSVG(args);

      // Assert
      expect(result.success).toBe(true);
      expect(result.processingTime).toBeGreaterThanOrEqual(0);
      expect(typeof result.processingTime).toBe("number");
    });
  });
});
