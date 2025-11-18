/**
 * Type Definitions Tests
 * Testing TypeScript type definitions and interfaces for documentation, image, and native-deps
 */

import { describe, expect, it } from "vitest";

// Import type definitions from the 0% coverage files
import type {
  BrooklynDocsTopic,
  DocumentationFormat,
  DocumentationQueryArgs,
  DocumentationResponse,
  DocumentationSearchResult,
  DocumentationService,
  DocumentationTopic,
  Platform,
} from "../../src/core/documentation/types.js";
import type {
  BatchProcessingOptions,
  CompressSVGArgs,
  ConvertSVGToMultiPNGArgs,
  ImageFormatConversionOptions,
  MultiPNGConversionResult,
  SVGCompressionOptions,
  SVGCompressionResult,
} from "../../src/core/image/types.js";
import type {
  BuildTarget,
  DependencyHealthCheck,
  FeatureAvailability,
  NativeLibraryConfig,
  NativeLibraryName,
  PlatformSupport,
} from "../../src/core/native-deps/types.js";
import { BUILD_TARGETS, NATIVE_LIBRARIES } from "../../src/core/native-deps/types.js";

describe("Documentation Types", () => {
  describe("Platform Types", () => {
    it("should support all valid platform types", () => {
      const platforms: Platform[] = ["darwin", "linux", "win32", "auto"];

      for (const platform of platforms) {
        expect(["darwin", "linux", "win32", "auto"]).toContain(platform);
      }
    });
  });

  describe("DocumentationFormat", () => {
    it("should support all documentation formats", () => {
      const formats: DocumentationFormat[] = ["markdown", "summary", "structured"];

      for (const format of formats) {
        expect(["markdown", "summary", "structured"]).toContain(format);
      }
    });
  });

  describe("DocumentationTopic", () => {
    it("should define documentation topic structure", () => {
      const topic: DocumentationTopic = {
        id: "browser-automation",
        title: "Browser Automation Guide",
        description: "Complete guide to browser automation with Brooklyn",
        keywords: ["browser", "automation", "playwright", "testing"],
        platforms: ["darwin", "linux"],
        category: "guides",
      };

      expect(topic.id).toBe("browser-automation");
      expect(topic.title).toBe("Browser Automation Guide");
      expect(topic.keywords).toContain("browser");
      expect(topic.platforms).toEqual(["darwin", "linux"]);
    });
  });

  describe("DocumentationSearchResult", () => {
    it("should structure search results with relevance scoring", () => {
      const result: DocumentationSearchResult = {
        title: "Getting Started with Brooklyn",
        excerpt: "Brooklyn is a powerful MCP server for browser automation...",
        section: "Introduction",
        relevance: 0.95,
        platform: "darwin",
        url: "https://docs.brooklyn.dev/getting-started",
        content: "Full content of the documentation...",
      };

      expect(result.title).toBe("Getting Started with Brooklyn");
      expect(result.relevance).toBe(0.95);
      expect(result.platform).toBe("darwin");
      expect(result.url).toBe("https://docs.brooklyn.dev/getting-started");
    });
  });

  describe("DocumentationResponse", () => {
    it("should provide comprehensive response structure", () => {
      const response: DocumentationResponse = {
        success: true,
        topic: "browser-automation",
        platform: "darwin",
        searchQuery: "browser automation",
        content: "# Browser Automation\n\nThis guide covers...",
        results: [
          {
            title: "Browser Setup",
            excerpt: "Setting up browsers for automation",
            section: "Setup",
            relevance: 0.8,
          },
        ],
        relatedTopics: ["playwright-guide", "testing-patterns"],
        suggestions: ["Try searching for 'playwright'", "Check the setup guide"],
      };

      expect(response.success).toBe(true);
      expect(response.topic).toBe("browser-automation");
      expect(response.results).toHaveLength(1);
      expect(response.relatedTopics).toContain("playwright-guide");
      expect(response.suggestions).toHaveLength(2);
    });

    it("should handle error responses", () => {
      const errorResponse: DocumentationResponse = {
        success: false,
        error: "Topic not found: invalid-topic",
      };

      expect(errorResponse.success).toBe(false);
      expect(errorResponse.error).toBe("Topic not found: invalid-topic");
    });
  });

  describe("BrooklynDocsTopic", () => {
    it("should extend DocumentationTopic with Brooklyn-specific fields", () => {
      const brooklynTopic: BrooklynDocsTopic = {
        id: "mcp-integration",
        title: "MCP Integration Guide",
        description: "How to integrate Brooklyn with MCP clients",
        keywords: ["mcp", "integration", "claude"],
        category: "integration",
        filePath: "docs/integration/mcp-guide.md",
        sections: ["Overview", "Setup", "Configuration", "Testing"],
        dependencies: ["brooklyn-cli", "mcp-client"],
      };

      expect(brooklynTopic.filePath).toBe("docs/integration/mcp-guide.md");
      expect(brooklynTopic.sections).toContain("Setup");
      expect(brooklynTopic.dependencies).toContain("brooklyn-cli");
    });
  });

  describe("DocumentationService Interface", () => {
    it("should implement documentation service contract", () => {
      const mockService: DocumentationService = {
        getTopics: (): DocumentationTopic[] => {
          return [
            {
              id: "test-topic",
              title: "Test Topic",
              description: "A test topic",
              keywords: ["test"],
              category: "testing",
            },
          ];
        },

        getTopic: async (topicId: string, platform?: Platform): Promise<DocumentationResponse> => {
          return {
            success: true,
            topic: topicId,
            platform,
            content: "Test content",
          };
        },

        search: async (query: string, platform?: Platform): Promise<DocumentationResponse> => {
          return {
            success: true,
            searchQuery: query,
            platform,
            results: [],
          };
        },

        getFormatted: async (args: DocumentationQueryArgs): Promise<DocumentationResponse> => {
          return {
            success: true,
            topic: args.topic,
            content: "Formatted content",
          };
        },

        getRelatedTopics: (_topicId: string): string[] => {
          return ["related-topic-1", "related-topic-2"];
        },
      };

      expect(mockService.getTopics()).toHaveLength(1);
      expect(typeof mockService.getTopic).toBe("function");
      expect(typeof mockService.search).toBe("function");
      expect(mockService.getRelatedTopics("test")).toEqual(["related-topic-1", "related-topic-2"]);
    });
  });
});

