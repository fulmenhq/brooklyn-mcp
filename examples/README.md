# Brooklyn MCP Dev Mode Examples

This directory contains example clients for testing Brooklyn's MCP development mode using named pipes (FIFOs).

## The FIFO Transport Solution

Brooklyn uses a special transport layer for development mode that correctly handles named pipes:

1. **Reading**: Uses `spawn('cat', [pipe])` subprocess to avoid Node.js stream issues
2. **Writing**: Uses standard `createWriteStream()` which works fine for writing

### Why This Approach?

Node.js `createReadStream()` fails with named pipes, resulting in ESPIPE errors. The subprocess approach using `cat` is the reliable solution that Brooklyn itself uses internally.

## Available Examples

### test-dev-mode.js

Quick test script with auto-detection of Brooklyn dev pipes:

```bash
# Auto-detect pipes
node test-dev-mode.js

# Or specify pipes explicitly
node test-dev-mode.js /tmp/brooklyn-mcp-dev-*-in /tmp/brooklyn-mcp-dev-*-out
```

### dev-mode-client.js

Full-featured client demonstrating non-blocking communication:

```bash
# With environment variables
export BROOKLYN_DEV_INPUT_PIPE=/tmp/brooklyn-mcp-dev-*-out
export BROOKLYN_DEV_OUTPUT_PIPE=/tmp/brooklyn-mcp-dev-*-in
node dev-mode-client.js

# Or with arguments
node dev-mode-client.js /tmp/brooklyn-mcp-dev-*-out /tmp/brooklyn-mcp-dev-*-in
```

### brooklyn-dev-test.js

Comprehensive test client with auto-detection and tool calling:

```bash
# Auto-detects the most recent Brooklyn dev pipes
node brooklyn-dev-test.js

# Or specify pipes
node brooklyn-dev-test.js /tmp/brooklyn-mcp-dev-*-in /tmp/brooklyn-mcp-dev-*-out
```

## Usage Workflow

1. **Start Brooklyn dev mode**:

   ```bash
   brooklyn mcp dev-start
   # or
   bun run dev:brooklyn:start
   ```

2. **Check status and get pipe paths**:

   ```bash
   brooklyn mcp dev-status
   ```

3. **Run example client**:

   ```bash
   node examples/test-dev-mode.js
   ```

4. **Monitor logs** (optional):
   ```bash
   tail -f ~/.brooklyn/dev/logs/brooklyn-mcp-dev-*.log
   ```

## Key Implementation Details

### Correct Pattern (Used in All Examples)

```javascript
// Write using streams (works fine)
const writer = createWriteStream(inputPipe);
writer.write(JSON.stringify(message) + "\\n");

// Read using cat subprocess (avoids ESPIPE errors)
const reader = spawn("cat", [outputPipe]);
reader.stdout.on("data", data => {
  // Process responses
});
```

### Common Mistakes to Avoid

```javascript
// ❌ WRONG - This fails with ESPIPE errors
const inputStream = createReadStream(inputPipe);

// ❌ WRONG - This can hang or fail
const rl = readline.createInterface({ input: inputStream });
```

## Debugging Tips

1. **Check Brooklyn is running**:

   ```bash
   ps aux | grep brooklyn
   ```

2. **Verify pipes exist**:

   ```bash
   ls -la /tmp/brooklyn-mcp-dev-*
   ```

3. **Test pipes manually**:

   ```bash
   # Send a message
   echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' > /tmp/brooklyn-mcp-dev-*-in

   # Read responses
   cat /tmp/brooklyn-mcp-dev-*-out
   ```

4. **Watch Brooklyn logs**:
   ```bash
   tail -f ~/.brooklyn/dev/logs/brooklyn-mcp-dev-*.log
   ```

## MCP Protocol Testing

The examples demonstrate standard MCP protocol communication:

1. **Initialize**: Establish connection with protocol version
2. **tools/list**: Discover available Brooklyn tools
3. **tools/call**: Execute specific tools (e.g., dev_echo)

Each example shows proper JSON-RPC 2.0 message formatting and response handling.
