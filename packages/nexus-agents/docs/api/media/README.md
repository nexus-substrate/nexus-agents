# Nexus Agents

> Orchestrate multiple AI experts from a single interface

[![npm version](https://img.shields.io/npm/v/nexus-agents)](https://www.npmjs.com/package/nexus-agents)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D22.0.0-brightgreen)](https://nodejs.org)

---

## Why Nexus Agents?

**One tool to coordinate Claude, Gemini, Codex, and OpenCode.** Instead of switching between AI tools, nexus-agents routes your tasks to specialized experts that collaborate on complex problems.

```
You: "Review this code for security and performance"
     ↓
Orchestrator analyzes → delegates to Security Expert + Code Expert
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

> **Security:** In default MCP mode, the server communicates only via stdio with the parent process (no network exposure). The REST API (opt-in) auto-generates an API key on first start. For network-exposed deployments, set `NEXUS_AUTH_ENABLED=true`. See [SECURITY.md](./docs/architecture/SECURITY.md).

---

## What It Does

| Feature                        | Description                                                                                              |
| ------------------------------ | -------------------------------------------------------------------------------------------------------- |
| **Multi-Expert Orchestration** | Orchestrator coordinates 10 expert types: Code, Security, Architecture, Testing, Documentation, DevOps, Research, PM, UX, and Infrastructure |
| **Model Routing**              | Routes tasks to the best model based on capability (reasoning, speed, context size, budget)              |
| **Consensus Voting**           | Multi-agent voting on proposals with higher-order Bayesian aggregation                                   |
| **Workflow Automation**        | 11 built-in YAML templates for code review, security audit, and more                                     |
| **Research Registry**          | Track and discover academic papers and implementation techniques                                         |
| **Memory System**              | 5 typed memory backends (session, belief, agentic, adaptive, typed)                                      |
| **MCP Integration**            | 24 tools available for Claude Desktop, Claude Code, and other MCP clients                                |

---

## Available Experts

| Expert         | Specialization                               |
| -------------- | -------------------------------------------- |
| Code           | Implementation, debugging, optimization      |
| Architecture   | System design, patterns, scalability         |
| Security       | Vulnerability analysis, secure coding        |
| Testing        | Test strategies, coverage, test generation   |
| Documentation  | Technical writing, API docs                  |
| DevOps         | CI/CD, deployment, infrastructure            |
| Research       | Literature review, state-of-the-art analysis |
| PM             | Product management, requirements, priorities |
| UX             | User experience, usability, accessibility    |
| Infrastructure | Server management, bare metal, networking    |

---

## Supported CLIs & Providers

Nexus-agents routes tasks through 4 CLI adapters, each connecting to major AI providers:

| CLI      | Provider               | Best For                                |
| -------- | ---------------------- | --------------------------------------- |
| claude   | Anthropic (Claude)     | Complex reasoning, analysis             |
| gemini   | Google (Gemini)        | Long context, multimodal                |
| codex    | OpenAI (Codex)         | Code generation, reasoning              |
| opencode | Custom OpenAI-compat   | Custom endpoints, local models          |

---

## CLI Commands

```bash
nexus-agents                    # Start MCP server (default)
nexus-agents doctor             # Check installation health
nexus-agents setup              # Configure Claude CLI integration
nexus-agents orchestrate "..."  # Run task with experts
nexus-agents vote "proposal"    # Multi-agent consensus voting
nexus-agents review <pr-url>    # Review a GitHub PR
nexus-agents expert list        # List available experts
nexus-agents workflow list      # List workflow templates
nexus-agents config init        # Generate config file
nexus-agents fitness-audit      # Run fitness score audit
nexus-agents research query     # Query research registry
nexus-agents --help             # Full command list
```

See [docs/ENTRYPOINTS.md](./docs/ENTRYPOINTS.md) for the complete CLI reference (28+ commands).

---

## MCP Tools

When running as an MCP server, 24 tools are available:

| Tool                      | Description                                              |
| ------------------------- | -------------------------------------------------------- |
| `orchestrate`             | Task orchestration with Orchestrator coordination        |
| `create_expert`           | Create a specialized expert agent                        |
| `execute_expert`          | Execute a task using a created expert                    |
| `run_workflow`            | Execute a workflow template                              |
| `delegate_to_model`       | Route task to optimal model                              |
| `consensus_vote`          | Multi-model consensus voting on proposals                |
| `list_experts`            | List available expert types                              |
| `list_workflows`          | List available workflow templates                        |
| `research_query`          | Query research registry (status, overlap, stats, search) |
| `research_add`            | Add paper to registry by arXiv ID                        |
| `research_discover`       | Discover papers/repos from external sources              |
| `research_analyze`        | Analyze registry for gaps, trends, coverage              |
| `research_catalog_review` | Review auto-cataloged research references                |
| `memory_query`            | Query across all memory backends                         |
| `memory_stats`            | Memory system statistics dashboard                       |
| `memory_write`            | Write to typed memory backends                           |
| `weather_report`          | Multi-CLI performance weather report                     |
| `issue_triage`            | Triage GitHub issues with trust classification           |
| `run_graph_workflow`      | Execute graph-based workflows with checkpointing         |
| `execute_spec`            | Execute AI software factory spec pipeline                |
| `registry_import`         | Generate draft model registry entry                      |
| `query_trace`             | Query execution traces for observability                 |
| `repo_analyze`            | Analyze GitHub repository structure                      |
| `repo_security_plan`      | Generate security scanning pipeline for a repo           |

---

## Configuration

**Environment Variables:**

| Variable            | Description                       |
| ------------------- | --------------------------------- |
| `ANTHROPIC_API_KEY` | Claude API key                    |
| `OPENAI_API_KEY`    | OpenAI API key                    |
| `GOOGLE_AI_API_KEY` | Gemini API key                    |
| `NEXUS_LOG_LEVEL`   | Log level (debug/info/warn/error) |

**Generate config file:**

```bash
nexus-agents config init   # Creates nexus-agents.yaml
```

---

## Documentation

| Topic              | Link                                                         |
| ------------------ | ------------------------------------------------------------ |
| Full CLI Reference | [docs/ENTRYPOINTS.md](./docs/ENTRYPOINTS.md)                 |
| Architecture       | [docs/architecture/README.md](./docs/architecture/README.md) |
| Contributing       | [CONTRIBUTING.md](./CONTRIBUTING.md)                         |
| Coding Standards   | [CODING_STANDARDS.md](./CODING_STANDARDS.md)                 |
| Quick Start Guide  | [QUICK_START.md](./QUICK_START.md)                           |

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

See [CONTRIBUTING.md](./CONTRIBUTING.md) for details.

---

## License

MIT - See [LICENSE](./LICENSE)

---

Built with Claude Code
