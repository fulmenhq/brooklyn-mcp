# Brooklyn MCP Server - User Guide

Welcome to Brooklyn, your enterprise-ready MCP server for browser automation. This guide will help you get started with using Brooklyn for your team's browser automation needs.

## What is Brooklyn?

Brooklyn is a Model Context Protocol (MCP) server that provides powerful browser automation capabilities through Playwright. It's designed for AI developers and teams who need reliable, scalable browser automation for testing, UX development, form automation, and website monitoring.

### Key Features

- **Multi-browser support**: Chromium, Firefox, and WebKit
- **AI-friendly**: Seamless integration with Claude and other AI tools
- **Team-oriented**: Multi-team isolation and resource management
- **Enterprise-ready**: Production-grade logging, monitoring, and security
- **Resource efficient**: Intelligent browser pool management

## Getting Started

### Prerequisites

Before using Brooklyn, ensure you have:

- Node.js 18+ or Bun 1.0+
- Network access to target websites
- Sufficient system resources (2GB+ RAM recommended)

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/fulmen-mcp-forge-brooklyn.git
cd fulmen-mcp-forge-brooklyn

# Install dependencies
bun install

# Setup Playwright browsers
bun run setup

# Start the server
bun run server:start
```

### First Steps

1. **Start the server**: `bun run server:start`
2. **Check status**: `bun run server:status`
3. **View logs**: `bun run server:logs`
4. **Stop server**: `bun run server:stop`

## Basic Usage

### Launching a Browser

```javascript
// Launch a new browser instance
const result = await callTool("launch_browser", {
  browserType: "chromium",
  headless: true,
  viewport: { width: 1920, height: 1080 },
});

const browserId = result.browserId;
```

### Navigating to a Website

```javascript
// Navigate to a website
const navResult = await callTool("navigate", {
  browserId: browserId,
  url: "https://example.com",
  timeout: 30000,
});

console.log(`Page title: ${navResult.title}`);
console.log(`Load time: ${navResult.loadTime}ms`);
```

### Taking Screenshots

```javascript
// Take a full page screenshot
const screenshot = await callTool("screenshot", {
  browserId: browserId,
  fullPage: true,
  type: "png",
});

// The screenshot is returned as base64 data
console.log(`Screenshot size: ${screenshot.fileSize} bytes`);
```

### Closing a Browser

```javascript
// Close the browser when done
await callTool("close_browser", {
  browserId: browserId,
});
```

## Common Use Cases

### 1. Website Testing

```javascript
// Test a website's loading and basic functionality
const browser = await callTool("launch_browser", {
  browserType: "chromium",
  headless: true,
});

const navigation = await callTool("navigate", {
  browserId: browser.browserId,
  url: "https://myapp.com",
  waitUntil: "domcontentloaded",
});

// Check if page loaded successfully
if (navigation.statusCode === 200) {
  console.log("✅ Website is accessible");

  // Take screenshot for visual verification
  const screenshot = await callTool("screenshot", {
    browserId: browser.browserId,
    fullPage: true,
  });

  console.log("📸 Screenshot captured");
}

// Clean up
await callTool("close_browser", {
  browserId: browser.browserId,
});
```

### 2. UX Development Support

```javascript
// Capture screenshots at different viewport sizes
const viewports = [
  { width: 1920, height: 1080 }, // Desktop
  { width: 1366, height: 768 }, // Laptop
  { width: 768, height: 1024 }, // Tablet
  { width: 375, height: 667 }, // Mobile
];

for (const viewport of viewports) {
  const browser = await callTool("launch_browser", {
    browserType: "chromium",
    headless: true,
    viewport: viewport,
  });

  await callTool("navigate", {
    browserId: browser.browserId,
    url: "https://myapp.com",
  });

  const screenshot = await callTool("screenshot", {
    browserId: browser.browserId,
    fullPage: true,
    type: "png",
  });

  console.log(`📱 ${viewport.width}x${viewport.height} screenshot captured`);

  await callTool("close_browser", {
    browserId: browser.browserId,
  });
}
```

### 3. Website Monitoring

```javascript
// Monitor website availability and performance
const websites = ["https://myapp.com", "https://api.myapp.com/health", "https://admin.myapp.com"];

for (const url of websites) {
  const browser = await callTool("launch_browser", {
    browserType: "chromium",
    headless: true,
  });

  const start = Date.now();

  try {
    const result = await callTool("navigate", {
      browserId: browser.browserId,
      url: url,
      timeout: 10000,
    });

    const responseTime = Date.now() - start;

    console.log(`✅ ${url}`);
    console.log(`   Status: ${result.statusCode}`);
    console.log(`   Response time: ${responseTime}ms`);
    console.log(`   Title: ${result.title}`);
  } catch (error) {
    console.log(`❌ ${url} - ${error.message}`);
  } finally {
    await callTool("close_browser", {
      browserId: browser.browserId,
    });
  }
}
```

## Browser Configuration

### Browser Types

Brooklyn supports three browser engines:

| Browser    | Use Case                 | Notes                  |
| ---------- | ------------------------ | ---------------------- |
| `chromium` | General purpose, testing | Default, fastest       |
| `firefox`  | Cross-browser testing    | Good for compatibility |
| `webkit`   | Safari compatibility     | macOS/iOS behavior     |

### Viewport Configuration

```javascript
// Common viewport sizes
const viewports = {
  desktop: { width: 1920, height: 1080 },
  laptop: { width: 1366, height: 768 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 375, height: 667 },
};

