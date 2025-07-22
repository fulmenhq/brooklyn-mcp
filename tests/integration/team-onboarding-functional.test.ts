/**
 * Functional test for team onboarding integration with Brooklyn MCP server
 * Tests the core functionality without requiring MCP transport
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BrowserPoolManager } from "../../src/core/browser-pool-manager";
import { OnboardingTools } from "../../src/core/onboarding-tools";

describe("Team Onboarding Functional Tests", () => {
  let mockBrowserPool: BrowserPoolManager;

  beforeEach(() => {
    // Create a mock browser pool
    mockBrowserPool = {
      getStatus: vi.fn().mockResolvedValue({
        activeSessions: 0,
        maxBrowsers: 10,
        sessions: [],
      }),
      initialize: vi.fn(),
      cleanup: vi.fn(),
      launchBrowser: vi.fn(),
      navigate: vi.fn(),
      screenshot: vi.fn(),
      closeBrowser: vi.fn(),
    } as any;

    // Set up the browser pool for onboarding tools
    OnboardingTools.setBrowserPool(mockBrowserPool);
  });

  it("should provide onboarding tools for example team", () => {
    const tools = OnboardingTools.getTools();
    const toolNames = tools.map((tool) => tool.name);

    // Check that all onboarding tools are available
    expect(toolNames).toContain("brooklyn_status");
    expect(toolNames).toContain("brooklyn_capabilities");
    expect(toolNames).toContain("brooklyn_getting_started");
    expect(toolNames).toContain("brooklyn_examples");
    expect(toolNames).toContain("brooklyn_team_setup");
    expect(toolNames).toContain("brooklyn_troubleshooting");
  });

  it("should handle brooklyn_status tool call", async () => {
    const result = await OnboardingTools.handleTool("brooklyn_status", {
      detail: "basic",
    });

    expect(result).toBeDefined();
    expect(result.service).toBe("fulmen-brooklyn");
    expect(result.status).toBe("running");
    expect(result.capabilities).toBeDefined();
    expect(result.capabilities.browsers).toContain("chromium");
    expect(result.capabilities.browsers).toContain("firefox");
    expect(result.capabilities.browsers).toContain("webkit");
  });

  it("should handle brooklyn_getting_started for example team", async () => {
    const result = await OnboardingTools.handleTool("brooklyn_getting_started", {
      use_case: "ai_development",
      team_id: "example-team",
    });

    expect(result).toBeDefined();
    expect(result.title).toBe("Getting Started with Brooklyn for AI Development");
    expect(result.steps).toBeDefined();
    expect(result.steps).toHaveLength(5);

    // Check that team_id is used in the guide
    const launchBrowserStep = result.steps.find((step: any) => step.command === "launch_browser");
    expect(launchBrowserStep).toBeDefined();
    expect(launchBrowserStep.params.teamId).toBe("example-team");
  });

  it("should handle brooklyn_team_setup for example team", async () => {
    const result = await OnboardingTools.handleTool("brooklyn_team_setup", {
      team_id: "example-team",
      use_cases: ["ux_development"],
      domains: ["*.example.com", "localhost:*"],
    });

    expect(result).toBeDefined();
    expect(result.team_id).toBe("example-team");
    expect(result.configuration).toBeDefined();
    expect(result.configuration.use_cases).toContain("ux_development");
    expect(result.configuration.domains).toContain("*.example.com");
    expect(result.status).toBe("configuration_preview");
  });

  it("should handle brooklyn_examples for basic navigation", async () => {
    const result = await OnboardingTools.handleTool("brooklyn_examples", {
      task: "basic_navigation",
      format: "claude_commands",
    });

    expect(result).toBeDefined();
    expect(result.title).toBe("Basic Navigation Example");
    expect(result.description).toBe("Navigate to a website and capture a screenshot");
    expect(result.commands).toBeDefined();
    expect(result.commands).toHaveLength(4);
    expect(result.commands[0]).toContain("Launch a chromium browser");
    expect(result.commands[1]).toContain("Navigate to https://example.com");
    expect(result.commands[2]).toContain("Take a full-page screenshot");
    expect(result.commands[3]).toContain("Close the browser");
  });

  it("should handle brooklyn_capabilities", async () => {
    const result = await OnboardingTools.handleTool("brooklyn_capabilities", {
      category: "all",
    });

    expect(result).toBeDefined();
    expect(result.core_tools).toBeDefined();
    expect(result.onboarding_tools).toBeDefined();
    expect(result.plugin_tools).toBeDefined();
    expect(result.testing_tools).toBeDefined();

    // Check core tools
    const coreToolNames = result.core_tools.tools.map((tool: any) => tool.name);
    expect(coreToolNames).toContain("launch_browser");
    expect(coreToolNames).toContain("navigate");
    expect(coreToolNames).toContain("screenshot");
    expect(coreToolNames).toContain("close_browser");
  });

  it("should handle brooklyn_troubleshooting", async () => {
    const result = await OnboardingTools.handleTool("brooklyn_troubleshooting", {
      issue: "browser_wont_start",
    });

    expect(result).toBeDefined();
    expect(result.title).toBe("Browser Won't Start");
    expect(result.common_causes).toBeDefined();
    expect(result.solutions).toBeDefined();
    expect(result.solutions).toContain("Install browsers with: bun run setup");
  });

  it("should handle full status with browser pool", async () => {
    const result = await OnboardingTools.handleTool("brooklyn_status", {
      detail: "full",
    });

    expect(result).toBeDefined();
    expect(result.service).toBe("fulmen-brooklyn");
    expect(result.configuration).toBeDefined();
    expect(result.resource_usage).toBeDefined();
    expect(result.browser_pool).toBeDefined();

    // Check that browser pool status was called
    expect(mockBrowserPool.getStatus).toHaveBeenCalled();
  });

  it("should handle invalid tool gracefully", async () => {
    await expect(OnboardingTools.handleTool("invalid_tool", {})).rejects.toThrow(
      "Unknown onboarding tool: invalid_tool",
    );
  });

  it("should handle example team specific getting started", async () => {
    const result = await OnboardingTools.handleTool("brooklyn_getting_started", {
      use_case: "e2e_testing",
      team_id: "example-team",
    });

    expect(result).toBeDefined();
    expect(result.title).toBe("Getting Started with Brooklyn for E2E Testing");
    expect(result.steps).toBeDefined();

    // Check that team_id is used in the guide
    const setupStep = result.steps.find((step: any) => step.command === "brooklyn_team_setup");
    expect(setupStep).toBeDefined();
    expect(setupStep.params.team_id).toBe("example-team");
  });

  it("should provide example team specific examples", async () => {
    const result = await OnboardingTools.handleTool("brooklyn_examples", {
      task: "basic_navigation",
      format: "api_calls",
    });

    expect(result).toBeDefined();
    expect(result.title).toBe("Basic Navigation Example");
    expect(result.api_calls).toBeDefined();
    expect(result.api_calls).toHaveLength(4);

    // Check API call structure
    const launchCall = result.api_calls[0];
    expect(launchCall.tool).toBe("launch_browser");
    expect(launchCall.params.type).toBe("chromium");
    expect(launchCall.params.teamId).toBe("demo");
  });
});
