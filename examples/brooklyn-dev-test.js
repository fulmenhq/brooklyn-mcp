#!/usr/bin/env node
/**
 * Brooklyn Dev Mode Test Client
 * Tests MCP communication via named pipes
 */

import { spawn, execSync } from 'child_process';
import { createWriteStream } from 'fs';

// Get pipe paths from command line, environment, or auto-detect
let inputPipe = process.argv[2] || process.env.BROOKLYN_DEV_INPUT_PIPE;
let outputPipe = process.argv[3] || process.env.BROOKLYN_DEV_OUTPUT_PIPE;

// Auto-detect pipes if not provided
if (!inputPipe || !outputPipe) {
  try {
    // Find the most recent Brooklyn dev pipes
    const inPipe = execSync('ls -t /tmp/brooklyn-mcp-dev-*-in 2>/dev/null | head -1').toString().trim();
    const outPipe = execSync('ls -t /tmp/brooklyn-mcp-dev-*-out 2>/dev/null | head -1').toString().trim();
    
    if (inPipe && outPipe) {
      inputPipe = inPipe;
      outputPipe = outPipe;
      console.log('🔍 Auto-detected Brooklyn dev pipes');
    } else {
      console.error('❌ Could not find Brooklyn dev mode pipes');
      console.error('Start dev mode first: brooklyn mcp dev-start');
      console.error('Or provide pipe paths as arguments');
      process.exit(1);
    }
  } catch (e) {
    console.error('❌ Failed to auto-detect pipes:', e.message);
    process.exit(1);
  }
}

console.log('🔌 Brooklyn Dev Mode Test Client');
console.log(`📤 Writing to: ${inputPipe}`);
console.log(`📥 Reading from: ${outputPipe}`);

// Create write stream for sending messages
const writer = createWriteStream(inputPipe);

// Use cat to read responses (matches Brooklyn's approach)
const reader = spawn('cat', [outputPipe]);

let responseCount = 0;

reader.stdout.on('data', (data) => {
  const lines = data.toString().split('\n').filter(l => l.trim());
  lines.forEach(line => {
    try {
      const response = JSON.parse(line);
      responseCount++;
      console.log(`\n✅ Response ${responseCount}:`, JSON.stringify(response, null, 2));
      
      // After getting tools list, try calling a tool
      if (response.id === 2 && response.result?.tools) {
        console.log(`\n📋 Found ${response.result.tools.length} tools`);
        
        // Try calling dev_echo tool
        setTimeout(() => {
          const echoCall = {
            jsonrpc: "2.0",
            id: 3,
            method: "tools/call",
            params: {
              name: "dev_echo",
              arguments: {
                message: "Hello from Brooklyn dev mode!"
              }
            }
          };
          console.log('\n🔧 Calling dev_echo tool...');
          writer.write(JSON.stringify(echoCall) + '\n');
        }, 100);
      }
    } catch (e) {
      if (line.trim()) {
        console.log('📝 Raw output:', line);
      }
    }
  });
});

reader.on('exit', (code) => {
  console.log(`\n📤 Reader exited with code: ${code}`);
  process.exit(code || 0);
});

// Send test messages
console.log('\n🚀 Sending initialize request...');
const initMsg = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: {
      name: "brooklyn-test-client",
      version: "1.0.0"
    }
  }
};
writer.write(JSON.stringify(initMsg) + '\n');

// List tools after initialization
setTimeout(() => {
  console.log('\n📋 Requesting tool list...');
  const toolsMsg = {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list",
    params: {}
  };
  writer.write(JSON.stringify(toolsMsg) + '\n');
}, 500);

// Clean exit after all tests
setTimeout(() => {
  console.log('\n✅ Test sequence complete');
  writer.end();
  reader.kill();
  process.exit(0);
}, 3000);

// Handle interrupts
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down...');
  writer.end();
  reader.kill();
  process.exit(0);
});