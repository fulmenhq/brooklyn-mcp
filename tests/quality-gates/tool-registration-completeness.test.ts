/**
 * Tool Registration Completeness Tests
 *
 * Prevents the "THREE LOCATIONS" registration gap issue that caused:
 * 1. Tools registered in tool-definitions.ts but missing from isCoreTools array
 * 2. Tools in isCoreTools array but missing from handleCoreTool switch cases
 * 3. Categories defined but not properly registered
 *
 * This test runs as part of regular unit tests (not integration) and will
 * fail the build if registration gaps exist.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { OnboardingTools } from "../../src/core/onboarding-tools.js";
import { getAllTools, getToolCategories } from "../../src/core/tool-definitions.js";

// File paths for source analysis
const BROOKLYN_ENGINE_PATH = join(process.cwd(), "src/core/brooklyn-engine.ts");
const TOOL_DEFINITIONS_PATH = join(process.cwd(), "src/core/tool-definitions.ts");

// Cached source code content
let brooklynEngineSource: string;
let toolDefinitionsSource: string;

beforeAll(async () => {
  // Read source files once for all tests
  brooklynEngineSource = await readFile(BROOKLYN_ENGINE_PATH, "utf-8");
  toolDefinitionsSource = await readFile(TOOL_DEFINITIONS_PATH, "utf-8");
});

/**
 * Extract isCoreTools array from source code
 * Parses the actual array to catch typos and missing tools
 */
function extractCoreToolsArray(source: string): string[] {
  const match = source.match(
    /private isCoreTools\(toolName: string\): boolean \{[\s\S]*?const coreTools = \[([\s\S]*?)\];/,
  );
  if (!match?.[1]) {
    throw new Error("Could not find isCoreTools array in brooklyn-engine.ts");
  }

  // Extract tool names from the array, handling comments
  const arrayContent = match[1];
  const tools: string[] = [];

  // Match quoted strings, ignoring comments
  const toolMatches = arrayContent.match(/"([^"]+)"/g);
  if (toolMatches) {
    tools.push(...toolMatches.map((match) => match.slice(1, -1))); // Remove quotes
  }

  return tools;
}

/**
 * Extract onboarding tools array from source code
 */
function extractOnboardingToolsArray(source: string): string[] {
  const match = source.match(
    /private isOnboardingTools\(toolName: string\): boolean \{[\s\S]*?const onboardingTools = \[([\s\S]*?)\];/,
  );
  if (!match?.[1]) {
    throw new Error("Could not find isOnboardingTools array in brooklyn-engine.ts");
  }

  const arrayContent = match[1];
  const tools: string[] = [];

  const toolMatches = arrayContent.match(/"([^"]+)"/g);
  if (toolMatches) {
    tools.push(...toolMatches.map((match) => match.slice(1, -1)));
  }

  return tools;
}

/**
 * Extract switch cases from handleCoreTool method
 */
function extractHandleCoreToolSwitchCases(source: string): string[] {
  const match = source.match(
    /private async handleCoreTool\([\s\S]*?switch \(name\) \{([\s\S]*?)default:/,
  );
  if (!match?.[1]) {
    throw new Error("Could not find handleCoreTool switch statement in brooklyn-engine.ts");
  }

  const switchContent = match[1];
  const cases: string[] = [];

  // Match case statements, including fall-through cases
  const caseMatches = switchContent.match(/case "([^"]+)":/g);
  if (caseMatches) {
    cases.push(
      ...(caseMatches
        .map((match) => {
          const caseMatch = match.match(/case "([^"]+)":/);
          return caseMatch?.[1];
        })
        .filter(Boolean) as string[]),
    );
  }

  return cases;
}

/**
 * Find matching closing bracket for array definition
 */
