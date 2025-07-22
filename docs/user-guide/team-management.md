# Team Management

Brooklyn MCP server is designed for multi-team environments. This guide covers team-specific configuration, resource management, and collaboration patterns.

## Team Concepts

### Team Isolation

Each team gets:

- **Isolated browser sessions** - Team-tagged browser instances
- **Resource quotas** - Configurable limits per team
- **Usage tracking** - Monitor team-specific resource usage
- **Configuration management** - Team-specific settings

### Team Identification

```javascript
// Launch browser with team identification
const browser = await callTool("launch_browser", {
  teamId: "example-team",
  browserType: "chromium",
  headless: true,
});
```

## Team Configuration

### Environment Variables

```bash
# Team-specific configuration
export WEBPILOT_TEAM_ID=example-team
export WEBPILOT_TEAM_MAX_BROWSERS=5
export WEBPILOT_TEAM_TIMEOUT=30000
```

### Configuration Files

Create team-specific configuration files in the `configs/` directory:

```javascript
// configs/example-team.json
{
  "teamId": "example-team",
  "displayName": "Example Team - Example Corp",
  "maxBrowsers": 5,
  "defaultBrowserType": "chromium",
  "defaultViewport": {
    "width": 1920,
    "height": 1080
  },
  "allowedDomains": [
    "*.example.com",
    "*.staging.example.com",
    "localhost:*"
  ],
  "browserOptions": {
    "headless": true,
    "timeout": 30000
  }
}
```

## Team Usage Patterns

### Example Team (Example Corp)

Primary use case: UX development and testing

```javascript
// Echo team workflow for UX testing
async function echoTeamUxTest(pageUrl, viewports) {
  const results = [];

  for (const viewport of viewports) {
    const browser = await callTool("launch_browser", {
      teamId: "example-team",
      browserType: "chromium",
      headless: true,
      viewport: viewport,
    });

    try {
      // Navigate to page
      const navResult = await callTool("navigate", {
        browserId: browser.browserId,
        url: pageUrl,
        waitUntil: "domcontentloaded",
      });

      // Capture screenshot
      const screenshot = await callTool("screenshot", {
        browserId: browser.browserId,
        fullPage: true,
        type: "png",
      });

      results.push({
        viewport: viewport,
        loadTime: navResult.loadTime,
        title: navResult.title,
        screenshot: screenshot,
        team: "example-team",
      });
    } finally {
      await callTool("close_browser", {
        browserId: browser.browserId,
      });
    }
  }

  return results;
}
```

### QA Team

Primary use case: Cross-browser testing

```javascript
// QA team cross-browser testing
async function qaTeamCrossBrowserTest(testUrls) {
  const browserTypes = ["chromium", "firefox", "webkit"];
  const results = [];

  for (const browserType of browserTypes) {
    for (const url of testUrls) {
      const browser = await callTool("launch_browser", {
        teamId: "qa-team",
        browserType: browserType,
        headless: true,
      });

      try {
        const navResult = await callTool("navigate", {
          browserId: browser.browserId,
          url: url,
          timeout: 30000,
        });

        results.push({
          url: url,
          browserType: browserType,
          success: navResult.statusCode < 400,
          loadTime: navResult.loadTime,
          team: "qa-team",
        });
      } catch (error) {
        results.push({
          url: url,
          browserType: browserType,
          success: false,
          error: error.message,
          team: "qa-team",
        });
      } finally {
        await callTool("close_browser", {
          browserId: browser.browserId,
        });
      }
    }
  }

  return results;
}
```

### Data Team

Primary use case: Data extraction and monitoring

```javascript
// Data team monitoring workflow
async function dataTeamMonitoring(endpoints) {
  const results = [];

  for (const endpoint of endpoints) {
    const browser = await callTool("launch_browser", {
      teamId: "data-team",
      browserType: "chromium",
      headless: true,
    });

    try {
      const navResult = await callTool("navigate", {
        browserId: browser.browserId,
        url: endpoint.url,
        timeout: 15000,
      });

      // Extract data (future feature)
      const data = {
        url: endpoint.url,
        statusCode: navResult.statusCode,
        loadTime: navResult.loadTime,
        title: navResult.title,
        timestamp: new Date().toISOString(),
        team: "data-team",
      };

      results.push(data);
    } catch (error) {
      results.push({
        url: endpoint.url,
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
        team: "data-team",
      });
    } finally {
      await callTool("close_browser", {
        browserId: browser.browserId,
      });
    }
  }

  return results;
}
```

## Resource Management

### Team Quotas

```javascript
// Check team resource usage
async function checkTeamUsage(teamId) {
  const status = await callTool("brooklyn_status");

  const teamSessions = status.sessions.filter(session => session.teamId === teamId);

  return {
    teamId: teamId,
    activeSessions: teamSessions.length,
    maxBrowsers: status.maxBrowsers,
    utilization: (teamSessions.length / status.maxBrowsers) * 100,
    sessions: teamSessions,
  };
}
```

### Resource Allocation

