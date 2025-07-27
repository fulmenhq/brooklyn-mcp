/**
 * Main entry point for Fulmen MCP Forge Brooklyn
 * Enterprise-ready MCP server for browser automation
 */

import { loadConfig } from "./core/config.js";
import { createServer } from "./core/server";
import { getLogger, initializeLogging } from "./shared/pino-logger.js";

async function main(): Promise<void> {
  // Load Brooklyn configuration
  const brooklynConfig = await loadConfig();

  // Initialize structured logging
  initializeLogging(brooklynConfig);

  const logger = getLogger("main");

  try {
    logger.info("Starting Fulmen MCP Brooklyn server", {
      version: brooklynConfig.version,
      environment: brooklynConfig.environment,
    });

    const server = await createServer();

    await server.start();

    logger.info("Server started successfully", {
      browsers: brooklynConfig.browsers.maxInstances,
    });
  } catch (error) {
    logger.error("Failed to start server", { error });
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on("SIGINT", () => {
  const logger = getLogger("shutdown");
  logger.info("Received SIGINT, shutting down gracefully");
  process.exit(0);
});

process.on("SIGTERM", () => {
  const logger = getLogger("shutdown");
  logger.info("Received SIGTERM, shutting down gracefully");
  process.exit(0);
});

if (import.meta.main) {
  main();
}
