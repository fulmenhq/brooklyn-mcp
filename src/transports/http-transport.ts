/**
 * MCP Streamable HTTP transport implementation
 * Implements MCP spec for HTTP transport with SSE support
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer } from "node:http";

import { traceIncomingMCPRequest, traceOutgoingMCPResponse } from "../core/mcp-debug-middleware.js";
import type { HTTPConfig, ToolCallHandler, ToolListHandler, Transport } from "../core/transport.js";
import { TransportType } from "../core/transport.js";
import { buildConfig } from "../shared/build-config.js";
import { getLogger } from "../shared/pino-logger.js";

/**
 * MCP Streamable HTTP transport
 * Handles JSON-RPC over HTTP POST with optional SSE for streaming
 */
export class MCPHTTPTransport implements Transport {
  readonly name = "mcp-http";
  readonly type = TransportType.HTTP;

  // Lazy logger to avoid module-level side effects and stdout pollution
  private _logger: ReturnType<typeof getLogger> | null = null;
  private logger() {
    if (!this._logger) {
      this._logger = getLogger("mcp-http-transport");
    }
    return this._logger;
  }
  private readonly config: HTTPConfig;
  private server: ReturnType<typeof createServer> | null = null;
  private running = false;
  private toolListHandler?: ToolListHandler;
  private toolCallHandler?: ToolCallHandler;

  constructor(config: HTTPConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    this.logger().info("Initializing MCP HTTP transport", {
      port: this.config.options.port,
      host: this.config.options.host || "localhost",
    });

    this.server = createServer(async (req, res) => {
      try {
        await this.handleRequest(req, res);
      } catch (error) {
        this.logger().error("MCP HTTP request error", {
          url: req.url,
          method: req.method,
          error: error instanceof Error ? error.message : String(error),
        });

        if (!res.headersSent) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(
            JSON.stringify({
              jsonrpc: "2.0",
              error: {
                code: -32603,
                message: "Internal error",
              },
            }),
          );
        }
      }
    });

