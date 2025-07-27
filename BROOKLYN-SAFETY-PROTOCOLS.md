# 🌉 BROOKLYN BRIDGE - MANDATORY SAFETY PROTOCOLS

## 🚨 CRITICAL WARNING: YOU ARE OPERATING ENTERPRISE AUTOMATION!

**Brooklyn MCP Server** operations connect Claude directly to browser automation and enterprise systems. These safety protocols are **MANDATORY**, **NON-NEGOTIABLE**, and must be followed by all team members and AI agents.

---

## 🔥 OPERATIONAL DANGER CLASSIFICATION

### **Level 1: CATASTROPHIC (Never Execute Without User Confirmation)**

- Browser pool modifications that could affect running automations
- MCP server configuration changes affecting Claude Code integration
- Domain allowlist modifications that could break security
- Database or persistent storage operations
- Process management (starting/stopping multiple Brooklyn instances)
- **NEW**: Chained browser operations with `&&` or `;`

### **Level 2: HIGH RISK (Validate Before Execution)**

- Team configuration changes affecting browser limits
- Plugin loading or modification
- Rate limiting configuration changes
- Log level modifications that could flood storage
- Security middleware configuration
- Network transport modifications

### **Level 3: MEDIUM RISK (Proceed with Caution)**

- Single browser automation operations
- Read-only configuration checks
- Status monitoring
- Tool discovery operations
- Screenshot capture

---

## 🛡️ MANDATORY SAFETY PROTOCOLS

### **Protocol 1: COMMIT QUALITY GATES**

**ALL commits must pass quality standards before integration:**

```bash
# MANDATORY - All must pass without errors
bun run typecheck        # TypeScript compilation
bun run lint             # Linter validation
bun run test             # Test execution with minimum coverage

# NEVER bypass without maintainer approval
git commit --no-verify  # ❌ REQUIRES MAINTAINER APPROVAL
```

**Quality Gate Requirements:**

- ✅ TypeScript compilation clean (zero errors)
- ✅ Lint validation passes (zero violations)
- ✅ Test suite execution passes (zero failures)
- ✅ Minimum test coverage maintained (80% business logic, 70% overall)
- ✅ MCP protocol compliance validated

**Override Authorization Process:**

```markdown
Before using --no-verify:

1. **REQUEST** explicit maintainer approval via chat/issue
2. **JUSTIFY** technical reason (integration cycle, emergency fix, etc.)
3. **RECEIVE** written approval from @3leapsdave or designated maintainer
4. **DOCUMENT** override reason in commit message
5. **COMMIT** to fixing quality issues in next immediate commit
```

### **Protocol 2: BROWSER ISOLATION**

**NEVER** combine browser operations with other operations in single commands:

```bash
# ❌ DANGEROUS - Chained browser operations
brooklyn mcp start && brooklyn status && pkill brooklyn
page.goto(url) && page.click(selector) && page.close()

# ✅ SAFE - Separate, explicit steps
# Step 1: Start MCP server (user confirms mode)
brooklyn mcp start
# Step 2: User explicitly authorizes browser action
# Tool execution through proper MCP protocol
# Step 3: Proper cleanup through MCP shutdown
```

**Why This Matters**:

- Browser operations can fail due to network, timing, or security issues
- Chained operations mask the real cause of automation failures
- MCP protocol requires proper error handling at each step
- Each browser operation needs independent validation

### **Protocol 3: EXPLICIT USER AUTHORIZATION**

For ANY enterprise automation operation:

1. **STOP** and describe exactly what browser action will be performed
2. **ASK** for explicit user confirmation with domain and action details
3. **WAIT** for user approval before proceeding
4. **CONFIRM** - Repeat back what user authorized
5. **EXECUTE** - Only the specific authorized automation

### **Protocol 4: DOMAIN VALIDATION BEFORE AUTOMATION**

Before any browser operation:

- Verify domain is in allowlist
- Document security implications
- Provide fallback if automation fails
- Validate team permissions for the target domain

### **Protocol 5: RESOURCE ISOLATION**

- ALL browser automation happens within configured pool limits
- NEVER exceed team's allocated browser instances
- Maintain clear boundaries between team configurations
- Use proper cleanup for browser resources

### **Protocol 6: OPERATION ATOMICITY**

- Each MCP tool performs ONE logical automation
- Validate success before proceeding to next operation
- Never assume previous browser action succeeded
- Use explicit error checking between automations

```typescript
// ✅ CORRECT - Atomic browser operations with validation
const page = await browser.newPage();
try {
  await page.goto(url);
  if (page.url() !== expectedUrl) {
    throw new Error("Navigation failed");
  }

  await page.click(selector);
  // Validate click succeeded before proceeding
} finally {
  await page.close(); // Always cleanup
}
```

### **EMERGENCY FIX PROCESS**

**For critical production issues requiring immediate hotfix:**

#### **Level 1: Critical System Down**

```bash
# 1. IMMEDIATE ACTION (maintainer approval implied for system restoration)
git commit --no-verify -m "EMERGENCY: fix critical system failure

- [specific fix description]
- System was down, immediate restore required
- Will follow up with full quality validation

EMERGENCY OVERRIDE AUTHORIZED by production needs
Quality fixes to follow in next immediate commit

Generated by [AI Agent] under supervision of @3leapsdave

Co-Authored-By: [AI Agent] <noreply@fulmen.ai>"

# 2. IMMEDIATE FOLLOW-UP (within 1 hour)
# Fix any quality issues and pass all gates
```

#### **Level 2: Urgent Bug Fix**

```bash
# 1. REQUEST rapid approval from maintainer
# 2. DOCUMENT fix scope and quality plan
# 3. RECEIVE approval for --no-verify if justified
# 4. COMMIT with detailed explanation
# 5. IMMEDIATELY follow with quality fixes
```

