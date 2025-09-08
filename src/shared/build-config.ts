/**
 * Build configuration and template variables
 * Single source of truth for Brooklyn MCP server configuration
 */

// Template variables for fulmen ecosystem
export const templateVars = {
  EXEC_NAME: "fulmen-brooklyn",
  REPO_NAME: "brooklyn-mcp",
  SERVICE_NAME: "fulmen-brooklyn",
  DISPLAY_NAME: "Fulmen MCP Brooklyn",
  PACKAGE_SCOPE: "{{PACKAGE_SCOPE}}", // For organization refit
};

// Binary signature interface
export interface BinarySignature {
  sha256: string;
  size: number;
  buildTime: string;
}

// Git status interface
export interface GitStatus {
  clean: boolean;
  ahead: number;
  behind: number;
  staged: number;
  unstaged: number;
  untracked: number;
}

// Build signature interface
export interface BuildSignature {
  version: string;
  gitCommit: string;
  gitBranch: string;
  gitStatus: GitStatus;
  buildTime: string;
  platform: string;
  arch: string;
  nodeVersion: string;
  bunVersion: string;
  buildEnv: "development" | "production";
  binaryHash?: BinarySignature;
}

// Build configuration
export const buildConfig = {
  serviceName: templateVars.SERVICE_NAME,
  displayName: templateVars.DISPLAY_NAME,
  version: "0.2.0-rc.3", // Synced from VERSION file
  execName: templateVars.EXEC_NAME,
  repoName: templateVars.REPO_NAME,
  buildSignature: {
    version: "0.2.0-rc.3",
    gitCommit: "f2617c1aacb4dd616175acfabf07cd12d590beac",
    gitBranch: "main",
    gitStatus: {
      clean: true,
      ahead: 1,
      behind: 5,
      staged: 0,
      unstaged: 0,
      untracked: 0,
    },
    buildTime: "2025-09-08T22:56:56.801Z",
    platform: "darwin",
    arch: "arm64",
    nodeVersion: "v24.3.0",
    bunVersion: "1.2.20",
    buildEnv: "development",
  } as BuildSignature | null, // Generated at build time
};
