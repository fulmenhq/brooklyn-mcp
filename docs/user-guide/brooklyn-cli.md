# Brooklyn CLI - Command Line Interface

The Brooklyn CLI (`brooklyn-server`) is a powerful command-line tool for managing your Brooklyn MCP server from anywhere on your system. It provides comprehensive server management capabilities and can be installed locally to a project or globally for system-wide use.

## Installation

### Project-Local Installation

Install the CLI for a specific Brooklyn project:

```bash
# From Brooklyn repository root
bun run install
```

This creates a CLI that manages the specific Brooklyn instance where it was installed.

### User-Wide Installation

Use the bootstrap script for system-wide installation:

```bash
# Interactive installation with Claude Code setup
bun run bootstrap

# Direct install command
bun run bootstrap:install
```

This installs Brooklyn globally and configures Claude Code integration automatically.

## Installation Behavior

### Current Install Behavior (`bun run install`)

**⚠️ Important**: The current installation process has specific behavior that users should understand:

#### Version Handling

- **Always overwrites**: No version comparison or confirmation prompts
- **No `--force` option**: Currently not supported (planned enhancement)
- **Build-first approach**: Always runs `bun run build` before installation
- **Simple replacement**: Uses direct file copy to `~/.local/bin/brooklyn`

#### What Happens in Different Scenarios

| Scenario                     | Current Behavior              | Notes                              |
| ---------------------------- | ----------------------------- | ---------------------------------- |
| **Same version installed**   | ✅ Overwrites without warning | Replaces with freshly built binary |
| **Newer version installed**  | ✅ Overwrites without warning | ⚠️ **Silently downgrades**         |
| **Older version installed**  | ✅ Overwrites without warning | ✅ **Silently upgrades**           |
| **No existing installation** | ✅ Creates new installation   | Standard first-time install        |

#### Current Install Flow

```bash
bun run install
├── bun run build              # Always rebuilds from source
├── scripts/install-cli.ts
    ├── Check dist/brooklyn exists
    ├── Create ~/.local/bin/ if needed
    ├── copyFileSync() - overwrites existing
    ├── chmod +x
    └── Test with --version
```

### Missing Features (Future Enhancements)

- [ ] `--force` flag support for explicit overwrites
- [ ] Version comparison logic with confirmation prompts
- [ ] Backup of existing installation before overwrite
- [ ] Skip-if-same-version option
- [ ] Interactive confirmation for version downgrades

### Recommendations

**For Development Teams**:

```bash
# Check current version before installing
~/.local/bin/brooklyn --version
bun run version:get

# Verify versions match after install
bun run install
brooklyn --version  # Should match project version
```

**For Version Management**:

```bash
# Always verify version consistency
bun run check:versions

# Use proper version bumping
bun run version:bump:patch    # Don't edit VERSION manually
bun run install              # Then install updated version
```

**For Safety**:

```bash
# Backup existing CLI before major updates
cp ~/.local/bin/brooklyn ~/.local/bin/brooklyn.backup

# Install new version
bun run install

# Test functionality
brooklyn status
```

## Core Commands

### Server Management

```bash
# Start the Brooklyn server
brooklyn-server start

# Stop the Brooklyn server
brooklyn-server stop

# Restart the Brooklyn server
brooklyn-server restart

# Check server status
brooklyn-server status
```

### Monitoring & Logs

```bash
# View server logs (continuous)
brooklyn-server logs

# View recent logs only
brooklyn-server logs --recent

# Clean up server resources
brooklyn-server cleanup
```

### Information & Help

```bash
# Show Brooklyn installation information
brooklyn-server info

# Get comprehensive help
brooklyn-server --help

# Get help for specific commands
brooklyn-server logs --help
```

## CLI Features

### Self-Aware Installation

The Brooklyn CLI knows exactly where it was installed from:

```bash
$ brooklyn-server info

🌉 Brooklyn MCP Server CLI

Version: 1.0.1
Installation: /Users/you/projects/brooklyn
Type: Project-specific

Available Commands:
  start     Start the Brooklyn server
  stop      Stop the Brooklyn server
  restart   Restart the Brooklyn server
  status    Show server status
  logs      Show server logs (use --recent for recent only)
  cleanup   Clean up server resources
  info      Show this information
```

### Path Independence

Once installed, the CLI works from any directory:

```bash
# Works from anywhere on your system
cd ~/Documents
brooklyn-server status

cd ~/projects/other-project
brooklyn-server logs --recent

# No need to navigate to Brooklyn directory
```

### Error Handling

The CLI validates Brooklyn installation and provides helpful error messages:

```bash
$ brooklyn-server status
❌ Brooklyn not found at: /path/to/missing/brooklyn

Possible solutions:
1. Reinstall Brooklyn using the bootstrap script
2. Check if Brooklyn was moved or deleted
3. Run the bootstrap script to reconfigure
```

## Installation Types Comparison

| Feature                | Project-Local                | User-Wide                |
| ---------------------- | ---------------------------- | ------------------------ |
| **Command**            | `bun run install`            | `bun run bootstrap`      |
| **Scope**              | Single Brooklyn instance     | System-wide              |
| **Claude Setup**       | Manual                       | Automatic                |
| **Multiple Instances** | ✅ Each project gets own CLI | ❌ One per user          |
| **Team Sharing**       | ✅ Team can share same setup | ❌ Per-user installation |

### Use Cases

**Project-Local** is ideal for:

- Development teams working on Brooklyn
- Testing new Brooklyn versions
- Multiple Brooklyn instances on same machine

**User-Wide** is ideal for:

- End users consuming Brooklyn
- Single Brooklyn installation per user
- Simplified setup with Claude Code integration

## Deprovisioning

### Remove Brooklyn CLI

```bash
# Remove user-wide installation
bun run bootstrap:remove

# Verify removal
brooklyn-server info  # Should fail
```

### Remove Project-Local CLI

```bash
# Remove from ~/.local/bin/
rm ~/.local/bin/brooklyn-server

# Verify removal
brooklyn-server info  # Should fail
```

## Advanced Usage

### Multiple Brooklyn Instances

You can have multiple Brooklyn installations, each with its own CLI:

```bash
# Install CLI for project A
cd ~/projects/brooklyn-a
bun run install

# Install CLI for project B
cd ~/projects/brooklyn-b
bun run install

# Last installation wins - CLI points to brooklyn-b
brooklyn-server info  # Shows brooklyn-b path
```

### Status Monitoring

Use the CLI for continuous monitoring:

```bash
# Monitor server status
watch -n 5 brooklyn-server status

# Follow logs in real-time
brooklyn-server logs

# Check server health periodically
while true; do brooklyn-server status; sleep 30; done
```

### Integration with Scripts

The CLI is designed for automation:

```bash
#!/bin/bash

# Start server if not running
if ! brooklyn-server status > /dev/null 2>&1; then
    echo "Starting Brooklyn server..."
    brooklyn-server start
fi

# Wait for server to be ready
while ! brooklyn-server status | grep -q "Running"; do
    echo "Waiting for server..."
    sleep 2
done

echo "Brooklyn server is ready!"
```

## Troubleshooting

### CLI Not Found

```bash
$ brooklyn-server: command not found
```

**Solution**: Add `~/.local/bin` to your PATH:

```bash
# Add to your shell profile (.bashrc, .zshrc, etc.)
export PATH="$PATH:~/.local/bin"

# Or use full path temporarily
~/.local/bin/brooklyn-server status
```

### Permission Denied

```bash
$ brooklyn-server status
permission denied: brooklyn-server
```

**Solution**: Make CLI executable:

```bash
chmod +x ~/.local/bin/brooklyn-server
```

### Brooklyn Not Found

```bash
$ brooklyn-server status
❌ Brooklyn not found at: /old/path/to/brooklyn
```

**Solutions**:

1. Reinstall CLI: `bun run install`
2. Use bootstrap script: `bun run bootstrap:remove` then `bun run bootstrap`
3. Check Brooklyn location: Verify Brooklyn repository still exists

## CLI Architecture

### Built-in Intelligence

The Brooklyn CLI is built with embedded knowledge:

- **Brooklyn Path**: Hardcoded during build process
- **Version Lock**: CLI version matches Brooklyn version
- **Command Routing**: Delegates to appropriate Brooklyn scripts
- **Error Handling**: Validates installation and provides guidance

### Template System

The CLI uses a template-based build system:

```typescript
// Template variables replaced during build
const BROOKLYN_PATH = "{{BROOKLYN_PATH}}"; // Becomes actual path
const BROOKLYN_VERSION = "{{BROOKLYN_VERSION}}"; // Becomes version
```

### Self-Contained Design

- **No external dependencies**: CLI includes everything it needs
- **Version-locked**: CLI and Brooklyn versions always match
- **Path-aware**: CLI knows exactly which Brooklyn it manages
- **Portable**: Can be copied to other machines (if Brooklyn exists at same path)

---

The Brooklyn CLI makes server management simple and accessible from anywhere on your system, while maintaining full awareness of your Brooklyn installation's location and configuration.
