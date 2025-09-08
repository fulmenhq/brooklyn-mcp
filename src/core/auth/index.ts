/**
 * Authentication module exports for Brooklyn MCP
 * Enterprise authentication with multiple provider support
 */

// Types and interfaces
export type {
  AuthResult,
  UserInfo,
  OrganizationInfo,
  TeamInfo,
  TokenResult,
  AuthContext,
  Session,
  UserAccount,
  RateLimitInfo,
} from "./types.js";

export { AuthenticationError, AuthorizationError } from "./types.js";

// Provider interfaces
export type { AuthProvider, AuthManager } from "./auth-provider.js";

// Base provider
export { BaseAuthProvider } from "./base-provider.js";

// Authentication providers
export { GitHubAuthProvider } from "./github-provider.js";
export { LocalAuthProvider } from "./local-provider.js";
export { NoneAuthProvider } from "./none-provider.js";

// Authentication manager
export { BrooklynAuthManager } from "./auth-manager.js";
