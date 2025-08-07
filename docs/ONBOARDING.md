# Brooklyn Team Onboarding Guide 🌉

**⚡ Fulmen Spark Enabled - Your 15-Minute Path to Productivity**

_Making quality practices the fastest way to get assignment-ready_

---

## 🎯 What We're Building & Why

### The Problem We're Solving

**Universal Challenge**: AI developers need reliable browser automation, but existing solutions are either:

- Too complex for rapid iteration (Selenium, Puppeteer setup overhead)
- Not AI-friendly (no MCP protocol support)
- Single-user focused (no team isolation or enterprise controls)

**Brooklyn's Solution**: An enterprise-ready MCP server that bridges AI models directly to browser automation with zero setup friction.

### Why MCP? Why Browser Automation?

**Model Context Protocol (MCP)** is the emerging standard for AI-tool communication:

- **Direct Integration**: Claude Code connects to Brooklyn without custom APIs
- **Protocol Standardization**: Works with any MCP-compatible AI client
- **Streaming Support**: Real-time communication for complex workflows

**Browser Automation** is the missing link for AI development:

- **Visual Validation**: AI can see what users see through screenshots
- **Dynamic Testing**: Generate tests based on actual UI behavior
- **Content Extraction**: Navigate complex SPAs that APIs can't reach
- **Cross-Browser Compatibility**: Test across Chromium, Firefox, WebKit

### How Brooklyn Fits in the Fulmen Ecosystem

**Brooklyn = The Bridge** 🌉

- **Fulmen Philosophy**: "Start Fast, Thrive on Scale, Enterprise Ready"
- **Ecosystem Role**: Reference implementation for MCP server patterns
- **Bridge Metaphor**: Connects AI capabilities ↔ Browser automation excellence
- **Team Identity**: `@paris-brooklyn` (Platform Architect & Browser Automation Lead)

**Fulmen Ecosystem Integration**:

- **CDRL Compliance**: Template variables for cross-project consistency
- **Quality Standards**: Zero-tolerance TypeScript + comprehensive testing
- **Multi-Team Design**: Enterprise patterns from day one
- **Spark Pioneer**: First fulmen forge with Developer Spark implementation

---

## 🏗️ Architecture Decisions & Trade-offs

### Why TypeScript + Bun?

**TypeScript Choice**:

- ✅ **Type Safety**: Prevents 70%+ of runtime errors in browser automation
- ✅ **AI Compatibility**: Claude understands TypeScript better than other languages
- ✅ **Ecosystem**: Rich Playwright integration and MCP SDK support
- ✅ **Team Velocity**: Faster iteration cycles with compile-time validation

**Bun Runtime Choice**:

- ✅ **Performance**: 3x faster startup than Node.js (critical for MCP servers)
- ✅ **Built-in Tools**: Native TypeScript, testing, bundling - no configuration overhead
- ✅ **Memory Efficiency**: Lower memory footprint for browser pool management
- ✅ **Future-Ready**: Modern runtime designed for AI development workflows

### Why Custom MCP Transport vs SDK?

**Decision**: Implement direct JSON-RPC handling instead of using MCP SDK exclusively

**Reasoning**:

- ✅ **Protocol Control**: Direct control over stdout purity (critical for Claude integration)
- ✅ **Performance**: Eliminate SDK overhead for high-frequency browser operations
- ✅ **Debugging**: Easier to diagnose protocol issues with direct implementation
- ✅ **Flexibility**: Can adapt to MCP protocol changes without SDK dependencies

**Trade-off**: More implementation complexity, but better reliability and performance.

### Why Multi-Team Design?

**Enterprise Reality**: Multiple teams need browser automation with different requirements:

- **Frontend Teams**: Need localhost access and development domains
- **QA Teams**: Need production domain access and extended browser pools
- **Monitoring Teams**: Need 24/7 operation and alerting integration
- **AI Development Teams**: Need rapid iteration and screenshot storage

**Brooklyn's Solution**:

- **Team Isolation**: Separate browser pools, domain allowlists, resource limits
- **Configuration Management**: Team-specific settings without code changes
- **Security Boundaries**: Prevent cross-team resource access or data leakage
- **Scalability**: Add teams without architectural changes

---

## 👥 Team Context & Success Metrics

### Who Uses Brooklyn and How?

**Primary Users** (Priority Order):

1. **AI Developers** - Claude integration for smart web automation
2. **UX Development Teams** - Responsive design testing and visual validation
3. **QA Engineers** - Cross-browser E2E testing and regression detection
4. **Site Reliability Engineers** - Website monitoring and health checks

**Integration Patterns**:

- **Claude Code Sessions**: Direct MCP integration for interactive development
- **CI/CD Pipelines**: Automated testing and screenshot generation
- **Monitoring Systems**: Health checks and performance benchmarking
- **Development Workflows**: Local testing and debugging support

