# Brooklyn Development Mode Troubleshooting

## Quick Diagnosis

```bash
# Check if dev mode is running
brooklyn mcp dev-status

# Check for Brooklyn processes
ps aux | grep brooklyn

# Check for transport files (socket or pipes)
ls -la /tmp/brooklyn-mcp-dev-*

# View dev mode logs
ls -la ~/.brooklyn/dev/logs/
```

## Common Issues

### 1. "Already running" when trying to start

**Problem**: Another dev mode process is still active

**Solution**:

```bash
# Clean up existing process
brooklyn mcp dev-cleanup

# Then start fresh
brooklyn mcp dev-start --transport socket
```

### 2. Commands hang when writing to pipes (Pipe Transport Only)

**Problem**: Named pipes need both reader and writer active

**Solution**:

```bash
# Switch to socket transport (recommended)
brooklyn mcp dev-start --transport socket

# OR for pipe transport: Set up reader first (in background)
cat /tmp/brooklyn-mcp-dev-{uuid}-{timestamp}-out &

# Then write to input pipe
echo 'your-message' > /tmp/brooklyn-mcp-dev-{uuid}-{timestamp}-in
```

### 3. No response from MCP commands

**Problem**:

- Brooklyn process may have crashed
- Incorrect pipe paths
- MCP protocol errors

**Diagnosis**:

```bash
# Check if Brooklyn process is still running
ps aux | grep "brooklyn.*dev-mode"

# Check dev mode logs
tail -f ~/.brooklyn/dev/logs/brooklyn-mcp-dev-*.log

# Verify pipe existence and permissions
ls -la /tmp/brooklyn-mcp-dev-*
```

**Solution**:

```bash
# Restart dev mode
brooklyn mcp dev-restart
```

### 4. Permission denied on transport files

**Problem**: Transport files (socket/pipes) created with wrong permissions or by different user

**Solution**:

```bash
# Clean up and restart
brooklyn mcp dev-cleanup
brooklyn mcp dev-start --transport socket
```

### 5. Transport Selection Issues

**Problem**: Using unreliable pipe transport

**✅ Use socket transport** (recommended):

```bash
brooklyn mcp dev-start --transport socket
```

**❌ Avoid pipe transport** unless needed:

```bash
# Only use if socket transport doesn't work
brooklyn mcp dev-start --transport pipe --experimental
```

## Debugging Steps

### 1. Verify Dev Mode Status

```bash
# Should show either "not running" or process details
brooklyn mcp dev-status
```

### 2. Check Process Tree

```bash
# Look for Brooklyn dev processes
pstree | grep brooklyn
# OR
ps aux | grep "brooklyn.*dev-mode"
```

### 3. Examine Logs

```bash
# Find latest log file
ls -lt ~/.brooklyn/dev/logs/ | head -5

# View log content
cat ~/.brooklyn/dev/logs/brooklyn-mcp-dev-{latest-timestamp}.log
```

### 4. Test Transport Communication

**Socket Transport (Recommended):**

```bash
# Get socket path and test
SOCKET_PATH=$(brooklyn mcp dev-status | grep Socket | awk '{print $NF}')
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{"roots":{}},"clientInfo":{"name":"test","version":"1.0"}}}' | nc -U $SOCKET_PATH
```

**Pipe Transport (If using):**

```bash
# Get current pipe names
PIPES=$(ls /tmp/brooklyn-mcp-dev-*-out 2>/dev/null | head -1)
INPUT_PIPE=${PIPES/-out/-in}

# Test basic communication
cat $PIPES &
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{"roots":{}},"clientInfo":{"name":"test","version":"1.0"}}}' > $INPUT_PIPE
```

## Error Messages

### "Socket/Pipes not found"

- Dev mode not started or crashed
- Run `brooklyn mcp dev-start --transport socket` to create transport files

### "ESPIPE (Illegal seek)"

- Trying to seek on a pipe (not allowed)
- Use streaming reads/writes only

### "ENOENT (No such file or directory)"

- Pipe files were deleted
- Restart dev mode to recreate

### "EACCES (Permission denied)"

- Wrong user or permissions
- Restart dev mode (creates pipes with correct permissions)

## Clean Recovery

If everything is broken:

```bash
# Nuclear option - clean everything
brooklyn mcp dev-cleanup
pkill -f "brooklyn.*dev-mode"
rm -f /tmp/brooklyn-mcp-dev-*
rm -f ~/.brooklyn/dev/pipes.json

# Start fresh with socket transport
brooklyn mcp dev-start --transport socket
```

## Getting Help

1. Check the latest log file first
2. Verify pipe permissions and existence
3. Ensure using correct commands (mcp dev-\*, not scripts)
4. Try clean recovery if issues persist

For architecture details, see [architecture.md](architecture.md).
