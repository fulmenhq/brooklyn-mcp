# ADR-0001: MCP HTTP Session Correlation (`Mcp-Session-Id`)

**Status**: Accepted  
**Date**: 2026-01-13  
**Owners**: Brooklyn maintainers (supervised by @3leapsdave)  
**SSOT**: This ADR is the source of truth for session header semantics. Update this ADR if behavior or requirements change.

## Context

Brooklyn is standardizing on **HTTP** as the primary interconnect for MCP clients (Tier 1: Codex CLI, Claude Code, OpenCode; Tier 2: Cline, KiloCode).

MCP “Streamable HTTP” requires a way to correlate:

- server notifications (e.g., `notifications/progress`)
- with the correct client session / stream

Some clients can set custom headers reliably; some cannot. Some clients may not send any session header at all.

We currently support two Streamable HTTP variants:

1. **GET SSE stream + POST requests** (session-correlated)
2. **POST returning SSE** (one-shot streaming response)

## Decision

### 1) `Mcp-Session-Id` is supported but not required (for now)

- Brooklyn **MUST accept** client-provided `Mcp-Session-Id` and use it for correlation when possible.
- Brooklyn **MUST NOT require** `Mcp-Session-Id` for basic operation in v0.3.x.

Rationale:

- Requiring clients to invent/provide session IDs is not universally supported across MCP clients.
- Authentication (OAuth/bearer) does not imply a session header will be present.
- Hard-requiring this header would block HTTP adoption for some clients.

### 2) Server-generated session IDs

For **GET SSE streams**:

- If a client provides `Mcp-Session-Id` on the GET request, Brooklyn will use it.
- If the client does not provide `Mcp-Session-Id`, Brooklyn will generate one and return it in the response header `Mcp-Session-Id`.

For **POST returning SSE (one-shot)**:

- `Mcp-Session-Id` is optional because correlation across requests is not required for this variant.
- If provided, Brooklyn will echo it back in the response header.

### 3) Notification routing semantics

When a tool call includes `_meta.progressToken`:

- If `Mcp-Session-Id` is present and an SSE stream is registered for that session, Brooklyn will emit `notifications/progress` to that session stream.
- If no session is available, notification delivery is best-effort and may be absent (implementation-specific).

## Consequences

### Positive

- Maximizes client compatibility (clients can adopt incrementally).
- Keeps HTTP-first rollout unblocked while clients catch up on session headers.

### Negative / Trade-offs

- Without a session id, progress notifications cannot be reliably routed in the GET SSE + POST variant.
- Multi-tenant/gateway deployments will need tighter session rules later (see “Future”).

## Future considerations (non-binding)

When Brooklyn moves beyond local-only hardening and becomes a multi-tenant gateway, we may revise this ADR to:

- require `Mcp-Session-Id` for streaming correlation in “production” auth modes
- define explicit session lifetimes, eviction, and limits
- define a strict fallback policy when correlation is not possible
