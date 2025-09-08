# HTTP Transport Deployment Guide - Brooklyn MCP v1.6.0

## Overview

Brooklyn MCP provides both MCP (stdio) and HTTP transports. The HTTP transport enables web-based access, REST API integration, and OAuth authentication flows. This guide covers planning, configuration, and deployment of the HTTP transport with authentication.

## Transport Architecture

### MCP vs HTTP Transport

```typescript
// Both transports can run simultaneously
{
  "transports": {
    "mcp": {
      "enabled": true    // For Claude Code integration
    },
    "http": {
      "enabled": true,   // For web access and OAuth
      "port": 3000,
      "host": "127.0.0.1",
      "cors": true,
      "rateLimiting": true
    }
  }
}
```

### Use Cases by Transport

- **MCP Transport**: Claude Code integration, direct tool access, development workflows
- **HTTP Transport**: Web dashboards, OAuth authentication, REST API access, team collaboration

## Authentication Planning

### 1. Choose Authentication Mode

#### GitHub OAuth (Recommended for Teams)

**Best for**: Organizations already using GitHub, team-based access control

```bash
# Environment setup
export BROOKLYN_AUTH_MODE=github
export BROOKLYN_GITHUB_CLIENT_ID=your_github_app_id
export BROOKLYN_GITHUB_CLIENT_SECRET=your_github_app_secret
export BROOKLYN_GITHUB_CALLBACK_URL=https://brooklyn.company.com/oauth/callback
```

**User Management**: Managed through GitHub organization/team membership

#### Local Authentication

**Best for**: Self-hosted environments, custom user management

```bash
# Environment setup
export BROOKLYN_AUTH_MODE=local
export BROOKLYN_LOCAL_USER_STORE=/opt/brooklyn/users.json
export BROOKLYN_LOCAL_SESSION_TIMEOUT=86400000  # 24 hours
```

**User Management**: File-based with CLI tools (planned for future release)

#### Development Mode

**Best for**: Local development, testing, prototyping

```bash
# Development only - explicit flag required
export BROOKLYN_AUTH_MODE=none
export BROOKLYN_AUTH_DEVELOPMENT_ONLY=true
brooklyn mcp start --development-only
```

## GitHub OAuth Configuration

### Step 1: Create GitHub OAuth App

1. **Navigate to GitHub**: Settings → Developer settings → OAuth Apps
2. **Create New App**:
   - **Application name**: `Brooklyn MCP - [Company Name]`
   - **Homepage URL**: `https://brooklyn.company.com`
   - **Authorization callback URL**: `https://brooklyn.company.com/oauth/callback`
   - **Enable Device Flow**: No

3. **Generate Client Secret**: Save both Client ID and Client Secret securely

### Step 2: Configure User Access

#### Organization-Based Access

```bash
# Allow all members of specific organizations
export BROOKLYN_GITHUB_ALLOWED_ORGS=fulmenhq,company-org,partner-org
```

#### Team-Based Access (Granular Control)

```bash
# Format: "org1:team1,team2;org2:team3,team4"
export BROOKLYN_GITHUB_ALLOWED_TEAMS="fulmenhq:brooklyn-team,admins;company-org:developers,qa-team"
```

#### Configuration Examples

**Simple Organization Access**:

```json
{
  "authentication": {
    "mode": "github",
    "behindProxy": true,
    "providers": {
      "github": {
        "clientId": "${BROOKLYN_GITHUB_CLIENT_ID}",
        "clientSecret": "${BROOKLYN_GITHUB_CLIENT_SECRET}",
        "callbackUrl": "https://brooklyn.company.com/oauth/callback",
        "allowedOrgs": ["fulmenhq", "company-org"],
        "scopes": ["user:email", "read:org"]
      }
    }
  }
}
```

**Team-Specific Access**:

```json
{
  "authentication": {
    "mode": "github",
    "providers": {
      "github": {
        "allowedTeams": {
          "fulmenhq": ["brooklyn-team", "admins"],
          "company-org": ["developers", "qa-team"],
          "partner-org": ["external-devs"]
        }
      }
    }
  }
}
```

