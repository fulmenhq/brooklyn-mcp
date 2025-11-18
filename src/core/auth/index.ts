/**
 * Authentication module exports for Brooklyn MCP
 * Enterprise authentication with multiple provider support
 */

// Authentication manager
export { BrooklynAuthManager } from "./auth-manager.js";
// Provider interfaces
export type { AuthManager, AuthProvider } from "./auth-provider.js";
// Base provider
export { BaseAuthProvider } from "./base-provider.js";
// Authentication providers
export { GitHubAuthProvider } from "./github-provider.js";
export { LocalAuthProvider } from "./local-provider.js";
export { NoneAuthProvider } from "./none-provider.js";
// Types and interfaces
export type {
  AuthContext,
  AuthResult,
  OrganizationInfo,
  RateLimitInfo,
  Session,
  TeamInfo,
  TokenResult,
  UserAccount,
  UserInfo,
} from "./types.js";
export { AuthenticationError, AuthorizationError } from "./types.js";
