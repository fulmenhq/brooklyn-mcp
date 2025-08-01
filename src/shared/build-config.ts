/**
 * Build configuration and template variables
 * Single source of truth for Brooklyn MCP server configuration
 */

// Template variables for fulmen ecosystem
export const templateVars = {
  EXEC_NAME: "fulmen-brooklyn",
  REPO_NAME: "fulmen-mcp-forge-brooklyn",
  SERVICE_NAME: "fulmen-brooklyn",
  DISPLAY_NAME: "Fulmen MCP Brooklyn",
  PACKAGE_SCOPE: "{{PACKAGE_SCOPE}}", // For organization refit
};

// Build configuration
export const buildConfig = {
  serviceName: templateVars.SERVICE_NAME,
  displayName: templateVars.DISPLAY_NAME,
  version: "1.4.0", // Synced from VERSION file
  execName: templateVars.EXEC_NAME,
  repoName: templateVars.REPO_NAME,
};
