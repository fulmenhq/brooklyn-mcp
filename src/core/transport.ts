/**
 * Transport abstraction for Brooklyn MCP server
 * Supports both MCP stdin/stdout and HTTP transports
 */

import type {
  CallToolRequest,
  CallToolResult,
  ListToolsResult,
} from "@modelcontextprotocol/sdk/types.js";

/**
 * Transport abstraction interface
 * Allows Brooklyn core to work with different transport mechanisms
 */
export interface Transport {
  readonly name: string;
  readonly type: TransportType;

  /**
   * Initialize the transport
   */
  initialize(): Promise<void>;

  /**
   * Start listening for requests
   */
  start(): Promise<void>;

  /**
   * Stop the transport
   */
  stop(): Promise<void>;

  /**
   * Check if transport is running
   */
  isRunning(): boolean;

  /**
   * Set request handlers
   */
  setToolListHandler(handler: ToolListHandler): void;
  setToolCallHandler(handler: ToolCallHandler): void;
}

export enum TransportType {
  MCP_STDIO = "mcp-stdio",
  HTTP = "http",
}

/**
 * Transport metadata supplied with each HTTP/MCP request
 */
export interface TransportRequestMetadata {
  transport?: string;
  userId?: string;
  teamId?: string;
  sessionId?: string;
  auth?: unknown;
}

/**
 * Handler function types
 */
export type ToolListHandler = () => Promise<ListToolsResult>;
export type ToolCallHandler = (
  request: CallToolRequest,
  metadata?: TransportRequestMetadata,
) => Promise<CallToolResult>;

/**
 * Transport configuration
 */
export interface TransportConfig {
  type: TransportType;
  options?: Record<string, unknown>;
}

/**
 * MCP stdio transport configuration
 */
export interface MCPStdioConfig extends TransportConfig {
  type: TransportType.MCP_STDIO;
  options?: {
    // Development mode with named pipes (experimental - requires --experimental flag)
    inputPipe?: string;
    outputPipe?: string;
    // Development mode with Unix socket (recommended)
    socketPath?: string;
    devMode?: boolean;
  };
}

/**
 * HTTP auth configuration
 */
export type HTTPAuthMode = "required" | "localhost" | "disabled";

export type HTTPTokenResolver = (
  token: string,
) =>
  | Promise<{ userId?: string; teamId?: string } | null>
  | { userId?: string; teamId?: string }
  | null;

/**
 * MCP stdio transport configuration
 */
export interface HTTPConfig extends TransportConfig {
  type: TransportType.HTTP;
  options: {
    port: number;
    host?: string;
    cors?: boolean;
    rateLimiting?: boolean;
    authMode?: HTTPAuthMode;
    trustedProxies?: string[];
    tokenResolver?: HTTPTokenResolver;
  };
}

/**
 * Transport factory function type
 */
export type TransportFactory = (config: TransportConfig) => Promise<Transport>;

/**
 * Transport registry for managing different transport types
 */
export class TransportRegistry {
  private static factories = new Map<TransportType, TransportFactory>();

  static register(type: TransportType, factory: TransportFactory): void {
    TransportRegistry.factories.set(type, factory);
  }

  static async create(config: TransportConfig): Promise<Transport> {
    const factory = TransportRegistry.factories.get(config.type);
    if (!factory) {
      throw new Error(`Unknown transport type: ${config.type}`);
    }
    return factory(config);
  }

  static getAvailableTypes(): TransportType[] {
    return Array.from(TransportRegistry.factories.keys());
  }
}
