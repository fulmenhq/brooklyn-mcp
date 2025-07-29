/**
 * Browser pool abstraction with pluggable strategies
 * Manages pool of browser instances with different allocation strategies
 */

import { EventEmitter } from "node:events";
import type { Page } from "playwright";
import { getLogger } from "../../shared/pino-logger.js";
import type { BrowserInstance, BrowserInstanceConfig } from "./browser-instance.js";

const logger = getLogger("browser-pool");

export interface PoolConfig {
  maxSize: number;
  minSize?: number;
  maxIdleTime?: number;
  healthCheckInterval?: number;
  warmupSize?: number;
  allocationStrategy?: "round-robin" | "least-used" | "team-isolated";
  createInstance?: (config: {
    teamId?: string;
    browserType?: "chromium" | "firefox" | "webkit";
  }) => Promise<BrowserInstance>;
}

interface RequiredPoolConfig extends PoolConfig {
  minSize: number;
  maxIdleTime: number;
  healthCheckInterval: number;
  warmupSize: number;
  allocationStrategy: "round-robin" | "least-used" | "team-isolated";
}

export interface PoolMetrics {
  totalInstances: number;
  activeInstances: number;
  idleInstances: number;
  healthyInstances: number;
  degradedInstances: number;
  unhealthyInstances: number;
  totalRequests: number;
  failedRequests: number;
  avgWaitTime: number;
}

export interface AllocationRequest {
  teamId?: string;
  browserType?: "chromium" | "firefox" | "webkit";
  priority?: "low" | "normal" | "high";
  metadata?: Record<string, unknown>;
}

export interface AllocationResult {
  instance: BrowserInstance;
  page: Page;
  allocationTime: number;
}

/**
 * Abstract base class for allocation strategies
 */
export abstract class AllocationStrategy {
  abstract allocate(
    instances: Map<string, BrowserInstance>,
    request: AllocationRequest,
  ): BrowserInstance | null;

  abstract shouldCreateNew(
    instances: Map<string, BrowserInstance>,
    request: AllocationRequest,
    maxSize: number,
  ): boolean;
}

/**
 * Round-robin allocation strategy
 */
export class RoundRobinStrategy extends AllocationStrategy {
  private lastIndex = 0;

  allocate(
    instances: Map<string, BrowserInstance>,
    request: AllocationRequest,
  ): BrowserInstance | null {
    const availableInstances = Array.from(instances.values()).filter((instance) => {
      // Check browser type match if specified
      if (request.browserType && instance.browserType !== request.browserType) {
        return false;
      }
      return instance.isActive && instance.healthStatus === "healthy";
    });

    if (availableInstances.length === 0) return null;

    this.lastIndex = (this.lastIndex + 1) % availableInstances.length;
    return availableInstances[this.lastIndex] || null;
  }

  shouldCreateNew(
    instances: Map<string, BrowserInstance>,
    _request: AllocationRequest,
    maxSize: number,
  ): boolean {
    const healthyCount = Array.from(instances.values()).filter(
      (instance) => instance.isActive && instance.healthStatus === "healthy",
    ).length;

    return healthyCount === 0 && instances.size < maxSize;
  }
}

/**
 * Least-used allocation strategy
 */
export class LeastUsedStrategy extends AllocationStrategy {
  allocate(
    instances: Map<string, BrowserInstance>,
    request: AllocationRequest,
  ): BrowserInstance | null {
    const availableInstances = Array.from(instances.values())
      .filter((instance) => {
        // Check browser type match if specified
        if (request.browserType && instance.browserType !== request.browserType) {
          return false;
        }
        return instance.isActive && instance.healthStatus === "healthy";
      })
      .sort((a, b) => {
        const metricsA = a.getMetrics();
        const metricsB = b.getMetrics();
        return metricsA.pageCount - metricsB.pageCount;
      });

    return availableInstances[0] || null;
  }

  shouldCreateNew(
    instances: Map<string, BrowserInstance>,
    _request: AllocationRequest,
    maxSize: number,
  ): boolean {
    if (instances.size >= maxSize) return false;

    const avgPageCount =
      Array.from(instances.values()).reduce(
        (sum, instance) => sum + instance.getMetrics().pageCount,
        0,
      ) / instances.size;

    return avgPageCount > 3; // Create new if average page count is high
  }
}

/**
 * Team-isolated allocation strategy
 */
export class TeamIsolatedStrategy extends AllocationStrategy {
  allocate(
    instances: Map<string, BrowserInstance>,
    request: AllocationRequest,
  ): BrowserInstance | null {
    if (!request.teamId) {
      throw new Error("Team ID required for team-isolated strategy");
    }

    const teamInstances = Array.from(instances.values()).filter((instance) => {
      // Must match team
      if (instance.teamId !== request.teamId) return false;
      // Check browser type match if specified
      if (request.browserType && instance.browserType !== request.browserType) {
        return false;
      }
      return instance.isActive && instance.healthStatus === "healthy";
    });

    // Use least-used among team instances
    teamInstances.sort((a, b) => {
      const metricsA = a.getMetrics();
      const metricsB = b.getMetrics();
      return metricsA.pageCount - metricsB.pageCount;
    });

    return teamInstances[0] || null;
  }

