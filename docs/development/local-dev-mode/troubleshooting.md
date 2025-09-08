# Brooklyn Development Mode Troubleshooting

This guide covers troubleshooting for both **Source Execution Mode** (`--development-only`) and **Development Server Mode** (`dev-start`).

## 🚀 Source Execution Mode Troubleshooting

### Quick Diagnosis for AI Developers

```bash
# Test if Brooklyn source execution works
bun src/cli/brooklyn.ts mcp start --development-only

# Test Claude Code integration
claude mcp remove brooklyn-dev
claude mcp add -s project brooklyn-dev -- bun src/cli/brooklyn.ts mcp start --development-only
/mcp  # In Claude Code
```

### Common Source Execution Issues

#### 1. "Authentication mode 'none' requires developmentOnly: true"

**Problem**: Trying to use `--development-only` without the flag or in production environment

**Solution**:

```bash
# ✅ Correct usage
bun src/cli/brooklyn.ts mcp start --development-only

# ❌ Wrong - missing flag
bun src/cli/brooklyn.ts mcp start
```

#### 2. "Cannot use 'none' authentication in production environment"

**Problem**: Brooklyn detected production environment indicators

**Check**:

```bash
# Check environment variables that trigger production detection
echo "NODE_ENV: $NODE_ENV"
echo "BROOKLYN_ENV: $BROOKLYN_ENV"
echo "KUBERNETES_SERVICE_HOST: $KUBERNETES_SERVICE_HOST"
echo "DOCKER_CONTAINER_ID: $DOCKER_CONTAINER_ID"
```

**Solution**:

```bash
# Unset production environment variables for development
unset NODE_ENV
unset BROOKLYN_ENV
# Then retry
bun src/cli/brooklyn.ts mcp start --development-only
```

#### 3. Native Dependency Bundling Issues (SVGO, etc.)

**Problem**: This is exactly why `--development-only` exists!

**Solution**:

```bash
# Switch from production build to source execution
claude mcp remove brooklyn
claude mcp add -s project brooklyn-dev -- bun src/cli/brooklyn.ts mcp start --development-only

# Now all native dependencies work without bundling constraints
```

#### 4. "/mcp command not working in Claude Code"

**Problem**: MCP connection issues or wrong setup

**Diagnosis**:

```bash
# Check if brooklyn-dev is configured
claude mcp list | grep brooklyn-dev

# Check if the command works directly
bun src/cli/brooklyn.ts mcp start --development-only
```

**Solution**:

```bash
# Re-setup Claude Code integration
claude mcp remove brooklyn-dev
claude mcp add -s project brooklyn-dev -- bun src/cli/brooklyn.ts mcp start --development-only

# Test connection
/mcp  # Should reconnect successfully
```

#### 5. "Changes not reflected after editing source"

**Problem**: Not reconnecting to pick up source changes

**Solution**:

```bash
# ✅ After editing source files, always reconnect
/mcp  # In Claude Code - picks up latest source changes

# ❌ Wrong - trying to restart server (not needed)
# pkill brooklyn  # Don't do this for source execution mode
```

#### 6. TypeScript Compilation Errors

**Problem**: Source has TypeScript errors preventing execution

**Solution**:

```bash
# Check TypeScript compilation
bun run typecheck

# Fix errors, then test again
bun src/cli/brooklyn.ts mcp start --development-only
```

---

## 🔧 Development Server Mode Troubleshooting

### Quick Diagnosis

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

### Common Development Server Issues

#### 1. "Already running" when trying to start

**Problem**: Another dev mode process is still active

**Solution**:

```bash
# Clean up existing process
brooklyn mcp dev-cleanup

# Then start fresh with socket transport (recommended)
brooklyn mcp dev-start --transport socket
```

#### 2. Commands hang when writing to pipes (Pipe Transport Only)

**Problem**: Named pipes need both reader and writer active (Node.js limitations)

**✅ Recommended Solution**:

```bash
# Switch to socket transport (avoids Node.js pipe issues)
brooklyn mcp dev-stop
brooklyn mcp dev-start --transport socket
```

**⚠️ Pipe Transport Workaround** (if you must use pipes):

```bash
# Set up reader first (in background)
cat /tmp/brooklyn-mcp-dev-*-out &

# Then write to input pipe
echo 'your-message' > /tmp/brooklyn-mcp-dev-*-in
```

#### 3. No response from MCP commands

**Problem**: Brooklyn process crashed or transport issues

**Diagnosis**:

