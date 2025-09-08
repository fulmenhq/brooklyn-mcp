# Advanced Features

This guide covers advanced Brooklyn MCP server features for power users and complex automation scenarios.

## Multi-Browser Sessions

### Parallel Browser Operations

```javascript
// Launch multiple browsers for parallel testing
const browsers = await Promise.all([
  callTool("launch_browser", { browserType: "chromium" }),
  callTool("launch_browser", { browserType: "firefox" }),
  callTool("launch_browser", { browserType: "webkit" }),
]);

// Test the same site across all browsers
const results = await Promise.all(
  browsers.map(async browser => {
    const result = await callTool("navigate", {
      browserId: browser.browserId,
      url: "https://example.com",
    });
    return {
      browser: browser.browserType,
      loadTime: result.loadTime,
      title: result.title,
    };
  }),
);

// Clean up all browsers
await Promise.all(
  browsers.map(browser => callTool("close_browser", { browserId: browser.browserId })),
);
```

### Browser Pool Management

```javascript
// Monitor browser pool usage
const status = await callTool("brooklyn_status");
console.log(`Active sessions: ${status.activeSessions}/${status.maxBrowsers}`);

// List all active sessions
status.sessions.forEach(session => {
  console.log(`Session ${session.id}: ${session.teamId} (${session.lastUsed})`);
});
```

## Advanced Navigation

### Custom Wait Strategies

```javascript
// Wait for network to be idle
await callTool("navigate", {
  browserId: browserId,
  url: "https://spa-app.com",
  waitUntil: "networkidle",
  timeout: 60000,
});

// Wait for DOM content (faster for static sites)
await callTool("navigate", {
  browserId: browserId,
  url: "https://static-site.com",
  waitUntil: "domcontentloaded",
  timeout: 15000,
});
```

### Navigation Performance Analysis

```javascript
// Analyze navigation performance
const navigationResults = [];

for (const url of urls) {
  const start = Date.now();

  try {
    const result = await callTool("navigate", {
      browserId: browserId,
      url: url,
      timeout: 30000,
    });

    navigationResults.push({
      url: url,
      success: true,
      loadTime: result.loadTime,
      statusCode: result.statusCode,
      title: result.title,
      totalTime: Date.now() - start,
    });
  } catch (error) {
    navigationResults.push({
      url: url,
      success: false,
      error: error.message,
      totalTime: Date.now() - start,
    });
  }
}

// Analyze results
const successful = navigationResults.filter(r => r.success);
const failed = navigationResults.filter(r => !r.success);
const avgLoadTime = successful.reduce((sum, r) => sum + r.loadTime, 0) / successful.length;

console.log(`✅ Successful: ${successful.length}`);
console.log(`❌ Failed: ${failed.length}`);
console.log(`📊 Average load time: ${avgLoadTime.toFixed(2)}ms`);
```

## Advanced Screenshot Techniques

### Responsive Screenshot Testing

```javascript
// Test responsive design across viewport sizes
const viewports = [
  { name: "Desktop", width: 1920, height: 1080 },
  { name: "Laptop", width: 1366, height: 768 },
  { name: "Tablet", width: 768, height: 1024 },
  { name: "Mobile", width: 375, height: 667 },
];

const screenshots = {};

for (const viewport of viewports) {
  const browser = await callTool("launch_browser", {
    browserType: "chromium",
    headless: true,
    viewport: viewport,
  });

  await callTool("navigate", {
    browserId: browser.browserId,
    url: "https://example.com",
  });

  const screenshot = await callTool("screenshot", {
    browserId: browser.browserId,
    fullPage: true,
    type: "png",
  });

  screenshots[viewport.name] = {
    data: screenshot.data,
    dimensions: screenshot.dimensions,
    fileSize: screenshot.fileSize,
  };

  await callTool("close_browser", {
    browserId: browser.browserId,
  });
}
```

### Screenshot Comparison

