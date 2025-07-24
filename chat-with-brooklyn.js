#!/usr/bin/env node

/**
 * Chat with Brooklyn dev mode like Claude Code would
 * Based on examples from docs/hello_brooklyn.md
 */

import fs from 'fs';
import { spawn } from 'child_process';
import path from 'path';
import os from 'os';

// Get pipes info
const devDir = path.join(os.homedir(), '.brooklyn', 'dev');
const pipesFile = path.join(devDir, 'pipes.json');
const pipesInfo = JSON.parse(fs.readFileSync(pipesFile, 'utf-8'));

console.log('🌉 Starting conversation with Brooklyn...\n');

// Connect to Brooklyn dev mode via pipes
const brooklyn = spawn('node', ['-e', `
  const fs = require('fs');
  const readline = require('readline');
  
  const input = fs.createWriteStream('${pipesInfo.inputPipe}');
  const output = fs.createReadStream('${pipesInfo.outputPipe}');
  
  // Setup readline for output
  const rl = readline.createInterface({
    input: output,
    crlfDelay: Infinity
  });
  
  rl.on('line', (line) => {
    if (line.trim()) {
      console.log('🤖 Brooklyn:', line);
    }
  });
  
  // Send messages to Brooklyn
  function ask(message) {
    console.log('👤 Me:', message);
    input.write(message + '\\n');
  }
  
  // Test conversation from hello_brooklyn.md examples
  setTimeout(() => {
    console.log('\\n📋 Testing Brooklyn automation workflow...');
    
    ask('brooklyn_status');
    
    setTimeout(() => {
      ask('Launch a chromium browser for team "dev-test"');
    }, 1000);
    
    setTimeout(() => {
      ask('Navigate to https://example.com');
    }, 3000);
    
    setTimeout(() => {
      ask('Take a full-page screenshot');
    }, 5000);
    
    setTimeout(() => {
      ask('Close the browser');
    }, 7000);
    
    setTimeout(() => {
      console.log('\\n✅ Conversation complete!');
      process.exit(0);
    }, 9000);
    
  }, 500);
`]);

brooklyn.stdout.on('data', (data) => {
  process.stdout.write(data);
});

brooklyn.stderr.on('data', (data) => {
  process.stderr.write(data);
});

brooklyn.on('close', (code) => {
  console.log(`\n🏁 Brooklyn conversation ended with code ${code}`);
});