// Use custom viewport
const browser = await callTool("launch_browser", {
  browserType: "chromium",
  viewport: viewports.mobile,
});
```

### Browser Options

```javascript
// Advanced browser configuration
const browser = await callTool("launch_browser", {
  browserType: "chromium",
  headless: false, // Show browser window
  userAgent: "Custom Bot", // Custom user agent
  viewport: { width: 1920, height: 1080 },
  timeout: 60000, // 60 second timeout
});
```

## Navigation Options

### Wait Conditions

```javascript
// Different wait conditions
await callTool("navigate", {
  browserId: browserId,
  url: "https://example.com",
  waitUntil: "domcontentloaded", // or "load", "networkidle"
});
```

### Timeout Configuration

```javascript
// Set custom timeout
await callTool("navigate", {
  browserId: browserId,
  url: "https://slow-site.com",
  timeout: 60000, // 60 seconds
});
```

## Screenshot Options

### Full Page Screenshots

```javascript
// Capture entire page
const screenshot = await callTool("screenshot", {
  browserId: browserId,
  fullPage: true,
  type: "png",
});
```

### Viewport Screenshots

```javascript
// Capture only visible area
const screenshot = await callTool("screenshot", {
  browserId: browserId,
  fullPage: false,
  type: "jpeg",
  quality: 80,
});
```

### Custom Clip Region

```javascript
// Capture specific region
const screenshot = await callTool("screenshot", {
  browserId: browserId,
  clip: {
    x: 100,
    y: 100,
    width: 800,
    height: 600,
  },
});
```

## Error Handling

### Common Errors

```javascript
try {
  const result = await callTool("navigate", {
    browserId: browserId,
    url: "https://invalid-url",
  });
} catch (error) {
  if (error.message.includes("Invalid URL")) {
    console.log("❌ URL format is invalid");
  } else if (error.message.includes("Browser session not found")) {
    console.log("❌ Browser was closed or doesn't exist");
  } else if (error.message.includes("Navigation failed")) {
    console.log("❌ Could not load the page");
  }
}
```

### Timeout Handling

```javascript
// Handle navigation timeouts
try {
  await callTool("navigate", {
    browserId: browserId,
    url: "https://slow-site.com",
    timeout: 30000,
  });
} catch (error) {
  if (error.message.includes("timeout")) {
    console.log("⏱️ Page took too long to load");
    // Maybe try with a longer timeout
  }
}
```

## Best Practices

### Resource Management

```javascript
// Always clean up browsers
const browser = await callTool("launch_browser", {
  browserType: "chromium",
});

try {
  // Your automation code here
  await callTool("navigate", {
    browserId: browser.browserId,
    url: "https://example.com",
  });
} finally {
  // Always close browser, even if errors occur
  await callTool("close_browser", {
    browserId: browser.browserId,
  });
}
```

### Performance Optimization

```javascript
// Use headless mode for better performance
const browser = await callTool("launch_browser", {
  browserType: "chromium",
  headless: true, // Faster than headed mode
});

// Use appropriate wait conditions
await callTool("navigate", {
  browserId: browser.browserId,
  url: "https://example.com",
  waitUntil: "domcontentloaded", // Faster than "load"
});
```

### Error Recovery

```javascript
// Implement retry logic
async function navigateWithRetry(browserId, url, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await callTool("navigate", {
        browserId: browserId,
        url: url,
      });
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      console.log(`Retry ${i + 1}/${maxRetries} for ${url}`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}
```

## Team Usage

### Team-specific Browsers

```javascript
// Launch browser for your team
const browser = await callTool("launch_browser", {
  teamId: "echo-team",
  browserType: "chromium",
  headless: true,
});
```

### Resource Sharing

- Each team gets isolated browser sessions
- Browsers are automatically cleaned up after 30 minutes of inactivity
- Maximum 10 concurrent browsers per server instance
- Team-specific usage tracking (coming soon)

## Troubleshooting

### Browser Won't Launch

```javascript
// Check browser pool status
const status = await callTool("brooklyn_status");
console.log(`Active browsers: ${status.activeSessions}`);
console.log(`Max browsers: ${status.maxBrowsers}`);
```

### Navigation Issues

```javascript
// Check if URL is accessible
try {
  const result = await callTool("navigate", {
    browserId: browserId,
    url: "https://httpstat.us/200",
    timeout: 5000,
  });
  console.log(`Status: ${result.statusCode}`);
} catch (error) {
  console.log("Network or URL issue:", error.message);
}
```

### Performance Issues

```javascript
// Monitor browser performance
const start = Date.now();
const result = await callTool("navigate", {
  browserId: browserId,
  url: "https://example.com",
});
const totalTime = Date.now() - start;

console.log(`Load time: ${result.loadTime}ms`);
console.log(`Total time: ${totalTime}ms`);
```

## Getting Help

### Built-in Help

```javascript
// Get server capabilities
const capabilities = await callTool("brooklyn_capabilities");

// Get getting started guide
const guide = await callTool("brooklyn_getting_started");

// Get troubleshooting help
const troubleshooting = await callTool("brooklyn_troubleshooting");
```

### Support Resources

- Check server logs: `bun run server:logs`
- Review server status: `bun run server:status`
- Restart server: `bun run server:restart`
- Clean up resources: `bun run server:cleanup`

## What's Next?

- [Brooklyn CLI](./brooklyn-cli.md) - Command-line interface for server management
- [Advanced Features](./advanced-features.md) - Complex automation scenarios
- [Team Management](./team-management.md) - Multi-team configuration
- [Security Guide](./security.md) - Security best practices
- [API Reference](../api/index.md) - Complete API documentation
