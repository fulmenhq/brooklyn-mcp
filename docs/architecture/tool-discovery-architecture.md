# Brooklyn Tool Discovery Architecture

## Overview

This document outlines how AI assistants (Claude Code via MCP, other AIs via web) discover and understand Brooklyn's capabilities.

## Discovery Mechanisms

### 1. MCP Mode (Claude Code)

**Automatic Discovery via MCP Protocol:**
- Claude Code calls `tools/list` to get available tools
- Each tool includes:
  - Name (semantic, AI-friendly)
  - Description (clear capability statement)
  - Input schema (JSON Schema format)
  - Examples (optional but recommended)

**Current Implementation:**
```typescript
// In brooklyn-engine.ts
async handleToolListRequest(): Promise<Tool[]> {
  return [
    {
      name: "launch_browser",
      description: "Launch a new browser instance (Chromium, Firefox, or WebKit)",
      inputSchema: { /* JSON Schema */ }
    },
    // ... more tools
  ];
}
```

### 2. Web Mode (Other AI Assistants)

**REST API Discovery Endpoints:**

```
GET /tools
```
Returns list of all available tools with metadata

```
GET /tools/{toolName}
```
Returns detailed information about a specific tool

```
GET /capabilities
```
Returns high-level capability categories:
- Browser Management
- Navigation & Interaction
- Content Extraction
- Form Automation
- Visual Testing

### 3. Self-Documenting Tools

**Onboarding Tools (Already Implemented):**
- `brooklyn_status` - Current server status
- `brooklyn_capabilities` - What Brooklyn can do
- `brooklyn_getting_started` - Quick start guide
- `brooklyn_examples` - Example tool usage

**Recommended Additions:**
- `brooklyn_list_tools` - Categorized tool listing
- `brooklyn_tool_help` - Get help for specific tool
- `brooklyn_use_cases` - Common automation scenarios

## Tool Naming Convention

**Semantic, Action-Oriented Names:**
```
verb_noun_modifier

Examples:
- launch_browser
- navigate_to_url
- take_screenshot
- fill_form_fields
- extract_table_data
```

**Avoid:**
- Technical jargon (e.g., `executePlaywrightCommand`)
- Ambiguous names (e.g., `process`, `handle`)
- Implementation details (e.g., `callBrowserPoolManager`)

## Tool Categories

### 1. Browser Lifecycle
- launch_browser
- close_browser
- list_active_browsers

### 2. Navigation
- navigate_to_url
- go_back
- go_forward
- reload_page

### 3. Content Capture
- take_screenshot
- save_as_pdf
- get_page_content

### 4. Interaction
- click_element
- type_text
- select_option
- hover_element

### 5. Data Extraction
- get_element_text
- get_element_attribute
- extract_table_data

### 6. Form Automation
- fill_form
- submit_form

### 7. Wait & Sync
- wait_for_element
- wait_for_text
- wait_for_url

## Tool Documentation Format

Each tool should provide:

```typescript
interface ToolDocumentation {
  name: string;
  category: string;
  description: string;
  
  // What this tool does
  purpose: string;
  
  // When to use this tool
  useCases: string[];
  
  // Example requests
  examples: {
    description: string;
    input: any;
    expectedOutput: any;
  }[];
  
  // Common errors and solutions
  troubleshooting?: {
    error: string;
    solution: string;
  }[];
  
  // Related tools
  seeAlso?: string[];
}
```

## Discovery UI for Web Mode

**Recommended Web Dashboard Sections:**

1. **Quick Start**
   - Common tasks with one-click examples
   - "Try it now" interactive demos

2. **Tool Explorer**
   - Categorized tool listing
   - Search/filter capabilities
   - Interactive tool tester

3. **Use Case Library**
   - Pre-built automation workflows
   - Copy-paste ready examples
   - Industry-specific scenarios

4. **API Documentation**
   - OpenAPI/Swagger spec
   - Code examples in multiple languages
   - Postman collection export

## Implementation Priority

1. **Phase 1: Enhanced MCP Discovery**
   - Add examples to existing tools
   - Implement help tools
   - Improve tool descriptions

2. **Phase 2: Web API Discovery**
   - /tools endpoint with full documentation
   - /capabilities overview endpoint
   - Interactive API explorer

3. **Phase 3: Use Case Library**
   - Common automation patterns
   - Industry-specific examples
   - Workflow templates

## Success Metrics

- Time to first successful tool use < 5 minutes
- Tool discovery without documentation < 2 minutes
- 90%+ successful first-attempt tool usage
- Zero "I don't know what tools are available" responses