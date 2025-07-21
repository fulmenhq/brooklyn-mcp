#!/usr/bin/env bun

/**
 * Brooklyn Development Mode Test Suite
 *
 * Validates development mode functionality without requiring Claude session restarts.
 * Tests core browser automation features through pipe communication.
 */

import {
  checkDevMode,
  dev_brooklyn_capabilities,
  dev_brooklyn_list_tools,
  dev_brooklyn_status,
  dev_close_browser,
  dev_launch_browser,
  dev_list_active_browsers,
  dev_navigate_to_url,
  dev_take_screenshot,
  getDevModeStatus,
  testDevMode,
} from "./dev-helpers.js";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
  details?: unknown;
}

class DevTestSuite {
  private results: TestResult[] = [];

  /**
   * Run test and record result
   */
  private async runTest(name: string, testFn: () => Promise<unknown>): Promise<boolean> {
    const startTime = Date.now();

    try {
      console.log(`📋 ${name}...`);
      const result = await testFn();
      const duration = Date.now() - startTime;

      this.results.push({
        name,
        passed: true,
        duration,
        details: result,
      });

      console.log(`✅ ${name} (${duration}ms)`);
      return true;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.results.push({
        name,
        passed: false,
        error: errorMessage,
        duration,
      });

      console.log(`❌ ${name} (${duration}ms)`);
      console.log(`   Error: ${errorMessage}`);
      return false;
    }
  }

  /**
   * Print test summary
   */
  private printSummary(): void {
    const passed = this.results.filter((r) => r.passed).length;
    const total = this.results.length;
    const failed = total - passed;

    console.log("");
    console.log("📊 Test Summary");
    console.log("=".repeat(30));
    console.log(`Total: ${total}`);
    console.log(`Passed: ${passed} ✅`);
    console.log(`Failed: ${failed} ${failed > 0 ? "❌" : "✅"}`);

    if (failed > 0) {
      console.log("");
      console.log("Failed Tests:");
      const failedTests = this.results.filter((r) => !r.passed);
      for (const r of failedTests) {
        console.log(`  • ${r.name}: ${r.error}`);
      }
    }

    const totalTime = this.results.reduce((sum, r) => sum + r.duration, 0);
    console.log(`\nTotal Time: ${totalTime}ms`);
  }

  /**
   * Basic functionality tests
   */
  async testBasic(): Promise<void> {
    console.log("🧪 Running Basic Development Mode Tests");
    console.log("=".repeat(45));

    // Pre-flight check
    console.log("📋 Pre-flight checks...");
    const status = getDevModeStatus();

    if (!status.active) {
      console.log("❌ Development mode not active");
      console.log("   Run: bun run dev:brooklyn:start");
      return;
    }

    if (!(status.pipes?.input && status.pipes?.output)) {
      console.log("❌ Development pipes not available");
      console.log("   Try: bun run dev:brooklyn:restart");
      return;
    }

    console.log("✅ Pre-flight checks passed");
    console.log("");

    // Test server status
    await this.runTest("Server Status", async () => {
      const result = await dev_brooklyn_status();

      if (!result.version) {
        throw new Error("No version in status response");
      }

      return { version: result.version, status: result.status };
    });

    // Test capabilities
    await this.runTest("Server Capabilities", async () => {
      const result = await dev_brooklyn_capabilities();

      if (!result.core_tools) {
        throw new Error("No core_tools in capabilities");
      }

      return { core_tools: result.core_tools };
    });

    // Test tool listing
    await this.runTest("Tool Listing", async () => {
      const result = await dev_brooklyn_list_tools();

      if (!(result.tools || result.categories)) {
        throw new Error("No tools or categories in tool listing");
      }

      return { hasTools: !!result.tools, hasCategories: !!result.categories };
    });

    this.printSummary();
  }