```javascript
// Compare screenshots before/after changes
async function compareScreenshots(url, beforeBrowser, afterBrowser) {
  // Navigate both browsers
  await Promise.all([
    callTool("navigate", { browserId: beforeBrowser, url: url }),
    callTool("navigate", { browserId: afterBrowser, url: url }),
  ]);

  // Take screenshots
  const [beforeShot, afterShot] = await Promise.all([
    callTool("screenshot", { browserId: beforeBrowser, fullPage: true }),
    callTool("screenshot", { browserId: afterBrowser, fullPage: true }),
  ]);

  return {
    before: beforeShot,
    after: afterShot,
    sizeDifference: afterShot.fileSize - beforeShot.fileSize,
  };
}
```

## Layout Debugging Tools

The following tools accelerate CSS/layout investigation and rapid iteration on live sites (dev/staging only).

- highlight_element_bounds: Overlay bounds for a selector; returns `highlightId` and bounds
- show_layout_grid: Toggle a configurable grid overlay
- remove_overlay: Remove any overlay by ID
- apply_css_override / revert_css_changes: Temporary CSS changes for quick testing
- wait_for_url / wait_for_navigation / wait_for_network_idle: Stabilize flows before/after layout changes
- scroll_into_view / scroll_to / scroll_by: Bring elements into view and align
- get_layout_tree: Bounded tree with tag/id/class, position/display, and bounds
- measure_whitespace: Detect vertical gaps between stacked children
- find_layout_containers: Identify flex/grid/positioned containers with relevant properties

### Quick Playbook: Fixing Unexpected Whitespace

```javascript
// 1) Highlight the problem area for visual confirmation
await callTool("highlight_element_bounds", { selector: ".main-frame" });

// 2) Measure whitespace between stacked children
const gaps = await callTool("measure_whitespace", {
  containerSelector: ".content-wrapper",
  minGap: 16,
});

// 3) Test a CSS override to resolve the gap
const override = await callTool("apply_css_override", {
  selector: ".main-frame",
  cssRules: { transform: "translateY(-64px)", position: "relative" },
  important: true,
});

// 4) Verify page state is stable
await callTool("wait_for_network_idle", {});

// 5) Revert when done
await callTool("revert_css_changes", { overrideId: override.overrideId });
```

### Grid Overlay

```javascript
const grid = await callTool("show_layout_grid", { gridSize: 20 });
// ...investigate alignments...
await callTool("remove_overlay", { overlayId: grid.overlayId });
```

### Layout Structure Snapshot

```javascript
const structure = await callTool("get_layout_tree", { rootSelector: "main", maxDepth: 3 });
console.log(structure.tree);
```

### Container Discovery

```javascript
const containers = await callTool("find_layout_containers", {});
console.log(containers.containers.slice(0, 5));
```

## CSS Cascade Assistants

These helpers reduce guesswork and help newer UX developers avoid unproductive CSS “hacking”.

- simulate_css_change(selector, cssRules): Reports which properties would change (before/after), with optional !important probing.
- why_style_not_applied(selector, property, desiredValue?): Explains likely causes; tests desiredValue and offers recommendations.

### Example: Diagnose why "top" isn’t moving an element

```javascript
const explain = await callTool("why_style_not_applied", {
  selector: ".card",
  property: "top",
  desiredValue: "-20px",
});

// Sample response
// {
//   success: true,
//   property: "top",
//   computed: { before: "auto", after: "-20px" },
//   reasons: ["Position is static; offsets only take effect when position != static"],
//   recommendations: ["Set position: relative on the element or appropriate ancestor"]
// }
```

### Example: Preview a safe CSS change

```javascript
const sim = await callTool("simulate_css_change", {
  selector: ".hero",
  cssRules: { position: "relative", top: "-16px" },
});

// Review `sim.data.overallChanged` and the per-property changes to avoid no-op edits
```

## Cascade Quick Reference

