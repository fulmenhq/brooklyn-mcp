# TLS Configuration for Brooklyn MCP - Production Deployment

## Overview

Brooklyn MCP v1.6.0 includes enterprise authentication requiring HTTPS in production environments. This guide covers TLS configuration patterns for reverse proxy deployment.

## ⚠️ Security Requirements

### Authentication & TLS

- **GitHub OAuth**: Requires HTTPS callback URLs
- **Local Authentication**: Sessions require secure transport
- **Production Mode**: Automatically validates HTTPS when `behindProxy: true`

## Configuration Options

### Brooklyn MCP Configuration

```json
{
  "authentication": {
    "mode": "github",
    "behindProxy": true,
    "providers": {
      "github": {
        "callbackUrl": "https://brooklyn.company.com/oauth/callback"
      }
    }
  },
  "transports": {
    "http": {
      "enabled": true,
      "port": 3000,
      "host": "127.0.0.1"
    }
  }
}
```

## Reverse Proxy Configurations

### 1. Caddy (Recommended - Auto HTTPS)

```caddyfile
# Caddyfile
brooklyn.company.com {
  reverse_proxy 127.0.0.1:3000

  # Security headers
  header {
    Strict-Transport-Security "max-age=31536000; includeSubDomains"
    X-Content-Type-Options "nosniff"
    X-Frame-Options "DENY"
    X-XSS-Protection "1; mode=block"
  }

  # Rate limiting
  rate_limit {
    zone brooklyn {
      key {remote_host}
      events 100
      window 1m
    }
  }
}
```

### 2. nginx with Let's Encrypt

```nginx
# /etc/nginx/sites-available/brooklyn-mcp
server {
    listen 443 ssl http2;
    server_name brooklyn.company.com;

    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/brooklyn.company.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/brooklyn.company.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-SHA384;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Proxy configuration
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # Rate limiting
        limit_req zone=brooklyn burst=20 nodelay;
    }
}

# HTTP redirect
server {
    listen 80;
    server_name brooklyn.company.com;
    return 301 https://$server_name$request_uri;
}

# Rate limiting zone
http {
    limit_req_zone $binary_remote_addr zone=brooklyn:10m rate=10r/s;
}
```

### 3. Traefik (Container Environments)

```yaml
# docker-compose.yml
version: "3.8"
services:
  traefik:
    image: traefik:v3.0
    command:
      - "--api.dashboard=true"
      - "--providers.docker=true"
      - "--entrypoints.web.address=:80"
      - "--entrypoints.websecure.address=:443"
      - "--certificatesresolvers.letsencrypt.acme.tlschallenge=true"
      - "--certificatesresolvers.letsencrypt.acme.email=admin@company.com"
      - "--certificatesresolvers.letsencrypt.acme.storage=/letsencrypt/acme.json"
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./letsencrypt:/letsencrypt

  brooklyn-mcp:
    build: .
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.brooklyn.rule=Host(`brooklyn.company.com`)"
      - "traefik.http.routers.brooklyn.entrypoints=websecure"
      - "traefik.http.routers.brooklyn.tls.certresolver=letsencrypt"
      - "traefik.http.services.brooklyn.loadbalancer.server.port=3000"
      # Security middleware
      - "traefik.http.middlewares.brooklyn-headers.headers.stsSeconds=31536000"
      - "traefik.http.middlewares.brooklyn-headers.headers.stsIncludeSubdomains=true"
      - "traefik.http.middlewares.brooklyn-headers.headers.contentTypeNosniff=true"
      - "traefik.http.middlewares.brooklyn-headers.headers.frameDeny=true"
      - "traefik.http.routers.brooklyn.middlewares=brooklyn-headers"
    environment:
      - BROOKLYN_AUTH_BEHIND_PROXY=true
      - BROOKLYN_AUTH_MODE=github
```

## Environment-Specific Configurations

### Development Environment

```bash
# Allow HTTP for local development
export BROOKLYN_AUTH_MODE=none
export BROOKLYN_AUTH_DEVELOPMENT_ONLY=true
brooklyn mcp start --development-only
```

### Staging Environment

```bash
# Use GitHub OAuth with staging callback
export BROOKLYN_AUTH_MODE=github
export BROOKLYN_AUTH_BEHIND_PROXY=true
export BROOKLYN_GITHUB_CALLBACK_URL=https://brooklyn-staging.company.com/oauth/callback
brooklyn mcp start
```

### Production Environment

```bash
# Full GitHub OAuth with team validation
export BROOKLYN_AUTH_MODE=github
export BROOKLYN_AUTH_BEHIND_PROXY=true
export BROOKLYN_GITHUB_CLIENT_ID=your_github_app_id
export BROOKLYN_GITHUB_CLIENT_SECRET=your_github_app_secret
export BROOKLYN_GITHUB_CALLBACK_URL=https://brooklyn.company.com/oauth/callback
export BROOKLYN_GITHUB_ALLOWED_ORGS=fulmenhq,company-org
export BROOKLYN_GITHUB_ALLOWED_TEAMS=fulmenhq:brooklyn-team,admins;company-org:developers
brooklyn mcp start
```

