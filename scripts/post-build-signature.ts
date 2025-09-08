#!/usr/bin/env bun

/**
 * Post-build signature script - calculates binary hash after compilation
 * This adds the final binary hash to the build signature for complete traceability
 */

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { BinarySignature } from "../src/shared/build-config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

async function calculateBinaryHash(filePath: string): Promise<BinarySignature> {
  try {
    const data = await fs.readFile(filePath);
    const hash = crypto.createHash("sha256").update(data).digest("hex");
    const stats = await fs.stat(filePath);

    return {
      sha256: hash,
      size: stats.size,
      buildTime: new Date().toISOString(),
    };
  } catch (error) {
    console.error(`❌ Error calculating binary hash for ${filePath}:`, error);
    throw error;
  }
}

async function updateBuildConfigWithBinaryHash(binarySignature: BinarySignature): Promise<void> {
  const buildConfigPath = path.join(rootDir, "src/shared/build-config.ts");

  try {
    let content = await fs.readFile(buildConfigPath, "utf-8");

    // Pattern to match the existing buildSignature
    const pattern =
      /buildSignature: {[\s\S]*?} as BuildSignature \| null, \/\/ Generated at build time/;

    if (pattern.test(content)) {
      // Parse the existing buildSignature to add binaryHash
      const signatureMatch = content.match(
        /buildSignature: ({[\s\S]*?}) as BuildSignature \| null/,
      );

      if (signatureMatch?.[1]) {
        const existingSignature = JSON.parse(signatureMatch[1]);
        const updatedSignature = {
          ...existingSignature,
          binaryHash: binarySignature,
        };

        const replacement = `buildSignature: ${JSON.stringify(updatedSignature, null, 2)} as BuildSignature | null, // Generated at build time`;
        content = content.replace(pattern, replacement);

        await fs.writeFile(buildConfigPath, content);
        console.log(
          `✅ Binary hash added to build signature: ${binarySignature.sha256.slice(0, 16)}...`,
        );
      }
    } else {
      console.warn("⚠️  Could not find buildSignature pattern in build-config.ts");
    }
  } catch (error) {
    console.error("❌ Error updating build config with binary hash:", error);
    throw error;
  }
}

async function addBinarySignature(): Promise<void> {
  const binaryPath = path.join(rootDir, "dist/brooklyn");

  // Check if binary exists
  try {
    await fs.access(binaryPath);
  } catch {
    console.error(`❌ Binary not found at ${binaryPath}`);
    console.error("Make sure to run this script after the build completes");
    process.exit(1);
  }

  console.log(`🔐 Calculating binary signature for ${path.basename(binaryPath)}...`);

  const binarySignature = await calculateBinaryHash(binaryPath);
  console.log(`📊 Binary size: ${(binarySignature.size / 1024 / 1024).toFixed(2)}MB`);
  console.log(`🔑 SHA256: ${binarySignature.sha256}`);

  await updateBuildConfigWithBinaryHash(binarySignature);

  console.log("🎉 Post-build signature completed successfully!");
}

// Only run if this script is executed directly
if (import.meta.main) {
  addBinarySignature().catch((error) => {
    console.error("❌ Post-build signature failed:", error);
    process.exit(1);
  });
}
