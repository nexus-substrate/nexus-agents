# Nexus Agents

> Multi-agent orchestration MCP server with model diversity and workflow automation

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D24.0.0-brightgreen)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8+-blue)](https://www.typescriptlang.org)
[![MCP Protocol](https://img.shields.io/badge/MCP-2025--11--25-purple)](https://modelcontextprotocol.io)

## Overview

Nexus Agents is a production-grade MCP (Model Context Protocol) server that orchestrates multiple AI experts to solve complex tasks. It features:

- **Multi-Model Support** - Claude, OpenAI, Gemini, Ollama
- **Dynamic Expert Creation** - Create specialized agents on-the-fly
- **Workflow Automation** - YAML-based workflow templates
- **Security-First Design** - Defense in depth from the ground up

## Quick Start

```bash
# Install globally
npm install -g nexus-agents

# Set your API key
export ANTHROPIC_API_KEY=sk-...

# Run
nexus-agents
```

## Features

### Multi-Agent Orchestration

The Tech Lead agent analyzes tasks and delegates to specialized experts:

- **Code Expert** - Implementation, debugging, optimization
- **Architecture Expert** - System design, patterns, trade-offs
- **Security Expert** - Vulnerability analysis, secure coding
- **Documentation Expert** - Technical writing, API docs
- **Testing Expert** - Test strategies, coverage analysis

### Model Diversity

Leverage the strengths of different models:

| Tier | Models | Use Cases |
|------|--------|-----------|
| Fast | Claude Haiku, GPT-4o-mini | Quick queries, formatting |
| Balanced | Claude Sonnet, GPT-4o | Most coding tasks |
| Powerful | Claude Opus, o1-pro | Complex architecture |

### Workflow Engine

Define reusable workflows in YAML:

```yaml
name: code-review
steps:
  - agent: security_expert
    action: scan_vulnerabilities
  - agent: code_expert
    action: review_style
  - agent: testing_expert
    action: check_coverage
```

## Configuration

```yaml
# nexus-agents.yaml
models:
  default: claude-sonnet
  tiers:
    fast: [claude-haiku]
    balanced: [claude-sonnet, gpt-4o]
    powerful: [claude-opus]

experts:
  custom:
    rust_expert:
      prompt: "You are a Rust systems programming expert..."
      tier: powerful
```

## Development

```bash
# Clone
git clone https://github.com/williamzujkowski/nexus-agents.git
cd nexus-agents

# Install
pnpm install

# Development
pnpm dev

# Test
pnpm test

# Build
pnpm build
```

## Architecture

```
nexus-agents/
├── packages/
│   ├── core/        # Shared types, utilities
│   ├── config/      # Configuration management
│   ├── adapters/    # Model adapters
│   ├── agents/      # Agent framework
│   ├── workflows/   # Workflow engine
│   ├── mcp/         # MCP server
│   └── cli/         # CLI interface
└── apps/
    └── nexus-agents/
```

## Roadmap

- [x] Project setup and standards
- [ ] **v0.1.0** - Claude + Tech Lead + Code Expert
- [ ] **v0.2.0** - All adapters + All experts
- [ ] **v0.3.0** - Workflow engine
- [ ] **v1.0.0** - Production hardening

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT - See [LICENSE](LICENSE) for details.

## Acknowledgments

This project is a clean-room rewrite inspired by [claude-team-mcp](https://github.com/original/claude-team-mcp), with attribution preserved per MIT license.

---

Built with Claude Code
