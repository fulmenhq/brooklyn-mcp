/**
 * Tool Discovery Service
 * Reusable pattern for MCP tool discovery across fulmen ecosystem
 *
 * This service provides a standardized way to discover, document, and
 * interact with MCP tools, designed to be extracted and reused in other
 * MCP server implementations.
 */

import { type Tool, ToolSchema } from "@modelcontextprotocol/sdk/types.js";
import type { EnhancedTool } from "../tool-definitions.js";

export interface ToolCategory {
  id: string;
  name: string;
  description: string;
  icon?: string;
}

export interface ToolDiscoveryOptions {
  includeExamples?: boolean;
  includeErrors?: boolean;
  includeRelated?: boolean;
  filterByCategory?: string;
  filterByCapability?: string[];
}

export interface DiscoveryMetadata {
  version: string;
  serverName: string;
  description: string;
  capabilities: string[];
  categories: ToolCategory[];
  totalTools: number;
  lastUpdated: string;
}

export interface ToolSearchResult {
  tool: EnhancedTool;
  relevance: number;
  matchedOn: string[];
}

/**
 * Tool Discovery Service
 * Provides comprehensive tool discovery capabilities for MCP servers
 */
export class ToolDiscoveryService {
  private tools: Map<string, EnhancedTool> = new Map();
  private categories: Map<string, ToolCategory> = new Map();
  private metadata: DiscoveryMetadata;

  constructor(metadata: Omit<DiscoveryMetadata, "totalTools" | "lastUpdated">) {
    this.metadata = {
      ...metadata,
      totalTools: 0,
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * Register a tool with the discovery service
   */
  registerTool(tool: EnhancedTool): void {
    // Validate against MCP Tool schema to ensure spec compliance
    ToolSchema.parse({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    });

    this.tools.set(tool.name, tool);
    this.metadata.totalTools = this.tools.size;
    this.metadata.lastUpdated = new Date().toISOString();
  }

  /**
   * Register multiple tools
   */
  registerTools(tools: EnhancedTool[]): void {
    for (const tool of tools) {
      this.registerTool(tool);
    }
  }

  /**
   * Register a category
   */
  registerCategory(category: ToolCategory): void {
    this.categories.set(category.id, category);
    this.metadata.categories = Array.from(this.categories.values());
  }

  /**
   * Get all tools with optional filtering
   */
  getTools(options: ToolDiscoveryOptions = {}): EnhancedTool[] {
    let tools = Array.from(this.tools.values());

    // Filter by category
    if (options.filterByCategory) {
      tools = tools.filter((tool) => tool.category === options.filterByCategory);
    }

    // Filter by capabilities (if implemented)
    if (options.filterByCapability && options.filterByCapability.length > 0) {
      // This would require tools to have a capabilities field
      // For now, we'll skip this filter
    }

    // Transform based on options
    if (!options.includeExamples) {
      tools = tools.map((tool) => ({ ...tool, examples: undefined }));
    }
    if (!options.includeErrors) {
      tools = tools.map((tool) => ({ ...tool, errors: undefined }));
    }

    return tools;
  }

  /**
   * Get tools as standard MCP Tool format
   */
  getMCPTools(): Tool[] {
    return Array.from(this.tools.values()).map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));
  }

  /**
   * Get tool by name
   */
  getTool(name: string): EnhancedTool | undefined {
    return this.tools.get(name);
  }

  /**
   * Get tools by category
   */
  getToolsByCategory(categoryId: string): EnhancedTool[] {
    return Array.from(this.tools.values()).filter((tool) => tool.category === categoryId);
  }

  /**
   * Get category information
   */
  getCategory(categoryId: string): ToolCategory | undefined {
    return this.categories.get(categoryId);
  }

  /**
   * Get all categories
   */
  getCategories(): ToolCategory[] {
    return Array.from(this.categories.values());
  }

  /**
   * Get discovery metadata
   */
  getMetadata(): DiscoveryMetadata {
    return { ...this.metadata };
  }