function findArrayClosingBracket(source: string, startIndex: number): number {
  let bracketCount = 1;
  let currentIndex = startIndex;

  while (bracketCount > 0 && currentIndex < source.length) {
    if (source[currentIndex] === "[") bracketCount++;
    else if (source[currentIndex] === "]") bracketCount--;
    currentIndex++;
  }

  return currentIndex;
}

/**
 * Extract tool names from array content
 */
function extractToolNames(arrayContent: string): string[] {
  const tools: string[] = [];
  const nameMatches = arrayContent.match(/name:\s*"([^"]+)"/g);

  if (!nameMatches) return tools;

  for (const nameMatch of nameMatches) {
    const toolMatch = nameMatch.match(/name:\s*"([^"]+)"/);
    if (toolMatch?.[1]) {
      const toolName = toolMatch[1];
      // Filter out non-tool entries (like example filenames)
      if (!(toolName.includes(".") || toolName.includes("screenshot-"))) {
        tools.push(toolName);
      }
    }
  }

  return tools;
}

/**
 * Process single category array export
 */
function processCategoryArray(
  source: string,
  exportMatch: string,
): { name: string; tools: string[] } | null {
  const nameMatch = exportMatch.match(/export const (\w+): EnhancedTool\[\] = \[/);
  if (!nameMatch?.[1]) return null;

  const arrayName = nameMatch[1];
  const startIndex = source.indexOf(exportMatch);
  if (startIndex === -1) return null;

  const closingIndex = findArrayClosingBracket(source, startIndex + exportMatch.length);
  const arrayContent = source.substring(startIndex + exportMatch.length - 1, closingIndex);
  const tools = extractToolNames(arrayContent);

  return { name: arrayName, tools };
}

/**
 * Extract category arrays from tool-definitions.ts
 */
function extractCategoryArrays(source: string): Record<string, string[]> {
  const categories: Record<string, string[]> = {};
  const exportMatches = source.match(/export const (\w+): EnhancedTool\[\] = \[/g);

  if (!exportMatches) return categories;

  for (const exportMatch of exportMatches) {
    const result = processCategoryArray(source, exportMatch);
    if (result) {
      categories[result.name] = result.tools;
    }
  }

  return categories;
}

/**
 * Group tools by category
 */
function groupToolsByCategory(
  allTools: { name: string; category: string }[],
): Record<string, string[]> {
  return allTools.reduce(
    (acc, tool) => {
      if (!acc[tool.category]) {
        acc[tool.category] = [];
      }
      acc[tool.category]!.push(tool.name);
      return acc;
    },
    {} as Record<string, string[]>,
  );
}

/**
 * Generate expected array names for a category
 */
function generateExpectedArrayNames(category: string): string[] {
  const normalizedCategory = category.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());

  return [
    `${normalizedCategory}Tools`,
    `${category}Tools`,
    `${category.replace(/-/g, "")}Tools`,
    "browserLifecycleTools", // Special case
    "contentCaptureTools", // Special case
  ];
}

/**
 * Check if category array contains most expected tools (80% threshold)
 */
function isValidCategoryArray(toolsInCategory: string[], arrayTools: string[]): boolean {
  const foundTools = toolsInCategory.filter((tool) => arrayTools.includes(tool));
  return foundTools.length >= Math.ceil(toolsInCategory.length * 0.8);
}

/**
 * Find missing category arrays
 */
function findMissingCategoryArrays(
  toolsByCategory: Record<string, string[]>,
  categoryArrays: Record<string, string[]>,
): string[] {
  const missingCategoryArrays: string[] = [];

  for (const [category, toolsInCategory] of Object.entries(toolsByCategory)) {
    const expectedArrayNames = generateExpectedArrayNames(category);

    const foundArray = expectedArrayNames.some((arrayName) => {
      const arrayTools = categoryArrays[arrayName];
      return arrayTools && isValidCategoryArray(toolsInCategory, arrayTools);
    });

    if (!foundArray) {
      missingCategoryArrays.push(category);
    }
  }

  return missingCategoryArrays;
}

describe("Tool Registration Completeness", () => {
  describe("Core Tool Classification", () => {
    it("should have all tools from getAllTools() in either isCoreTools or isOnboardingTools arrays", () => {
      // Get all tools from tool definitions
      const allToolsFromDefinitions = getAllTools().map((tool) => tool.name);

      // Get tools from classification arrays
      const coreTools = extractCoreToolsArray(brooklynEngineSource);
      const onboardingTools = extractOnboardingToolsArray(brooklynEngineSource);
      const allClassifiedTools = [...coreTools, ...onboardingTools];

      // Find tools that are defined but not classified
      const unclassifiedTools = allToolsFromDefinitions.filter(
        (tool) => !allClassifiedTools.includes(tool),
      );

      expect(unclassifiedTools).toEqual([]);

      if (unclassifiedTools.length > 0) {
        throw new Error(
          `Tools defined in tool-definitions.ts but missing from isCoreTools or isOnboardingTools arrays: ${unclassifiedTools.join(", ")}.\nAdd these tools to the appropriate classification array in brooklyn-engine.ts.`,
        );
      }
    });

    it("should have no tools in classification arrays that are not in tool definitions", () => {
      // Get all tools from tool definitions and onboarding tools
      const coreToolsFromDefinitions = getAllTools().map((tool) => tool.name);
      const onboardingToolsFromClass = OnboardingTools.getTools().map((tool) => tool.name);
      const allValidTools = [...coreToolsFromDefinitions, ...onboardingToolsFromClass];

      // Get tools from classification arrays
      const coreTools = extractCoreToolsArray(brooklynEngineSource);
      const onboardingTools = extractOnboardingToolsArray(brooklynEngineSource);
      const allClassifiedTools = [...coreTools, ...onboardingTools];

      // Find tools that are classified but not defined anywhere
      const orphanedTools = allClassifiedTools.filter((tool) => !allValidTools.includes(tool));

      expect(orphanedTools).toEqual([]);

      if (orphanedTools.length > 0) {
        throw new Error(
          `Tools in classification arrays but missing from tool definitions or onboarding tools: ${orphanedTools.join(", ")}.\nRemove these tools from the classification arrays or add them to appropriate definitions.`,
        );
      }
    });
  });

  describe("Core Tool Execution Routing", () => {
    it("should have switch cases for all tools in isCoreTools array", () => {
      const coreTools = extractCoreToolsArray(brooklynEngineSource);
      const switchCases = extractHandleCoreToolSwitchCases(brooklynEngineSource);

      const missingFromSwitch = coreTools.filter((tool) => !switchCases.includes(tool));

      expect(missingFromSwitch).toEqual([]);

      if (missingFromSwitch.length > 0) {
        throw new Error(
          `Tools in isCoreTools array but missing from handleCoreTool switch cases: ${missingFromSwitch.join(", ")}.\nAdd case statements for these tools in the handleCoreTool method in brooklyn-engine.ts.`,
        );
      }
    });

    it("should have no switch cases for tools not in isCoreTools array", () => {
      const coreTools = extractCoreToolsArray(brooklynEngineSource);
      const switchCases = extractHandleCoreToolSwitchCases(brooklynEngineSource);

      // Exclude onboarding tools which have their own handler
      const onboardingTools = extractOnboardingToolsArray(brooklynEngineSource);

      const orphanedCases = switchCases.filter(
        (tool) => !(coreTools.includes(tool) || onboardingTools.includes(tool)),
      );

      expect(orphanedCases).toEqual([]);

      if (orphanedCases.length > 0) {
        throw new Error(
          `Switch cases in handleCoreTool but not in isCoreTools array: ${orphanedCases.join(", ")}.\nAdd these tools to the isCoreTools array or remove the cases.`,
        );
      }
    });
  });

  describe("Category Registration", () => {
    it("should have all tool categories registered in getToolCategories()", () => {
      const allTools = getAllTools();
      const toolsByCategory = allTools.reduce(
        (acc, tool) => {
          if (!acc[tool.category]) {
            acc[tool.category] = [];
          }
          acc[tool.category]!.push(tool.name);
          return acc;
        },
        {} as Record<string, string[]>,
      );

      const registeredCategories = getToolCategories();
      const usedCategories = Object.keys(toolsByCategory);

      const unregisteredCategories = usedCategories.filter(
        (category) => !registeredCategories.includes(category),
      );

      expect(unregisteredCategories).toEqual([]);

      if (unregisteredCategories.length > 0) {
        throw new Error(
          `Tool categories used but not registered: ${unregisteredCategories.join(", ")}.\nThese categories are used in tool definitions but not returned by getToolCategories().`,
        );
      }
    });

    it("should have category arrays exported for all used categories", () => {
      const categoryArrays = extractCategoryArrays(toolDefinitionsSource);
      const allTools = getAllTools();
      const toolsByCategory = groupToolsByCategory(allTools);
      const missingCategoryArrays = findMissingCategoryArrays(toolsByCategory, categoryArrays);

      expect(missingCategoryArrays).toEqual([]);

      if (missingCategoryArrays.length > 0) {
        throw new Error(
          `Categories missing corresponding exported tool arrays: ${missingCategoryArrays.join(", ")}.\nEach category should have a corresponding exported array (e.g., "javascript" -> "javascriptTools").`,
        );
      }
    });
  });

  describe("Tool Definition Consistency", () => {
    it("should have consistent tool names in category arrays and getAllTools()", () => {
      const allToolsFromGetAllTools = getAllTools().map((tool) => tool.name);
      const categoryArrays = extractCategoryArrays(toolDefinitionsSource);

      // Collect all tools from category arrays
      const allToolsFromArrays = Object.values(categoryArrays).flat();

      // Check for tools in arrays but not in getAllTools()
      const missingFromGetAllTools = allToolsFromArrays.filter(
        (tool) => !allToolsFromGetAllTools.includes(tool),
      );

      // Check for tools in getAllTools() but not in any category array
      const missingFromArrays = allToolsFromGetAllTools.filter(
        (tool) => !allToolsFromArrays.includes(tool),
      );

      expect(missingFromGetAllTools).toEqual([]);
      expect(missingFromArrays).toEqual([]);

      if (missingFromGetAllTools.length > 0) {
        throw new Error(
          `Tools in category arrays but not included in getAllTools(): ${missingFromGetAllTools.join(", ")}`,
        );
      }

      if (missingFromArrays.length > 0) {
        throw new Error(
          `Tools returned by getAllTools() but not found in any category array: ${missingFromArrays.join(", ")}`,
        );
      }
    });
  });
});

describe("Registration Pattern Documentation", () => {
  it("should document the three required locations for new tools", () => {
    // This test serves as living documentation of the requirement
    const requiredLocations = [
      "1. Tool Definitions (tool-definitions.ts) - Schema registration",
      "2. Core Tools Array (brooklyn-engine.ts:isCoreTools) - Tool classification",
      "3. Switch Cases (brooklyn-engine.ts:handleCoreTool) - Execution routing",
    ];

    // This test always passes but documents the requirement
    expect(requiredLocations.length).toBe(3);

    // These console logs are intentional documentation for developers
    // biome-ignore lint/suspicious/noConsole: Intentional documentation logging
    console.log("\n📋 REQUIRED LOCATIONS for new tools:");
    for (const location of requiredLocations) {
      // biome-ignore lint/suspicious/noConsole: Intentional documentation logging
      console.log(`  ${location}`);
    }
    // biome-ignore lint/suspicious/noConsole: Intentional documentation logging
    console.log("\n⚠️  Missing ANY location will cause 'Tool not found' errors!");
  });
});
