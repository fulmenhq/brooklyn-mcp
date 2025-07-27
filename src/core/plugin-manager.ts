/**
 * Plugin management for Fulmen MCP Brooklyn
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { PluginManager as IPluginManager, WebPilotPlugin } from "../ports/plugin.js";
import { config } from "../shared/config.js";
import { getLogger } from "../shared/pino-logger.js";

// ARCHITECTURE FIX: Lazy logger initialization
const logger = getLogger("plugin-manager");

export class PluginManager implements IPluginManager {
  private plugins = new Map<string, WebPilotPlugin>();
  private toolRegistry = new Map<string, WebPilotPlugin>();

  async register(plugin: WebPilotPlugin): Promise<void> {
    logger.info("Registering plugin", {
      name: plugin.name,
      version: plugin.version,
      team: plugin.team,
    });

    // Validate plugin
    await this.validatePlugin(plugin);

    // Check for tool name conflicts
    for (const tool of plugin.tools) {
      if (this.toolRegistry.has(tool.name)) {
        const existingPlugin = this.toolRegistry.get(tool.name);
        throw new Error(
          `Tool name conflict: "${tool.name}" already registered by plugin "${existingPlugin?.name}"`,
        );
      }
    }

    // Run plugin setup
    if (plugin.setup) {
      try {
        await plugin.setup();
      } catch (error) {
        logger.error("Plugin setup failed", {
          plugin: plugin.name,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    }

    // Register plugin and tools
    this.plugins.set(plugin.name, plugin);
    for (const tool of plugin.tools) {
      this.toolRegistry.set(tool.name, plugin);
    }

    logger.info("Plugin registered successfully", {
      name: plugin.name,
      toolCount: plugin.tools.length,
    });
  }

  async unregister(pluginName: string): Promise<void> {
    const plugin = this.plugins.get(pluginName);
    if (!plugin) {
      throw new Error(`Plugin not found: ${pluginName}`);
    }

    logger.info("Unregistering plugin", { name: pluginName });

    // Run plugin teardown
    if (plugin.teardown) {
      try {
        await plugin.teardown();
      } catch (error) {
        logger.error("Plugin teardown failed", {
          plugin: pluginName,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Remove tools from registry
    for (const tool of plugin.tools) {
      this.toolRegistry.delete(tool.name);
    }

    // Remove plugin
    this.plugins.delete(pluginName);

    logger.info("Plugin unregistered successfully", { name: pluginName });
  }

  getPlugins(): WebPilotPlugin[] {
    return Array.from(this.plugins.values());
  }

  getToolsByTeam(teamId: string): Tool[] {
    const tools: Tool[] = [];
    for (const plugin of this.plugins.values()) {
      if (plugin.team === teamId || plugin.team === "*") {
        tools.push(...plugin.tools);
      }
    }
    return tools;
  }

  getAllTools(): Tool[] {
    const tools: Tool[] = [];
    for (const plugin of this.plugins.values()) {
      tools.push(...plugin.tools);
    }
    return tools;
  }

  async validatePlugin(plugin: WebPilotPlugin): Promise<boolean> {
    // Basic validation
    if (!(plugin.name && plugin.version && plugin.team)) {
      throw new Error("Plugin must have name, version, and team");
    }

    if (!Array.isArray(plugin.tools)) {
      throw new Error("Plugin tools must be an array");
    }

    // Validate tool schemas
    for (const tool of plugin.tools) {
      if (!(tool.name && tool.description && tool.inputSchema)) {
        throw new Error(`Invalid tool definition in plugin ${plugin.name}`);
      }
    }

    return true;
  }

  async handleToolCall(toolName: string, _args: unknown): Promise<unknown> {
    const plugin = this.toolRegistry.get(toolName);
    if (!plugin) {
      throw new Error(`Tool not found: ${toolName}`);
    }

    logger.debug("Delegating tool call to plugin", {
      tool: toolName,
      plugin: plugin.name,
    });

    // For now, plugins need to implement their own tool handlers
    // This is a simplified implementation - in reality, plugins would
    // need to export handler functions that we can call here
    throw new Error("Plugin tool execution not yet implemented");
  }

  async loadPlugins(): Promise<void> {
    // TODO: Implement plugin loading from file system
    // For now, no plugins are loaded (plugin loading not yet implemented)
  }

  async cleanup(): Promise<void> {
    logger.info("Cleaning up plugin manager");

    const pluginNames = Array.from(this.plugins.keys());
    for (const pluginName of pluginNames) {
      try {
        await this.unregister(pluginName);
      } catch (error) {
        logger.error("Failed to unregister plugin during cleanup", {
          plugin: pluginName,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    logger.info("Plugin manager cleanup complete");
  }
}
