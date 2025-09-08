# Dependency Version Consistency SOP

## Critical Issue: Runtime vs Build-time Dependency Version Mismatches

**INCIDENT CONTEXT**: Playwright version mismatch caused MCP browser launch failures. MCP server imported Playwright 1.54.1 expecting `chromium-1187`, but CLI commands used `bunx`/`npx` installing only `chromium-1181`.

## Root Cause Analysis

### ❌ The Problem

When runtime code imports dependencies directly from `node_modules` while CLI commands use external executables (`bunx`/`npx`), version mismatches occur:

```typescript
// Runtime: Uses local node_modules version
import { chromium } from "playwright"; // Version 1.55.0

// CLI: Uses external executable version
execSync("bunx playwright install"); // May use different version
```

### ✅ The Solution

Always use the **same version** for both runtime imports and CLI operations.

## Mandatory Standards

### 1. Runtime Dependencies with CLI Tools

For dependencies that are both **imported in code** AND **executed as CLI tools**, ALWAYS use local node_modules:

```typescript
// ✅ CORRECT: Use local node_modules executable
const playwrightBin = join(process.cwd(), "node_modules", ".bin", "playwright");
execSync(`"${playwrightBin}" install chromium`);

// ❌ WRONG: External executable with unknown version
execSync("bunx playwright install chromium"); // Version mismatch risk
execSync("npx playwright install chromium"); // Version mismatch risk
```

### 2. Categories by Risk Level

#### 🔴 HIGH RISK: Runtime + CLI Dependencies

- **Playwright**: Imported by MCP server + used for browser installation
- **TypeScript**: Imported for compilation + used for type checking
  Updates for excising some native code before public release

**Rule**: MUST use local `./node_modules/.bin/` executable

#### 🟡 MEDIUM RISK: Build Tools Only

- **Biome**: Only used in build scripts
- **Prettier**: Only used in build scripts

**Rule**: `bunx` acceptable since not imported at runtime

#### 🟢 LOW RISK: System Commands

- **git**: System command, version managed by OS
- **du**: System command, version managed by OS

**Rule**: Direct usage acceptable

### 3. Implementation Pattern

```typescript
import { join } from "node:path";

// Template for local executable usage
function getLocalExecutable(packageName: string): string {
  return join(process.cwd(), "node_modules", ".bin", packageName);
}

// Usage
const playwrightBin = getLocalExecutable("playwright");
const result = spawnSync(playwrightBin, ["install", "chromium"]);
```

## Verification Checklist

Before any dependency that has both runtime imports and CLI usage:

- [ ] Check if dependency is imported anywhere in `src/`
- [ ] Check if dependency has CLI commands in any scripts
- [ ] If both exist, ensure CLI uses local `node_modules/.bin/`
- [ ] Test version consistency: `require('dep/package.json').version` vs CLI output
- [ ] Add integration test to catch future mismatches

## Detection Commands

```bash
# Find all runtime imports
grep -r "from ['\"]playwright" src/

# Find all CLI usages
grep -r "bunx\|npx.*playwright" . --include="*.ts" --include="*.js"

# Check version consistency
node -e "console.log(require('./node_modules/playwright/package.json').version)"
./node_modules/.bin/playwright --version
```

## Examples from Brooklyn Fix

### Before (Broken)

```typescript
// Runtime: Playwright 1.55.0
import { chromium } from "playwright";

// CLI: Unknown version via bunx
execSync("bunx playwright install chromium");
```

**Result**: MCP expected `chromium-1187`, CLI installed `chromium-1181`

### After (Fixed)

```typescript
// Runtime: Playwright 1.55.0
import { chromium } from "playwright";

// CLI: Same Playwright 1.55.0
const playwrightBin = join(process.cwd(), "node_modules", ".bin", "playwright");
execSync(`"${playwrightBin}" install chromium`);
```

**Result**: Both use Playwright 1.55.0, consistent `chromium-1187`

## Enforcement

### Pre-commit Hook

Add check to ensure no new `bunx`/`npx` usage for runtime dependencies:

```bash
# In .husky/pre-commit
if grep -r "bunx\|npx.*playwright" src/ --include="*.ts"; then
  echo "❌ Runtime dependency used with bunx/npx - use local node_modules"
  exit 1
fi
```

### Code Review Checklist

- [ ] New dependency: Check if has both runtime import + CLI usage
- [ ] New `execSync`: Verify uses local executable if runtime dependency
- [ ] Version updates: Test CLI commands after dependency updates

## Incident Prevention

1. **Dependency Audit**: Monthly review of all dependencies with CLI components
2. **Integration Tests**: Test version consistency for critical dependencies
3. **Documentation**: Update this SOP when adding new runtime+CLI dependencies
4. **Team Training**: Share this SOP with all team members

---

**Last Updated**: 2025-01-20  
**Next Review**: 2025-02-20  
**Incident Reference**: Playwright version mismatch causing MCP browser launch failures
