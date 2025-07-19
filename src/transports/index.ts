/**
 * Transport factory and registry
 * Central location for creating and managing transport instances
 */

import type { 
  Transport, 
  TransportConfig, 
  TransportFactory,
  MCPStdioConfig,
  HTTPConfig
} from "../core/transport.js";
import { TransportType, TransportRegistry } from "../core/transport.js";
import { MCPStdioTransport } from "./mcp-stdio-transport.js";
import { HTTPTransport } from "./http-transport.js";
import { getLogger } from "../shared/logger.js";

const logger = getLogger("transport-factory");

/**
 * Create MCP stdio transport
 */
const createMCPStdioTransport: TransportFactory = async (config: TransportConfig): Promise<Transport> => {
  logger.debug("Creating MCP stdio transport");
  return new MCPStdioTransport(config as MCPStdioConfig);
};

/**
 * Create HTTP transport
 */
const createHTTPTransport: TransportFactory = async (config: TransportConfig): Promise<Transport> => {
  logger.debug("Creating HTTP transport", { 
    port: (config as HTTPConfig).options?.port 
  });
  return new HTTPTransport(config as HTTPConfig);
};

/**
 * Register all transport factories
 */
export function registerTransports(): void {
  logger.info("Registering transport factories");
  
  TransportRegistry.register(TransportType.MCP_STDIO, createMCPStdioTransport);
  TransportRegistry.register(TransportType.HTTP, createHTTPTransport);
  
  logger.info("Transport factories registered", {
    types: TransportRegistry.getAvailableTypes(),
  });
}

/**
 * Create transport from configuration
 */
export async function createTransport(config: TransportConfig): Promise<Transport> {
  return TransportRegistry.create(config);
}

/**
 * Create MCP stdio transport with default configuration
 */
export async function createMCPStdio(): Promise<Transport> {
  const config: MCPStdioConfig = {
    type: TransportType.MCP_STDIO,
    options: {},
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
  return TransportRegistry.getAvailableTypes();
}

// Auto-register transports when module is imported
registerTransports();