# Brooklyn Coding Standards - The Non-Negotiables

**TL;DR**: Follow these rules or face hours of fixing linting errors. We've all been there.

## 🚨 The Big Three (Will Break Production)

### 1. Logger Initialization - NEVER at Module Level

```typescript
// ❌ WRONG - Will crash bundled binaries
import { getLogger } from "../shared/pino-logger.js";
const logger = getLogger("my-module"); // 💥 BOOM

// ✅ CORRECT - Lazy initialization
import { getLogger } from "../shared/pino-logger.js";

let logger: ReturnType<typeof getLogger> | null = null;
function ensureLogger() {
  if (!logger) {
    logger = getLogger("my-module");
  }
  return logger;
}
```

**Why**: Module-level code runs during bundling. Logger registry isn't initialized yet. Your binary crashes.

### 2. libSQL/Database Types - Use InValue

```typescript
// ❌ WRONG - TypeScript will complain
async execute(sql: string, params?: any[]): Promise<ResultSet>
async execute(sql: string, params?: unknown[]): Promise<ResultSet>

// ✅ CORRECT - Use libSQL types
import type { InValue } from "@libsql/client";
async execute(sql: string, params?: InValue[]): Promise<ResultSet>
```

**Why**: libSQL expects specific types. `InValue = null | string | number | bigint | ArrayBuffer | boolean | Uint8Array | Date`

### 3. Database Results - Always Use Bracket Notation

```typescript
// ❌ WRONG - Will fail at runtime
const result = await db.execute("SELECT COUNT(*) as count FROM users");
const count = result.rows[0].count; // 💥 TypeScript error

// ✅ CORRECT - Bracket notation
const count = result.rows[0]?.["count"] as number;
```

**Why**: libSQL returns results that require bracket notation for field access.

## 🎯 The Daily Annoyances (Will Fail Linting)

### 4. String Literals vs Templates

```typescript
// ❌ WRONG - Unnecessary backticks
const message = `Hello world`;
const url = `https://api.example.com`;

// ✅ CORRECT - Double quotes for simple strings
const message = "Hello world";
const url = "https://api.example.com";

// ✅ CORRECT - Backticks ONLY for templates
const greeting = `Hello, ${name}!`;
const apiUrl = `https://api.example.com/users/${userId}`;
```

### 5. Environment Variables - Bracket Notation

```typescript
// ❌ WRONG - Dot notation
const port = process.env.PORT;
const apiKey = process.env.API_KEY;

// ✅ CORRECT - Always brackets
const port = process.env["PORT"];
const apiKey = process.env["API_KEY"];
```

### 6. Import Organization - Keep It Sorted

```typescript
// ❌ WRONG - Mixed up imports
import { User } from "./types";
import { readFile } from "node:fs/promises";
import { z } from "zod";

// ✅ CORRECT - Node → Third-party → Local (with blank lines)
import { readFile } from "node:fs/promises";

import { z } from "zod";

import type { User } from "./types";
```

### 7. Type Imports - Be Explicit

```typescript
// ❌ WRONG - Value import for types
import { User, Config } from "./types";

// ✅ CORRECT - Type imports
import type { User, Config } from "./types";

// ✅ CORRECT - Mixed imports
import { createUser, type User } from "./user-service";
```

### 8. No `any` Types - Ever

```typescript
// ❌ WRONG - The forbidden type
function processData(data: any): any {}
const config: Record<string, any> = {};

// ✅ CORRECT - Be specific or use unknown
function processData(data: unknown): string {}
interface Config {
  port: number;
  host: string;
}
```

### 9. Promise Return Types

```typescript
// ❌ WRONG - void in Promise union
async function maybeReturn(): Promise<Response | void> {}

// ✅ CORRECT - undefined in Promise union
async function maybeReturn(): Promise<Response | undefined> {
  return undefined; // Explicit return
}
```

## 🧪 Testing Specific

### 10. Never Use Non-Null Assertions in Tests

```typescript
// ❌ WRONG - Will break when property is undefined
expect(response.data!.items!.length).toBe(3);
expect(user.profile!.address!.city).toBe("NYC");

// ✅ CORRECT - Optional chaining
expect(response.data?.items?.length).toBe(3);
expect(user.profile?.address?.city).toBe("NYC");

// ✅ BETTER - Check existence first
expect(response.data).toBeDefined();
expect(response.data?.items).toBeDefined();
expect(response.data?.items?.length).toBe(3);
```

### 11. Use Correct Test Runner

```bash
# ❌ WRONG - Bun's built-in runner
bun test

# ✅ CORRECT - Always use vitest
bun run test
```

## 🔧 Quality Commands (Run These Before Committing)

```bash
# Check everything at once
bun run check-all

# Fix individual files as you work
bun run check:file:fix src/core/my-file.ts
bun run check:file src/core/my-file.ts

# Individual checks
bun run typecheck
bun run lint
bun run test
```

## 📋 Pre-Commit Checklist

- [ ] No module-level logger initialization
- [ ] Using InValue[] for database parameters
- [ ] Bracket notation for database results
- [ ] Double quotes for simple strings
- [ ] Bracket notation for process.env
- [ ] Imports properly organized
- [ ] Using `import type` for type-only imports
- [ ] No `any` types
- [ ] No `!` in test assertions
- [ ] Ran `bun run check:file` on modified files

## 🚀 Pro Tips

1. **Set up your editor**: Configure VSCode/Cursor to run Biome on save
2. **Use the file checker**: `bun run check:file:fix` fixes most issues automatically
3. **Read the errors**: Biome error messages actually tell you how to fix things
4. **Don't fight the linter**: If Biome wants it a certain way, just do it
5. **Template literals**: Only use backticks when you have `${variables}`

## 🎓 Learn More

- Full coding standards: `docs/substaile/codex/coding.md`
- TypeScript specifics: `docs/substaile/codex/typescript/typescript-coding.md`
- Testing patterns: `docs/substaile/codex/typescript/typescript-testing.md`
- Logger patterns: `docs/development/standards/logger-usage-sop.md`

---

**Remember**: These aren't arbitrary rules. Each one prevents real bugs or integration issues. Following them saves time for everyone, including future you.
