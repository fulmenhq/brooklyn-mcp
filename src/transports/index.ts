/**
 * Transport factory and registry
 * Central location for creating and managing transport instances
 */

import type {
  HTTPConfig,
  MCPStdioConfig,
  Transport,
  TransportConfig,
  TransportFactory,
} from "../core/transport.js";
import { TransportRegistry, TransportType } from "../core/transport.js";
import { getLogger } from "../shared/structured-logger.js";
import { HTTPTransport } from "./http-transport.js";
import { MCPStdioTransport } from "./mcp-stdio-transport.js";

// Logger will be created lazily after logging is initialized
let logger: ReturnType<typeof getLogger> | null = null;

function getTransportLogger() {
  if (!logger) {
    logger = getLogger("transport-factory");
  }
  return logger;
}

/**
 * Create MCP stdio transport
 */
const createMCPStdioTransport: TransportFactory = async (
  config: TransportConfig,
): Promise<Transport> => {
  getTransportLogger().debug("Creating MCP stdio transport");
  return new MCPStdioTransport(config as MCPStdioConfig);
};

/**
 * Create HTTP transport
 */
const createHTTPTransport: TransportFactory = async (
  config: TransportConfig,
): Promise<Transport> => {
  getTransportLogger().debug("Creating HTTP transport", {
    port: (config as HTTPConfig).options?.port,
  });
  return new HTTPTransport(config as HTTPConfig);
};

/**
 * Register all transport factories
 */
export function registerTransports(): void {
  getTransportLogger().info("Registering transport factories");

  TransportRegistry.register(TransportType.MCP_STDIO, createMCPStdioTransport);
  TransportRegistry.register(TransportType.HTTP, createHTTPTransport);

  getTransportLogger().info("Transport factories registered", {
    types: TransportRegistry.getAvailableTypes(),
  });
}

/**
 * Create transport from configuration
 */
export async function createTransport(config: TransportConfig): Promise<Transport> {
  ensureTransportsRegistered();
  return TransportRegistry.create(config);
}

/**
 * Create MCP stdio transport with optional pipe configuration for development mode
 */
export async function createMCPStdio(pipeOptions?: {
  inputPipe?: string;
  outputPipe?: string;
}): Promise<Transport> {
  const config: MCPStdioConfig = {
    type: TransportType.MCP_STDIO,
    options: pipeOptions
      ? {
          inputPipe: pipeOptions.inputPipe,
          outputPipe: pipeOptions.outputPipe,
          devMode: true,
        }
      : {},
  };

  return createTransport(config);
}

/**
 * Create HTTP transport with configuration
 */
export async function createHTTP(port: number, host?: string, cors = true): Promise<Transport> {
  const config: HTTPConfig = {
    type: TransportType.HTTP,
    options: {
      port,
      host,
      cors,
      rateLimiting: false, // TODO: Implement rate limiting
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
