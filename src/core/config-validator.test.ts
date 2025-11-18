/**
 * Configuration validator tests
 * Tests JSON Schema validation for Brooklyn configuration
 */

import { beforeAll, describe, expect, it } from "vitest";
import type { BrooklynConfig } from "./config.js";
import { ConfigValidator, validateBrooklynConfig } from "./config-validator.js";

describe("ConfigValidator", () => {
  let validator: ConfigValidator;

  beforeAll(async () => {
    validator = new ConfigValidator();
    await validator.initialize();
  });

  describe("schema validation", () => {
    it("should validate a minimal valid configuration", async () => {
      const validConfig: Partial<BrooklynConfig> = {
        serviceName: "brooklyn-mcp-server",
        version: "1.6.0",
        teamId: "default",
        transports: {
          mcp: { enabled: true },
          http: {
            enabled: true,
            port: 3000,
            host: "127.0.0.1",
            cors: true,
            rateLimiting: false,
          },
        },
        browsers: {
          maxInstances: 5,
          defaultType: "chromium",
          headless: true,
          timeout: 30000,
        },
        security: {
          allowedDomains: ["*"],
          rateLimit: {
            requests: 100,
            windowMs: 60000,
          },
        },
        authentication: {
          mode: "none",
          developmentOnly: true,
          providers: {},
        },
        logging: {
          level: "info",
          format: "pretty",
        },
        plugins: {
          directory: "./plugins",
          autoLoad: true,
          allowUserPlugins: true,
        },
        paths: {
          config: "~/.brooklyn",
          logs: "~/.brooklyn/logs",
          plugins: "~/.brooklyn/plugins",
          browsers: "~/.brooklyn/browsers",
          assets: "~/.brooklyn/assets",
          pids: "~/.brooklyn/pids",
        },
      };

      const result = await validateBrooklynConfig(validConfig);

      if (!result.valid) {
        // Debug validation errors if test fails
      }

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should reject invalid authentication mode", async () => {
      const invalidConfig = {
        serviceName: "brooklyn-mcp-server",
        version: "1.6.0",
        teamId: "default",
        authentication: {
          mode: "invalid-mode" as any, // Invalid mode for testing
          providers: {},
        },
      };

      const result = validator.validateConfig(invalidConfig, true); // Use relaxed validation
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((e) => e.message.includes("allowed values"))).toBe(true);
    });

    it("should require developmentOnly flag for none mode", async () => {
      const invalidConfig = {
        serviceName: "brooklyn-mcp-server",
        version: "1.6.0",
        teamId: "default",
        authentication: {
          mode: "none" as const, // Missing developmentOnly: true
          providers: {},
        },
      };

      const result = validator.validateConfig(invalidConfig, true); // Use relaxed validation
      expect(result.valid).toBe(false);
      expect(
        result.errors.some(
          (e) => e.message.includes("developmentOnly") || e.message.includes("required"),
        ),
      ).toBe(true);
    });

    it("should validate GitHub OAuth configuration", async () => {
      const githubConfig: Partial<BrooklynConfig> = {
        serviceName: "brooklyn-mcp-server",
        version: "1.6.0",
        teamId: "default",
        transports: {
          mcp: { enabled: true },
          http: {
            enabled: true,
            port: 3000,
            host: "127.0.0.1",
            cors: true,
            rateLimiting: false,
          },
        },
        browsers: {
          maxInstances: 10,
          defaultType: "chromium",
          headless: true,
          timeout: 30000,
        },
        security: {
          allowedDomains: ["*.company.com"],
          rateLimit: {
            requests: 100,
            windowMs: 60000,
          },
        },
        authentication: {
          mode: "github",
          behindProxy: true,
          providers: {
            github: {
              clientId: "ghp_xxxxxxxxxxxxxxxxxxxx",
              clientSecret: "your_github_client_secret",
              callbackUrl: "https://brooklyn.company.com/oauth/callback",
              allowedOrgs: ["fulmenhq"],
              scopes: ["user:email", "read:org"],
            },
          },
        },
        logging: {
          level: "info",
          format: "json",
        },
        plugins: {
          directory: "/opt/brooklyn/plugins",
          autoLoad: true,
          allowUserPlugins: false,
        },
        paths: {
          config: "/etc/brooklyn",
          logs: "/var/log/brooklyn",
          plugins: "/opt/brooklyn/plugins",
          browsers: "/opt/brooklyn/browsers",
          assets: "/opt/brooklyn/assets",
          pids: "/var/run/brooklyn",
        },
      };

      const result = validator.validateConfig(githubConfig);

      if (!result.valid) {
        // Debug validation errors if test fails
      }

      // Should be valid if schema is available, or pass if schema validation is disabled
      expect(result.valid).toBe(true);
    });

    it("should validate port ranges", async () => {
      const invalidPortConfig = {
        serviceName: "brooklyn-mcp-server",
        version: "1.6.0",
        teamId: "default",
        transports: {
          mcp: { enabled: true },
          http: {
            enabled: true,
            port: 999999, // Invalid port
            host: "127.0.0.1",
            cors: true,
            rateLimiting: false,
          },
        },
      };

      const result = validator.validateConfig(invalidPortConfig, true); // Use relaxed validation
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.message.includes("<="))).toBe(true);
    });
  });

  describe("schema availability", () => {
    it("should report schema availability", () => {
      const schemaInfo = validator.getSchemaInfo();
      expect(schemaInfo).toHaveProperty("available");
      expect(typeof schemaInfo.available).toBe("boolean");

      if (schemaInfo.available) {
        expect(schemaInfo).toHaveProperty("title");
        expect(schemaInfo).toHaveProperty("version");
      }
    });
  });

  describe("config file validation", () => {
    it("should validate JSON config content", () => {
      const jsonContent = JSON.stringify({
        serviceName: "test-service",
        version: "1.0.0",
        teamId: "test",
      });

      const result = validator.validateConfigFile("test.json", jsonContent);
      // Should not throw, even if validation fails
      expect(result).toHaveProperty("valid");
      expect(result).toHaveProperty("errors");
    });

    it("should handle invalid JSON", () => {
      const invalidJson = "{ invalid json }";

      const result = validator.validateConfigFile("test.json", invalidJson);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});
