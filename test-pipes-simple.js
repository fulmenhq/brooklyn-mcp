#!/usr/bin/env node

/**
 * Simple test of Brooklyn dev mode communication
 * This script demonstrates the correct way to communicate with named pipes
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

async function testPipesCommunication() {
  // Get current pipe information
  const devDir = path.join(os.homedir(), '.brooklyn', 'dev');
  const pipesFile = path.join(devDir, 'pipes.json');
  
  if (!fs.existsSync(pipesFile)) {
    console.log('❌ No dev mode running. Start with: brooklyn mcp dev-start');
    return;
  }
  
  const pipesInfo = JSON.parse(fs.readFileSync(pipesFile, 'utf-8'));
  const { inputPipe, outputPipe } = pipesInfo;
  
  console.log(`🔌 Connecting to Brooklyn dev mode pipes:`);
  console.log(`📤 Input:  ${inputPipe}`);
  console.log(`📥 Output: ${outputPipe}`);
  
  // Test 1: Initialize connection
  console.log('\n🚀 Test 1: Initialize MCP connection');
  
  const initMessage = {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: {
        name: "pipe-test-client",
        version: "1.0.0"
      }
    }
  };
  
  try {
    // Write to Brooklyn's input pipe (our output)
    fs.writeFileSync(inputPipe, JSON.stringify(initMessage) + '\n');
    console.log('✅ Sent initialize message');
    
    // Give Brooklyn time to process and respond
    await sleep(1000);
    
    // Read response from Brooklyn's output pipe (our input)
    const response = fs.readFileSync(outputPipe, 'utf-8').trim();
    if (response) {
      console.log('✅ Received response:', JSON.parse(response));
    } else {
      console.log('❌ No response received');
    }
    
  } catch (error) {
    console.error('❌ Communication error:', error.message);
    console.log('\nNote: Named pipes can be tricky. The server must be actively reading/writing.');
    console.log('If you see EPIPE or blocking, it means the other end of the pipe is not ready.');
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

testPipesCommunication().catch(console.error);