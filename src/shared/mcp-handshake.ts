import {
  DEFAULT_NEGOTIATED_PROTOCOL_VERSION,
  type ServerCapabilities,
  SUPPORTED_PROTOCOL_VERSIONS,
} from "@modelcontextprotocol/sdk/types.js";

import { buildConfig } from "./build-config.js";

const SUPPORTED_VERSION_SET = new Set(SUPPORTED_PROTOCOL_VERSIONS);

const DEFAULT_SERVER_INFO = Object.freeze({
  name: "brooklyn-mcp-server",
  version: buildConfig.version,
});

const DEFAULT_CAPABILITIES: ServerCapabilities = Object.freeze({
  tools: { listChanged: true },
  resources: { listChanged: false, subscribe: false },
  prompts: { listChanged: false },
  logging: {},
});

export interface HandshakeSuccessPayload {
  protocolVersion: string;
  serverInfo: typeof DEFAULT_SERVER_INFO;
  capabilities: ServerCapabilities;
}

export interface HandshakeErrorPayload {
  code: number;
  message: string;
  data: { supported: string[] };
}

export type HandshakeNegotiationResult =
  | { ok: true; payload: HandshakeSuccessPayload }
  | { ok: false; error: HandshakeErrorPayload };

export interface HandshakeNegotiationMeta {
  requestedProtocolVersion?: string;
  negotiatedProtocolVersion: string;
  supportedProtocolVersions: string[];
}

export function negotiateHandshake(clientVersion?: string): HandshakeNegotiationResult {
  if (clientVersion && !SUPPORTED_VERSION_SET.has(clientVersion)) {
    return {
      ok: false,
      error: {
        code: -32600,
        message: `Unsupported protocolVersion "${clientVersion}". Server supports ${SUPPORTED_PROTOCOL_VERSIONS.join(
          ", ",
        )}.`,
        data: { supported: [...SUPPORTED_PROTOCOL_VERSIONS] },
      },
    };
  }

  const negotiatedVersion =
    clientVersion && SUPPORTED_VERSION_SET.has(clientVersion)
      ? clientVersion
      : DEFAULT_NEGOTIATED_PROTOCOL_VERSION;

  return {
    ok: true,
    payload: {
      protocolVersion: negotiatedVersion,
      serverInfo: { ...DEFAULT_SERVER_INFO },
      capabilities: { ...DEFAULT_CAPABILITIES },
    },
  };
}

export function negotiateHandshakeWithMeta(clientVersion?: string): {
  result: HandshakeNegotiationResult;
  meta: HandshakeNegotiationMeta;
} {
  const negotiatedProtocolVersion =
    clientVersion && SUPPORTED_VERSION_SET.has(clientVersion)
      ? clientVersion
      : DEFAULT_NEGOTIATED_PROTOCOL_VERSION;

  const result = negotiateHandshake(clientVersion);

  return {
    result,
    meta: {
      requestedProtocolVersion: clientVersion,
      negotiatedProtocolVersion,
      supportedProtocolVersions: [...SUPPORTED_PROTOCOL_VERSIONS],
    },
  };
}

export function getServerCapabilities(): ServerCapabilities {
  return { ...DEFAULT_CAPABILITIES };
}

export function getServerInfo() {
  return { ...DEFAULT_SERVER_INFO };
}
