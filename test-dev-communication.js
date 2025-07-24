#!/usr/bin/env node

/**
 * Test communication with Brooklyn MCP development mode
 * Uses named pipes to send MCP protocol messages
 */

import fs from 'fs';
import path from 'path';
import os from 'os';

// Load the pipes info from the dev manager
const devDir = path.join(os.homedir(), '.brooklyn', 'dev');
const pipesFile = path.join(devDir, 'pipes.json');

if (!fs.existsSync(pipesFile)) {
  console.error('❌ Dev mode not running - pipes.json not found');
  process.exit(1);
}

const pipesInfo = JSON.parse(fs.readFileSync(pipesFile, 'utf-8'));
console.log('📋 Found dev mode pipes:', pipesInfo);

const { inputPipe, outputPipe } = pipesInfo;

// Check if pipes exist
if (!fs.existsSync(inputPipe) || !fs.existsSync(outputPipe)) {
  console.error('❌ Named pipes not found');
  process.exit(1);
}

console.log('✅ Named pipes found, attempting communication...');

// Function to send MCP message and get response
async function sendMCPMessage(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = Date.now();
    const message = {
      jsonrpc: "2.0",
      id,
      method,
      params
    };

    console.log(`📤 Sending: ${method}`);
    
    // Write message to input pipe
    const messageStr = JSON.stringify(message) + '\n';
    fs.writeFileSync(inputPipe, messageStr);
    
    // Read response from output pipe
    setTimeout(() => {
      try {
        const response = fs.readFileSync(outputPipe, 'utf-8');
        if (response.trim()) {
          console.log(`📥 Received:`, response.trim());
          resolve(JSON.parse(response.trim()));
        } else {
          reject(new Error('No response received'));
        }
      } catch (error) {
        reject(error);
      }
    }, 1000); // Wait 1 second for response
  });
}

// Test sequence
async function testDevMode() {
  try {
    console.log('🧪 Testing Brooklyn MCP development mode communication...\n');
    
    // Step 1: Initialize MCP connection
    console.log('1️⃣ Initializing MCP connection...');
    const initResponse = await sendMCPMessage('initialize', {
      protocolVersion: "2024-11-05",
      capabilities: {
        roots: {
          listChanged: true
        }
      },
      clientInfo: {
        name: "brooklyn-dev-test",
        version: "1.0.0"
      }
    });
    
    // Step 2: List available tools
    console.log('\n2️⃣ Listing available tools...');
    const toolsResponse = await sendMCPMessage('tools/list');
    console.log(`📋 Found ${toolsResponse.result?.tools?.length || 0} tools`);
    
    // Step 3: Launch browser
    console.log('\n3️⃣ Launching browser...');
    const launchResponse = await sendMCPMessage('tools/call', {
      name: 'launch_browser',
      arguments: {
        browserType: 'chromium',
        headless: true,
        teamId: 'dev-test'
      }
    });
    
    if (launchResponse.result?.content?.[0]?.text) {
      const browserInfo = JSON.parse(launchResponse.result.content[0].text);
      const browserId = browserInfo.browserId;
      console.log(`✅ Browser launched: ${browserId}`);
      
      // Step 4: Navigate to a page
      console.log('\n4️⃣ Navigating to example.com...');
      await sendMCPMessage('tools/call', {
        name: 'navigate_to_url',
        arguments: {
          browserId,
          url: 'https://example.com'
        }
      });
      
      // Step 5: Take screenshot
      console.log('\n5️⃣ Taking screenshot...');
      const screenshotResponse = await sendMCPMessage('tools/call', {
        name: 'take_screenshot',
        arguments: {
          browserId,
          fullPage: true,
          returnFormat: 'file'
        }
      });
      
      if (screenshotResponse.result?.content?.[0]?.text) {
        const screenshotInfo = JSON.parse(screenshotResponse.result.content[0].text);
        console.log(`📸 Screenshot saved: ${screenshotInfo.filePath}`);
        console.log(`   File size: ${screenshotInfo.fileSize} bytes`);
      }
      
      // Step 6: Close browser
      console.log('\n6️⃣ Closing browser...');
      await sendMCPMessage('tools/call', {
        name: 'close_browser',
        arguments: {
          browserId
        }
      });
      
      console.log('\n🎉 Brooklyn MCP dev mode test completed successfully!');
      
    } else {
      console.error('❌ Failed to launch browser');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test
testDevMode().catch(console.error);