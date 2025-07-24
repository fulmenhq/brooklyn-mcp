#!/usr/bin/env node

const fs = require("fs");

// Read pipe info to get the correct pipe paths
const pipeInfoPath = "/Users/davethompson/.brooklyn/dev/pipes.json";

try {
  const pipeInfo = JSON.parse(fs.readFileSync(pipeInfoPath, "utf8"));
  console.log("Found pipe info:", pipeInfo);

  const inputPipe = pipeInfo.inputPipe;
  const outputPipe = pipeInfo.outputPipe;

  console.log(`Using pipes: ${inputPipe} -> ${outputPipe}`);

  // Test MCP initialize
  const initRequest = {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {
        roots: { listChanged: true },
        sampling: {},
      },
      clientInfo: {
        name: "dev-test",
        version: "1.0.0",
      },
    },
  };

  console.log("Sending initialize request...");
  fs.writeFileSync(inputPipe, JSON.stringify(initRequest) + "\n");

  // Wait a moment and try to read response
  setTimeout(() => {
    try {
      const response = fs.readFileSync(outputPipe, "utf8");
      console.log("Response:", response);
    } catch (err) {
      console.log("No response yet or error reading:", err.message);
    }
  }, 1000);
} catch (error) {
  console.error("Error:", error.message);
}