  /**
   * Browser automation tests
   */
  async testBrowsers(): Promise<void> {
    console.log("🧪 Running Browser Automation Tests");
    console.log("=".repeat(45));

    let browserId: string | null = null;

    try {
      // Test browser launch
      await this.runTest("Launch Browser", async () => {
        const result = await dev_launch_browser({
          browserType: "chromium",
          headless: true,
          viewport: { width: 1024, height: 768 },
        });

        if (!result.browserId) {
          throw new Error("No browserId in launch response");
        }

        browserId = result.browserId;
        return { browserId: result.browserId };
      });

      // Test browser listing
      await this.runTest("List Active Browsers", async () => {
        const result = await dev_list_active_browsers();

        if (!Array.isArray(result.browsers)) {
          throw new Error("No browsers array in listing");
        }

        const activeBrowser = result.browsers.find(
          (b) => "browserId" in b && b.browserId === browserId,
        );
        if (!activeBrowser) {
          throw new Error("Launched browser not found in active list");
        }

        return { count: result.browsers.length };
      });

      // Test navigation
      await this.runTest("Navigate to URL", async () => {
        if (!browserId) throw new Error("No browser ID available");

        const result = await dev_navigate_to_url({
          browserId,
          url: "data:text/html,<h1>Brooklyn Development Mode Test</h1><p>Testing navigation functionality</p>",
          waitUntil: "load",
        });

        if (!result.success) {
          throw new Error("Navigation failed");
        }

        return { url: result.url, success: result.success };
      });
    } finally {
      // Always try to clean up browser
      if (browserId) {
        await this.runTest("Close Browser", async () => {
          if (!browserId) throw new Error("No browser ID to close");
          const result = await dev_close_browser({ browserId });

          if (!result.success) {
            throw new Error("Browser close failed");
          }

          return { closed: true };
        });
      }
    }

    this.printSummary();
  }

  /**
   * Screenshot functionality tests
   */
  async testScreenshots(): Promise<void> {
    console.log("🧪 Running Screenshot Tests");
    console.log("=".repeat(45));

    let browserId: string | null = null;

    try {
      // Launch browser for screenshot tests
      await this.runTest("Setup Browser for Screenshots", async () => {
        const result = await dev_launch_browser({
          browserType: "chromium",
          headless: true,
          viewport: { width: 1920, height: 1080 },
        });

        browserId = result.browserId;

        // Navigate to test page
        if (!browserId) throw new Error("No browser ID for navigation");
        await dev_navigate_to_url({
          browserId,
          url: "data:text/html,<h1 style='color: blue; font-size: 48px;'>Brooklyn Screenshot Test</h1><p style='font-size: 24px;'>File-based screenshots working!</p>",
          waitUntil: "load",
        });

        return { browserId };
      });

      // Test file-based screenshot
      await this.runTest("File-based Screenshot", async () => {
        if (!browserId) throw new Error("No browser ID available");

        const result = await dev_take_screenshot({
          browserId,
          returnFormat: "file",
          type: "png",
          fullPage: true,
          tag: "dev_test_file",
        });

        if (!result.filePath) {
          throw new Error("No file path in screenshot response");
        }

        if (!result.metadata.fileSize || result.metadata.fileSize < 1000) {
          throw new Error("Screenshot file too small");
        }

        return {
          filePath: result.filePath,
          fileSize: result.metadata.fileSize,
          dimensions: result.metadata.dimensions,
        };
      });

      // Test JPEG screenshot with quality
      await this.runTest("JPEG Screenshot with Quality", async () => {
        if (!browserId) throw new Error("No browser ID available");

        const result = await dev_take_screenshot({
          browserId,
          returnFormat: "file",
          type: "jpeg",
          quality: 80,
          fullPage: false,
          tag: "dev_test_jpeg",
        });

        if (!result.filePath?.includes(".jpeg")) {
          throw new Error("JPEG screenshot failed");
        }

        return {
          filePath: result.filePath,
          fileSize: result.metadata.fileSize,
        };
      });

      // Test thumbnail format
      await this.runTest("Base64 Thumbnail", async () => {
        if (!browserId) throw new Error("No browser ID available");

        const result = await dev_take_screenshot({
          browserId,
          returnFormat: "base64_thumbnail",
          tag: "dev_test_thumb",
        });

        // Base64 thumbnails return file path like other formats
        if (!result.filePath) {
          throw new Error("No file path in thumbnail response");
        }

        return {
          filePath: result.filePath,
          format: result.metadata.format,
        };
      });
    } finally {
      // Clean up browser
      if (browserId) {
        await this.runTest("Screenshot Test Cleanup", async () => {
          if (!browserId) throw new Error("No browser ID for cleanup");
          await dev_close_browser({ browserId });
          return { cleaned: true };
        });
      }
    }

    this.printSummary();
  }