  /**
   * Search tools by query
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Complex search logic, refactor planned for future
  searchTools(query: string): ToolSearchResult[] {
    const searchTerms = query.toLowerCase().split(/\s+/);
    const results: ToolSearchResult[] = [];

    for (const tool of this.tools.values()) {
      const matchedOn: string[] = [];
      let relevance = 0;

      // Search in tool name
      const nameLower = tool.name.toLowerCase();
      for (const term of searchTerms) {
        if (nameLower.includes(term)) {
          relevance += 10;
          matchedOn.push("name");
          break;
        }
      }

      // Search in description
      if (tool.description) {
        const descLower = tool.description.toLowerCase();
        for (const term of searchTerms) {
          if (descLower.includes(term)) {
            relevance += 5;
            if (!matchedOn.includes("description")) {
              matchedOn.push("description");
            }
          }
        }
      }

      // Search in category
      const categoryLower = tool.category.toLowerCase();
      for (const term of searchTerms) {
        if (categoryLower.includes(term)) {
          relevance += 3;
          if (!matchedOn.includes("category")) {
            matchedOn.push("category");
          }
        }
      }

      // Search in examples
      if (tool.examples) {
        for (const example of tool.examples) {
          const exampleText =
            `${example.description} ${JSON.stringify(example.input)}`.toLowerCase();
          for (const term of searchTerms) {
            if (exampleText.includes(term)) {
              relevance += 2;
              if (!matchedOn.includes("examples")) {
                matchedOn.push("examples");
              }
              break;
            }
          }
        }
      }

      if (relevance > 0) {
        results.push({ tool, relevance, matchedOn });
      }
    }

    // Sort by relevance (highest first)
    return results.sort((a, b) => b.relevance - a.relevance);
  }

  /**
   * Generate tool documentation in various formats
   */
  generateDocumentation(format: "markdown" | "json" | "openapi" = "markdown"): string {
    switch (format) {
      case "markdown":
        return this.generateMarkdownDocs();
      case "json":
        return JSON.stringify(
          {
            metadata: this.metadata,
            categories: Array.from(this.categories.values()),
            tools: Array.from(this.tools.values()),
          },
          null,
          2,
        );
      case "openapi":
        return this.generateOpenAPISpec();
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }

  /**
   * Generate Markdown documentation
   */
  private generateMarkdownDocs(): string {
    let doc = `# ${this.metadata.serverName} Tool Documentation\n\n`;
    doc += `${this.metadata.description}\n\n`;
    doc += `**Version**: ${this.metadata.version}\n`;
    doc += `**Total Tools**: ${this.metadata.totalTools}\n`;
    doc += `**Last Updated**: ${this.metadata.lastUpdated}\n\n`;

    // Table of contents
    doc += "## Categories\n\n";
    for (const category of this.categories.values()) {
      const toolCount = this.getToolsByCategory(category.id).length;
      doc += `- [${category.name}](#${category.id}) (${toolCount} tools)\n`;
    }
    doc += "\n";

    // Tools by category
    for (const category of this.categories.values()) {
      doc += `## ${category.name}\n\n`;
      doc += `${category.description}\n\n`;

      const tools = this.getToolsByCategory(category.id);
      for (const tool of tools) {
        doc += `### ${tool.name}\n\n`;
        doc += `${tool.description}\n\n`;

        // Input schema
        doc += `**Input Schema**:\n\`\`\`json\n${JSON.stringify(tool.inputSchema, null, 2)}\n\`\`\`\n\n`;

        // Examples
        if (tool.examples && tool.examples.length > 0) {
          doc += "**Examples**:\n\n";
          for (const example of tool.examples) {
            doc += `*${example.description}*\n`;
            doc += `\`\`\`json\n${JSON.stringify(example.input, null, 2)}\n\`\`\`\n\n`;
          }
        }

        // Errors
        if (tool.errors && tool.errors.length > 0) {
          doc += "**Common Errors**:\n\n";
          for (const error of tool.errors) {
            doc += `- **${error.code}**: ${error.message}\n`;
            doc += `  - *Solution*: ${error.solution}\n`;
          }
          doc += "\n";
        }
      }
    }

    return doc;
  }

  /**
   * Generate OpenAPI specification
   */
  private generateOpenAPISpec(): string {
    const spec = {
      openapi: "3.0.0",
      info: {
        title: this.metadata.serverName,
        description: this.metadata.description,
        version: this.metadata.version,
      },
      paths: {} as Record<string, unknown>,
      components: {
        schemas: {} as Record<string, unknown>,
      },
    };

    // Generate paths for each tool
    for (const tool of this.tools.values()) {
      const path = `/tools/${tool.name}`;
      spec.paths[path] = {
        post: {
          summary: tool.description,
          tags: [tool.category],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: tool.inputSchema,
              },
            },
          },
          responses: {
            "200": {
              description: "Success",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      result: { type: "object" },
                    },
                  },
                },
              },
            },
          },
        },
      };
    }

    return JSON.stringify(spec, null, 2);
  }

  /**
   * Export discovery configuration for reuse
   */
  exportConfiguration(): string {
    return JSON.stringify(
      {
        metadata: this.metadata,
        categories: Array.from(this.categories.entries()),
        tools: Array.from(this.tools.entries()).map(([name, tool]) => ({
          name,
          tool: {
            ...tool,
            // Exclude functions that can't be serialized
            examples: tool.examples,
            errors: tool.errors,
          },
        })),
      },
      null,
      2,
    );
  }

  /**
   * Import discovery configuration
   */
  static fromConfiguration(config: string): ToolDiscoveryService {
    const data = JSON.parse(config);
    const service = new ToolDiscoveryService(data.metadata);

    // Restore categories
    for (const [id, category] of data.categories) {
      service.categories.set(id, category);
    }

    // Restore tools
    for (const { name, tool } of data.tools) {
      service.tools.set(name, tool);
    }

    return service;
  }
}
