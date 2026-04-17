# Nexus Agents

[![OpenSSF Best Practices](https://www.bestpractices.dev/projects/12365/badge)](https://www.bestpractices.dev/projects/12365) [![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/williamzujkowski/nexus-agents/badge)](https://securityscorecards.dev/viewer/?uri=github.com/williamzujkowski/nexus-agents)

> The intelligence layer between you and your AI coding tools

[![npm version](https://img.shields.io/npm/v/nexus-agents)](https://www.npmjs.com/package/nexus-agents)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D22.0.0-brightgreen)](https://nodejs.org)

---

## Why Nexus Agents?

nexus-agents makes your AI coding tools work together intelligently. It coordinates Claude, Codex, Gemini, and OpenCode — routing each task to the best model using data-driven algorithms, validating outputs through multi-model consensus voting, and continuously improving through outcome-driven learning. Connect it to any MCP-compatible editor (Claude Code, Cursor, VS Code) and it handles the rest.

**What it does for you:**

- **Routes intelligently** — LinUCB bandit + TOPSIS scoring + adaptive bonuses pick the right model for each task, learned from real outcomes
- **Enforces quality** — consensus voting (6 strategies including Bayesian higher-order), QA review loops, security scans with SARIF
- **Learns over time** — 5 memory backends (session, belief, agentic, adaptive, typed) track what works, feeding routing, planning, and research decisions
- **Runs a full dev pipeline** — research papers, plan architecture, vote on proposals, decompose into tasks, implement, QA review, ship
- **Connects everything** — 30 MCP tools, 9 research sources, graph workflows, checkpoint/resume, GitHub/GitLab issue tracking

```
You: "Review this code for security and performance"
     ↓
CompositeRouter selects best CLI per category → Security Expert + Code Expert
     ↓
Consensus-validated response — outcomes feed back into routing for next time
```

**What it is NOT:**

- Not an autonomous agent — humans stay in the loop via votes and harness mode
- Not a chat framework — it orchestrates real CLI tools with real file I/O
- Not a model API proxy — the intelligence IS the routing, quality gates, and learning

---

## Architecture at a Glance

```
                         ┌─────────────────────────────────┐
                         │         Your IDE / CLI           │
                         │  (Claude Code, Cursor, VS Code)  │
                         └──────────────┬──────────────────┘
                                        │ MCP Protocol
                         ┌──────────────▼──────────────────┐
                         │       nexus-agents server        │
                         │                                  │
                         │  ┌──────────┐  ┌──────────────┐ │
                         │  │ 30 MCP   │  │ Dev Pipeline  │ │
                         │  │ Tools    │  │ research→plan │ │
                         │  └────┬─────┘  │ →vote→impl   │ │
                         │       │        │ →QA→ship      │ │
                         │  ┌────▼─────┐  └──────────────┘ │
                         │  │Composite │                    │
                         │  │Router    │  ┌──────────────┐ │
                         │  │(9 stages)│  │ 8 Memory     │ │
                         │  └────┬─────┘  │ Backends     │ │
                         │       │        └──────────────┘ │
                         └───────┼─────────────────────────┘
                    ┌────────────┼────────────┐
                    ▼            ▼             ▼
               ┌────────┐  ┌────────┐   ┌──────────┐
               │ Claude │  │ Gemini │   │  Codex   │ ...
               │  CLI   │  │  CLI   │   │   CLI    │
               └────────┘  └────────┘   └──────────┘
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

## Capabilities

| Category                       | Details                                                                                                                                                                          |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Intelligent Routing**        | 9-stage CompositeRouter: budget-aware, LinUCB bandit, TOPSIS multi-criteria, preference-trained, weather-adaptive. Learns from outcomes.                                         |
| **Multi-Expert Orchestration** | 11 built-in expert types (code, architecture, security, testing, docs, devops, research, PM, UX, infrastructure, data-visualization) coordinated by TechLead/Orchestrator agents |
| **Consensus Voting**           | 6 strategies: simple_majority, supermajority, unanimous, higher_order (Bayesian correlation-aware), opinion_wise, proof_of_learning                                              |
| **Development Pipeline**       | Research → Plan → Vote → Decompose → Implement → QA → Security. Three modes: autonomous, harness (caller implements), dry-run                                                    |
| **Memory & Learning**          | 5 user-facing backends (session, belief, agentic, adaptive, typed). Cross-session persistence. Outcomes feed routing.                                                            |
| **Research System**            | 9 discovery sources (arXiv, GitHub, Semantic Scholar, etc). Auto-catalog, quality scoring, synthesis into topic clusters                                                         |
| **Security**                   | Sandboxing (Docker/policy), trust classification, SARIF parsing, input sanitization, red team pipeline, firewall                                                                 |
| **Graph Workflows**            | DAG-based workflow execution with checkpoint/resume, state reduction, and event hooks                                                                                            |
| **30 MCP Tools**               | Agent management, workflow execution, research, memory, codebase intelligence, repo analysis, consensus, operations                                                              |

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
| Data Viz       | Charts, dashboards, visual data presentation |

---

## Supported CLIs & Providers

Nexus-agents routes tasks through 5 CLI adapters, each connecting to major AI providers:

| CLI       | Provider             | Best For                       |
| --------- | -------------------- | ------------------------------ |
| claude    | Anthropic (Claude)   | Complex reasoning, analysis    |
| gemini    | Google (Gemini)      | Long context, multimodal       |
| codex     | OpenAI (Codex CLI)   | Code generation, reasoning     |
| codex-mcp | OpenAI (Codex MCP)   | MCP-native Codex integration   |
| opencode  | Custom OpenAI-compat | Custom endpoints, local models |

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

When running as an MCP server, the following tools are available:

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
| `research_add_source`     | Add non-paper source (GitHub repo, tool, blog)           |
| `research_synthesize`     | Synthesize registry into topic clusters with themes      |
| `extract_symbols`         | Extract code symbols from source files for analysis      |
| `search_codebase`         | Search codebase for patterns, symbols, or text           |
| `run_dev_pipeline`        | Full dev pipeline: research, plan, vote, implement, QA   |
| `run_pipeline`            | Execute a pipeline plugin by name with typed input       |

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
