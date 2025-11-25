/**
 * Transport factory and registry
 * Central location for creating and managing transport instances
 */

import type {
  HTTPAuthMode,
  HTTPConfig,
  HTTPTokenResolver,
  MCPStdioConfig,
  Transport,
  TransportConfig,
  TransportFactory,
} from "../core/transport.js";
import { TransportRegistry, TransportType } from "../core/transport.js";
import { setGlobalTransport } from "../shared/pino-logger.js";
import { MCPHTTPTransport } from "./http-transport.js";
import { MCPStdioTransport } from "./mcp-stdio-transport.js";

// Transport factory - logger removed as unused after architecture refactor

/**
 * Create MCP stdio transport
 */
const createMCPStdioTransport: TransportFactory = async (
  config: TransportConfig,
): Promise<Transport> => {
  const mcpConfig = config as MCPStdioConfig;

  // Use Unix socket transport for development mode (recommended)
  if (mcpConfig.options?.socketPath) {
    const { MCPSocketTransport } = await import("./mcp-socket-transport.js");
    return new MCPSocketTransport(mcpConfig);
  }

  // Use FIFO transport for development mode with named pipes (experimental)
  if (mcpConfig.options?.inputPipe) {
    const { MCPFifoTransport } = await import("./mcp-fifo-transport.js");
    return new MCPFifoTransport(mcpConfig);
  }

  // Use standard stdio transport for production
  return new MCPStdioTransport();
};

/**
 * Create HTTP transport
 */
const createHTTPTransport: TransportFactory = async (
  config: TransportConfig,
): Promise<Transport> => {
  // Defer logging to avoid circular dependency
  return new MCPHTTPTransport(config as HTTPConfig);
};

/**
 * Register all transport factories
 */
export function registerTransports(): void {
  // Defer logging to avoid circular dependency during initialization
  TransportRegistry.register(TransportType.MCP_STDIO, createMCPStdioTransport);
  TransportRegistry.register(TransportType.HTTP, createHTTPTransport);
}

/**
 * Create transport from configuration
 */
export async function createTransport(config: TransportConfig): Promise<Transport> {
  ensureTransportsRegistered();
  return TransportRegistry.create(config);
}

/**
 * Create MCP stdio transport with optional socket/pipe configuration for development mode
 */
export async function createMCPStdio(devOptions?: {
  // Socket transport (recommended)
  socketPath?: string;
  // Named pipe transport (experimental)
  inputPipe?: string;
  outputPipe?: string;
}): Promise<Transport> {
  // Set global transport mode for logging configuration BEFORE creating transport
  const transportMode = devOptions ? "dev-mcp" : "mcp-stdio";
  await setGlobalTransport(transportMode);

  const config: MCPStdioConfig = {
    type: TransportType.MCP_STDIO,
    options: devOptions
      ? {
          socketPath: devOptions.socketPath,
          inputPipe: devOptions.inputPipe,
          outputPipe: devOptions.outputPipe,
          devMode: true,
        }
      : {},
  };

  // Ensure transports are registered before creating
  ensureTransportsRegistered();

  return createTransport(config);
}

/**
 * HTTP transport factory options
 */
export interface HTTPTransportOptions {
  cors?: boolean;
  authMode?: HTTPAuthMode;
  trustedProxies?: string[];
  tokenResolver?: HTTPTokenResolver;
}

/**
 * Create HTTP transport with configuration
 */
export async function createHTTP(
  port: number,
  host?: string,
  options?: boolean | HTTPTransportOptions,
): Promise<Transport> {
  const normalizedOptions: HTTPTransportOptions =
    typeof options === "boolean"
      ? {
          cors: options,
        }
      : (options ?? {});

  const config: HTTPConfig = {
    type: TransportType.HTTP,
    options: {
      port,
      host,
      cors: normalizedOptions.cors ?? true,
      rateLimiting: false, // TODO: Implement rate limiting
      authMode: normalizedOptions.authMode ?? "disabled",
      trustedProxies: normalizedOptions.trustedProxies,
      tokenResolver: normalizedOptions.tokenResolver,
    },
  };

  return createTransport(config);
}

/**
 * Get available transport types
 */
export function getAvailableTransports(): TransportType[] {
  ensureTransportsRegistered();
  return TransportRegistry.getAvailableTypes();
}

// Transports registered lazily when first used
let transportsRegistered = false;

function ensureTransportsRegistered(): void {
  if (!transportsRegistered) {
    registerTransports();
    transportsRegistered = true;
  }
}
