/**
 * Configuration validation CLI command
 * Validates Brooklyn configuration files against JSON Schema
 */

import { readFileSync } from "node:fs";
import { Command } from "commander";
import { getValidator, validateBrooklynConfigFile } from "../../core/config-validator.js";
import { configManager } from "../../core/config.js";

/**
 * Configuration validation command
 */
export function createConfigValidateCommand(): Command {
  const command = new Command("validate");

  command
    .description("Validate Brooklyn configuration files against JSON Schema")
    .option("-f, --file <path>", "Configuration file path to validate")
    .option("--current", "Validate current loaded configuration")
    .option("--schema-info", "Show schema information")
    .option("--verbose", "Show detailed validation information")
    .action(async (options) => {
      try {
        const validator = await getValidator();

        // Show schema information
        if (options.schemaInfo) {
          const schemaInfo = validator.getSchemaInfo();
          if (schemaInfo.available) {
            console.log(`✅ Schema available: ${schemaInfo.title}`);
            console.log(`📋 Version: ${schemaInfo.version}`);
          } else {
            console.log("❌ Schema validation not available");
            console.log("Install dependencies: bun install ajv ajv-formats yaml");
          }
          process.exit(0);
        }

        // Validate specific file
        if (options.file) {
          await validateConfigFile(options.file, options.verbose);
          process.exit(0);
        }

        // Validate current configuration
        if (options.current) {
          await validateCurrentConfig(options.verbose);
          process.exit(0);
        }

        // Default: show help
        command.help();
      } catch (error) {
        console.error("❌ Validation failed:");
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  return command;
}

/**
 * Validate a specific configuration file
 */
async function validateConfigFile(filePath: string, verbose: boolean): Promise<void> {
  try {
    console.log(`🔍 Validating configuration file: ${filePath}`);

    const content = readFileSync(filePath, "utf8");
    const result = await validateBrooklynConfigFile(filePath, content);

    if (result.valid) {
      console.log("✅ Configuration file is valid");
      if (verbose) {
        console.log("📋 All schema constraints satisfied");
      }
      process.exit(0);
    } else {
      console.log("❌ Configuration file validation failed");
      console.log("\nValidation errors:");
      result.errors.forEach((error, index) => {
        const pathStr = error.path ? ` at '${error.path}'` : "";
        const valueStr =
          error.value !== undefined ? ` (value: ${JSON.stringify(error.value)})` : "";
        console.log(`  ${index + 1}. ${error.message}${pathStr}${valueStr}`);
      });

      if (verbose) {
        console.log("\n📚 Validation details:");
        console.log("- Check schemas/brooklyn-config-v1.yaml for complete schema");
        console.log("- See docs/deployment/http-transport-deployment.md for examples");
      }

      process.exit(1);
    }
  } catch (error) {
    console.error(`❌ Failed to validate file: ${filePath}`);
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Validate current loaded configuration
 */
async function validateCurrentConfig(verbose: boolean): Promise<void> {
  try {
    console.log("🔍 Validating current configuration");

    // Load current configuration
    const config = await configManager.load();
    const validator = await getValidator();
    const result = validator.validateConfig(config);

    if (result.valid) {
      console.log("✅ Current configuration is valid");

      if (verbose) {
        console.log("\n📋 Configuration summary:");
        console.log(`  Service: ${config.serviceName} v${config.version}`);
        console.log(`  Environment: ${config.environment}`);
        console.log(`  Team: ${config.teamId}`);
        console.log(`  Authentication: ${config.authentication.mode}`);
        console.log(
          `  Transports: MCP=${config.transports.mcp.enabled}, HTTP=${config.transports.http.enabled}`,
        );
        console.log(`  Max browsers: ${config.browsers.maxInstances}`);
      }
      process.exit(0);
    } else {
      console.log("❌ Current configuration validation failed");
      console.log("\nValidation errors:");
      result.errors.forEach((error, index) => {
        const pathStr = error.path ? ` at '${error.path}'` : "";
        const valueStr =
          error.value !== undefined ? ` (value: ${JSON.stringify(error.value)})` : "";
        console.log(`  ${index + 1}. ${error.message}${pathStr}${valueStr}`);
      });

      if (verbose) {
        console.log("\n🔧 Configuration sources:");
        const sources = configManager.getSources();
        if (sources.configFile) console.log("- Config file found");
        if (sources.env && Object.keys(sources.env).length > 0)
          console.log("- Environment variables detected");
        if (sources.cliOverrides) console.log("- CLI overrides applied");
      }

      process.exit(1);
    }
  } catch (error) {
    console.error("❌ Failed to validate current configuration");
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

/**
 * Export for CLI integration
 */
export default createConfigValidateCommand;
