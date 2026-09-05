---
title: 'Nexus Agents Documentation Index'
description: Canonical documentation index — single source of truth for all nexus-agents documentation, organized around the control-plane model
tier: 1
keywords: [documentation, index, reference, navigation, docs, control-plane, mape-k]
---

# Nexus Agents Documentation

**Canonical Documentation Index** | Last Updated: 2026-06-17 (the skills under `skills/`, 47 MCP tools, 12 expert types, 11 workflow templates)

This is the **single source of truth** for all nexus-agents documentation. All documentation must be indexed here to be considered valid.

Nexus-agents is an **autonomic control plane for AI coding agents**. This index is organized around that model: docs are grouped by the **control-plane role** they describe — scheduler, admission control, event log, data plane — and by the **MAPE-K self-\* loop** they implement, rather than as a flat catalog. If you know which part of the control plane you care about, you can find its docs directly. See the [root README](../README.md) for the framing and [ADR-0017](./adr/0017-authority-ladder.md) for the authority model the loops are bounded by.

---

## Quick Start by Role

| Role            | Start Here                                         | Then Read                                           |
| --------------- | -------------------------------------------------- | --------------------------------------------------- |
| **New User**    | [Your First Task](./getting-started/FIRST_TASK.md) | [Installation](./getting-started/INSTALLATION.md)   |
| **Contributor** | [Contributing](../CONTRIBUTING.md)                 | [Development Guide](./development/README.md)        |
| **Operator**    | [ENTRYPOINTS.md](./ENTRYPOINTS.md)                 | [Configuration](./getting-started/CONFIGURATION.md) |

> **AI agents working in this repo** (Claude Code, Cursor, etc.) — see [CLAUDE.md](../CLAUDE.md) for project instructions, governance protocols, and canonical paths. CLAUDE.md is the rule book the agents follow, not a user-facing surface.

---

## The Control-Plane Map