    this.server.on("error", (error) => {
      this.logger().error("MCP HTTP server error", { error: error.message });
    });
  }

  async start(): Promise<void> {
    if (this.running) {
      this.logger().warn("MCP HTTP transport already running");
      return;
    }

    if (!this.server) {
      throw new Error("MCP HTTP transport not initialized");
    }

    // Check if port is already in use before attempting to start
    const port = this.config.options.port;
    const host = this.config.options.host || "localhost";

    const isPortInUse = await this.checkPortInUse(port, host);
    if (isPortInUse) {
      const error = new Error(`Port ${port} is already in use on ${host}`);
      this.logger().error("Cannot start MCP HTTP transport - port already in use", {
        port,
        host,
        error: error.message,
      });
      throw error;
    }

    this.logger().info("Starting MCP HTTP transport", {
      port,
      host,
    });

    return new Promise((resolve, reject) => {
      if (!this.server) {
        reject(new Error("Server not initialized"));
        return;
      }

      // Set up error handler BEFORE calling listen
      const errorHandler = (error: NodeJS.ErrnoException) => {
        this.logger().error("Failed to start MCP HTTP transport", {
          error: error.message,
          code: error.code,
          port,
          host,
        });
        this.running = false;

        // Provide better error message for common issues
        if (error.code === "EADDRINUSE") {
          reject(
            new Error(
              `Port ${port} is already in use. Please stop the existing server or use a different port.`,
            ),
          );
        } else if (error.code === "EACCES") {
          reject(
            new Error(`Permission denied to bind to port ${port}. Try a port number above 1024.`),
          );
        } else {
          reject(error);
        }
      };

      this.server.once("error", errorHandler);

      this.server.listen(port, host, () => {
        // Remove the error handler after successful start
        this.server?.removeListener("error", errorHandler);

        this.running = true;
        this.logger().info("MCP HTTP transport started", {
          port,
          host,
          url: `http://${host}:${port}`,
        });
        resolve();
      });
    });
  }

  /**
   * Check if a port is already in use
   */
  private async checkPortInUse(port: number, host: string): Promise<boolean> {
    return new Promise((resolve) => {
      const net = require("node:net");
      const tester = net
        .createServer()
        .once("error", (err: NodeJS.ErrnoException) => {
          if (err.code === "EADDRINUSE") {
            resolve(true); // Port is in use
          } else {
            resolve(false); // Some other error, assume port is free
          }
        })
        .once("listening", () => {
          tester.close(() => {
            resolve(false); // Port is free
          });
        })
        .listen(port, host);
    });
  }

  async stop(): Promise<void> {
    if (!this.running) {
      this.logger().warn("MCP HTTP transport not running");
      return;
    }

    if (!this.server) {
      this.logger().warn("MCP HTTP server not initialized");
      return;
    }

    this.logger().info("Stopping MCP HTTP transport");

    return new Promise((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }

      this.server.close((error) => {
        if (error) {
          this.logger().error("Error stopping MCP HTTP transport", { error: error.message });
          reject(error);
        } else {
          this.running = false;
          this.logger().info("MCP HTTP transport stopped");
          resolve();
        }
      });
    });
  }

  isRunning(): boolean {
    return this.running;
  }

  setToolListHandler(handler: ToolListHandler): void {
    this.toolListHandler = handler;
  }

  setToolCallHandler(handler: ToolCallHandler): void {
    this.toolCallHandler = handler;
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // CRITICAL: Check OAuth routes FIRST before any method restrictions
    // This ensures OAuth GET endpoints work properly

    // Handle OAuth and registration endpoints (Claude Code compatibility)
    if (req.url?.includes("/.well-known/oauth-authorization-server")) {
      // OAuth discovery endpoint with PKCE support
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          issuer: `http://${req.headers.host}`,
          authorization_endpoint: `http://${req.headers.host}/oauth/authorize`,
          token_endpoint: `http://${req.headers.host}/oauth/token`,
          registration_endpoint: `http://${req.headers.host}/oauth/register`,
          scopes_supported: ["mcp"],
          response_types_supported: ["code"],
          grant_types_supported: ["authorization_code", "client_credentials"],
          code_challenge_methods_supported: ["S256", "plain"], // ← Key addition for PKCE
          token_endpoint_auth_methods_supported: [
            "client_secret_basic",
            "client_secret_post",
            "none",
          ],
        }),
      );
      return;
    }

    if (req.url === "/oauth/register" && req.method === "GET") {
      // Dynamic Client Registration UI (simple form for manual testing)
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(`
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <title>Brooklyn MCP - Client Registration</title>
            <style>
              body { font-family: system-ui, -apple-system, sans-serif; max-width: 800px; margin: 2rem auto; padding: 2rem; background: #f8f9fa; }
              .container { background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
              .form { display: flex; flex-direction: column; gap: 12px; }
              input, textarea { padding: 8px; border: 1px solid #dadce0; border-radius: 4px; width: 100%; }
              button { background: #1a73e8; color: white; border: none; padding: 10px 16px; border-radius: 4px; cursor: pointer; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>Client Registration</h1>
              <p>Register a client for OAuth PKCE testing.</p>
              <form class="form">
                <label>Client Name</label>
                <input name="client_name" value="Brooklyn Test Client" />
                <label>Redirect URIs (comma separated)</label>
                <textarea name="redirect_uris">http://${req.headers.host}/oauth/callback</textarea>
                <label>Token Endpoint Auth Method</label>
                <input name="token_endpoint_auth_method" value="none" />
                <button type="button" onclick="alert('Submit via API: POST /oauth/register')">Submit</button>
              </form>
            </div>
          </body>
        </html>
      `);
      return;
    }

    if (req.url === "/oauth/register" && req.method === "POST") {
      // Dynamic Client Registration - return a mock client for MCP access
      const body = await this.parseRequestBody(req);

      const clientName = (body["client_name"] as string) ?? "Brooklyn MCP Client";
      const redirectUris = (body["redirect_uris"] as string[]) ?? [
        `http://${req.headers.host}/oauth/callback`,
      ];
      const clientUri = (body["client_uri"] as string) ?? `http://${req.headers.host}`;
      const grantTypes = (body["grant_types"] as string[]) ?? ["authorization_code"];
      const responseTypes = (body["response_types"] as string[]) ?? ["code"];
      const tokenMethod = (body["token_endpoint_auth_method"] as string) ?? "none";
      const scope = (body["scope"] as string) ?? "mcp";

      const clientId = `client_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

      const baseClient: Record<string, unknown> = {
        client_id: clientId,
        client_id_issued_at: Math.floor(Date.now() / 1000),
        registration_access_token: "brooklyn-registration-token",
        registration_client_uri: `http://${req.headers.host}/oauth/register/${clientId}`,
        redirect_uris: redirectUris,
        grant_types: grantTypes,
        response_types: responseTypes,
        token_endpoint_auth_method: tokenMethod,
        scope,
        client_name: clientName,
        client_uri: clientUri,
      };

      if (tokenMethod !== "none") {
        baseClient["client_secret"] = `secret_${Math.random().toString(36).slice(2, 12)}`;
        baseClient["client_secret_expires_at"] = 0;
      }

      res.statusCode = 201;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(baseClient));
      return;
    }

    if (req.url?.startsWith("/oauth/authorize") && req.method === "GET") {
      // Authorization endpoint - handle PKCE flow with manual fallback
      const url = new URL(req.url, `http://${req.headers.host}`);
      const responseType = url.searchParams.get("response_type");
      const redirectUri = url.searchParams.get("redirect_uri");
      const state = url.searchParams.get("state") || "";
      const clientId = url.searchParams.get("client_id") || "brooklyn-client";
      const codeChallenge = url.searchParams.get("code_challenge");
      const codeChallengeMethod = url.searchParams.get("code_challenge_method");

      // Validate required params per tests and PKCE with simple guard clauses
      const sendInvalid = (desc: string) => {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            error: "invalid_request",
            error_description: desc,
          }),
        );
      };

      if (responseType !== "code") {
        return sendInvalid("missing or invalid response_type");
      }
      if (!clientId) {
        return sendInvalid("missing client_id");
      }
      if (!redirectUri) {
        return sendInvalid("missing redirect_uri");
      }
      const pkceValid =
        !!codeChallenge && (codeChallengeMethod === "S256" || codeChallengeMethod === "plain");
      if (!pkceValid) {
        return sendInvalid("missing or invalid PKCE parameters");
      }

      // For local development, provide simple auto-approval
      const authCode = `brooklyn-auth-code-${Date.now()}`;

      const redirectUrl = new URL(redirectUri);
      redirectUrl.searchParams.set("code", authCode);
      redirectUrl.searchParams.set("state", state);

      // Always serve an approval page (works for both manual and automated flows)
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(`
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <title>Brooklyn MCP Authorization</title>
            <style>
              body { 
                font-family: system-ui, -apple-system, sans-serif; 
                max-width: 600px; 
                margin: 2rem auto; 
                padding: 2rem;
                text-align: center;
                background: #f8f9fa;
              }
              .container {
                background: white;
                padding: 2rem;
                border-radius: 8px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
              }
              .success { color: #28a745; }
              .approve-btn {
                background: #28a745;
                color: white;
                padding: 12px 24px;
                border: none;
                border-radius: 4px;
                font-size: 16px;
                cursor: pointer;
                margin: 1rem;
              }
              .approve-btn:hover {
                background: #218838;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>🏛️ Brooklyn MCP</h1>
              <h2>Authorization Request</h2>
              <p><strong>Claude Code</strong> is requesting access to Brooklyn MCP</p>
              <p>Client ID: <code>${clientId}</code></p>
              <p>This will allow Claude Code to use Brooklyn's browser automation tools.</p>
              <button class="approve-btn" onclick="approve()">&#x2705;<!-- ✅ --> Approve Access</button>
              <p><small>This is a local development server. Access is automatically approved.</small></p>
            </div>
            <script>
              function approve() {
                window.location.href = '${redirectUrl.toString()}';
              }
              
              // Auto-approve after 5 seconds if no interaction
              setTimeout(() => {
                if (!document.hidden) approve();
              }, 5000);
            </script>
          </body>
        </html>
      `);
      return;
    }

    // Add a simple auth helper endpoint
    if (req.url === "/oauth/auth-help" && req.method === "GET") {
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(`
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <title>Brooklyn MCP - Manual Authorization</title>
            <style>
              body { 
                font-family: system-ui, -apple-system, sans-serif; 
                max-width: 800px; 
                margin: 2rem auto; 
                padding: 2rem;
                background: #f8f9fa;
              }
              .container {
                background: white;
                padding: 2rem;
                border-radius: 8px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
              }
              .url-box {
                background: #f1f3f4;
                padding: 1rem;
                border-radius: 4px;
                font-family: monospace;
                word-break: break-all;
                border: 1px solid #dadce0;
                margin: 1rem 0;
              }
              .copy-btn {
                background: #1a73e8;
                color: white;
                border: none;
                padding: 8px 16px;
                border-radius: 4px;
                cursor: pointer;
                margin-left: 8px;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>🏛️ Brooklyn MCP - Manual Authorization</h1>
              <h2>OAuth Authorization Helper</h2>
              <h2>Browser didn't open automatically?</h2>
              <p>If Claude Code didn't open a browser window automatically, you can manually complete the authorization:</p>
              
              <h3>Option 1: Copy and paste this URL into your browser</h3>
              <div class="url-box" id="authUrl">
                http://${req.headers.host}/oauth/authorize?response_type=code&client_id=brooklyn-client&redirect_uri=http://${req.headers.host}/oauth/callback&state=manual&code_challenge=manual-dev-pkce&code_challenge_method=plain
              </div>
              <button class="copy-btn" onclick="copyUrl()">&#x1f4cb;<!-- 📋 --> Copy URL</button>
              
              <h3>Option 2: Click this link</h3>
              <p><a href="http://${req.headers.host}/oauth/authorize?response_type=code&client_id=brooklyn-client&redirect_uri=http://${req.headers.host}/oauth/callback&state=manual&code_challenge=manual-dev-pkce&code_challenge_method=plain" target="_blank">
                &#x1f517;<!-- 🔗 --> Open Authorization Page
              </a></p>
              
              <hr>
              <h3>How it works:</h3>
              <ol>
                <li>Click the link or paste the URL into your browser</li>
                <li>You'll see an authorization page</li>
                <li>Click "Approve Access" (or wait 5 seconds for auto-approval)</li>
                <li>Return to Claude Code - it should now be connected</li>
              </ol>
              
              <p><small>
                <strong>Note:</strong> This is for local development. The authorization is automatically approved 
                since you're running Brooklyn on your own machine.
              </small></p>
            </div>
            <script>
              function copyUrl() {
                const url = document.getElementById('authUrl').textContent;
                navigator.clipboard.writeText(url).then(() => {
                  alert('URL copied to clipboard!');
                });
              }
            </script>
          </body>
        </html>
      `);
      return;
    }

    if (req.url === "/oauth/token" && req.method === "POST") {
      // Token endpoint - handle client_credentials and authorization_code (PKCE)
      const contentType = (req.headers["content-type"] || "").toString();

      // Helper to send 400 error
      const sendOauthError = (error: string, description: string) => {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            error,
            error_description: description,
          }),
        );
      };

      let grantType = "";
      let code = "";

      try {
        if (contentType.includes("application/x-www-form-urlencoded")) {
          // Parse URL-encoded form body
          const raw = await new Promise<string>((resolve, reject) => {
            let body = "";
            req.on("data", (chunk) => {
              body += chunk;
            });
            req.on("end", () => resolve(body));
            req.on("error", reject);
          });
          const params = new URLSearchParams(raw);
          grantType = params.get("grant_type") || "";
          code = params.get("code") || "";
        } else if (contentType.includes("application/json")) {
          const body = await this.parseRequestBody(req);
          grantType = (body["grant_type"] as string) || "";
          code = (body["code"] as string) || "";
        } else {
          // Unsupported content type
          return sendOauthError("invalid_request", "unsupported content type");
        }
      } catch {
        return sendOauthError("invalid_request", "malformed request body");
      }

      if (!grantType) {
        return sendOauthError("invalid_request", "missing grant_type");
      }

      if (grantType === "client_credentials") {
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            access_token: "brooklyn-mcp-access-token",
            token_type: "Bearer",
            expires_in: 3600,
            scope: "mcp",
          }),
        );
        return;
      }

      if (grantType === "authorization_code") {
        if (!code?.startsWith("brooklyn-auth-code-")) {
          return sendOauthError("invalid_grant", "invalid authorization code");
        }
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            access_token: "brooklyn-mcp-access-token",
            token_type: "Bearer",
            expires_in: 3600,
            scope: "mcp",
          }),
        );
        return;
      }

      return sendOauthError("invalid_grant", "unsupported grant_type");
    }

    if (req.url === "/oauth/callback") {
      // OAuth callback endpoint - return success for redirect flow
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(`
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <title>Authorization Complete</title>
          </head>
          <body>
            <h1>Brooklyn MCP Authorization Complete</h1>
            <p>You can now close this window and return to Claude Code.</p>
            <script>window.close();</script>
          </body>
        </html>
      `);
      return;
    }

    if (req.url?.startsWith("/oauth/")) {
      // Other OAuth endpoints - return 404 for unsupported endpoints
      res.statusCode = 404;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "OAuth endpoint not supported" }));
      return;
    }

    // Basic connectivity root endpoint
    if (req.url === "/" && req.method === "GET") {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ status: "ok", version: buildConfig.version }));
      return;
    }

    // Health endpoint
    if (req.url === "/health" && req.method === "GET") {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          status: "healthy",
          timestamp: new Date().toISOString(),
          version: buildConfig.version,
        }),
      );
      return;
    }

    // MCP Streamable HTTP: Support both POST (send messages) and GET (SSE stream)
    // IMPORTANT: This check must come AFTER OAuth route handling to avoid blocking OAuth GET endpoints

    // Determine if this is a special endpoint (OAuth, well-known, root, or health)
    const isOAuthEndpoint = !!req.url?.startsWith("/oauth");
    const isWellKnown = !!req.url?.includes(".well-known");
    const isRootEndpoint = req.url === "/";
    const isHealthEndpoint = req.url === "/health";
    const isSpecialEndpoint = isOAuthEndpoint || isWellKnown || isRootEndpoint || isHealthEndpoint;

    if (!isSpecialEndpoint) {
      // For non-special endpoints, enforce MCP rules
      if (req.method === "GET") {
        // GET request for SSE stream (optional per MCP spec)
        const acceptHeader = req.headers.accept;
        if (acceptHeader?.includes("text/event-stream")) {
          this.handleSSEStream(res);
          return;
        }
        res.statusCode = 405;
        res.setHeader("Allow", "GET, POST");
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "GET requires Accept: text/event-stream" }));
        return;
      }

      if (req.method !== "POST") {
        res.statusCode = 405;
        res.setHeader("Allow", "GET, POST");
        res.end();
        return;
      }
    } else if (req.method === "GET") {
      // For special endpoints, GET is allowed
      // SSE stream handling for root endpoint
      if (isRootEndpoint && req.headers.accept?.includes("text/event-stream")) {
        this.handleSSEStream(res);
        return;
      }
      // Continue to process OAuth/health GET endpoints below
    }

    const body = await this.parseRequestBody(req);
    const msg = body as Record<string, unknown>;

    if (!(msg["jsonrpc"] && msg["method"])) {
      // JSON-RPC 2.0: Invalid Request
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32600, message: "Invalid Request" },
        }),
      );
      return;
    }

    const id = msg["id"];
    if (id == null) {
      res.statusCode = 204;
      res.end();
      return;
    }

    let response: Record<string, unknown>;
    try {
      response = await this.processRequest(msg);
    } catch (e) {
      response = this.createErrorResponse(msg["id"], e);
    }

    // Wire compatibility adjustment: ensure Tool.inputSchema (camelCase) per MCP spec
    try {
      const methodName = msg["method"];
      if (methodName === "tools/list") {
        const currentResult = (response as any)?.result;
        if (currentResult && Array.isArray(currentResult.tools)) {
          const transformedTools = currentResult.tools.map((t: any) => {
            if (!t || typeof t !== "object") return t;
            const { input_schema, inputSchema, ...rest } = t;
            const schema = inputSchema ?? input_schema;
            return schema ? { ...rest, inputSchema: schema } : { ...rest };
          });

          response = {
            ...(response as any),
            result: {
              ...currentResult,
              tools: transformedTools,
            },
          };
        }
      }
    } catch {
      // non-fatal: if transform fails, fall back to original response
    }

    // Check if SSE is requested for streaming
    if (req.headers.accept === "text/event-stream") {
      this.handleSSE(res, response);
    } else {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(response));
    }
  }

  private async processRequest(msg: Record<string, unknown>): Promise<Record<string, unknown>> {
    const method = msg["method"] as string;
    const params = msg["params"] as Record<string, unknown> | undefined;
    const id = msg["id"];

    // Trace incoming request
    traceIncomingMCPRequest(method, params || {}, id);

    let response: Record<string, unknown>;

    switch (method) {
      case "initialize": {
        // Spec: server declares its supported protocol version; optionally validate client version
        const clientVersion = (params?.["protocolVersion"] as string | undefined) ?? undefined;
        const serverProtocolVersion = "2025-06-18";

        if (clientVersion && clientVersion !== serverProtocolVersion) {
          // Version mismatch: return JSON-RPC error with informative message
          response = {
            jsonrpc: "2.0",
            id,
            error: {
              code: -32600,
              message: `Unsupported protocolVersion "${clientVersion}". Server supports "${serverProtocolVersion}".`,
              data: { supported: serverProtocolVersion },
            },
          };
        } else {
          response = {
            jsonrpc: "2.0",
            id,
            result: {
              protocolVersion: serverProtocolVersion,
              serverInfo: { name: "brooklyn-mcp-server", version: buildConfig.version },
              capabilities: {
                tools: { listChanged: true },
                roots: {},
                resources: {},
                prompts: {},
              },
            },
          };
        }
        break;
      }
      case "tools/list": {
        if (!this.toolListHandler) {
          response = this.createJsonRpcError(id, -32601, "Method not found: tools/list");
        } else {
          const list = await this.toolListHandler();
          response = { jsonrpc: "2.0", id, result: list };
        }
        break;
      }
      case "tools/call": {
        if (!this.toolCallHandler) {
          response = this.createJsonRpcError(id, -32601, "Method not found: tools/call");
        } else {
          const callParams = params ?? {};
          if (typeof callParams["name"] !== "string") {
            response = this.createJsonRpcError(
              id,
              -32602,
              "Invalid params: 'name' must be a string",
            );
          } else {
            const args = (callParams["arguments"] ?? {}) as Record<string, unknown>;
            const toolInput = {
              name: callParams["name"] as string,
              arguments: args,
            };
            const result = await this.toolCallHandler({
              params: toolInput,
              method,
            });

            // PROTOCOL FIX: Transform to proper MCP format with content array
            // Previous version used direct result format which worked with Claude Code HTTP mode
            // but was not MCP protocol compliant. See docs/development/mcp-protocol-guide.md
            //
            // Original working format (can be restored if needed):
            // response = { jsonrpc: "2.0", id, result };
            //
            // New MCP-compliant format:
            const mcpResponse = {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result),
                },
              ],
            };
            response = {
              jsonrpc: "2.0",
              id,
              result: mcpResponse,
            };
          }
        }
        break;
      }
      default:
        response = this.createJsonRpcError(id, -32601, "Method not found");
        break;
    }

    // Trace outgoing response
    traceOutgoingMCPResponse(method, response, id);
    return response;
  }

  private createErrorResponse(id: unknown, error: unknown): Record<string, unknown> {
    // Map thrown errors to JSON-RPC Internal error by default
    const message = error instanceof Error ? error.message : String(error);
    return this.createJsonRpcError(id, -32603, message);
  }

  private createJsonRpcError(
    id: unknown,
    code: number,
    message: string,
    data?: unknown,
  ): Record<string, unknown> {
    return {
      jsonrpc: "2.0",
      id,
      error: {
        code,
        message,
        ...(data !== undefined ? { data } : {}),
      },
    };
  }

  private handleSSE(res: ServerResponse, response: Record<string, unknown>): void {
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    // Send initial response
    res.write(`data: ${JSON.stringify(response)}\n\n`);

    // For streaming, we can add logic here if needed for notifications
    // For now, close after initial response
    res.end();
  }

  /**
   * Handle GET requests for SSE streams (MCP Streamable HTTP spec)
   */
  private handleSSEStream(res: ServerResponse): void {
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Accept, Mcp-Session-Id, MCP-Protocol-Version",
    );

    // Keep connection alive for potential server-initiated messages
    const keepAlive = setInterval(() => {
      res.write(": heartbeat\n\n");
    }, 30000);

    res.on("close", () => {
      clearInterval(keepAlive);
    });

    // Initial connection event
    res.write(`data: ${JSON.stringify({ type: "connection", status: "ready" })}\n\n`);
  }

  private parseRequestBody(req: IncomingMessage): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const chunks: Array<Buffer> = [];
      // Ensure we always decode as UTF-8 per MCP spec
      req.on("data", (chunk) => {
        if (typeof chunk === "string") {
          chunks.push(Buffer.from(chunk, "utf8"));
        } else {
          chunks.push(chunk as Buffer);
        }
      });
      req.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        if (raw.trim().length === 0) {
          resolve({});
          return;
        }
        try {
          const parsed = JSON.parse(raw);
          resolve(parsed as Record<string, unknown>);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          // Surface a clear JSON parse error back to the caller
          reject(new Error(`JSON Parse error: ${msg}`));
        }
      });
      req.on("error", reject);
    });
  }
}
