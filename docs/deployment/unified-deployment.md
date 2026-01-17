# Unified Deployment Guide (HTTP-first)

Brooklyn MCP is **HTTP-first**: run one long-lived Brooklyn HTTP server and connect multiple agent clients to it.

If you are using a terminal-native client and only need a single agent session, stdio is still supported, but it is not the recommended default.

## One Server, Many Agents

### Recommended local topology

1. Start the HTTP server once per machine:

```bash
brooklyn web start --host 127.0.0.1 --port 3000 --auth-mode required --daemon
```

2. Connect clients (examples):

- Claude Code (HTTP):
  - `claude mcp add -s user -t http brooklyn http://127.0.0.1:3000/mcp`
- OpenCode:
  - Use `opencode.json` (see `examples/mcp-clients/opencode.json`)
- Kilocode:
  - Use `.kilocode/mcp.json` (see `examples/mcp-clients/kilocode.mcp.json`)
- Codex CLI:
  - Add `[mcp_servers.brooklyn] url = "http://127.0.0.1:3000/mcp"` to `~/.codex/config.toml`

3. Verify

- `curl http://127.0.0.1:3000/health`
- In an agent client, run `brooklyn_status`
- In a terminal, run `brooklyn doctor --json`

## Authentication

- Default is `--auth-mode required`.
- For loopback-only dogfooding you may temporarily use `--auth-mode localhost`.

See `docs/deployment/http-transport-deployment.md` for details.

## Troubleshooting (common)

- Server not reachable:
  - `brooklyn web status`
  - `brooklyn web cleanup --port 3000`
  - `brooklyn web start --host 127.0.0.1 --port 3000 --daemon`
- Codex CLI + localhost:
  - Ensure `HTTP_PROXY` / `HTTPS_PROXY` are unset or `NO_PROXY` includes `127.0.0.1,localhost`.

## References

- `docs/deployment/mcp-configuration.md` (per-client configuration)
- `docs/deployment/http-transport-deployment.md` (deployment + auth)
- `examples/mcp-clients/` (known-good client configs)