The docs below are grouped by where they sit in the control plane. Each classic control-plane role maps to a shipped component (see the [root README's control-plane mapping](../README.md)); the docs that describe each role are gathered under it.

| Control-plane role      | What it is                                                               | Jump to                                           |
| ----------------------- | ------------------------------------------------------------------------ | ------------------------------------------------- |
| **Entry point**         | One door in — install, verify, first task, the CLI/MCP/REST surfaces     | [§ Entry Point](#entry-point--getting-in)         |
| **Scheduler**           | `run` / MetaOrchestrator picks and routes the right strategy             | [§ Scheduler](#scheduler--routing--orchestration) |
| **Admission control**   | Gates — adversarial review, consensus, quality gates — decide what ships | [§ Admission Control](#admission-control--gates)  |
| **Event log**           | Tamper-evident hash-chained audit of every decision                      | [§ Event Log](#event-log--audit--observability)   |
| **Data plane**          | The engineering CLIs that do the file edits, tests, PRs                  | [§ Data Plane](#data-plane--agents--execution)    |
| **Self-\* loops**       | MAPE-K self-configuring / healing / optimizing / protecting              | [§ Self-\* Loops](#self--loops-mape-k)            |
| **Governance**          | Authority ladder, claims registry, the rules behind the loops            | [§ Governance](#governance--authority)            |
| **Build & operate**     | Contributor guides, ops runbooks, distribution                           | [§ Build & Operate](#build--operate)              |
| **Reference & history** | Interfaces, generated references, research, ADRs, archive                | [§ Reference & History](#reference--history)      |

---

## Pipeline Terminology

The word "pipeline" gets used for several distinct things. This table disambiguates the namespace — read it once and the rest of the docs are unambiguous:

| Term                            | What it is                                                                                                                                    | Example entry point(s)                                                                                   |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **Research loop**               | Deliberately gather and synthesize evidence before deciding. Discovers papers/repos, clusters findings, surfaces them into planning context.  | `research_discover`, `research_synthesize`, `research_query`                                             |
| **Consensus loop**              | A multi-agent vote on a proposal/plan (approve/reject with a quorum + strategy). Used as a gate, not a producer.                              | `consensus_vote` · `createConsensusEngine`                                                               |
| **Dev pipeline**                | The batteries-included build flow: research → plan → **vote** → decompose → implement → QA → security. The common path for "build feature X". | `run_dev_pipeline` · `run_pipeline`                                                                      |
| **Workflow template**           | A reusable, declarative (YAML) sequence of stages you can run by name — a saved pipeline shape.                                               | `run_workflow` · `list_workflows` ([WORKFLOW_TEMPLATES](./guides/WORKFLOW_TEMPLATES.md))                 |
| **Composition / orchestration** | Wiring the orthogonal primitives (spec→graph→execute, `GraphBuilder`, consensus) into a **custom** pipeline beyond the built-ins.             | `orchestrate`, `execute_spec`, `GraphBuilder` ([COMPOSITION_PATTERNS](./guides/COMPOSITION_PATTERNS.md)) |

**Mental model:** a _dev pipeline_ and _workflow templates_ are pre-built pipelines you run; _composition_ is how you build a new one from the _research loop_, _consensus loop_, and graph primitives. When a doc says "the full pipeline" (e.g. in CLAUDE.md's working mode) it means the agent's research→vote→plan→implement decision sequence — the same shape as the dev pipeline, applied to its own work.

---

## Documentation Structure

```
docs/
├── README.md              # THIS FILE - Canonical index (control-plane organized)
├── getting-started/       # Entry point: installation and configuration
├── architecture/          # System design — scheduler, gates, event log, data plane
├── development/           # Build & operate: contributor guides
├── governance/            # Authority ladder, loop promotion criteria
├── security/              # Self-protecting: trust tiers, audit threat model
├── research/              # Research loop tracking
├── adr/                   # Architecture Decision Records
├── guides/                # How-to guides
├── interfaces/            # Interface specifications
├── ops/                   # Operational runbooks
├── reference/             # Generated CLI/MCP/strategy references
└── workflows/             # Workflow documentation
```

---

## Tier 1: Essential (Always Current)

These documents define the system and must be kept up-to-date:

| Document                  | Location                                           | Description                              |
| ------------------------- | -------------------------------------------------- | ---------------------------------------- |
| **Project Instructions**  | [CLAUDE.md](../CLAUDE.md)                          | Agent behavior, protocols, governance    |
| **Your First Task**       | [FIRST_TASK.md](./getting-started/FIRST_TASK.md)   | 5-minute first task (canonical entry)    |
| **README**                | [README.md](../README.md)                          | Project overview (control-plane framing) |
| **Architecture Overview** | [architecture/README.md](./architecture/README.md) | System design hub                        |
| **Development Guide**     | [development/README.md](./development/README.md)   | Contributor hub                          |
| **API Reference**         | [ENTRYPOINTS.md](./ENTRYPOINTS.md)                 | CLI, MCP, REST, API docs                 |
| **Troubleshooting**       | [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)         | Common issues, FAQ                       |

---

## Entry Point — Getting In

One door in: install, verify, run your first task, then learn the full surface (CLI / MCP / REST). This is the `run` scheduler's front door.

| Document                                                                           | Description                                                                  | Status    |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | --------- |
| [FIRST_TASK.md](./getting-started/FIRST_TASK.md)                                   | **Start here.** Install → verify → real vote → editor wiring (~5 min)        | Canonical |
| [COMPOSE_YOUR_FIRST_PIPELINE.md](./getting-started/COMPOSE_YOUR_FIRST_PIPELINE.md) | Next step: chain MCP tools (research → vote → build) toward a goal (~15 min) | Canonical |
| [INSTALLATION.md](./getting-started/INSTALLATION.md)                               | Platform installation deep-dive                                              | Canonical |
| [CONFIGURATION.md](./getting-started/CONFIGURATION.md)                             | YAML and env configuration                                                   | Canonical |
| [PLUGIN_INSTALL.md](./getting-started/PLUGIN_INSTALL.md)                           | Install nexus-agents as a Claude Code plugin                                 | Canonical |
| [SANDBOXED-USAGE.md](./guides/SANDBOXED-USAGE.md)                                  | Docker / restricted-FS / team-distribution flows                             | Canonical |
| [ENTRYPOINTS.md](./ENTRYPOINTS.md)                                                 | The full CLI / MCP / REST entry-point reference                              | Canonical |

---

## Scheduler — Routing & Orchestration

The scheduler is `run` / MetaOrchestrator: one entry point picks (and optionally runs) the right strategy for a goal. These docs describe how strategies are selected, routed across CLIs, and composed into pipelines.

| Document                                                                          | Description                    | Status    |
| --------------------------------------------------------------------------------- | ------------------------------ | --------- |
| [AGENT_SYSTEM.md](./architecture/AGENT_SYSTEM.md)                                 | Agent framework design         | Canonical |
| [ROUTING_SYSTEM.md](./architecture/ROUTING_SYSTEM.md)                             | Model routing pipeline         | Canonical |
| [CONTEXT_LOAD_BALANCING.md](./architecture/CONTEXT_LOAD_BALANCING.md)             | Claude/Gemini/Codex routing    | Canonical |
| [ORCHESTRATOR_WORKFLOW_ENGINE.md](./architecture/ORCHESTRATOR_WORKFLOW_ENGINE.md) | Orchestrator vs WorkflowEngine | Canonical |
| [ICTM_PATTERN.md](./architecture/ICTM_PATTERN.md)                                 | Dynamic sub-agent creation     | Canonical |
| [MULTI_REPO_ORCHESTRATION.md](./architecture/MULTI_REPO_ORCHESTRATION.md)         | Cross-repo task coordination   | Canonical |
| [MEMORY_SYSTEM.md](./architecture/MEMORY_SYSTEM.md)                               | 7-type memory architecture     | Canonical |

**How-to (composing & routing):**

| Document                                                    | Description                                                            |
| ----------------------------------------------------------- | ---------------------------------------------------------------------- |
| [COMPOSITION_PATTERNS.md](./guides/COMPOSITION_PATTERNS.md) | Compose spec pipeline + GraphBuilder + consensus into custom pipelines |
| [WORKFLOW_TEMPLATES.md](./guides/WORKFLOW_TEMPLATES.md)     | Creating YAML workflows                                                |
| [RULE_PRECEDENCE.md](./guides/RULE_PRECEDENCE.md)           | Per-adapter rule-loading precedence (Claude/Codex/Gemini/OpenCode)     |

---

## Admission Control — Gates

Nothing ships without passing a gate. Adversarial PR review, multi-voter consensus, and quality gates decide what is allowed through. These are the loops that sit at `advisory`/`enforce` on the [authority ladder](./adr/0017-authority-ladder.md).

| Document                                                        | Description            | Status    |
| --------------------------------------------------------------- | ---------------------- | --------- |
| [CONSENSUS_PROTOCOLS.md](./architecture/CONSENSUS_PROTOCOLS.md) | 5 consensus algorithms | Canonical |

**How-to (running gates):**

| Document                                          | Description                                               |
| ------------------------------------------------- | --------------------------------------------------------- |
| [PR_REVIEW_LOCAL.md](./guides/PR_REVIEW_LOCAL.md) | Run pr_review on your machine using subscription CLI auth |

**Evidence (gate evaluations):**

| Document                                                                            | Description                                                                                    | Status    |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | --------- |
| [pr-review-experiment-results.md](./research/pr-review-experiment-results.md)       | pr_review #2233 baseline experiment results                                                    | Canonical |
| [pr-review-experiment-results-v5.md](./research/pr-review-experiment-results-v5.md) | pr_review v5 — JSON-native findings; 100% bug-catch + caught a real bug                        | Canonical |
| [pr-review-experiment-results-v6.md](./research/pr-review-experiment-results-v6.md) | pr_review v6 eval batch runner (#4311) — results doc is a PENDING placeholder until a live run | Canonical |
| [pr-review-eval-labeling-rubric.md](./research/pr-review-eval-labeling-rubric.md)   | pr_review eval labeling rubric v1 + v5 re-adjudication (#3846)                                 | Canonical |
| [pr-review-dataset-curation.md](./research/pr-review-dataset-curation.md)           | pr_review eval dataset curation pipeline + n≥50 assessment (#3847)                             | Canonical |
| [pr-review-eval-curation.md](./research/pr-review-eval-curation.md)                 | pr_review eval candidate-mining curation pipeline (#3847)                                      | Canonical |

---

## Event Log — Audit & Observability

Append-only, tamper-evident record of every decision, plus the observability surfaces that monitor the running system (the **Monitor** arm of MAPE-K).

| Document                                                                     | Description                           | Status    |
| ---------------------------------------------------------------------------- | ------------------------------------- | --------- |
| [EVENT_BUS_BOUNDARIES.md](./architecture/EVENT_BUS_BOUNDARIES.md)            | Observability vs messaging bus        | Canonical |
| [audit-hash-chain-threat-model](./security/audit-hash-chain-threat-model.md) | Threat model for the audit hash chain | Canonical |

**How-to (observability):**

| Document                                                          | Description                                     |
| ----------------------------------------------------------------- | ----------------------------------------------- |
| [DEBUGGING_OBSERVABILITY.md](./guides/DEBUGGING_OBSERVABILITY.md) | Debug logging, tracing                          |
| [Claude Code Observability](./guides/claude-code-observability/)  | Hooks, status line, MCP logging for Claude Code |

**Observability design:**

| Document                                                                      | Description                  | Status    |
| ----------------------------------------------------------------------------- | ---------------------------- | --------- |
| [EXECUTION_DASHBOARD_DESIGN.md](./architecture/EXECUTION_DASHBOARD_DESIGN.md) | Dashboard design             | Canonical |
| [SWARM_OBSERVER_DESIGN.md](./architecture/SWARM_OBSERVER_DESIGN.md)           | OrchestrationObserver design | Canonical |

---

## Data Plane — Agents & Execution

The data plane is the engineering CLIs (Claude Code, Codex, Gemini, OpenCode) that do the actual file edits, tests, and PRs — and the harness/federation machinery that wires nexus-agents to them.

| Document                                                        | Description                   | Status    |
| --------------------------------------------------------------- | ----------------------------- | --------- |
| [MCP_PROTOCOL.md](./architecture/MCP_PROTOCOL.md)               | MCP integration details       | Canonical |
| [AGENT_COMPATIBILITY.md](./architecture/AGENT_COMPATIBILITY.md) | Per-harness federation matrix | Canonical |
| [SWE_BENCH_HARNESS.md](./architecture/SWE_BENCH_HARNESS.md)     | SWE-Bench integration         | Canonical |

**How-to (wiring agents & providers):**

| Document                                                            | Description                                                                                                  |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| [MCP_INTEGRATION.md](./guides/MCP_INTEGRATION.md)                   | MCP server configuration                                                                                     |
| [HARNESS_COMPATIBILITY.md](./guides/HARNESS_COMPATIBILITY.md)       | Wire nexus-agents from OpenCode/Codex/Cursor/Aider/Cline                                                     |
| [CUSTOM_ENDPOINT_SETUP.md](./guides/CUSTOM_ENDPOINT_SETUP.md)       | Custom OpenAI-compatible gateway (direct SDK + OpenCode paths)                                               |
| [CLOUD_PROVIDERS.md](./guides/CLOUD_PROVIDERS.md)                   | Bedrock/Vertex/Azure via OpenRouter / LiteLLM / custom-gateway                                               |
| [MODEL_REGISTRY_PRICING.md](./guides/MODEL_REGISTRY_PRICING.md)     | Decorated gateway model names → canonical pricing; manifest aliases; UNMEASURED cost semantics               |
| [PARALLEL_AGENT_WORKTREES.md](./guides/PARALLEL_AGENT_WORKTREES.md) | Safe parallel agents via `isolation: "worktree"` + the empirical WorktreeCreate/WorktreeRemove hook contract |

---

## Self-\* Loops (MAPE-K)

The autonomic loops. Each maps to a shipped mechanism and sits at a declared rung of the [authority ladder (ADR-0017)](./adr/0017-authority-ladder.md): self-configuring (setup/doctor), self-healing (circuit-breaker demotion), self-optimizing (LinUCB/TOPSIS), self-protecting (trust tiers / ClawGuard / sandbox).

### Self-configuring & self-optimizing

| Document                                            | Description                                   | Status    |
| --------------------------------------------------- | --------------------------------------------- | --------- |
| [MEMORY_SYSTEM.md](./architecture/MEMORY_SYSTEM.md) | 7-type memory architecture (shared Knowledge) | Canonical |

### Self-protecting (security)

| Document                                                                    | Description                    | Status    |
| --------------------------------------------------------------------------- | ------------------------------ | --------- |
| [SECURITY.md](./architecture/SECURITY.md)                                   | Security model, sandboxing     | Canonical |
| [UNTRUSTED_INPUT_HARDENING.md](./architecture/UNTRUSTED_INPUT_HARDENING.md) | Input trust & sanitization     | Canonical |
| [SOFTWARE_FACTORY_REPORT.md](./architecture/SOFTWARE_FACTORY_REPORT.md)     | Factory hardening review       | Canonical |
| [security/API_KEY_BOUNDARIES.md](./security/API_KEY_BOUNDARIES.md)          | API key boundary documentation | Canonical |
| [SECRETS_SETUP.md](./SECRETS_SETUP.md)                                      | Secrets configuration          | Canonical |

> **Note:** rows in the self-\* loops are not equally autonomous. Where each loop sits on the ladder (`observe → suggest → advisory → enforce`) and how it earns promotion is governed by [ADR-0017](./adr/0017-authority-ladder.md) and the [loop promotion criteria](./governance/loop-promotion-criteria.md) under [§ Governance](#governance--authority).

---

## Governance & Authority

The rules that bound the loops: the authority ladder, claims-drift detection, and the runbooks that keep capability changes ratified and audited rather than autonomous.

| Document                                                                         | Description                                                              | Status    |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | --------- |
| [adr/0017-authority-ladder.md](./adr/0017-authority-ladder.md)                   | Four-tier earned-autonomy model (observe → suggest → advisory → enforce) | Accepted  |
| [governance/loop-promotion-criteria.md](./governance/loop-promotion-criteria.md) | Per-loop authority-ladder promotion/demotion criteria (ADR-0017, #3844)  | Canonical |
| [governance/tool-removal-runbook.md](./governance/tool-removal-runbook.md)       | Tool removal/consolidation: ratified, audited, never autonomous (#3853)  | Canonical |
| [CLAIMS_REGISTRY.md](./development/CLAIMS_REGISTRY.md)                           | Add/verify claims, drift gate                                            | Canonical |

---

## Build & Operate

For contributors building on the control plane and operators running it.

### Development (contributor guides)

| Document                                                                       | Description                     | Status    |
| ------------------------------------------------------------------------------ | ------------------------------- | --------- |
| [AGENT_DEVELOPMENT.md](./development/AGENT_DEVELOPMENT.md)                     | Building new agents             | Canonical |
| [TOOL_DEVELOPMENT.md](./development/TOOL_DEVELOPMENT.md)                       | Adding MCP tools                | Canonical |
| [MEMORY_DEVELOPMENT.md](./development/MEMORY_DEVELOPMENT.md)                   | Memory system extensions        | Canonical |
| [CLI_DELEGATION_GUIDE.md](./development/CLI_DELEGATION_GUIDE.md)               | CLI adapter patterns            | Canonical |
| [CONTRIBUTION_GUIDE.md](./development/CONTRIBUTION_GUIDE.md)                   | PR workflow, git conventions    | Canonical |
| [SHELL_TESTING_ANTI_PATTERNS.md](./development/SHELL_TESTING_ANTI_PATTERNS.md) | Shell testing pitfalls to avoid | Canonical |
| [PACKAGED_VS_REPO_ONLY.md](./development/PACKAGED_VS_REPO_ONLY.md)             | What ships to npm vs repo-only  | Canonical |
| [CLI_UX_QUALITY_GATE.md](./development/CLI_UX_QUALITY_GATE.md)                 | CLI UX pre-release checklist    | Canonical |

### Operations & runbooks

| Document                                                           | Description                        | Status    |
| ------------------------------------------------------------------ | ---------------------------------- | --------- |
| [docops-spec.md](./ops/docops-spec.md)                             | Canonical DocOps pipeline spec     | Canonical |
| [docops-manifest.json](./ops/docops-manifest.json)                 | DocOps enforcement manifest        | Canonical |
| [docs-inventory.md](./ops/docs-inventory.md)                       | Documentation inventory            | Canonical |
| [release-changeset-race.md](./ops/release-changeset-race.md)       | Publish-race runbook (#2382)       | Canonical |
| [tmpfs-exhaustion.md](./ops/tmpfs-exhaustion.md)                   | Scratch-exhaustion runbook (#4488) | Canonical |
| [git-housekeeping.md](./ops/git-housekeeping.md)                   | Git GC cleanup runbook (#3062)     | Canonical |
| [governed-decision-cost.md](./ops/governed-decision-cost.md)       | Governed-decision cost (#3857)     | Canonical |
| [e2e-validation-2026-08-23.md](./ops/e2e-validation-2026-08-23.md) | E2E validation run, 2026-08-23     | Canonical |
| [e2e-validation-2026-08-25.md](./ops/e2e-validation-2026-08-25.md) | E2E validation run, 2026-08-25     | Canonical |
| [e2e-validation-2026-08-21.md](./ops/e2e-validation-2026-08-21.md) | E2E validation run, 2026-08-21     | Canonical |

### CI gates & coverage

| Document                                                              | Description                   | Status    |
| --------------------------------------------------------------------- | ----------------------------- | --------- |
| [REGISTRY_COVERAGE.md](./architecture/REGISTRY_COVERAGE.md)           | Wiring-completeness CI gate   | Canonical |
| [SCHEMA_FANOUT_COVERAGE.md](./architecture/SCHEMA_FANOUT_COVERAGE.md) | Schema-fan-out CI check       | Canonical |
| [IMPORT_GRAPH_ORPHANS.md](./architecture/IMPORT_GRAPH_ORPHANS.md)     | Import-graph orphan detection | Canonical |

### Distribution

| Document                                                                     | Description                                 |
| ---------------------------------------------------------------------------- | ------------------------------------------- |
| [distribution/LISTING_SUBMISSIONS.md](./distribution/LISTING_SUBMISSIONS.md) | MCP registry & directory submission tracker |
| [distribution/PUBLISHING_GUIDE.md](./distribution/PUBLISHING_GUIDE.md)       | Step-by-step publishing commands            |

---

## Reference & History

Interface specs, generated references, the research loop's catalog, ADRs, and historical/archived material.

### Interfaces

| Document                                              | Description                 |
| ----------------------------------------------------- | --------------------------- |
| [README.md](./interfaces/README.md)                   | Interface documentation hub |
| [agent.md](./interfaces/agent.md)                     | Agent interface spec        |
| [model-adapter.md](./interfaces/model-adapter.md)     | Model adapter spec          |
| [orchestrator.md](./interfaces/orchestrator.md)       | Orchestrator interface spec |
| [tool.md](./interfaces/tool.md)                       | Tool interface spec         |
| [workflow-engine.md](./interfaces/workflow-engine.md) | Workflow engine spec        |

### Generated references

> Owned by the docs-site single-sourcing epics (#3532/#3688/#3763): these pages are emitted by their generators and live where the generators write them. This IA pass indexes them but does not own their bodies.

| Document                                                  | Description                                                                    | Status    |
| --------------------------------------------------------- | ------------------------------------------------------------------------------ | --------- |
| [capabilities.md](./reference/capabilities.md)            | CLI/MCP/Workflow capability index                                              | Generated |
| [MCP tool reference](./reference/tools/index.md)          | Per-tool MCP reference (name, description, input schema)                       | Generated |
| [Strategy reference](./reference/strategies/index.md)     | Force-strategy escape hatches: entrypoint tool, when-to-force, tiers, executor | Generated |
| [skills-index.md](./skills-index.md)                      | LLM context loading index                                                      | Canonical |
| [dependency-graph.md](./architecture/dependency-graph.md) | Module dependency diagram                                                      | Generated |
| [ARCHITECTURE_MAP.json](./design/ARCHITECTURE_MAP.json)   | Machine-readable component map                                                 | Generated |

### System maps & design

| Document                                                                        | Description                                 | Status    |
| ------------------------------------------------------------------------------- | ------------------------------------------- | --------- |
| [system-map.md](./architecture/system-map.md)                                   | System component map                        | Canonical |
| [invocation-matrix.md](./architecture/invocation-matrix.md)                     | Component invocation map                    | Canonical |
| [redundancy-analysis.md](./architecture/redundancy-analysis.md)                 | Code redundancy analysis                    | Canonical |
| [deprecation-pipeline.md](./architecture/deprecation-pipeline.md)               | Deprecation tracking & v3.0 migration guide | Canonical |
| [components.md](./design/components.md)                                         | Component inventory                         | Canonical |
| [interfaces.md](./design/interfaces.md)                                         | Key interfaces and contracts                | Canonical |
| [flows.md](./design/flows.md)                                                   | Dataflow traces                             | Canonical |
| [scaling-coordination-predictor.md](./design/scaling-coordination-predictor.md) | Scaling design                              | Canonical |

### Research loop

| Document                                                                    | Description                                                                | Status    |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------- | --------- |
| [RESEARCH_INDEX.md](./research/RESEARCH_INDEX.md)                           | Research tracking hub                                                      | Canonical |
| [CONTRIBUTING.md](./research/CONTRIBUTING.md)                               | Adding research                                                            | Canonical |
| [registry/papers.yaml](./research/registry/papers.yaml)                     | Paper metadata                                                             | Canonical |
| [registry/techniques.yaml](./research/registry/techniques.yaml)             | Implementation status                                                      | Canonical |
| [cli-first-adapter-strategy.md](./research/cli-first-adapter-strategy.md)   | CLI-first adapter research                                                 | Canonical |
| [mcp-tool-distinctness-v1.md](./research/mcp-tool-distinctness-v1.md)       | MCP tool-description pairwise similarity report (#2650)                    | Canonical |
| [fitness-stratified-v1.md](./research/fitness-stratified-v1.md)             | Stratified runtime-outcome report — per adapter / task-type / role (#2662) | Canonical |
| [defending-code-harness-eval.md](./research/defending-code-harness-eval.md) | Eval of Anthropic defending-code-reference-harness (#3574)                 | Canonical |
| [fork-session-spike.md](./research/fork-session-spike.md)                   | Spike: fork_session / branch-comparison on the graph builder (#2665)       | Canonical |

### Strategy & alignment

| Document                                       | Description                           | Status    |
| ---------------------------------------------- | ------------------------------------- | --------- |
| [ALIGNMENT_ROADMAP.md](./ALIGNMENT_ROADMAP.md) | Strategic alignment, north star, gaps | Canonical |

### Maintainer reference (ADRs, V2 architecture, design proposals)

<details>
<summary><strong>For maintainers — ADRs, V2 architecture artifacts, design proposals</strong> (expand if you're editing the codebase)</summary>

#### Architecture Decision Records (ADRs)

| ADR                                                      | Title                              | Status     |
| -------------------------------------------------------- | ---------------------------------- | ---------- |
| [0001](./adr/0001-adr-template.md)                       | ADR Template                       | Template   |
| [0002](./adr/0002-orchestrator-interface.md)             | Orchestrator Interface             | Accepted   |
| [0003](./adr/0003-quorum-validator.md)                   | Quorum Validator                   | Accepted   |
| [0004](./adr/0004-shared-task-analyzer.md)               | SharedTaskAnalyzer                 | Accepted   |
| [0005](./adr/0005-router-consolidation.md)               | Router Consolidation               | Accepted   |
| [0006](./adr/0006-determinism-providers.md)              | Determinism Providers              | Accepted   |
| [0007](./adr/0007-utility-consolidation.md)              | Utility Consolidation              | Accepted   |
| [0008](./adr/0008-routing-storage-unification.md)        | Routing Storage                    | Accepted   |
| [0009](./adr/0009-error-class-hierarchy.md)              | Error Class Hierarchy              | Accepted   |
| [0010](./adr/0010-memory-helpers-keep-separate.md)       | Memory Helpers Separation          | Superseded |
| [0011](./adr/0011-orchestrator-interface-defer.md)       | Orchestrator Interface Defer       | Superseded |
| [0012](./adr/0012-registry-api-unification.md)           | Registry API Unification           | Accepted   |
| [0013](./adr/0013-memory-helpers-consolidation.md)       | Memory Helpers Consolidation       | Accepted   |
| [0014](./adr/0014-orchestrator-interface-unification.md) | Orchestrator Interface Unification | Accepted   |
| [0015](./adr/0015-multi-repo-orchestration.md)           | Multi-Repo Orchestration           | Proposed   |
| [0016](./adr/0016-multi-round-consensus-voting.md)       | Multi-Round Consensus Voting       | Accepted   |
| [0017](./adr/0017-authority-ladder.md)                   | Authority Ladder                   | Accepted   |
| [0018](./adr/0018-org-scope-naming.md)                   | Org/Scope Naming                   | Accepted   |
| [0019](./adr/0019-governance-record-signing.md)          | Governance-Record Signing          | Accepted   |

#### Design Documents (archived V1)

| Document                                             | Description                     | Status   |
| ---------------------------------------------------- | ------------------------------- | -------- |
| [as-is.md](./archive/design-v2/as-is.md)             | Current system state assessment | Archived |
| [v2-proposal.md](./archive/design-v2/v2-proposal.md) | V2 pipeline OS architecture     | Archived |
| [gaps.md](./archive/design-v2/gaps.md)               | Intended vs actual gaps         | Archived |

#### V2 Rearchitecture (Pipeline OS)

| Document                                                                        | Description                             | Status   |
| ------------------------------------------------------------------------------- | --------------------------------------- | -------- |
| [04-v2-architecture-pipeline-os.md](./v2/04-v2-architecture-pipeline-os.md)     | **Final V2 specification**              | Approved |
| [00-executive-summary.md](./v2/00-executive-summary.md)                         | Executive summary                       | Approved |
| [01-as-is-architecture.md](./v2/01-as-is-architecture.md)                       | Current architecture analysis           | Approved |
| [02-system-goals-non-goals.md](./v2/02-system-goals-non-goals.md)               | Goals and non-goals                     | Approved |
| [03-user-story-user-journey.md](./v2/03-user-story-user-journey.md)             | User stories and journeys               | Approved |
| [05-plugin-system-spec.md](./v2/05-plugin-system-spec.md)                       | Plugin system specification             | Approved |
| [06-graph-execution-model.md](./v2/06-graph-execution-model.md)                 | Graph execution model                   | Approved |
| [07-policy-governance-gates.md](./v2/07-policy-governance-gates.md)             | Policy engine and governance gates      | Approved |
| [08-observability-eventing.md](./v2/08-observability-eventing.md)               | Event bus and observability             | Approved |
| [09-context-store-turn-dag-option.md](./v2/09-context-store-turn-dag-option.md) | Context store options                   | Approved |
| [10-migration-plan-v1-to-v2.md](./v2/10-migration-plan-v1-to-v2.md)             | Migration plan                          | Approved |
| [api-contracts.md](./v2/api-contracts.md)                                       | TypeScript API contracts                | Approved |
| [threat-model.md](./v2/threat-model.md)                                         | V2 threat model                         | Approved |
| [epics-and-issues.md](./v2/epics-and-issues.md)                                 | Work breakdown with acceptance criteria | Approved |
| [ADR-0001](./v2/adrs/ADR-0001-pipeline-os-plugins.md)                           | Pipeline OS as orchestration primitive  | Proposed |
| [ADR-0002](./v2/adrs/ADR-0002-unified-task-plan-artifact.md)                    | Unified TaskContract + PlanContract     | Proposed |
| [ADR-0003](./v2/adrs/ADR-0003-graph-execution-langgraph.md)                     | Extend GraphBuilder (LangGraph-aligned) | Proposed |
| [ADR-0004](./v2/adrs/ADR-0004-structural-plugin-flags.md)                       | Structural plugin flags                 | Proposed |
| [ADR-0005](./v2/adrs/ADR-0005-unified-adapter-boundary.md)                      | Unified adapter boundary                | Proposed |
| [ADR-0006](./v2/adrs/ADR-0006-observability-first-class.md)                     | Observability as first-class            | Proposed |

#### Proposals (archived)

| Document                                                                   | Description        | Status   |
| -------------------------------------------------------------------------- | ------------------ | -------- |
| [cli-pr-review-workflow.md](./archive/proposals/cli-pr-review-workflow.md) | PR review workflow | Archived |

</details>

### Workflows

| Document                                                                 | Description                                                  |
| ------------------------------------------------------------------------ | ------------------------------------------------------------ |
| [SELF_DEVELOPMENT_WORKFLOW.md](./workflows/SELF_DEVELOPMENT_WORKFLOW.md) | Historical pointer — engine deleted in #2402, see epic notes |

### Deprecated / Historical

Documents kept for historical reference only:

| Document                                                                       | Reason                                    | Replacement                                    |
| ------------------------------------------------------------------------------ | ----------------------------------------- | ---------------------------------------------- |
| [archive/system-reviews-2026-01.md](./archive/system-reviews-2026-01.md)       | Historical system review transcripts      | Current system reviews                         |
| [archive/REVIEW_2026-01-23.md](./archive/REVIEW_2026-01-23.md)                 | Archived system review                    | Current system reviews                         |
| [archive/SECURITY_AUDIT_2026-01-23.md](./archive/SECURITY_AUDIT_2026-01-23.md) | Archived security audit                   | Current security docs                          |
| [archive/consensus-vote-2026-01-17.md](./archive/consensus-vote-2026-01-17.md) | Archived consensus vote                   | Current consensus protocols                    |
| [archive/system-review-2026-05-31.md](./archive/system-review-2026-05-31.md)   | Full 13-domain system review (epic #3143) | [ALIGNMENT_ROADMAP.md](./ALIGNMENT_ROADMAP.md) |
| [archive/RESEARCH_PIPELINE.md](./archive/RESEARCH_PIPELINE.md)                 | Subsystem removed in #3492 (PR #3590)     | [ENTRYPOINTS.md](./ENTRYPOINTS.md)             |

**Previously Archived/Removed:**

- `PROJECT_PLAN.md`, plan docs — archived/removed
- `RESEARCH_SUMMARY.md` — content in [research/topics/agent-skills/](./research/topics/agent-skills/)
- `SECURITY_AUDIT_2026-01-23.md` — moved to [archive/](./archive/)
- Proposal docs (implemented) — removed after completion

---

## Root-Level Documents

Documents at repository root (for discoverability):

| Document                                      | Description          | Canonical Location |
| --------------------------------------------- | -------------------- | ------------------ |
| [CLAUDE.md](../CLAUDE.md)                     | Agent instructions   | Root (canonical)   |
| [README.md](../README.md)                     | Project overview     | Root (canonical)   |
| [QUICK_START.md](../QUICK_START.md)           | Getting started      | Root (canonical)   |
| [CONTRIBUTING.md](../CONTRIBUTING.md)         | Contribution guide   | Root (canonical)   |
| [CODING_STANDARDS.md](../CODING_STANDARDS.md) | Code standards       | Root (canonical)   |
| [ARCHITECTURE.md](../ARCHITECTURE.md)         | Architecture summary | Root (canonical)   |
| [SECURITY.md](../SECURITY.md)                 | Security policy      | Root (canonical)   |
| [CHANGELOG.md](../CHANGELOG.md)               | Version history      | Root (canonical)   |

---

## Machine-Parseable Index

There is no separate machine index. `docs/INDEX.yaml` was retired in #4810: it
covered 17 of 208 documents (~8%), carried a `Generated:` header for a generator
that was never built, and was skiplisted out of the Canonical Index Check that
gates this file. An 8% index offered for programmatic access is worse than none,
because the gap is invisible to the caller.

This README is the canonical index and is gated for completeness. For structured
access, parse it, or use `artifacts/repo-index.json` for the code graph.

---

## Governance Rules

1. **Canonical Index**: This file is the single documentation entry point
2. **Indexing Required**: New documentation must be added to this index
3. **No Parallel Indexes**: This is the only documentation index permitted
4. **Update on Change**: Update this index when any documentation changes
5. **Classification Required**: All docs must have a classification (Canonical/Supporting/Deprecated)

### Non-conflict with the docs-site epic (#3532)

This IA pass owns the **narrative-doc grouping** in this index — the control-plane sections above. It does **not** own the generated API/MCP/strategy reference pages (see [§ Generated references](#generated-references)), which are emitted by the docs-site single-sourcing generators (#3532/#3688/#3763) and live where those generators write them. The two are coordinated: this index links the generated pages by their canonical generator-emitted paths; the generators are free to regenerate those bodies without touching this index's structure.

---

## Files Not Indexed (Intentionally Excluded)

The following are excluded from this index:

- `.rules/` - Agent-specific configuration (loaded automatically)
- `.claude/skills/` - Agent skill definitions (loaded automatically)
- `coverage/` - Test coverage reports (generated)
- `node_modules/` - Dependencies
- `docs/api/` - Generated TypeDoc API reference (gitignored; produced by the website prebuild, rendered at `/api/`)

### Why three API pages are nested and sixteen are not

`docs/api/` holds sixteen flat pages plus `docs/api/exports/{pipeline,benchmarks,agents-ictm}.md`.
That asymmetry looks like an oversight and is not. Those three are the aggregate
`src/exports/*` barrels; each carries a slash-bearing `@module exports/<name>` tag, and
TypeDoc's `outputFileStrategy: "modules"` derives the output path from the module name.
The other sixteen carry no tag and fall back to the filename.

A 7-voter `higher_order` panel on [#4523](https://github.com/nexus-substrate/nexus-agents/issues/4523)
resolved to leave it that way: `/api/exports/pipeline` and its two siblings are published
URLs, and a published URL is a stable interface. Symmetry for its own sake is not worth
breaking three live links.

**Do not de-slash those `@module` tags.** `scripts/check-typedoc-layout.ts` runs in the
`typedoc-check` job of `.github/workflows/docs-check.yml`, immediately after generation,
and fails if any page moves in either direction — so this is enforced, not merely asserted.
If you genuinely intend to move a page, change `NESTED_MODULES` in that script in the same
commit and say why.

---

_This index follows the documentation governance defined in [CLAUDE.md](../CLAUDE.md)._
</content>
</invoke>
