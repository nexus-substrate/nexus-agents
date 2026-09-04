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

| Component    | Purpose                        |
| ------------ | ------------------------------ |
| Docker       | Sandboxed code execution       |
| Claude CLI   | Enhanced Claude model access   |
| Gemini CLI   | Enhanced Gemini model access   |
| Codex CLI    | Enhanced OpenAI model access   |
| OpenCode CLI | Enhanced OpenCode model access |

### API Keys

You need at least one model provider API key:

| Provider  | Variable            | Get Key                                                |
| --------- | ------------------- | ------------------------------------------------------ |
| Anthropic | `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) |
| OpenAI    | `OPENAI_API_KEY`    | [platform.openai.com](https://platform.openai.com)     |
| Google AI | `GOOGLE_AI_API_KEY` | [aistudio.google.com](https://aistudio.google.com)     |

For local models via Ollama, no API key is required. Ollama support requires configuration of the `OLLAMA_HOST` environment variable.

## Installation Methods

### npm (Recommended)

Install globally for CLI access:

```bash
npm install -g nexus-agents
```

> **Linux / macOS without nvm or asdf?** A bare `npm install -g` will fail with
> `EACCES: permission denied, mkdir '/usr/local/lib/node_modules/...'` because
> the system npm prefix is not user-writable. **Do not run `sudo npm install -g`**
> — npm itself recommends against it. Instead, configure a user-local prefix
> once:
>
> ```bash
> mkdir -p ~/.npm-global
> npm config set prefix '~/.npm-global'
> echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc   # or ~/.zshrc
> source ~/.bashrc
> npm install -g nexus-agents
> ```
>
> If you can't or don't want to change the prefix, use `npx nexus-agents`
> (see below) — every invocation works without a global install.

After install, you'll see a hint to run setup. Configure everything:

```bash
nexus-agents setup    # Configures MCP, hooks, data dirs, OpenCode, config
```

Verify installation:

```bash
nexus-agents doctor        # Checks CLIs, API keys, sqlite, data dirs
nexus-agents doctor --fix  # Auto-fix missing data dirs and config
nexus-agents auth status   # Show per-CLI auth state + login fix instructions
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
git clone https://github.com/nexus-substrate/nexus-agents.git
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
docker pull ghcr.io/nexus-substrate/nexus-agents:latest

# Run with API key
docker run -e ANTHROPIC_API_KEY="sk-ant-..." \
  ghcr.io/nexus-substrate/nexus-agents:latest
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

### OpenCode CLI

```bash
npm install -g opencode-ai
```

OpenCode supports custom OpenAI-compatible endpoints, enabling routing to any hosted model that exposes an OpenAI-compatible API.

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

As of epic #2872, nexus-agents splits runtime data into two roots when run inside a git repo:

