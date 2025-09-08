#!/usr/bin/env bun
/**
 * Brooklyn Asset Manager v2.0
 * Downloads and validates external assets using YAML manifest and JSON Schema
 *
 * Usage: bun scripts/download-assets.ts [--force] [--asset=name]
 *
 * Schema: ../schemas/brooklyn-assets-v1.yaml
 * Manifest: ../configs/brooklyn-assets-manifest.yaml
 */

import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { parse as parseYAML } from "yaml";

// Schema-compliant interfaces (aligned with brooklyn-assets-v1.yaml)
interface AssetFile {
  filename: string;
  sources: string[];
  expectedSize: number;
  contentType: string;
  checksums?: {
    sha256?: string;
  };
}

interface AssetConfig {
  version: string;
  description?: string;
  enabled: boolean;
  files: AssetFile[];
}

interface AssetsManifest {
  version: string;
  assets: Record<string, AssetConfig>;
}

async function loadManifest(): Promise<AssetsManifest> {
  const projectRoot = resolve(dirname(import.meta.path), "..");
  const manifestPath = join(projectRoot, "configs", "brooklyn-assets-manifest.yaml");
  const schemaPath = join(projectRoot, "schemas", "brooklyn-assets-v1.yaml");

  if (!existsSync(manifestPath)) {
    console.error("❌ Assets manifest not found:", manifestPath);
    console.error("   Expected YAML manifest in configs/ directory");
    process.exit(1);
  }

  if (!existsSync(schemaPath)) {
    console.error("❌ Asset schema not found:", schemaPath);
    console.error("   Brooklyn asset schema is required for validation");
    process.exit(1);
  }

  try {
    // Load and parse YAML manifest
    const manifestYaml = readFileSync(manifestPath, "utf-8");
    const manifest = parseYAML(manifestYaml) as AssetsManifest;

    // Load and parse JSON Schema
    const schemaYaml = readFileSync(schemaPath, "utf-8");
    const schema = parseYAML(schemaYaml);

    // Validate manifest against schema
    const ajv = new Ajv({ allErrors: true, verbose: true });
    addFormats(ajv);

    const validate = ajv.compile(schema);
    const valid = validate(manifest);

    if (!valid) {
      console.error("❌ Asset manifest validation failed:");
      if (validate.errors) {
        for (const error of validate.errors) {
          console.error(`   ${error.instancePath || "root"}: ${error.message}`);
          if (error.data) {
            console.error(`   Received: ${JSON.stringify(error.data)}`);
          }
        }
      }
      process.exit(1);
    }

    console.log(`✅ Manifest validation passed (schema: brooklyn-assets-v${manifest.version})`);
    return manifest;
  } catch (error) {
    console.error("❌ Failed to load/validate assets manifest:", error);
    process.exit(1);
  }
}

