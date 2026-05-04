# Nexus Agents

[![OpenSSF Best Practices](https://www.bestpractices.dev/projects/12365/badge)](https://www.bestpractices.dev/projects/12365) [![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/williamzujkowski/nexus-agents/badge)](https://securityscorecards.dev/viewer/?uri=github.com/williamzujkowski/nexus-agents)

> Governance substrate for your AI coding agents — adversarial review, drift-detected rules, immutable audit, closed-loop telemetry

[![npm version](https://img.shields.io/npm/v/nexus-agents)](https://www.npmjs.com/package/nexus-agents)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D22.0.0-brightgreen)](https://nodejs.org)

---

## Why Nexus Agents?

**Nexus-agents is a governance layer that sits above your AI coding agents** — Claude Code, Codex, Gemini, and OpenCode. The agents do the engineering; nexus-agents enforces the rules they have to follow, reviews their work adversarially before it ships, audits everything they touch, and routes the next task based on what actually worked.

**What it gives you:**

- **Adversarial PR review** — `pr_review` runs 5 voter roles (architect, security, devex, catfish, scope_steward) with a 4-point verification gate. On the v5 evaluation set (10 PRs): 100% bug-catch and 50% raw false-positive rate; manual triage reclassified most "FPs" as legitimate findings the dataset had mislabeled. Full numbers: [docs/research/pr-review-experiment-results-v5.md](docs/research/pr-review-experiment-results-v5.md)
- **Drift-detected charter** — `CLAUDE.md` + `governance:check` + blocking CI gates fail the build when documented rules drift from registered behavior (model registry, MCP tools, expert types, skills)
- **Immutable audit trail** — every tool call, every voter decision, every routing choice flows through `AuditTrail` with structured logging and hash-chained append-only storage; integrity is verifiable via the `verify_audit_chain` MCP tool
- **Closed-loop routing** — `OutcomeStore` feeds production telemetry back into LinUCB + TOPSIS scoring so the system actually learns from what shipped vs what regressed
- **Multi-voter consensus** — `consensus_vote` runs a default 7-role panel (architect, security, devex, ai_ml, pm, catfish, scope_steward; `--quick` uses 3). Six strategies: simple/super-majority, unanimous, higher-order Bayesian, opinion-wise, proof-of-learning

```
You:               "Review this PR / orchestrate this task / vote on this proposal"
                    ↓
nexus-agents:       enforce rules → route → adversarial review → audit → learn from outcome
                    ↓
Engineering agents: Claude Code · Codex · Gemini · OpenCode
                    ↓
Code:               actual edits, tests, PRs, issues
```

**What this is NOT:**

- **Not another autonomous coding agent.** OpenHands, SWE-agent, AutoGen, Devin, Factory — those are agents. Nexus-agents is the layer above them. Use whichever agents fit; we govern them
- **Not a chat framework.** Nothing here orchestrates conversations. It orchestrates real CLI tool invocations with real file I/O and outcome tracking
- **Not a model API proxy.** The value is the rules, the gates, the audit, and the learning. Routing is a side effect of the governance work, not the product

---

## Where nexus-agents sits in your stack

```
   Human / IDE / CLI
   (Claude Code, Cursor, VS Code, terminal)
            │ MCP Protocol
            ▼
  ┌─────────────────────────────────────────────────────┐
  │  GOVERNANCE SUBSTRATE — what nexus-agents provides   │
  │                                                       │
  │   Charter (drift-checked)   Adversarial PR review    │
  │   Role registry             Multi-voter consensus    │
  │   Immutable audit trail     Closed-loop telemetry    │
  │                                                       │
  │   37 MCP tools · multi-stage CompositeRouter         │
  └────────────────────────┬────────────────────────────┘
                           │
                           ▼ delegates execution to
  ┌─────────────────────────────────────────────────────┐
  │  ENGINEERING AGENTS — what does the actual work      │
  │                                                       │
  │   Claude Code · Codex · Gemini · OpenCode            │
  └────────────────────────┬────────────────────────────┘
                           │
                           ▼ produces
                   Code, tests, PRs, issues
```

The governance substrate is the layer that catches the mistakes engineering agents would otherwise make — bad code shipped, rules drifting from intent, audit gaps, telemetry-free routing — and routes the next task based on what actually worked the last time.

---

## Quick Start (2 minutes)

### 1. Install

```bash
npm install -g nexus-agents
```

**Or as a Claude Code plugin** (single-command install from the official marketplace):

```
/plugin install nexus-agents
```

See [docs/getting-started/PLUGIN_INSTALL.md](docs/getting-started/PLUGIN_INSTALL.md) for plugin-specific setup, or [llms-install.md](llms-install.md) for the short install guide an AI agent can follow.

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

| Category                       | Details                                                                                                                                                                                                                                                                                     |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Adversarial PR Review**      | `pr_review` MCP tool: 5 voter roles (architect, security, devex, catfish, scope_steward) with 4-point gate. v5 evaluation (n=10): 100% bug-catch, 50% raw FP rate; manual triage reclassified most FPs as legitimate findings ([details](docs/research/pr-review-experiment-results-v5.md)) |
| **Consensus Voting**           | 6 strategies: simple_majority, supermajority, unanimous, higher_order (Bayesian correlation-aware), opinion_wise, proof_of_learning                                                                                                                                                         |
| **Drift-Detected Charter**     | `CLAUDE.md` + `inject-governance.ts check` enforces single-source registries (model registry, MCP tools, expert types). Blocking CI gate fails build on drift                                                                                                                               |
| **Audit Trail**                | Structured logging for every tool call, voter decision, and routing choice. Hash-chained immutable storage; integrity verifiable via `verify_audit_chain` MCP tool (#2281, #2289)                                                                                                           |
| **Closed-Loop Telemetry**      | `OutcomeStore` records production results; LinUCB bandit + TOPSIS scoring + adaptive routing bonuses adjust based on what actually worked. No other framework closes this loop                                                                                                              |
| **Security Pipeline**          | Sandboxing (Docker/policy), trust-tiered input handling, SARIF parsing, red-team patterns, ClawGuard access policies (audit/enforce)                                                                                                                                                        |
| **Multi-Expert Orchestration** | 12 built-in expert types coordinated by Orchestrator. Roles bind prompt + tools + memory                                                                                                                                                                                                    |
| **Development Pipeline**       | Research → Plan → Vote → Decompose → Implement → QA → Security. Three modes: autonomous, harness (caller implements), dry-run                                                                                                                                                               |
| **Memory & Learning**          | 5 user-facing backends (session, belief, agentic, adaptive, typed). Cross-session persistence feeds routing decisions                                                                                                                                                                       |
| **Research System**            | 9 discovery sources (arXiv, GitHub, Semantic Scholar, etc). Auto-catalog, quality scoring, synthesis into topic clusters                                                                                                                                                                    |
| **Graph Workflows**            | DAG-based workflow execution with checkpoint/resume, state reduction, and event hooks                                                                                                                                                                                                       |
| **37 MCP Tools**               | Agent management, workflow execution, research, memory, codebase intelligence, repo analysis, consensus, operations                                                                                                                                                                         |

---

## Available Experts

| Expert         | Specialization                               |
| -------------- | -------------------------------------------- |
| Code           | Implementation, debugging, optimization      |
| Architecture   | System design, patterns, scalability         |
| Security       | Vulnerability analysis, secure coding        |
| Testing        | Test strategies, coverage, test generation   |
| QA             | Acceptance criteria, regression checks       |
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
nexus-agents init --portable    # Create workspace-local .nexus-agents/ for sandboxes
nexus-agents init --portable --mcp-config  # Also emit .mcp.json wiring Claude Code to it
nexus-agents init --portable --install --mcp-config  # …and install the binary into the workspace
nexus-agents fitness-audit      # Run fitness score audit
nexus-agents research query     # Query research registry
nexus-agents --help             # Full command list
```

See [docs/ENTRYPOINTS.md](./docs/ENTRYPOINTS.md) for the complete CLI reference (28+ commands).

---

## MCP Tools

When running as an MCP server, the following tools are available:

<!-- Auto-generated below — do not hand-edit between markers. Run `pnpm governance:inject` to update from `packages/nexus-agents/src/mcp/tools/index.ts`. See #2269. -->

<!-- GOVERNANCE:README_TOOLS:START -->

| Tool                          | Description                                                                         |
| ----------------------------- | ----------------------------------------------------------------------------------- |
| `orchestrate`                 | Task orchestration with Orchestrator coordination                                   |
| `create_expert`               | Create a specialized expert agent                                                   |
| `execute_expert`              | Execute a task using a created expert                                               |
| `run_workflow`                | Execute a workflow template                                                         |
| `delegate_to_model`           | Route task to optimal model                                                         |
| `list_experts`                | List available expert types                                                         |
| `list_workflows`              | List available workflow templates                                                   |
| `consensus_vote`              | Multi-model consensus voting on proposals                                           |
| `research_query`              | Query research registry (status, overlap, stats, search)                            |
| `research_add`                | Add paper to registry by arXiv ID                                                   |
| `research_add_source`         | Add non-paper source (GitHub repo, tool, blog)                                      |
| `research_discover`           | Discover papers/repos from external sources                                         |
| `research_analyze`            | Analyze registry for gaps, trends, coverage                                         |
| `research_catalog_review`     | Review auto-cataloged research references                                           |
| `research_synthesize`         | Synthesize registry into topic clusters with themes                                 |
| `survey_oss_landscape`        | Transient OSS project search (license, stars, last-commit) via GitHub               |
| `vendor_publishing_audit`     | Look up a vendor's signing infrastructure (GPG keys, URL patterns, signature shape) |
| `compare_data_feeds`          | Diff two YAML/JSON feeds: coverage + per-field axes                                 |
| `memory_query`                | Query across all memory backends                                                    |
| `memory_stats`                | Memory system statistics dashboard                                                  |
| `memory_write`                | Write to typed memory backends                                                      |
| `weather_report`              | Multi-CLI performance weather report                                                |
| `issue_triage`                | Triage GitHub issues with trust classification                                      |
| `run_graph_workflow`          | Execute graph-based workflows with checkpointing                                    |
| `execute_spec`                | Execute AI software factory spec pipeline                                           |
| `registry_import`             | Generate draft model registry entry                                                 |
| `query_trace`                 | Query execution traces for observability                                            |
| `query_task_state`            | Query the structured task-state log for a task ID                                   |
| `verify_audit_chain`          | Verify hash chain of a FileAuditStorage audit log directory                         |
| `repo_analyze`                | Analyze GitHub repository structure                                                 |
| `repo_security_plan`          | Generate security scanning pipeline for a repo                                      |
| `extract_symbols`             | Extract code symbols from source files for analysis                                 |
| `search_codebase`             | Search codebase for patterns, symbols, or text                                      |
| `run_dev_pipeline`            | Full dev pipeline: research, plan, vote, implement, QA                              |
| `run_pipeline`                | Execute a pipeline plugin by name with typed input                                  |
| `pr_review`                   | Multi-voter PR review with verification gate (experimental)                         |
| `supply_chain_tradeoff_panel` | Per-axis tradeoff vote for build-vs-buy / supply-chain decisions                    |

<!-- GOVERNANCE:README_TOOLS:END -->

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
