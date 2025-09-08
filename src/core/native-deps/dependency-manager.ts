/**
 * Native Dependency Manager for Brooklyn MCP
 * Handles graceful loading and error reporting for native libraries
 */

import { getLogger } from "../../shared/pino-logger.js";

// Lazy logger initialization pattern
let logger: ReturnType<typeof getLogger> | null = null;
function ensureLogger() {
  if (!logger) {
    logger = getLogger("native-deps");
  }
  return logger;
}

export interface FeatureMatrix {
  imageProcessing: boolean;
  svgOptimization: boolean;
  textShaping: boolean;
  [key: string]: boolean;
}

export class NativeDependencyError extends Error {
  public readonly libraryName: string;
  public readonly platform: string;
  public readonly architecture: string;

  constructor(libraryName: string, installationGuide: string, originalError?: Error) {
    const platform = process.platform;
    const arch = process.arch;

    const installCommand = getInstallationCommand(libraryName, platform);
    const message = createErrorMessage(
      libraryName,
      platform,
      arch,
      installCommand,
      installationGuide,
      originalError,
    );

    super(message);
    this.name = "NativeDependencyError";
    this.libraryName = libraryName;
    this.platform = platform;
    this.architecture = arch;
  }
}

function createErrorMessage(
  libraryName: string,
  platform: string,
  arch: string,
  installCommand: string,
  installationGuide: string,
  originalError?: Error,
): string {
  const dockerAlternative = getDockerAlternative(libraryName);
  const noSudoAlternative = getNoSudoAlternative(libraryName, platform);

  return `
${libraryName} is not available on ${platform}-${arch}.

PLATFORM-SPECIFIC INSTALLATION:
${installCommand}

${
  noSudoAlternative
    ? `NO SUDO ACCESS? Try:
${noSudoAlternative}

`
    : ""
}${
  dockerAlternative
    ? `DOCKER/CONTAINERIZED DEPLOYMENT:
${dockerAlternative}

`
    : ""
}ALTERNATIVE: Use development mode to bypass bundling issues:
claude mcp add brooklyn-dev -- bun src/cli/brooklyn.ts mcp start --development-only

DETAILED GUIDE: ${installationGuide}

For complete cross-platform guide, use: brooklyn_native_deps_guide MCP tool

${originalError ? `\nOriginal error: ${originalError.message}` : ""}
`;
}

function getDockerAlternative(library: string): string | null {
  const dockerCommands: Record<string, string> = {
    harfbuzzjs: `# Add to your Dockerfile:
RUN apk add harfbuzz-dev  # Alpine  
# Or: RUN apt-get update && apt-get install -y libharfbuzz-dev  # Ubuntu
RUN npm install harfbuzzjs`,
  };

  return dockerCommands[library] || null;
}

function getNoSudoAlternative(_library: string, _platform: string): string | null {
  return null;
}

function getInstallationCommand(library: string, platform: string): string {
  const commands: Record<string, Record<string, string>> = {
    svgo: {
      darwin: "npm install svgo  # Pure JavaScript - no native dependencies",
      linux: "npm install svgo  # Pure JavaScript - no native dependencies",
      win32: "npm install svgo  # Pure JavaScript - no native dependencies",
    },
    harfbuzzjs: {
      darwin: "brew install harfbuzz && npm install harfbuzzjs",
      linux:
        "sudo apt-get install libharfbuzz-dev && npm install harfbuzzjs  # Ubuntu/Debian\n# Or: sudo dnf install harfbuzz-devel && npm install harfbuzzjs  # RHEL/Fedora",
      win32:
        "choco install harfbuzz && npm install harfbuzzjs\n# Note: May require Visual Studio Build Tools for native compilation",
    },
  };

  return commands[library]?.[platform] || `npm install ${library}`;
}

const INSTALLATION_GUIDES = {
  svgo: "https://github.com/svg/svgo#installation",
  harfbuzzjs: "https://github.com/harfbuzz/harfbuzzjs#installation",
};

