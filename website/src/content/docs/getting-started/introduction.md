---
title: 'Introduction'
description: '> Orchestrate multiple AI experts from a single interface'
---

> Orchestrate multiple AI experts from a single interface

[![npm version](https://img.shields.io/npm/v/nexus-agents)](https://www.npmjs.com/package/nexus-agents)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D22.0.0-brightgreen)](https://nodejs.org)

---

## Why Nexus Agents?

**One tool to coordinate Claude, OpenAI, Gemini, and Ollama.** Instead of switching between AI tools, nexus-agents routes your tasks to specialized experts that collaborate on complex problems.

```
You: "Review this code for security and performance"
     ↓
Tech Lead analyzes → delegates to Security Expert + Code Expert
     ↓
Combined response with findings from both experts
```

---

## Quick Start (2 minutes)

### 1. Install

```bash
npm install -g nexus-agents
```

### 2. Verify

```bash
nexus-agents doctor
```

### 3. Use

**With Claude Code (recommended):**

```bash
nexus-agents setup   # Auto-configures MCP server
```

Then in Claude: `"orchestrate: Review this PR for issues"`

**Standalone CLI:**

```bash
export ANTHROPIC_API_KEY=your-key
nexus-agents orchestrate "Explain the architecture of this codebase"
```

> **Security Note:** The server runs without authentication by default. For production deployments, set `NEXUS_AUTH_ENABLED=true`. See [SECURITY.md](./docs/architecture/SECURITY.md) for details.

---

## What It Does

| Feature                        | Description                                                                            |
| ------------------------------ | -------------------------------------------------------------------------------------- |
| **Multi-Expert Orchestration** | Tech Lead coordinates Code, Security, Architecture, Testing, and Documentation experts |
| **Model Routing**              | Routes tasks to the best model based on capability (reasoning, speed, context size)    |
| **Workflow Automation**        | YAML templates for repeatable processes like code review                               |
| **MCP Integration**            | Works as a tool server for Claude Desktop and Claude Code                              |

---

## Available Experts

| Expert        | Specialization                             |
| ------------- | ------------------------------------------ |
| Code          | Implementation, debugging, optimization    |
| Architecture  | System design, patterns, scalability       |
| Security      | Vulnerability analysis, secure coding      |
| Testing       | Test strategies, coverage, test generation |
| Documentation | Technical writing, API docs                |

---

## Supported Models

| Provider | Models                    | Best For                    |
| -------- | ------------------------- | --------------------------- |
| Claude   | Sonnet 4, Opus 4, Haiku 3 | Complex reasoning, analysis |
| OpenAI   | GPT-4o, o1, Codex         | Code generation             |
| Gemini   | 2.5 Pro, 2.5 Flash        | Long context, multimodal    |
| Ollama   | Llama 3, CodeLlama, Qwen  | Local inference, privacy    |

---

## CLI Commands

```bash
nexus-agents                    # Start MCP server (default)
nexus-agents doctor             # Check installation health
nexus-agents setup              # Configure Claude CLI integration
nexus-agents orchestrate "..."  # Run task with experts
nexus-agents review <pr-url>    # Review a GitHub PR
nexus-agents expert list        # List available experts
nexus-agents workflow list      # List workflow templates
nexus-agents --help             # Full command list
```

---

## MCP Tools

When running as an MCP server, these tools are available:

| Tool                | Description                                  |
| ------------------- | -------------------------------------------- |
| `orchestrate`       | Analyze task and coordinate expert execution |
| `create_expert`     | Dynamically create a specialized expert      |
| `run_workflow`      | Execute a workflow template                  |
| `delegate_to_model` | Route task to optimal model                  |

---

## Configuration

| ------------------- | --------------------------------- |
| `ANTHROPIC_API_KEY` | Claude API key |
| `OPENAI_API_KEY` | OpenAI API key |
| `GOOGLE_AI_API_KEY` | Gemini API key |
| `NEXUS_LOG_LEVEL` | Log level (debug/info/warn/error) |

**Generate config file:**

```bash
nexus-agents config init   # Creates nexus-agents.yaml
```

---

## Documentation

| Topic              | Link                                                                                                  |
| ------------------ | ----------------------------------------------------------------------------------------------------- |
| Full CLI Reference | [CLI Usage](/nexus-agents/guides/cli-usage/)                                                          |
| Architecture       | [docs/architecture/README.md](./docs/architecture/README.md)                                          |
| Contributing       | [CONTRIBUTING.md](/nexus-agents/architecture/contributing/)                                           |
| Coding Standards   | [CODING_STANDARDS.md](https://github.com/williamzujkowski/nexus-agents/blob/main/CODING_STANDARDS.md) |
| Quick Start Guide  | [QUICK_START.md](/nexus-agents/architecture/quick-start/)                                             |

---

## Development

```bash
git clone https://github.com/williamzujkowski/nexus-agents.git
cd nexus-agents
pnpm install
pnpm build
pnpm test
```

**Requirements:** Node.js 22.x LTS, pnpm 9.x

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/amazing-feature`)
3. Commit with conventional commits (`feat(scope): add feature`)
4. Open a Pull Request

See [CONTRIBUTING.md](/nexus-agents/architecture/contributing/) for details.

---

## License

MIT - See [LICENSE](./LICENSE)

---

Built with Claude Code
