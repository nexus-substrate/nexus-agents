---
title: 'Installation Guide'
description: Detailed installation instructions for nexus-agents across all platforms, Docker, and CI/CD environments
tier: 2
keywords: [installation, setup, docker, npm, pnpm, getting-started]
---

# Installation

Detailed installation instructions for nexus-agents across all platforms, Docker, and CI/CD environments.

## System Requirements

### Required

| Component | Version  | Notes                              |
| --------- | -------- | ---------------------------------- |
| Node.js   | 22.x LTS | Earlier versions are not supported |
| npm       | 10.x     | Or pnpm 9.x (recommended)          |

### Optional

| Component  | Purpose                      |
| ---------- | ---------------------------- |
| Docker     | Sandboxed code execution     |
| Claude CLI | Enhanced Claude model access |
| Gemini CLI | Enhanced Gemini model access |
| Codex CLI  | Enhanced OpenAI model access |

### API Keys

You need at least one model provider API key:

| Provider  | Variable            | Get Key                                                |
| --------- | ------------------- | ------------------------------------------------------ |
| Anthropic | `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) |
| OpenAI    | `OPENAI_API_KEY`    | [platform.openai.com](https://platform.openai.com)     |
| Google AI | `GOOGLE_AI_API_KEY` | [aistudio.google.com](https://aistudio.google.com)     |

For local models via Ollama, no API key is required.

## Installation Methods

### npm (Recommended)

Install globally for CLI access:

```bash
npm install -g nexus-agents
```

After install, you'll see a hint to run setup. Configure everything:

```bash
nexus-agents setup    # Configures MCP, hooks, data dirs, OpenCode, config
```

Verify installation:

```bash
nexus-agents doctor        # Checks CLIs, API keys, sqlite, data dirs
nexus-agents doctor --fix  # Auto-fix missing data dirs and config
```

### pnpm

If you prefer pnpm:

```bash
pnpm add -g nexus-agents
```

### npx (No Install)

Run without installing:

```bash
npx nexus-agents doctor
npx nexus-agents --help
```

### From Source

For development or customization:

```bash
# Clone the repository
git clone https://github.com/williamzujkowski/nexus-agents.git
cd nexus-agents

# Install dependencies
pnpm install

# Build
pnpm build

# Link globally
pnpm link --global
```

### Docker

Run in a container:

```bash
# Pull the image
docker pull ghcr.io/williamzujkowski/nexus-agents:latest

# Run with API key
docker run -e ANTHROPIC_API_KEY="sk-ant-..." \
  ghcr.io/williamzujkowski/nexus-agents:latest
```

Or build locally:

```bash
docker build -t nexus-agents .
docker run -e ANTHROPIC_API_KEY="sk-ant-..." nexus-agents
```

## Platform-Specific Instructions

### macOS

```bash
# Install Node.js 22 via Homebrew
brew install node@22

# Add to PATH
echo 'export PATH="/opt/homebrew/opt/node@22/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc

# Install nexus-agents
npm install -g nexus-agents

# Verify
nexus-agents doctor
```

### Linux (Ubuntu/Debian)

```bash
# Install Node.js 22 via NodeSource
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install nexus-agents
npm install -g nexus-agents

# Verify
nexus-agents doctor
```

### Linux (Fedora/RHEL)

```bash
# Install Node.js 22
sudo dnf module enable nodejs:22
sudo dnf install nodejs

# Install nexus-agents
npm install -g nexus-agents

# Verify
nexus-agents doctor
```

### Windows

```powershell
# Install Node.js 22 via winget
winget install OpenJS.NodeJS.LTS

# Or via Chocolatey
choco install nodejs-lts

# Install nexus-agents
npm install -g nexus-agents

# Verify
nexus-agents doctor
```

### Windows (WSL)

Follow the Linux instructions inside WSL. This is the recommended approach for Windows users.

## Installing Optional CLIs

The external CLI adapters provide enhanced capabilities:

### Claude CLI

```bash
npm install -g @anthropic-ai/claude-code
claude auth login
```

### Gemini CLI

```bash
npm install -g @google/gemini-cli
gemini auth login
```

### Codex CLI

```bash
npm install -g @openai/codex
codex auth login
```

## MCP Client Configuration

### Claude Desktop

Add to your MCP configuration file:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`

**Linux:** `~/.config/claude/claude_desktop_config.json`

