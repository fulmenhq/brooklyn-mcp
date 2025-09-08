/**
 * Image Processing Types for Brooklyn MCP Server
 * Defines interfaces for SVG optimization, format conversion, and analysis
 */

export interface SVGCompressionOptions {
  /** Compression level from 1 (light) to 10 (aggressive) */
  compressionLevel?: number;
  /** Remove metadata from SVG */
  removeMetadata?: boolean;
  /** Simplify paths for smaller file size */
  simplifyPaths?: boolean;
  /** Remove comments from SVG */
  removeComments?: boolean;
  /** Preserve element IDs */
  preserveIds?: boolean;
  /** Remove unused definitions */
  removeUnusedDefs?: boolean;
}

export interface SVGCompressionResult {
  success: boolean;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
  outputPath: string;
  taskId?: string;
  processingTime: number;
  error?: string;
}

export interface SVGAnalysisResult {
  success: boolean;
  fileSize: number;
  elementCount: number;
  pathCount: number;
  complexityScore: number;
  recommendations: string[];
  hasMetadata: boolean;
  hasComments: boolean;
  unusedDefinitions: number;
  error?: string;
}

export interface ImageFormatConversionOptions {
  /** Output width in pixels */
  width?: number;
  /** Output height in pixels */
  height?: number;
  /** Image quality (1-100) */
  quality?: number;
  /** DPI for output image */
  dpi?: number;
  /** Background color for transparent SVGs */
  backgroundColor?: string;
  /** Maintain aspect ratio */
  maintainAspectRatio?: boolean;
}

export interface ImageFormatConversionResult {
  success: boolean;
  outputPath: string;
  outputSize: number;
  dimensions: {
    width: number;
    height: number;
  };
  taskId?: string;
  processingTime: number;
  error?: string;
}

export interface BatchProcessingOptions {
  /** Maximum concurrent operations */
  concurrency?: number;
  /** Continue processing on errors */
  continueOnError?: boolean;
  /** Progress callback function */
  onProgress?: (completed: number, total: number, currentFile: string) => void;
}

export interface BatchProcessingResult {
  success: boolean;
  totalFiles: number;
  successfulFiles: number;
  failedFiles: number;
  results: Array<{
    inputPath: string;
    success: boolean;
    outputPath?: string;
    error?: string;
  }>;
  totalProcessingTime: number;
}

export interface ImageAnalysisMetrics {
  fileSize: number;
  dimensions: {
    width: number;
    height: number;
  };
  format: string;
  colorSpace?: string;
  hasAlpha: boolean;
  channels: number;
}

// Tool argument interfaces for MCP integration
export interface CompressSVGArgs {
  filePath: string;
  outputPath?: string;
  taskId?: string;
  teamId?: string;
  options?: SVGCompressionOptions;
}

export interface AnalyzeSVGArgs {
  filePath: string;
}

export interface ConvertSVGToPNGArgs {
  svgPath: string;
  outputPath?: string;
  taskId?: string;
  teamId?: string;
  options?: ImageFormatConversionOptions;
}

export interface ConvertSVGToMultiPNGArgs {
  svgPath: string;
  sizes: number[];
  taskId?: string;
  teamId?: string;
  outputNamePattern?: string; // e.g., "logo-{size}.png"
  options?: Omit<ImageFormatConversionOptions, "width" | "height">;
}

export interface MultiPNGConversionResult {
  success: boolean;
  taskId: string;
  results: Array<{
    size: number;
    outputPath: string;
    outputSize: number;
    dimensions: {
      width: number;
      height: number;
    };
  }>;
  totalOutputSize: number;
  processingTime: number;
  error?: string;
}

export interface BatchConvertArgs {
  inputPaths: string[];
  outputDirectory: string;
  format: "png" | "webp" | "jpeg";
  options?: ImageFormatConversionOptions & BatchProcessingOptions;
}