  /**
   * Security validation tests
   */
  async testSecurity(): Promise<void> {
    console.log("🧪 Running Security Validation Tests");
    console.log("=".repeat(45));

    let browserId: string | null = null;

    try {
      // Launch browser for security tests
      await this.runTest("Setup Browser for Security Tests", async () => {
        const result = await dev_launch_browser({
          browserType: "chromium",
          headless: true,
        });

        browserId = result.browserId;
        return { browserId };
      });

      // Test allowed domain navigation
      await this.runTest("Navigate to Allowed Domain", async () => {
        if (!browserId) throw new Error("No browser ID available");

        // Using data: URL which should be allowed for testing
        const result = await dev_navigate_to_url({
          browserId,
          url: "data:text/html,<h1>Security Test - Allowed</h1>",
          waitUntil: "load",
        });

        if (!result.success) {
          throw new Error("Allowed domain navigation failed");
        }

        return { url: result.url };
      });

      // Test that screenshot audit trail is working
      await this.runTest("Screenshot Audit Trail", async () => {
        if (!browserId) throw new Error("No browser ID available");

        const result = await dev_take_screenshot({
          browserId,
          returnFormat: "file",
          tag: "security_test",
        });

        if (!result.metadata.auditId) {
          throw new Error("No audit ID in screenshot response");
        }

        if (!result.filePath.includes("security_test")) {
          throw new Error("Screenshot tag not reflected in audit trail");
        }

        return {
          auditId: result.metadata.auditId,
          hasTag: result.filePath.includes("security_test"),
        };
      });
    } finally {
      // Clean up browser
      if (browserId) {
        await this.runTest("Security Test Cleanup", async () => {
          if (!browserId) throw new Error("No browser ID for cleanup");
          await dev_close_browser({ browserId });
          return { cleaned: true };
        });
      }
    }

    this.printSummary();
  }

  /**
   * Run all test suites
   */
  async testAll(): Promise<void> {
    console.log("🧪 Running Complete Development Mode Test Suite");
    console.log("=".repeat(55));
    console.log("");

    // Run all test suites
    await this.testBasic();
    console.log("");

    await this.testBrowsers();
    console.log("");

    await this.testScreenshots();
    console.log("");

    await this.testSecurity();
    console.log("");

    // Overall summary
    const allResults = this.results;
    const totalPassed = allResults.filter((r) => r.passed).length;
    const totalTests = allResults.length;

    console.log("🎯 Overall Test Results");
    console.log("=".repeat(30));
    console.log(`Total Tests: ${totalTests}`);
    console.log(`Passed: ${totalPassed}`);
    console.log(`Failed: ${totalTests - totalPassed}`);
    console.log(`Success Rate: ${((totalPassed / totalTests) * 100).toFixed(1)}%`);

    if (totalPassed === totalTests) {
      console.log("");
      console.log("🎉 All tests passed! Development mode is working perfectly.");
      console.log("   Ready for Brooklyn feature development!");
    } else {
      console.log("");
      console.log("⚠️  Some tests failed. Check development mode setup.");
    }
  }
}

// CLI interface
async function main() {
  const testType = process.argv[2];
  const suite = new DevTestSuite();

  // Pre-flight check
  console.log("🔍 Checking development mode status...");
  checkDevMode();
  console.log("");

  switch (testType) {
    case "basic":
      await suite.testBasic();
      break;
    case "browsers":
      await suite.testBrowsers();
      break;
    case "screenshots":
      await suite.testScreenshots();
      break;
    case "security":
      await suite.testSecurity();
      break;
    case "all":
      await suite.testAll();
      break;
    case "quick": {
      // Quick test using the helper function
      const success = await testDevMode();
      if (success) {
        console.log("🚀 Quick test passed! Development mode ready.");
      } else {
        console.log("❌ Quick test failed. Check development mode setup.");
        process.exit(1);
      }
      break;
    }
    default:
      console.log("Brooklyn Development Mode Test Suite");
      console.log("");
      console.log("Usage:");
      console.log("  bun run dev:test:basic        Test basic server functionality");
      console.log("  bun run dev:test:browsers     Test browser automation");
      console.log("  bun run dev:test:screenshots  Test file-based screenshots");
      console.log("  bun run dev:test:security     Test security validation");
      console.log("  bun run dev:test:all          Run complete test suite");
      console.log("  bun scripts/dev-test.ts quick Quick functionality test");
      console.log("");
      console.log("Prerequisites:");
      console.log("  • Development mode running: bun run dev:brooklyn:start");
      console.log("  • Pipes available: bun run dev:brooklyn:test");
      break;
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error("❌ Test suite error:", error);
    process.exit(1);
  });
}
