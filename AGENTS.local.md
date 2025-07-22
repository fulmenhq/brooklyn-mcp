# AGENTS.local.md: Local Guidelines for Agentic Coding in fulmen-mcp-forge-brooklyn

## Local Environment Setup

- Env Vars: Set BROOKLYN_ENV=development, BROOKLYN_PORT=3000, etc. (see CLAUDE.local.md for full list)
- Browser Config: BROOKLYN_MAX_BROWSERS=10, HEADLESS=true
- Security: BROOKLYN_RATE_LIMIT_REQUESTS=100

## Local Test Commands

- Specific suites: bun run test src/core
- Coverage: bun run test --coverage
- Watch: bun run test --watch
- ALWAYS use bun run test (vitest)

## Local Workflow

- Start dev server: brooklyn mcp start --dev-mode
- Tests watch: bun run test --watch
- Typecheck: bun run typecheck
- Lint: bun run lint

## MCP Config for Claude

- Add: claude mcp add brooklyn brooklyn mcp start
- User-wide: claude mcp add -s user ...
- Verify: claude mcp list
- Status: brooklyn status

## Debugging

- Use console.log for quick checks
- Bun debugger for complex issues
- Monitor with top/htop
- Headless=false for UI debug

## Local Notes

- Limit browsers to 4-5 locally
- Use headless unless testing UI
- Each Claude instance runs own server
- Follow quality gates: check:file, typecheck, etc.

**Note**: For general guidelines, see AGENTS.md. This is developer-specific and gitignored.
