/**
 * GitHub OAuth authentication provider for Brooklyn MCP
 * Implements OAuth 2.0 flow with organization and team validation
 */

import type { BrooklynConfig } from "../config.js";
import { BaseAuthProvider } from "./base-provider.js";
import type { AuthResult, OrganizationInfo, TeamInfo, TokenResult, UserInfo } from "./types.js";
import { AuthenticationError, AuthorizationError } from "./types.js";

/**
 * GitHub API response types
 */
interface GitHubUser {
  id: number;
  login: string;
  email?: string;
  name?: string;
  avatar_url?: string;
}

interface GitHubOrganization {
  id: number;
  login: string;
  role: string;
}

interface GitHubTeam {
  id: number;
  name: string;
  organization: {
    id: number;
    login: string;
  };
}

/**
 * GitHub OAuth provider implementation
 */
export class GitHubAuthProvider extends BaseAuthProvider {
  readonly name = "github";
  readonly type = "github" as const;

  private clientId = "";
  private clientSecret = "";
  private callbackUrl = "";
  private scopes: string[] = ["user:email", "read:org"];
  private allowedOrgs?: string[];
  private allowedTeams?: { [org: string]: string[] };

  protected async doInitialize(config: BrooklynConfig): Promise<void> {
    const githubConfig = config.authentication.providers.github;
    if (!githubConfig) {
      throw new AuthenticationError(
        "GitHub provider configuration missing",
        "MISSING_GITHUB_CONFIG",
        500,
      );
    }

    this.clientId = githubConfig.clientId;
    this.clientSecret = githubConfig.clientSecret;
    this.callbackUrl = githubConfig.callbackUrl;
    this.scopes = githubConfig.scopes || ["user:email", "read:org"];
    this.allowedOrgs = githubConfig.allowedOrgs;
    this.allowedTeams = githubConfig.allowedTeams;

    // Validate required configuration
    if (!(this.clientId && this.clientSecret)) {
      throw new AuthenticationError(
        "GitHub OAuth client ID and secret are required",
        "INVALID_GITHUB_CONFIG",
        500,
      );
    }

    this.logger.info("GitHub OAuth provider configured", {
      clientId: `${this.clientId.slice(0, 8)}...`,
      scopes: this.scopes,
      allowedOrgs: this.allowedOrgs,
      allowedTeams: this.allowedTeams ? Object.keys(this.allowedTeams) : undefined,
    });
  }

  /**
   * Get authorization URL for OAuth flow
   */
  getAuthorizationUrl(state: string, codeChallenge?: string): string {
    this.ensureInitialized();

    const authUrl = new URL("https://github.com/login/oauth/authorize");
    authUrl.searchParams.set("client_id", this.clientId);
    authUrl.searchParams.set("redirect_uri", this.callbackUrl);
    authUrl.searchParams.set("scope", this.scopes.join(" "));
    authUrl.searchParams.set("state", state);
    authUrl.searchParams.set("response_type", "code");

    // GitHub doesn't support PKCE, but we accept the parameter for interface compatibility
    if (codeChallenge) {
      this.logger.debug("PKCE challenge provided but not used (GitHub doesn't support PKCE)");
    }

    return authUrl.toString();
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(
    code: string,
    state: string,
    codeVerifier?: string,
  ): Promise<TokenResult> {
    this.ensureInitialized();

    // GitHub doesn't use PKCE
    if (codeVerifier) {
      this.logger.debug("PKCE verifier provided but not used (GitHub doesn't support PKCE)");
    }

    try {
      const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "Brooklyn-MCP/1.6.0",
        },
        body: new URLSearchParams({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          code,
          redirect_uri: this.callbackUrl,
          state,
        }),
      });

      if (!tokenResponse.ok) {
        throw new AuthenticationError(
          "GitHub token exchange failed",
          "TOKEN_EXCHANGE_FAILED",
          tokenResponse.status,
        );
      }

      const tokenData = await tokenResponse.json();

      if (tokenData.error) {
        throw new AuthenticationError(
          `GitHub OAuth error: ${tokenData.error_description || tokenData.error}`,
          "GITHUB_OAUTH_ERROR",
          400,
        );
      }

