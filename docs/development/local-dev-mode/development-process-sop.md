# Brooklyn Local Development Process SOP (HTTP Dev Mode)

Objective: Provide a precise, repeatable, single-command-at-a-time workflow for developers to iterate on MCP functionality using the HTTP development server. This SOP emphasizes correctness, observability, and cleanup to prevent environment drift.

Audience: Brooklyn contributors adding/modifying MCP tools and needing a fast feedback loop.

Prerequisites

- Bun and Brooklyn CLI installed. Verify:
  - `bun --version`
  - `brooklyn --version` (should show the version you built)
- Built and installed local CLI (from repo root):
  - `bun run build`
  - `bun run install`
- Playwright browsers installed if you plan to use non-headless/CI runs:
  - `bun run setup:browsers` (optional; headless typically works out of the box)

Key commands (learn these first)

- Show top-level help:
  - `brooklyn --help`
  - `brooklyn mcp --help`
- HTTP Dev server lifecycle:
  - `brooklyn mcp dev-http --help`
  - `brooklyn mcp dev-http-status`
  - `brooklyn mcp dev-http --port 8081 --team-id <team> --background --verbose`
  - `brooklyn mcp dev-http-stop --all`
  - `brooklyn mcp dev-http-list`

Golden Rules

1. Issue exactly one command at a time. Read the output. Only then proceed.
2. Always check status before starting and after stopping.
3. Avoid foreground servers for AI/automation. Use `--background` for control return.
4. If you see “Port undefined” or unhealthy entries, clean up with `dev-http-stop --all` and recheck.
5. For HTTP requests, the /mcp endpoint returns MCP-style content as a text block containing JSON. Parse the `text` field to extract structured results.

Step-by-step workflow (HTTP Dev Mode)

A) Status and Cleanup

1. Check status:
   brooklyn mcp dev-http-status

   Expected: Either no entries, or one or more entries. If you see:
   - “Port undefined” or Health: ❌ Not responding
     then proceed to cleanup.

2. Cleanup (if needed):
   brooklyn mcp dev-http-stop --all
   brooklyn mcp dev-http-status

   Expected: Clean state (no running dev-http instances).

B) Start the HTTP Dev Server (Background) 3. Start:
brooklyn mcp dev-http --port 8081 --team-id http-test --background --verbose

Expected: “Brooklyn HTTP server starting in background (PID: #####, Port: 8081)”

4. Verify:
   brooklyn mcp dev-http-status

   Expected for port 8081:
   - Team: http-test
   - URL: http://localhost:8081
   - Health: ✅ Responding

C) Exercise MCP Tools via HTTP
The HTTP endpoint is POST /mcp with JSON-RPC payloads.

5. Launch a browser:
   curl -s -X POST http://127.0.0.1:8081/mcp \
    -H "Content-Type: application/json" \
    -d '{ "jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"launch_browser","arguments":{"browserType":"chromium","headless":true}}}'

   Response notes:
   - The MCP response embeds a text block (content[0].type == "text") containing JSON.
   - Parse the `text` to extract the browserId.

   Example of extracting browserId with jq:
   BROWSER_ID=$(curl -s -X POST http://127.0.0.1:8081/mcp -H "Content-Type: application/json" \
     -d '{ "jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"launch_browser","arguments":{"browserType":"chromium","headless":true}}}' \
     | jq -r '.result.content[0].text' | jq -r '.browserId')
   echo "Using BROWSER_ID=${BROWSER_ID}"

6. Navigate to a website:
   curl -s -X POST http://127.0.0.1:8081/mcp \
    -H "Content-Type: application/json" \
    -d "{ \"jsonrpc\":\"2.0\", \"id\":2, \"method\":\"tools/call\", \"params\": { \"name\": \"navigate_to_url\", \"arguments\": { \"browserId\": \"${BROWSER_ID}\", \"url\": \"https://example.com\", \"waitUntil\": \"load\" } } }"

   Expected: success true; includes title and statusCode.

7. Take a screenshot (file return):
   curl -s -X POST http://127.0.0.1:8081/mcp \
    -H "Content-Type: application/json" \
    -d "{ \"jsonrpc\":\"2.0\", \"id\":3, \"method\":\"tools/call\", \"params\": { \"name\": \"take_screenshot\", \"arguments\": { \"browserId\": \"${BROWSER_ID}\", \"fullPage\": true, \"type\": \"png\", \"returnFormat\": \"file\" } } }"

   Expected: The text JSON contains a `filePath` field indicating where the screenshot was saved (e.g., `~/.brooklyn/screenshots/.../screenshot-YYYY-mm-ddTHH-MM-SS-....png`).

   Note: The screenshot path is managed by Brooklyn’s storage manager. Ensure you copy/move it immediately if you need it in a specific location for docs or validation.

D) Managing and Finding Multiple Screenshots (Sessions with Many Images)

When you take many screenshots during a session, you will want fast ways to discover and collect them. Until dedicated list APIs are added, use these practical shell recipes:

1. Copy each screenshot immediately after you receive a valid filePath:

   # After take_screenshot response:

   SS_PATH=$(echo "$SS_JSON" | jq -r '.result.content[0].text' | jq -r '.filePath')
   if [ -n "$SS_PATH" ] && [ "$SS_PATH" != "null" ]; then
   mkdir -p ~/docs/temp
   cp "$SS_PATH" ~/docs/temp/
     echo "Copied: ~/docs/temp/$(basename "$SS_PATH")"
   fi

2. List last 10 screenshots across all sessions:
   find ~/.brooklyn/screenshots -type f -name '\*.png' -print0 | xargs -0 ls -lt | head -n 10

