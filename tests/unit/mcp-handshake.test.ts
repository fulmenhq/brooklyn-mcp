import {
  DEFAULT_NEGOTIATED_PROTOCOL_VERSION,
  LATEST_PROTOCOL_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
} from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it } from "vitest";

import { negotiateHandshake, negotiateHandshakeWithMeta } from "../../src/shared/mcp-handshake.js";

describe("negotiateHandshake", () => {
  it("falls back to default negotiated version when client does not specify", () => {
    const result = negotiateHandshake();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.protocolVersion).toBe(DEFAULT_NEGOTIATED_PROTOCOL_VERSION);
      expect(result.payload.capabilities.experimental).toBeDefined();
    }
  });

  it("accepts a supported client protocol version", () => {
    const clientVersion = LATEST_PROTOCOL_VERSION;
    const result = negotiateHandshake(clientVersion);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.protocolVersion).toBe(clientVersion);
    }
  });

  it("rejects unsupported protocol versions with explicit error metadata", () => {
    const result = negotiateHandshake("1999-01-01");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(-32600);
      expect(result.error.data.supported).toEqual(SUPPORTED_PROTOCOL_VERSIONS);
    }
  });

  it("returns telemetry metadata when requested", () => {
    const { result, meta } = negotiateHandshakeWithMeta(LATEST_PROTOCOL_VERSION);

    expect(meta.requestedProtocolVersion).toBe(LATEST_PROTOCOL_VERSION);
    expect(meta.negotiatedProtocolVersion).toBe(LATEST_PROTOCOL_VERSION);
    expect(meta.supportedProtocolVersions).toEqual(SUPPORTED_PROTOCOL_VERSIONS);
    expect(result.ok).toBe(true);
  });
});