- Position offsets: `top/left/right/bottom` only affect positioned elements (`position: relative|absolute|fixed|sticky`).
- z-index: meaningful only on positioned/flex/grid contexts and within stacking contexts; “static” won’t stack.
- Inline limits: `width/height` and vertical margins don’t affect inline non-replaced elements — use `display: inline-block|block|flex`.
- Specificity vs source order: higher specificity beats later rules; if specificity ties, the later rule wins.
- !important: wins precedence but avoid for maintainability; prefer reducing specificity or adjusting rule structure.
- Debug flow:
  - Preview with `simulate_css_change` (no edits)
  - If no change, run `why_style_not_applied` with a `desiredValue`
  - Inspect with `get_applicable_rules` and `get_effective_computed`
  - Apply `apply_css_override` and then `revert_css_changes` after verification

## Browser Automation Patterns

### Page Load Verification

```javascript
// Comprehensive page load verification
async function verifyPageLoad(browserId, url) {
  const result = await callTool("navigate", {
    browserId: browserId,
    url: url,
    waitUntil: "domcontentloaded",
  });

  // Check basic success criteria
  const checks = {
    validStatusCode: result.statusCode >= 200 && result.statusCode < 400,
    hasTitle: result.title && result.title.length > 0,
    loadTimeAcceptable: result.loadTime < 5000,
    urlMatches: result.url.includes(new URL(url).hostname),
  };

  const screenshot = await callTool("screenshot", {
    browserId: browserId,
    fullPage: false, // Just viewport
  });

  return {
    ...result,
    checks: checks,
    allChecksPassed: Object.values(checks).every(check => check),
    screenshot: screenshot,
  };
}
```

### Batch Website Testing

```javascript
// Test multiple websites efficiently
async function batchWebsiteTest(urls, options = {}) {
  const {
    maxConcurrent = 3,
    timeout = 30000,
    browserType = "chromium",
    takeScreenshots = true,
  } = options;

  const results = [];

  // Process URLs in batches
  for (let i = 0; i < urls.length; i += maxConcurrent) {
    const batch = urls.slice(i, i + maxConcurrent);

    const batchResults = await Promise.all(
      batch.map(async url => {
        const browser = await callTool("launch_browser", {
          browserType: browserType,
          headless: true,
        });

        try {
          const navResult = await callTool("navigate", {
            browserId: browser.browserId,
            url: url,
            timeout: timeout,
          });

          let screenshot = null;
          if (takeScreenshots) {
            screenshot = await callTool("screenshot", {
              browserId: browser.browserId,
              fullPage: false,
            });
          }

          return {
            url: url,
            success: true,
            ...navResult,
            screenshot: screenshot,
          };
        } catch (error) {
          return {
            url: url,
            success: false,
            error: error.message,
          };
        } finally {
          await callTool("close_browser", {
            browserId: browser.browserId,
          });
        }
      }),
    );

    results.push(...batchResults);
  }

  return results;
}
```

## Error Handling and Recovery

### Robust Error Handling

```javascript
// Comprehensive error handling
async function robustNavigate(browserId, url, options = {}) {
  const { maxRetries = 3, retryDelay = 1000, timeout = 30000 } = options;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await callTool("navigate", {
        browserId: browserId,
        url: url,
        timeout: timeout,
      });

      // Validate result
      if (result.statusCode >= 400) {
        throw new Error(`HTTP ${result.statusCode}: ${result.url}`);
      }

      return result;
    } catch (error) {
      console.log(`Attempt ${attempt}/${maxRetries} failed: ${error.message}`);

      if (attempt === maxRetries) {
        throw new Error(`Failed after ${maxRetries} attempts: ${error.message}`);
      }

      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }
}
```

### Browser Session Recovery

