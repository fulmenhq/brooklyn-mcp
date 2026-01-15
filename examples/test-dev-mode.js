#!/usr/bin/env node
/**
 * Test Brooklyn dev mode with robust pipe handling
 */

import { createWriteStream } from 'fs';
import { spawn } from 'child_process';

const inputPipe = process.argv[2] || '/tmp/brooklyn-mcp-dev-*-in';
const outputPipe = process.argv[3] || '/tmp/brooklyn-mcp-dev-*-out';

// Resolve glob patterns
import { execSync } from 'child_process';
const resolvedInput = inputPipe.includes('*')
  ? execSync(`ls ${inputPipe} 2>/dev/null | head -1`).toString().trim()
  : inputPipe;
const resolvedOutput = outputPipe.includes('*')
  ? execSync(`ls ${outputPipe} 2>/dev/null | head -1`).toString().trim()
  : outputPipe;

if (!resolvedInput || !resolvedOutput) {
  console.error('❌ Could not find Brooklyn dev mode pipes');
  console.error('Start dev mode first: brooklyn mcp dev-start');
  process.exit(1);
}

console.log('🔌 Testing Brooklyn dev mode');
console.log(`📤 Input pipe:  ${resolvedInput}`);
console.log(`📥 Output pipe: ${resolvedOutput}`);

// Write to pipe
const writer = createWriteStream(resolvedInput);

// Read from pipe using cat (more reliable for named pipes)
const reader = spawn('cat', [resolvedOutput]);

reader.stdout.on('data', (data) => {
  const lines = data.toString().split('\n').filter(l => l.trim());
  lines.forEach(line => {
    try {
      const response = JSON.parse(line);
      console.log('\n✅ Response:', JSON.stringify(response, null, 2));
    } catch (e) {
      if (line.trim()) {
        console.log('📝 Raw:', line);
      }
    }
  });
});

reader.stderr.on('data', (data) => {
  console.error('❌ Reader error:', data.toString());
});

// Test 1: Initialize
console.log('\n🚀 Test 1: Initialize');
const initMsg = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: {
      name: "test-client",
      version: "1.0.0"
    }
  }
};
writer.write(JSON.stringify(initMsg) + '\n');

// Test 2: List tools
setTimeout(() => {
  console.log('\n🔧 Test 2: List tools');
  const toolsMsg = {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list",
    params: {}
  };
  writer.write(JSON.stringify(toolsMsg) + '\n');
}, 500);

// Test 3: Call echo tool
setTimeout(() => {
  console.log('\n📢 Test 3: Call dev_echo tool');
  const echoMsg = {
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: {
      name: "dev_echo",
      arguments: {
        message: "Hello from test client!"
      }
    }
  };
  writer.write(JSON.stringify(echoMsg) + '\n');
}, 1000);

// Clean exit after tests
setTimeout(() => {
  console.log('\n✅ Tests complete');
  writer.end();
  reader.kill();
  process.exit(0);
}, 2000);
