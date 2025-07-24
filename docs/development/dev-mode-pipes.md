# Brooklyn Dev Mode: Understanding Named Pipes

## The Blocking Problem

Named pipes (FIFOs) in Unix have inherent blocking behavior:

- **Writing blocks** until a reader connects
- **Reading blocks** until data is available
- This is standard Unix behavior, not Brooklyn-specific

## The Node.js Stream Problem

### ❌ The Initial Approach That Failed

```javascript
// This looks correct but fails with ESPIPE errors!
const inputStream = createReadStream(inputPipe); // ❌ ESPIPE: invalid seek
const outputStream = createWriteStream(outputPipe);
```

**Why it fails**: Node.js streams attempt seek operations that named pipes don't support.

### ✅ The Working Solution

Brooklyn uses a hybrid approach that works reliably with named pipes:

1. **Reading**: Use `spawn('cat', [inputPipe])` subprocess
2. **Writing**: Use `fs.openSync()` with direct file descriptors

```javascript
// Brooklyn's FIFO transport approach
const catProcess = spawn("cat", [inputPipe]);
const outputFd = fs.openSync(outputPipe, fs.constants.O_WRONLY);

// Read via subprocess stdout
catProcess.stdout.on("data", chunk => {
  // Process incoming messages
});

// Write via file descriptor
fs.writeSync(outputFd, JSON.stringify(response) + "\n");
```

## Brooklyn's Transport Architecture

### MCPFifoTransport (src/transports/mcp-fifo-transport.ts)

The working solution that handles named pipes correctly:

```typescript
// Start cat process to read from input pipe
this.catProcess = spawn("cat", [inputPipe]);

// Open output pipe for writing (with timing delay)
setTimeout(() => {
  this.outputFd = fs.openSync(outputPipe, fs.constants.O_WRONLY);
}, 100); // Small delay ensures pipes are ready
```

### Transport Factory Pattern

Brooklyn automatically selects the right transport:

```typescript
if (mcpConfig.options?.inputPipe && mcpConfig.options?.outputPipe) {
  return new MCPFifoTransport(mcpConfig); // Dev mode
}
return new MCPStdioTransport(mcpConfig); // Production
```

## Architecture Differences: Dev vs Production

### Production Mode (stdin/stdout)

- **Process Lifecycle**: Managed by Claude Code
- **I/O**: Direct stdin/stdout connection
- **Cleanup**: Automatic when Claude Code disconnects
- **Blocking**: Natural - process waits for input

### Development Mode (named pipes)

- **Process Lifecycle**: Independent background process
- **I/O**: Via named pipes (FIFOs)
- **Cleanup**: Manual management required
- **Blocking**: Must use non-blocking I/O patterns

## Working Example: Client Implementation

See [`examples/brooklyn-dev-test.js`](../../examples/brooklyn-dev-test.js) for a working client:

```javascript
// Write using streams (works fine)
const writer = createWriteStream(inputPipe);
writer.write(JSON.stringify(message) + "\n");

// Read using cat subprocess (matches Brooklyn's approach)
const reader = spawn("cat", [outputPipe]);
reader.stdout.on("data", data => {
  // Process responses
});
```

```bash
# Start Brooklyn dev mode
brooklyn mcp dev-start

# Test with the working client
node examples/brooklyn-dev-test.js
```

## Key Takeaways

1. **Node.js createReadStream doesn't work** with named pipes (ESPIPE errors)
2. **Use subprocess (`cat`) for reading** from named pipes
3. **Direct file descriptors work** for writing to named pipes
4. **Production uses stdin/stdout** (no changes needed)
5. **Dev mode uses FIFO transport** automatically via factory pattern

## Common Issues and Solutions

### ESPIPE: invalid seek

- **Cause**: Using createReadStream on named pipes
- **Solution**: Use subprocess approach (cat command)

### ENXIO: no such device or address

- **Cause**: Opening output pipe with O_NONBLOCK when no reader connected
- **Solution**: Remove O_NONBLOCK flag or add timing delay

### Hanging client

- **Cause**: Using synchronous fs operations on pipes
- **Solution**: Use async streams for writing, subprocess for reading

## Debugging Tips

```bash
# Check Brooklyn process and pipes
brooklyn mcp dev-status

# Monitor pipe activity
ls -la /tmp/brooklyn-mcp-dev-*

# Watch Brooklyn logs
tail -f ~/.brooklyn/dev/logs/brooklyn-mcp-dev-*.log

# Test pipes manually
echo '{"jsonrpc":"2.0","id":1,"method":"initialize"}' > /tmp/brooklyn-mcp-dev-*-in
cat /tmp/brooklyn-mcp-dev-*-out
```
