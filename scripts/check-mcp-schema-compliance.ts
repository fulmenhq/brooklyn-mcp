#!/usr/bin/env bun

/**
 * MCP Schema Compliance Validator
 *
 * This script validates Brooklyn's MCP tool definitions against the Model Context Protocol
 * specification (2025-06-18) and Claude Code compatibility requirements.
 *
 * Key validations:
 * 1. Schema Structure: No top-level anyOf/oneOf/allOf (Claude Code incompatible)
 * 2. MCP Protocol Compliance: Required fields, naming conventions
 * 3. Brooklyn Standards: Category consistency, description quality
 * 4. JSON Schema Validity: Proper schema structure and types
 *
 * Usage:
 *   bun scripts/check-mcp-schema-compliance.ts [file-path]
 *   bun run check:mcp-schema [file-path]
 *
 * Exit codes:
 *   0 - All validations passed
 *   1 - Validation failures found
 *   2 - Script error (file not found, parse error, etc.)
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

// MCP Protocol Version we support (from specification)
const SUPPORTED_MCP_VERSION = "2025-06-18";

// Brooklyn-specific tool categories (from mcp-schema-standards.md)
const VALID_CATEGORIES = [
  "browser-lifecycle",
  "navigation",
  "content-capture",
  "interaction",
  "discovery",
] as const;

interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  toolCount: number;
}

interface EnhancedTool extends Tool {
  category: string;
}

/**
 * Validates tool definitions against MCP specification and Brooklyn standards
 */
class MCPSchemaValidator {
  private errors: string[] = [];
  private warnings: string[] = [];

  /**
   * Main validation entry point
   */
  async validateFile(filePath: string): Promise<ValidationResult> {
    try {
      console.log(`🔍 Validating MCP schema compliance: ${filePath}`);

      if (!existsSync(filePath)) {
        this.addError(`File not found: ${filePath}`);
        return this.getResult(0);
      }

      const content = readFileSync(filePath, "utf-8");
      const tools = await this.extractToolsFromFile(filePath, content);

      console.log(`📋 Found ${tools.length} tools to validate`);

      for (const tool of tools) {
        this.validateTool(tool);
      }

      return this.getResult(tools.length);
    } catch (error) {
      this.addError(`Script error: ${error instanceof Error ? error.message : String(error)}`);
      return this.getResult(0);
    }
  }

