# Brooklyn MCP Local Development Standard Operating Procedures

## MCP Version Update Procedure

**Critical Discovery**: Claude Code MCP connections require **complete session restart** to recognize binary updates, not just MCP server restart.

### Complete Update Procedure

When updating Brooklyn MCP binary versions (e.g., 1.1.3 → 1.1.4):

#### Step 1: Update and Build Binary

```bash
# In Brooklyn project directory
bun run version:bump:patch    # Updates VERSION file
bun run build                 # Build with new version
bun run install              # Install updated binary globally
brooklyn --version           # Verify version updated
```

#### Step 2: MCP Configuration Cleanup

```bash
# Remove existing MCP configuration
claude mcp remove brooklyn

# CRITICAL: Kill any running Brooklyn processes
ps aux | grep brooklyn
kill -9 [pid]  # Kill all brooklyn processes

# Note: MCP server removal does NOT automatically kill running processes
```

#### Step 3: Re-add MCP Configuration

```bash
# Re-add Brooklyn to Claude MCP
claude mcp add -s user brooklyn brooklyn mcp start

# Verify configuration
claude mcp list
claude mcp get brooklyn
```

#### Step 4: **CRITICAL - Complete Claude Session Restart**

```bash
# Close ALL Claude Code sessions on the machine
# This includes:
# - All active claude sessions in terminals
# - All background Claude processes
# - Any IDE integrations using Claude

# Then restart Claude sessions
# Only after complete restart will new binary version be recognized
```

### Why Complete Restart is Required

**Technical Root Cause**: Claude Code appears to cache MCP binary references at session initialization. Simply restarting the MCP server or removing/re-adding configurations is insufficient.

**Impact**:

- **Development Friction**: Must halt work on all other projects using Claude
- **Multi-Project Workflow**: Affects enterprise client work, other fulmen projects
- **Team Coordination**: Version updates become expensive operations

### Verification Commands

After complete restart, verify version update worked:

```bash
# Test MCP connection and version
claude mcp list

# In new Claude session, test Brooklyn status
# Should show new version in MCP response
```

### Troubleshooting

#### Version Still Shows Old Value

- **Cause**: Incomplete session restart
- **Solution**: Ensure ALL Claude processes terminated before restart
- **Check**: `ps aux | grep claude` should show no processes

#### MCP Connection Failures

- **Cause**: Brooklyn processes not properly killed
- **Solution**: `kill -9` all brooklyn processes before re-adding MCP config
- **Check**: `ps aux | grep brooklyn` should show no processes

#### Binary Not Found

- **Cause**: `bun run install` didn't complete successfully
- **Solution**: Re-run install, check global binary path
- **Check**: `which brooklyn` and `brooklyn --version`

### Development Workflow Impact

**Multi-Project Development**:

- Plan MCP version updates during dedicated time blocks
- Coordinate with other project work (Echo team enterprise client, etc.)
- Consider batching multiple Brooklyn changes before version update

**Team Communication**:

- Notify team members of planned version update sessions
- Document version-specific features for rollback planning
- Update team on completion of version validation

### Future Improvements

**Potential Solutions to Investigate**:

1. Claude MCP cache invalidation mechanisms
2. Hot-reload capabilities for MCP binaries
3. Version-aware MCP configuration strategies
4. Development vs production MCP deployment patterns

**Enterprise Considerations**:

- Production deployments likely use different update procedures
- Consider blue/green deployment patterns for MCP servers
- Team-specific versioning strategies for isolated development

---

**Last Updated**: July 21, 2025  
**Version Tested**: Brooklyn v1.1.4  
**Validation Status**: ✅ Complete restart procedure confirmed working
