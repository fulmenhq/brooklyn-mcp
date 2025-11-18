/**
 * Database module exports
 * Central export point for all database-related functionality
 */

// Background services
export { BackgroundSyncService } from "./background-sync-service.js";
// Core database manager
export { DatabaseManager, getDatabaseManager } from "./database-manager.js";
// Instance ID generation
export { generateStableInstanceId, getStableInstanceId } from "./instance-id-generator.js";
// Performance utilities
export { PerformanceBenchmark } from "./performance-benchmark.js";
export { createCacheKey, QueryCache } from "./query-cache.js";
// Repositories
export { ScreenshotRepository } from "./repositories/screenshot-repository.js";
export { ScreenshotRepositoryOptimized } from "./repositories/screenshot-repository-optimized.js";

// Types
export type {
  DatabaseConfig,
  ScreenshotListResult,
  ScreenshotQuery,
  ScreenshotRecord,
} from "./types.js";
