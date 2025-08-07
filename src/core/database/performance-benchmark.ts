/**
 * Performance Benchmarking for Screenshot Repository
 * Phase 3: Performance testing and optimization validation
 */

import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

import { getLogger } from "../../shared/pino-logger.js";
import { getDatabaseManager } from "./database-manager.js";
import { ScreenshotRepositoryOptimized } from "./repositories/screenshot-repository-optimized.js";
import { ScreenshotRepository } from "./repositories/screenshot-repository.js";
import type { ScreenshotQuery, ScreenshotRecord } from "./types.js";

// Lazy logger initialization
let logger: ReturnType<typeof getLogger> | null = null;
function ensureLogger() {
  if (!logger) {
    logger = getLogger("performance-benchmark");
  }
  return logger;
}

interface BenchmarkResult {
  operation: string;
  recordCount: number;
  averageMs: number;
  minMs: number;
  maxMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  throughput: number; // operations per second
  memoryUsedMB: number;
}

interface BenchmarkSuite {
  name: string;
  results: BenchmarkResult[];
  totalDuration: number;
  peakMemoryMB: number;
}

/**
 * Performance benchmark utility for screenshot repository
 */
export class PerformanceBenchmark {
  private results: BenchmarkResult[] = [];
  private peakMemory = 0;

  /**
   * Run complete benchmark suite
   */
  async runSuite(recordCount = 10000): Promise<BenchmarkSuite> {
    const startTime = performance.now();
    ensureLogger().info("Starting performance benchmark suite", { recordCount });

    // Track initial memory
    const initialMemory = process.memoryUsage().heapUsed / 1024 / 1024;

    try {
      // 1. Benchmark data generation and insertion
      await this.benchmarkInsertions(recordCount);

      // 2. Benchmark single record queries
      await this.benchmarkSingleQueries(100);

      // 3. Benchmark list queries with various filters
      await this.benchmarkListQueries();

      // 4. Benchmark concurrent operations
      await this.benchmarkConcurrentOperations();

      // 5. Compare optimized vs standard repository
      await this.compareRepositories();

      // 6. Benchmark cache performance
      await this.benchmarkCachePerformance();

      const totalDuration = performance.now() - startTime;
      const finalMemory = process.memoryUsage().heapUsed / 1024 / 1024;
      this.peakMemory = Math.max(this.peakMemory, finalMemory);

      const suite: BenchmarkSuite = {
        name: "Screenshot Repository Performance",
        results: this.results,
        totalDuration,
        peakMemoryMB: this.peakMemory - initialMemory,
      };

      this.printSummary(suite);
      return suite;
    } catch (error) {
      ensureLogger().error("Benchmark suite failed", { error });
      throw error;
    }
  }

  /**
   * Benchmark insertions
   */
  private async benchmarkInsertions(count: number): Promise<void> {
    ensureLogger().info("Benchmarking insertions", { count });
    const times: number[] = [];

    const db = await getDatabaseManager();
    const instanceId = db.getInstanceId() || "benchmark-instance";

    for (let i = 0; i < count; i++) {
      const screenshot = this.generateMockScreenshot(instanceId, i);

      const start = performance.now();
      await ScreenshotRepositoryOptimized.save(screenshot);
      const duration = performance.now() - start;

      times.push(duration);

      if (i % 1000 === 0) {
        this.updateMemoryTracking();
        ensureLogger().debug("Insertion progress", { completed: i, total: count });
      }
    }

    this.results.push(this.calculateStats("insert", times, count));
  }

  /**
   * Benchmark single queries
   */
  private async benchmarkSingleQueries(count: number): Promise<void> {
    ensureLogger().info("Benchmarking single queries", { count });
    const times: number[] = [];

    // Get some existing IDs
    const result = await ScreenshotRepositoryOptimized.list({ limit: count });
    const ids = result.items.map((item) => item.id);

    for (const id of ids) {
      const start = performance.now();
      await ScreenshotRepositoryOptimized.getById(id);
      const duration = performance.now() - start;
      times.push(duration);
    }

    // Test cache hits
    const cacheHitTimes: number[] = [];
    for (const id of ids.slice(0, 10)) {
      const start = performance.now();
      await ScreenshotRepositoryOptimized.getById(id);
      const duration = performance.now() - start;
      cacheHitTimes.push(duration);
    }

    this.results.push(this.calculateStats("getById", times, count));
    this.results.push(this.calculateStats("getById-cached", cacheHitTimes, 10));
  }

