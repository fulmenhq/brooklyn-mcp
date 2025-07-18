# Echo Team Integration - Brooklyn MCP Server

## Status: ✅ Ready for Echo Team

The Brooklyn MCP server is now fully integrated and ready for Echo team on Blossflow to connect and start using browser automation capabilities.

## Quick Start for Echo Team

### 1. Server Management

```bash
# Start Brooklyn MCP server
bun run server:start

# Check server status
bun run server:status

# View logs
bun run server:logs

# Stop server
bun run server:stop
```

### 2. Connect to Claude Code

Add Brooklyn to your Claude Code configuration:

**macOS/Linux:** `~/.config/claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "brooklyn": {
      "command": "bun",
      "args": ["run", "start"],
      "cwd": "/absolute/path/to/fulmen-mcp-forge-brooklyn"
    }
  }
}
```

### 3. First Commands to Try

```bash
# Check if Brooklyn is working
brooklyn_status

# Get started guide for Echo team
brooklyn_getting_started use_case=ai_development team_id=echo-team

# See available capabilities
brooklyn_capabilities

# Get examples for basic navigation
brooklyn_examples task=basic_navigation format=claude_commands

# Set up Echo team configuration
brooklyn_team_setup team_id=echo-team use_cases=["ux_development"] domains=["*.blossflow.com","localhost:*"]
```

## Echo Team Specific Features

### Browser Automation for UX Development

```bash
# Launch browser for Echo team
Launch a chromium browser for team 'echo-team'

# Navigate to Blossflow site
Navigate to https://blossflow.com

# Take responsive screenshots
Take a full-page screenshot

# Clean up
Close the browser
```

### Multi-Viewport Testing

```bash
# Test different viewport sizes
Launch browsers with different viewports:
- Desktop: 1920x1080
- Laptop: 1366x768  
- Tablet: 768x1024
- Mobile: 375x667
```

### Performance Testing

```bash
# Monitor page load times
Navigate to site and measure load performance

# Compare load times across browsers
Test same URL in chromium, firefox, and webkit
```

## Available Tools

### Core Browser Automation
- `launch_browser` - Launch new browser instance
- `navigate` - Navigate to URL
- `screenshot` - Capture page screenshot
- `close_browser` - Close browser instance

### Echo Team Onboarding
- `brooklyn_status` - Server status and health
- `brooklyn_capabilities` - List all available tools
- `brooklyn_getting_started` - Step-by-step guide
- `brooklyn_examples` - Practical examples
- `brooklyn_team_setup` - Configure team settings
- `brooklyn_troubleshooting` - Help with issues

## Integration Verification

### ✅ Tests Passing
- 16 unit tests passing
- 11 functional integration tests passing
- Echo team specific functionality verified

### ✅ Server Features
- Multi-browser support (Chromium, Firefox, WebKit)
- Team isolation with Echo team ID
- Resource management (10 concurrent browsers)
- Comprehensive logging
- Graceful shutdown
- Cross-platform compatibility

### ✅ Documentation
- Complete user guide with examples
- Advanced features documentation
- Team management guide
- Development documentation
- Troubleshooting guide

## Domain Configuration for Echo Team

Recommended domain allowlist for Echo team:
- `*.blossflow.com` - Production Blossflow sites
- `*.staging.blossflow.com` - Staging environments
- `localhost:*` - Local development
- `127.0.0.1:*` - Local development

## Support & Troubleshooting

### Common Issues

1. **Brooklyn won't connect**
   - Check server is running: `bun run server:status`
   - Verify Claude configuration path
   - Test with: `brooklyn_status`

2. **Browser won't launch**
   - Install Playwright browsers: `bun run setup`
   - Check resource usage: `brooklyn_status detail=full`
   - Verify team permissions

3. **Navigation failures**
   - Check URL validity
   - Verify domain allowlist
   - Test timeout settings

### Getting Help

```bash
# Built-in troubleshooting
brooklyn_troubleshooting issue=general

# Check logs
bun run server:logs

# Get practical examples
brooklyn_examples task=all
```

## Team Contact

**Brooklyn Team Lead:** Paris (MCP Platform Architect & Browser Automation Lead)
**Integration Point:** Sprint 1 - Echo Team on Blossflow
**Status:** Production Ready ✅

## Next Steps

1. **Echo Team Testing** - Connect Claude Code and test basic workflows
2. **Security Implementation** - Add domain validation middleware
3. **Advanced Features** - Element interaction, form automation
4. **Performance Optimization** - Resource usage monitoring
5. **Team Expansion** - Onboard additional teams

---

**Brooklyn MCP Server - Bridging AI and Browser Automation**
*Built with 💙 by the 3leaps Team*