describe("Image Processing Types", () => {
  describe("SVGCompressionOptions", () => {
    it("should define comprehensive compression settings", () => {
      const options: SVGCompressionOptions = {
        compressionLevel: 8,
        removeMetadata: true,
        simplifyPaths: true,
        removeComments: true,
        preserveIds: false,
        removeUnusedDefs: true,
      };

      expect(options.compressionLevel).toBe(8);
      expect(options.removeMetadata).toBe(true);
      expect(options.preserveIds).toBe(false);
    });
  });

  describe("SVGCompressionResult", () => {
    it("should track compression metrics", () => {
      const result: SVGCompressionResult = {
        success: true,
        originalSize: 102400, // 100KB
        compressedSize: 51200, // 50KB
        compressionRatio: 0.5,
        outputPath: "/path/to/compressed.svg",
        taskId: "task-123",
        processingTime: 1500, // 1.5 seconds
      };

      expect(result.success).toBe(true);
      expect(result.compressionRatio).toBe(0.5);
      expect(result.processingTime).toBe(1500);
      expect(result.taskId).toBe("task-123");
    });
  });

  describe("ImageFormatConversionOptions", () => {
    it("should provide flexible conversion settings", () => {
      const options: ImageFormatConversionOptions = {
        width: 1920,
        height: 1080,
        quality: 85,
        dpi: 300,
        backgroundColor: "#ffffff",
        maintainAspectRatio: true,
      };

      expect(options.width).toBe(1920);
      expect(options.height).toBe(1080);
      expect(options.quality).toBe(85);
      expect(options.backgroundColor).toBe("#ffffff");
    });
  });

  describe("BatchProcessingOptions", () => {
    it("should configure batch operations", () => {
      const options: BatchProcessingOptions = {
        concurrency: 4,
        continueOnError: true,
        onProgress: (completed: number, total: number, currentFile: string) => {
          expect(typeof completed).toBe("number");
          expect(typeof total).toBe("number");
          expect(typeof currentFile).toBe("string");
        },
      };

      expect(options.concurrency).toBe(4);
      expect(options.continueOnError).toBe(true);
      expect(typeof options.onProgress).toBe("function");
    });
  });

  describe("MultiPNGConversionResult", () => {
    it("should track multi-size conversion results", () => {
      const result: MultiPNGConversionResult = {
        success: true,
        taskId: "multi-task-456",
        results: [
          {
            size: 64,
            outputPath: "/path/to/icon-64.png",
            outputSize: 4096,
            dimensions: { width: 64, height: 64 },
          },
          {
            size: 128,
            outputPath: "/path/to/icon-128.png",
            outputSize: 8192,
            dimensions: { width: 128, height: 128 },
          },
        ],
        totalOutputSize: 12288,
        processingTime: 2500,
      };

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(2);
      expect(result.totalOutputSize).toBe(12288);
      expect(result.results[0]?.size).toBe(64);
    });
  });

  describe("MCP Tool Arguments", () => {
    it("should define CompressSVGArgs for MCP integration", () => {
      const args: CompressSVGArgs = {
        filePath: "/path/to/input.svg",
        outputPath: "/path/to/output.svg",
        taskId: "compress-task-789",
        teamId: "team-delta",
        options: {
          compressionLevel: 7,
          removeMetadata: true,
        },
      };

      expect(args.filePath).toBe("/path/to/input.svg");
      expect(args.teamId).toBe("team-delta");
      expect(args.options?.compressionLevel).toBe(7);
    });

    it("should define ConvertSVGToMultiPNGArgs for batch conversion", () => {
      const args: ConvertSVGToMultiPNGArgs = {
        svgPath: "/path/to/logo.svg",
        sizes: [16, 32, 64, 128, 256],
        taskId: "convert-multi-task",
        teamId: "team-epsilon",
        outputNamePattern: "logo-{size}.png",
        options: {
          quality: 90,
          backgroundColor: "transparent",
        },
      };

      expect(args.sizes).toEqual([16, 32, 64, 128, 256]);
      expect(args.outputNamePattern).toBe("logo-{size}.png");
      expect(args.options?.quality).toBe(90);
    });
  });
});

