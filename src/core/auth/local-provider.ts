/**
 * Local file-based authentication provider for Brooklyn MCP
 * Implements username/password authentication with file-based user store
 */

import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { promisify } from "node:util";

import type { BrooklynConfig } from "../config.js";
import { BaseAuthProvider } from "./base-provider.js";
import type { AuthResult, UserAccount, UserInfo } from "./types.js";
import { AuthenticationError, AuthorizationError } from "./types.js";

const scryptAsync = promisify(scrypt);

/**
 * User store file format
 */
interface UserStore {
  users: { [username: string]: UserAccount };
  version: string;
  lastModified: string;
}

/**
 * Local authentication provider implementation
 */
export class LocalAuthProvider extends BaseAuthProvider {
  readonly name = "local";
  readonly type = "local" as const;

  private userStorePath = "";
  private userStore: UserStore = { users: {}, version: "1.0", lastModified: "" };
  private maxFailedAttempts = 5;
  private lockoutDuration = 300000; // 5 minutes
  private sessionTimeout = 86400000; // 24 hours

  protected async doInitialize(config: BrooklynConfig): Promise<void> {
    const localConfig = config.authentication.providers.local;
    if (!localConfig) {
      throw new AuthenticationError(
        "Local provider configuration missing",
        "MISSING_LOCAL_CONFIG",
        500,
      );
    }

    this.userStorePath = localConfig.userStore;
    this.sessionTimeout = localConfig.sessionTimeout || 86400000;
    this.maxFailedAttempts = localConfig.maxFailedAttempts || 5;
    this.lockoutDuration = localConfig.lockoutDuration || 300000;

    // Ensure user store directory exists
    await mkdir(dirname(this.userStorePath), { recursive: true });

    // Load or create user store
    await this.loadUserStore();

    this.logger.info("Local authentication provider configured", {
      userStorePath: this.userStorePath,
      sessionTimeout: this.sessionTimeout,
      maxFailedAttempts: this.maxFailedAttempts,
      userCount: Object.keys(this.userStore.users).length,
    });
  }

  /**
   * Authenticate user with username and password
   */
  async authenticateCredentials(username: string, password: string): Promise<AuthResult> {
    this.ensureInitialized();

    // Rate limiting by username
    await this.checkRateLimit(`user:${username}`, this.maxFailedAttempts, this.lockoutDuration);

    const user = this.userStore.users[username];
    if (!user) {
      // Don't reveal whether user exists
      this.logger.warn("Authentication attempt for non-existent user", { username });
      throw new AuthenticationError("Invalid username or password", "INVALID_CREDENTIALS", 401);
    }

    // Check if user is locked out
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      this.logger.warn("Authentication attempt for locked user", {
        username,
        lockedUntil: user.lockedUntil,
      });
      throw new AuthenticationError(
        `Account locked until ${user.lockedUntil.toISOString()}`,
        "ACCOUNT_LOCKED",
        423,
        { lockedUntil: user.lockedUntil },
      );
    }

    // Verify password
    const isValidPassword = await this.verifyPassword(password, user.passwordHash);

    if (!isValidPassword) {
      // Increment failed attempts
      user.failedAttempts = (user.failedAttempts || 0) + 1;

      if (user.failedAttempts >= this.maxFailedAttempts) {
        user.lockedUntil = new Date(Date.now() + this.lockoutDuration);
        this.logger.warn("User account locked due to failed attempts", {
          username,
          failedAttempts: user.failedAttempts,
          lockedUntil: user.lockedUntil,
        });
      }

      await this.saveUserStore();

      throw new AuthenticationError("Invalid username or password", "INVALID_CREDENTIALS", 401);
    }

    // Reset failed attempts on successful login
    user.failedAttempts = 0;
    user.lockedUntil = undefined;
    user.lastLoginAt = new Date();
    await this.saveUserStore();

    this.logger.info("User authenticated successfully", {
      username,
      userId: user.id,
      teamId: user.teamId,
    });

