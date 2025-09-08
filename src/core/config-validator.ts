/**
 * Configuration validation using JSON Schema 2020
 * Validates all Brooklyn configuration files against schemas
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";

import type { AnySchema, ErrorObject, SchemaObject, ValidateFunction } from "ajv";
import type Ajv from "ajv";
import type { BrooklynConfig } from "./config.js";

/**
 * JSON Schema validation interface
 */
interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

interface ValidationError {
  path: string;
  message: string;
  value?: unknown;
  schema?: unknown;
}

/**
 * Schema validator class
 */
export class ConfigValidator {
  private schema: AnySchema | null = null;
  private relaxedSchema: AnySchema | null = null;
  private ajv: Ajv | null = null;

  /**
   * Initialize validator with schema
   */
  async initialize(): Promise<void> {
    try {
      // Dynamically import AJV for JSON Schema validation
      const Ajv = (await import("ajv")).default;
      const addFormats = (await import("ajv-formats")).default;

      this.ajv = new Ajv({
        strict: false,
        allErrors: true,
        verbose: true,
      });

      // Add format validation (hostname, ipv4, uri, etc.)
      addFormats(this.ajv);

      // Load Brooklyn configuration schema
      const schemaPath = join(process.cwd(), "schemas", "brooklyn-config-v1.yaml");
      const schemaContent = readFileSync(schemaPath, "utf8");
      this.schema = parseYaml(schemaContent);

      // Create a relaxed version of the schema for partial validation
      if (this.schema && typeof this.schema === "object" && !Array.isArray(this.schema)) {
        this.relaxedSchema = { ...this.schema } as SchemaObject;
        if ("required" in this.relaxedSchema) {
          (this.relaxedSchema as Record<string, unknown>)["required"] = undefined; // Remove required fields for partial validation
        }
      } else {
        this.relaxedSchema = this.schema;
      }

      // Compile schemas
      if (this.schema && this.relaxedSchema) {
        try {
          // Use the schema $id for tracking, and create separate schemas for strict/relaxed
          const schemaId =
            this.schema && typeof this.schema === "object" && "$id" in this.schema
              ? ((this.schema as SchemaObject).$id as string)
              : "brooklyn-config";

          // Remove existing schemas if they exist
          this.ajv.removeSchema(schemaId);
          this.ajv.removeSchema(`${schemaId}-relaxed`);

          // Add schemas with unique IDs
          const strictSchema = { ...(this.schema as Record<string, unknown>) };
          const relaxedSchema = {
            ...(this.relaxedSchema as Record<string, unknown>),
            $id: `${schemaId}-relaxed`,
          };

          this.ajv.addSchema(strictSchema, "brooklyn-config");
          this.ajv.addSchema(relaxedSchema, "brooklyn-config-relaxed");
        } catch (_schemaError) {
          // If schema compilation fails, fallback gracefully
          this.ajv = null;
          this.schema = null;
        }
      }
    } catch (_error) {
      // Graceful fallback if schema validation is not available
      this.ajv = null;
      this.schema = null;
    }
  }

  /**
   * Validate configuration object against schema
   */
  validateConfig(config: Partial<BrooklynConfig>, relaxed = false): ValidationResult {
    if (!(this.ajv && this.schema)) {
      // Return valid if schema validation is not available
      return { valid: true, errors: [] };
    }

    try {
      const schemaName = relaxed ? "brooklyn-config-relaxed" : "brooklyn-config";
      const validate = this.ajv.getSchema(schemaName);
      if (!validate) {
        return { valid: false, errors: [{ path: "", message: "Schema not found" }] };
      }

      const valid = validate(config);

      if (valid) {
        return { valid: true, errors: [] };
      }

      const errors: ValidationError[] = (validate.errors || []).map((error: ErrorObject) => ({
        path: error.instancePath || "",
        message: error.message || "Validation error",
        value: error.data,
        schema: error.schema,
      }));

      return { valid: false, errors };
    } catch (error) {
      return {
        valid: false,
        errors: [
          {
            path: "",
            message: `Validation failed: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  }

  /**
   * Validate configuration file content
   */
  validateConfigFile(filePath: string, content: string): ValidationResult {
    try {
      let config: unknown;

      if (filePath.endsWith(".json")) {
        config = JSON.parse(content);
      } else if (filePath.endsWith(".yaml") || filePath.endsWith(".yml")) {
        config = parseYaml(content);
      } else {
        return {
          valid: false,
          errors: [{ path: "", message: "Unsupported file format. Use .json or .yaml" }],
        };
      }

      return this.validateConfig(config as Partial<BrooklynConfig>);
    } catch (error) {
      return {
        valid: false,
        errors: [
          {
            path: "",
            message: `Failed to parse config file: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      };
    }
  }

  /**
   * Format validation errors for display
   */
  formatErrors(errors: ValidationError[]): string {
    if (errors.length === 0) {
      return "No validation errors";
    }

    const formatted = errors.map((error, index) => {
      const pathStr = error.path ? ` at path '${error.path}'` : "";
      const valueStr = error.value !== undefined ? ` (value: ${JSON.stringify(error.value)})` : "";
      return `${index + 1}. ${error.message}${pathStr}${valueStr}`;
    });

    return `Configuration validation failed:\n${formatted.join("\n")}`;
  }

  /**
   * Get schema information
   */
  getSchemaInfo(): { available: boolean; version?: string; title?: string } {
    if (!this.schema) {
      return { available: false };
    }

    return {
      available: true,
      version:
        this.schema && typeof this.schema === "object" && "$id" in this.schema
          ? (this.schema as SchemaObject).$id?.split("-").pop() || "unknown"
          : "unknown",
      title:
        this.schema && typeof this.schema === "object" && "title" in this.schema
          ? (this.schema as SchemaObject)["title"] || "Brooklyn Configuration Schema"
          : "Brooklyn Configuration Schema",
    };
  }
}

/**
 * Global validator instance
 */
let validator: ConfigValidator | null = null;

/**
 * Get or create validator instance
 */
export async function getValidator(): Promise<ConfigValidator> {
  if (!validator) {
    validator = new ConfigValidator();
    await validator.initialize();
  }
  return validator;
}

/**
 * Validate configuration with detailed error reporting
 */
export async function validateBrooklynConfig(
  config: Partial<BrooklynConfig>,
): Promise<ValidationResult> {
  const validator = await getValidator();
  return validator.validateConfig(config);
}

/**
 * Validate configuration file
 */
export async function validateBrooklynConfigFile(
  filePath: string,
  content: string,
): Promise<ValidationResult> {
  const validator = await getValidator();
  return validator.validateConfigFile(filePath, content);
}
