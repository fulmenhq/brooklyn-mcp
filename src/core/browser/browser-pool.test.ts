/**
 * Tests for BrowserPool class and allocation strategies
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BrowserInstance } from "./browser-instance.js";
import {
  BrowserPool,
  LeastUsedStrategy,
  RoundRobinStrategy,
  TeamIsolatedStrategy,
} from "./browser-pool.js";
import type { AllocationRequest, PoolConfig } from "./browser-pool.js";

// Mock logger
vi.mock("../../shared/pino-logger.js", () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
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
        const instance = createMockInstance(`instance-${i}`);
        // Make instance not allocatable by setting wrong browser type or unhealthy
        (instance as any).browserType = "webkit"; // Different from requested chromium
        instance.getMetrics = vi.fn().mockReturnValue({ pageCount: 5 }); // High page count
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
      instances.forEach((i) => instancesMap.set(i.id, i));

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

      instances.forEach((i) => instancesMap.set(i.id, i));

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

      instances.forEach((i) => instancesMap.set(i.id, i));

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

      instances.forEach((i) => instancesMap.set(i.id, i));

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
function createMockInstance(id: string, lastUsed?: Date, teamId?: string): BrowserInstance {
  const instance = {
    id,
    teamId,
    browserType: "chromium" as const,
    createdAt: new Date(),
    lastUsed: lastUsed || new Date(),
    isActive: true,
    healthStatus: "healthy" as const,
    isIdle: vi.fn().mockReturnValue(false),
    close: vi.fn().mockResolvedValue(undefined),
    checkHealth: vi.fn().mockResolvedValue(true),
    createPage: vi.fn(),
    getMainPage: vi.fn(),
    getMetrics: vi.fn().mockReturnValue({
      pageCount: 0,
      requestCount: 0,
      errorCount: 0,
      lastHealthCheck: new Date(),
      healthStatus: "healthy",
    }),
    getSummary: vi.fn().mockReturnValue({
      id,
      teamId,
      browserType: "chromium" as const,
      createdAt: new Date(),
      lastUsed: lastUsed || new Date(),
      isActive: true,
      pageCount: 0,
      healthStatus: "healthy" as const,
      metrics: {
        pageCount: 0,
        requestCount: 0,
        errorCount: 0,
        lastHealthCheck: new Date(),
        healthStatus: "healthy",
      },
    }),
    touch: vi.fn(),
    initialize: vi.fn(),
  } as unknown as BrowserInstance;

  return instance;
}
