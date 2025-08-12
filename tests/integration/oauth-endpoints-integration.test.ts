/**
 * OAuth Endpoints Integration Test
 * Validates OAuth PKCE implementation and endpoint functionality
 */

import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { BrooklynEngine } from "../../src/core/brooklyn-engine.js";
import { loadConfig } from "../../src/core/config.js";
import { initializeLogging } from "../../src/shared/pino-logger.js";
import { createHTTP } from "../../src/transports/index.js";

describe("OAuth Endpoints Integration", () => {
  let engine: BrooklynEngine;
  let baseUrl: string;
  const testPort = 3001; // Use different port to avoid conflicts
  const testHost = "localhost";

  beforeAll(async () => {
    // Initialize configuration for testing
    const config = await loadConfig({
      teamId: "oauth-test",
      logging: { level: "error", format: "json" }, // Minimize test noise
    });

    await initializeLogging(config);

    // Dynamic import to avoid top-level side effects
    const { BrooklynEngine } = await import("../../src/core/brooklyn-engine.js");

    engine = new BrooklynEngine({
      config,
      correlationId: "oauth-integration-test",
    });

    await engine.initialize();

    // Create HTTP transport for OAuth endpoints
    const httpTransport = await createHTTP(testPort, testHost, true);
    await engine.addTransport("http", httpTransport);
    await engine.startTransport("http");

    baseUrl = `http://${testHost}:${testPort}`;

    // Wait for server to be ready
    await new Promise((resolve) => setTimeout(resolve, 1000));
  });

  afterAll(async () => {
    if (engine) {
      await engine.cleanup();
    }
  });

  test("basic connectivity", async () => {
    const response = await fetch(baseUrl, {
      headers: {
        "User-Agent": "Brooklyn OAuth Integration Test",
      },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
  });

  test("oauth discovery endpoint", async () => {
    const response = await fetch(`${baseUrl}/.well-known/oauth-authorization-server`, {
      headers: {
        "User-Agent": "Brooklyn OAuth Integration Test",
      },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");

    const discoveryData = await response.json();

    // Validate OAuth 2.0 Authorization Server Metadata (RFC 8414)
    expect(discoveryData).toMatchObject({
      issuer: expect.stringContaining(baseUrl),
      authorization_endpoint: expect.stringContaining("/oauth/authorize"),
      token_endpoint: expect.stringContaining("/oauth/token"),
      registration_endpoint: expect.stringContaining("/oauth/register"),
      code_challenge_methods_supported: expect.arrayContaining(["S256"]),
      response_types_supported: expect.arrayContaining(["code"]),
      grant_types_supported: expect.arrayContaining(["authorization_code"]),
    });
  });

  test("auth help page", async () => {
    const response = await fetch(`${baseUrl}/oauth/auth-help`, {
      headers: {
        "User-Agent": "Brooklyn OAuth Integration Test",
      },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");

    const html = await response.text();
    expect(html).toContain("OAuth Authorization Helper");
    expect(html).toContain("Manual Authorization");
    expect(html.length).toBeGreaterThan(100);
  });

  test("authorization endpoint with valid params", async () => {
    const authUrl = new URL(`${baseUrl}/oauth/authorize`);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("client_id", "brooklyn-test-client");
    authUrl.searchParams.set("redirect_uri", `${baseUrl}/oauth/callback`);
    authUrl.searchParams.set("state", "integration-test-state");
    authUrl.searchParams.set("code_challenge", "test-challenge");
    authUrl.searchParams.set("code_challenge_method", "S256");

    const response = await fetch(authUrl.toString(), {
      headers: {
        "User-Agent": "Brooklyn OAuth Integration Test",
      },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");

    const html = await response.text();
    expect(html).toContain("Authorization Request");
    expect(html).toContain("brooklyn-test-client");
  });

  test("authorization endpoint missing params", async () => {
    const response = await fetch(`${baseUrl}/oauth/authorize`, {
      headers: {
        "User-Agent": "Brooklyn OAuth Integration Test",
      },
    });

    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toContain("application/json");

    const errorData = await response.json();
    expect(errorData).toMatchObject({
      error: "invalid_request",
      error_description: expect.stringContaining("missing"),
    });
  });

  test("registration endpoint GET", async () => {
    const response = await fetch(`${baseUrl}/oauth/register`, {
      headers: {
        "User-Agent": "Brooklyn OAuth Integration Test",
      },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");

    const html = await response.text();
    expect(html).toContain("Client Registration");
    expect(html).toContain("form");
  });

  test("registration endpoint POST with valid data", async () => {
    const registrationData = {
      client_name: "Brooklyn Integration Test Client",
      redirect_uris: [`${baseUrl}/oauth/callback`],
      client_uri: baseUrl,
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "none", // PKCE client
    };

    const response = await fetch(`${baseUrl}/oauth/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Brooklyn OAuth Integration Test",
      },
      body: JSON.stringify(registrationData),
    });

    expect(response.status).toBe(201);
    expect(response.headers.get("content-type")).toContain("application/json");

    const clientData = await response.json();
    expect(clientData).toMatchObject({
      client_id: expect.any(String),
      client_name: "Brooklyn Integration Test Client",
      redirect_uris: expect.arrayContaining([`${baseUrl}/oauth/callback`]),
      grant_types: expect.arrayContaining(["authorization_code"]),
      token_endpoint_auth_method: "none",
    });

    expect(clientData.client_id.length).toBeGreaterThan(10);
  });

  test("token endpoint with invalid request", async () => {
    const response = await fetch(`${baseUrl}/oauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Brooklyn OAuth Integration Test",
      },
      body: "grant_type=authorization_code&code=invalid",
    });

    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toContain("application/json");

    const errorData = await response.json();
    expect(errorData).toMatchObject({
      error: expect.stringMatching(/^(invalid_request|invalid_grant|invalid_client)$/),
      error_description: expect.any(String),
    });
  });

  test("health endpoint", async () => {
    const response = await fetch(`${baseUrl}/health`, {
      headers: {
        "User-Agent": "Brooklyn OAuth Integration Test",
      },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");

    const healthData = await response.json();
    expect(healthData).toMatchObject({
      status: "healthy",
      timestamp: expect.any(String),
      version: expect.any(String),
    });
  });
});
