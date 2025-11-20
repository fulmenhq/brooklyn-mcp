# Brooklyn MCP ⚡

## Accelerate AI UX: Empower Developers with Intelligent Browser Automation

[![Developer Spark Enabled](https://img.shields.io/badge/Developer%20Spark-Enabled%20⚡-brightgreen?style=for-the-badge&logo=lightning&logoColor=white)](docs/fulmen/spark/README.md)
[![Brooklyn MCP](https://img.shields.io/badge/Brooklyn-MCP%20🌉-blue?style=for-the-badge&logo=bridge&logoColor=white)](docs/fulmen/forges/fulmen-brooklyn-forge-principles.md)
[![TypeScript Spark](https://img.shields.io/badge/TypeScript%20Spark-Enabled%20⚡-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](docs/fulmen/spark/README.md)
[![Architecture Approved](https://img.shields.io/badge/Architecture-Committee%20Approved%20🏆-gold?style=for-the-badge&logo=award&logoColor=white)](docs/fulmen/spark/README.md)

<div align="center">
  <img src="assets/logos/brooklyn-mcp-logo.svg" alt="Brooklyn MCP - Enterprise Browser Automation" width="150" height="150">
  <br>
  <em>Brooklyn MCP - The <strong>MCP Forge</strong> for the Fulmen Ecosystem</em>
</div>

> **⚡ Start Fast**: 5-minute setup with enterprise infrastructure | **🌉 Thrive on Scale**: Multi-team platform ready for global deployment

### Project Status

- Lifecycle Phase: alpha (see docs/standards/lifecycle-maturity.md)
- Release Phase: rc (preparing 0.2.x public track)

**Latest**: v0.2.2-rc.16 (public RC) includes **Windows compatibility**, comprehensive test suite, cross-platform utilities, resolved line ending issues, and critical CI pipeline hanging fixes for Windows development.

---

## 🌉 **What is Brooklyn?**

Brooklyn MCP is the **"MCP Forge"** for the Fulmen ecosystem - the reference implementation and foundational template for building enterprise-grade MCP servers across any programming language. Serving as both a production-ready browser automation platform and the architectural blueprint for the entire MCP ecosystem, Brooklyn empowers teams to **start fast** with proven MCP patterns while **thriving on scale** through multi-language implementations and enterprise deployment strategies.

### 🎯 **Triple Purpose Design**

**1. 🏗️ Reference MCP Implementation**

- **Cross-Language Template**: Proven patterns for Go, Rust, Python, Java MCP implementations
- **Enterprise Security**: Authentication, authorization, multi-tenancy, and compliance patterns
- **Development Excellence**: Revolutionary dev mode, comprehensive testing, quality gates
- **Protocol Compliance**: 100% MCP JSON-RPC specification adherence with comprehensive validation

**2. 🤖 Enterprise Browser Automation Platform**

- **Claude Code Integration**: Seamless MCP connection for AI-powered browser automation
- **Multi-Team Architecture**: Team isolation, resource management, and enterprise deployment
- **Production Infrastructure**: Monitoring, observability, containerization, and cloud-native patterns
- **Intelligent Automation**: AI-friendly tools, semantic navigation, and adaptive testing

**3. 🔧 Development Tooling Innovation**

- **Revolutionary Dev Mode**: Socket-based development without Claude session restarts
- **Comprehensive Testing**: Protocol compliance, performance, and security validation
- **Documentation Excellence**: Technical notes, implementation guides, and best practices
- **Quality Engineering**: File-level validation, automated testing, and operational excellence

---

## 🚀 **Quick Start (5 Minutes)**

### Prerequisites

- **Bun** (>= 1.2.0+) - [Install Bun](https://bun.sh)
- **Claude Code** - [Install Claude Code](https://claude.ai/code)

#### For Local Development/Building

- **Windows**: `zip` and `shasum` (install via [Scoop](https://scoop.sh/), Chocolatey, or Git for Windows)
- **macOS/Linux**: Usually pre-installed (verify with `which zip tar shasum`)

> **Note**: CI/CD builds work out-of-the-box. Local prerequisites only needed for `bun run package:all`.

### Lightning Setup

```bash
# Clone and install
git clone https://github.com/fulmenhq/brooklyn-mcp.git
cd brooklyn-mcp
bun install

# Build and install CLI
bun run build && bun run install

# Start Brooklyn HTTP server (recommended for multi-agent workflows)
brooklyn web start --port 3000 --daemon

# Connect to Claude Code (HTTP transport)
claude mcp add -s user -t http brooklyn http://127.0.0.1:3000

# Verify installation
brooklyn_status  # Run in Claude Code - shows version and 50+ tools
brooklyn doctor --json  # Run in terminal - comprehensive health check

# Alternative: Legacy single-agent only (stdio transport)
# ⚠️ Warning: stdio does not support multiple agents simultaneously
# claude mcp add -s user -t stdio brooklyn "brooklyn mcp start"
```

### Test Your First Automation

In Claude Code, try:

```
# Launch a browser and navigate
Launch a chromium browser for team 'demo'
Navigate to https://example.com

# Take a screenshot and analyze
Take a full-page screenshot
Analyze the CSS specificity for the header element

# Close when done
Close the browser
```

---

## 🌉 **Enterprise Infrastructure Highlights**

### **Multi-Team Platform Architecture**

```typescript
// Built for enterprise scale from day one
const teamConfig = {
  frontend: {
    allowedDomains: ["localhost:3000", "staging.example.com"],
    maxBrowsers: 5,
    resourceQuotas: { memory: "2GB", cpu: "50%" },
  },
  qa: {
    allowedDomains: ["*.example.com", "test.internal"],
    maxBrowsers: 10,
    customTools: ["visual_regression", "accessibility_audit"],
  },
};
```

### **Browser Pool Management**

- **Progressive Installation**: 99.9% distribution size reduction (0.41MB vs 300MB)
- **Circuit Breaker Protection**: Prevents cascading failures across teams
- **Health Monitoring**: Automatic browser lifecycle management and cleanup
- **Resource Quotas**: Per-team limits with intelligent pooling strategies

### **Production-Ready Operations**

- **Dual Transport Support**: stdio (MCP standard) and HTTP (debugging friendly)
- **Comprehensive Observability**: Metrics, tracing, and structured logging
- **Zero-Downtime Deployment**: Backward compatible updates without Claude Code restarts
- **Security First**: Domain allowlisting, audit trails, and team isolation

---

## 🏗️ **Reference Implementation Value**

Brooklyn serves as the **foundational template** for the entire MCP ecosystem, providing battle-tested patterns that teams can adapt for their specific needs:

### **Ready-Made Infrastructure**

```bash
# All the enterprise patterns you need:
✅ Authentication & Authorization backends
✅ Multi-tenant security with team isolation
✅ TLS transport options for secure communication
✅ Docker containerization with Kubernetes integration
✅ Comprehensive logging, monitoring, and observability
✅ Quality gates: testing, validation, security scanning
```

### **Cross-Language Implementation Guides**

- **[Technical Notes](./docs/technical-notes/)** - Deep-dive implementation patterns for Go, Rust, Python
- **Transport Architecture** - Socket, HTTP, and stdio patterns with runtime-specific considerations
- **Security Patterns** - Enterprise authentication, authorization, and compliance frameworks
- **Development Workflows** - Testing strategies, quality gates, and operational excellence

### **Quality & CI/CD Overview**

Brooklyn is wired around a strict quality pipeline that will later align with Fulmen's crucible/tsfulmen information architecture:

- **Vitest as default runner**: All core unit, integration, and E2E tests – and all quality gates (pre-commit, pre-push, CI, release) – run under Vitest.
- **Bun-only suites as explicit exceptions**: A small number of Bun tests (for Bun-specific APIs like `Bun.serve`/`Bun.hash`) live in dedicated paths (e.g. `tests/integration/bun/local-http-server-bun.bun-test.ts`) and are never wired into mandatory gates.
- **Local quality pipeline**: `bun run check-all` (via `scripts/check-all.ts`) runs format → typecheck → lint → tests with cross-platform, headless-friendly settings.
- **Release validation gate**: `bun run release:validate` runs code quality checks, tests, builds, license scans, and binary validation. It is invoked by the pre-push hook and the GitHub Release workflow.

See:

- `docs/testing/test-categorization-guide.md` – Vitest vs Bun and test categories
- `docs/testing/integration-test-guide.md` – integration setup and CI usage
- `docs/development/validation-procedures.md` – `check-all` vs `release:validate`
- `docs/development/standards/deployment-sop.md` – pre-commit/pre-push and release SOP

### **Post-Release Roadmap**

- **🔐 Authentication Backends** - OAuth, LDAP, API keys with rotation for HTTP transport
- **🛡️ TLS Integration** - mTLS, certificate management, secure communication channels
- **🐳 Container Packaging** - Production Docker containers with security scanning
- **🚀 Go Implementation** - High-performance reference for enterprise scaling (1000+ concurrent sessions)

> **Building an MCP server?** Start with Brooklyn's proven patterns instead of building from scratch. Save months of development time and avoid common pitfalls.

---

## 🎯 **Core Capabilities**

### **AI-First Browser Automation**

| Feature                  | Description                                      | Enterprise Benefit               |
| ------------------------ | ------------------------------------------------ | -------------------------------- |
| **Semantic Navigation**  | AI-friendly element targeting and page analysis  | Reduce britttle test maintenance |
| **Visual Validation**    | Screenshot comparison and layout verification    | Catch visual regressions early   |
| **CSS Analysis**         | Specificity analysis and styling troubleshooting | Debug complex UX issues faster   |
| **JavaScript Injection** | Dynamic script execution and DOM manipulation    | Extend automation capabilities   |

### **Template Extensibility**

Brooklyn's architecture enables rapid customization for any use case:

```typescript
// Example: Add security scanning tools
export class SecurityScanningPlugin {
  @mcpTool({
    name: "scan_vulnerabilities",
    description: "Scan page for security vulnerabilities",
  })
  async scanVulnerabilities({ url, scanType }: ScanRequest) {
    // Custom security scanning logic
    return this.securityEngine.scan(url, scanType);
  }
}
```

**Common Extensions**:

- **API Testing**: Add HTTP request tools for full-stack testing
- **Data Extraction**: Web scraping and content analysis tools
- **Performance Monitoring**: Page speed and resource optimization
- **Accessibility Auditing**: WCAG compliance and usability testing

---

## 📋 **Available Commands**

### **Browser Automation**

```bash
# Browser lifecycle
launch_browser type=chromium headless=true team=frontend
navigate_to_url browserId=browser_123 url=https://app.example.com
take_screenshot browserId=browser_123 fullPage=true
close_browser browserId=browser_123

# Element interaction
click_element browserId=browser_123 selector="button[data-testid='submit']"
fill_form_fields browserId=browser_123 fields='{"email":"test@example.com"}'
wait_for_element browserId=browser_123 selector=".loading-complete"

# Advanced analysis
analyze_specificity browserId=browser_123 selector="header" summarize=true
extract_css browserId=browser_123 selector=".component"
generate_selector browserId=browser_123 target="login form"
```

### **Platform Management**

```bash
# Status and discovery
brooklyn_status                    # Server health and capabilities
brooklyn_list_tools                # Available automation tools
list_active_browsers               # Current browser sessions
```

> Tip: after rebuilding (`bun run build && bun run install`), call `brooklyn_status`
> over both stdio (`brooklyn mcp start`) and HTTP (`curl /tools/brooklyn_status`) to
> confirm clients are seeing the refreshed binary before continuing work.

---

## 🏗️ **Development as a Template**

### **Clone and Customize**

```bash
# Start with Brooklyn's proven architecture
git clone https://github.com/fulmenhq/brooklyn-mcp.git my-custom-mcp
cd my-custom-mcp

# Customize for your domain
bun run refit --domain="security-scanning" --tools="vulnerability,compliance"
```

### **Architectural Patterns**

Brooklyn implements enterprise-grade patterns you can adapt:

- **Hexagonal Architecture**: Clean separation of business logic and adapters
- **Plugin System**: Extensible tool registration and discovery
- **Resource Management**: Circuit breakers, quotas, and health monitoring
- **Multi-Transport**: stdio and HTTP with seamless switching
- **Team Isolation**: Complete separation with shared infrastructure

### **Quality Infrastructure**

```bash
# Built-in quality gates
bun run check-all              # Format, typecheck, lint, test
bun run check:file path.ts     # File-level validation
bun run test:e2e               # End-to-end MCP protocol tests

# Production deployment
bun run build                  # Optimized TypeScript compilation
brooklyn mcp start --log-level=info  # Production server
```

---

## 🔧 **Server Management**

### **Brooklyn CLI**

```bash
# Install global CLI
bun run build && bun run install

# Server operations (work from anywhere)
brooklyn status               # Check server health
brooklyn mcp start            # Start MCP server
brooklyn mcp cleanup          # Clean up resources
brooklyn --version            # Show version info
```

### **Development Commands**

```bash
# Development workflow
bun run dev                   # Start development server
bun run test:watch           # Run tests in watch mode
bun run typecheck            # TypeScript validation

# Quality assurance
bun run lint:fix             # Auto-fix linting issues
bun run format:code          # Format source code
bun run check:file src/core/new-feature.ts  # Validate specific file
```

### **Transport Options**

```bash
# stdio transport (MCP standard)
brooklyn mcp start --log-level debug

# HTTP transport (debugging friendly)
brooklyn web start --port 3000 --daemon
```

---

## 🔐 **Security & Compliance**

### **Enterprise Security Features**

- **Domain Allowlisting**: Strict validation of accessible websites
- **Team Isolation**: Complete resource and data separation
- **Audit Logging**: Comprehensive activity tracking with team attribution
- **Resource Quotas**: Prevent resource exhaustion and ensure fair usage
- **Secure Contexts**: Isolated browser environments for each team

### **Configuration Example**

```json
{
  "teams": {
    "frontend": {
      "allowedDomains": ["localhost:3000", "staging.example.com"],
      "maxBrowsers": 5,
      "rateLimit": { "requests": 100, "window": 60000 }
    }
  },
  "security": {
    "enableAuditLogging": true,
    "requireDomainValidation": true,
    "maxSessionDuration": "2h"
  }
}
```

---

## 📊 **Performance & Monitoring**

### **Enterprise Metrics**

```bash
# Real-time monitoring
curl http://localhost:3000/health     # Health status
curl http://localhost:3000/metrics    # Performance metrics

# Browser pool analytics
brooklyn status --detailed           # Resource utilization
brooklyn metrics --team=frontend     # Team-specific metrics
```

### **Performance Targets**

- **Browser Acquisition**: <500ms from pool
- **MCP Response Time**: <100ms (95th percentile)
- **Distribution Size**: 0.41MB (99.9% reduction from standard Playwright)
- **Memory Efficiency**: Automatic cleanup prevents memory leaks

---

## 📚 **Documentation**

### **Quick Start Guides**

- **[Hello Brooklyn](docs/hello_brooklyn.md)** - 5-minute setup and first automation
- **[Welcome Guide](docs/welcome.md)** - Comprehensive features and examples
  - See "Choosing MCP Transport" for when to use stdio vs http
- **Assisted Configuration**: IDE/agent setup helper
  - See docs/user-guide/brooklyn-cli.md#assisted-configuration
- **[Agent Onboarding](AGENTS.md)** - Team member quick start

### **Platform Documentation**

- **[User Guide](docs/user-guide/index.md)** - Complete browser automation guide
- **[Team Management](docs/user-guide/team-management.md)** - Multi-team configuration
- **[Advanced Features](docs/user-guide/advanced-features.md)** - Complex automation scenarios

### **Template Development**

- **[Development Guide](docs/development/index.md)** - Extending and customizing Brooklyn
- **[Architecture Guide](docs/architecture/)** - Enterprise infrastructure patterns
- **[MCP Protocol Guide](docs/development/mcp-protocol-guide.md)** - Protocol compliance details

---

## 🆘 **Support & Community**

### **Built-in Help**

```bash
# Troubleshooting assistance
brooklyn_troubleshooting issue=browser_crash
brooklyn_examples task=visual_testing
brooklyn_logs                        # Recent server logs
```

### **Community Resources**

- **GitHub Issues**: [Report bugs and request features](https://github.com/fulmenhq/brooklyn-mcp/issues)
- **Documentation**: Comprehensive guides in [docs/](docs/) directory
- **Enterprise Support**: Contact [3 Leaps](mailto:support@3leaps.net) for enterprise deployments

---

## 🌉 **The Brooklyn Bridge Philosophy**

Brooklyn is named after the Brooklyn Bridge - a masterpiece of engineering that **spans the gap** between communities while **handling massive scale** with grace and reliability. Our Brooklyn MCP aspires to the same standard:

- **🌉 Bridge Builder**: Connects AI developers to enterprise browser capabilities
- **🏗️ Structural Integrity**: Provides reliable, enterprise-grade infrastructure teams can depend on
- **🚦 Traffic Management**: Handles multiple teams and workloads without interference
- **🎨 Architectural Beauty**: Elegant abstractions make complex automation feel intuitive

```
    🏗️  BROOKLYN MCP  🏗️
    ╭─────────────────────╮
   ╱│  ⚡ MCP PROTOCOL ⚡  │╲
  ╱ │                     │ ╲
 ╱  │   AI ←──────→ WEB   │  ╲
╱   │                     │   ╲
│   ╰─────────────────────╯    │
│  ENTERPRISE AUTOMATION BRIDGE │
╰─────────────────────────────────╯

🌉 Connecting AI Capabilities to Browser Automation Excellence 🌉
```

**Start Fast. Thrive on Scale.** - It's not just our tagline, it's our architectural commitment.

---

## 📜 **License & Legal**

**Open Source**: MIT License - see [LICENSE](LICENSE) for details.

**Trademarks**: "Fulmen", "Brooklyn MCP", and "3 Leaps" are trademarks of 3 Leaps, LLC. While code is open source, please use distinct names for derivative works to prevent confusion.

### OSS Policies (Organization-wide)

- Authoritative policies repository: https://github.com/3leaps/oss-policies/
- Code of Conduct: https://github.com/3leaps/oss-policies/blob/main/CODE_OF_CONDUCT.md
- Security Policy: https://github.com/3leaps/oss-policies/blob/main/SECURITY.md
- Contributing Guide: https://github.com/3leaps/oss-policies/blob/main/CONTRIBUTING.md
- Third-party notices are generated per release (see `dist/licenses/THIRD_PARTY_NOTICES.md`).

---

---

<div align="center">

⚡ **Start Fast. Thrive on Scale.** ⚡

_Transform AI UX development with enterprise-ready browser automation_

<br><br>

<img src="assets/icons/fulmen-forge-icon.png" alt="Fulmen Forge" width="60" height="60">

**Built with 🌉 by the 3 Leaps team**  
**Part of the [Fulmen Ecosystem](https://fulmenhq.dev) - Lightning-fast enterprise development**

</div>