- **Per-repo** state (tied to one codebase's work) → `<repo>/.nexus-agents/` (auto-gitignored)
- **Cross-repo** state (shared across all your projects) → `~/.nexus-agents/`

| Directory          | Scope      | Resolves to             | Purpose                                                       |
| ------------------ | ---------- | ----------------------- | ------------------------------------------------------------- |
| `memory/`          | cross-repo | `~/.nexus-agents/`      | SQLite databases for agentic, adaptive, typed memory backends |
| `memory/beliefs/`  | cross-repo | `~/.nexus-agents/`      | Belief memory JSON snapshots                                  |
| `learning/`        | cross-repo | `~/.nexus-agents/`      | Cross-session task outcomes and distilled rules               |
| `voting/`          | cross-repo | `~/.nexus-agents/`      | Consensus vote correlation data                               |
| `research/`        | cross-repo | `~/.nexus-agents/`      | Research catalog                                              |
| `auth/`            | cross-repo | `~/.nexus-agents/`      | REST API auth tokens (owner-only permissions)                 |
| `sessions/`        | per-repo   | `<repo>/.nexus-agents/` | Session journals (JSONL)                                      |
| `checkpoints/`     | per-repo   | `<repo>/.nexus-agents/` | Wave + pipeline checkpoints                                   |
| `traces/`, `runs/` | per-repo   | `<repo>/.nexus-agents/` | Pipeline execution traces                                     |
| `audit/`           | per-repo   | `<repo>/.nexus-agents/` | JSONL audit logs                                              |

Run `nexus-agents setup` to pre-create this structure, or it will be created lazily on first use. `nexus-agents doctor` reports the resolved location of every subdir. Override the whole split with `NEXUS_DATA_DIR=<path>`, or opt out entirely with `NEXUS_REPO_PREFERRED=0` (all state in `~/.nexus-agents/`). In a sandbox without a writable `~`, cross-repo state transparently falls back to `<repo>/.nexus-agents/`.

### Native code and install scripts

**Nothing in nexus-agents needs to compile at install time, and the CLI works with install scripts blocked.** Both halves are gated, not asserted — see below.

Persistent memory (agentic, adaptive, typed, mobimem, decay) runs on **`node:sqlite`**, a Node builtin, since [#5388](https://github.com/nexus-substrate/nexus-agents/issues/5388) — which is why `engines` requires Node ≥ 22.5.0. It replaced `better-sqlite3`, whose install script built a native binding: where install scripts were blocked, `npm install` still exited `0` and the CLI then died with `Could not locate the bindings file`. A builtin has no install script to skip.

The polyglot (Python/Go) security scanner does load native tree-sitter grammars, from `@ast-grep/lang-python` and `@ast-grep/lang-go`. Those ship **prebuilt** `.so` files inside their own npm tarballs for Linux, macOS (x64 + arm64) and Windows x64, so they neither download nor compile anything on a supported platform.

Four production packages still declare an install script — `@ast-grep/lang-go`, `@ast-grep/lang-python`, `@google/genai` and `protobufjs` — and every one is inert for this package's purposes. That claim is enforced rather than trusted ([#5427](https://github.com/nexus-substrate/nexus-agents/issues/5427)):

- `scripts/check-install-scripts.ts` installs the packed tarball with npm and fails if any install script appears that is not in `scripts/install-script-allowlist.json`, if an allowlisted one changes what it runs, or if an allowlisted entry no longer exists.
- `scripts/verify-npm-install.sh` installs with `--ignore-scripts` in a container with **no compiler present**, then proves the SQLite path and the polyglot scanner both still work — the scanner has to return two named findings from a fixture, so "found nothing" cannot pass for "clean".

If you install with `--ignore-scripts` (or with pnpm 10, or with npm 12 — see below — both of which block dependency install scripts by default), that is a supported configuration and needs no follow-up step.

Run `nexus-agents verify` to see both checks — `SQLite Storage` and `Native Grammars` — reported by name.

#### `npm warn install-scripts` on npm 12 — expected, no action needed

npm 12 blocks dependency install scripts by default and reports each one it blocked:

```
npm warn install-scripts 4 packages had install scripts blocked because they are not covered by allowScripts:
npm warn install-scripts   @ast-grep/lang-go@0.0.6 (postinstall: node postinstall.js)
npm warn install-scripts   @ast-grep/lang-python@0.0.6 (postinstall: node postinstall.js)
npm warn install-scripts   @google/genai@2.21.0 (preinstall: echo 'preinstall: no-op')
npm warn install-scripts   protobufjs@7.6.6 (postinstall: node scripts/postinstall)
```

**This is a warning, not a failure — the install exits `0` and everything works.** Blocked is the state this package is gated against, so npm 12's default is the path CI proves on every run. Verified against `nexus-agents@8.6.0` with npm 12.0.2:

```
✓ SQLite Storage: node:sqlite available (memory backends available)
✓ Native Grammars: ast-grep python/go grammars parse (polyglot scanner available)
Installation verified successfully!
```

**You do not need to approve them.** None of the four scripts do anything nexus-agents requires: two verify a prebuilt grammar that already ships inside its own tarball, one is literally `echo`, and the fourth arrives transitively. Approving them is harmless but buys nothing.

npm suggests different remediation depending on how you installed, so the command it prints at you varies:

| install                                     | what npm suggests                                                                                                                         |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| into a project (`npm install nexus-agents`) | `npm install-scripts approve <pkg>`, which writes `allowScripts` into _your_ project's `package.json`                                     |
| globally (`npm install -g nexus-agents`)    | `npm install -g --allow-scripts=<pkgs>` for one install, or `npm config set allow-scripts=<pkgs> --location=user` for all global installs |

Both are consumer-side by design, which is why nexus-agents cannot pre-approve them on your behalf.

The only way to remove the warning from nexus-agents' side is to stop depending on packages that declare install scripts at all, which is tracked in [#5435](https://github.com/nexus-substrate/nexus-agents/issues/5435) because it would trade away the Gemini adapter and the polyglot scanner from a default install.

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
    image: ghcr.io/nexus-substrate/nexus-agents:latest
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

Illustrative example output for a complete setup (your versions and details will differ):

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

### `npm warn deprecated` on install (benign — no action needed)

Installing `nexus-agents` prints one deprecation warning. It is **benign,
expected, and safe to ignore** — it comes from a transitive dependency of an
upstream package, not from anything in the nexus-agents runtime.

(The `prebuild-install@…: No longer maintained` warning listed here previously
came from `better-sqlite3` and no longer appears at all: #5388 removed that
dependency.)

| Warning                                                                | Where it comes from                                               | Why it's harmless                                                                                                                                                                      |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node-domexception@…: Use your platform's native DOMException instead` | `@google/genai` → `google-auth-library` → `gaxios` → `node-fetch` | A `DOMException` polyfill that is a no-op on Node ≥ 22 (which ships a native `DOMException`). Inert at runtime. ([#4044](https://github.com/nexus-substrate/nexus-agents/issues/4044)) |

Neither can currently be removed by upgrading: both persist in the **latest**
versions of those upstream packages, and a library's `overrides` do not
propagate to consumers. They will clear once the upstream maintainers drop the
deprecated transitive deps; the linked issues track that.

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
- [Sandboxed Usage](../guides/SANDBOXED-USAGE.md) - Docker / restricted-FS / team-distribution flows
- [Quick Start](../../QUICK_START.md) - Try your first orchestration
- [CLI Usage](../ENTRYPOINTS.md) - Learn all CLI commands