```javascript
// Recover from browser session errors
async function withBrowserRecovery(operation, options = {}) {
  const { maxBrowserRetries = 2 } = options;
  let browser = null;

  for (let attempt = 1; attempt <= maxBrowserRetries; attempt++) {
    try {
      browser = await callTool("launch_browser", {
        browserType: "chromium",
        headless: true,
      });

      const result = await operation(browser.browserId);

      await callTool("close_browser", {
        browserId: browser.browserId,
      });

      return result;
    } catch (error) {
      console.log(`Browser attempt ${attempt} failed: ${error.message}`);

      // Clean up failed browser
      if (browser) {
        try {
          await callTool("close_browser", {
            browserId: browser.browserId,
            force: true,
          });
        } catch (cleanupError) {
          console.log("Browser cleanup failed:", cleanupError.message);
        }
      }

      if (attempt === maxBrowserRetries) {
        throw error;
      }
    }
  }
}
```

## Performance Monitoring

### Resource Usage Tracking

```javascript
// Monitor browser pool resource usage
async function monitorResourceUsage(duration = 60000) {
  const measurements = [];
  const interval = 5000; // 5 second intervals

  const startTime = Date.now();

  while (Date.now() - startTime < duration) {
    const status = await callTool("brooklyn_status");

    measurements.push({
      timestamp: new Date().toISOString(),
      activeSessions: status.activeSessions,
      maxBrowsers: status.maxBrowsers,
      utilization: (status.activeSessions / status.maxBrowsers) * 100,
    });

    await new Promise(resolve => setTimeout(resolve, interval));
  }

  // Analyze measurements
  const avgUtilization =
    measurements.reduce((sum, m) => sum + m.utilization, 0) / measurements.length;
  const maxUtilization = Math.max(...measurements.map(m => m.utilization));

  return {
    measurements: measurements,
    summary: {
      averageUtilization: avgUtilization.toFixed(2),
      maxUtilization: maxUtilization.toFixed(2),
      totalMeasurements: measurements.length,
    },
  };
}
```

### Performance Benchmarking

```javascript
// Benchmark browser performance
async function benchmarkBrowser(urls, browserType = "chromium") {
  const results = [];

  const browser = await callTool("launch_browser", {
    browserType: browserType,
    headless: true,
  });

  try {
    for (const url of urls) {
      const start = Date.now();

      const navResult = await callTool("navigate", {
        browserId: browser.browserId,
        url: url,
        timeout: 30000,
      });

      const screenshotStart = Date.now();
      const screenshot = await callTool("screenshot", {
        browserId: browser.browserId,
        fullPage: false,
      });
      const screenshotTime = Date.now() - screenshotStart;

      results.push({
        url: url,
        browserType: browserType,
        navigationTime: navResult.loadTime,
        screenshotTime: screenshotTime,
        totalTime: Date.now() - start,
        statusCode: navResult.statusCode,
        screenshotSize: screenshot.fileSize,
      });
    }
  } finally {
    await callTool("close_browser", {
      browserId: browser.browserId,
    });
  }

  return results;
}
```

## Integration Patterns

### CI/CD Integration

```javascript
// Website testing for CI/CD pipelines
async function ciWebsiteTest(config) {
  const { urls, browserTypes = ["chromium"], failOnError = true, outputFile = null } = config;

  const results = [];
  let hasFailures = false;

  for (const browserType of browserTypes) {
    for (const url of urls) {
      const browser = await callTool("launch_browser", {
        browserType: browserType,
        headless: true,
      });

      try {
        const result = await callTool("navigate", {
          browserId: browser.browserId,
          url: url,
          timeout: 30000,
        });

        const success = result.statusCode >= 200 && result.statusCode < 400;
        if (!success) hasFailures = true;

        results.push({
          url: url,
          browserType: browserType,
          success: success,
          statusCode: result.statusCode,
          loadTime: result.loadTime,
          title: result.title,
        });
      } catch (error) {
        hasFailures = true;
        results.push({
          url: url,
          browserType: browserType,
          success: false,
          error: error.message,
        });
      } finally {
        await callTool("close_browser", {
          browserId: browser.browserId,
        });
      }
    }
  }

  // Output results
  if (outputFile) {
    await writeFile(outputFile, JSON.stringify(results, null, 2));
  }

  if (failOnError && hasFailures) {
    throw new Error("Website tests failed");
  }

  return results;
}
```

