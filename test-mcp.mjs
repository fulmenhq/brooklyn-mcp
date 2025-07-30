import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const brooklynPath = path.resolve(__dirname, 'src/cli/brooklyn.ts');
const child = spawn('bun', [brooklynPath, 'mcp', 'start'], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: {
    ...process.env,
    BROOKLYN_LOG_LEVEL: 'debug',
    BROOKLYN_TEST_MODE: 'true',
  }
});

let stdout = '';
let stderr = '';

child.stdout.on('data', (data) => {
  stdout += data.toString();
  console.log('STDOUT:', data.toString());
});

child.stderr.on('data', (data) => {
  stderr += data.toString();
  console.log('STDERR:', data.toString());
});

child.on('error', (err) => {
  console.error('SPAWN ERROR:', err);
});

child.on('exit', (code) => {
  console.log('EXIT CODE:', code);
  console.log('FINAL STDOUT:', stdout);
  console.log('FINAL STDERR:', stderr);
});

// Wait for server to initialize then send request
setTimeout(() => {
  const request = JSON.stringify({
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: { roots: {} },
      clientInfo: { name: "claude-code", version: "1.0.61" }
    },
    jsonrpc: "2.0",
    id: 0
  });
  
  console.log('SENDING:', request);
  child.stdin.write(request + '\n');
  
  // Give time to respond
  setTimeout(() => {
    child.stdin.end();
  }, 2000);
}, 3000);