```bash
# Check if Brooklyn process is still running
ps aux | grep "brooklyn.*dev-mode"

# Check dev mode logs
tail -f ~/.brooklyn/dev/logs/brooklyn-mcp-dev-*.log

# Verify transport files exist and have correct permissions
ls -la /tmp/brooklyn-mcp-dev-*
```

**Solution**:

```bash
# Restart dev mode with socket transport
brooklyn mcp dev-restart --transport socket
```

#### 4. Permission denied on transport files

**Problem**: Transport files created with wrong permissions or by different user

**Solution**:

```bash
# Clean up and restart
brooklyn mcp dev-cleanup
brooklyn mcp dev-start --transport socket
```

#### 5. Socket/Pipe transport selection issues

**✅ Always use socket transport** (recommended):

```bash
brooklyn mcp dev-start --transport socket
```

**❌ Avoid pipe transport** (Node.js limitations):

```bash
# Only use if socket transport doesn't work
brooklyn mcp dev-start --transport pipe --experimental
```

---

## 🎯 Mode-Specific Troubleshooting

### When to Use Which Mode for Debugging

#### Use Source Execution Mode When:

- ✅ **Adding new MCP tools** - Immediate testing without build cycles
- ✅ **Fixing bundling issues** - Bypass native dependency problems
- ✅ **Claude Code integration problems** - Direct stdio compatibility
- ✅ **Rapid iteration needed** - Fastest development cycle
- ✅ **Authentication issues** - Uses simple "none" mode

#### Use Development Server Mode When:

- 🔧 **MCP protocol debugging** - Need direct JSON-RPC message testing
- 🔧 **Transport layer issues** - Testing socket vs pipe communication
- 🔧 **Advanced debugging** - Persistent server with detailed logs
- 🔧 **Protocol compliance testing** - Validate before Claude Code integration

### Decision Tree for Troubleshooting

```
Having issues with Brooklyn development?
├─ Using Source Execution Mode (--development-only)?
│   ├─ Authentication errors? → Check environment variables
│   ├─ Native dependency issues? → This mode bypasses them
│   ├─ Changes not reflected? → Use /mcp command to reconnect
│   └─ Claude Code not working? → Re-setup with claude mcp add
│
└─ Using Development Server Mode (dev-start)?
    ├─ Commands hanging? → Use socket transport instead of pipes
    ├─ No response? → Check logs and restart with brooklyn mcp dev-restart
    ├─ Permission errors? → Clean up with brooklyn mcp dev-cleanup
    └─ Transport issues? → Always prefer socket over pipe transport
```

---

## 🔄 Debugging Workflows

### Workflow 1: Source Execution Mode Issues

```bash
# 1. Verify basic functionality
bun src/cli/brooklyn.ts --version
bun run typecheck

# 2. Test source execution directly
bun src/cli/brooklyn.ts mcp start --development-only

# 3. If that works, test Claude Code integration
claude mcp remove brooklyn-dev
claude mcp add -s project brooklyn-dev -- bun src/cli/brooklyn.ts mcp start --development-only

# 4. Test in Claude Code
/mcp

# 5. If issues persist, check environment
env | grep -E "NODE_ENV|BROOKLYN_ENV|KUBERNETES|DOCKER|AWS"
```

### Workflow 2: Development Server Mode Issues

```bash
# 1. Clean start
brooklyn mcp dev-cleanup
brooklyn mcp dev-start --transport socket

# 2. Verify server is running
brooklyn mcp dev-status

# 3. Test basic communication
SOCKET_PATH=$(brooklyn mcp dev-status | grep Socket | awk '{print $NF}')
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{"roots":{}},"clientInfo":{"name":"test","version":"1.0"}}}' | nc -U $SOCKET_PATH

# 4. If no response, check logs
tail -f ~/.brooklyn/dev/logs/brooklyn-mcp-dev-*.log

# 5. If logs show errors, restart
brooklyn mcp dev-restart --transport socket
```

### Workflow 3: Switching Between Modes

```bash
# If development server mode is having issues, switch to source execution:

# 1. Stop development server
brooklyn mcp dev-stop

# 2. Switch to source execution mode
claude mcp remove brooklyn
claude mcp add -s project brooklyn-dev -- bun src/cli/brooklyn.ts mcp start --development-only

# 3. Continue development with faster iteration
/mcp  # Now using source execution mode
```

---

## 📊 Error Message Reference

### Source Execution Mode Errors

