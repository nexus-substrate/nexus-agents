# Nexus Agents

[![OpenSSF Best Practices](https://www.bestpractices.dev/projects/12365/badge)](https://www.bestpractices.dev/projects/12365) [![OpenSSF Scorecard](https://api.securityscorecards.dev/projects/github.com/nexus-substrate/nexus-agents/badge)](https://securityscorecards.dev/viewer/?uri=github.com/nexus-substrate/nexus-agents)

> Autonomic control plane for AI coding agents — one entry point, adversarial review, tamper-evident hash-chained audit, human-gated closed-loop tuning (autonomous demotion, earned promotion)

[![npm version](https://img.shields.io/npm/v/nexus-agents)](https://www.npmjs.com/package/nexus-agents)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D22.0.0-brightgreen)](https://nodejs.org)
[![Claims Registry Drift](https://img.shields.io/github/actions/workflow/status/nexus-substrate/nexus-agents/docs-check.yml?branch=main&label=claims%20registry)](https://github.com/nexus-substrate/nexus-agents/actions/workflows/docs-check.yml)

---

## Why Nexus Agents?

**Nexus-agents is an autonomic control plane for your AI coding agents** — Claude Code, Codex, Gemini, and OpenCode. The agents are the _data plane_: they do the engineering. Nexus-agents is the _control plane_: it admits work through one entry point, reviews it adversarially before it ships, records every action in a tamper-evident event log, and closes the loop by tuning where the next task goes based on what actually worked.

Borrowing the vocabulary of [autonomic computing](https://en.wikipedia.org/wiki/Autonomic_computing): the system runs a **MAPE-K** loop — Monitor, Analyze, Plan, Execute over a shared Knowledge base — so that operating your agent fleet is, as much as the evidence allows, self-managing rather than hand-driven.

### The control-plane mapping

Each classic control-plane role maps to a shipped nexus-agents component — the metaphor is load-bearing, not decoration:

| Control-plane role | nexus-agents component                                    | What it does                                                              |
| ------------------ | --------------------------------------------------------- | ------------------------------------------------------------------------- |
| Scheduler          | `run` / MetaOrchestrator                                  | One entry point picks (and optionally runs) the right strategy for a goal |
| Admission control  | gates (`pr_review`, `consensus_vote`, `run_quality_gate`) | Adversarial review and quality gates decide what is allowed to ship       |
| Event log          | `AuditTrail` hash chain + `verify_audit_chain`            | Append-only, tamper-evident record of every decision                      |
| Data plane         | engineering CLIs                                          | Claude Code, Codex, Gemini, OpenCode do the file edits, tests, PRs        |

### The MAPE-K loop

```
   ┌────────── Monitor ──────────┐        OutcomeStore · AuditTrail · swarm-health
   │                             ▼        adapter circuit-breaker signals
Execute ◀── Plan ◀── Analyze ◀───┘        LinUCB + TOPSIS scoring, consensus
   │         │                            MetaOrchestrator strategy choice
   │         └── route the next task ──────────────────────────────────────┐
   ▼                                                                        │
 run the strategy ── adversarial review ── audit ── feed outcome back ──────┘
                              shared Knowledge: OutcomeStore + memory backends + audit log
```

### Self-\* capabilities

Autonomic systems are described by their **self-\*** properties. Each row below maps to a loop that **exists in the codebase today** — nothing here is aspirational, and the authority each loop carries is bounded by [ADR-0017's authority ladder](docs/adr/0017-authority-ladder.md) (`observe → suggest → advisory → enforce`):

| Self-\* property | What it means here                               | Implementing loop (shipped)                                                                                                                                  |
| ---------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Self-configuring | Detects environment and wires itself in          | `nexus-agents setup` / `doctor` (`cli-commands.ts`) — detects CLIs, writes MCP config, reports health                                                        |
| Self-healing     | Routes around failing dependencies automatically | Adapter circuit-breaker + swarm-health demotion (`cli-adapters/circuit-breaker.ts`); a capped, auto-decaying, demotion-only `TuneAdjustmentStore` adjustment |
| Self-optimizing  | Learns where the next task should go             | Closed-loop `OutcomeStore` → LinUCB + TOPSIS scoring in the `CompositeRouter`                                                                                |
| Self-protecting  | Constrains what untrusted input and tools can do | Trust-tiered input handling, ClawGuard access policies (audit/enforce), Docker/policy sandboxing (`security/`)                                               |

> **Honesty note:** these loops sit at different rungs of the authority ladder. The self-tuning demotion is `enforce` but bounded (capped, auto-decaying, demotion-only); learned selection and other promotions are still **earned** per-loop against an evidence threshold plus ratification, not flipped on by default. See [ADR-0017](docs/adr/0017-authority-ladder.md).

**What it gives you:**

- **Adversarial PR review** — `pr_review` runs 5 voter roles (architect, security, devex, catfish, scope_steward) with a 4-point verification gate. On the v5 evaluation set: 100% bug-catch on a focused synthetic dataset (n=10) and a 50% raw false-positive rate; manual triage reclassified one of two inspected FP cases as a real finding the dataset had mislabeled. These are directional small-n figures, not measured rates. Full numbers and guardrails: [docs/research/pr-review-experiment-results-v5.md](docs/research/pr-review-experiment-results-v5.md)
- **Drift-detected charter** — `CLAUDE.md` + `governance:check` + blocking CI gates fail the build when documented rules drift from registered behavior (model registry, MCP tools, expert types, skills)
- **Tamper-evident audit trail** — every tool call, every voter decision, every routing choice flows through `AuditTrail` with structured logging and hash-chained append-only storage; integrity is verifiable via the `verify_audit_chain` MCP tool (tamper-evident, not tamper-proof — see the [audit hash-chain threat model](docs/security/audit-hash-chain-threat-model.md))
- **Closed-loop routing** — `OutcomeStore` feeds production telemetry back into LinUCB + TOPSIS scoring so the system actually learns from what shipped vs what regressed. A second, **bounded** loop runs by default: a `signal.swarm_unhealthy` (adapter circuit-breaker / swarm-health) applies a small, capped, auto-decaying routing demotion via `TuneAdjustmentStore` — demotion-only, never zeroes a CLI, every adjustment audited, opt-out with `NEXUS_TUNE_ENFORCE=false`
- **Multi-voter consensus** — `consensus_vote` runs a default 7-role panel (architect, security, devex, ai_ml, pm, catfish, scope_steward; `--quick` uses 3). Six strategy names (five distinct: `higher_order` is an alias of `opinion_wise`, #514): simple/super-majority, unanimous, higher-order Bayesian, opinion-wise, proof-of-learning

```
You:               "Review this PR / orchestrate this task / vote on this proposal"
                    ↓
Control plane:      admit → schedule/route → adversarial review → audit → learn from outcome
                    ↓
Data plane (agents): Claude Code · Codex · Gemini · OpenCode
                    ↓
Code:               actual edits, tests, PRs, issues
```

**What this is NOT:**

- **Not another autonomous coding agent.** OpenHands, SWE-agent, AutoGen, Devin, Factory — those are the data plane. Nexus-agents is the control plane above them. Use whichever agents fit; we admit, review, audit, and route their work
- **Not a chat framework.** Nothing here orchestrates conversations. It orchestrates real CLI tool invocations with real file I/O and outcome tracking
- **Not a model API proxy.** The value is the admission gates, the audit, and the closed-loop tuning. Routing is a consequence of the control-plane work, not the product
- **Not fully autonomous.** "Autonomic" means self-managing within bounds, not unsupervised. Every loop's authority is capped by the authority ladder (ADR-0017); promotions to higher authority are earned against evidence and human ratification, never flipped on by default

---

## Where nexus-agents sits in your stack

```
   Human / IDE / CLI
   (Claude Code, Cursor, VS Code, terminal)
            │ MCP Protocol
            ▼
  ┌─────────────────────────────────────────────────────┐
  │  CONTROL PLANE — what nexus-agents provides          │
  │                                                       │
  │   Scheduler: run / MetaOrchestrator                  │
  │   Admission control: PR review · consensus · gates   │
  │   Event log: tamper-evident hash-chained audit       │
  │   Closed-loop self-tuning (MAPE-K)                   │
  │                                                       │
  │   46 MCP tools · multi-stage CompositeRouter         │
  └────────────────────────┬────────────────────────────┘
                           │
                           ▼ delegates execution to
  ┌─────────────────────────────────────────────────────┐
  │  DATA PLANE — the agents that do the actual work     │
  │                                                       │
  │   Claude Code · Codex · Gemini · OpenCode            │
  └────────────────────────┬────────────────────────────┘
                           │
                           ▼ produces
                   Code, tests, PRs, issues
```

The control plane is the layer that catches the mistakes data-plane agents would otherwise make — bad code shipped, rules drifting from intent, audit gaps, telemetry-free routing — and routes the next task based on what actually worked the last time.

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

Prints a health table — Node version, configured CLIs (claude / codex / gemini / opencode), API keys missing vs present. Read-only; safe to run any time.

### 3. See what success looks like (60-second smoke task — no API keys needed)

```bash
nexus-agents vote --quick --proposal "Use SQLite over JSON files for the outcome store"
```

You should see:

```
Nexus Agents Consensus Vote
============================

Collecting votes from 3 agents (timeout: 60s each)...

Proposal: Use SQLite over JSON files for the outcome store

Votes

  ✓ Software Architect: APPROVE (86%)
  ✓ Security Engineer:  APPROVE (74%)
  ✓ Scope Steward:      APPROVE (91%)

Summary

  Approve:  3
  Reject:   0
  Abstain:  0
  Approval: 100.0%
  Threshold: simple_majority

Result: APPROVED

Completed in ~30s
```

Three voter roles deliberate via whichever local CLIs you have (Claude, Codex, Gemini) — no API keys required. Per-voter reasoning is recorded; the terminal prints the verdict. Mixed outcomes (some approve / some reject) and graceful error handling are demonstrated on the [project site hero](https://nexus-substrate.github.io/nexus-agents/) with a real 7-voter run.

### 4. Wire into your editor

```bash
nexus-agents setup   # Auto-configures MCP server in Claude Code, Cursor, etc.
```

Restart your editor. The 46 MCP tools (`orchestrate`, `consensus_vote`, `research_synthesize`, `verify_audit_chain`, …) become available to whatever agent you're already using.

#### What `setup` configures

By default, `setup` writes/updates up to seven things in your environment. Each can be skipped with the corresponding `--skip-*` flag if you don't want it.

| Configured                       | Where written                                        | Opt-out flag      |
| -------------------------------- | ---------------------------------------------------- | ----------------- |
| MCP server registration (Claude) | `~/.claude/mcp.json` / Claude Desktop config         | `--skip-mcp`      |
| Project rules                    | `.cursor/rules/` and/or `.claude/rules/`             | `--skip-rules`    |
| Session hooks                    | `~/.claude/hooks/` (session-start / pre-tool / etc.) | `--skip-hooks`    |
| OpenCode MCP config              | `~/.config/opencode/opencode.json`                   | `--skip-opencode` |
| Gemini MCP config                | `~/.gemini/mcp.json`                                 | `--skip-gemini`   |
| Codex MCP config                 | `~/.codex/config.toml`                               | `--skip-codex`    |
| Project config file              | `./nexus-agents.yaml`                                | `--skip-config`   |

Run with `--interactive` (the default) for a per-step confirm flow, or `--no-interactive` to accept all defaults.

### 5. Standalone usage (no editor required)

```bash
export ANTHROPIC_API_KEY=your-key
nexus-agents orchestrate "Explain the architecture of this codebase"
```

> **Security:** In default MCP mode, the server communicates only via stdio with the parent process (no network exposure). The REST API (opt-in) auto-generates an API key on first start. For network-exposed deployments, set `NEXUS_AUTH_ENABLED=true`. See [SECURITY.md](./docs/architecture/SECURITY.md).

---

## Capabilities

| Category                       | Details                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Adversarial PR Review**      | `pr_review` MCP tool: 5 voter roles (architect, security, devex, catfish, scope_steward) with 4-point gate. v5 evaluation (focused synthetic dataset, n=10): 100% bug-catch, 50% raw FP rate; manual triage reclassified one of two inspected FP cases as a real finding (directional small-n, not measured rates) ([details](docs/research/pr-review-experiment-results-v5.md)) |
| **Consensus Voting**           | 6 strategies: simple_majority, supermajority, unanimous, higher_order (Bayesian correlation-aware), opinion_wise, proof_of_learning                                                                                                                                                                                                                                              |
| **Drift-Detected Charter**     | `CLAUDE.md` + `inject-governance.ts check` enforces single-source registries (model registry, MCP tools, expert types). Blocking CI gate fails build on drift                                                                                                                                                                                                                    |
| **Audit Trail**                | Structured logging for every tool call, voter decision, and routing choice. Tamper-evident hash-chained append-only storage (tamper-evident, not tamper-proof — see [threat model](docs/security/audit-hash-chain-threat-model.md)); integrity verifiable via `verify_audit_chain` MCP tool                                                                                      |
| **Closed-Loop Telemetry**      | `OutcomeStore` feeds LinUCB + TOPSIS scoring; a second bounded, audited self-tuning loop demotes unhealthy CLIs (capped, auto-decaying, on by default, opt-out `NEXUS_TUNE_ENFORCE=false`)                                                                                                                                                                                       |
| **Security Pipeline**          | Sandboxing (Docker/policy), trust-tiered input handling, SARIF parsing, red-team patterns, ClawGuard access policies (audit/enforce)                                                                                                                                                                                                                                             |
| **Multi-Expert Orchestration** | 12 built-in expert types coordinated by Orchestrator. Roles bind prompt + tools + memory                                                                                                                                                                                                                                                                                         |
| **Development Pipeline**       | Research → Plan → Vote → Decompose → Implement → QA → Security. Three modes: autonomous, harness (caller implements), dry-run                                                                                                                                                                                                                                                    |
| **Memory & Learning**          | 5 user-facing backends (session, belief, agentic, adaptive, typed). Cross-session persistence feeds routing decisions                                                                                                                                                                                                                                                            |
| **Research System**            | 9 discovery sources (arXiv, GitHub, Semantic Scholar, etc). Auto-catalog, quality scoring, synthesis into topic clusters                                                                                                                                                                                                                                                         |
| **Graph Workflows**            | DAG-based workflow execution with checkpoint/resume, state reduction, and event hooks                                                                                                                                                                                                                                                                                            |
| **46 MCP Tools**               | Agent management, workflow execution, research, memory, codebase intelligence, repo analysis, consensus, operations                                                                                                                                                                                                                                                              |

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

When running as an MCP server, the following tools are available. **Start with `run`** — the default entry point: give it a goal and the MetaOrchestrator picks (and, with `execute: true`, runs) the right strategy. The other pipeline tools are advanced force-strategy paths for pinning a specific one.

<!-- Auto-generated below — do not hand-edit between markers. Run `pnpm governance:inject` to update from `packages/nexus-agents/src/mcp/tools/index.ts`. See #2269. -->

<!-- GOVERNANCE:README_TOOLS:START -->

| Tool                          | Description                                                                                                                                                                                                              |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `orchestrate`                 | Task orchestration with Orchestrator coordination                                                                                                                                                                        |
| `create_expert`               | Create a specialized expert agent                                                                                                                                                                                        |
| `execute_expert`              | Run a task through a previously-created expert (by expertId)                                                                                                                                                             |
| `run_workflow`                | Run a linear workflow template (use `run_graph_workflow` for DAGs)                                                                                                                                                       |
| `delegate_to_model`           | Pick the best-fit existing model for a task (no registry change)                                                                                                                                                         |
| `list_experts`                | Inventory of expert ROLES for `create_expert`                                                                                                                                                                            |
| `list_workflows`              | Inventory of multi-step TEMPLATES for `run_workflow`                                                                                                                                                                     |
| `consensus_vote`              | Multi-model consensus voting on proposals                                                                                                                                                                                |
| `research_query`              | Query research registry (status, overlap, stats, search)                                                                                                                                                                 |
| `research_add`                | Add an arXiv PAPER to the registry (for non-paper sources use `research_add_source`)                                                                                                                                     |
| `research_add_source`         | Add a NON-PAPER source (repo/tool/blog) — for arXiv papers use `research_add`                                                                                                                                            |
| `research_discover`           | Discover papers/repos from external sources                                                                                                                                                                              |
| `research_analyze`            | Analyze registry for gaps, trends, coverage                                                                                                                                                                              |
| `research_catalog_review`     | Review auto-cataloged research references                                                                                                                                                                                |
| `research_synthesize`         | Synthesize registry into topic clusters with themes                                                                                                                                                                      |
| `survey_oss_landscape`        | Transient OSS project search (license, stars, last-commit) via GitHub                                                                                                                                                    |
| `vendor_publishing_audit`     | Look up a vendor's signing infrastructure (GPG keys, URL patterns, signature shape)                                                                                                                                      |
| `compare_data_feeds`          | Diff two YAML/JSON feeds: coverage + per-field axes                                                                                                                                                                      |
| `memory_query`                | Query across all memory backends                                                                                                                                                                                         |
| `memory_stats`                | Memory system statistics dashboard                                                                                                                                                                                       |
| `memory_write`                | Write to typed memory backends                                                                                                                                                                                           |
| `weather_report`              | Multi-CLI performance weather report                                                                                                                                                                                     |
| `issue_triage`                | Triage GitHub issues with trust classification                                                                                                                                                                           |
| `run_graph_workflow`          | Run a DAG workflow with per-node checkpoints + audit trail (linear → `run_workflow`)                                                                                                                                     |
| `execute_spec`                | Execute AI software factory spec pipeline                                                                                                                                                                                |
| `registry_import`             | Draft YAML for a NEW model entry (for picking existing models use `delegate_to_model`)                                                                                                                                   |
| `query_trace`                 | Query execution traces for observability                                                                                                                                                                                 |
| `query_task_state`            | Query the structured task-state log for a task ID                                                                                                                                                                        |
| `get_job_result`              | Read result of an async-mode dispatch by jobId (#3042 / #2631)                                                                                                                                                           |
| `list_jobs`                   | List async-mode jobs across all tools — cross-session discovery (#3046 / #2631)                                                                                                                                          |
| `cancel_job`                  | Mark an async-mode job as cancelled — idempotent (#3042 Stage 1b)                                                                                                                                                        |
| `ci_health_check`             | CI infrastructure health — composes GitHub status + recent-runs activity (#3076)                                                                                                                                         |
| `verify_audit_chain`          | Verify hash chain of a FileAuditStorage audit log directory                                                                                                                                                              |
| `repo_analyze`                | Analyze GitHub repository structure                                                                                                                                                                                      |
| `repo_security_plan`          | Generate security scanning pipeline for a repo                                                                                                                                                                           |
| `extract_symbols`             | TypeScript-compiler-API AST symbols from a SINGLE file (functions/classes/types)                                                                                                                                         |
| `search_codebase`             | Cross-file search over declared symbol NAMES (declarations only, not usages)                                                                                                                                             |
| `run_dev_pipeline`            | Full dev pipeline: research, plan, vote, implement, QA                                                                                                                                                                   |
| `run_pipeline`                | Execute a pipeline plugin by name with typed input                                                                                                                                                                       |
| `pr_review`                   | Multi-voter PR review with verification gate (experimental)                                                                                                                                                              |
| `supply_chain_tradeoff_panel` | Per-axis tradeoff vote for build-vs-buy / supply-chain decisions                                                                                                                                                         |
| `improvement_review`          | Threshold-gated observability loop — surfaces routing/tech-debt/bug/security signals from outcome+fitness data; files candidate issues                                                                                   |
| `run_quality_gate`            | Run the QA quality gate (typecheck/lint/tests/build/security) over a project dir; returns structured pass/fail verdict + feedback                                                                                        |
| `suggest_research_tasks`      | SUGGEST-ONLY: candidate pipeline tasks from research_discover findings for review — files/executes nothing (#1715)                                                                                                       |
| `list_available_models`       | Probe all model-discovery transports (OpenRouter API + opencode/claude/codex/gemini CLIs) and report per-transport health — validates the CLIs/APIs are reachable (#3406)                                                |
| `run`                         | Default entry point — give a goal, MetaOrchestrator picks the strategy; returns the routing decision (execute:false, read-only) or runs it inline (execute:true; dev-pipeline+pipeline+research+consensus wired) (#3548) |

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
git clone https://github.com/nexus-substrate/nexus-agents.git
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