### Success Metrics We Care About

**Developer Productivity**:

- **Time to First Screenshot**: <2 minutes from Brooklyn installation
- **Session Setup Time**: <30 seconds from Claude Code to browser launch
- **Error Recovery**: <5 minutes to diagnose and fix common issues

**System Reliability**:

- **Browser Pool Efficiency**: 95%+ successful browser launches
- **Memory Management**: Zero memory leaks in 24-hour operation
- **Protocol Compliance**: 100% MCP specification adherence

**Team Adoption**:

- **Onboarding Success**: 90%+ of new team members productive in <15 minutes
- **Cross-Team Usage**: 3+ teams actively using Brooklyn for different use cases
- **Documentation Effectiveness**: 70%+ reduction in support requests

### Current Priorities and Roadmap

**Current Capabilities**: Enterprise Browser Automation Platform

- ✅ **MCP Protocol Compliance**: Stdout purity and protocol version support
- ✅ **Multi-Browser Support**: Chromium, Firefox, WebKit integration
- ✅ **Team Isolation**: Configuration and resource management + **SECURITY FIX**
- ✅ **Screenshot Database**: Enterprise-ready inventory system with libSQL
- ✅ **Performance & Caching**: <100ms query times with intelligent caching
- ✅ **E2E Testing Framework**: Comprehensive security and protocol testing

**Roadmap**: Advanced Automation Features

- 📋 **Element Interaction**: Click, type, form submission
- 📋 **Wait Strategies**: Smart waiting for dynamic content
- 📋 **Session Management**: Persistent browser sessions across requests
- 📋 **Performance Monitoring**: Page load times and resource usage

**New as of v1.4.11**: Screenshot Inventory System

- 🗄️ **Screenshot Inventory Database**: All screenshots stored with rich metadata
- 🔍 **Advanced Filtering**: Query by team, tag, date, format, session, and more
- 📊 **Performance Analytics**: Built-in caching with <5ms query times
- 🛡️ **Enterprise Security**: Team isolation with vulnerability fixes
- 📈 **Usage Statistics**: Track screenshot volume, formats, and team activity

**Future Vision**: AI-Native Browser Platform

- 📋 **Visual AI Integration**: Screenshot analysis and element detection
- 📋 **Smart Selectors**: AI-generated CSS selectors for robust automation
- 📋 **Workflow Recording**: Record human interactions for AI replay
- 📋 **Multi-Modal Integration**: Voice, vision, and text automation

---

## 🧠 Development Philosophy & Standards

### Code Quality Mindset

**Zero-Tolerance Quality Gates**:

- **TypeScript Strict Mode**: No `any` types, proper error handling
- **Test Coverage**: 90%+ critical paths, 80%+ business logic, 70%+ overall
- **Protocol Compliance**: MCP specification adherence validated by integration tests
- **Security First**: Domain validation, rate limiting, team isolation

**Quality Commands** (Copy-Paste Ready):

```bash
# Quality gates (run before ANY commit - zero tolerance)
bun run check-all        # Comprehensive validation (format + typecheck + lint + test)

# File validation (MUST run after editing any .ts file)
bun run check:file:fix path/to/file.ts   # Auto-fix what's possible
bun run check:file path/to/file.ts       # Verify all checks pass

# Brooklyn server management
bun run server:start     # Start Brooklyn MCP server
bun run server:status    # Check server health
```

### Testing Approach

**Test Strategy**:

- **Unit Tests**: Core logic, browser pool management, security middleware
- **Integration Tests**: MCP protocol compliance, team onboarding, stdout purity
- **E2E Tests**: Full Claude Code integration, browser automation workflows
- **Performance Tests**: Concurrent operations, memory usage, response times

**Critical Test Categories**:

1. **Stdout Purity Tests**: Ensure MCP protocol compliance (zero stdout contamination)
2. **Browser Pool Tests**: Resource management and cleanup validation
3. **Security Tests**: Domain validation, team isolation, rate limiting
4. **Protocol Tests**: MCP message handling and error responses

### Security Mindset

**Defense in Depth**:

- **Input Validation**: All URLs, team IDs, and parameters validated
- **Domain Allowlisting**: Configurable per-team domain restrictions
- **Resource Limits**: Browser pool limits prevent resource exhaustion
- **Team Isolation**: Separate contexts prevent cross-team data access
- **Audit Logging**: Complete audit trail of all automation activities

**Security Boundaries**:

- **Network**: Domain allowlisting prevents unauthorized navigation
- **Process**: Browser isolation prevents cross-contamination
- **File System**: Screenshot storage with path validation and team isolation
- **Memory**: Proper cleanup prevents information leakage

---

## 🚀 Getting Productive Fast

### Essential Commands (Copy-Paste Ready)

