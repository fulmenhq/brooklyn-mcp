/**
 * Unified configuration management for Brooklyn
 * Supports environment variables, config files, and CLI overrides
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { getLogger } from "../shared/pino-logger.js";
import { validateBrooklynConfig, validateBrooklynConfigFile } from "./config-validator.js";

// ARCHITECTURE FIX: Lazy logger initialization to avoid circular dependency
// CRITICAL: Do not use logger during initial config loading to prevent circular dependency
let logger: ReturnType<typeof getLogger> | null = null;

// Function to enable logging after transport is determined
export function enableConfigLogger(): void {
  if (!logger) {
    logger = getLogger("config");
  }
}

/**
 * Core Brooklyn configuration
 */
export interface BrooklynConfig {
  // Service identity
  serviceName: string;
  version: string;
  environment: "development" | "production" | "test";

  // Team configuration
  teamId: string;

  // Development mode
  devMode?: boolean;

  // Transport configuration
  transports: {
    mcp: {
      enabled: boolean;
    };
    http: {
      enabled: boolean;
      port: number;
      host: string;
      cors: boolean;
      rateLimiting: boolean;
    };
  };

  // Browser management
  browsers: {
    maxInstances: number;
    defaultType: "chromium" | "firefox" | "webkit";
    headless: boolean;
    timeout: number;
    installPath?: string; // Custom browser installation path
  };

  // Security
  security: {
    allowedDomains: string[];
    rateLimit: {
      requests: number;
      windowMs: number;
    };
  };

  // Authentication
  authentication: {
    mode: "github" | "local" | "none";
    developmentOnly?: boolean; // Required for "none" mode
    behindProxy?: boolean; // TLS termination configuration

    providers: {
      github?: {
        clientId: string;
        clientSecret: string;
        allowedOrgs?: string[];
        allowedTeams?: { [org: string]: string[] };
        callbackUrl: string;
        scopes?: string[];
      };
      local?: {
        userStore: string; // Path to user store file
        sessionTimeout: number; // Session timeout in milliseconds
        requirePasswordChange?: boolean;
        maxFailedAttempts?: number;
        lockoutDuration?: number; // In milliseconds
      };
    };
  };

  // Logging
  logging: {
    level: "debug" | "info" | "warn" | "error";
    format: "pretty" | "json";
    file?: string;
    maxFiles?: number;
    maxSize?: string;
  };

  // Plugins
  plugins: {
    directory: string;
    autoLoad: boolean;
    allowUserPlugins: boolean;
  };

  // Paths
  paths: {
    config: string;
    logs: string;
    plugins: string;
    browsers: string;
    assets: string;
    pids: string;
  };
}

/**
 * Configuration sources in order of precedence
 */
export interface ConfigSources {
  defaults: Partial<BrooklynConfig>;
  env: Partial<BrooklynConfig>;
  dotenv?: Partial<BrooklynConfig>;
  configFile?: Partial<BrooklynConfig>;
  cliOverrides?: Partial<BrooklynConfig>;
}

/**
 * Configuration manager
 */
export class ConfigManager {
  private static instance: ConfigManager | null = null;
  private config: BrooklynConfig | null = null;
  private sources: ConfigSources | null = null;

  private constructor() {}

  static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  /**
   * Load configuration from all sources
   */
  async load(cliOverrides?: Partial<BrooklynConfig>): Promise<BrooklynConfig> {
    if (this.config) {
      return this.config;
    }

    // Don't log during initial load - we might be in MCP mode
    // logger?.info("Loading Brooklyn configuration");

    // Load configuration sources
    this.sources = {
      defaults: this.getDefaults(),
      env: this.loadFromEnvironment(),
      dotenv: await this.loadFromDotenv(),
      configFile: await this.loadFromConfigFile(),
      cliOverrides,
    };

    // Merge configuration in precedence order
    this.config = this.mergeConfigurations(this.sources);

    // Validate configuration
    this.validateConfiguration(this.config);

    // Schema validation (with graceful fallback)
    await this.validateConfigurationSchema(this.config);

    // Ensure directories exist
    await this.ensureDirectories(this.config);

    // Don't log during initial load - we might be in MCP mode
    // Will be logged later after transport is determined
    // logger?.info("Configuration loaded successfully", {
    //   serviceName: this.config.serviceName,
    //   version: this.config.version,
    //   teamId: this.config.teamId,
    //   environment: this.config.environment,
    // });

    return this.config;
  }

