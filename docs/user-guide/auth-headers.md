# Auth-Gated Browsing

Brooklyn v0.3.3 enables access to authenticated sites (SaaS dashboards, analytics platforms, enterprise apps) by injecting custom HTTP headers into every browser request.

## Quick Start

Pass headers directly when launching a browser:

```
Launch a chromium browser with extraHttpHeaders:
  Authorization: "Bearer <your-token>"
```

Or in explicit MCP params:

```json
{
  "name": "launch_browser",
  "arguments": {
    "browserType": "chromium",
    "extraHttpHeaders": {
      "Authorization": "Bearer eyJhbGciOi..."
    }
  }
}
```

Headers persist for the lifetime of the browser session and are sent with every request (navigations, XHR, fetches, images).

## Configuration Options

### Option 1: MCP Parameter (ad-hoc)

Pass `extraHttpHeaders` directly on `launch_browser`. Best for one-off sessions or when tokens rotate frequently.

### Option 2: Environment Variable (process-local)

Set `BROOKLYN_HTTP_HEADERS` as a JSON string before starting Brooklyn:

```bash
export BROOKLYN_HTTP_HEADERS='{"Authorization":"Bearer eyJhbGciOi...","X-Custom-Key":"value"}'
brooklyn web start --daemon
```

The env var acts as a fallback — if `extraHttpHeaders` is passed on `launch_browser`, it takes priority.

### Resolution Order

1. `extraHttpHeaders` MCP parameter (highest priority)
2. `BROOKLYN_HTTP_HEADERS` environment variable
3. No headers (default)

## Verifying Headers with inspect_network

After navigating to your authenticated site, use `inspect_network` to confirm headers are being sent:

```
Inspect network requests filtered by urlPattern "/api/"
```

By default, sensitive headers are redacted in the output:

```json
{
  "requests": [
    {
      "url": "https://dashboard.example.com/api/data",
      "method": "GET",
      "requestHeaders": {
        "Authorization": "[REDACTED]",
        "User-Agent": "Mozilla/5.0 ..."
      },
      "status": 200
    }
  ],
  "redacted": true
}
```

### Viewing Raw Headers (Development Only)

For debugging auth failures, you can request unredacted headers:

1. Set the environment variable: `BROOKLYN_FULL_HEADER_SUPPORT=true`
2. Pass `includeRaw: true` on the `inspect_network` call

Raw mode is limited to the last 10 requests and generates an audit log entry.

## Extracting Data from Authenticated Pages

Once authenticated, use the data extraction tools:

### Table Extraction

```
Extract table data from selector "table.dashboard-metrics" in JSON format
```

Returns structured data with headers and rows, handling `colspan`/`rowspan`.

### Paginated Tables

```
Paginate the table at "table.results" using next button ".pagination-next"
```

Automatically clicks through pages, collecting and deduplicating rows.

## Security Notes

### What Gets Redacted

These header names are redacted by default in all logging and `inspect_network` output:

- `Authorization`
- `Cookie`
- `Set-Cookie`
- `Proxy-Authorization`
- `X-API-Key`
- `X-Auth-Token`

You can customize the redaction list via the `redact` parameter on `inspect_network`.

### Log Safety

Header values are never written to Brooklyn's log output at any level. Debug logs sanitize `extraHttpHeaders` before writing. The `inspect_network` tool applies redaction before returning results to the MCP client.

### Token Lifecycle

Headers are scoped to the browser session. When you close the browser, the headers are discarded. Brooklyn does not persist tokens to disk in v0.3.3.

## Integration with authbolt

[authbolt](https://github.com/fulmenhq/authbolt) (separate utility) can automate credential acquisition. The integration is intentionally loose-coupled:

```bash
# authbolt acquires credentials, Brooklyn consumes them
authbolt auth my-dashboard --output stdout | jq -r '.headers' > /tmp/headers.json
export BROOKLYN_HTTP_HEADERS=$(cat /tmp/headers.json)
brooklyn web start --daemon

# Or pass directly via MCP param from the agent
# launch_browser(extraHttpHeaders: {"Authorization": "Bearer <token>"})
```

authbolt is not a dependency. You can set headers manually, via env, or via any credential source.

## Limitations (v0.3.3)

- No encrypted header storage on disk (deferred to v0.3.4)
- No `brooklyn_list_headers` tool to inspect configured headers (deferred to v0.3.4)
- No per-domain header scoping — headers apply to all requests in the session
- Pagination auto-detection deferred to v0.3.4 (explicit `nextButton` selector required)

<!-- prodmktg updates complete v0.3.3 -->

## 🏢 Real-World Examples

### **Stripe Dashboard (MRR Analytics)**

```
export BROOKLYN_HTTP_HEADERS='{"Authorization": "Bearer sk_live_..."}'
# Agent:
launch_browser chromium
navigate_to_url "https://dashboard.stripe.com/reports/mrr"
extract_table_data ".mrr-table" format=json  # → {"headers": ["Month", "MRR"], "data": [...]}
paginate_table table=".mrr-table" nextButton=".next-page"
```

**Result**: JSON-ready MRR trends for forecasting.

### **Mixpanel User Cohorts**

```
# Tokens rotate? Pass ad-hoc:
launch_browser extraHttpHeaders={"Authorization": "Bearer <fresh-token>"}
navigate_to_url "https://mixpanel.com/report/cohorts"
extract_table_data selector="[data-testid='cohort-table']"
```

**Result**: Retention data → churn playbook.

### **Amplitude Event Explorer**

Visual paginated extraction for funnel analysis.

**Screenshots**: See release notes for dashboard flows.