3. List last 10 screenshots for the current session (based on last SS_PATH):
   SESSION_DIR=$(dirname "$(dirname "$SS_PATH")")
   ls -lt "$SESSION_DIR"/\*.png | head -n 10

4. Collect all screenshots from the last hour to a working folder:
   mkdir -p ~/docs/temp
   find ~/.brooklyn/screenshots -type f -name '\*.png' -mmin -60 -print0 | xargs -0 -I {} cp "{}" ~/docs/temp/

Planned enhancements (to be implemented next):

- list_screenshots tool:
  Input: { browserId?: string, since?: ISO8601, limit?: number, includeMetadata?: boolean }
  Output: Array of { filePath, filename, createdAt, dimensions?, fileSize?, auditId? }
- get_screenshot tool:
  Input: { path: string } or { auditId: string }
  Output: { exists: boolean, filePath, fileSize?, createdAt?, metadataPath? }

CLI conveniences to follow the tools:

- brooklyn browser screenshots list --team-id <team> [--browser-id <id>] [--since <ISO>] [--limit 20]
- brooklyn browser screenshots open <filePath>
- brooklyn browser screenshots tail --browser-id <id>

E) Real-world validation example (for SOP readers)
This sequence demonstrates navigating to a production site and saving a screenshot for documentation.

1. Launch and capture browserId:
   BROWSER_ID=$(curl -s -X POST http://127.0.0.1:8081/mcp -H "Content-Type: application/json" \
     -d '{ "jsonrpc":"2.0","id":101,"method":"tools/call","params":{"name":"launch_browser","arguments":{"browserType":"chromium","headless":true}}}' \
     | jq -r '.result.content[0].text' | jq -r '.browserId')
   echo "Using BROWSER_ID=${BROWSER_ID}"

2. Navigate to https://3leaps.net/who-we-are:
   curl -s -X POST http://127.0.0.1:8081/mcp -H "Content-Type: application/json" \
    -d "{\"jsonrpc\":\"2.0\",\"id\":102,\"method\":\"tools/call\",\"params\":{\"name\":\"navigate_to_url\",\"arguments\":{\"browserId\":\"${BROWSER_ID}\",\"url\":\"https://3leaps.net/who-we-are\",\"waitUntil\":\"load\"}}}"

   Expected: success true; receive page metadata (title, statusCode, loadTime).

3. Take screenshot and copy to a visible location:

   # Request screenshot (file return)

   SS_JSON=$(curl -s -X POST http://127.0.0.1:8081/mcp -H "Content-Type: application/json" \
     -d "{\"jsonrpc\":\"2.0\",\"id\":103,\"method\":\"tools/call\",\"params\":{\"name\":\"take_screenshot\",\"arguments\":{\"browserId\":\"${BROWSER_ID}\",\"fullPage\":true,\"type\":\"png\",\"returnFormat\":\"file\"}}}")

   # Extract filePath from the MCP content text field

   SS_PATH=$(echo "$SS_JSON" | jq -r '.result.content[0].text' | jq -r '.filePath')
   echo "Screenshot path: $SS_PATH"

   # Option A: Copy to OS temp (portable)

   if [ -f "$SS_PATH" ]; then
   TMP_DEST="$(mktemp -u)/$(basename "$SS_PATH")"
     mkdir -p "$(dirname "$TMP_DEST")"
     cp "$SS_PATH" "$TMP_DEST"
   echo "Copied screenshot to $TMP_DEST"
   else
   echo "Screenshot file not found at reported path; verify dev-http-status and rerun take_screenshot."
   fi

   # Option B (macOS/Linux home docs folder): Copy to ~/docs/temp

   # mkdir -p ~/docs/temp && cp "$SS_PATH" ~/docs/temp/ && echo "Copied screenshot to ~/docs/temp/$(basename "$SS_PATH")"

Troubleshooting Tips

- “Port undefined” in dev-http-status:
  - Root cause: prior incorrect spawn or orphaned process metadata.
  - Fix: `brooklyn mcp dev-http-stop --all`, then re-run `dev-http-status`. Start clean with `dev-http --background`.

- dev-http not responding (Health ❌):
  - Check pid file: `ls -la ~/.brooklyn` or repo root for `.brooklyn-http-PORT.pid`.
  - Stop all: `brooklyn mcp dev-http-stop --all`
  - Re-start: `brooklyn mcp dev-http --port 8081 --team-id http-test --background --verbose`
  - Re-verify: `brooklyn mcp dev-http-status` (expect Health ✅)

- Screenshot path is null or not found:
  - Re-issue take_screenshot immediately after a successful navigate.
  - Ensure `returnFormat: "file"`.
  - Inspect logs: `brooklyn mcp dev-http-status` for PID, then check log directory:
    - `~/.brooklyn/dev/logs/` (dev mode logs)
    - `~/.brooklyn/screenshots/...` for generated images

- Option parsing errors:
  - Use `brooklyn mcp dev-http --help` for the authoritative flag list.
  - Examples:
    - Use `--team-id` not `--team`
    - Use `--background` and `--verbose` for AI-friendly operation (control returns)

Rationale for this SOP

- Single-command iteration avoids “fire-and-forget” chains that obscure errors.
- Background start ensures interactive control returns to the terminal for subsequent steps.
- Status/cleanup discipline prevents drift across dev sessions.
- Explicit, verifiable HTTP calls mirror integration behavior and are easy to script.

Appendix: Quick checklist

- [ ] Status is clean (no “Port undefined”, or cleaned up)
- [ ] Started dev-http with background and known port
- [ ] Health: Responding ✅
- [ ] launch_browser -> browserId parsed from text content
- [ ] navigate_to_url success
- [ ] take_screenshot returns a filePath, image copied to temp/docs