```javascript
// Implement fair resource allocation
class TeamResourceManager {
  constructor(maxGlobalBrowsers = 10) {
    this.maxGlobalBrowsers = maxGlobalBrowsers;
    this.teamQuotas = new Map();
    this.defaultQuota = 3;
  }

  setTeamQuota(teamId, quota) {
    this.teamQuotas.set(teamId, quota);
  }

  getTeamQuota(teamId) {
    return this.teamQuotas.get(teamId) || this.defaultQuota;
  }

  async canLaunchBrowser(teamId) {
    const status = await callTool("brooklyn_status");
    const teamSessions = status.sessions.filter(s => s.teamId === teamId);
    const teamQuota = this.getTeamQuota(teamId);

    return {
      allowed: teamSessions.length < teamQuota && status.activeSessions < this.maxGlobalBrowsers,
      currentUsage: teamSessions.length,
      quota: teamQuota,
      globalUsage: status.activeSessions,
      globalMax: this.maxGlobalBrowsers,
    };
  }
}
```

## Team Collaboration

### Shared Workflows

```javascript
// Shared workflow for all teams
async function sharedWebsiteHealthCheck(url, teamId) {
  const browser = await callTool("launch_browser", {
    teamId: teamId,
    browserType: "chromium",
    headless: true,
  });

  try {
    const start = Date.now();
    const navResult = await callTool("navigate", {
      browserId: browser.browserId,
      url: url,
      timeout: 30000,
    });

    const screenshot = await callTool("screenshot", {
      browserId: browser.browserId,
      fullPage: false,
    });

    return {
      url: url,
      team: teamId,
      timestamp: new Date().toISOString(),
      success: navResult.statusCode < 400,
      loadTime: navResult.loadTime,
      statusCode: navResult.statusCode,
      title: navResult.title,
      screenshot: screenshot,
      totalTime: Date.now() - start,
    };
  } finally {
    await callTool("close_browser", {
      browserId: browser.browserId,
    });
  }
}
```

### Cross-Team Reporting

```javascript
// Generate cross-team usage report
async function generateTeamReport(timeRange = "1h") {
  const status = await callTool("brooklyn_status");

  // Group sessions by team
  const teamGroups = status.sessions.reduce((groups, session) => {
    const team = session.teamId || "unknown";
    if (!groups[team]) {
      groups[team] = [];
    }
    groups[team].push(session);
    return groups;
  }, {});

  // Calculate metrics per team
  const teamMetrics = Object.entries(teamGroups).map(([teamId, sessions]) => {
    const now = Date.now();
    const recentSessions = sessions.filter(
      session => now - new Date(session.lastUsed).getTime() < 3600000, // 1 hour
    );

    return {
      teamId: teamId,
      totalSessions: sessions.length,
      recentSessions: recentSessions.length,
      avgSessionAge:
        sessions.reduce((sum, s) => sum + (now - new Date(s.createdAt).getTime()), 0) /
        sessions.length,
      utilization: (sessions.length / status.maxBrowsers) * 100,
    };
  });

  return {
    timestamp: new Date().toISOString(),
    globalMetrics: {
      totalSessions: status.activeSessions,
      maxBrowsers: status.maxBrowsers,
      globalUtilization: (status.activeSessions / status.maxBrowsers) * 100,
    },
    teamMetrics: teamMetrics,
  };
}
```

## Team-Specific Features

### Domain Allowlists

```javascript
// Team-specific domain validation
function validateUrlForTeam(url, teamId) {
  const teamAllowlists = {
    "example-team": ["*.example.com", "*.staging.example.com", "localhost:*"],
    "qa-team": ["*.example.com", "*.test.com", "httpstat.us"],
    "data-team": ["*.api.com", "*.metrics.com", "*.analytics.com"],
  };

  const allowlist = teamAllowlists[teamId] || [];
  if (allowlist.length === 0) return true; // No restrictions

  const parsedUrl = new URL(url);
  const hostname = parsedUrl.hostname;

  return allowlist.some(pattern => {
    const regex = new RegExp(pattern.replace(/\*/g, ".*"));
    return regex.test(hostname);
  });
}
```

### Team-Specific Defaults

```javascript
// Apply team-specific defaults
function getTeamDefaults(teamId) {
  const defaults = {
    "example-team": {
      browserType: "chromium",
      headless: true,
      viewport: { width: 1920, height: 1080 },
      timeout: 30000,
      waitUntil: "domcontentloaded",
    },
    "qa-team": {
      browserType: "chromium",
      headless: true,
      viewport: { width: 1366, height: 768 },
      timeout: 45000,
      waitUntil: "load",
    },
    "data-team": {
      browserType: "chromium",
      headless: true,
      viewport: { width: 1280, height: 720 },
      timeout: 15000,
      waitUntil: "domcontentloaded",
    },
  };

  return defaults[teamId] || defaults["example-team"];
}

// Launch browser with team defaults
async function launchTeamBrowser(teamId, overrides = {}) {
  const defaults = getTeamDefaults(teamId);

  return await callTool("launch_browser", {
    teamId: teamId,
    ...defaults,
    ...overrides,
  });
}
```