  /**
   * Get current configuration
   */
  getConfig(): BrooklynConfig {
    if (!this.config) {
      throw new Error("Configuration not loaded. Call load() first.");
    }
    return this.config;
  }

  /**
   * Get configuration sources for debugging
   */
  getSources(): ConfigSources {
    if (!this.sources) {
      throw new Error("Configuration not loaded. Call load() first.");
    }
    return this.sources;
  }

  /**
   * Update configuration at runtime
   */
  updateConfig(updates: Partial<BrooklynConfig>): void {
    if (!this.config) {
      throw new Error("Configuration not loaded. Call load() first.");
    }

    this.config = this.mergeDeep(this.config, updates);
    this.validateConfiguration(this.config!);

    logger?.debug("Configuration updated", { updates });
  }

  /**
   * Get default configuration
   */
  private getDefaults(): Partial<BrooklynConfig> {
    const homeDir = homedir();
    const brooklynDir = join(homeDir, ".brooklyn");

    return {
      serviceName: "brooklyn-mcp-server",
      version: "0.2.2-rc.16", // Embedded at build time
      environment: "production",
      teamId: "default",

      transports: {
        mcp: {
          enabled: true,
        },
        http: {
          enabled: true,
          port: 3000,
          host: "localhost",
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
        allowedDomains: ["*"],
        rateLimit: {
          requests: 100,
          windowMs: 60000, // 1 minute
        },
      },

      authentication: {
        mode: "none",
        developmentOnly: true, // Default to requiring explicit flag
        behindProxy: false,
        providers: {
          // GitHub provider will be configured via environment variables
          local: {
            userStore: join(brooklynDir, "users.json"),
            sessionTimeout: 86400000, // 24 hours
            requirePasswordChange: false,
            maxFailedAttempts: 5,
            lockoutDuration: 300000, // 5 minutes
          },
        },
      },

      logging: {
        level: "info",
        format: "pretty",
        maxFiles: 5,
        maxSize: "10MB",
      },

      plugins: {
        directory: join(brooklynDir, "plugins"),
        autoLoad: true,
        allowUserPlugins: true,
      },

      paths: {
        config: brooklynDir,
        logs: join(brooklynDir, "logs"),
        plugins: join(brooklynDir, "plugins"),
        browsers: join(brooklynDir, "browsers"),
        assets: join(brooklynDir, "assets"),
        pids: join(brooklynDir, "pids"),
      },
    };
  }

  /**
   * Load configuration from environment variables
   */
  private loadFromEnvironment(): Partial<BrooklynConfig> {
    const env = process.env;
    const config: any = {};

    // Service configuration
    if (env["BROOKLYN_SERVICE_NAME"]) config.serviceName = env["BROOKLYN_SERVICE_NAME"];
    if (env["BROOKLYN_VERSION"]) config.version = env["BROOKLYN_VERSION"];
    if (env["BROOKLYN_ENV"]) config.environment = env["BROOKLYN_ENV"];
    if (env["BROOKLYN_TEAM_ID"]) config.teamId = env["BROOKLYN_TEAM_ID"];

    // Transport configuration
    if (env["BROOKLYN_MCP_ENABLED"] !== undefined) {
      config.transports = { mcp: { enabled: env["BROOKLYN_MCP_ENABLED"] === "true" } };
    }
    if (env["BROOKLYN_HTTP_ENABLED"] !== undefined) {
      config.transports = config.transports || {};
      config.transports.http = config.transports.http || {};
      config.transports.http.enabled = env["BROOKLYN_HTTP_ENABLED"] === "true";
    }
    if (env["BROOKLYN_PORT"]) {
      config.transports = config.transports || {};
      config.transports.http = config.transports.http || {};
      config.transports.http.port = Number.parseInt(env["BROOKLYN_PORT"], 10);
    }
    if (env["BROOKLYN_HOST"]) {
      config.transports = config.transports || {};
      config.transports.http = config.transports.http || {};
      config.transports.http.host = env["BROOKLYN_HOST"];
    }

    // Browser configuration
    if (env["BROOKLYN_MAX_BROWSERS"]) {
      config.browsers = { maxInstances: Number.parseInt(env["BROOKLYN_MAX_BROWSERS"], 10) };
    }
    if (env["BROOKLYN_BROWSER_TYPE"]) {
      config.browsers = config.browsers || {};
      config.browsers.defaultType = env["BROOKLYN_BROWSER_TYPE"] as any;
    }
    if (env["BROOKLYN_HEADLESS"] !== undefined) {
      config.browsers = config.browsers || {};
      config.browsers.headless = env["BROOKLYN_HEADLESS"] === "true";
    }
    if (env["BROOKLYN_BROWSER_TIMEOUT"]) {
      config.browsers = config.browsers || {};
      config.browsers.timeout = Number.parseInt(env["BROOKLYN_BROWSER_TIMEOUT"], 10);
    }
    if (env["BROOKLYN_BROWSER_PATH"]) {
      config.browsers = config.browsers || {};
      config.browsers.installPath = env["BROOKLYN_BROWSER_PATH"];
    }

    // Security configuration
    if (env["BROOKLYN_ALLOWED_DOMAINS"]) {
      config.security = {
        allowedDomains: env["BROOKLYN_ALLOWED_DOMAINS"].split(",").map((d) => d.trim()),
      };
    }
    if (env["BROOKLYN_RATE_LIMIT_REQUESTS"]) {
      config.security = config.security || {};
      config.security.rateLimit = config.security.rateLimit || {};
      config.security.rateLimit.requests = Number.parseInt(env["BROOKLYN_RATE_LIMIT_REQUESTS"], 10);
    }

    // Logging configuration
    if (env["BROOKLYN_LOG_LEVEL"]) {
      config.logging = { level: env["BROOKLYN_LOG_LEVEL"] as any };
    }
    if (env["BROOKLYN_LOG_FORMAT"]) {
      config.logging = config.logging || {};
      config.logging.format = env["BROOKLYN_LOG_FORMAT"] as any;
    }
    if (env["BROOKLYN_LOG_FILE"]) {
      config.logging = config.logging || {};
      config.logging.file = env["BROOKLYN_LOG_FILE"];
    }

    // Authentication configuration
    if (env["BROOKLYN_AUTH_MODE"]) {
      config.authentication = { mode: env["BROOKLYN_AUTH_MODE"] as any };
    }
    if (env["BROOKLYN_AUTH_DEVELOPMENT_ONLY"] !== undefined) {
      config.authentication = config.authentication || {};
      config.authentication.developmentOnly = env["BROOKLYN_AUTH_DEVELOPMENT_ONLY"] === "true";
    }
    if (env["BROOKLYN_AUTH_BEHIND_PROXY"] !== undefined) {
      config.authentication = config.authentication || {};
      config.authentication.behindProxy = env["BROOKLYN_AUTH_BEHIND_PROXY"] === "true";
    }

    // GitHub OAuth provider configuration
    if (env["BROOKLYN_GITHUB_CLIENT_ID"] || env["BROOKLYN_GITHUB_CLIENT_SECRET"]) {
      config.authentication = config.authentication || {};
      config.authentication.providers = config.authentication.providers || {};
      config.authentication.providers.github = {
        clientId: env["BROOKLYN_GITHUB_CLIENT_ID"] || "",
        clientSecret: env["BROOKLYN_GITHUB_CLIENT_SECRET"] || "",
        callbackUrl: env["BROOKLYN_GITHUB_CALLBACK_URL"] || "http://localhost:3000/oauth/callback",
        scopes: env["BROOKLYN_GITHUB_SCOPES"]?.split(",") || ["user:email", "read:org"],
      };

      if (env["BROOKLYN_GITHUB_ALLOWED_ORGS"]) {
        config.authentication.providers.github.allowedOrgs = env["BROOKLYN_GITHUB_ALLOWED_ORGS"]
          .split(",")
          .map((o) => o.trim());
      }

      if (env["BROOKLYN_GITHUB_ALLOWED_TEAMS"]) {
        // Format: "org1:team1,team2;org2:team3,team4"
        const teamsConfig: { [org: string]: string[] } = {};
        for (const orgTeams of env["BROOKLYN_GITHUB_ALLOWED_TEAMS"].split(";")) {
          const [org, teamsStr] = orgTeams.split(":");
          if (org && teamsStr) {
            teamsConfig[org.trim()] = teamsStr.split(",").map((t) => t.trim());
          }
        }
        config.authentication.providers.github.allowedTeams = teamsConfig;
      }
    }

    // Local authentication provider configuration
    if (env["BROOKLYN_LOCAL_USER_STORE"]) {
      config.authentication = config.authentication || {};
      config.authentication.providers = config.authentication.providers || {};
      config.authentication.providers.local = config.authentication.providers.local || {};
      config.authentication.providers.local.userStore = env["BROOKLYN_LOCAL_USER_STORE"];
    }
    if (env["BROOKLYN_LOCAL_SESSION_TIMEOUT"]) {
      config.authentication = config.authentication || {};
      config.authentication.providers = config.authentication.providers || {};
      config.authentication.providers.local = config.authentication.providers.local || {};
      config.authentication.providers.local.sessionTimeout = Number.parseInt(
        env["BROOKLYN_LOCAL_SESSION_TIMEOUT"],
        10,
      );
    }

    // Path configuration
    const pathConfig: any = {};
    if (env["BROOKLYN_CONFIG_DIR"]) pathConfig.config = env["BROOKLYN_CONFIG_DIR"];
    if (env["BROOKLYN_LOG_DIR"]) pathConfig.logs = env["BROOKLYN_LOG_DIR"];
    if (env["BROOKLYN_PLUGIN_DIR"]) pathConfig.plugins = env["BROOKLYN_PLUGIN_DIR"];
    if (env["BROOKLYN_BROWSER_DIR"]) pathConfig.browsers = env["BROOKLYN_BROWSER_DIR"];
    if (env["BROOKLYN_ASSETS_DIR"]) pathConfig.assets = env["BROOKLYN_ASSETS_DIR"];
    if (env["BROOKLYN_PID_DIR"]) pathConfig.pids = env["BROOKLYN_PID_DIR"];
    if (Object.keys(pathConfig).length > 0) {
      config.paths = pathConfig;
    }

    return config;
  }

  /**
   * Load configuration from .env file (graceful fallback)
   */
  private async loadFromDotenv(): Promise<Partial<BrooklynConfig> | undefined> {
    try {
      // Try to load dotenv, but don't fail if it's not available
      const { config: dotenvConfig } = await import("dotenv");
      dotenvConfig();

      logger?.debug("Loaded .env file");

      // After loading .env, re-read environment variables
      return this.loadFromEnvironment();
    } catch {
      // .env not available (packaged binary) - this is fine
      logger?.debug("No .env file found (expected for packaged binary)");
      return undefined;
    }
  }

  /**
   * Load configuration from config file
   */
  private async loadFromConfigFile(): Promise<Partial<BrooklynConfig> | undefined> {
    const configPaths = [
      join(process.cwd(), ".brooklyn.yaml"),
      join(process.cwd(), ".brooklyn.json"),
      join(homedir(), ".brooklyn", "config.yaml"),
      join(homedir(), ".brooklyn", "config.json"),
    ];

    for (const configPath of configPaths) {
      if (existsSync(configPath)) {
        try {
          logger?.debug("Loading config file", { path: configPath });

          const content = readFileSync(configPath, "utf8");

          // Validate configuration file against schema
          const validationResult = await validateBrooklynConfigFile(configPath, content);
          if (!validationResult.valid) {
            logger?.warn("Configuration file validation failed", {
              path: configPath,
              errors: validationResult.errors,
            });
            // Continue loading despite validation errors for graceful degradation
          }

          if (configPath.endsWith(".json")) {
            return JSON.parse(content);
          }
          if (configPath.endsWith(".yaml") || configPath.endsWith(".yml")) {
            // Import YAML parser dynamically
            const { parse: parseYaml } = await import("yaml");
            return parseYaml(content);
          }
        } catch (error) {
          logger?.warn("Failed to load config file", {
            path: configPath,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    return undefined;
  }

  /**
   * Merge configurations in precedence order
   */
  private mergeConfigurations(sources: ConfigSources): BrooklynConfig {
    const configs = [
      sources.defaults,
      sources.dotenv,
      sources.env,
      sources.configFile,
      sources.cliOverrides,
    ].filter(Boolean) as Partial<BrooklynConfig>[];

    return configs.reduce((merged, config) => this.mergeDeep(merged, config), {}) as BrooklynConfig;
  }

  /**
   * Deep merge two configuration objects
   */
  private mergeDeep(target: any, source: any): any {
    const result = { ...target };

    for (const key in source) {
      if (source[key] && typeof source[key] === "object" && !Array.isArray(source[key])) {
        result[key] = this.mergeDeep(result[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }

    return result;
  }

  /**
   * Validate configuration against JSON Schema
   */
  private async validateConfigurationSchema(config: BrooklynConfig): Promise<void> {
    try {
      const validationResult = await validateBrooklynConfig(config);
      if (!validationResult.valid) {
        logger?.warn("Configuration schema validation failed", {
          errors: validationResult.errors,
        });
        // Continue execution with warnings for graceful degradation
      } else {
        logger?.debug("Configuration schema validation passed");
      }
    } catch (error) {
      logger?.warn("Schema validation error", {
        error: error instanceof Error ? error.message : String(error),
      });
      // Continue execution if schema validation fails
    }
  }

  /**
   * Validate configuration
   */
  private validateConfiguration(config: BrooklynConfig): void {
    const errors: string[] = [];

    // Validate required fields
    if (!config.serviceName) errors.push("serviceName is required");
    if (!config.version) errors.push("version is required");
    if (!config.teamId) errors.push("teamId is required");

    // Validate transport configuration
    if (config.transports.http.enabled) {
      if (
        !config.transports.http.port ||
        config.transports.http.port < 1 ||
        config.transports.http.port > 65535
      ) {
        errors.push("Invalid HTTP port");
      }
    }

    // Validate browser configuration
    if (config.browsers.maxInstances < 1) {
      errors.push("maxInstances must be at least 1");
    }

    // Validate logging level
    const validLogLevels = ["debug", "info", "warn", "error"];
    if (!validLogLevels.includes(config.logging.level)) {
      errors.push(`Invalid log level: ${config.logging.level}`);
    }

    // Validate authentication configuration
    if (config.authentication) {
      const validAuthModes = ["github", "local", "none"];
      if (!validAuthModes.includes(config.authentication.mode)) {
        errors.push(`Invalid authentication mode: ${config.authentication.mode}`);
      }

      // Validate "none" mode requires development flag
      if (config.authentication.mode === "none" && !config.authentication.developmentOnly) {
        errors.push("Authentication mode 'none' requires developmentOnly: true");
      }

      // Validate provider configurations
      if (config.authentication.mode === "github") {
        const github = config.authentication.providers.github;
        if (!github) {
          errors.push("GitHub authentication mode requires github provider configuration");
        } else {
          if (!github.clientId) errors.push("GitHub provider requires clientId");
          if (!github.clientSecret) errors.push("GitHub provider requires clientSecret");
          if (!github.callbackUrl) errors.push("GitHub provider requires callbackUrl");
        }
      }

      if (config.authentication.mode === "local") {
        const local = config.authentication.providers.local;
        if (!local) {
          errors.push("Local authentication mode requires local provider configuration");
        } else {
          if (!local.userStore) errors.push("Local provider requires userStore path");
          if (!local.sessionTimeout || local.sessionTimeout < 60000) {
            errors.push("Local provider sessionTimeout must be at least 60000ms (1 minute)");
          }
        }
      }
    }

    if (errors.length > 0) {
      throw new Error(`Configuration validation failed: ${errors.join(", ")}`);
    }
  }

  /**
   * Ensure required directories exist
   */
  private async ensureDirectories(config: BrooklynConfig): Promise<void> {
    const { mkdirSync } = await import("node:fs");

    const directories = [
      config.paths.config,
      config.paths.logs,
      config.paths.plugins,
      config.paths.browsers,
      config.paths.assets,
      config.paths.pids,
    ];

    for (const dir of directories) {
      try {
        mkdirSync(dir, { recursive: true });
      } catch (error) {
        logger?.warn("Failed to create directory", {
          directory: dir,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
}

/**
 * Global configuration instance
 */
export const configManager = ConfigManager.getInstance();

/**
 * Get current configuration (convenience function)
 */
export function getConfig(): BrooklynConfig {
  return configManager.getConfig();
}

/**
 * Load configuration (convenience function)
 */
export async function loadConfig(cliOverrides?: Partial<BrooklynConfig>): Promise<BrooklynConfig> {
  return configManager.load(cliOverrides);
}
