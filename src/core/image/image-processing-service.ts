/**
 * Image Processing Service for Brooklyn MCP Server
 * Handles SVG optimization, format conversion, and image analysis
 */

import { readFile, stat, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import { parseString } from "xml2js";
import { getLogger } from "../../shared/pino-logger.js";
import { NativeDependencyManager } from "../native-deps/dependency-manager.js";
import { ProcessedAssetManager } from "./processed-asset-manager.js";
import type {
  AnalyzeSVGArgs,
  CompressSVGArgs,
  ConvertSVGToMultiPNGArgs,
  ConvertSVGToPNGArgs,
  ImageFormatConversionResult,
  MultiPNGConversionResult,
  SVGAnalysisResult,
  SVGCompressionOptions,
  SVGCompressionResult,
} from "./types.js";

// Lazy logger initialization pattern
let logger: ReturnType<typeof getLogger> | null = null;
function ensureLogger() {
  if (!logger) {
    logger = getLogger("image-processing");
  }
  return logger;
}

export class ImageProcessingService {
  // biome-ignore lint/suspicious/noExplicitAny: Dynamic SVGO configuration
  private readonly defaultSVGConfig: any = {
    plugins: ["preset-default"],
  };
  private readonly assetManager: ProcessedAssetManager;

  constructor() {
    this.assetManager = new ProcessedAssetManager();
  }

  /**
   * Compress SVG file using SVGO optimization
   */
  async compressSVG(args: CompressSVGArgs): Promise<SVGCompressionResult> {
    const startTime = Date.now();
    const log = ensureLogger();

    try {
      log.info("Starting SVG compression", {
        filePath: args.filePath,
        outputPath: args.outputPath,
        options: args.options,
      });

      // Ensure SVGO is available
      // biome-ignore lint/suspicious/noExplicitAny: Dynamic SVGO module interface
      const svgoModule: any = await NativeDependencyManager.ensureSVGO();
      const { optimize } = svgoModule;

      // Read original SVG file
      const svgContent = await readFile(args.filePath, "utf-8");
      const originalStats = await stat(args.filePath);
      const originalSize = originalStats.size;

      // Configure SVGO based on options
      const svgoConfig = this.buildSVGOConfig(args.options);

      // Optimize SVG
      const result = optimize(svgContent, {
        path: args.filePath,
        ...svgoConfig,
      });

      if ("error" in result) {
        throw new Error(`SVGO optimization failed: ${result.error}`);
      }

      const optimizedContent = result.data;
      const compressedSize = Buffer.byteLength(optimizedContent, "utf-8");

      // Use task-based storage if teamId is provided
      let outputPath: string;
      let taskId: string | undefined;

      if (args.teamId) {
        // Use ProcessedAssetManager for team-based storage
        taskId = this.assetManager.generateTaskId(basename(args.filePath), args.taskId);

        const saveResult = await this.assetManager.saveAsset(
          Buffer.from(optimizedContent, "utf-8"),
          "compressed.svg",
          {
            taskId,
            teamId: args.teamId,
            sourceFileName: basename(args.filePath),
            processingType: "compressed",
          },
        );

        if (!saveResult.success) {
          throw new Error(saveResult.error || "Failed to save compressed SVG");
        }

        outputPath = saveResult.assetPath;
        taskId = saveResult.taskId;
      } else {
        // Fallback to traditional file writing
        outputPath = args.outputPath || this.generateCompressedPath(args.filePath);
        await writeFile(outputPath, optimizedContent, "utf-8");
      }

      const processingTime = Date.now() - startTime;
      const compressionRatio = ((originalSize - compressedSize) / originalSize) * 100;

      log.info("SVG compression completed", {
        originalSize,
        compressedSize,
        compressionRatio: `${compressionRatio.toFixed(1)}%`,
        processingTime: `${processingTime}ms`,
        taskId,
        teamId: args.teamId,
      });

      return {
        success: true,
        originalSize,
        compressedSize,
        compressionRatio,
        outputPath,
        taskId,
        processingTime,
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      log.error("SVG compression failed", {
        filePath: args.filePath,
        error: errorMessage,
        processingTime,
      });

      return {
        success: false,
        originalSize: 0,
        compressedSize: 0,
        compressionRatio: 0,
        outputPath: args.outputPath || "",
        processingTime,
        error: errorMessage,
      };
    }
  }

  /**
   * Analyze SVG file for complexity metrics and optimization opportunities
   */
  async analyzeSVG(args: AnalyzeSVGArgs): Promise<SVGAnalysisResult> {
    const log = ensureLogger();

    try {
      log.info("Starting SVG analysis", { filePath: args.filePath });

      // Read SVG file
      const svgContent = await readFile(args.filePath, "utf-8");
      const fileStats = await stat(args.filePath);
      const fileSize = fileStats.size;

      // Parse SVG XML
      const parsedSVG = await this.parseSVGContent(svgContent);

      // Analyze SVG structure
      const analysis = this.analyzeSVGStructure(parsedSVG, svgContent);

      log.info("SVG analysis completed", {
        fileSize,
        elementCount: analysis.elementCount,
        complexityScore: analysis.complexityScore,
      });

      return {
        success: true,
        fileSize,
        ...analysis,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      log.error("SVG analysis failed", {
        filePath: args.filePath,
        error: errorMessage,
      });

      return {
        success: false,
        fileSize: 0,
        elementCount: 0,
        pathCount: 0,
        complexityScore: 0,
        recommendations: [],
        hasMetadata: false,
        hasComments: false,
        unusedDefinitions: 0,
        error: errorMessage,
      };
    }
  }

  /**
   * Convert SVG to PNG with high quality
   */
  async convertSVGToPNG(args: ConvertSVGToPNGArgs): Promise<ImageFormatConversionResult> {
    const startTime = Date.now();
    const log = ensureLogger();

    try {
      log.info("Starting SVG to PNG conversion", {
        svgPath: args.svgPath,
        outputPath: args.outputPath,
        options: args.options,
      });

      // Read SVG file
      const svgBuffer = await readFile(args.svgPath);
      const options = args.options || {};

      // Use Playwright to render SVG to PNG
      const { chromium } = await import("playwright");
      const browser = await chromium.launch({ headless: true });
      const context = await browser.newContext();
      const page = await context.newPage();

      const width = options.width || 512;
      const height = options.height || 512;
      await page.setViewportSize({ width, height });

      const bgStyle = options.backgroundColor
        ? `background:${options.backgroundColor};`
        : "background:transparent;";
      const svgContent = svgBuffer.toString("utf-8");
      const html = `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;${bgStyle}">${svgContent}</body></html>`;
      await page.setContent(html, { waitUntil: "load" });

      const outputBuffer = await page.screenshot({
        type: "png",
        omitBackground: !options.backgroundColor,
      });
      await browser.close();

      const outputPath = args.outputPath || this.generatePNGPath(args.svgPath);
      await writeFile(outputPath, outputBuffer);

      // Best-effort dimensions (viewport)
      const outputSize = outputBuffer.length;
      const _metadata = { width, height } as { width: number; height: number };

      const processingTime = Date.now() - startTime;

      log.info("SVG to PNG conversion completed", {
        outputPath,
        outputSize,
        dimensions: { width, height },
        processingTime: `${processingTime}ms`,
      });

      return {
        success: true,
        outputPath,
        outputSize,
        dimensions: { width, height },
        processingTime,
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      log.error("SVG to PNG conversion failed", {
        svgPath: args.svgPath,
        error: errorMessage,
        processingTime,
      });

      return {
        success: false,
        outputPath: args.outputPath || "",
        outputSize: 0,
        dimensions: { width: 0, height: 0 },
        processingTime,
        error: errorMessage,
      };
    }
  }

  /**
   * Build SVGO configuration from compression options
   */
  // biome-ignore lint/suspicious/noExplicitAny: Dynamic SVGO configuration
  private buildSVGOConfig(_options?: SVGCompressionOptions): any {
    // For now, use a simple preset configuration for basic optimization
    // This provides good compression while maintaining visual fidelity
    return {
      plugins: ["preset-default"],
    };
  }

  /**
   * Parse SVG content to XML object
   */
  private async parseSVGContent(svgContent: string): Promise<unknown> {
    return new Promise((resolve, reject) => {
      parseString(svgContent, (err, result) => {
        if (err) {
          reject(new Error(`Failed to parse SVG: ${err.message}`));
        } else {
          resolve(result);
        }
      });
    });
  }

  /**
   * Analyze SVG structure for complexity metrics
   */
  private analyzeSVGStructure(parsedSVG: unknown, svgContent: string) {
    const elementCount = this.countElements(parsedSVG);
    const pathCount = this.countPaths(parsedSVG);
    const hasMetadata = svgContent.includes("<metadata");
    const hasComments = svgContent.includes("<!--");

    // Calculate complexity score (0-100)
    let complexityScore = 0;
    complexityScore += Math.min(elementCount * 2, 40); // Elements contribute up to 40 points
    complexityScore += Math.min(pathCount * 5, 30); // Paths contribute up to 30 points
    complexityScore += hasMetadata ? 10 : 0; // Metadata adds 10 points
    complexityScore += hasComments ? 5 : 0; // Comments add 5 points

    // Generate recommendations
    const recommendations: string[] = [];
    if (hasMetadata) {
      recommendations.push("Remove metadata to reduce file size");
    }
    if (hasComments) {
      recommendations.push("Remove comments to reduce file size");
    }
    if (pathCount > 20) {
      recommendations.push("Consider simplifying complex paths");
    }
    if (elementCount > 100) {
      recommendations.push("High element count - consider grouping or simplification");
    }

    return {
      elementCount,
      pathCount,
      complexityScore: Math.min(complexityScore, 100),
      recommendations,
      hasMetadata,
      hasComments,
      unusedDefinitions: 0, // TODO: Implement unused definition detection
    };
  }

  /**
   * Count total elements in parsed SVG
   */
  private countElements(obj: unknown): number {
    if (typeof obj !== "object" || obj === null) {
      return 0;
    }

    let count = 0;
    for (const [key, value] of Object.entries(obj)) {
      if (key !== "$" && key !== "_") {
        // Skip XML attributes and text content
        if (Array.isArray(value)) {
          count += value.length;
          for (const item of value) {
            count += this.countElements(item);
          }
        } else {
          count += this.countElements(value);
        }
      }
    }

    return count;
  }

  /**
   * Count path elements in parsed SVG
   */
  private countPaths(obj: unknown): number {
    if (typeof obj !== "object" || obj === null) {
      return 0;
    }

    let count = 0;
    for (const [key, value] of Object.entries(obj)) {
      if (key === "path") {
        count += Array.isArray(value) ? value.length : 1;
      } else if (typeof value === "object") {
        count += this.countPaths(value);
      }
    }

    return count;
  }

  /**
   * Generate output path for compressed SVG
   */
  private generateCompressedPath(inputPath: string): string {
    const dir = dirname(inputPath);
    const name = basename(inputPath, extname(inputPath));
    return join(dir, `${name}-compressed.svg`);
  }

  /**
   * Convert SVG to multiple PNG sizes in a single task
   */
  async convertSVGToMultiPNG(args: ConvertSVGToMultiPNGArgs): Promise<MultiPNGConversionResult> {
    const startTime = Date.now();
    const log = ensureLogger();

    try {
      log.info("Starting multi-size PNG conversion", {
        svgPath: args.svgPath,
        sizes: args.sizes,
        taskId: args.taskId,
        teamId: args.teamId,
      });

      if (!args.teamId) {
        throw new Error("Multi-size PNG conversion requires teamId for task-based storage");
      }

      if (!args.sizes || args.sizes.length === 0) {
        throw new Error("At least one size must be specified");
      }

      // Use Playwright-based rendering; no native image library dependency

      // Generate task ID
      const taskId = this.assetManager.generateTaskId(basename(args.svgPath), args.taskId);

      // Read SVG file once
      const svgBuffer = await readFile(args.svgPath);

      // Save source file to task directory
      const sourceResult = await this.assetManager.saveAsset(svgBuffer, "source.svg", {
        taskId,
        teamId: args.teamId,
        sourceFileName: basename(args.svgPath),
        processingType: "source",
      });

      if (!sourceResult.success) {
        throw new Error(sourceResult.error || "Failed to save source SVG");
      }

      const results: Array<{
        size: number;
        outputPath: string;
        outputSize: number;
        dimensions: { width: number; height: number };
      }> = [];

      let totalOutputSize = 0;

      // Process each size via headless rendering
      for (const size of args.sizes) {
        try {
          const { chromium } = await import("playwright");
          const browser = await chromium.launch({ headless: true });
          const context = await browser.newContext();
          const page = await context.newPage();
          await page.setViewportSize({ width: size, height: size });
          const bgStyle = args.options?.backgroundColor
            ? `background:${args.options.backgroundColor};`
            : "background:transparent;";
          const svgContent = svgBuffer.toString("utf-8");
          const html = `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;${bgStyle}">${svgContent}</body></html>`;
          await page.setContent(html, { waitUntil: "load" });
          const outputBuffer = await page.screenshot({
            type: "png",
            omitBackground: !args.options?.backgroundColor,
          });
          await browser.close();

          // Generate filename using pattern
          const fileName = args.outputNamePattern
            ? args.outputNamePattern.replace("{size}", size.toString())
            : `png-${size}.png`;

          // Save to task directory
          const saveResult = await this.assetManager.saveAsset(outputBuffer, fileName, {
            taskId,
            teamId: args.teamId,
            sourceFileName: basename(args.svgPath),
            processingType: "converted",
          });

          if (!saveResult.success) {
            throw new Error(saveResult.error || `Failed to save PNG size ${size}`);
          }

          results.push({
            size,
            outputPath: saveResult.assetPath,
            outputSize: outputBuffer.length,
            dimensions: { width: size, height: size },
          });

          totalOutputSize += outputBuffer.length;

          log.info(`PNG size ${size} completed`, {
            taskId,
            size,
            outputSize: outputBuffer.length,
            dimensions: { width: size, height: size },
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          log.error(`Failed to process PNG size ${size}`, { taskId, size, error: errorMessage });
          throw new Error(`Failed to process size ${size}: ${errorMessage}`);
        }
      }

      const processingTime = Date.now() - startTime;

      log.info("Multi-size PNG conversion completed", {
        taskId,
        sizes: args.sizes,
        totalFiles: results.length + 1, // +1 for source
        totalOutputSize,
        processingTime,
      });

      return {
        success: true,
        taskId,
        results,
        totalOutputSize,
        processingTime,
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      log.error("Multi-size PNG conversion failed", {
        svgPath: args.svgPath,
        sizes: args.sizes,
        error: errorMessage,
        processingTime,
      });

      return {
        success: false,
        taskId: args.taskId || "",
        results: [],
        totalOutputSize: 0,
        processingTime,
        error: errorMessage,
      };
    }
  }

  /**
   * List processed assets (bridge to ProcessedAssetManager)
   */
  // biome-ignore lint/suspicious/noExplicitAny: MCP bridge interface
  async listAssets(args: any): Promise<any> {
    const teamId = args.teamId || "default";
    return await this.assetManager.listAssets({
      teamId,
      taskId: args.taskId,
      pattern: args.pattern,
      limit: args.limit,
      sortBy: args.sortBy,
      sortDirection: args.sortDirection,
    });
  }

  /**
   * Get processed asset (bridge to ProcessedAssetManager)
   */
  // biome-ignore lint/suspicious/noExplicitAny: MCP bridge interface
  async getAsset(args: any): Promise<any> {
    const teamId = args.teamId || "default";
    const result = await this.assetManager.getAsset(teamId, args.taskId, args.assetName);

    if (result.success && args.returnFormat === "base64" && result.buffer) {
      return {
        success: true,
        assetPath: `${teamId}/${args.taskId}/${args.assetName}`,
        data: result.buffer.toString("base64"),
        metadata: result.metadata,
      };
    }

    return {
      success: result.success,
      assetPath: result.success ? `${teamId}/${args.taskId}/${args.assetName}` : "",
      metadata: result.metadata,
      error: result.error,
    };
  }

  /**
   * Purge processed assets (bridge to ProcessedAssetManager)
   */
  // biome-ignore lint/suspicious/noExplicitAny: MCP bridge interface
  async purgeAssets(args: any): Promise<any> {
    const teamId = args.teamId || "default";
    return await this.assetManager.purgeAssets({
      pattern: args.pattern,
      strategy: args.strategy,
      teamId,
      keepLast: args.keepLast,
      olderThan: args.olderThan,
      dryRun: args.dryRun !== false, // Default to true for safety
      confirm: args.confirm,
    });
  }

  /**
   * Generate output path for PNG conversion
   */
  private generatePNGPath(inputPath: string): string {
    const dir = dirname(inputPath);
    const name = basename(inputPath, extname(inputPath));
    return join(dir, `${name}.png`);
  }
}