  /**
   * Benchmark list queries with various filters
   */
  private async benchmarkListQueries(): Promise<void> {
    ensureLogger().info("Benchmarking list queries");

    const queries: { name: string; query: ScreenshotQuery }[] = [
      { name: "list-simple", query: { limit: 10 } },
      { name: "list-paginated", query: { limit: 50, offset: 100 } },
      { name: "list-filtered", query: { limit: 20, tag: "test" } },
      {
        name: "list-date-range",
        query: {
          limit: 20,
          startDate: new Date(Date.now() - 86400000),
          endDate: new Date(),
        },
      },
      { name: "list-maxAge", query: { limit: 20, maxAge: 3600 } },
      { name: "list-sorted", query: { limit: 20, orderBy: "file_size", orderDirection: "ASC" } },
    ];

    for (const { name, query } of queries) {
      const times: number[] = [];

      // Run each query multiple times
      for (let i = 0; i < 20; i++) {
        // Clear cache for consistent results
        if (i === 0) {
          ScreenshotRepositoryOptimized.clearCaches();
        }

        const start = performance.now();
        await ScreenshotRepositoryOptimized.list(query);
        const duration = performance.now() - start;
        times.push(duration);
      }

      this.results.push(this.calculateStats(name, times, times.length));
    }
  }

  /**
   * Benchmark concurrent operations
   */
  private async benchmarkConcurrentOperations(): Promise<void> {
    ensureLogger().info("Benchmarking concurrent operations");

    const concurrentCount = 50;
    const operations = [];

    const start = performance.now();

    // Mix of operations
    for (let i = 0; i < concurrentCount; i++) {
      if (i % 3 === 0) {
        operations.push(ScreenshotRepositoryOptimized.list({ limit: 10 }));
      } else if (i % 3 === 1) {
        operations.push(ScreenshotRepositoryOptimized.getStats());
      } else {
        const screenshot = this.generateMockScreenshot("concurrent-test", i);
        operations.push(ScreenshotRepositoryOptimized.save(screenshot));
      }
    }

    await Promise.all(operations);
    const duration = performance.now() - start;

    this.results.push({
      operation: "concurrent-mixed",
      recordCount: concurrentCount,
      averageMs: duration / concurrentCount,
      minMs: 0,
      maxMs: duration,
      p50Ms: duration / concurrentCount,
      p95Ms: duration / concurrentCount,
      p99Ms: duration / concurrentCount,
      throughput: (concurrentCount / duration) * 1000,
      memoryUsedMB: process.memoryUsage().heapUsed / 1024 / 1024,
    });
  }

  /**
   * Compare optimized vs standard repository
   */
  private async compareRepositories(): Promise<void> {
    ensureLogger().info("Comparing optimized vs standard repository");

    const queries = [{ limit: 100 }, { limit: 50, tag: "benchmark" }, { limit: 20, maxAge: 7200 }];

    for (const query of queries) {
      // Standard repository
      const standardTimes: number[] = [];
      for (let i = 0; i < 10; i++) {
        const start = performance.now();
        await ScreenshotRepository.list(query);
        const duration = performance.now() - start;
        standardTimes.push(duration);
      }

      // Optimized repository (with cache cleared)
      const optimizedTimes: number[] = [];
      for (let i = 0; i < 10; i++) {
        if (i === 0) {
          ScreenshotRepositoryOptimized.clearCaches();
        }
        const start = performance.now();
        await ScreenshotRepositoryOptimized.list(query);
        const duration = performance.now() - start;
        optimizedTimes.push(duration);
      }

      this.results.push(this.calculateStats("standard-repo", standardTimes, 10));
      this.results.push(this.calculateStats("optimized-repo", optimizedTimes, 10));
    }
  }

  /**
   * Benchmark cache performance
   */
  private async benchmarkCachePerformance(): Promise<void> {
    ensureLogger().info("Benchmarking cache performance");

    // Clear caches first
    ScreenshotRepositoryOptimized.clearCaches();

    const query = { limit: 50, tag: "cache-test" };
    const times: number[] = [];

    // First query (cache miss)
    const missStart = performance.now();
    await ScreenshotRepositoryOptimized.list(query);
    const missDuration = performance.now() - missStart;

    // Subsequent queries (cache hits)
    for (let i = 0; i < 20; i++) {
      const start = performance.now();
      await ScreenshotRepositoryOptimized.list(query);
      const duration = performance.now() - start;
      times.push(duration);
    }

    this.results.push({
      operation: "cache-miss",
      recordCount: 1,
      averageMs: missDuration,
      minMs: missDuration,
      maxMs: missDuration,
      p50Ms: missDuration,
      p95Ms: missDuration,
      p99Ms: missDuration,
      throughput: 1000 / missDuration,
      memoryUsedMB: process.memoryUsage().heapUsed / 1024 / 1024,
    });

    this.results.push(this.calculateStats("cache-hit", times, 20));

    // Get cache statistics
    const cacheStats = ScreenshotRepositoryOptimized.getCacheStats();
    ensureLogger().info("Cache statistics", cacheStats);
  }