## TLS Validation Features

### Automatic HTTPS Detection

Brooklyn MCP automatically validates HTTPS when `behindProxy: true`:

```typescript
// Automatic validation in production
if (config.authentication.behindProxy) {
  if (req.headers["x-forwarded-proto"] !== "https") {
    throw new Error("HTTPS required for authentication in production");
  }
}
```

### GitHub OAuth Callback Validation

```typescript
// Callback URL must use HTTPS in production
if (environment === "production" && !callbackUrl.startsWith("https://")) {
  throw new Error("GitHub OAuth callback URL must use HTTPS in production");
}
```

## Local Authentication Setup

### Setting Up Local Users

For deployments using local authentication instead of GitHub OAuth:

```bash
# 1. Configure Brooklyn for local authentication
# Set environment variables or config file:
export BROOKLYN_AUTH_MODE=local
export BROOKLYN_AUTH_LOCAL_USER_STORE=/etc/brooklyn/users.json

# 2. Create admin user
brooklyn auth add-user --username admin --team admin-team --permissions admin

# 3. Create regular users
brooklyn auth add-user --username developer --team dev-team --permissions "mcp:navigate,mcp:screenshot,mcp:interact"

# 4. List users to verify
brooklyn auth list-users
```

### Local Authentication Configuration

```json
{
  "authentication": {
    "mode": "local",
    "behindProxy": true,
    "providers": {
      "local": {
        "userStore": "/etc/brooklyn/users.json",
        "sessionTimeout": 86400000,
        "requirePasswordChange": false
      }
    }
  }
}
```

### User Management in Production

```bash
# Reset user password
brooklyn auth set-password --username admin

# Remove inactive users
brooklyn auth remove-user --username olduser --force

# List all users and their permissions
brooklyn auth list-users --json
```

## Security Best Practices

### 1. Certificate Management

- Use Let's Encrypt for automatic certificate renewal
- Monitor certificate expiration
- Implement OCSP stapling for performance

### 2. TLS Configuration

- **Minimum TLS 1.2**, prefer TLS 1.3
- **Strong cipher suites** only
- **HSTS headers** with long max-age
- **Certificate pinning** for high-security environments

### 3. Network Security

- **Rate limiting** at proxy level
- **IP allowlisting** for admin access
- **DDoS protection** via cloud providers
- **WAF rules** for common attack patterns

### 4. Monitoring & Alerting

```bash
# Certificate expiration monitoring
curl -s https://brooklyn.company.com | openssl x509 -noout -dates

# TLS configuration testing
sslyze --regular brooklyn.company.com
testssl.sh brooklyn.company.com
```

## Troubleshooting

### Common Issues

#### 1. OAuth Callback Errors

```bash
# Check callback URL configuration
echo "Configured: $BROOKLYN_GITHUB_CALLBACK_URL"
echo "Expected: https://brooklyn.company.com/oauth/callback"
```

#### 2. Mixed Content Warnings

```bash
# Verify X-Forwarded-Proto header
curl -H "X-Forwarded-Proto: https" https://brooklyn.company.com/api/health
```

#### 3. Certificate Chain Issues

```bash
# Test certificate chain
openssl s_client -connect brooklyn.company.com:443 -servername brooklyn.company.com
```

### Debug Commands

```bash
# Check TLS configuration
brooklyn mcp start --config-debug

# Validate authentication setup
brooklyn auth validate-config

# Test OAuth flow
brooklyn auth test-github-oauth
```

## Deployment Checklist

- [ ] **Certificate**: Valid TLS certificate installed
- [ ] **HTTPS Redirect**: HTTP traffic redirected to HTTPS
- [ ] **Security Headers**: HSTS, CSP, and security headers configured
- [ ] **Rate Limiting**: Proxy-level rate limiting enabled
- [ ] **Monitoring**: Certificate expiration monitoring setup
- [ ] **GitHub OAuth**: App configured with HTTPS callback URL
- [ ] **Environment Variables**: All authentication variables configured
- [ ] **Health Check**: HTTPS health endpoint responding
- [ ] **Load Testing**: Authentication flow tested under load
- [ ] **Backup**: Configuration and certificates backed up

## Reference Documentation

- [GitHub OAuth App Setup](https://docs.github.com/en/developers/apps/building-oauth-apps/creating-an-oauth-app)
- [Let's Encrypt Documentation](https://letsencrypt.org/docs/)
- [Caddy Documentation](https://caddyserver.com/docs/)
- [nginx SSL/TLS Configuration](https://nginx.org/en/docs/http/configuring_https_servers.html)
- [Traefik TLS Documentation](https://doc.traefik.io/traefik/https/tls/)