  shouldCreateNew(
    instances: Map<string, BrowserInstance>,
    request: AllocationRequest,
    maxSize: number,
  ): boolean {
    if (!request.teamId || instances.size >= maxSize) return false;

    const teamInstances = Array.from(instances.values()).filter(
      (instance) => instance.teamId === request.teamId,
    );

    // Always create at least one instance per team
    return teamInstances.length === 0;
  }
}

/**
 * Browser pool implementation
 */
export class BrowserPool extends EventEmitter {
  private instances = new Map<string, BrowserInstance>();
  private config: RequiredPoolConfig & { createInstance?: PoolConfig["createInstance"] };
  private strategy: AllocationStrategy;
  private metrics: PoolMetrics;
  private cleanupInterval?: NodeJS.Timeout;
  private healthCheckInterval?: NodeJS.Timeout;
  private _isInitialized = false;

  constructor(config: PoolConfig) {
    super();

    this.config = {
      maxSize: config.maxSize,
      minSize: config.minSize || 0,
      maxIdleTime: config.maxIdleTime || 30 * 60 * 1000, // 30 minutes
      healthCheckInterval: config.healthCheckInterval || 60 * 1000, // 1 minute
      warmupSize: config.warmupSize || 0,
      allocationStrategy: config.allocationStrategy || "round-robin",
      createInstance: config.createInstance,
    };

    this.strategy = this.createStrategy(this.config.allocationStrategy);

    this.metrics = {
      totalInstances: 0,
      activeInstances: 0,
      idleInstances: 0,
      healthyInstances: 0,
      degradedInstances: 0,
      unhealthyInstances: 0,
      totalRequests: 0,
      failedRequests: 0,
      avgWaitTime: 0,
    };
  }

  get isInitialized(): boolean {
    return this._isInitialized;
  }

  /**
   * Initialize the pool
   */
  async initialize(): Promise<void> {
    if (this._isInitialized) return;

    logger.info("Initializing browser pool", {
      config: this.config,
    });

    // Start monitoring intervals
    this.startCleanupInterval();
    this.startHealthCheckInterval();

    // Warmup pool if configured
    if (this.config.warmupSize > 0) {
      await this.warmup();
    }

    this._isInitialized = true;
    this.emit("initialized");

    logger.info("Browser pool initialized", {
      instanceCount: this.instances.size,
    });
  }

