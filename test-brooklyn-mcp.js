#!/usr/bin/env node

/**
 * Test Brooklyn MCP server through named pipes - acting like a real MCP client
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

// Get pipes info
const devDir = path.join(os.homedir(), '.brooklyn', 'dev');
const pipesFile = path.join(devDir, 'pipes.json');
const pipesInfo = JSON.parse(fs.readFileSync(pipesFile, 'utf-8'));
const { inputPipe, outputPipe } = pipesInfo;

console.log(`📋 Using pipes: ${inputPipe} -> ${outputPipe}`);

// Helper to send MCP message and get response
function sendMCPMessage(message) {
  const messageStr = JSON.stringify(message) + '\n';
  
  console.log(`📤 Sending: ${message.method}`);
  console.log(`   ${JSON.stringify(message, null, 2)}`);
  
  // Write to input pipe
  fs.writeFileSync(inputPipe, messageStr);
  
  // Read from output pipe (with timeout)
  let response = '';
  let attempts = 0;
  const maxAttempts = 10;
  
  while (attempts < maxAttempts) {
    try {
      response = fs.readFileSync(outputPipe, 'utf-8').trim();
      if (response) break;
    } catch (error) {
      // Pipe might not have data yet
    }
    attempts++;
    // Sleep 100ms
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
  }
  
  if (response) {
    console.log(`📥 Response: ${response}`);
    return JSON.parse(response);
  } else {
    console.log('❌ No response received');
    return null;
  }
}

async function testBrooklyn() {
  console.log('🧪 Testing Brooklyn MCP through named pipes...\n');
  
  try {
    // 1. Initialize
    console.log('1️⃣ Initialize MCP connection...');
    const initResponse = sendMCPMessage({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: {
          name: "brooklyn-test",
          version: "1.0.0"
        }
      }
    });
    
    if (!initResponse) {
      console.log('❌ Failed to initialize');
      return;
    }
    
    // 2. List tools
    console.log('\n2️⃣ List available tools...');
    const toolsResponse = sendMCPMessage({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list"
    });
    
    if (toolsResponse?.result?.tools) {
      console.log(`✅ Found ${toolsResponse.result.tools.length} tools`);
      const browserTools = toolsResponse.result.tools.filter(t => 
        t.name.includes('browser') || t.name.includes('navigate') || t.name.includes('screenshot')
      );
      console.log('🌐 Browser-related tools:', browserTools.map(t => t.name));
    }
    
    // 3. Launch browser
    console.log('\n3️⃣ Launch browser...');
    const launchResponse = sendMCPMessage({
      jsonrpc: "2.0",
      id: 3,
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
    
    if (launchResponse?.result?.content?.[0]) {
      const browserInfo = JSON.parse(launchResponse.result.content[0].text);
      const browserId = browserInfo.browserId;
      console.log(`✅ Browser launched: ${browserId}`);
      
      // 4. Navigate
      console.log('\n4️⃣ Navigate to example.com...');
      const navResponse = sendMCPMessage({
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: {
          name: "navigate_to_url",
          arguments: {
            browserId: browserId,
            url: "https://example.com"
          }
        }
      });
      
      if (navResponse?.result) {
        console.log('✅ Navigation successful');
        
        // 5. Take screenshot
        console.log('\n5️⃣ Take screenshot...');
        const screenshotResponse = sendMCPMessage({
          jsonrpc: "2.0",
          id: 5,
          method: "tools/call",
          params: {
            name: "take_screenshot",
            arguments: {
              browserId: browserId,
              fullPage: true,
              returnFormat: "file"
            }
          }
        });
        
        if (screenshotResponse?.result?.content?.[0]) {
          const screenshotInfo = JSON.parse(screenshotResponse.result.content[0].text);
          console.log(`📸 Screenshot saved: ${screenshotInfo.filePath}`);
          console.log(`   Size: ${screenshotInfo.fileSize} bytes`);
        }
        
        // 6. Close browser
        console.log('\n6️⃣ Close browser...');
        sendMCPMessage({
          jsonrpc: "2.0",
          id: 6,
          method: "tools/call",
          params: {
            name: "close_browser",
            arguments: {
              browserId: browserId
            }
          }
        });
        
        console.log('\n🎉 Brooklyn MCP test completed!');
      }
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testBrooklyn();