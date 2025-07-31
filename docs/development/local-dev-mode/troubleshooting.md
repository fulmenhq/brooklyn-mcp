# Brooklyn Development Mode Troubleshooting

## Quick Diagnosis

```bash
# Check if dev mode is running
bun run src/cli/brooklyn.ts mcp dev-status

# Check for Brooklyn processes
ps aux | grep brooklyn

# Check for named pipes
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
bun run src/cli/brooklyn.ts mcp dev-cleanup

# Then start fresh
bun run src/cli/brooklyn.ts mcp dev-start
```

### 2. Commands hang when writing to pipes

**Problem**: Named pipes need both reader and writer active

**Solution**:

```bash
# Always set up reader first (in background)
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
bun run src/cli/brooklyn.ts mcp dev-restart
```

### 4. Permission denied on pipes

**Problem**: Pipes created with wrong permissions or by different user

**Solution**:

```bash
# Clean up and restart
bun run src/cli/brooklyn.ts mcp dev-cleanup
bun run src/cli/brooklyn.ts mcp dev-start
```

### 5. Scripts vs Core Commands Confusion

**Problem**: Using old script commands that are deprecated

**❌ Don't use** (deprecated):

```bash
bun run dev:start
bun run dev:status
bun run dev:stop
```

**✅ Use instead**:

```bash
bun run src/cli/brooklyn.ts mcp dev-start
bun run src/cli/brooklyn.ts mcp dev-status
bun run src/cli/brooklyn.ts mcp dev-stop
```

## Debugging Steps

### 1. Verify Dev Mode Status

```bash
# Should show either "not running" or process details
bun run src/cli/brooklyn.ts mcp dev-status
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

### 4. Test Pipe Communication

```bash
# Get current pipe names
PIPES=$(ls /tmp/brooklyn-mcp-dev-*-out 2>/dev/null | head -1)
INPUT_PIPE=${PIPES/-out/-in}

# Test basic communication
cat $PIPES &
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{"roots":{}},"clientInfo":{"name":"test","version":"1.0"}}}' > $INPUT_PIPE
```

## Error Messages

### "Pipes not found"

- Dev mode not started or crashed
- Run `mcp dev-start` to create pipes

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
bun run src/cli/brooklyn.ts mcp dev-cleanup
pkill -f "brooklyn.*dev-mode"
rm -f /tmp/brooklyn-mcp-dev-*
rm -f ~/.brooklyn/dev/pipes.json

# Start fresh
bun run src/cli/brooklyn.ts mcp dev-start
```

## Getting Help

1. Check the latest log file first
2. Verify pipe permissions and existence
3. Ensure using correct commands (mcp dev-\*, not scripts)
4. Try clean recovery if issues persist

For architecture details, see [architecture.md](architecture.md).
