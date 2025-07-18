/**
 * Plugin system interfaces for Fulmen MCP Brooklyn
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";

export interface WebPilotPlugin {
  name: string;
  version: string;
  team: string;
  description?: string;
  tools: Tool[];
  setup?: () => Promise<void>;
  teardown?: () => Promise<void>;
  onBrowserCreate?: (browser: unknown) => Promise<void>;
  onBrowserDestroy?: (browserId: string) => Promise<void>;
}

export interface PluginManager {
  register(plugin: WebPilotPlugin): Promise<void>;
  unregister(pluginName: string): Promise<void>;
  getPlugins(): WebPilotPlugin[];
  getToolsByTeam(teamId: string): Tool[];
  validatePlugin(plugin: WebPilotPlugin): Promise<boolean>;
}

export interface PluginContext {
  teamId: string;
  userId?: string;
  config: unknown;
  logger: unknown;
}