      return {
        accessToken: tokenData.access_token,
        tokenType: tokenData.token_type || "bearer",
        scope: tokenData.scope,
      };
    } catch (error) {
      this.logger.error("GitHub token exchange failed", {
        error: error instanceof Error ? error.message : String(error),
      });

      if (error instanceof AuthenticationError) {
        throw error;
      }

      throw new AuthenticationError(
        "Failed to exchange GitHub authorization code",
        "TOKEN_EXCHANGE_ERROR",
        500,
      );
    }
  }

  /**
   * Validate GitHub access token
   */
  async validateToken(token: string): Promise<AuthResult> {
    this.ensureInitialized();

    try {
      const userInfo = await this.getUserInfo(token);

      // Validate organization and team membership
      await this.validateUserAccess(token, userInfo);

      // Extract permissions based on organization/team membership
      const permissions = await this.getUserPermissions(token, userInfo);

      return {
        success: true,
        userId: userInfo.id,
        teamId: this.getTeamId(userInfo),
        permissions,
        expiresAt: undefined, // GitHub tokens don't have expiration
      };
    } catch (error) {
      this.logger.warn("GitHub token validation failed", {
        error: error instanceof Error ? error.message : String(error),
      });

      if (error instanceof AuthenticationError || error instanceof AuthorizationError) {
        throw error;
      }

      return {
        success: false,
        userId: "",
        permissions: [],
      };
    }
  }

  /**
   * Get user information from GitHub
   */
  async getUserInfo(token: string): Promise<UserInfo> {
    this.ensureInitialized();

    try {
      // Get user profile
      const userResponse = await this.makeGitHubRequest("/user", token);
      const userData: GitHubUser = await userResponse.json();

      // Get user organizations
      const orgsResponse = await this.makeGitHubRequest("/user/orgs", token);
      const orgsData: GitHubOrganization[] = await orgsResponse.json();

      // Get user teams (if org access is available)
      const teamsData: GitHubTeam[] = [];
      for (const org of orgsData) {
        try {
          const teamsResponse = await this.makeGitHubRequest(`/user/teams?org=${org.login}`, token);
          const orgTeams: GitHubTeam[] = await teamsResponse.json();
          teamsData.push(...orgTeams);
        } catch (error) {
          // Team access might not be available for all orgs
          this.logger.debug("Could not fetch teams for organization", {
            org: org.login,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      return {
        id: userData.id.toString(),
        username: userData.login,
        email: userData.email,
        displayName: userData.name || userData.login,
        avatarUrl: userData.avatar_url,
        organizations: orgsData.map((org) => ({
          id: org.id.toString(),
          name: org.login,
          role: org.role,
        })),
        teams: teamsData.map((team) => ({
          id: team.id.toString(),
          name: team.name,
          organizationId: team.organization.id.toString(),
        })),
      };
    } catch (error) {
      this.logger.error("Failed to get GitHub user info", {
        error: error instanceof Error ? error.message : String(error),
      });

      throw new AuthenticationError(
        "Failed to retrieve user information from GitHub",
        "GITHUB_USER_INFO_ERROR",
        500,
      );
    }
  }

  /**
   * Validate user access based on organization and team membership
   */
  private async validateUserAccess(_token: string, userInfo: UserInfo): Promise<void> {
    // If no restrictions are configured, allow all authenticated users
    if (!(this.allowedOrgs || this.allowedTeams)) {
      return;
    }

    const userOrgs = userInfo.organizations?.map((org) => org.name) || [];
    const userTeams = userInfo.teams || [];

    // Check organization access
    if (this.allowedOrgs) {
      const hasOrgAccess = this.allowedOrgs.some((allowedOrg) => userOrgs.includes(allowedOrg));

      if (!hasOrgAccess) {
        throw new AuthorizationError(
          `User is not a member of allowed organizations: ${this.allowedOrgs.join(", ")}`,
          "INSUFFICIENT_ORGANIZATION_ACCESS",
          403,
          {
            userOrganizations: userOrgs,
            allowedOrganizations: this.allowedOrgs,
          },
        );
      }
    }

    // Check team access (more specific than org access)
    // Note: Organization admins bypass team restrictions
    if (this.allowedTeams) {
      // Check if user is an admin in any of the allowed organizations
      const isOrgAdmin = userInfo.organizations?.some(
        (org) => this.allowedOrgs?.includes(org.name) && org.role === "admin",
      );

      const hasTeamAccess =
        isOrgAdmin ||
        Object.entries(this.allowedTeams).some(([org, teams]) => {
          const userTeamsInOrg = userTeams
            .filter((team) => {
              const orgName = userInfo.organizations?.find(
                (o) => o.id === team.organizationId,
              )?.name;
              return orgName === org;
            })
            .map((team) => team.name);

          return teams.some((allowedTeam) => userTeamsInOrg.includes(allowedTeam));
        });

      if (!hasTeamAccess) {
        const allowedTeamsList = Object.entries(this.allowedTeams)
          .map(([org, teams]) => `${org}: ${teams.join(", ")}`)
          .join("; ");

        throw new AuthorizationError(
          `User is not a member of allowed teams: ${allowedTeamsList}`,
          "INSUFFICIENT_TEAM_ACCESS",
          403,
          {
            userTeams: userTeams.map((t) => t.name),
            allowedTeams: this.allowedTeams,
          },
        );
      }
    }
  }

  /**
   * Get user permissions based on organization and team membership
   */
  private async getUserPermissions(_token: string, userInfo: UserInfo): Promise<string[]> {
    const permissions: string[] = ["mcp:basic"];

    // Add organization-based permissions
    if (userInfo.organizations) {
      for (const org of userInfo.organizations) {
        if (org.role === "admin") {
          permissions.push("mcp:admin", "mcp:manage-users");
        } else if (org.role === "member") {
          permissions.push("mcp:member");
        }
      }
    }

    // Add team-based permissions
    if (userInfo.teams) {
      for (const team of userInfo.teams) {
        // Add team-specific permissions
        permissions.push(`mcp:team:${team.name}`);
      }
    }

    // Default MCP permissions for authenticated users
    permissions.push("mcp:navigate", "mcp:screenshot", "mcp:browser");

    return [...new Set(permissions)]; // Remove duplicates
  }

  /**
   * Get team ID for user (use primary organization)
   */
  private getTeamId(userInfo: UserInfo): string | undefined {
    if (userInfo.organizations && userInfo.organizations.length > 0) {
      // Use the first organization as the team ID
      return userInfo.organizations[0]?.name;
    }
    return undefined;
  }

  /**
   * Make authenticated request to GitHub API
   */
  private async makeGitHubRequest(endpoint: string, token: string): Promise<Response> {
    const url = `https://api.github.com${endpoint}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "Brooklyn-MCP/1.6.0",
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new AuthenticationError(
        `GitHub API request failed: ${response.status} ${response.statusText}`,
        "GITHUB_API_ERROR",
        response.status,
        { endpoint, error },
      );
    }

    return response;
  }
}