## Deployment Configurations

### Development Environment

```yaml
# docker-compose.dev.yml
version: "3.8"
services:
  brooklyn-mcp:
    build: .
    ports:
      - "3000:3000"
    environment:
      - BROOKLYN_ENV=development
      - BROOKLYN_AUTH_MODE=none
      - BROOKLYN_AUTH_DEVELOPMENT_ONLY=true
      - BROOKLYN_HTTP_ENABLED=true
      - BROOKLYN_HTTP_PORT=3000
      - BROOKLYN_HTTP_HOST=0.0.0.0
    command: ["brooklyn", "mcp", "start", "--development-only"]
```

### Staging Environment

```yaml
# docker-compose.staging.yml
version: "3.8"
services:
  brooklyn-mcp:
    build: .
    ports:
      - "3000:3000"
    environment:
      - BROOKLYN_ENV=production
      - BROOKLYN_AUTH_MODE=github
      - BROOKLYN_AUTH_BEHIND_PROXY=true
      - BROOKLYN_GITHUB_CLIENT_ID=${GITHUB_CLIENT_ID}
      - BROOKLYN_GITHUB_CLIENT_SECRET=${GITHUB_CLIENT_SECRET}
      - BROOKLYN_GITHUB_CALLBACK_URL=https://brooklyn-staging.company.com/oauth/callback
      - BROOKLYN_GITHUB_ALLOWED_ORGS=fulmenhq
      - BROOKLYN_HTTP_ENABLED=true
      - BROOKLYN_HTTP_PORT=3000
      - BROOKLYN_HTTP_HOST=127.0.0.1
```

### Production Environment

```yaml
# docker-compose.prod.yml
version: "3.8"
services:
  brooklyn-mcp:
    image: brooklyn-mcp:1.6.0
    restart: unless-stopped
    environment:
      - BROOKLYN_ENV=production
      - BROOKLYN_TEAM_ID=production
      - BROOKLYN_AUTH_MODE=github
      - BROOKLYN_AUTH_BEHIND_PROXY=true
      - BROOKLYN_GITHUB_CLIENT_ID=${GITHUB_CLIENT_ID}
      - BROOKLYN_GITHUB_CLIENT_SECRET=${GITHUB_CLIENT_SECRET}
      - BROOKLYN_GITHUB_CALLBACK_URL=https://brooklyn.company.com/oauth/callback
      - BROOKLYN_GITHUB_ALLOWED_TEAMS=fulmenhq:brooklyn-team,admins;company-org:developers
      - BROOKLYN_HTTP_ENABLED=true
      - BROOKLYN_HTTP_PORT=3000
      - BROOKLYN_HTTP_HOST=127.0.0.1
      - BROOKLYN_RATE_LIMIT_REQUESTS=100
      - BROOKLYN_RATE_LIMIT_WINDOW=60000
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

## Network Configuration

### Port Planning

- **Default HTTP Port**: 3000
- **MCP Transport**: Uses stdio (no network port)
- **Reverse Proxy**: 80/443 (public)

### Security Considerations

```bash
# Bind to localhost for reverse proxy setups
export BROOKLYN_HTTP_HOST=127.0.0.1  # Production
export BROOKLYN_HTTP_HOST=0.0.0.0    # Development only

# Enable rate limiting
export BROOKLYN_HTTP_RATE_LIMITING=true
export BROOKLYN_RATE_LIMIT_REQUESTS=100
export BROOKLYN_RATE_LIMIT_WINDOW=60000  # 1 minute
```

## User Access Management

### GitHub-Based Access Control

#### Adding Users

1. **Invite to Organization**: Add users to GitHub organization
2. **Assign to Teams**: Add users to appropriate teams
3. **Verify Access**: Users can authenticate via OAuth flow

#### Removing Users

1. **Remove from Teams**: Remove from specific teams
2. **Remove from Organization**: Complete access removal
3. **Session Cleanup**: Existing sessions expire automatically

#### Team Structure Planning

```
Organization: fulmenhq
├── brooklyn-team (Full access)
├── admins (Administrative access)
├── developers (Development access)
└── qa-team (Testing access)