  /**
   * Generate mock screenshot data
   */
  private generateMockScreenshot(
    instanceId: string,
    index: number,
  ): Omit<ScreenshotRecord, "id" | "createdAt"> {
    const teams = ["team-a", "team-b", "team-c", undefined];
    const tags = ["test", "benchmark", "performance", undefined];
    const formats: Array<"png" | "jpeg"> = ["png", "jpeg"];

    return {
      instanceId,
      filePath: `/mock/screenshots/session-${index % 100}/screenshot-${index}.png`,
      filename: `screenshot-${index}.png`,
      sessionId: `session-${index % 100}`,
      browserId: `browser-${index % 10}`,
      teamId: teams[index % teams.length] as string | undefined,
      userId: index % 5 === 0 ? `user-${index % 20}` : undefined,
      tag: tags[index % tags.length] as string | undefined,
      format: formats[index % 2] as "png" | "jpeg",
      fileSize: Math.floor(Math.random() * 1000000) + 50000,
      width: 1920,
      height: 1080,
      fullPage: index % 10 === 0,
      quality: index % 2 === 0 ? 95 : undefined,
      hash: this.createHash(index.toString()),
      metadata: index % 20 === 0 ? { test: true, index } : undefined,
    };
  }

  /**
   * Create hash for mock data
   */
  private createHash(input: string): string {
    return `mock-hash-${input}`.substring(0, 16);
  }

  /**
   * Calculate statistics from timing data
   */
  private calculateStats(operation: string, times: number[], count: number): BenchmarkResult {
    const sorted = times.sort((a, b) => a - b);
    const sum = times.reduce((a, b) => a + b, 0);
    const average = sum / times.length;

    return {
      operation,
      recordCount: count,
      averageMs: average,
      minMs: sorted[0] || 0,
      maxMs: sorted[sorted.length - 1] || 0,
      p50Ms: sorted[Math.floor(sorted.length * 0.5)] || 0,
      p95Ms: sorted[Math.floor(sorted.length * 0.95)] || 0,
      p99Ms: sorted[Math.floor(sorted.length * 0.99)] || 0,
      throughput: average > 0 ? 1000 / average : 0,
      memoryUsedMB: process.memoryUsage().heapUsed / 1024 / 1024,
    };
  }

  /**
   * Update memory tracking
   */
  private updateMemoryTracking(): void {
    const currentMemory = process.memoryUsage().heapUsed / 1024 / 1024;
    this.peakMemory = Math.max(this.peakMemory, currentMemory);
  }

  /**
   * Print benchmark summary
   */
  private printSummary(suite: BenchmarkSuite): void {
    ensureLogger().info("=".repeat(80));
    ensureLogger().info("BENCHMARK SUMMARY");
    ensureLogger().info("=".repeat(80));

    for (const result of suite.results) {
      ensureLogger().info(`
Operation: ${result.operation}
  Records: ${result.recordCount}
  Average: ${result.averageMs.toFixed(2)}ms
  Min: ${result.minMs.toFixed(2)}ms
  Max: ${result.maxMs.toFixed(2)}ms
  P50: ${result.p50Ms.toFixed(2)}ms
  P95: ${result.p95Ms.toFixed(2)}ms
  P99: ${result.p99Ms.toFixed(2)}ms
  Throughput: ${result.throughput.toFixed(2)} ops/sec
  Memory: ${result.memoryUsedMB.toFixed(2)} MB`);
    }

    ensureLogger().info("=".repeat(80));
    ensureLogger().info(`Total Duration: ${(suite.totalDuration / 1000).toFixed(2)} seconds`);
    ensureLogger().info(`Peak Memory Usage: ${suite.peakMemoryMB.toFixed(2)} MB`);

    // Check if performance targets are met
    const targetsMet = this.checkPerformanceTargets(suite);
    if (targetsMet) {
      ensureLogger().info("✅ All performance targets met!");
    } else {
      ensureLogger().warn("⚠️ Some performance targets not met");
    }
  }

  /**
   * Check if performance targets are met
   */
  private checkPerformanceTargets(suite: BenchmarkSuite): boolean {
    const targets = {
      "list-simple": 100, // < 100ms for simple list
      "list-filtered": 100, // < 100ms for filtered list
      getById: 10, // < 10ms for single record
      "getById-cached": 1, // < 1ms for cached record
    };

    let allMet = true;

    for (const [operation, targetMs] of Object.entries(targets)) {
      const result = suite.results.find((r) => r.operation === operation);
      if (result && result.averageMs > targetMs) {
        ensureLogger().warn(
          `Target not met for ${operation}: ${result.averageMs.toFixed(2)}ms > ${targetMs}ms`,
        );
        allMet = false;
      }
    }

    return allMet;
  }

  /**
   * Run quick benchmark (subset of tests)
   */
  static async runQuick(): Promise<BenchmarkSuite> {
    const benchmark = new PerformanceBenchmark();
    return benchmark.runSuite(1000); // Quick test with 1000 records
  }

  /**
   * Run full benchmark
   */
  static async runFull(): Promise<BenchmarkSuite> {
    const benchmark = new PerformanceBenchmark();
    return benchmark.runSuite(10000); // Full test with 10k records
  }
}
