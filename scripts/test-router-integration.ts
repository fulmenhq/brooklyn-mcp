#!/usr/bin/env bun
/**
 * Test script for Phase 2 router integration
 * Tests the launch_browser tool through the new MCPBrowserRouter
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// Test configuration
const PIPE_IN = "/tmp/brooklyn-dev-in-1753845155062";
const PIPE_OUT = "/tmp/brooklyn-dev-out-1753845155062";

interface MCPRequest {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: any;
}

interface MCPResponse {
  jsonrpc: "2.0";
  id: number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

async function sendRequest(request: MCPRequest): Promise<MCPResponse> {
  // Write request to input pipe
  writeFileSync(PIPE_IN, JSON.stringify(request) + "\n");
  
  // Wait a bit for processing
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Read response from output pipe
  const output = readFileSync(PIPE_OUT, "utf-8");
  const lines = output.trim().split("\n");
  const lastLine = lines[lines.length - 1];
  
  try {
    return JSON.parse(lastLine);
  } catch (error) {
    console.error("Failed to parse response:", lastLine);
    throw error;
  }
}

async function testScenario1(): Promise<void> {
  console.log("\n🧪 Test Scenario 1: Basic Router Integration");
  console.log("============================================");
  
  // Test 1: Launch browser through router
  console.log("\n📌 Test 1: Launch browser with default settings");
  const launchRequest: MCPRequest = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name: "launch_browser",
      arguments: {
        browserType: "chromium",
        headless: true
      }
    }
  };
  
  console.log("Request:", JSON.stringify(launchRequest, null, 2));
  const launchResponse = await sendRequest(launchRequest);
  console.log("Response:", JSON.stringify(launchResponse, null, 2));
  
  if (launchResponse.error) {
    console.error("❌ Failed to launch browser:", launchResponse.error.message);
    return;
  }
  
  // Extract browserId from response
  const result = JSON.parse(launchResponse.result?.content?.[0]?.text || "{}");
  const browserId = result.browserId;
  
  if (!browserId) {
    console.error("❌ No browserId returned");
    return;
  }
  
  console.log("✅ Browser launched successfully!");
  console.log("   Browser ID:", browserId);
  console.log("   Status:", result.status);
  console.log("   Type:", result.browserType);
  
  // Test 2: Use the browser (navigate - should use old path)
  console.log("\n📌 Test 2: Navigate with browser (old path)");
  const navigateRequest: MCPRequest = {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: {
      name: "navigate_to_url",
      arguments: {
        browserId: browserId,
        url: "https://example.com"
      }
    }
  };
  
  console.log("Request:", JSON.stringify(navigateRequest, null, 2));
  const navigateResponse = await sendRequest(navigateRequest);
  console.log("Response:", JSON.stringify(navigateResponse, null, 2));
  
  if (navigateResponse.error) {
    console.error("❌ Failed to navigate:", navigateResponse.error.message);
  } else {
    console.log("✅ Navigation successful!");
  }
  
  // Test 3: Close browser
  console.log("\n📌 Test 3: Close browser");
  const closeRequest: MCPRequest = {
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: {
      name: "close_browser",
      arguments: {
        browserId: browserId
      }
    }
  };
  
  console.log("Request:", JSON.stringify(closeRequest, null, 2));
  const closeResponse = await sendRequest(closeRequest);
  console.log("Response:", JSON.stringify(closeResponse, null, 2));
  
  if (closeResponse.error) {
    console.error("❌ Failed to close browser:", closeResponse.error.message);
  } else {
    console.log("✅ Browser closed successfully!");
  }
}

async function testScenario2(): Promise<void> {
  console.log("\n🧪 Test Scenario 2: Team Isolation");
  console.log("===================================");
  
  // This would require modifying the context to include team information
  // For now, we'll just verify that browsers are tracked
  
  console.log("📌 Launching two browsers to test session tracking");
  
  const browser1 = await sendRequest({
    jsonrpc: "2.0",
    id: 10,
    method: "tools/call",
    params: {
      name: "launch_browser",
      arguments: { browserType: "chromium", headless: true }
    }
  });
  
  const browser2 = await sendRequest({
    jsonrpc: "2.0",
    id: 11,
    method: "tools/call",
    params: {
      name: "launch_browser",
      arguments: { browserType: "firefox", headless: true }
    }
  });
  
  // List active browsers
  const listResponse = await sendRequest({
    jsonrpc: "2.0",
    id: 12,
    method: "tools/call",
    params: {
      name: "list_active_browsers",
      arguments: {}
    }
  });
  
  console.log("Active browsers:", JSON.stringify(listResponse, null, 2));
  
  // Clean up
  const result1 = JSON.parse(browser1.result?.content?.[0]?.text || "{}");
  const result2 = JSON.parse(browser2.result?.content?.[0]?.text || "{}");
  
  if (result1.browserId) {
    await sendRequest({
      jsonrpc: "2.0",
      id: 13,
      method: "tools/call",
      params: {
        name: "close_browser",
        arguments: { browserId: result1.browserId }
      }
    });
  }
  
  if (result2.browserId) {
    await sendRequest({
      jsonrpc: "2.0",
      id: 14,
      method: "tools/call",
      params: {
        name: "close_browser",
        arguments: { browserId: result2.browserId }
      }
    });
  }
}

async function testScenario3(): Promise<void> {
  console.log("\n🧪 Test Scenario 3: Error Handling");
  console.log("==================================");
  
  // Test 1: Invalid browser ID
  console.log("\n📌 Test 1: Navigate with invalid browser ID");
  const invalidNavigate: MCPRequest = {
    jsonrpc: "2.0",
    id: 20,
    method: "tools/call",
    params: {
      name: "navigate_to_url",
      arguments: {
        browserId: "non-existent-browser-id",
        url: "https://example.com"
      }
    }
  };
  
  const errorResponse = await sendRequest(invalidNavigate);
  console.log("Error response:", JSON.stringify(errorResponse, null, 2));
  
  if (errorResponse.result?.content?.[0]?.text?.includes("Error:")) {
    console.log("✅ Error handling working correctly");
  } else {
    console.log("❌ Expected error message not found");
  }
}

async function main() {
  console.log("🌉 Brooklyn Router Integration Test Suite");
  console.log("========================================");
  console.log("Testing launch_browser with MCPBrowserRouter");
  
  try {
    // Run test scenarios
    await testScenario1();
    // await testScenario2();
    // await testScenario3();
    
    console.log("\n✅ Test suite completed!");
  } catch (error) {
    console.error("\n❌ Test suite failed:", error);
    process.exit(1);
  }
}

// Run tests
main().catch(console.error);