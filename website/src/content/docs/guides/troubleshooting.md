---
title: 'Troubleshooting Guide'
description: 'Common issues and solutions for nexus-agents.'
---

**Last Updated:** 2026-01-15 (ET)

Common issues and solutions for nexus-agents.

---

## Quick Diagnostics

```bash
# Check system health
nexus-agents doctor

# Debug routing decisions
nexus-agents routing-audit "your task description"

# Verbose output
nexus-agents --verbose
```

---

## Installation Issues

### "Command not found: nexus-agents"

**Cause:** npm global bin not in PATH

**Solution:**

```bash
# Find npm global bin location
npm config get prefix

# Add to PATH (add to ~/.bashrc or ~/.zshrc)
export PATH="$(npm config get prefix)/bin:$PATH"

# Or use npx
npx nexus-agents doctor
```

### "EACCES permission denied"

**Cause:** npm global install permissions

**Solution:**

```bash
# Option 1: Fix npm permissions
mkdir -p ~/.npm-global
npm config set prefix '~/.npm-global'
export PATH="~/.npm-global/bin:$PATH"

# Option 2: Use a Node version manager (nvm, fnm)
nvm install 22
nvm use 22
npm install -g nexus-agents
```

### "Unsupported Node.js version"

**Cause:** nexus-agents requires Node.js 22.x LTS

**Solution:**

```bash
# Check current version
node --version

# Install Node.js 22 via nvm
nvm install 22
nvm use 22

# Or via fnm
fnm install 22
fnm use 22
```

---

## Configuration Issues

### "Configuration not found"

**Cause:** No `nexus-agents.yaml` in current directory or home config

**Solution:**

```bash
# Generate starter config
nexus-agents config init

# Or create manually
cat > nexus-agents.yaml << 'EOF'
models:
  default: claude-sonnet-4
EOF
```

### "Invalid configuration"

**Cause:** YAML syntax error or schema mismatch

**Solution:**

```bash
# Validate YAML syntax
npx yaml-lint nexus-agents.yaml

# Check against schema (verbose mode shows validation errors)
nexus-agents doctor --verbose
```

---

## API Key Issues

### "ANTHROPIC_API_KEY not set"

**Cause:** Missing environment variable for Claude adapter

**Solution:**

```bash
# Set in current session
export ANTHROPIC_API_KEY="sk-ant-..."

# Or add to shell config (~/.bashrc, ~/.zshrc)
echo 'export ANTHROPIC_API_KEY="sk-ant-..."' >> ~/.bashrc
source ~/.bashrc
```

### "Invalid API key"

**Cause:** Key format incorrect or expired

**Solution:**

1. Verify key starts with correct prefix (`sk-ant-` for Anthropic)
2. Check key hasn't expired in provider dashboard
3. Ensure no trailing whitespace in environment variable

### "Rate limit exceeded"

**Cause:** API quota exhausted

**Solution:**

```bash
# Check budget status
nexus-agents routing-audit "test" --format=json | jq '.budget'

# Reduce budget in config
cat >> nexus-agents.yaml << 'EOF'
routing:
  budget:
    tokenBudget: 500000  # Reduce from 1M
    costBudgetUsd: 5.0   # Reduce from $10
EOF
```

---

## MCP Server Issues

### "MCP server failed to start"

**Cause:** Port conflict or stdio issues

**Solution:**

```bash
# Check if port is in use (default: stdio)
# For TCP mode:
lsof -i :3000

# Run with verbose logging
nexus-agents --mode=server --verbose
```

### "Claude Desktop can't connect"

**Cause:** MCP configuration incorrect

**Solution:**

1. Check `~/.claude/mcp.json`:

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

2. Restart Claude Desktop
3. Check Claude Desktop logs: `~/Library/Logs/Claude/` (macOS)

### "Tool not found: orchestrate"

**Cause:** MCP server started but tools not registered

**Solution:**

```bash
# Verify tools are registered
nexus-agents --mode=server --verbose 2>&1 | grep "Registered tool"
```

---

## Routing Issues

### "No CLI adapters available"

