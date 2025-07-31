/**
 * Brooklyn REPL - Interactive MCP tool testing environment
 * Phase 2 of dev mode refactoring - provides human and AI-friendly testing
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import type { CallToolRequest, Tool } from "@modelcontextprotocol/sdk/types.js";
import { createInterface, type Interface } from "node:readline";

import { getLogger } from "../shared/pino-logger.js";
import { BrooklynEngine, type BrooklynContext } from "./brooklyn-engine.js";
import { loadConfig } from "./config.js";
import {
  browserLifecycleTools,
  navigationTools,
  interactionTools,
  contentCaptureTools,
} from "./tool-definitions.js";
import { OnboardingTools } from "./onboarding-tools.js";

export interface REPLOptions {
  jsonOutput?: boolean;
  verbose?: boolean;
  teamId?: string;
}

export interface REPLSession {
  browserIds: string[];
  lastResponse?: unknown;
  commandHistory: string[];
}

export class BrooklynREPL {
  private brooklynEngine!: BrooklynEngine;
  private context: BrooklynContext;
  private readline: Interface;
  private session: REPLSession;
  private availableTools: Tool[] = [];
  private options: REPLOptions;

  constructor(options: REPLOptions = {}) {
    this.options = options;
    this.session = {
      browserIds: [],
      commandHistory: [],
    };

    // Create team context for REPL session
    this.context = {
      teamId: options.teamId || "repl-session",
      userId: "repl-user",
      correlationId: `repl-${Date.now()}`,
      permissions: ["browser:*"], // Full browser permissions for REPL
      transport: "repl",
    };

    this.readline = createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: "brooklyn> ",
    });
  }

  async start(): Promise<void> {
    const logger = getLogger("brooklyn-repl");

    try {
      // Load configuration and initialize Brooklyn engine
      const config = await loadConfig();
      this.brooklynEngine = new BrooklynEngine({
        config,
        mcpMode: true, // Enable silent browser installation for REPL
      });
      await this.brooklynEngine.initialize();

      // Get available tools from definitions
      this.availableTools = [
        ...browserLifecycleTools,
        ...navigationTools,
        ...interactionTools,
        ...contentCaptureTools,
        ...OnboardingTools.getTools(),
      ];

      this.showWelcome();
      this.setupReadline();
      this.readline.prompt();
    } catch (error) {
      logger.error("Failed to start Brooklyn REPL", { error });
      throw error;
    }
  }

  private async getAvailableTools(): Promise<Tool[]> {
    // Tools are now loaded directly from tool definitions
    return this.availableTools;
  }

  private showWelcome(): void {
    const version = process.env["BROOKLYN_VERSION"] || "1.3.3";
    console.log(`\n🌉 Brooklyn Dev REPL v${version}`);
    console.log("Type 'help' for commands, 'exit' to quit\n");

    if (this.options.teamId) {
      console.log(`Team: ${this.options.teamId}`);
    }

    if (this.availableTools.length > 0) {
      console.log(`Available tools: ${this.availableTools.length}`);
    }
    console.log("");
  }

  private setupReadline(): void {
    this.readline.on("line", async (input) => {
      const trimmed = input.trim();

      if (!trimmed) {
        this.readline.prompt();
        return;
      }

      this.session.commandHistory.push(trimmed);

      try {
        await this.handleCommand(trimmed);
      } catch (error) {
        this.showError(error);
      }

      this.readline.prompt();
    });

    this.readline.on("close", () => {
      this.handleExit();
    });

    // Handle Ctrl+C gracefully
    this.readline.on("SIGINT", () => {
      console.log("\nUse 'exit' to quit or Ctrl+D");
      this.readline.prompt();
    });
  }

  private async handleCommand(input: string): Promise<void> {
    const parts = this.parseCommand(input);
    const [command, ...args] = parts;

    if (!command) {
      this.readline.prompt();
      return;
    }

    switch (command.toLowerCase()) {
      case "help":
        this.showHelp();
        break;
      case "list":
      case "tools":
        this.showTools();
        break;
      case "exit":
      case "quit":
        this.handleExit();
        break;
      case "history":
        this.showHistory();
        break;
      case "session":
        this.showSession();
        break;
      case "clear":
        console.clear();
        this.showWelcome();
        break;
      default:
        await this.executeTool(command, args);
        break;
    }
  }

  private parseCommand(input: string): string[] {
    // Simple command parsing - split by spaces but handle quoted strings
    const parts: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < input.length; i++) {
      const char = input[i];

      if (char === '"' && (i === 0 || input[i - 1] !== "\\")) {
        inQuotes = !inQuotes;
      } else if (char === " " && !inQuotes) {
        if (current) {
          parts.push(current);
          current = "";
        }
      } else {
        current += char;
      }
    }

    if (current) {
      parts.push(current);
    }

    return parts;
  }

  private async executeTool(toolName: string, args: string[]): Promise<void> {
    const tool = this.availableTools.find((t) => t.name === toolName);

    if (!tool) {
      console.log(`❌ Unknown tool: ${toolName}`);
      console.log("Type 'help' to see available commands");
      return;
    }

    try {
      // Parse arguments into parameters object
      const params = this.parseToolArguments(args, tool);

      // Create MCP-style request
      const request: CallToolRequest = {
        method: "tools/call",
        params: {
          name: toolName,
          arguments: params,
        },
      };

      const startTime = Date.now();

      // Use Brooklyn engine to handle the tool call with proper context
      const response = await this.brooklynEngine.executeToolCall(request, this.context);

      const executionTime = Date.now() - startTime;

      // Extract result from MCP response
      let result: unknown;
      if (response.content && response.content[0] && response.content[0].type === "text") {
        try {
          result = JSON.parse(response.content[0].text);
        } catch {
          result = response.content[0].text;
        }
      } else {
        result = response;
      }
      this.session.lastResponse = result;
      this.showToolResult(toolName, result, executionTime);

      // Track browser IDs if this was a browser launch
      if (toolName === "launch_browser" && result && typeof result === "object") {
        const resultObj = result as { browserId?: string };
        if (resultObj.browserId) {
          this.session.browserIds.push(resultObj.browserId);
        }
      }
    } catch (error) {
      console.log(`❌ Execution error: ${error instanceof Error ? error.message : String(error)}`);
      if (this.options.verbose && error instanceof Error && error.stack) {
        console.log(error.stack);
      }
    }
  }

  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Complex argument parsing - will be refactored in enhancement phase
  private parseToolArguments(args: string[], _tool: Tool): Record<string, unknown> {
    const params: Record<string, unknown> = {};

    // Simple key=value parsing
    for (const arg of args) {
      if (arg.includes("=")) {
        const [key, ...valueParts] = arg.split("=");
        let value: string = valueParts.join("=");
        let parsedValue: unknown = value;

        // Try to parse as JSON for complex values
        if (value.startsWith("{") || value.startsWith("[")) {
          try {
            parsedValue = JSON.parse(value);
          } catch {
            // Keep as string if JSON parsing fails
            parsedValue = value;
          }
        } else if (value === "true") {
          parsedValue = true;
        } else if (value === "false") {
          parsedValue = false;
        } else if (!isNaN(Number(value))) {
          parsedValue = Number(value);
        } else {
          // Remove quotes if present
          if (value.startsWith('"') && value.endsWith('"')) {
            parsedValue = value.slice(1, -1);
          } else {
            parsedValue = value;
          }
        }

        if (key) {
          params[key] = parsedValue;
        }
      }
    }

    return params;
  }

  private showToolResult(toolName: string, result: unknown, executionTime: number): void {
    if (this.options.jsonOutput) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    console.log(`✓ ${toolName} completed`);

    if (result && typeof result === "object") {
      const obj = result as Record<string, unknown>;

      // Show key properties in a nice format
      for (const [key, value] of Object.entries(obj)) {
        if (key === "browserId" || key === "url" || key === "path" || key === "status") {
          console.log(`  ${key}: ${value}`);
        }
      }

      // Show execution time
      console.log(`  executionTime: ${executionTime}ms`);
    } else {
      console.log(`  result: ${result}`);
    }
  }

  private showHelp(): void {
    console.log("Brooklyn REPL Commands:");
    console.log("");
    console.log("Built-in commands:");
    console.log("  help                    Show this help message");
    console.log("  tools, list             List available MCP tools");
    console.log("  history                 Show command history");
    console.log("  session                 Show current session state");
    console.log("  clear                   Clear screen");
    console.log("  exit, quit              Exit REPL");
    console.log("");

    if (this.availableTools.length > 0) {
      console.log("Available MCP tools:");
      const categories = new Map<string, Tool[]>();

      for (const tool of this.availableTools) {
        const category = (tool as { category?: string }).category || "general";
        if (!categories.has(category)) {
          categories.set(category, []);
        }
        categories.get(category)!.push(tool);
      }

      for (const [category, tools] of categories) {
        console.log(`\n  ${category}:`);
        for (const tool of tools) {
          console.log(`    ${tool.name.padEnd(20)} ${tool.description}`);
        }
      }

      console.log("");
      console.log("Tool usage: <tool-name> key=value key2=value2");
      console.log("Example: launch_browser browserType=chromium headless=false");
    }
  }

  private showTools(): void {
    console.log(`Available tools (${this.availableTools.length}):`);
    for (const tool of this.availableTools) {
      console.log(`  ${tool.name} - ${tool.description}`);
    }
  }

  private showHistory(): void {
    console.log("Command history:");
    this.session.commandHistory.forEach((cmd, idx) => {
      console.log(`  ${idx + 1}: ${cmd}`);
    });
  }

  private showSession(): void {
    console.log("Session state:");
    console.log(
      `  Browser IDs: ${this.session.browserIds.length > 0 ? this.session.browserIds.join(", ") : "none"}`,
    );
    console.log(`  Commands executed: ${this.session.commandHistory.length}`);
    if (this.session.lastResponse) {
      console.log("  Last response available (use --json to see full details)");
    }
  }

  private showError(error: unknown): void {
    console.log(`❌ Error: ${error instanceof Error ? error.message : String(error)}`);
    if (this.options.verbose && error instanceof Error && error.stack) {
      console.log(error.stack);
    }
  }

  private handleExit(): void {
    console.log("\nGoodbye!");
    if (this.session.browserIds.length > 0) {
      console.log(
        `(${this.session.browserIds.length} browser(s) still running - use 'brooklyn cleanup' to close)`,
      );
    }
    process.exit(0);
  }
}
