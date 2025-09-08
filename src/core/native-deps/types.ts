/**
 * Types for Native Dependency Management
 */

export interface NativeLibraryConfig {
  name: string;
  importPath: string;
  installationGuide: string;
  requiredPlatforms: NodeJS.Platform[];
  optionalPlatforms: NodeJS.Platform[];
}

export interface PlatformSupport {
  platform: NodeJS.Platform;
  architecture: string;
  supported: boolean;
  notes?: string;
}

export interface FeatureAvailability {
  available: boolean;
  libraryName: string;
  error?: string;
  platformSupport: PlatformSupport[];
}

export interface DependencyHealthCheck {
  libraryName: string;
  available: boolean;
  version?: string;
  platformCompatible: boolean;
  installationCommand: string;
  error?: string;
}

export const NATIVE_LIBRARIES = ["svgo", "harfbuzzjs"] as const;

export type NativeLibraryName = (typeof NATIVE_LIBRARIES)[number];

export const BUILD_TARGETS = [
  { platform: "linux" as const, arch: "x64" },
  { platform: "linux" as const, arch: "arm64" },
  { platform: "darwin" as const, arch: "x64" },
  { platform: "darwin" as const, arch: "arm64" },
  { platform: "win32" as const, arch: "x64" },
] as const;

export type BuildTarget = (typeof BUILD_TARGETS)[number];
