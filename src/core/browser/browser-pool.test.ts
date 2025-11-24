/**
 * Tests for BrowserPool class and allocation strategies
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BrowserInstance } from "./browser-instance.js";
import type { AllocationRequest, PoolConfig } from "./browser-pool.js";
import {
  BrowserPool,
  LeastUsedStrategy,
  RoundRobinStrategy,
  TeamIsolatedStrategy,
} from "./browser-pool.js";

// Mock logger
vi.mock("../../shared/pino-logger.js", () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

// Mock child_process to prevent shell execution of browser paths during version checks
vi.mock("node:child_process", () => ({
  execSync: vi.fn(() => "Chromium 120.0.0.0"),
  exec: vi.fn((_cmd, _opts, callback) => {
    if (callback) callback(null, { stdout: "Chromium 120.0.0.0", stderr: "" });
  }),
  spawn: vi.fn(),
}));

describe("BrowserPool", () => {
  let pool: BrowserPool;
  let mockCreateInstance: ReturnType<typeof vi.fn>;

  const defaultConfig: PoolConfig = {
    maxSize: 5,
    minSize: 0,
    maxIdleTime: 30000,
    warmupSize: 0,
    allocationStrategy: "round-robin",
  };

  beforeEach(() => {
    mockCreateInstance = vi.fn();
    pool = new BrowserPool(defaultConfig);
    // Inject mock factory
    (pool as any).createInstance = mockCreateInstance;
  });

  afterEach(async () => {
    // Clean up pool
    if (pool.isInitialized) {
      await pool.shutdown();
    }
    vi.clearAllMocks();
  });

  describe("initialization", () => {
    it("should initialize with correct config", async () => {
      await pool.initialize();

      const status = pool.getStatus();
      expect(status.initialized).toBe(true);
      expect(status.metrics.totalInstances).toBe(0);
      expect(status.metrics.activeInstances).toBe(0);
      expect(status.metrics.idleInstances).toBe(0);
    });

    it("should warm up pool if warmupSize is set", async () => {
      const warmupPool = new BrowserPool({ ...defaultConfig, warmupSize: 2 });
      const mockInstance1 = createMockInstance("instance-1");
      const mockInstance2 = createMockInstance("instance-2");

      let createCount = 0;
      (warmupPool as any).createInstance = vi.fn().mockImplementation(() => {
        const instance = createCount === 0 ? mockInstance1 : mockInstance2;
        createCount++;
        // Add instance to pool
        (warmupPool as any).instances.set(instance.id, instance);
        (warmupPool as any).updateMetrics();
        return Promise.resolve(instance);
      });

      await warmupPool.initialize();

      const status = warmupPool.getStatus();
      expect(status.metrics.totalInstances).toBe(2);
      expect(status.instances.length).toBe(2);
    });
  });

  describe("allocation", () => {
    it("should create new instance when pool is empty", async () => {
      await pool.initialize();

      const mockInstance = createMockInstance("new-instance");
      const mockPage = {
        setDefaultTimeout: vi.fn(),
        setDefaultNavigationTimeout: vi.fn(),
      };
      mockInstance.getMainPage = vi.fn().mockResolvedValue(mockPage);
      mockCreateInstance.mockResolvedValueOnce(mockInstance);

      const request: AllocationRequest = {
        browserType: "chromium",
        priority: "normal",
      };

      // Mock the createInstance to add to pool
      mockCreateInstance.mockImplementation(async (_config) => {
        (pool as any).instances.set(mockInstance.id, mockInstance);
        (pool as any).updateMetrics();
        return mockInstance;
      });

      const result = await pool.allocate(request);

      expect(result.instance).toBe(mockInstance);
      expect(result.page).toBe(mockPage);
      expect(mockCreateInstance).toHaveBeenCalledWith({
        browserType: "chromium",
      });
    });

    it("should reuse existing instance from pool", async () => {
      await pool.initialize();

      const mockInstance = createMockInstance("existing-instance");
      const mockPage = {
        setDefaultTimeout: vi.fn(),
        setDefaultNavigationTimeout: vi.fn(),
      };
      mockInstance.getMainPage = vi.fn().mockResolvedValue(mockPage);

      // Pre-populate pool
      (pool as any).instances.set(mockInstance.id, mockInstance);
      // Update metrics
      (pool as any).updateMetrics();

      const request: AllocationRequest = {
        browserType: "chromium",
        priority: "normal",
      };

      const result = await pool.allocate(request);

      expect(result.instance).toBe(mockInstance);
      expect(result.page).toBe(mockPage);
      expect(mockCreateInstance).not.toHaveBeenCalled();
    });

    it("should respect max pool size", async () => {
      await pool.initialize();

      // Fill pool to max with instances that can't be allocated
      for (let i = 0; i < defaultConfig.maxSize; i++) {
        const instance = createMockInstance(`instance-${i}`, undefined, undefined, {
          browserType: "webkit", // Different from requested chromium
        });
        (instance as any).getMetrics = vi.fn().mockReturnValue({ pageCount: 5 }); // High page count
        (pool as any).instances.set(instance.id, instance);
      }
      (pool as any).updateMetrics();

      const request: AllocationRequest = {
        browserType: "chromium",
        priority: "normal",
      };

      await expect(pool.allocate(request)).rejects.toThrow("No available browser instances");
    });
  });

  describe("release", () => {
    it("should release instance and update touch time", async () => {
      await pool.initialize();

      const mockInstance = createMockInstance("test-instance");
      mockInstance.touch = vi.fn();

      (pool as any).instances.set(mockInstance.id, mockInstance);
      (pool as any).updateMetrics();

      await pool.release(mockInstance.id);

      // Instance should be touched and still in pool
      expect((pool as any).instances.has(mockInstance.id)).toBe(true);
      expect(mockInstance.touch).toHaveBeenCalled();
    });

    it("should remove instance from pool", async () => {
      await pool.initialize();

      const mockInstance = createMockInstance("test-instance");
      mockInstance.close = vi.fn().mockResolvedValue(undefined);

      (pool as any).instances.set(mockInstance.id, mockInstance);
      (pool as any).updateMetrics();

      await pool.remove(mockInstance.id);

      expect(mockInstance.close).toHaveBeenCalled();
      expect((pool as any).instances.has(mockInstance.id)).toBe(false);
    });
  });

  describe("cleanup", () => {
    it("should remove idle instances", async () => {
      await pool.initialize();

      const idleInstance = createMockInstance("idle-instance");
      idleInstance.isIdle = vi.fn().mockReturnValue(true);
      idleInstance.close = vi.fn().mockResolvedValue(undefined);

      (pool as any).instances.set(idleInstance.id, idleInstance);
      (pool as any).updateMetrics();

      await (pool as any).performCleanup();

      expect(idleInstance.close).toHaveBeenCalled();
      expect((pool as any).instances.has(idleInstance.id)).toBe(false);
    });

    it("should not remove instances below minimum size", async () => {
      const minSizePool = new BrowserPool({ ...defaultConfig, minSize: 2 });
      await minSizePool.initialize();

      const idleInstance1 = createMockInstance("idle-1");
      const idleInstance2 = createMockInstance("idle-2");
      (idleInstance1 as any).isIdle = vi.fn().mockReturnValue(true);
      (idleInstance2 as any).isIdle = vi.fn().mockReturnValue(true);
      (idleInstance1 as any).close = vi.fn().mockResolvedValue(undefined);
      (idleInstance2 as any).close = vi.fn().mockResolvedValue(undefined);

      (minSizePool as any).instances.set(idleInstance1.id, idleInstance1);
      (minSizePool as any).instances.set(idleInstance2.id, idleInstance2);
      (minSizePool as any).updateMetrics();

      await (minSizePool as any).performCleanup();

      // Should not close any instances since we're at minimum size
      expect((idleInstance1 as any).close).not.toHaveBeenCalled();
      expect((idleInstance2 as any).close).not.toHaveBeenCalled();
      expect((minSizePool as any).instances.size).toBe(2);
    });

    it("should remove unhealthy instances regardless of idle status", async () => {
      await pool.initialize();

      const unhealthyInstance = createMockInstance("unhealthy-instance", undefined, undefined, {
        healthStatus: "unhealthy",
      });
      (unhealthyInstance as any).isIdle = vi.fn().mockReturnValue(false); // Not idle
      (unhealthyInstance as any).close = vi.fn().mockResolvedValue(undefined);

      (pool as any).instances.set(unhealthyInstance.id, unhealthyInstance);
      (pool as any).updateMetrics();

      await (pool as any).performCleanup();

      expect((unhealthyInstance as any).close).toHaveBeenCalled();
      expect((pool as any).instances.has(unhealthyInstance.id)).toBe(false);
    });
  });

  describe("health monitoring", () => {
    it("should start health check interval on initialization", async () => {
      const mockSetInterval = vi.spyOn(global, "setInterval");

      await pool.initialize();

      expect(mockSetInterval).toHaveBeenCalled();
      expect((pool as any).healthCheckInterval).toBeDefined();

      mockSetInterval.mockRestore();
    });

    it("should perform health checks on all instances", async () => {
      await pool.initialize();

      const instance1 = createMockInstance("instance-1");
      const instance2 = createMockInstance("instance-2");
      instance1.checkHealth = vi.fn().mockResolvedValue(true);
      instance2.checkHealth = vi.fn().mockResolvedValue(false);

      (pool as any).instances.set(instance1.id, instance1);
      (pool as any).instances.set(instance2.id, instance2);

      await (pool as any).performHealthChecks();

      expect(instance1.checkHealth).toHaveBeenCalled();
      expect(instance2.checkHealth).toHaveBeenCalled();
    });

    it("should handle health check errors gracefully", async () => {
      await pool.initialize();

      const instance = createMockInstance("error-instance");
      instance.checkHealth = vi.fn().mockRejectedValue(new Error("Health check failed"));

      (pool as any).instances.set(instance.id, instance);

      // Should not throw
      await expect((pool as any).performHealthChecks()).resolves.not.toThrow();
    });
  });

  describe("metrics", () => {
    it("should calculate metrics correctly", async () => {
      await pool.initialize();

      const activeInstance = createMockInstance("active-instance", undefined, undefined, {
        isActive: true,
        pageCount: 2,
      });

      const idleInstance = createMockInstance("idle-instance", undefined, undefined, {
        isActive: true,
        pageCount: 0,
      });

      const unhealthyInstance = createMockInstance("unhealthy-instance", undefined, undefined, {
        isActive: true,
        healthStatus: "unhealthy",
      });

      (pool as any).instances.set(activeInstance.id, activeInstance);
      (pool as any).instances.set(idleInstance.id, idleInstance);
      (pool as any).instances.set(unhealthyInstance.id, unhealthyInstance);

      (pool as any).updateMetrics();

      const metrics = pool.getMetrics();
      expect(metrics.totalInstances).toBe(3);
      expect(metrics.activeInstances).toBe(3);
      expect(metrics.idleInstances).toBe(2); // Both idle and unhealthy instances are idle (pageCount = 0)
      expect(metrics.healthyInstances).toBe(2);
      expect(metrics.unhealthyInstances).toBe(1);
    });

    it("should track allocation metrics", async () => {
      await pool.initialize();

      const mockInstance = createMockInstance("metrics-instance");
      const mockPage = {
        setDefaultTimeout: vi.fn(),
        setDefaultNavigationTimeout: vi.fn(),
      };
      mockInstance.getMainPage = vi.fn().mockResolvedValue(mockPage);

      (pool as any).instances.set(mockInstance.id, mockInstance);
      (pool as any).updateMetrics();

      const request: AllocationRequest = { browserType: "chromium", priority: "normal" };

      await pool.allocate(request);

      const metrics = pool.getMetrics();
      expect(metrics.totalRequests).toBe(1);
      expect(typeof metrics.avgWaitTime).toBe("number");
      expect(metrics.avgWaitTime).toBeGreaterThanOrEqual(0);
    });

    it("should track failed requests", async () => {
      await pool.initialize();

      const request: AllocationRequest = { browserType: "chromium", priority: "normal" };

      // Force allocation to fail by making strategy return null and not create new
      const originalAllocate = (pool as any).strategy.allocate;
      const originalShouldCreateNew = (pool as any).strategy.shouldCreateNew;

      (pool as any).strategy.allocate = vi.fn().mockReturnValue(null);
      (pool as any).strategy.shouldCreateNew = vi.fn().mockReturnValue(false);

      try {
        await pool.allocate(request);
      } catch {
        // Expected to fail
      }

      const metrics = pool.getMetrics();
      expect(metrics.failedRequests).toBeGreaterThan(0);

      // Restore original methods
      (pool as any).strategy.allocate = originalAllocate;
      (pool as any).strategy.shouldCreateNew = originalShouldCreateNew;
    });
  });

  describe("allocation strategies", () => {
    describe("strategy creation", () => {
      it("should create round-robin strategy", () => {
        const testPool = new BrowserPool({ ...defaultConfig, allocationStrategy: "round-robin" });
        const strategy = (testPool as any).createStrategy("round-robin");

        expect(strategy).toBeInstanceOf(RoundRobinStrategy);
      });

      it("should create least-used strategy", () => {
        const testPool = new BrowserPool({ ...defaultConfig, allocationStrategy: "least-used" });
        const strategy = (testPool as any).createStrategy("least-used");

        expect(strategy).toBeInstanceOf(LeastUsedStrategy);
      });

      it("should create team-isolated strategy", () => {
        const testPool = new BrowserPool({ ...defaultConfig, allocationStrategy: "team-isolated" });
        const strategy = (testPool as any).createStrategy("team-isolated");

        expect(strategy).toBeInstanceOf(TeamIsolatedStrategy);
      });

      it("should throw error for unknown strategy", () => {
        const testPool = new BrowserPool(defaultConfig);
        expect(() => (testPool as any).createStrategy("unknown")).toThrow(
          "Unknown allocation strategy: unknown",
        );
      });
    });

    describe("RoundRobinStrategy", () => {
      it("should handle empty instance list", () => {
        const strategy = new RoundRobinStrategy();
        const instancesMap = new Map<string, BrowserInstance>();

        const request: AllocationRequest = { browserType: "chromium", priority: "normal" };
        const result = strategy.allocate(instancesMap, request);

        expect(result).toBeNull();
      });

      it("should filter by browser type", () => {
        const strategy = new RoundRobinStrategy();
        const instancesMap = new Map<string, BrowserInstance>();

        const chromiumInstance = createMockInstance("chromium-instance", undefined, undefined, {
          browserType: "chromium",
        });

        const firefoxInstance = createMockInstance("firefox-instance", undefined, undefined, {
          browserType: "firefox",
        });

        instancesMap.set(chromiumInstance.id, chromiumInstance);
        instancesMap.set(firefoxInstance.id, firefoxInstance);

        const request: AllocationRequest = { browserType: "firefox", priority: "normal" };
        const result = strategy.allocate(instancesMap, request);

        expect(result?.id).toBe("firefox-instance");
      });

      it("should skip unhealthy instances", () => {
        const strategy = new RoundRobinStrategy();
        const instancesMap = new Map<string, BrowserInstance>();

        const healthyInstance = createMockInstance("healthy-instance", undefined, undefined, {
          healthStatus: "healthy",
        });

        const unhealthyInstance = createMockInstance("unhealthy-instance", undefined, undefined, {
          healthStatus: "unhealthy",
        });

        instancesMap.set(healthyInstance.id, healthyInstance);
        instancesMap.set(unhealthyInstance.id, unhealthyInstance);

        const request: AllocationRequest = { browserType: "chromium", priority: "normal" };
        const result = strategy.allocate(instancesMap, request);

        expect(result?.id).toBe("healthy-instance");
      });
    });

    describe("LeastUsedStrategy", () => {
      it("should handle empty instance list", () => {
        const strategy = new LeastUsedStrategy();
        const instancesMap = new Map<string, BrowserInstance>();

        const request: AllocationRequest = { browserType: "chromium", priority: "normal" };
        const result = strategy.allocate(instancesMap, request);

        expect(result).toBeNull();
      });

      it("should prefer instances with fewer pages", () => {
        const strategy = new LeastUsedStrategy();
        const instancesMap = new Map<string, BrowserInstance>();

        const busyInstance = createMockInstance("busy-instance");
        busyInstance.getMetrics = vi.fn().mockReturnValue({ pageCount: 5 });

        const idleInstance = createMockInstance("idle-instance");
        idleInstance.getMetrics = vi.fn().mockReturnValue({ pageCount: 1 });

        instancesMap.set(busyInstance.id, busyInstance);
        instancesMap.set(idleInstance.id, idleInstance);

        const request: AllocationRequest = { browserType: "chromium", priority: "normal" };
        const result = strategy.allocate(instancesMap, request);

        expect(result?.id).toBe("idle-instance");
      });
    });

    describe("TeamIsolatedStrategy", () => {
      it("should throw error when teamId is required but not provided", () => {
        const strategy = new TeamIsolatedStrategy();
        const instancesMap = new Map<string, BrowserInstance>();

        const request: AllocationRequest = { browserType: "chromium", priority: "normal" };
        expect(() => strategy.allocate(instancesMap, request)).toThrow(
          "Team ID required for team-isolated strategy",
        );
      });

      it("should create new instance when no team instances exist", () => {
        const strategy = new TeamIsolatedStrategy();
        const instancesMap = new Map<string, BrowserInstance>();

        const request: AllocationRequest = {
          browserType: "chromium",
          priority: "normal",
          teamId: "team-a",
        };
        const shouldCreate = strategy.shouldCreateNew(instancesMap, request, 5);

        expect(shouldCreate).toBe(true);
      });

      it("should not create new instance when team already has instances", () => {
        const strategy = new TeamIsolatedStrategy();
        const instancesMap = new Map<string, BrowserInstance>();

        const teamInstance = createMockInstance("team-instance", undefined, "team-a");
        instancesMap.set(teamInstance.id, teamInstance);

        const request: AllocationRequest = {
          browserType: "chromium",
          priority: "normal",
          teamId: "team-a",
        };
        const shouldCreate = strategy.shouldCreateNew(instancesMap, request, 5);

        expect(shouldCreate).toBe(false);
      });
    });
  });

  describe("shutdown", () => {
    it("should clear intervals on shutdown", async () => {
      await pool.initialize();

      const mockClearInterval = vi.spyOn(global, "clearInterval");

      await pool.shutdown();

      expect(mockClearInterval).toHaveBeenCalledTimes(2); // cleanup and health check intervals
      expect(pool.isInitialized).toBe(false);

      mockClearInterval.mockRestore();
    });

    it("should handle instance close errors during shutdown", async () => {
      await pool.initialize();

      const errorInstance = createMockInstance("error-instance");
      errorInstance.close = vi.fn().mockRejectedValue(new Error("Close failed"));

      (pool as any).instances.set(errorInstance.id, errorInstance);

      // Should not throw despite close error
      await expect(pool.shutdown()).resolves.not.toThrow();
    });
  });

  describe("pool status", () => {
    it("should return comprehensive status information", async () => {
      await pool.initialize();

      const instance = createMockInstance("status-instance");
      (pool as any).instances.set(instance.id, instance);
      (pool as any).updateMetrics();

      const status = pool.getStatus();

      expect(status).toHaveProperty("initialized");
      expect(status).toHaveProperty("config");
      expect(status).toHaveProperty("metrics");
      expect(status).toHaveProperty("instances");
      expect(Array.isArray(status.instances)).toBe(true);
    });
  });
});

describe("Allocation Strategies", () => {
  describe("RoundRobinStrategy", () => {
    it("should allocate instances in round-robin order", () => {
      const strategy = new RoundRobinStrategy();
      const instancesMap = new Map<string, BrowserInstance>();
      const instances = [
        createMockInstance("instance-1"),
        createMockInstance("instance-2"),
        createMockInstance("instance-3"),
      ];
      for (const i of instances) {
        instancesMap.set(i.id, i);
      }

      const request: AllocationRequest = { browserType: "chromium", priority: "normal" };

      // Round robin should cycle through available instances
      const allocations = [];
      for (let i = 0; i < 6; i++) {
        const allocated = strategy.allocate(instancesMap, request);
        allocations.push(allocated?.id);
      }

      // Should cycle through all three instances twice
      expect(allocations.filter((id) => id === "instance-1").length).toBeGreaterThanOrEqual(1);
      expect(allocations.filter((id) => id === "instance-2").length).toBeGreaterThanOrEqual(1);
      expect(allocations.filter((id) => id === "instance-3").length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("LeastUsedStrategy", () => {
    it("should allocate instance with least pages", () => {
      const strategy = new LeastUsedStrategy();
      const instancesMap = new Map<string, BrowserInstance>();

      const instance1 = createMockInstance("instance-1");
      const instance2 = createMockInstance("instance-2");
      const instance3 = createMockInstance("instance-3");

      // Set different page counts
      instance1.getMetrics = vi.fn().mockReturnValue({ pageCount: 3 });
      instance2.getMetrics = vi.fn().mockReturnValue({ pageCount: 1 });
      instance3.getMetrics = vi.fn().mockReturnValue({ pageCount: 2 });

      const instances = [instance1, instance2, instance3];

      for (const i of instances) {
        instancesMap.set(i.id, i);
      }

      const request: AllocationRequest = { browserType: "chromium", priority: "normal" };

      const result = strategy.allocate(instancesMap, request);
      expect(result?.id).toBe("instance-2");
    });
  });

  describe("TeamIsolatedStrategy", () => {
    it("should allocate team-specific instances", () => {
      const strategy = new TeamIsolatedStrategy();
      const instancesMap = new Map<string, BrowserInstance>();

      const instance1 = createMockInstance("instance-1", undefined, "team-a");
      const instance2 = createMockInstance("instance-2", undefined, "team-b");
      const instance3 = createMockInstance("instance-3", undefined, "team-a");

      instance1.getMetrics = vi.fn().mockReturnValue({ pageCount: 2 });
      instance3.getMetrics = vi.fn().mockReturnValue({ pageCount: 1 });

      const instances = [instance1, instance2, instance3];

      for (const i of instances) {
        instancesMap.set(i.id, i);
      }

      const request: AllocationRequest = {
        browserType: "chromium",
        priority: "normal",
        teamId: "team-a",
      };

      const selected = strategy.allocate(instancesMap, request);
      expect(selected?.teamId).toBe("team-a");
      expect(selected?.id).toBe("instance-3"); // Least used team instance
    });

    it("should return null if no team instance available", () => {
      const strategy = new TeamIsolatedStrategy();
      const instancesMap = new Map<string, BrowserInstance>();

      const instances = [
        createMockInstance("instance-1", undefined, "team-b"),
        createMockInstance("instance-2", undefined, "team-c"),
      ];

      for (const i of instances) {
        instancesMap.set(i.id, i);
      }

      const request: AllocationRequest = {
        browserType: "chromium",
        priority: "normal",
        teamId: "team-a",
      };

      const selected = strategy.allocate(instancesMap, request);
      expect(selected).toBeNull();
    });
  });
});

// Helper function to create mock instances
function createMockInstance(
  id: string,
  lastUsed?: Date,
  teamId?: string,
  options?: {
    browserType?: "chromium" | "firefox" | "webkit";
    isActive?: boolean;
    healthStatus?: "healthy" | "degraded" | "unhealthy";
    pageCount?: number;
  },
): BrowserInstance {
  const {
    browserType = "chromium",
    isActive = true,
    healthStatus = "healthy",
    pageCount = 0,
  } = options || {};

  const instance = {
    id,
    teamId,
    browserType,
    createdAt: new Date(),
    lastUsed: lastUsed || new Date(),
    isActive,
    healthStatus,
    isIdle: vi.fn().mockReturnValue(false),
    close: vi.fn().mockResolvedValue(undefined),
    checkHealth: vi.fn().mockResolvedValue(true),
    createPage: vi.fn(),
    getMainPage: vi.fn(),
    getMetrics: vi.fn().mockReturnValue({
      pageCount,
      requestCount: 0,
      errorCount: 0,
      lastHealthCheck: new Date(),
      healthStatus,
    }),
    getSummary: vi.fn().mockReturnValue({
      id,
      teamId,
      browserType,
      createdAt: new Date(),
      lastUsed: lastUsed || new Date(),
      isActive,
      pageCount,
      healthStatus,
      metrics: {
        pageCount,
        requestCount: 0,
        errorCount: 0,
        lastHealthCheck: new Date(),
        healthStatus,
      },
    }),
    touch: vi.fn(),
    initialize: vi.fn(),
  } as unknown as BrowserInstance;

  return instance;
}