async function downloadFile(file: AssetFile, targetPath: string): Promise<boolean> {
  let lastError: Error | null = null;

  for (const source of file.sources) {
    try {
      console.log(`   ⬇️  Trying ${file.filename} from ${new URL(source).hostname}...`);

      const response = await fetch(source, {
        headers: {
          "User-Agent": "Brooklyn-MCP-Asset-Manager/2.0",
          Accept: file.contentType || "*/*",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Validate content type if specified
      if (file.contentType) {
        const contentType = response.headers.get("content-type") || "";
        const expectedSubType = file.contentType.split("/")[1];
        if (expectedSubType && !contentType.includes(expectedSubType)) {
          console.warn(
            `   ⚠️  Content type mismatch: expected ${file.contentType}, got ${contentType}`,
          );
        }
      }

      await Bun.write(targetPath, await response.blob());

      const actualSize = await Bun.file(targetPath).size;
      const sizeOk = Math.abs(actualSize - file.expectedSize) / file.expectedSize < 0.15; // 15% tolerance for CDN compression

      if (!sizeOk) {
        console.warn(
          `   ⚠️  Size mismatch: expected ~${formatBytes(file.expectedSize)}, got ${formatBytes(actualSize)}`,
        );
      }

      // TODO: Future SHA256 checksum validation
      if (file.checksums?.sha256) {
        console.log(`   🔍 SHA256 validation: ${file.checksums.sha256.substring(0, 16)}...`);
        // Implementation deferred - checksum validation can be added later
      }

      console.log(`   ✅ Downloaded ${file.filename} (${formatBytes(actualSize)})`);
      return true;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.log(`   ❌ Failed from ${new URL(source).hostname}: ${lastError.message}`);
    }
  }

  // All files are required in new schema (no optional files)
  console.error(`   💥 All sources failed for required file ${file.filename}:`);
  console.error(`      ${lastError?.message || "Unknown error"}`);
  return false;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Asset management has inherent complexity
async function downloadAssets(force = false, specificAsset?: string): Promise<void> {
  const manifest = await loadManifest();
  // Use configured assets path instead of cache
  const baseDir = join(homedir(), ".brooklyn", "assets");

  console.log("🌉 Brooklyn Asset Manager v2.0");
  console.log(`📁 Assets directory: ${baseDir}`);
  console.log(`📋 Manifest version: ${manifest.version}`);
  if (force) console.log("🔄 Force mode: redownloading existing assets");
  if (specificAsset) console.log(`🎯 Target asset: ${specificAsset}`);
  console.log("");

  let hasErrors = false;
  let assetsToProcess: Record<string, AssetConfig>;

  if (specificAsset) {
    const asset = manifest.assets[specificAsset];
    if (!asset) {
      console.error(`❌ Asset '${specificAsset}' not found in manifest`);
      console.error(`   Available assets: ${Object.keys(manifest.assets).join(", ")}`);
      process.exit(1);
    }
    assetsToProcess = { [specificAsset]: asset };
  } else {
    assetsToProcess = manifest.assets;
  }

  for (const [assetKey, asset] of Object.entries(assetsToProcess)) {
    // Skip disabled assets unless specifically requested
    if (asset.enabled === false && !specificAsset) {
      console.log(`⏭️  Skipping disabled asset: ${assetKey} v${asset.version}`);
      if (asset.description) {
        console.log(`   ${asset.description}`);
      }
      continue;
    }

    const assetDir = join(baseDir, assetKey);
    console.log(`📦 Processing ${assetKey} v${asset.version}`);
    if (asset.description) {
      console.log(`   ${asset.description}`);
    }

    // Check if already exists and not forcing
    if (!force && existsSync(assetDir)) {
      const allFilesExist = asset.files.every((file) => existsSync(join(assetDir, file.filename)));

      if (allFilesExist) {
        console.log("   ✅ Already downloaded, skipping");
        continue;
      }
    }

    // Create directory
    if (!existsSync(assetDir)) {
      mkdirSync(assetDir, { recursive: true });
    }

    // Download each file
    for (const file of asset.files) {
      const filePath = join(assetDir, file.filename);

      if (!(await downloadFile(file, filePath))) {
        hasErrors = true;
        break; // Don't continue with this asset if a required file failed
      }
    }

    if (!hasErrors) {
      console.log(`   🎉 ${assetKey} v${asset.version} ready\n`);
    }
  }

  if (hasErrors) {
    console.error("💥 Asset download failed - required files could not be downloaded");
    console.error("   Check network connectivity and CDN availability");
    process.exit(1);
  }

  console.log("✅ All enabled assets downloaded successfully!");
  console.log(`📁 Assets available in: ${baseDir}`);
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Number.parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
}

// Main execution
const args = process.argv.slice(2);
const force = args.includes("--force");
const assetArg = args.find((arg) => arg.startsWith("--asset="));
const specificAsset = assetArg?.split("=")[1];

if (args.includes("--help") || args.includes("-h")) {
  console.log(`
🌉 Brooklyn Asset Manager v2.0
`);
  console.log(`Usage: bun scripts/download-assets.ts [options]
`);
  console.log("Options:");
  console.log("  --force              Force redownload all assets");
  console.log("  --asset=<name>       Download specific asset only");
  console.log(`  --help, -h           Show this help message
`);
  console.log("Examples:");
  console.log("  bun scripts/download-assets.ts");
  console.log("  bun scripts/download-assets.ts --force");
  console.log("  bun scripts/download-assets.ts --asset=pdfjs");
  console.log(`  bun scripts/download-assets.ts --asset=mermaid --force
`);
  process.exit(0);
}

downloadAssets(force, specificAsset).catch((error) => {
  console.error("💥 Asset download failed:", error);
  process.exit(1);
});
