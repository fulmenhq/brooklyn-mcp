#!/usr/bin/env node
/**
 * Test Brooklyn browser automation through dev mode
 * This demonstrates the complete workflow: launch → navigate → screenshot → close
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { createWriteStream } from 'fs';

// Get current pipes
const devDir = path.join(os.homedir(), '.brooklyn', 'dev');
const pipesFile = path.join(devDir, 'pipes.json');
const pipesInfo = JSON.parse(fs.readFileSync(pipesFile, 'utf-8'));
const { inputPipe, outputPipe } = pipesInfo;

console.log('🌉 Brooklyn Browser Automation Test');
console.log(`📤 Input:  ${inputPipe}`);
console.log(`📥 Output: ${outputPipe}`);

// Setup communication
const writer = createWriteStream(inputPipe);
const reader = spawn('cat', [outputPipe]);

let messageId = 1;
let browserId = null;

// Handle responses
reader.stdout.on('data', (data) => {
  const lines = data.toString().split('\n').filter(l => l.trim());
  lines.forEach(line => {
    try {
      const response = JSON.parse(line);
      console.log(`\n📨 Response ${response.id}:`, JSON.stringify(response, null, 2));
      
      // Extract browser ID from launch response
      if (response.id === 3 && response.result?.content?.[0]) {
        const browserInfo = JSON.parse(response.result.content[0].text);
        browserId = browserInfo.browserId;
        console.log(`🌐 Browser launched: ${browserId}`);
      }
      
      // Log screenshot success
      if (response.id === 5 && response.result?.content?.[0]) {
        const screenshotInfo = JSON.parse(response.result.content[0].text);
        console.log(`📸 Screenshot saved: ${screenshotInfo.filePath}`);
      }
    } catch (e) {
      if (line.trim()) console.log('📝 Raw:', line);
    }
  });
});

function sendMessage(message) {
  console.log(`\n📤 Sending: ${message.method} (ID: ${message.id})`);
  writer.write(JSON.stringify(message) + '\n');
}

console.log('\n🚀 Starting browser automation sequence...\n');

// 1. Initialize
setTimeout(() => {
  sendMessage({
    jsonrpc: "2.0",
    id: messageId++,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "browser-test", version: "1.0.0" }
    }
  });
}, 500);

// 2. List tools
setTimeout(() => {
  sendMessage({
    jsonrpc: "2.0",
    id: messageId++,
    method: "tools/list"
  });
}, 1500);

// 3. Launch browser
setTimeout(() => {
  sendMessage({
    jsonrpc: "2.0",
    id: messageId++,
    method: "tools/call",
    params: {
      name: "launch_browser",
      arguments: {
        browserType: "chromium",
        headless: true,
        teamId: "dev-test"
      }
    }
  });
}, 3000);

// 4. Navigate to example.com
setTimeout(() => {
  sendMessage({
    jsonrpc: "2.0",
    id: messageId++,
    method: "tools/call",
    params: {
      name: "navigate_to_url",
      arguments: {
        browserId: "browser-1", // Standard first browser ID
        url: "https://example.com"
      }
    }
  });
}, 5000);

// 5. Take screenshot
setTimeout(() => {
  sendMessage({
    jsonrpc: "2.0",
    id: messageId++,
    method: "tools/call",
    params: {
      name: "take_screenshot",
      arguments: {
        browserId: "browser-1",
        fullPage: true,
        returnFormat: "file"
      }
    }
  });
}, 7000);

// 6. Close browser
setTimeout(() => {
  sendMessage({
    jsonrpc: "2.0",
    id: messageId++,
    method: "tools/call",
    params: {
      name: "close_browser",
      arguments: {
        browserId: "browser-1"
      }
    }
  });
}, 9000);

// 7. Exit
setTimeout(() => {
  console.log('\n🎉 Browser automation test complete!');
  writer.end();
  reader.kill();
  process.exit(0);
}, 11000);

// Handle interrupts
process.on('SIGINT', () => {
  console.log('\n👋 Cleaning up...');
  writer.end();
  reader.kill();
  process.exit(0);
});

console.log('⌨️  Press Ctrl+C to exit early');