**Quality Gates** (Run before ANY commit):

```bash
bun run check-all        # Comprehensive validation
bun run typecheck        # TypeScript compilation
bun run lint             # Code quality validation
bun run test             # Test execution
```

**Development Workflow**:

```bash
# Start development
bun run dev              # Development mode with file watching

# Server management
bun run server:start     # Start Brooklyn MCP server
bun run server:status    # Check server health
bun run server:logs      # View server logs
bun run server:stop      # Stop server gracefully

# Testing
bun run test             # Run all tests
bun run test:unit        # Unit tests only (fast - for pre-commit)
bun run test:integration # Integration tests
bun run test:e2e         # End-to-end tests
bun run test tests/integration/stdout-purity.test.ts  # Specific test

# ⚠️ Anti-pattern: test:watch is not provided
# Watch mode leaves orphaned processes and consumes memory
```

**File-Level Validation** (MANDATORY after editing):

```bash
bun run check:file:fix src/path/to/file.ts   # Auto-fix what's possible
bun run check:file src/path/to/file.ts       # Verify all checks pass
```

### Common Workflows

**Adding a New MCP Tool**:

1. Define tool schema in `src/core/tool-definitions.ts`
2. Implement handler in appropriate service (browser, onboarding, etc.)
3. Add integration test in `tests/integration/`
4. Update documentation in `docs/user-guide/`
5. Run quality gates: `bun run check-all`

**Debugging MCP Protocol Issues**:

1. Check stdout purity: `bun run test tests/integration/stdout-purity.test.ts`
2. Validate protocol compliance: `bun run test tests/e2e/mcp-protocol.test.ts`
3. Enable debug logging: `BROOKLYN_LOG_LEVEL=debug bun run server:start`
4. Test with Claude Code integration

**Browser Pool Debugging**:

1. Check pool status: `bun run server:status`
2. Review browser logs: `bun run server:logs`
3. Test browser launch: `bun run test src/core/browser-pool-manager.test.ts`
4. Verify Playwright installation: `bunx playwright install`

### Debugging Tips

**Common Issues & Solutions**:

**Issue**: MCP protocol errors in Claude Code

- **Solution**: Check stdout purity with integration tests
- **Debug**: Enable `DEBUG_MCP_TEST=1` for detailed protocol logging
- **Validate**: Ensure all logs go to stderr, not stdout

**Issue**: Browser launch failures

- **Solution**: Verify Playwright browsers installed (`bunx playwright install`)
- **Debug**: Check system resources and browser pool limits
- **Validate**: Test with headless=false to see browser UI

**Issue**: TypeScript compilation errors

- **Solution**: Run `bun run check:file:fix` on modified files
- **Debug**: Check import paths and type definitions
- **Validate**: Ensure strict TypeScript compliance

### Who to Ask for Help

**Team Structure**:

- **@paris-brooklyn**: Platform Architect & Browser Automation Lead
  - Architecture decisions, MCP protocol issues, performance optimization
- **Architecture Committee**: Cross-forge standards and ecosystem integration
- **Fulmen Community**: Template patterns, CDRL compliance, quality standards

**Escalation Path**:

1. **Documentation First**: Check `docs/user-guide/` and `docs/development/`
2. **Built-in Help**: Use `brooklyn_troubleshooting` and `brooklyn_examples`
3. **Team Discussion**: Async communication via team planning files
4. **Architecture Review**: Complex decisions requiring ecosystem alignment

---

## 🎓 Learning Resources & Next Steps

### Essential Reading (5-Minute Investment = 70% Fewer Mistakes)

**MANDATORY READING** (proven to reduce refit cycles):

- 📖 **`docs/substaile/codex/coding.md`** - Core coding principles, error patterns
- 📖 **`docs/substaile/codex/typescript/typescript-coding.md`** - TypeScript-specific practices
- 📖 **`docs/substaile/codex/testing.md`** - Testing patterns, AAA structure
- 📖 **`FULMEN-TECHNICAL-MANIFESTO.md`** - Fulmen forge principles and philosophy

**Team Context**:

- 📂 **`.plans/TEAM-ROSTER.md`** - Find your role and current sprint focus
- 📂 **`.plans/active/paris/`** - Team-specific planning and current tasks
- 📖 **`CLAUDE.md`** - 5-minute onboarding section for immediate productivity

### Deep Dive Documentation

**Architecture Understanding**:

- **`docs/architecture/tool-discovery-architecture.md`** - How MCP tools are discovered
- **`docs/architecture/browser-capabilities-v1.md`** - Browser automation capabilities
- **`docs/development/logging_and_telemetry_guide.md`** - Structured logging patterns

**User Experience**:

- **`docs/user-guide/index.md`** - Complete user guide for Brooklyn
- **`docs/user-guide/advanced-features.md`** - Complex automation scenarios
- **`docs/user-guide/team-management.md`** - Multi-team configuration