describe("Native Dependencies Types", () => {
  describe("NATIVE_LIBRARIES Constant", () => {
    it("should define supported native libraries", () => {
      expect(NATIVE_LIBRARIES).toEqual(["svgo", "harfbuzzjs"]);
      expect(NATIVE_LIBRARIES).toHaveLength(2);

      // Test that it's a readonly array
      const libs: readonly string[] = NATIVE_LIBRARIES;
      expect(libs).toBe(NATIVE_LIBRARIES);
    });
  });

  describe("BUILD_TARGETS Constant", () => {
    it("should define supported build targets", () => {
      expect(BUILD_TARGETS).toHaveLength(5);

      const expectedTargets = [
        { platform: "linux", arch: "x64" },
        { platform: "linux", arch: "arm64" },
        { platform: "darwin", arch: "x64" },
        { platform: "darwin", arch: "arm64" },
        { platform: "win32", arch: "x64" },
      ];

      expect(BUILD_TARGETS).toEqual(expectedTargets);
    });
  });

  describe("NativeLibraryConfig", () => {
    it("should configure native library requirements", () => {
      const config: NativeLibraryConfig = {
        name: "svgo",
        importPath: "svgo",
        installationGuide: "npm install svgo",
        requiredPlatforms: ["linux", "darwin"],
        optionalPlatforms: ["win32"],
      };

      expect(config.name).toBe("svgo");
      expect(config.requiredPlatforms).toContain("linux");
      expect(config.optionalPlatforms).toContain("win32");
    });
  });

  describe("PlatformSupport", () => {
    it("should describe platform compatibility", () => {
      const support: PlatformSupport = {
        platform: "darwin",
        architecture: "arm64",
        supported: true,
        notes: "Native Apple Silicon support",
      };

      expect(support.platform).toBe("darwin");
      expect(support.architecture).toBe("arm64");
      expect(support.supported).toBe(true);
      expect(support.notes).toBe("Native Apple Silicon support");
    });
  });

  describe("FeatureAvailability", () => {
    it("should report feature availability status", () => {
      const availability: FeatureAvailability = {
        available: true,
        libraryName: "svgo",
        platformSupport: [
          {
            platform: "darwin",
            architecture: "arm64",
            supported: true,
          },
        ],
      };

      expect(availability.available).toBe(true);
      expect(availability.libraryName).toBe("svgo");
      expect(availability.platformSupport).toHaveLength(1);
    });

    it("should handle unavailable features with error details", () => {
      const unavailable: FeatureAvailability = {
        available: false,
        libraryName: "harfbuzzjs",
        error: "Library not installed",
        platformSupport: [
          {
            platform: "win32",
            architecture: "x64",
            supported: false,
            notes: "Requires additional setup on Windows",
          },
        ],
      };

      expect(unavailable.available).toBe(false);
      expect(unavailable.error).toBe("Library not installed");
      expect(unavailable.platformSupport[0]?.supported).toBe(false);
    });
  });

  describe("DependencyHealthCheck", () => {
    it("should provide comprehensive dependency status", () => {
      const healthCheck: DependencyHealthCheck = {
        libraryName: "svgo",
        available: true,
        version: "3.0.0",
        platformCompatible: true,
        installationCommand: "npm install svgo",
      };

      expect(healthCheck.libraryName).toBe("svgo");
      expect(healthCheck.available).toBe(true);
      expect(healthCheck.version).toBe("3.0.0");
      expect(healthCheck.platformCompatible).toBe(true);
    });

    it("should report failed dependency checks", () => {
      const failedCheck: DependencyHealthCheck = {
        libraryName: "harfbuzzjs",
        available: false,
        platformCompatible: false,
        installationCommand: "npm install harfbuzzjs",
        error: "Installation failed: missing system dependencies",
      };

      expect(failedCheck.available).toBe(false);
      expect(failedCheck.platformCompatible).toBe(false);
      expect(failedCheck.error).toContain("Installation failed");
    });
  });

  describe("Type Safety and Constraints", () => {
    it("should ensure NativeLibraryName is constrained to valid libraries", () => {
      const validLibs: NativeLibraryName[] = ["svgo", "harfbuzzjs"];

      for (const lib of validLibs) {
        expect(NATIVE_LIBRARIES).toContain(lib);
      }
    });

    it("should ensure BuildTarget has correct structure", () => {
      const target: BuildTarget = { platform: "darwin", arch: "arm64" };

      expect(target.platform).toBe("darwin");
      expect(target.arch).toBe("arm64");
      expect(BUILD_TARGETS).toContainEqual(target);
    });
  });
});

describe("Type Definition Integration", () => {
  it("should ensure all type definitions are importable and usable", () => {
    // Comprehensive integration test ensuring all types work together

    const documentationQuery: DocumentationQueryArgs = {
      topic: "image-processing",
      search: "SVG compression",
      platform: "darwin",
      format: "markdown",
    };

    const imageTask: CompressSVGArgs = {
      filePath: "/docs/assets/diagram.svg",
      taskId: "doc-image-compress",
      teamId: "docs-team",
      options: {
        compressionLevel: 6,
        removeMetadata: true,
      },
    };

    const nativeCheck: DependencyHealthCheck = {
      libraryName: "svgo",
      available: true,
      platformCompatible: true,
      installationCommand: "npm install svgo",
    };

    expect(documentationQuery.topic).toBe("image-processing");
    expect(imageTask.filePath).toBe("/docs/assets/diagram.svg");
    expect(nativeCheck.libraryName).toBe("svgo");
  });
});
