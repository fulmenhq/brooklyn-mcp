/**
 * MCP Streamable HTTP transport implementation
 * Implements MCP spec for HTTP transport with SSE support
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer } from "node:http";

import { traceIncomingMCPRequest, traceOutgoingMCPResponse } from "../core/mcp-debug-middleware.js";
import type {
  HTTPConfig,
  ToolCallHandler,
  ToolListHandler,
  Transport,
  TransportRequestMetadata,
} from "../core/transport.js";
import { TransportType } from "../core/transport.js";
import { buildConfig } from "../shared/build-config.js";
import { negotiateHandshakeWithMeta } from "../shared/mcp-handshake.js";
import { normalizeCallToolResult } from "../shared/mcp-response.js";
import { getLogger } from "../shared/pino-logger.js";
import type { HttpAuthContext } from "./http-auth-guard.js";
import { HttpAuthError, HttpAuthGuard, isEventStreamRequest } from "./http-auth-guard.js";

/**
 * MCP Streamable HTTP transport
 * Handles JSON-RPC over HTTP POST with optional SSE for streaming
 */
type MCPHTTPRequest = IncomingMessage & { context?: HttpAuthContext };
type JsonRpcPayload = Record<string, unknown>;
type OpenAIToolCall = { id?: string; name: string; arguments: Record<string, unknown> };

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
  private sseClients: Set<ServerResponse> = new Set();
  private sseSessions: Map<string, Set<ServerResponse>> = new Map();
  private readonly config: HTTPConfig;
  private server: ReturnType<typeof createServer> | null = null;
  private running = false;
  private toolListHandler?: ToolListHandler;
  private toolCallHandler?: ToolCallHandler;
  private readonly authGuard: HttpAuthGuard;

  constructor(config: HTTPConfig) {
    this.config = config;
    this.authGuard = new HttpAuthGuard({
      mode: this.config.options.authMode ?? "disabled",
      trustedProxies: this.config.options.trustedProxies ?? [],
      tokenResolver: this.config.options.tokenResolver,
    });
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

      // Add overall timeout to prevent hanging (especially on Windows)
      const overallTimeout = setTimeout(() => {
        this.logger().error("Server start timed out", { port, host });
        this.running = false;
        reject(
          new Error(
            `Server start timed out on port ${port}. The port may be in use or there may be a network issue.`,
          ),
        );
      }, 5000); // 5-second timeout for server start

      // Set up error handler BEFORE calling listen
      const errorHandler = (error: NodeJS.ErrnoException) => {
        clearTimeout(overallTimeout);
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
        // Clear timeout and remove error handler after successful start
        clearTimeout(overallTimeout);
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
    return new Promise((resolve, _reject) => {
      const net = require("node:net");

      // Set up timeout for fail-fast behavior (especially important on Windows)
      const timeout = setTimeout(() => {
        this.logger().warn("Port availability check timed out", { port, host });
        resolve(false); // Assume port is free if we can't determine quickly
      }, 2000); // 2-second timeout

      const tester = net
        .createServer()
        .once("error", (err: NodeJS.ErrnoException) => {
          clearTimeout(timeout);
          if (err.code === "EADDRINUSE") {
            this.logger().debug("Port check: port in use", { port, host, error: err.code });
            resolve(true); // Port is in use
          } else {
            this.logger().debug("Port check: other error, assuming port free", {
              port,
              host,
              error: err.code,
              message: err.message,
            });
            resolve(false); // Some other error, assume port is free
          }
        })
        .once("listening", () => {
          clearTimeout(timeout);
          tester.close(() => {
            this.logger().debug("Port check: port available", { port, host });
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

      for (const client of this.sseClients) {
        try {
          client.end();
          client.socket?.destroy();
        } catch {
          // ignore SSE shutdown errors
        }
      }
      this.sseClients.clear();
      this.sseSessions.clear();

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
    const requestWithContext = req as MCPHTTPRequest;
    const sseRequested = isEventStreamRequest(req);

    const teamResolution = this.resolveTeamFromRequest(req);
    const sessionId = this.resolveSessionId(req);
    if (teamResolution.rewrittenPath && req.url) {
      req.url = teamResolution.rewrittenPath;
    }

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
              <div style="text-align: center; margin-bottom: 2rem;">
                <img src="/assets/icons/fulmen-forge-icon.png" alt="Fulmen Forge" width="80" height="80" style="margin-bottom: 1rem;">
                <h1>Brooklyn MCP - Client Registration</h1>
                <p><em>The MCP Forge for the Fulmen Ecosystem</em></p>
              </div>
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
      const body = (await this.parseRequestBody(req)) as Record<string, unknown>;

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
          const body = (await this.parseRequestBody(req)) as Record<string, unknown>;
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
    if (req.url === "/" && req.method === "GET" && !sseRequested) {
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

    const requiresAuth = this.authGuard.isProtectedEndpoint(req);
    if (requiresAuth) {
      try {
        requestWithContext.context = await this.authGuard.enforce(req);
      } catch (error) {
        if (error instanceof HttpAuthError) {
          this.logger().warn("HTTP auth rejected request", {
            code: error.code,
            url: req.url,
            method: req.method,
          });
          this.respondWithAuthError(res, error);
          return;
        }
        throw error;
      }
    }

    if (teamResolution.teamId) {
      requestWithContext.context = {
        mode: requestWithContext.context?.mode ?? this.config.options.authMode ?? "disabled",
        source: requestWithContext.context?.source ?? "disabled",
        token: requestWithContext.context?.token,
        userId: requestWithContext.context?.userId,
        teamId: teamResolution.teamId,
      };
    }

    const pathOnly = req.url ? req.url.split("?")[0] : "/";
    if (pathOnly === "/v1/chat/completions" && req.method === "POST") {
      await this.handleOpenAIChatCompletions(requestWithContext, res);
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
        if (sseRequested) {
          this.handleSSEStream(requestWithContext, res, sessionId);
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
      if (isRootEndpoint && sseRequested) {
        this.handleSSEStream(requestWithContext, res, sessionId);
        return;
      }
      // Continue to process OAuth/health GET endpoints below
    }

    const body = await this.parseRequestBody(req);
    if (Array.isArray(body)) {
      await this.handleBatchRequest(body, requestWithContext, res, sessionId);
      return;
    }

    if (!body || typeof body !== "object") {
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

    await this.handleSingleRequest(body as JsonRpcPayload, requestWithContext, res, sessionId);
  }

  private async handleSingleRequest(
    msg: JsonRpcPayload,
    req: MCPHTTPRequest,
    res: ServerResponse,
    sessionId: string | undefined,
  ): Promise<void> {
    const sseRequested = isEventStreamRequest(req);
    const shouldStreamResponseOverSse = req.method === "POST" && sseRequested;
    const progressTargets = shouldStreamResponseOverSse
      ? this.prepareOneShotSse(res, sessionId)
      : undefined;

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
      response = await this.processRequest(msg, req, sessionId, progressTargets);
    } catch (e) {
      response = this.createErrorResponse(msg["id"], e);
    }

    response = this.transformToolsListResponse(msg, response);

    if (shouldStreamResponseOverSse) {
      this.writeSseEvent(res, response);
      res.end();
      return;
    }

    if (sseRequested) {
      this.handleSSE(res, response);
      return;
    }

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(response));
  }

  private async handleBatchRequest(
    batch: unknown[],
    req: MCPHTTPRequest,
    res: ServerResponse,
    sessionId: string | undefined,
  ): Promise<void> {
    const responses: Record<string, unknown>[] = [];

    for (const entry of batch) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        responses.push(
          this.createJsonRpcError(null, -32600, "Invalid Request", { reason: "batch entry" }),
        );
        continue;
      }

      const msg = entry as JsonRpcPayload;
      const id = msg["id"];
      const isNotification = id == null;
      if (isNotification) {
        continue;
      }

      try {
        let response = await this.processRequest(msg, req, sessionId, undefined);
        response = this.transformToolsListResponse(msg, response);
        responses.push(response);
      } catch (e) {
        responses.push(this.createErrorResponse(id, e));
      }
    }

    if (responses.length === 0) {
      res.statusCode = 204;
      res.end();
      return;
    }

    if (req.method === "POST" && isEventStreamRequest(req)) {
      this.prepareOneShotSse(res, sessionId);
      this.writeSseEvent(res, responses);
      res.end();
      return;
    }

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(responses));
  }

  private async processRequest(
    msg: Record<string, unknown>,
    req: MCPHTTPRequest,
    sessionId: string | undefined,
    progressTargets: Set<ServerResponse> | undefined,
  ): Promise<Record<string, unknown>> {
    const method = msg["method"] as string;
    const params = msg["params"] as Record<string, unknown> | undefined;
    const id = msg["id"];

    // Trace incoming request
    traceIncomingMCPRequest(method, params || {}, id);

    let response: Record<string, unknown>;

    switch (method) {
      case "initialize": {
        const clientVersion = (params?.["protocolVersion"] as string | undefined) ?? undefined;
        const { result: negotiation, meta } = negotiateHandshakeWithMeta(clientVersion);

        if (!negotiation.ok) {
          response = {
            jsonrpc: "2.0",
            id,
            error: negotiation.error,
          };
        } else {
          this.logger().info("MCP HTTP handshake negotiated", {
            requestedProtocolVersion: meta.requestedProtocolVersion ?? "unspecified",
            negotiatedProtocolVersion: meta.negotiatedProtocolVersion,
            transport: this.name,
          });
          response = {
            jsonrpc: "2.0",
            id,
            result: negotiation.payload,
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
            const metadata = this.buildRequestMetadata(req);
            const progressToken = (callParams["_meta"] as Record<string, unknown> | undefined)?.[
              "progressToken"
            ];
            if (progressToken !== undefined) {
              this.emitProgress(sessionId, progressTargets, {
                progressToken: String(progressToken),
                progress: 0,
                message: "started",
              });
            }
            const result = await this.toolCallHandler(
              {
                params: toolInput,
                method,
              },
              metadata,
            );

            response = {
              jsonrpc: "2.0",
              id,
              result: normalizeCallToolResult(result),
            };

            if (progressToken !== undefined) {
              this.emitProgress(sessionId, progressTargets, {
                progressToken: String(progressToken),
                progress: 1,
                message: "completed",
              });
            }
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
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Accept, Authorization, Mcp-Session-Id, MCP-Protocol-Version, X-Team-Id",
    );

    // Send initial response
    res.write(`data: ${JSON.stringify(response)}\n\n`);

    this.sseClients.add(res);

    const keepAlive = setInterval(() => {
      if (res.closed) {
        clearInterval(keepAlive);
        this.sseClients.delete(res);
        return;
      }
      res.write(`: heartbeat\n\n`);
    }, 30000);

    res.on("close", () => {
      clearInterval(keepAlive);
      this.sseClients.delete(res);
    });
  }

  private respondWithAuthError(res: ServerResponse, error: HttpAuthError): void {
    if (res.headersSent) {
      res.end();
      return;
    }

    res.statusCode = error.statusCode;
    res.setHeader("Content-Type", "application/json");
    if (error.code === "AUTH_REQUIRED" || error.code === "INVALID_TOKEN") {
      res.setHeader("WWW-Authenticate", 'Bearer realm="brooklyn-mcp"');
    }
    res.end(
      JSON.stringify({
        error: {
          code: error.code,
          message: error.message,
        },
      }),
    );
  }

  private buildRequestMetadata(req: MCPHTTPRequest): TransportRequestMetadata {
    return {
      transport: this.name,
      userId: req.context?.userId,
      teamId: req.context?.teamId,
      sessionId: this.resolveSessionId(req),
      auth: req.context,
    };
  }

  private emitProgress(
    sessionId: string | undefined,
    overrideTargets: Set<ServerResponse> | undefined,
    params: {
      progressToken: string;
      progress: number;
      message?: string;
    },
  ): void {
    const targets = overrideTargets ?? this.getProgressTargets(sessionId);

    if (!targets || targets.size === 0) {
      return;
    }
    const payload = {
      jsonrpc: "2.0",
      method: "notifications/progress",
      params: {
        progressToken: params.progressToken,
        progress: params.progress,
        message: params.message,
      },
    };
    const event = `data: ${JSON.stringify(payload)}\n\n`;
    for (const client of targets) {
      client.write(event);
    }
  }

  private parseRequestBody(req: IncomingMessage): Promise<unknown> {
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
          const parsed: unknown = JSON.parse(raw);
          resolve(parsed);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          // Surface a clear JSON parse error back to the caller
          reject(new Error(`JSON Parse error: ${msg}`));
        }
      });
      req.on("error", reject);
    });
  }

  private transformToolsListResponse(
    msg: JsonRpcPayload,
    response: Record<string, unknown>,
  ): Record<string, unknown> {
    // Wire compatibility adjustment: ensure Tool.inputSchema (camelCase) per MCP spec
    try {
      const methodName = msg["method"];
      if (methodName !== "tools/list") {
        return response;
      }

      const currentResult = (response as any)?.result;
      const tools = currentResult?.tools;
      if (!Array.isArray(tools)) {
        return response;
      }

      const transformedTools = tools.map((t: any) => {
        if (!t || typeof t !== "object") return t;
        const { input_schema, inputSchema, ...rest } = t;
        const schema = inputSchema ?? input_schema;
        return schema ? { ...rest, inputSchema: schema } : { ...rest };
      });

      return {
        ...(response as any),
        result: {
          ...currentResult,
          tools: transformedTools,
        },
      };
    } catch {
      return response;
    }
  }

  private resolveSessionId(req: IncomingMessage): string | undefined {
    const value = getHeaderValue(req, "mcp-session-id");
    if (!value) {
      return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  private resolveTeamFromRequest(req: IncomingMessage): {
    teamId?: string;
    rewrittenPath?: string;
  } {
    const headerTeamId = getHeaderValue(req, "x-team-id")?.trim();
    if (headerTeamId) {
      return { teamId: headerTeamId };
    }

    const url = req.url ?? "/";
    const [path, queryString] = url.split("?", 2);
    const searchParams = new URLSearchParams(queryString ?? "");

    const queryTeamId = searchParams.get("team")?.trim();
    if (queryTeamId) {
      return { teamId: queryTeamId };
    }

    const segments = (path ?? "/").split("/").filter((s) => s.length > 0);
    if (segments[0] === "team") {
      const pathTeamId = segments[1]?.trim();
      if (pathTeamId) {
        const rest = segments.slice(2);
        const rewrittenPathBase = `/${rest.join("/")}`;
        const rewrittenPath = `${rewrittenPathBase === "/" ? "/" : rewrittenPathBase}${
          queryString ? `?${queryString}` : ""
        }`;
        return { teamId: pathTeamId, rewrittenPath };
      }
    }

    return {};
  }

  private handleSSEStream(
    req: MCPHTTPRequest,
    res: ServerResponse,
    sessionId: string | undefined,
  ): void {
    const resolvedSessionId = sessionId ?? this.generateSessionId();
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("Mcp-Session-Id", resolvedSessionId);
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Accept, Authorization, Mcp-Session-Id, MCP-Protocol-Version, X-Team-Id",
    );
    res.flushHeaders();

    const existing = this.sseSessions.get(resolvedSessionId);
    if (existing) {
      existing.add(res);
    } else {
      this.sseSessions.set(resolvedSessionId, new Set([res]));
    }

    this.sseClients.add(res);

    const keepAlive = setInterval(() => {
      if (res.closed) {
        clearInterval(keepAlive);
        this.unregisterSseClient(resolvedSessionId, res);
        return;
      }
      res.write(": heartbeat\n\n");
    }, 30000);

    res.on("close", () => {
      clearInterval(keepAlive);
      this.unregisterSseClient(resolvedSessionId, res);
    });

    const initialEvent = {
      type: "connection",
      status: "ready",
      sessionId: resolvedSessionId,
      teamId: req.context?.teamId,
    };
    this.writeSseEvent(res, initialEvent);
  }

  private unregisterSseClient(sessionId: string, res: ServerResponse): void {
    const session = this.sseSessions.get(sessionId);
    if (session) {
      session.delete(res);
      if (session.size === 0) {
        this.sseSessions.delete(sessionId);
      }
    }
    this.sseClients.delete(res);
  }

  private generateSessionId(): string {
    return `mcp_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  private getProgressTargets(sessionId: string | undefined): Set<ServerResponse> | undefined {
    if (sessionId) {
      const sessionTargets = this.sseSessions.get(sessionId);
      if (sessionTargets) {
        return sessionTargets;
      }
    }
    return this.sseClients;
  }

  private prepareOneShotSse(
    res: ServerResponse,
    sessionId: string | undefined,
  ): Set<ServerResponse> {
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    if (sessionId) {
      res.setHeader("Mcp-Session-Id", sessionId);
    }
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Accept, Authorization, Mcp-Session-Id, MCP-Protocol-Version, X-Team-Id",
    );
    res.flushHeaders();
    return new Set([res]);
  }

  private writeSseEvent(res: ServerResponse, payload: unknown): void {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  }

  private writeSseDone(res: ServerResponse): void {
    res.write("data: [DONE]\n\n");
  }

  private async handleOpenAIChatCompletions(
    req: MCPHTTPRequest,
    res: ServerResponse,
  ): Promise<void> {
    if (!(this.toolListHandler && this.toolCallHandler)) {
      res.statusCode = 503;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: { message: "Server not ready" } }));
      return;
    }

    const rawBody = (await this.parseRequestBody(req)) as Record<string, unknown>;
    const model = (rawBody["model"] as string) ?? "unknown";
    const created = Math.floor(Date.now() / 1000);
    const responseId = `chatcmpl_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

    const streamingRequested = Boolean(rawBody["stream"]) || isEventStreamRequest(req);
    if (streamingRequested) {
      this.prepareOneShotSse(res, this.resolveSessionId(req));
    } else {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
    }

    const toolCalls = this.extractOpenAiToolCalls(rawBody);
    const mcpTools = await this.toolListHandler();
    const openAiTools = (mcpTools.tools ?? []).map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.inputSchema,
      },
    }));

    if (toolCalls.length === 0) {
      const message = {
        role: "assistant",
        content:
          "Brooklyn MCP OpenAI compatibility wrapper is active. Provide tool_calls to execute MCP tools.",
      };

      const payload = {
        id: responseId,
        object: streamingRequested ? "chat.completion.chunk" : "chat.completion",
        created,
        model,
        choices: [
          {
            index: 0,
            ...(streamingRequested ? { delta: message, finish_reason: null } : { message }),
            finish_reason: streamingRequested ? null : "stop",
          },
        ],
        brooklyn: {
          note: "Use MCP-native HTTP where possible; this wrapper is for OpenAI-style clients.",
          tools: openAiTools,
        },
      };

      if (streamingRequested) {
        this.writeSseEvent(res, payload);
        this.writeSseEvent(res, { choices: [{ index: 0, delta: {}, finish_reason: "stop" }] });
        this.writeSseDone(res);
        res.end();
        return;
      }

      res.end(JSON.stringify(payload));
      return;
    }

    const metadata = this.buildRequestMetadata(req);
    const results: Array<{ id?: string; name: string; result: unknown }> = [];

    for (const call of toolCalls) {
      const result = await this.toolCallHandler(
        {
          method: "tools/call",
          params: { name: call.name, arguments: call.arguments },
        },
        metadata,
      );

      results.push({
        id: call.id,
        name: call.name,
        result,
      });

      if (streamingRequested) {
        this.writeSseEvent(res, {
          id: responseId,
          object: "chat.completion.chunk",
          created,
          model,
          choices: [
            {
              index: 0,
              delta: {
                role: "assistant",
                content: JSON.stringify({ tool: call.name, result }),
              },
              finish_reason: null,
            },
          ],
        });
      }
    }

    if (streamingRequested) {
      this.writeSseEvent(res, { choices: [{ index: 0, delta: {}, finish_reason: "stop" }] });
      this.writeSseDone(res);
      res.end();
      return;
    }

    res.end(
      JSON.stringify({
        id: responseId,
        object: "chat.completion",
        created,
        model,
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: JSON.stringify({ results }),
            },
            finish_reason: "stop",
          },
        ],
      }),
    );
  }

  private extractOpenAiToolCalls(body: Record<string, unknown>): OpenAIToolCall[] {
    const calls: unknown[] = [];

    if (Array.isArray(body["tool_calls"])) {
      calls.push(...(body["tool_calls"] as unknown[]));
    }

    const messages = body["messages"];
    if (Array.isArray(messages)) {
      const last = messages[messages.length - 1];
      if (last && typeof last === "object") {
        const lastToolCalls = (last as Record<string, unknown>)["tool_calls"];
        if (Array.isArray(lastToolCalls)) {
          calls.push(...lastToolCalls);
        }
      }
    }

    const functionCall = body["function_call"];
    if (functionCall && typeof functionCall === "object" && !Array.isArray(functionCall)) {
      calls.push({ type: "function", function: functionCall });
    }

    const parsed: OpenAIToolCall[] = [];
    for (const entry of calls) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        continue;
      }

      const record = entry as Record<string, unknown>;
      const fn = record["function"];
      if (!fn || typeof fn !== "object" || Array.isArray(fn)) {
        continue;
      }

      const name = (fn as Record<string, unknown>)["name"];
      if (typeof name !== "string" || name.trim().length === 0) {
        continue;
      }

      const rawArgs = (fn as Record<string, unknown>)["arguments"];
      const args = this.parseOpenAiArguments(rawArgs);
      const id = typeof record["id"] === "string" ? (record["id"] as string) : undefined;
      parsed.push({ id, name, arguments: args });
    }

    return parsed;
  }

  private parseOpenAiArguments(raw: unknown): Record<string, unknown> {
    if (!raw) {
      return {};
    }
    if (typeof raw === "string") {
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
        return {};
      } catch {
        return {};
      }
    }
    if (typeof raw === "object" && !Array.isArray(raw)) {
      return raw as Record<string, unknown>;
    }
    return {};
  }
}

function getHeaderValue(req: IncomingMessage, name: string): string | undefined {
  const lower = name.toLowerCase();
  const headers = (req as IncomingMessage).headers;
  if (!headers) {
    return undefined;
  }
  const raw = headers[lower] ?? (headers as Record<string, unknown>)[name];
  if (!raw) {
    return undefined;
  }
  return Array.isArray(raw) ? raw[0] : String(raw);
}
