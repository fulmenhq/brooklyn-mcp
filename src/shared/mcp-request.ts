import type { CallToolRequest, CallToolRequestParams } from "@modelcontextprotocol/sdk/types.js";

function normalizeArguments(params: CallToolRequestParams): CallToolRequestParams {
  const rawArguments = params.arguments;
  const hasValidArguments =
    rawArguments !== null &&
    rawArguments !== undefined &&
    typeof rawArguments === "object" &&
    !Array.isArray(rawArguments);

  return {
    ...params,
    arguments: hasValidArguments ? (rawArguments as Record<string, unknown>) : {},
  };
}

export function createCallToolRequest(params: CallToolRequestParams): CallToolRequest {
  return {
    method: "tools/call",
    params: normalizeArguments(params),
  };
}

export function createCallToolRequestFromMessage(message: {
  params: CallToolRequestParams;
}): CallToolRequest {
  return createCallToolRequest(message.params);
}