    return {
      success: true,
      userId: user.id,
      teamId: user.teamId,
      permissions: user.permissions,
      expiresAt: new Date(Date.now() + this.sessionTimeout),
    };
  }

  /**
   * Validate token (session token for local provider)
   */
  async validateToken(token: string): Promise<AuthResult> {
    this.ensureInitialized();

    const authContext = await this.validateSession(token);
    if (!authContext) {
      return {
        success: false,
        userId: "",
        permissions: [],
      };
    }

    const user = this.getUserById(authContext.userId);
    if (!user) {
      return {
        success: false,
        userId: "",
        permissions: [],
      };
    }

    return {
      success: true,
      userId: authContext.userId,
      teamId: authContext.teamId,
      permissions: authContext.permissions,
      expiresAt: authContext.expiresAt,
      sessionToken: token,
    };
  }

  /**
   * Get user information from user ID
   */
  async getUserInfo(token: string): Promise<UserInfo> {
    this.ensureInitialized();

    const authContext = await this.validateSession(token);
    if (!authContext) {
      throw new AuthenticationError("Invalid session token", "INVALID_TOKEN", 401);
    }

    const user = this.getUserById(authContext.userId);
    if (!user) {
      throw new AuthenticationError("User not found", "USER_NOT_FOUND", 404);
    }

    return {
      id: user.id,
      username: user.username,
      email: user.email,
      displayName: user.username,
    };
  }

  /**
   * Create a new user account
   */
  async createUser(
    username: string,
    password: string,
    options: {
      email?: string;
      teamId?: string;
      permissions?: string[];
      requirePasswordChange?: boolean;
    } = {},
  ): Promise<UserAccount> {
    this.ensureInitialized();

    if (this.userStore.users[username]) {
      throw new AuthenticationError("User already exists", "USER_EXISTS", 409);
    }

    const userId = `user_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const passwordHash = await this.hashPassword(password);

    const user: UserAccount = {
      id: userId,
      username,
      email: options.email,
      passwordHash,
      teamId: options.teamId,
      permissions: options.permissions || ["mcp:basic", "mcp:navigate", "mcp:screenshot"],
      createdAt: new Date(),
      requirePasswordChange: options.requirePasswordChange,
    };

    this.userStore.users[username] = user;
    await this.saveUserStore();

    this.logger.info("User created successfully", {
      username,
      userId,
      teamId: user.teamId,
      permissions: user.permissions,
    });

    return user;
  }

  /**
   * Update user password
   */
  async updatePassword(username: string, newPassword: string): Promise<void> {
    this.ensureInitialized();

    const user = this.userStore.users[username];
    if (!user) {
      throw new AuthenticationError("User not found", "USER_NOT_FOUND", 404);
    }

    user.passwordHash = await this.hashPassword(newPassword);
    user.requirePasswordChange = false;
    user.failedAttempts = 0;
    user.lockedUntil = undefined;

    await this.saveUserStore();

    this.logger.info("User password updated", { username, userId: user.id });
  }

  /**
   * Delete user account
   */
  async deleteUser(username: string): Promise<void> {
    this.ensureInitialized();

    if (!this.userStore.users[username]) {
      throw new AuthenticationError("User not found", "USER_NOT_FOUND", 404);
    }

    delete this.userStore.users[username];
    await this.saveUserStore();

    this.logger.info("User deleted", { username });
  }

  /**
   * List all users
   */
  async listUsers(): Promise<UserAccount[]> {
    this.ensureInitialized();
    return Object.values(this.userStore.users);
  }

  /**
   * Hash password using scrypt
   */
  private async hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16);
    const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
    return `${salt.toString("hex")}:${derivedKey.toString("hex")}`;
  }

  /**
   * Verify password against hash
   */
  private async verifyPassword(password: string, hash: string): Promise<boolean> {
    try {
      const parts = hash.split(":");
      if (parts.length !== 2) {
        return false;
      }

      const [saltHex, keyHex] = parts;
      if (!(saltHex && keyHex)) {
        return false;
      }

      const salt = Buffer.from(saltHex, "hex");
      const key = Buffer.from(keyHex, "hex");
      const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
      return timingSafeEqual(key, derivedKey);
    } catch {
      return false;
    }
  }

  /**
   * Get user by ID
   */
  private getUserById(userId: string): UserAccount | undefined {
    return Object.values(this.userStore.users).find((user) => user.id === userId);
  }

  /**
   * Load user store from file
   */
  private async loadUserStore(): Promise<void> {
    if (!existsSync(this.userStorePath)) {
      // Create empty user store
      this.userStore = {
        users: {},
        version: "1.0",
        lastModified: new Date().toISOString(),
      };
      await this.saveUserStore();
      return;
    }

    try {
      const fileContent = readFileSync(this.userStorePath, "utf8");
      const data = JSON.parse(fileContent);

      // Convert date strings back to Date objects
      for (const user of Object.values(data.users) as UserAccount[]) {
        user.createdAt = new Date(user.createdAt);
        if (user.lastLoginAt) user.lastLoginAt = new Date(user.lastLoginAt);
        if (user.lockedUntil) user.lockedUntil = new Date(user.lockedUntil);
      }

      this.userStore = data;
      this.logger.debug("User store loaded", {
        userCount: Object.keys(this.userStore.users).length,
        version: this.userStore.version,
      });
    } catch (error) {
      this.logger.error("Failed to load user store", {
        path: this.userStorePath,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new AuthenticationError("Failed to load user store", "USER_STORE_ERROR", 500);
    }
  }

  /**
   * Save user store to file
   */
  private async saveUserStore(): Promise<void> {
    try {
      this.userStore.lastModified = new Date().toISOString();
      const content = JSON.stringify(this.userStore, null, 2);
      writeFileSync(this.userStorePath, content, "utf8");
    } catch (error) {
      this.logger.error("Failed to save user store", {
        path: this.userStorePath,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new AuthenticationError("Failed to save user store", "USER_STORE_ERROR", 500);
    }
  }
}