#### **Level 3: Integration Cycle Override**

```bash
# Used during long integration cycles (e.g., multi-day refactoring)
# 1. PLAN announced to maintainer at cycle start
# 2. DOCUMENT scope and quality restoration timeline
# 3. RECEIVE blanket approval for cycle duration
# 4. RESTORE quality gates at cycle completion
```

**Emergency Commit Message Format:**

```
<type>: EMERGENCY/URGENT/INTEGRATION - <description>

- [specific change details]
- [reason for quality override]
- [commitment to quality restoration]

OVERRIDE REASON: [emergency|urgent-fix|integration-cycle]
MAINTAINER APPROVAL: [received|implied-emergency|cycle-approved]
QUALITY RESTORATION: [next-commit|end-of-cycle|immediate]

Generated by [AI Agent] under supervision of @3leapsdave

Co-Authored-By: [AI Agent] <noreply@fulmen.ai>
```

---

## 🎯 MCP SAFETY ARCHITECTURE

### **Safe Brooklyn Process:**

1. **Initialize**: Start MCP server in isolated mode (safe)
2. **Validate**: USER confirms domain allowlist and team permissions
3. **Automate**: USER approves each browser action with explicit scope
4. **Cleanup**: USER confirms resource cleanup and shutdown

### **Required Safety Features:**

- `--dev-mode` for testing automation without affecting production
- Domain validation for all browser operations
- Detailed preview of automation steps
- Automatic resource cleanup on failure
- Atomic operation execution

---

## 🧠 AI AGENT BEHAVIORAL REQUIREMENTS

### **Before ANY Browser Automation:**

1. **PAUSE** - Don't proceed automatically
2. **DESCRIBE** - Explain exactly what browser action will be performed
3. **VALIDATE** - Confirm domain is allowed and secure
4. **ASK** - Request explicit user authorization
5. **CONFIRM** - Repeat back what user authorized
6. **EXECUTE** - Only the specific authorized automation

### **Prohibited Behaviors:**

- ❌ Automatic browser automation without user review
- ❌ Domain access without explicit permission
- ❌ Mass browser operations without user review
- ❌ Combining navigation + form submission in single operations
- ❌ Chaining browser operations with `&&` or `;`
- ❌ Operating on production systems without explicit permission
- ❌ Assuming browser operations succeeded without verification

### **Required Behaviors:**

- ✅ Separate each browser operation
- ✅ Validate success before proceeding
- ✅ Describe exact automation before execution
- ✅ Wait for explicit user authorization
- ✅ Use development mode for testing automation

---

## 🌐 BROWSER AUTOMATION SAFETY

### **The Chaining Problem**

Browser operations are particularly dangerous when chained because:

- Network operations can fail unexpectedly
- Page loading can timeout or fail silently
- Element selectors can become stale
- Security policies can block operations mid-sequence
- Error codes may not propagate correctly through MCP

### **Safe Browser Patterns**

```typescript
// ✅ SAFE - Browser operation with verification
const page = await context.newPage();
try {
  const response = await page.goto(url);
  if (!response || !response.ok()) {
    throw new Error(`Navigation failed: ${response?.status()}`);
  }

  // Wait for element to be ready
  await page.waitForSelector(selector, { timeout: 5000 });

  // Perform single action
  await page.click(selector);

  // Verify action succeeded
  const result = await page.evaluate(() => /* check result */);
  if (!result.success) {
    throw new Error('Action failed validation');
  }

} finally {
  await page.close();
}
```

### **Dangerous Browser Anti-Patterns**

```typescript
// ❌ NEVER DO THIS
(await page.goto(url)) && page.click(selector) && page.fill(input, value);
(page.click(button1), page.click(button2), page.screenshot());

// These can fail at any step and cause:
// - Partial automation leaving pages in inconsistent state
// - Resource leaks from unclosed pages
// - Security violations from unauthorized actions
// - Confusing error messages masking real issues
```

---

## 🌉 BROOKLYN POWER = BROOKLYN RESPONSIBILITY

**Remember**: Every Brooklyn operation can either:

- 🚀 **Create lightning-fast enterprise automation**
- 💥 **Compromise security and break production systems**

**The difference is SAFETY PROTOCOLS.**

### **Latest Safety Learnings:**

- **Browser Operations**: Never chain - each automation must be validated independently
- **Error Propagation**: Don't assume browser actions succeed - verify explicitly
- **Atomic Execution**: One logical automation per MCP tool
- **Resource Management**: Always cleanup browser instances

---

## 📋 MANDATORY COMPLIANCE ACKNOWLEDGMENT

**All team members and AI agents must explicitly confirm:**

✅ I have read and understand the Brooklyn Safety Protocols  
✅ I will follow commit quality gates and never use --no-verify without maintainer approval  
✅ I will follow separation of concerns for all browser automation operations  
✅ I will never chain browser operations with `&&` or `;`  
✅ I will request explicit user authorization for all browser automation  
✅ I will validate domains and respect security boundaries  
✅ I understand that safety protocols are mandatory and non-negotiable  
✅ I will use emergency override process only for critical system issues

**Digital Signature**: **\*\*\*\***\_**\*\*\*\*** **Date**: **\*\*\*\***\_**\*\*\*\***

---

**🌉 Paris Brooklyn - MCP Platform Architect**

_"Bridge capabilities with precision, not recklessness"_

---

**Document Version**: 1.0  
**Last Updated**: July 26, 2025  
**Next Review**: August 26, 2025  
**Maintained By**: Brooklyn MCP Platform Team  
**Based On**: FULMEN THUNDER Safety Protocols v2.0