Organization: company-org
├── developers (Development access)
├── devops (Infrastructure access)
└── security (Audit access)
```

### Permission Mapping

```typescript
// Future enhancement - role-based permissions
interface TeamPermissions {
  "fulmenhq:brooklyn-team": ["admin", "mcp:*", "browser:*"];
  "fulmenhq:developers": ["mcp:navigate", "mcp:screenshot", "browser:read"];
  "company-org:devops": ["admin", "mcp:*"];
  "company-org:developers": ["mcp:navigate", "mcp:screenshot"];
}
```

## Configuration Management

### Environment Variables Reference

```bash
# Core service configuration
export BROOKLYN_SERVICE_NAME=brooklyn-mcp-server
export BROOKLYN_ENV=production
export BROOKLYN_TEAM_ID=your-team

# HTTP transport configuration
export BROOKLYN_HTTP_ENABLED=true
export BROOKLYN_HTTP_PORT=3000
export BROOKLYN_HTTP_HOST=127.0.0.1
export BROOKLYN_HTTP_CORS=true
export BROOKLYN_HTTP_RATE_LIMITING=true

# Authentication configuration
export BROOKLYN_AUTH_MODE=github
export BROOKLYN_AUTH_BEHIND_PROXY=true

# GitHub OAuth configuration
export BROOKLYN_GITHUB_CLIENT_ID=your_client_id
export BROOKLYN_GITHUB_CLIENT_SECRET=your_client_secret
export BROOKLYN_GITHUB_CALLBACK_URL=https://brooklyn.company.com/oauth/callback
export BROOKLYN_GITHUB_ALLOWED_ORGS=org1,org2
export BROOKLYN_GITHUB_ALLOWED_TEAMS="org1:team1,team2;org2:team3"
export BROOKLYN_GITHUB_SCOPES=user:email,read:org

# Security configuration
export BROOKLYN_ALLOWED_DOMAINS=*.company.com,trusted-partner.com
export BROOKLYN_RATE_LIMIT_REQUESTS=100
export BROOKLYN_RATE_LIMIT_WINDOW=60000

# Logging configuration
export BROOKLYN_LOG_LEVEL=info
export BROOKLYN_LOG_FORMAT=json
```

### Configuration Files

```json
// .brooklyn/config.json
{
  "serviceName": "brooklyn-mcp-server",
  "version": "1.6.0",
  "environment": "production",
  "teamId": "production",
  "transports": {
    "mcp": { "enabled": true },
    "http": {
      "enabled": true,
      "port": 3000,
      "host": "127.0.0.1",
      "cors": true,
      "rateLimiting": true
    }
  },
  "authentication": {
    "mode": "github",
    "behindProxy": true,
    "providers": {
      "github": {
        "clientId": "${BROOKLYN_GITHUB_CLIENT_ID}",
        "clientSecret": "${BROOKLYN_GITHUB_CLIENT_SECRET}",
        "callbackUrl": "https://brooklyn.company.com/oauth/callback",
        "allowedOrgs": ["fulmenhq"],
        "allowedTeams": {
          "fulmenhq": ["brooklyn-team", "admins"]
        }
      }
    }
  }
}
```

## Deployment Scenarios

### Scenario 1: Small Team (GitHub Org Access)

```bash
# Simple organization-based access
export BROOKLYN_AUTH_MODE=github
export BROOKLYN_GITHUB_ALLOWED_ORGS=small-company
# All organization members can access
```

### Scenario 2: Large Enterprise (Team-Based Access)

```bash
# Granular team-based access
export BROOKLYN_AUTH_MODE=github
export BROOKLYN_GITHUB_ALLOWED_TEAMS="enterprise:platform-team,devops;enterprise:frontend-team"
# Only specific teams can access
```

### Scenario 3: Multi-Organization (Partners)

```bash
# Multiple organizations with different access levels
export BROOKLYN_GITHUB_ALLOWED_TEAMS="company:all-devs;partner-a:contractors;partner-b:consultants"
# Partners get limited access through specific teams
```

### Scenario 4: Self-Hosted (Local Auth)

```bash
# For environments without GitHub access
export BROOKLYN_AUTH_MODE=local
export BROOKLYN_LOCAL_USER_STORE=/opt/brooklyn/users.json
# Manual user management through file system
```

## Monitoring & Health Checks

### Health Endpoint

```bash
# Check service health
curl http://localhost:3000/health