### Your First Assignment Checklist

- [ ] **Step 1**: Read your role in `.plans/TEAM-ROSTER.md` (2 min)
- [ ] **Step 2**: Review current sprint in `.plans/active/paris/` (2 min)
- [ ] **Step 3**: Skim the 4 critical standards docs (8 min)
- [ ] **Step 4**: Run `bun run server:start` to test Brooklyn (2 min)
- [ ] **Step 5**: Run quality checks to verify setup (1 min)
- [ ] **Step 6**: Test Claude Code integration with `brooklyn_status`
- [ ] **Ready**: You're now prepared for your first assignment!

**Reminder**: This 15-minute investment prevents hours of debugging and refit cycles.

---

## 🌟 Spark Framework Integration

### What Makes This "Spark Enabled"

**Fulmen Spark Initiative**: Brooklyn is the reference implementation for fulmen's strategic onboarding framework that achieves:

- ✅ **70% reduction** in preventable lint/format failures
- ✅ **15 minutes** from zero knowledge → assignment ready
- ✅ **Architecture committee endorsement** for ecosystem rollout

**Spark Components in Brooklyn**:

1. **Strategic Onboarding**: 5-minute pattern in `CLAUDE.md`
2. **Template Variable Resolution**: Single source of truth in `.plans/TEAM-ROSTER.md`
3. **Session Memory Integration**: Progressive enforcement with developer autonomy
4. **Success Measurement**: Metrics tracking and continuous improvement

### For Other Teams Implementing Spark

**Brooklyn as Reference Implementation**:

- **Validation Status**: ✅ **PASSED** - Architecture Committee approved
- **Innovation 1**: Team-specific planning structure (`.plans/active/<teamname>/`)
- **Innovation 2**: Template variable resolution via team roster
- **Innovation 3**: Zero-tolerance quality gates with auto-fix capabilities

**Spark Requirements for Your Repo**:

1. **MANDATORY**: `docs/ONBOARDING.md` (this document pattern)
2. **MANDATORY**: `docs/welcome.md` (enhanced user-facing welcome)
3. **MANDATORY**: 5-minute onboarding section in `CLAUDE.md`
4. **MANDATORY**: Team-specific planning structure
5. **MANDATORY**: Quality gate commands and file-level validation

**What Should Go in Each Document**:

**`docs/ONBOARDING.md`** (Team-Focused):

- **What & Why**: Business context, problem solving, architecture decisions
- **Team Context**: Who uses it, success metrics, current priorities
- **Development Philosophy**: Code standards, testing approach, security mindset
- **Getting Productive**: Essential commands, workflows, debugging tips
- **Learning Resources**: Critical reading, deep dive docs, first assignment checklist

**`docs/welcome.md`** (User-Focused):

- **Quick Start**: Installation, setup, first automation
- **Use Cases**: Practical examples for different user types
- **Available Tools**: Complete tool inventory with examples
- **Help System**: Built-in help, troubleshooting, support channels
- **Pro Tips**: Best practices, security, performance optimization

**Cross-Linking Strategy**:

- **README.md** → Quick value prop + navigation to `docs/welcome.md`
- **`docs/welcome.md`** → User onboarding + link to `docs/ONBOARDING.md` for team members
- **`docs/ONBOARDING.md`** → Team onboarding + cross-reference to user guide topics
- **`CLAUDE.md`** → 5-minute pattern + links to both onboarding documents

---

## 🎉 Welcome to the Brooklyn Team!

**You're now part of the Spark Pioneer team** - the first fulmen forge implementation that's setting the standard for developer productivity across the entire ecosystem.

**Your Impact**:

- **Reference Implementation**: Your work becomes the template for other teams
- **Productivity Innovation**: You're proving that quality practices can be the fastest path to success
- **Ecosystem Leadership**: Brooklyn patterns will influence all future fulmen projects

**Recognition Available**:

- ⚡ **Spark Pioneer Stickers**: First fulmen implementation
- 🏆 **Architecture Approved Mug**: Committee endorsement
- 🌉 **Brooklyn Forge T-Shirt**: Reference implementation status
- 🔥 **Premium Lightning Keychain**: Gold standard achievement

**Ready to Bridge AI and Browser Automation Excellence?** 🌉

Your 15-minute investment in this onboarding guide has prepared you to contribute to the future of AI-powered browser automation. Welcome to the team!

---

_Fulmen Spark: Making quality practices the path of least resistance since 2025_ ⚡

**Questions?** Check our comprehensive documentation or create an issue for support.

[![Learn More](https://img.shields.io/badge/Learn%20More-Fulmen%20Spark%20Initiative-blue?style=for-the-badge&logo=lightning)](fulmen/spark/README.md)
