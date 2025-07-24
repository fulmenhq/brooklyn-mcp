#!/usr/bin/env node

/**
 * Test Brooklyn MCP server communication - the working version
 * This demonstrates proper MCP protocol communication with dev mode
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

// Get current pipe information
const devDir = path.join(os.homedir(), '.brooklyn', 'dev');
const pipesFile = path.join(devDir, 'pipes.json');
const pipesInfo = JSON.parse(fs.readFileSync(pipesFile, 'utf-8'));
const { inputPipe, outputPipe } = pipesInfo;

console.log('🌉 Testing Brooklyn MCP Communication');
console.log(`📤 Sending to: ${inputPipe}`);
console.log(`📥 Receiving from: ${outputPipe}`);

// Open streams for concurrent communication
const inputStream = fs.createWriteStream(inputPipe);
const outputStream = fs.createReadStream(outputPipe, { encoding: 'utf-8' });

let responseBuffer = '';
let messageId = 1;

// Handle responses
outputStream.on('data', (chunk) => {
  responseBuffer += chunk;
  
  // Process complete JSON messages (line-delimited)
  let lineEnd = responseBuffer.indexOf('\n');
  while (lineEnd !== -1) {
    const line = responseBuffer.slice(0, lineEnd);
    responseBuffer = responseBuffer.slice(lineEnd + 1);
    
    if (line.trim()) {
      try {
        const response = JSON.parse(line);
        console.log(`📨 Response ${response.id}:`, JSON.stringify(response, null, 2));
      } catch (e) {
        console.log('📨 Raw response:', line);
      }
    }
    
    lineEnd = responseBuffer.indexOf('\n');
  }
});

outputStream.on('error', (err) => {
  console.error('❌ Output stream error:', err.message);
});

inputStream.on('error', (err) => {
  console.error('❌ Input stream error:', err.message);
});

// Helper to send MCP messages
function sendMessage(message) {
  const messageStr = JSON.stringify(message) + '\n';
  console.log(`📤 Sending message ${message.id}: ${message.method}`);
  inputStream.write(messageStr);
}

// Test sequence
console.log('\n🚀 Starting MCP test sequence...\n');

// 1. Initialize
setTimeout(() => {
  sendMessage({
    jsonrpc: "2.0",
    id: messageId++,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: {
        name: "brooklyn-test-client",
        version: "1.0.0"
      }
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
}, 2000);

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
}, 4000);

// 4. Navigate to URL
setTimeout(() => {
  sendMessage({
    jsonrpc: "2.0",
    id: messageId++,
    method: "tools/call",
    params: {
      name: "navigate_to_url",
      arguments: {
        browserId: "browser-1", // We'll assume this from launch response
        url: "https://example.com"
      }
    }
  });
}, 6000);

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
}, 8000);

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
}, 10000);

// Exit after test sequence
setTimeout(() => {
  console.log('\n✅ Test sequence complete!');
  inputStream.end();
  outputStream.destroy();
  process.exit(0);
}, 12000);

// Keep process alive
process.on('SIGINT', () => {
  console.log('\n👋 Interrupted, cleaning up...');
  inputStream.end();
  outputStream.destroy();
  process.exit(0);
});

console.log('⌨️  Press Ctrl+C to exit early\n');