**Cause:** No CLI tools detected or all health checks failed

**Solution:**

```bash
# Check which CLIs are available
nexus-agents doctor

# Debug specific CLI
which claude  # Claude CLI
which gemini  # Gemini CLI

# Force specific adapter
nexus-agents orchestrate "task" --cli=claude
```

### "Budget exceeded"

**Cause:** Session or task budget limit reached

**Solution:**

```bash
# Check current budget status
nexus-agents routing-audit "test" --bandit-stats

# Reset session budget
nexus-agents config reset-budget

# Or increase limits in config
```

### "LinUCB selecting suboptimal model"

**Cause:** Exploration phase or insufficient training data

**Solution:**

```bash
# Check exploration stats
nexus-agents routing-audit "task" --bandit-stats

# View feature importance
nexus-agents routing-audit "task" --format=json | jq '.linucb'

# Note: Initial exploration is expected; system learns over time
```

---

## Agent Issues

### "Agent stuck in 'thinking' state"

**Cause:** Long-running API call or timeout

**Solution:**

```bash
# Set timeout in config
cat >> nexus-agents.yaml << 'EOF'
agents:
  timeout: 120000  # 2 minutes
EOF
```

### "Expert not found"

**Cause:** Unknown expert type requested

**Solution:**

```bash
# List available experts
nexus-agents expert list

# Valid types: code, security, architecture, documentation, testing
```

### "Consensus never reached"

**Cause:** Threshold too high or agents disagreeing

**Solution:**

```bash
# Check protocol settings
# Lower threshold for non-critical decisions
# Use simple_majority instead of unanimous
```

---

## Memory Issues

### "Context window exceeded"

**Cause:** Too much context loaded for model

**Solution:**

```bash
# Check context usage
# Use tiered documentation (load only what's needed)
# See docs/INDEX.yaml for context budgets

# Prune context manually
nexus-agents orchestrate "task" --max-context=50000
```

### "Session memory not persisting"

**Cause:** Session not properly closed or storage issue

**Solution:**

```bash
# Check session storage location
ls -la ~/.nexus-agents/sessions/

# Verify write permissions
```

---

## Workflow Issues

### "Workflow template not found"

**Cause:** Template file doesn't exist

**Solution:**

```bash
# List available templates
nexus-agents workflow list

# Check template paths
ls -la workflows/
```

### "Step failed: undefined"

**Cause:** Missing required input or dependency

**Solution:**

```bash
# Run with dry-run to see steps
nexus-agents workflow run <template> --dry-run

# Check template schema
cat workflows/<template>.yaml
```

---

## Getting Help

### Resources

- **Documentation Index:** `docs/INDEX.yaml`
- **Full Docs:** `docs/llms-full.txt`
- **Architecture:** `ARCHITECTURE.md`

### Reporting Issues

```bash
# Gather diagnostic info
nexus-agents doctor --json > diagnostics.json

# Create issue
gh issue create \
  --title "Bug: [description]" \
  --body "$(cat diagnostics.json)" \
  --label "bug"
```

### Debug Logging

```bash
# Enable debug logging
export NEXUS_LOG_LEVEL=debug
nexus-agents orchestrate "task"

# Or per-command
nexus-agents --verbose orchestrate "task"
```

---

## FAQ

### Q: Which model should I use?

**A:** Use the routing system - it automatically selects based on task complexity:

- Quick tasks → Fast tier (Haiku, GPT-4o-mini)
- Standard work → Balanced tier (Sonnet, GPT-4o)
- Complex reasoning → Powerful tier (Opus, o1)

### Q: How do I reduce API costs?

**A:**

1. Set budget constraints in config
2. Use routing-audit to understand model selection
3. Prefer smaller context (use llms.txt not llms-full.txt)

### Q: Can I use local models?

**A:** Yes, via Ollama adapter:

```yaml
models:
  ollama:
    baseUrl: http://localhost:11434
    models: [llama3, codellama]
```

### Q: How do I add a custom expert?

**A:** Add to config:

```yaml
experts:
  custom:
    my_expert:
      prompt: 'You are an expert in...'
      tier: balanced
```