  /**
   * Extract tool definitions from TypeScript file
   */
  private async extractToolsFromFile(filePath: string, _content: string): Promise<EnhancedTool[]> {
    try {
      // For tool-definitions.ts, dynamically import and extract tools
      if (filePath.includes("tool-definitions.ts")) {
        // Import the compiled module to get actual tool definitions
        const moduleContent = await import(resolve(filePath));

        if (typeof moduleContent.getAllTools === "function") {
          return moduleContent.getAllTools() as EnhancedTool[];
        }

        this.addWarning("Could not find getAllTools() export in tool definitions file");
      }

      this.addWarning(`Unsupported file type for tool extraction: ${filePath}`);
      return [];
    } catch (error) {
      this.addError(
        `Failed to extract tools: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }

  /**
   * Validate individual tool against all compliance rules
   */
  private validateTool(tool: EnhancedTool): void {
    const toolName = tool.name || "<unnamed>";

    // 1. MCP Protocol Compliance
    this.validateMCPProtocolCompliance(tool, toolName);

    // 2. Claude Code Schema Compatibility
    this.validateClaudeCodeCompatibility(tool, toolName);

    // 3. Brooklyn Tool Standards
    this.validateBrooklynStandards(tool, toolName);

    // 4. JSON Schema Structure
    this.validateJSONSchemaStructure(tool, toolName);
  }

  /**
   * Validate MCP Protocol 2025-06-18 compliance
   */
  private validateMCPProtocolCompliance(tool: EnhancedTool, toolName: string): void {
    // Required fields per MCP specification
    if (!tool.name) {
      this.addError(`[${toolName}] Missing required field: name`);
    }

    if (!tool.description) {
      this.addError(`[${toolName}] Missing required field: description`);
    }

    if (!tool.inputSchema) {
      this.addError(`[${toolName}] Missing required field: inputSchema`);
    }

    // Tool name validation (MCP naming conventions)
    if (tool.name) {
      if (!/^[a-z][a-z0-9_]*$/.test(tool.name)) {
        this.addError(`[${toolName}] Tool name must be lowercase with underscores: ${tool.name}`);
      }

      if (tool.name.length > 64) {
        this.addError(`[${toolName}] Tool name too long (max 64 chars): ${tool.name.length}`);
      }
    }

    // Description validation
    if (tool.description) {
      if (tool.description.length < 10) {
        this.addWarning(`[${toolName}] Description very short (${tool.description.length} chars)`);
      }

      if (tool.description.length > 500) {
        this.addWarning(`[${toolName}] Description very long (${tool.description.length} chars)`);
      }
    }
  }

  /**
   * Validate Claude Code MCP client compatibility
   */
  private validateClaudeCodeCompatibility(tool: EnhancedTool, toolName: string): void {
    if (!tool.inputSchema) return;

    const schema = tool.inputSchema;

    // Critical: No top-level anyOf/oneOf/allOf (causes API Error 400)
    if ("anyOf" in schema) {
      this.addError(`[${toolName}] CRITICAL: Top-level 'anyOf' not supported by Claude Code`);
    }

    if ("oneOf" in schema) {
      this.addError(`[${toolName}] CRITICAL: Top-level 'oneOf' not supported by Claude Code`);
    }

    if ("allOf" in schema) {
      this.addError(`[${toolName}] CRITICAL: Top-level 'allOf' not supported by Claude Code`);
    }

    // Schema must be object type for tools
    if (schema.type !== "object") {
      this.addError(`[${toolName}] Input schema must be type 'object', got: ${schema.type}`);
    }

    // Validate properties structure
    if (schema.properties) {
      for (const [propName, propSchema] of Object.entries(schema.properties)) {
        if (typeof propSchema === "object" && propSchema !== null) {
          // Nested oneOf/anyOf/allOf is allowed within properties
          this.validatePropertySchema(toolName, propName, propSchema as Record<string, unknown>);
        }
      }
    }
  }

  /**
   * Validate Brooklyn-specific tool standards
   */
  private validateBrooklynStandards(tool: EnhancedTool, toolName: string): void {
    // Brooklyn extension: category field
    if (!tool.category) {
      this.addError(`[${toolName}] Missing Brooklyn required field: category`);
    } else {
      // Category validation
      if (!VALID_CATEGORIES.includes(tool.category as (typeof VALID_CATEGORIES)[number])) {
        this.addError(
          `[${toolName}] Invalid category '${tool.category}'. Valid: ${VALID_CATEGORIES.join(", ")}`,
        );
      }

      // Category naming convention (kebab-case)
      if (!/^[a-z]+(?:-[a-z]+)*$/.test(tool.category)) {
        this.addError(`[${toolName}] Category must use kebab-case: ${tool.category}`);
      }
    }

    // Description quality standards
    if (tool.description) {
      // Action-oriented descriptions
      const actionWords = [
        "navigate",
        "capture",
        "extract",
        "click",
        "wait",
        "launch",
        "close",
        "get",
        "set",
        "create",
      ];
      const hasActionWord = actionWords.some(
        (word) => tool.description?.toLowerCase().includes(word) ?? false,
      );

      if (!hasActionWord) {
        this.addWarning(`[${toolName}] Description should start with action verb for clarity`);
      }

      // Avoid vague descriptions
      const vagueWords = ["functionality", "utility", "helper", "something"];
      const hasVagueWord = vagueWords.some(
        (word) => tool.description?.toLowerCase().includes(word) ?? false,
      );

      if (hasVagueWord) {
        this.addWarning(`[${toolName}] Description contains vague language - be more specific`);
      }
    }

    // Browser targeting pattern validation (Brooklyn-specific)
    if (tool.inputSchema?.properties) {
      const props = tool.inputSchema.properties;

      // If has browserId, should have target as well
      if ("browserId" in props && !("target" in props)) {
        this.addWarning(`[${toolName}] Tools with 'browserId' should also have 'target' parameter`);
      }
    }
  }

  /**
   * Validate JSON Schema structure and types
   */
  private validateJSONSchemaStructure(tool: EnhancedTool, toolName: string): void {
    if (!tool.inputSchema) return;

    const schema = tool.inputSchema;

    try {
      // Basic JSON Schema validation
      if (schema.type === "object" && schema.properties) {
        for (const [propName, propSchema] of Object.entries(schema.properties)) {
          this.validatePropertyDefinition(
            toolName,
            propName,
            propSchema as Record<string, unknown>,
          );
        }
      }

      // Validate required array references valid properties
      if (schema["required"] && Array.isArray(schema["required"])) {
        const propertyNames = schema.properties ? Object.keys(schema.properties) : [];

        for (const requiredField of schema["required"]) {
          if (!propertyNames.includes(requiredField)) {
            this.addError(
              `[${toolName}] Required field '${requiredField}' not defined in properties`,
            );
          }
        }
      }
    } catch (error) {
      this.addError(
        `[${toolName}] JSON Schema validation error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Validate individual property schema definition
   */
  private validatePropertyDefinition(
    toolName: string,
    propName: string,
    propSchema: Record<string, unknown>,
  ): void {
    if (!propSchema || typeof propSchema !== "object") return;

    // Ensure type is specified
    if (!propSchema["type"]) {
      this.addWarning(`[${toolName}.${propName}] Property missing type definition`);
    }

    // Validate enum constraints
    if (propSchema["enum"] && !Array.isArray(propSchema["enum"])) {
      this.addError(
        `[${toolName}.${propName}] Enum must be array, got: ${typeof propSchema["enum"]}`,
      );
    }

    // Numeric constraints
    if (propSchema["type"] === "number") {
      if (propSchema["minimum"] === undefined && propSchema["maximum"] === undefined) {
        this.addWarning(
          `[${toolName}.${propName}] Numeric property should have min/max constraints`,
        );
      }
    }

    // Description quality
    if (!propSchema["description"]) {
      this.addWarning(`[${toolName}.${propName}] Property missing description`);
    } else if ((propSchema["description"] as string).length < 5) {
      this.addWarning(`[${toolName}.${propName}] Property description too brief`);
    }
  }

  /**
   * Validate nested property schemas (allows oneOf/anyOf/allOf)
   */
  private validatePropertySchema(
    toolName: string,
    propName: string,
    propSchema: Record<string, unknown>,
  ): void {
    // Nested schemas can use oneOf/anyOf/allOf - this is allowed
    // Just validate they're properly structured

    if (propSchema["oneOf"] && !Array.isArray(propSchema["oneOf"])) {
      this.addError(`[${toolName}.${propName}] oneOf must be array`);
    }

    if (propSchema["anyOf"] && !Array.isArray(propSchema["anyOf"])) {
      this.addError(`[${toolName}.${propName}] anyOf must be array`);
    }

    if (propSchema["allOf"] && !Array.isArray(propSchema["allOf"])) {
      this.addError(`[${toolName}.${propName}] allOf must be array`);
    }
  }

  private addError(message: string): void {
    this.errors.push(message);
  }

  private addWarning(message: string): void {
    this.warnings.push(message);
  }

  private getResult(toolCount: number): ValidationResult {
    return {
      isValid: this.errors.length === 0,
      errors: this.errors,
      warnings: this.warnings,
      toolCount,
    };
  }
}

/**
 * Main script execution
 */
async function main(): Promise<void> {
  const { positionals } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
  });

  // Default to tool-definitions.ts if no file specified
  const filePath = positionals[0] || "src/core/tool-definitions.ts";
  const resolvedPath = resolve(filePath);

  console.log("🚀 Brooklyn MCP Schema Compliance Validator");
  console.log(`📋 MCP Protocol Version: ${SUPPORTED_MCP_VERSION}`);
  console.log(`📁 Target: ${resolvedPath}`);
  console.log();

  const validator = new MCPSchemaValidator();
  const result = await validator.validateFile(resolvedPath);

  // Report results
  console.log("📊 Validation Results:");
  console.log(`   Tools validated: ${result.toolCount}`);
  console.log(`   Errors: ${result.errors.length}`);
  console.log(`   Warnings: ${result.warnings.length}`);
  console.log();

  // Show errors
  if (result.errors.length > 0) {
    console.log("❌ ERRORS (must fix):");
    for (const error of result.errors) {
      console.log(`   ${error}`);
    }
    console.log();
  }

  // Show warnings
  if (result.warnings.length > 0) {
    console.log("⚠️  WARNINGS (consider fixing):");
    for (const warning of result.warnings) {
      console.log(`   ${warning}`);
    }
    console.log();
  }

  // Success message
  if (result.isValid) {
    console.log("✅ All MCP schema compliance checks passed!");
    console.log();
    console.log("🌉 Brooklyn tools are ready for Claude Code and MCP clients");
  } else {
    console.log("💥 MCP schema compliance validation failed!");
    console.log();
    console.log("📚 See: docs/development/standards/mcp-schema-standards.md");
    console.log("🔧 Fix errors above and run again");
  }

  // Exit with appropriate code
  process.exit(result.isValid ? 0 : 1);
}

// Run if called directly
if (import.meta.main) {
  main().catch((error) => {
    console.error("💥 Script execution failed:", error);
    process.exit(2);
  });
}

export { MCPSchemaValidator, SUPPORTED_MCP_VERSION, VALID_CATEGORIES };