  /**
   * Allocate a browser instance
   */
  async allocate(request: AllocationRequest): Promise<AllocationResult> {
    if (!this._isInitialized) {
      throw new Error("Pool not initialized");
    }

    const startTime = Date.now();
    this.metrics.totalRequests++;

    logger.debug("Processing allocation request", {
      teamId: request.teamId,
      browserType: request.browserType,
      priority: request.priority,
    });

    try {
      // Try to allocate existing instance
      let instance = this.strategy.allocate(this.instances, request);

      // Create new instance if needed
      if (
        !instance &&
        this.strategy.shouldCreateNew(this.instances, request, this.config.maxSize)
      ) {
        instance = await this.createInstance({
          teamId: request.teamId,
          browserType: request.browserType || "chromium",
        });
      }

      if (!instance) {
        this.metrics.failedRequests++;
        throw new Error("No available browser instances");
      }

      // Get or create page
      const page = await instance.getMainPage();
      const allocationTime = Date.now() - startTime;

      // Update metrics
      this.updateAllocationMetrics(allocationTime);

      logger.debug("Browser allocated", {
        instanceId: instance.id,
        teamId: request.teamId,
        allocationTime,
      });

      return {
        instance,
        page,
        allocationTime,
      };
    } catch (error) {
      this.metrics.failedRequests++;
      logger.error("Allocation failed", {
        teamId: request.teamId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Release a browser instance back to the pool
   */
  async release(instanceId: string): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      logger.warn("Attempted to release unknown instance", { instanceId });
      return;
    }

    instance.touch();
    logger.debug("Instance released", { instanceId });
  }

  /**
   * Remove an instance from the pool
   */
  async remove(instanceId: string, force = false): Promise<void> {
    const instance = this.instances.get(instanceId);
    if (!instance) return;

    logger.info("Removing instance from pool", {
      instanceId,
      force,
    });

    try {
      await instance.close(force);
      this.instances.delete(instanceId);
      this.updateMetrics();
      this.emit("instance-removed", instanceId);
    } catch (error) {
      logger.error("Failed to remove instance", {
        instanceId,
        error: error instanceof Error ? error.message : String(error),
      });
      if (!force) throw error;
    }
  }

  /**
   * Get pool metrics
   */
  getMetrics(): PoolMetrics {
    return { ...this.metrics };
  }

  /**
   * Get pool status
   */
  getStatus() {
    const instances = Array.from(this.instances.values()).map((instance) => instance.getSummary());

    return {
      initialized: this._isInitialized,
      config: this.config,
      metrics: this.getMetrics(),
      instances,
    };
  }

  /**
   * Shutdown the pool
   */
  async shutdown(): Promise<void> {
    logger.info("Shutting down browser pool", {
      instanceCount: this.instances.size,
    });

    this._isInitialized = false;

    // Clear intervals
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    // Close all instances
    const closePromises = Array.from(this.instances.values()).map((instance) =>
      instance.close(true).catch((err) => {
        logger.error("Failed to close instance during shutdown", {
          instanceId: instance.id,
          error: err.message,
        });
      }),
    );

    await Promise.allSettled(closePromises);
    this.instances.clear();

    this.emit("shutdown");
    logger.info("Browser pool shutdown complete");
  }

  /**
   * Create a new browser instance
   */
  private async createInstance(config: {
    teamId?: string;
    browserType?: "chromium" | "firefox" | "webkit";
  }): Promise<BrowserInstance> {
    if (!this.config.createInstance) {
      throw new Error("No createInstance factory provided to pool");
    }

    const instance = await this.config.createInstance(config);

    // Add instance to pool
    this.instances.set(instance.id, instance);
    this.updateMetrics();

    return instance;
  }

  /**
   * Warmup the pool
   */
  private async warmup(): Promise<void> {
    logger.info("Warming up browser pool", {
      warmupSize: this.config.warmupSize,
    });

    const createPromises = [];
    for (let i = 0; i < this.config.warmupSize; i++) {
      createPromises.push(
        this.createInstance({ browserType: "chromium" }).catch((err) => {
          logger.error("Failed to create warmup instance", {
            error: err.message,
          });
        }),
      );
    }

    await Promise.allSettled(createPromises);
  }

  /**
   * Start cleanup interval
   */
  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(() => {
      this.performCleanup().catch((err) => {
        logger.error("Cleanup failed", { error: err.message });
      });
    }, 60 * 1000); // Every minute
  }

  /**
   * Start health check interval
   */
  private startHealthCheckInterval(): void {
    this.healthCheckInterval = setInterval(() => {
      this.performHealthChecks().catch((err) => {
        logger.error("Health check failed", { error: err.message });
      });
    }, this.config.healthCheckInterval);
  }

  /**
   * Perform cleanup of idle instances
   */
  private async performCleanup(): Promise<void> {
    const instancesToRemove: string[] = [];

    for (const [id, instance] of this.instances) {
      // Remove unhealthy instances
      if (instance.healthStatus === "unhealthy") {
        instancesToRemove.push(id);
        continue;
      }

      // Remove idle instances (but maintain minimum)
      if (instance.isIdle(this.config.maxIdleTime) && this.instances.size > this.config.minSize) {
        instancesToRemove.push(id);
      }
    }

    if (instancesToRemove.length > 0) {
      logger.info("Cleaning up instances", {
        count: instancesToRemove.length,
      });

      for (const id of instancesToRemove) {
        await this.remove(id, true);
      }
    }
  }

  /**
   * Perform health checks on all instances
   */
  private async performHealthChecks(): Promise<void> {
    const checkPromises = Array.from(this.instances.values()).map((instance) =>
      instance.checkHealth().catch((err) => {
        logger.error("Instance health check failed", {
          instanceId: instance.id,
          error: err.message,
        });
        return false;
      }),
    );

    await Promise.allSettled(checkPromises);
    this.updateMetrics();
  }

  /**
   * Update pool metrics
   */
  private updateMetrics(): void {
    const instances = Array.from(this.instances.values());

    this.metrics.totalInstances = instances.length;
    this.metrics.activeInstances = instances.filter((i) => i.isActive).length;
    this.metrics.idleInstances = instances.filter(
      (i) => i.isActive && i.getMetrics().pageCount === 0,
    ).length;

    this.metrics.healthyInstances = instances.filter((i) => i.healthStatus === "healthy").length;
    this.metrics.degradedInstances = instances.filter((i) => i.healthStatus === "degraded").length;
    this.metrics.unhealthyInstances = instances.filter(
      (i) => i.healthStatus === "unhealthy",
    ).length;
  }

  /**
   * Update allocation metrics
   */
  private updateAllocationMetrics(allocationTime: number): void {
    // Simple moving average
    const alpha = 0.1; // Smoothing factor
    this.metrics.avgWaitTime = alpha * allocationTime + (1 - alpha) * this.metrics.avgWaitTime;
  }

  /**
   * Create strategy instance
   */
  private createStrategy(type: string): AllocationStrategy {
    switch (type) {
      case "round-robin":
        return new RoundRobinStrategy();
      case "least-used":
        return new LeastUsedStrategy();
      case "team-isolated":
        return new TeamIsolatedStrategy();
      default:
        throw new Error(`Unknown allocation strategy: ${type}`);
    }
  }
}