### Custom Automation Workflows

```javascript
// Create reusable automation workflows
class BrowserWorkflow {
  constructor(browserType = "chromium") {
    this.browserType = browserType;
    this.browser = null;
  }

  async start() {
    this.browser = await callTool("launch_browser", {
      browserType: this.browserType,
      headless: true,
    });
    return this;
  }

  async navigate(url, options = {}) {
    if (!this.browser) throw new Error("Browser not started");

    const result = await callTool("navigate", {
      browserId: this.browser.browserId,
      url: url,
      ...options,
    });

    return result;
  }

  async screenshot(options = {}) {
    if (!this.browser) throw new Error("Browser not started");

    return await callTool("screenshot", {
      browserId: this.browser.browserId,
      fullPage: true,
      ...options,
    });
  }

  async close() {
    if (this.browser) {
      await callTool("close_browser", {
        browserId: this.browser.browserId,
      });
      this.browser = null;
    }
  }
}

// Usage
const workflow = new BrowserWorkflow("chromium");
await workflow.start();
await workflow.navigate("https://example.com");
const screenshot = await workflow.screenshot();
await workflow.close();
```

## Security Considerations

### URL Validation

```javascript
// Validate URLs before navigation
function validateUrl(url) {
  try {
    const parsed = new URL(url);

    // Check protocol
    if (!["http:", "https:"].includes(parsed.protocol)) {
      throw new Error("Only HTTP/HTTPS URLs are allowed");
    }

    // Check for suspicious patterns
    if (
      parsed.hostname.includes("localhost") ||
      parsed.hostname.includes("127.0.0.1") ||
      parsed.hostname.includes("192.168.")
    ) {
      throw new Error("Local network URLs are not allowed");
    }

    return true;
  } catch (error) {
    throw new Error(`Invalid URL: ${error.message}`);
  }
}

// Safe navigation
async function safeNavigate(browserId, url) {
  validateUrl(url);

  return await callTool("navigate", {
    browserId: browserId,
    url: url,
    timeout: 30000,
  });
}
```

### Resource Limits

```javascript
// Implement resource limits
class ResourceManager {
  constructor(maxConcurrent = 5, maxDuration = 300000) {
    this.maxConcurrent = maxConcurrent;
    this.maxDuration = maxDuration;
    this.activeBrowsers = new Map();
  }

  async launchBrowser(options = {}) {
    if (this.activeBrowsers.size >= this.maxConcurrent) {
      throw new Error(`Maximum concurrent browsers reached: ${this.maxConcurrent}`);
    }

    const browser = await callTool("launch_browser", options);

    const session = {
      id: browser.browserId,
      startTime: Date.now(),
      timeout: setTimeout(() => {
        this.forceCloseBrowser(browser.browserId);
      }, this.maxDuration),
    };

    this.activeBrowsers.set(browser.browserId, session);
    return browser;
  }

  async closeBrowser(browserId) {
    const session = this.activeBrowsers.get(browserId);
    if (session) {
      clearTimeout(session.timeout);
      this.activeBrowsers.delete(browserId);
    }

    return await callTool("close_browser", { browserId });
  }

  async forceCloseBrowser(browserId) {
    try {
      await this.closeBrowser(browserId);
    } catch (error) {
      console.log(`Force close failed for ${browserId}:`, error.message);
    }
  }
}
```

## Best Practices Summary

1. **Always clean up browsers** - Use try/finally blocks
2. **Implement retry logic** - Handle transient failures
3. **Monitor resource usage** - Track browser pool utilization
4. **Validate inputs** - Check URLs and parameters
5. **Use appropriate timeouts** - Balance speed vs reliability
6. **Handle errors gracefully** - Provide meaningful error messages
7. **Test across browsers** - Ensure cross-browser compatibility
8. **Monitor performance** - Track load times and resource usage