**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "nexus-agents": {
      "command": "nexus-agents",
      "args": ["--mode=server"],
      "env": {
        "ANTHROPIC_API_KEY": "sk-ant-your-key-here"
      }
    }
  }
}
```

Restart Claude Desktop to load the configuration.

### Claude CLI

Add to `.mcp.json` in your project root (or run `nexus-agents setup` for automatic configuration):

```json
{
  "mcpServers": {
    "nexus-agents": {
      "command": "nexus-agents",
      "args": ["--mode=server"]
    }
  }
}
```

## Data Storage

nexus-agents stores runtime data in `~/.nexus-agents/`:

| Directory         | Purpose                                                       |
| ----------------- | ------------------------------------------------------------- |
| `memory/`         | SQLite databases for agentic, adaptive, typed memory backends |
| `memory/beliefs/` | Belief memory JSON snapshots                                  |
| `learning/`       | Cross-session task outcomes and distilled rules               |
| `sessions/`       | Session journals (JSONL) and sessions.db                      |
| `audit/`          | JSONL audit logs                                              |
| `voting/`         | Consensus vote correlation data                               |
| `auth/`           | REST API auth tokens (owner-only permissions)                 |

Run `nexus-agents setup` to pre-create this structure, or it will be created lazily on first use.

### Optional: better-sqlite3

Five memory backends (agentic, adaptive, typed, mobimem, decay) require `better-sqlite3`. It is an optional dependency that degrades gracefully if missing — basic session and belief memory still work without it.

```bash
# Install if you want full memory support
npm install -g better-sqlite3
```

Run `nexus-agents doctor` to check if it's available under "Checking data storage".

## CI/CD Integration

### GitHub Actions

```yaml
name: CI with nexus-agents

on: [push, pull_request]

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Install nexus-agents
        run: npm install -g nexus-agents

      - name: Run code review
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: |
          nexus-agents orchestrate "Review the changes in this PR" \
            --format json > review.json
```

### GitLab CI

```yaml
code-review:
  image: node:22
  script:
    - npm install -g nexus-agents
    - nexus-agents orchestrate "Review this merge request"
  variables:
    ANTHROPIC_API_KEY: $ANTHROPIC_API_KEY
```

### Jenkins

```groovy
pipeline {
    agent {
        docker { image 'node:22' }
    }
    environment {
        ANTHROPIC_API_KEY = credentials('anthropic-api-key')
    }
    stages {
        stage('Review') {
            steps {
                sh 'npm install -g nexus-agents'
                sh 'nexus-agents orchestrate "Review this build"'
            }
        }
    }
}
```

## Docker Compose

For development environments:

```yaml
version: '3.8'

services:
  nexus-agents:
    image: ghcr.io/williamzujkowski/nexus-agents:latest
    environment:
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - NEXUS_LOG_LEVEL=debug
    volumes:
      - ./nexus-agents.yaml:/app/nexus-agents.yaml:ro
      - ./workflows:/app/workflows:ro
    ports:
      - '3000:3000' # REST API
```

## Verifying Installation

After installation, run the doctor command:

```bash
nexus-agents doctor
```

Expected output for a complete setup:

```
Nexus Agents Doctor
===================

Checking CLI installations...

✓ Claude CLI
  Version: 2.0.76 (supported)
  Auth: OAuth
  Capacity: 85% remaining

✓ Gemini CLI
  Version: 0.22.5 (supported)
  Auth: ADC configured

✓ Codex CLI
  Version: 0.77.0 (supported)
  Auth: OAuth

Checking MCP configuration...

✓ MCP Server mode: Ready
✓ MCP Client mode: Ready (Codex mcp-server)

Summary: All systems operational
```

## Updating

### npm

```bash
npm update -g nexus-agents
```

### pnpm

```bash
pnpm update -g nexus-agents
```

### From Source

```bash
cd nexus-agents
git pull
pnpm install
pnpm build
```

## Uninstalling

### npm

```bash
npm uninstall -g nexus-agents
```

### pnpm

```bash
pnpm remove -g nexus-agents
```

### Clean Configuration

Remove configuration files:

```bash
# Remove config
rm -rf ~/.config/nexus-agents

# Remove MCP entry from Claude Desktop config
# Edit ~/Library/Application Support/Claude/claude_desktop_config.json
```

## Troubleshooting

### "Cannot find module" errors

Clear the npm cache and reinstall:

```bash
npm cache clean --force
npm install -g nexus-agents
```

### Permission errors on Linux/macOS

Fix npm permissions:

```bash
# Option 1: Use a node version manager (recommended)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 22
nvm use 22

# Option 2: Change npm prefix
npm config set prefix ~/.npm-global
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
```

### PATH not configured

Find and add the npm bin directory:

```bash
# Find the directory
npm config get prefix

# Add to PATH (bash)
echo 'export PATH="$(npm config get prefix)/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc

# Add to PATH (zsh)
echo 'export PATH="$(npm config get prefix)/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

### Docker permission denied

Add your user to the docker group:

```bash
sudo usermod -aG docker $USER
# Log out and back in
```

## Related Documentation

- [Configuration](./CONFIGURATION.md) - Set up models, experts, and routing
- [Quick Start](../../QUICK_START.md) - Try your first orchestration
- [CLI Usage](../ENTRYPOINTS.md) - Learn all CLI commands