| **Error Message**                                            | **Cause**                         | **Solution**                              |
| ------------------------------------------------------------ | --------------------------------- | ----------------------------------------- |
| "Authentication mode 'none' requires developmentOnly: true"  | Missing `--development-only` flag | Add the flag to your command              |
| "Cannot use 'none' authentication in production environment" | Production environment detected   | Unset production environment variables    |
| "Failed to start MCP server"                                 | TypeScript compilation errors     | Run `bun run typecheck` and fix errors    |
| "Permission denied"                                          | File system permissions           | Check directory permissions and ownership |

### Development Server Mode Errors

| **Error Message**                    | **Cause**                            | **Solution**                                    |
| ------------------------------------ | ------------------------------------ | ----------------------------------------------- |
| "Already running"                    | Previous process still active        | Run `brooklyn mcp dev-cleanup`                  |
| "Socket/Pipes not found"             | Dev mode not started or crashed      | Run `brooklyn mcp dev-start --transport socket` |
| "ESPIPE (Illegal seek)"              | Trying to seek on a pipe             | Use streaming operations only                   |
| "ENOENT (No such file or directory)" | Transport files were deleted         | Restart dev mode to recreate files              |
| "EACCES (Permission denied)"         | Wrong permissions on transport files | Restart dev mode with cleanup                   |

---

## 🧹 Clean Recovery Procedures

### Nuclear Option for Source Execution Mode

```bash
# If everything is broken with source execution:

# 1. Remove all Brooklyn MCP configs
claude mcp remove brooklyn
claude mcp remove brooklyn-dev

# 2. Check for TypeScript issues
bun run typecheck
bun run lint

# 3. Test direct execution
bun src/cli/brooklyn.ts mcp start --development-only

# 4. Re-setup Claude Code
claude mcp add -s project brooklyn-dev -- bun src/cli/brooklyn.ts mcp start --development-only

# 5. Test connection
/mcp
```

### Nuclear Option for Development Server Mode

```bash
# If everything is broken with development server:

# 1. Kill all Brooklyn processes
brooklyn mcp dev-cleanup
pkill -f "brooklyn.*dev-mode"

# 2. Remove all temporary files
rm -f /tmp/brooklyn-mcp-dev-*
rm -f ~/.brooklyn/dev/pipes.json

# 3. Start fresh with socket transport
brooklyn mcp dev-start --transport socket

# 4. Verify it's working
brooklyn mcp dev-status
```

---

## 🚨 Important Notes for AI Developers

### Source Execution Mode (Recommended for AI Development)

- ✅ **Primary choice** - Use this for almost all MCP server development
- ✅ **Bundling issues solved** - Bypasses all native dependency problems
- ✅ **Instant iteration** - Changes reflected on `/mcp` command
- ✅ **Claude Code native** - Perfect stdio integration
- ⚠️ **Development only** - Uses "none" authentication (safe for dev)

### Development Server Mode (Advanced Debugging Only)

- 🔧 **Socket transport only** - Avoid pipes due to Node.js limitations
- 🔧 **Protocol testing** - For validating JSON-RPC messages directly
- 🔧 **Not Claude Code compatible** - Different transport mechanism
- 🔧 **Go roadmap** - Pipe transport will work properly in Go implementation

### Transport Recommendations

- ✅ **Source Execution Mode** - Primary choice for AI developers
- ✅ **Socket transport** - If you need development server mode
- ⚠️ **Pipe transport** - Experimental, Node.js limitations (Go will fix this)

---

## 📞 Getting Help

### Self-Diagnosis Checklist

**For Source Execution Mode**:

1. ✅ Check TypeScript compilation (`bun run typecheck`)
2. ✅ Verify environment variables (no production indicators)
3. ✅ Test direct execution (`bun src/cli/brooklyn.ts mcp start --development-only`)
4. ✅ Check Claude Code setup (`claude mcp list`)

**For Development Server Mode**:

1. ✅ Check server status (`brooklyn mcp dev-status`)
2. ✅ Review logs (`tail -f ~/.brooklyn/dev/logs/brooklyn-mcp-dev-*.log`)
3. ✅ Verify transport files (`ls -la /tmp/brooklyn-mcp-dev-*`)
4. ✅ Use socket transport (avoid pipes)

### When All Else Fails

1. **Use Source Execution Mode** - It solves most development issues
2. **Check the latest logs** - They usually contain the real problem
3. **Clean restart** - Sometimes the simplest solution works
4. **Use socket transport** - If you need development server mode

**Remember**: Source Execution Mode with `--development-only` is designed to eliminate most common development issues. When in doubt, use it!
