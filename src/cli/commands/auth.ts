/**
 * Authentication management CLI commands for Brooklyn MCP
 * Provides user management for local authentication provider
 */

import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";

import { Command } from "commander";
import inquirer from "inquirer";

import type { UserAccount } from "../../core/auth/types.js";
import type { BrooklynConfig } from "../../core/config.js";
import { configManager } from "../../core/config.js";

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
 * Auth command utilities
 */
namespace AuthCommandUtils {
  /**
   * Load user store from file
   */
  export async function loadUserStore(userStorePath: string): Promise<UserStore> {
    if (!existsSync(userStorePath)) {
      return {
        users: {},
        version: "1.0",
        lastModified: new Date().toISOString(),
      };
    }

    try {
      const content = readFileSync(userStorePath, "utf8");
      const store = JSON.parse(content) as UserStore;
      return store;
    } catch (error) {
      throw new Error(
        `Failed to load user store: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Save user store to file
   */
  export async function saveUserStore(userStorePath: string, store: UserStore): Promise<void> {
    try {
      // Ensure directory exists
      const dir = dirname(userStorePath);
      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true });
      }

      store.lastModified = new Date().toISOString();
      const content = JSON.stringify(store, null, 2);
      writeFileSync(userStorePath, content, "utf8");
    } catch (error) {
      throw new Error(
        `Failed to save user store: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Hash password using scrypt
   */
  export async function hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16);
    const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
    return `${salt.toString("hex")}:${derivedKey.toString("hex")}`;
  }

  /**
   * Verify password against hash
   */
  export async function verifyPassword(password: string, hash: string): Promise<boolean> {
    try {
      const [saltHex, keyHex] = hash.split(":");
      if (!(saltHex && keyHex)) return false;

      const salt = Buffer.from(saltHex, "hex");
      const storedKey = Buffer.from(keyHex, "hex");
      const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;

      return timingSafeEqual(storedKey, derivedKey);
    } catch {
      return false;
    }
  }

  /**
   * Get user store path from configuration
   */
  export async function getUserStorePath(): Promise<string> {
    const config = await configManager.load();
    const localConfig = config.authentication.providers.local;

    if (!localConfig?.userStore) {
      throw new Error(
        "Local authentication not configured. Set BROOKLYN_AUTH_LOCAL_USER_STORE or configure in config file.",
      );
    }

    return resolve(localConfig.userStore);
  }

  /**
   * Validate team ID format
   */
  export function validateTeamId(teamId: string): boolean {
    return /^[a-zA-Z0-9][a-zA-Z0-9_-]*[a-zA-Z0-9]$|^[a-zA-Z0-9]$/.test(teamId);
  }

  /**
   * Validate username format
   */
  export function validateUsername(username: string): boolean {
    return /^[a-zA-Z0-9][a-zA-Z0-9._-]*[a-zA-Z0-9]$|^[a-zA-Z0-9]$/.test(username);
  }

  /**
   * Validate permissions format
   */
  export function validatePermissions(permissions: string[]): boolean {
    const validPermissions = [
      "admin",
      "mcp:*",
      "mcp:navigate",
      "mcp:screenshot",
      "mcp:interact",
      "mcp:content",
      "mcp:analysis",
    ];

    return permissions.every(
      (perm) => validPermissions.includes(perm) || perm.startsWith("mcp:") || perm === "*",
    );
  }

  /**
   * Prompt for password securely using inquirer
   */
  export async function promptPassword(prompt: string, confirm = false): Promise<string> {
    // First, get the password
    const passwordAnswer = await inquirer.prompt([
      {
        type: "password",
        name: "password",
        message: prompt,
        mask: "*",
        validate: (input: string) => {
          if (input.length < 8) {
            return "Password must be at least 8 characters long.";
          }
          return true;
        },
      },
    ]);

    const password = passwordAnswer["password"];

    // If confirmation is needed, prompt again
    if (confirm) {
      await inquirer.prompt([
        {
          type: "password",
          name: "confirmPassword",
          message: "Confirm password:",
          mask: "*",
          validate: (input: string) => {
            if (input !== password) {
              return "Passwords do not match.";
            }
            return true;
          },
        },
      ]);
    }

    return password;
  }
}

/**
 * Create auth command structure
 */
export function createAuthCommand(): Command {
  const authCmd = new Command("auth").description("Manage Brooklyn MCP authentication").addHelpText(
    "after",
    `
Examples:
  brooklyn auth add-user --username admin --team admin-team --permissions admin
  brooklyn auth set-password --username admin
  brooklyn auth list-users
  brooklyn auth remove-user --username admin
  brooklyn auth revoke-sessions --username admin
`,
  );

  // Add user command
  authCmd
    .command("add-user")
    .description("Add a new user to local authentication")
    .option("-u, --username <username>", "Username for the new user")
    .option("-t, --team <team>", "Team ID for the user")
    .option("-p, --permissions <permissions...>", "Permissions for the user", ["mcp:*"])
    .option("--password <password>", "Password (if not provided, will be prompted)")
    .action(async (options) => {
      try {
        await addUser(options);
        process.exit(0);
      } catch (error) {
        console.error(
          `❌ Failed to add user: ${error instanceof Error ? error.message : String(error)}`,
        );
        process.exit(1);
      }
    });

  // Set password command
  authCmd
    .command("set-password")
    .description("Set or reset a user's password")
    .option("-u, --username <username>", "Username to set password for")
    .option("--password <password>", "New password (if not provided, will be prompted)")
    .action(async (options) => {
      try {
        await setPassword(options);
        process.exit(0);
      } catch (error) {
        console.error(
          `❌ Failed to set password: ${error instanceof Error ? error.message : String(error)}`,
        );
        process.exit(1);
      }
    });

  // List users command
  authCmd
    .command("list-users")
    .description("List all users in local authentication")
    .option("--json", "Output as JSON")
    .action(async (options) => {
      try {
        await listUsers(options);
        process.exit(0);
      } catch (error) {
        console.error(
          `❌ Failed to list users: ${error instanceof Error ? error.message : String(error)}`,
        );
        process.exit(1);
      }
    });

  // Remove user command
  authCmd
    .command("remove-user")
    .description("Remove a user from local authentication")
    .option("-u, --username <username>", "Username to remove")
    .option("--force", "Force removal without confirmation")
    .action(async (options) => {
      try {
        await removeUser(options);
        process.exit(0);
      } catch (error) {
        console.error(
          `❌ Failed to remove user: ${error instanceof Error ? error.message : String(error)}`,
        );
        process.exit(1);
      }
    });

  // Revoke sessions command
  authCmd
    .command("revoke-sessions")
    .description("Revoke all active sessions for a user")
    .option("-u, --username <username>", "Username to revoke sessions for")
    .option("--all", "Revoke sessions for all users")
    .action(async (options) => {
      try {
        await revokeSessions(options);
        process.exit(0);
      } catch (error) {
        console.error(
          `❌ Failed to revoke sessions: ${error instanceof Error ? error.message : String(error)}`,
        );
        process.exit(1);
      }
    });

  return authCmd;
}

/**
 * Add user implementation
 */
async function addUser(options: {
  username?: string;
  team?: string;
  permissions?: string[];
  password?: string;
}): Promise<void> {
  const { username, team, permissions = ["mcp:*"], password } = options;

  if (!username) {
    throw new Error("Username is required. Use --username <username>");
  }

  if (!team) {
    throw new Error("Team is required. Use --team <team>");
  }

  // Validate inputs
  if (!AuthCommandUtils.validateUsername(username)) {
    throw new Error(
      "Invalid username format. Use alphanumeric characters, dots, hyphens, and underscores.",
    );
  }

  if (!AuthCommandUtils.validateTeamId(team)) {
    throw new Error(
      "Invalid team ID format. Use alphanumeric characters, hyphens, and underscores.",
    );
  }

  if (!AuthCommandUtils.validatePermissions(permissions)) {
    throw new Error(
      "Invalid permissions. Use: admin, mcp:*, mcp:navigate, mcp:screenshot, mcp:interact, mcp:content, mcp:analysis",
    );
  }

  // Get user store path and load existing users
  const userStorePath = await AuthCommandUtils.getUserStorePath();
  const store = await AuthCommandUtils.loadUserStore(userStorePath);

  // Check if user already exists
  if (store.users[username]) {
    throw new Error(
      `User '${username}' already exists. Use 'brooklyn auth set-password' to change password.`,
    );
  }

  // Get password
  const userPassword =
    password ||
    (await AuthCommandUtils.promptPassword(`Enter password for user '${username}':`, true));

  if (userPassword.length < 8) {
    throw new Error("Password must be at least 8 characters long.");
  }

  // Hash password
  const passwordHash = await AuthCommandUtils.hashPassword(userPassword);

  // Create user account
  const userAccount: UserAccount = {
    id: `user-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    username,
    passwordHash,
    teamId: team,
    permissions,
    createdAt: new Date(),
    lastLoginAt: undefined,
    failedAttempts: 0,
    lockedUntil: undefined,
  };

  // Add user to store
  store.users[username] = userAccount;

  // Save store
  await AuthCommandUtils.saveUserStore(userStorePath, store);

  console.log(`✅ User '${username}' added successfully`);
  console.log(`   Team: ${team}`);
  console.log(`   Permissions: ${permissions.join(", ")}`);
  console.log(`   Store: ${userStorePath}`);
}

/**
 * Set password implementation
 */
async function setPassword(options: { username?: string; password?: string }): Promise<void> {
  const { username, password } = options;

  if (!username) {
    throw new Error("Username is required. Use --username <username>");
  }

  // Get user store path and load existing users
  const userStorePath = await AuthCommandUtils.getUserStorePath();
  const store = await AuthCommandUtils.loadUserStore(userStorePath);

  // Check if user exists
  if (!store.users[username]) {
    throw new Error(`User '${username}' not found. Use 'brooklyn auth add-user' to create user.`);
  }

  // Get new password
  const newPassword =
    password ||
    (await AuthCommandUtils.promptPassword(`Enter new password for user '${username}':`, true));

  if (newPassword.length < 8) {
    throw new Error("Password must be at least 8 characters long.");
  }

  // Hash password
  const passwordHash = await AuthCommandUtils.hashPassword(newPassword);

  // Update user
  const user = store.users[username];
  if (!user) {
    throw new Error(`User '${username}' not found during password update.`);
  }
  user.passwordHash = passwordHash;
  user.failedAttempts = 0; // Reset failed attempts
  user.lockedUntil = undefined; // Unlock account

  // Save store
  await AuthCommandUtils.saveUserStore(userStorePath, store);

  console.log(`✅ Password updated for user '${username}'`);
}

/**
 * List users implementation
 */
async function listUsers(options: { json?: boolean }): Promise<void> {
  const userStorePath = await AuthCommandUtils.getUserStorePath();
  const store = await AuthCommandUtils.loadUserStore(userStorePath);

  if (options.json) {
    // Output as JSON (without password hashes)
    const sanitizedUsers = Object.fromEntries(
      Object.entries(store.users).map(([username, user]) => [
        username,
        {
          id: user.id,
          username: user.username,
          teamId: user.teamId,
          permissions: user.permissions,
          createdAt: user.createdAt,
          lastLoginAt: user.lastLoginAt,
          failedAttempts: user.failedAttempts,
          lockedUntil: user.lockedUntil,
        },
      ]),
    );
    console.log(JSON.stringify({ users: sanitizedUsers, version: store.version }, null, 2));
  } else {
    // Human-readable output
    const userCount = Object.keys(store.users).length;
    console.log(`👥 Local Authentication Users (${userCount} total)`);
    console.log(`📁 Store: ${userStorePath}`);
    console.log(`📅 Last Modified: ${store.lastModified}`);
    console.log("");

    if (userCount === 0) {
      console.log("   No users found. Use 'brooklyn auth add-user' to create users.");
      return;
    }

    for (const [username, user] of Object.entries(store.users)) {
      const isLocked = user.lockedUntil && new Date(user.lockedUntil) > new Date();
      const status = isLocked ? "🔒 LOCKED" : "✅ ACTIVE";

      console.log(`   ${status} ${username}`);
      console.log(`     Team: ${user.teamId}`);
      console.log(`     Permissions: ${user.permissions.join(", ")}`);
      console.log(`     Created: ${user.createdAt}`);
      if (user.lastLoginAt) {
        console.log(`     Last Login: ${user.lastLoginAt}`);
      }
      if (user.failedAttempts && user.failedAttempts > 0) {
        console.log(`     Failed Attempts: ${user.failedAttempts}`);
      }
      console.log("");
    }
  }
}

/**
 * Remove user implementation
 */
async function removeUser(options: { username?: string; force?: boolean }): Promise<void> {
  const { username, force } = options;

  if (!username) {
    throw new Error("Username is required. Use --username <username>");
  }

  // Get user store path and load existing users
  const userStorePath = await AuthCommandUtils.getUserStorePath();
  const store = await AuthCommandUtils.loadUserStore(userStorePath);

  // Check if user exists
  if (!store.users[username]) {
    throw new Error(`User '${username}' not found.`);
  }

  // Confirmation (unless forced)
  if (!force) {
    const user = store.users[username];
    if (!user) {
      throw new Error(`User '${username}' not found during removal confirmation.`);
    }
    console.log(`⚠️  You are about to permanently remove user '${username}':`);
    console.log(`   Team: ${user.teamId}`);
    console.log(`   Permissions: ${user.permissions.join(", ")}`);
    console.log(`   Created: ${user.createdAt}`);
    console.log("");

    const confirmation = await inquirer.prompt([
      {
        type: "confirm",
        name: "confirmRemoval",
        message: `Are you sure you want to permanently remove user '${username}'?`,
        default: false,
      },
    ]);

    if (!confirmation["confirmRemoval"]) {
      console.log("User removal cancelled.");
      return;
    }
  }

  // Remove user
  delete store.users[username];

  // Save store
  await AuthCommandUtils.saveUserStore(userStorePath, store);

  console.log(`✅ User '${username}' removed successfully`);
}

/**
 * Revoke sessions implementation
 */
async function revokeSessions(options: { username?: string; all?: boolean }): Promise<void> {
  const { username, all } = options;

  if (!(username || all)) {
    throw new Error("Either --username <username> or --all is required.");
  }

  // For now, this is a placeholder since we don't have session management in the user store
  // In a full implementation, this would clear session tokens/JWTs

  if (all) {
    console.log("🔄 All user sessions would be revoked");
    console.log("   (Session management not yet implemented in user store)");
  } else {
    console.log(`🔄 Sessions for user '${username}' would be revoked`);
    console.log("   (Session management not yet implemented in user store)");
  }

  console.log(
    "ℹ️  Session revocation will be implemented when session storage is added to the user store.",
  );
}