// biome-ignore lint/complexity/noStaticOnlyClass: Intentional static class for native deps
export class NativeDependencyManager {
  // biome-ignore lint/suspicious/noExplicitAny: Dynamic native library instances
  private static instances = new Map<string, any>();
  private static loadAttempts = new Map<string, boolean>();

  /**
   * Ensure a native library is loaded with graceful error handling
   */
  static async ensureLibrary<T>(name: string, importPath: string): Promise<T> {
    const log = ensureLogger();

    if (NativeDependencyManager.instances.has(name)) {
      return NativeDependencyManager.instances.get(name);
    }

    // Track that we've attempted to load this library
    if (NativeDependencyManager.loadAttempts.get(name)) {
      throw new NativeDependencyError(
        name,
        INSTALLATION_GUIDES[name as keyof typeof INSTALLATION_GUIDES] ||
          "See docs/installation/native-dependencies.md",
      );
    }

    try {
      log.debug(`Loading native library: ${name}`);
      const lib = await import(importPath);
      NativeDependencyManager.instances.set(name, lib);
      NativeDependencyManager.loadAttempts.set(name, true);
      log.info(`Successfully loaded native library: ${name}`);
      return lib;
    } catch (error) {
      NativeDependencyManager.loadAttempts.set(name, true);
      log.error(`Failed to load native library: ${name}`, {
        error: error instanceof Error ? error.message : error,
      });

      throw new NativeDependencyError(
        name,
        INSTALLATION_GUIDES[name as keyof typeof INSTALLATION_GUIDES] ||
          "See docs/installation/native-dependencies.md",
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  // Note: Image processing is handled via browser-based rendering; no native image library hook here

  /**
   * Ensure SVGO SVG optimization library is available
   */
  // biome-ignore lint/suspicious/noExplicitAny: Dynamic SVGO module interface
  static async ensureSVGO(): Promise<any> {
    return await NativeDependencyManager.ensureLibrary("svgo", "svgo");
  }

  /**
   * Ensure HarfBuzz text shaping library is available (future)
   */
  static async ensureHarfBuzz() {
    return await NativeDependencyManager.ensureLibrary("harfbuzzjs", "harfbuzzjs");
  }

  /**
   * Check which native libraries are currently available
   */
  static getAvailableFeatures(): FeatureMatrix {
    return {
      imageProcessing: false,
      svgOptimization: NativeDependencyManager.instances.has("svgo"),
      textShaping: NativeDependencyManager.instances.has("harfbuzzjs"),
    };
  }

  /**
   * Proactively test library availability without throwing errors
   */
  static async testLibraryAvailability(name: string, importPath: string): Promise<boolean> {
    try {
      await NativeDependencyManager.ensureLibrary(name, importPath);
      return true;
    } catch (_error) {
      return false;
    }
  }

  /**
   * Get detailed availability information for debugging
   */
  static async getDetailedAvailability(): Promise<
    Record<string, { available: boolean; error?: string }>
  > {
    const libraries = [
      { name: "svgo", importPath: "svgo" },
      { name: "harfbuzzjs", importPath: "harfbuzzjs" },
    ];

    const results: Record<string, { available: boolean; error?: string }> = {};

    for (const lib of libraries) {
      try {
        await NativeDependencyManager.ensureLibrary(lib.name, lib.importPath);
        results[lib.name] = { available: true };
      } catch (error) {
        results[lib.name] = {
          available: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }

    return results;
  }

  /**
   * Clear all cached instances (useful for testing)
   */
  static clearCache(): void {
    NativeDependencyManager.instances.clear();
    NativeDependencyManager.loadAttempts.clear();
  }

  /**
   * Get platform-specific installation commands for all libraries
   */
  static getInstallationCommands(): Record<string, string> {
    const platform = process.platform;
    return {
      svgo: getInstallationCommand("svgo", platform),
      harfbuzzjs: getInstallationCommand("harfbuzzjs", platform),
    };
  }
}
