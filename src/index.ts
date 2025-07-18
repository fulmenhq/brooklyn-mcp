/**
 * Main entry point for Fulmen MCP Forge Brooklyn
 * Enterprise-ready MCP server for browser automation
 */

import { createServer } from "./core/server";
import { config } from "./shared/config";
import { logger } from "./shared/logger";

async function main(): Promise<void> {
  try {
    logger.info("Starting Fulmen MCP Brooklyn server", {
      version: config.version,
      environment: config.environment,
    });

    const server = await createServer();

    await server.start();

    logger.info("Server started successfully", {
      port: config.port,
      maxBrowsers: config.maxBrowsers,
    });
  } catch (error) {
    logger.error("Failed to start server", { error });
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on("SIGINT", () => {
  logger.info("Received SIGINT, shutting down gracefully");
  process.exit(0);
});

process.on("SIGTERM", () => {
  logger.info("Received SIGTERM, shutting down gracefully");
  process.exit(0);
});

if (import.meta.main) {
  main();
}