## Monitoring and Analytics

### Team Usage Tracking

```javascript
// Track team usage over time
class TeamUsageTracker {
  constructor() {
    this.usage = new Map();
  }

  recordBrowserLaunch(teamId, browserType) {
    const key = `${teamId}-${browserType}`;
    const current = this.usage.get(key) || { count: 0, lastUsed: null };

    this.usage.set(key, {
      count: current.count + 1,
      lastUsed: new Date(),
    });
  }

  getTeamUsage(teamId) {
    const teamUsage = {};

    for (const [key, data] of this.usage) {
      if (key.startsWith(teamId)) {
        const browserType = key.replace(`${teamId}-`, "");
        teamUsage[browserType] = data;
      }
    }

    return teamUsage;
  }

  generateReport() {
    const report = {};

    for (const [key, data] of this.usage) {
      const [teamId, browserType] = key.split("-");

      if (!report[teamId]) {
        report[teamId] = {};
      }

      report[teamId][browserType] = {
        launches: data.count,
        lastUsed: data.lastUsed,
      };
    }

    return report;
  }
}
```

### Performance Metrics by Team

```javascript
// Collect performance metrics by team
async function collectTeamMetrics(teamId, duration = 3600000) {
  const metrics = [];
  const startTime = Date.now();

  while (Date.now() - startTime < duration) {
    const status = await callTool("brooklyn_status");
    const teamSessions = status.sessions.filter(s => s.teamId === teamId);

    metrics.push({
      timestamp: new Date().toISOString(),
      teamId: teamId,
      activeSessions: teamSessions.length,
      globalSessions: status.activeSessions,
      utilization: (teamSessions.length / status.maxBrowsers) * 100,
    });

    await new Promise(resolve => setTimeout(resolve, 60000)); // 1 minute intervals
  }

  return {
    teamId: teamId,
    duration: duration,
    metrics: metrics,
    summary: {
      avgSessions: metrics.reduce((sum, m) => sum + m.activeSessions, 0) / metrics.length,
      maxSessions: Math.max(...metrics.map(m => m.activeSessions)),
      avgUtilization: metrics.reduce((sum, m) => sum + m.utilization, 0) / metrics.length,
    },
  };
}
```

## Team Onboarding

### New Team Setup

```javascript
// Onboard new team
async function onboardTeam(teamConfig) {
  const {
    teamId,
    displayName,
    maxBrowsers = 3,
    allowedDomains = [],
    defaultBrowserType = "chromium",
    contactEmail,
  } = teamConfig;

  // Create team configuration
  const config = {
    teamId: teamId,
    displayName: displayName,
    maxBrowsers: maxBrowsers,
    allowedDomains: allowedDomains,
    defaultBrowserType: defaultBrowserType,
    contactEmail: contactEmail,
    createdAt: new Date().toISOString(),
  };

  // Save configuration (future feature)
  // await saveTeamConfig(config);

  // Test team setup
  const testBrowser = await callTool("launch_browser", {
    teamId: teamId,
    browserType: defaultBrowserType,
    headless: true,
  });

  await callTool("close_browser", {
    browserId: testBrowser.browserId,
  });

  return {
    success: true,
    teamId: teamId,
    message: `Team ${displayName} onboarded successfully`,
    config: config,
  };
}
```

### Team Documentation

```javascript
// Generate team-specific documentation
function generateTeamDocs(teamId) {
  const teamConfigs = {
    "example-team": {
      name: "Example Team - Example Corp",
      description: "UX development and testing",
      primaryUseCase: "Responsive design testing",
      supportedBrowsers: ["chromium"],
      defaultViewport: "1920x1080",
      examples: [
        "Taking screenshots across viewport sizes",
        "Testing page load performance",
        "Visual regression testing",
      ],
    },
    "qa-team": {
      name: "QA Team",
      description: "Cross-browser testing and validation",
      primaryUseCase: "Cross-browser compatibility testing",
      supportedBrowsers: ["chromium", "firefox", "webkit"],
      defaultViewport: "1366x768",
      examples: [
        "Cross-browser compatibility testing",
        "Automated regression testing",
        "Performance benchmarking",
      ],
    },
  };

  const config = teamConfigs[teamId];
  if (!config) {
    return { error: `Team ${teamId} not found` };
  }

  return {
    teamId: teamId,
    ...config,
    generatedAt: new Date().toISOString(),
  };
}
```

## Best Practices for Teams

### Resource Management

- Set appropriate quotas for each team
- Monitor resource usage regularly
- Implement cleanup policies for idle sessions

### Security

- Use domain allowlists for production teams
- Implement team-specific access controls
- Monitor cross-team resource usage

### Performance

- Use headless browsers for better performance
- Implement proper error handling and retries
- Clean up browser sessions promptly

### Collaboration

- Document team-specific workflows
- Share common patterns across teams
- Implement cross-team reporting
