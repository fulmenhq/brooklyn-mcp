/**
 * Main entry point for Fulmen MCP Forge Brooklyn
 * Enterprise-ready MCP server for browser automation
 */

import { createServer } from "./core/server";
import { config } from "./shared/config";
import { getLogger, initLogger } from "./shared/logger";

async function main(): Promise<void> {
  // Initialize logger with file logging
  initLogger({
    level: (process.env["WEBPILOT_LOG_LEVEL"] as "debug" | "info" | "warn" | "error") || "info",
    format: "pretty",
    useStderr: false,
    logFile: process.env["WEBPILOT_LOG_FILE"] || "server.log",
  });

  const logger = getLogger("main");

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