# Response format
{
  "status": "healthy",
  "version": "1.6.0",
  "transports": {
    "http": "enabled",
    "mcp": "enabled"
  },
  "authentication": {
    "mode": "github",
    "provider": "healthy"
  }
}
```

### Authentication Validation

```bash
# Test authentication configuration
brooklyn auth validate-config

# Test GitHub OAuth flow
brooklyn auth test-github-oauth

# Check current sessions
brooklyn auth list-sessions
```

## Troubleshooting

### Common Configuration Issues

#### 1. OAuth Callback Mismatch

```bash
# Error: redirect_uri_mismatch
# Check callback URL configuration
echo "GitHub App Callback: https://github.com/settings/applications/[app-id]"
echo "Brooklyn Config: $BROOKLYN_GITHUB_CALLBACK_URL"
```

#### 2. Organization Access Denied

```bash
# Error: User not in allowed organization
# Verify organization membership
gh api user/orgs | jq '.[].login'
echo "Allowed orgs: $BROOKLYN_GITHUB_ALLOWED_ORGS"
```

#### 3. Team Access Denied

```bash
# Error: User not in allowed team
# Check team membership
gh api orgs/{org}/teams/{team}/members/username
echo "Allowed teams: $BROOKLYN_GITHUB_ALLOWED_TEAMS"
```

#### 4. HTTPS Issues

```bash
# Error: OAuth requires HTTPS
# Verify proxy configuration
curl -H "X-Forwarded-Proto: https" http://localhost:3000/oauth/authorize
export BROOKLYN_AUTH_BEHIND_PROXY=true
```

### Debug Commands

```bash
# Enable debug logging
export BROOKLYN_LOG_LEVEL=debug

# Check configuration loading
brooklyn config validate --debug

# Test authentication providers
brooklyn auth debug --provider github

# Monitor authentication events
tail -f ~/.brooklyn/logs/auth.log
```

## Deployment Checklist

### Pre-Deployment

- [ ] **GitHub OAuth App**: Created and configured
- [ ] **Environment Variables**: All required variables set
- [ ] **Network Configuration**: Ports and host binding configured
- [ ] **TLS Setup**: Reverse proxy with valid certificates
- [ ] **User Access**: Organization/team structure planned

### Deployment

- [ ] **Build & Deploy**: Application deployed with correct version
- [ ] **Health Check**: HTTP health endpoint responding
- [ ] **Authentication**: OAuth flow working end-to-end
- [ ] **User Access**: Test users can authenticate and access
- [ ] **Rate Limiting**: Traffic limits properly configured

### Post-Deployment

- [ ] **Monitoring**: Health checks and logging configured
- [ ] **Backup**: Configuration and user data backed up
- [ ] **Documentation**: Team onboarding documentation updated
- [ ] **Security Review**: Access controls and permissions verified

## Next Steps

1. **Review TLS Configuration**: See [TLS Configuration Guide](./tls-configuration.md)
2. **Plan User Onboarding**: Design team access structure
3. **Set Up Monitoring**: Configure health checks and alerting
4. **Test Authentication**: Validate OAuth flow with test users
5. **Deploy to Staging**: Test complete flow before production

This deployment guide provides the foundation for planning and implementing Brooklyn MCP's HTTP transport with enterprise authentication.
