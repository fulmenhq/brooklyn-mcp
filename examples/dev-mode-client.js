#!/usr/bin/env node
/**
 * Non-blocking client for testing Brooklyn MCP dev mode
 * 
 * This demonstrates the correct way to communicate with Brooklyn's
 * development mode using named pipes without blocking.
 * 
 * Uses subprocess approach to avoid Node.js stream issues with named pipes.
 */

import { createWriteStream } from 'fs';
import { spawn } from 'child_process';

// Get pipe paths from command line or environment
const inputPipe = process.argv[2] || process.env.BROOKLYN_DEV_OUTPUT_PIPE;
const outputPipe = process.argv[3] || process.env.BROOKLYN_DEV_INPUT_PIPE;

if (!inputPipe || !outputPipe) {
  console.error('Usage: node dev-mode-client.js <input-pipe> <output-pipe>');
  console.error('Or set BROOKLYN_DEV_OUTPUT_PIPE and BROOKLYN_DEV_INPUT_PIPE');
  process.exit(1);
}

console.log('🔌 Connecting to Brooklyn dev mode...');
console.log(`📥 Reading from: ${inputPipe}`);
console.log(`📤 Writing to: ${outputPipe}`);

// Write to pipe using standard stream
const outputStream = createWriteStream(outputPipe);

// Read from pipe using cat subprocess (avoids Node.js stream issues)
const reader = spawn('cat', [inputPipe]);

// Handle responses from Brooklyn
reader.stdout.on('data', (data) => {
  const lines = data.toString().split('\n').filter(l => l.trim());
  lines.forEach(line => {
    try {
      const response = JSON.parse(line);
      console.log('\n📨 Response:', JSON.stringify(response, null, 2));
    } catch (e) {
      if (line.trim()) {
        console.error('❌ Invalid JSON response:', line);
      }
    }
  });
});

reader.stderr.on('data', (data) => {
  console.error('❌ Reader error:', data.toString());
});

reader.on('error', (err) => {
  console.error('❌ Failed to start reader process:', err.message);
  process.exit(1);
});

// Handle write errors
outputStream.on('error', (err) => {
  console.error('❌ Write error:', err.message);
  process.exit(1);
});

// Send initialize message
console.log('\n🚀 Sending initialize request...');
const initRequest = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: {
      name: "brooklyn-dev-client",
      version: "1.0.0"
    }
  }
};

outputStream.write(JSON.stringify(initRequest) + '\n');

// After initialization, list available tools
setTimeout(() => {
  console.log('\n🔧 Requesting tool list...');
  const toolsRequest = {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list",
    params: {}
  };
  outputStream.write(JSON.stringify(toolsRequest) + '\n');
}, 1000);

// Example tool call after 2 seconds
setTimeout(() => {
  console.log('\n🌐 Calling dev_echo tool...');
  const toolCall = {
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: {
      name: "dev_echo",
      arguments: {
        message: "Hello from non-blocking client!"
      }
    }
  };
  outputStream.write(JSON.stringify(toolCall) + '\n');
}, 2000);

// Keep process alive but allow clean shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Closing connection...');
  outputStream.end();
  reader.kill();
  process.exit(0);
});

console.log('\n⌨️  Press Ctrl+C to exit\n');