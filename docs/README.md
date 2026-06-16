---
title: 'Nexus Agents Documentation Index'
description: Canonical documentation index — single source of truth for all nexus-agents documentation
tier: 1
keywords: [documentation, index, reference, navigation, docs]
---

# Nexus Agents Documentation

**Canonical Documentation Index** | Last Updated: 2026-05-30 (32 skills, 46 MCP tools, 12 expert types, 11 workflow templates)

This is the **single source of truth** for all nexus-agents documentation. All documentation must be indexed here to be considered valid.

---

## Quick Start by Role

| Role            | Start Here                                         | Then Read                                           |
| --------------- | -------------------------------------------------- | --------------------------------------------------- |
| **New User**    | [Your First Task](./getting-started/FIRST_TASK.md) | [Installation](./getting-started/INSTALLATION.md)   |
| **Contributor** | [Contributing](../CONTRIBUTING.md)                 | [Development Guide](./development/README.md)        |
| **Operator**    | [ENTRYPOINTS.md](./ENTRYPOINTS.md)                 | [Configuration](./getting-started/CONFIGURATION.md) |

> **AI agents working in this repo** (Claude Code, Cursor, etc.) — see [CLAUDE.md](../CLAUDE.md) for project instructions, governance protocols, and canonical paths. CLAUDE.md is the rule book the agents follow, not a user-facing surface.

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
├── README.md              # THIS FILE - Canonical index
├── INDEX.yaml             # Machine-parseable index
│
├── getting-started/       # Installation and configuration
├── architecture/          # System design documentation
├── development/           # Contributor guides
├── research/              # Research tracking
├── adr/                   # Architecture Decision Records
├── guides/                # How-to guides
├── interfaces/            # Interface specifications
├── proposals/             # Design proposals
├── plans/                 # Implementation plans
├── metrics/               # System metrics
└── workflows/             # Workflow documentation
```

---

## Canonical Documentation

### Tier 1: Essential (Always Current)

These documents define the system and must be kept up-to-date:

| Document                  | Location                                           | Description                           |
| ------------------------- | -------------------------------------------------- | ------------------------------------- |
| **Project Instructions**  | [CLAUDE.md](../CLAUDE.md)                          | Agent behavior, protocols, governance |
| **Your First Task**       | [FIRST_TASK.md](./getting-started/FIRST_TASK.md)   | 5-minute first task (canonical entry) |
| **README**                | [README.md](../README.md)                          | Project overview                      |
| **Architecture Overview** | [architecture/README.md](./architecture/README.md) | System design hub                     |
| **Development Guide**     | [development/README.md](./development/README.md)   | Contributor hub                       |
| **API Reference**         | [ENTRYPOINTS.md](./ENTRYPOINTS.md)                 | CLI, MCP, REST, API docs              |
| **Troubleshooting**       | [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)         | Common issues, FAQ                    |

### Tier 2: Reference (Regularly Updated)

Detailed technical documentation:

#### Getting Started

| Document                                                                           | Description                                                                  | Status    |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | --------- |
| [FIRST_TASK.md](./getting-started/FIRST_TASK.md)                                   | **Start here.** Install → verify → real vote → editor wiring (~5 min)        | Canonical |
| [COMPOSE_YOUR_FIRST_PIPELINE.md](./getting-started/COMPOSE_YOUR_FIRST_PIPELINE.md) | Next step: chain MCP tools (research → vote → build) toward a goal (~15 min) | Canonical |
| [INSTALLATION.md](./getting-started/INSTALLATION.md)                               | Platform installation deep-dive                                              | Canonical |
| [CONFIGURATION.md](./getting-started/CONFIGURATION.md)                             | YAML and env configuration                                                   | Canonical |
| [PLUGIN_INSTALL.md](./getting-started/PLUGIN_INSTALL.md)                           | Install nexus-agents as a Claude Code plugin                                 | Canonical |
| [SANDBOXED-USAGE.md](./guides/SANDBOXED-USAGE.md)                                  | Docker / restricted-FS / team-distribution flows                             | Canonical |

#### Architecture

| Document                                                                          | Description                    | Status    |
| --------------------------------------------------------------------------------- | ------------------------------ | --------- |
| [AGENT_SYSTEM.md](./architecture/AGENT_SYSTEM.md)                                 | Agent framework design         | Canonical |
| [MEMORY_SYSTEM.md](./architecture/MEMORY_SYSTEM.md)                               | 7-type memory architecture     | Canonical |
| [ROUTING_SYSTEM.md](./architecture/ROUTING_SYSTEM.md)                             | Model routing pipeline         | Canonical |
| [RESEARCH_PIPELINE.md](./architecture/RESEARCH_PIPELINE.md)                       | Research-to-project runner     | Canonical |
| [CONSENSUS_PROTOCOLS.md](./architecture/CONSENSUS_PROTOCOLS.md)                   | 5 consensus algorithms         | Canonical |
| [CONTEXT_LOAD_BALANCING.md](./architecture/CONTEXT_LOAD_BALANCING.md)             | Claude/Gemini/Codex routing    | Canonical |
| [SECURITY.md](./architecture/SECURITY.md)                                         | Security model, sandboxing     | Canonical |
| [MCP_PROTOCOL.md](./architecture/MCP_PROTOCOL.md)                                 | MCP integration details        | Canonical |
| [EVENT_BUS_BOUNDARIES.md](./architecture/EVENT_BUS_BOUNDARIES.md)                 | Observability vs messaging bus | Canonical |
| [ORCHESTRATOR_WORKFLOW_ENGINE.md](./architecture/ORCHESTRATOR_WORKFLOW_ENGINE.md) | Orchestrator vs WorkflowEngine | Canonical |
| [ICTM_PATTERN.md](./architecture/ICTM_PATTERN.md)                                 | Dynamic sub-agent creation     | Canonical |
| [UNTRUSTED_INPUT_HARDENING.md](./architecture/UNTRUSTED_INPUT_HARDENING.md)       | Input trust & sanitization     | Canonical |
| [SOFTWARE_FACTORY_REPORT.md](./architecture/SOFTWARE_FACTORY_REPORT.md)           | Factory hardening review       | Canonical |
| [MULTI_REPO_ORCHESTRATION.md](./architecture/MULTI_REPO_ORCHESTRATION.md)         | Cross-repo task coordination   | Canonical |
| [dependency-graph.md](./architecture/dependency-graph.md)                         | Module dependency diagram      | Generated |
| [REGISTRY_COVERAGE.md](./architecture/REGISTRY_COVERAGE.md)                       | Wiring-completeness CI gate    | Canonical |
| [SCHEMA_FANOUT_COVERAGE.md](./architecture/SCHEMA_FANOUT_COVERAGE.md)             | Schema-fan-out CI check        | Canonical |
| [IMPORT_GRAPH_ORPHANS.md](./architecture/IMPORT_GRAPH_ORPHANS.md)                 | Import-graph orphan detection  | Canonical |
| [AGENT_COMPATIBILITY.md](./architecture/AGENT_COMPATIBILITY.md)                   | Per-harness federation matrix  | Canonical |

#### Development

| Document                                                                       | Description                     | Status    |
| ------------------------------------------------------------------------------ | ------------------------------- | --------- |
| [AGENT_DEVELOPMENT.md](./development/AGENT_DEVELOPMENT.md)                     | Building new agents             | Canonical |
| [TOOL_DEVELOPMENT.md](./development/TOOL_DEVELOPMENT.md)                       | Adding MCP tools                | Canonical |
| [MEMORY_DEVELOPMENT.md](./development/MEMORY_DEVELOPMENT.md)                   | Memory system extensions        | Canonical |
| [CLI_DELEGATION_GUIDE.md](./development/CLI_DELEGATION_GUIDE.md)               | CLI adapter patterns            | Canonical |
| [CONTRIBUTION_GUIDE.md](./development/CONTRIBUTION_GUIDE.md)                   | PR workflow, git conventions    | Canonical |
| [SHELL_TESTING_ANTI_PATTERNS.md](./development/SHELL_TESTING_ANTI_PATTERNS.md) | Shell testing pitfalls to avoid | Canonical |
| [CLI_UX_QUALITY_GATE.md](./development/CLI_UX_QUALITY_GATE.md)                 | CLI UX pre-release checklist    | Canonical |
| [CLAIMS_REGISTRY.md](./development/CLAIMS_REGISTRY.md)                         | Add/verify claims, drift gate   | Canonical |

#### Research

| Document                                                                            | Description                                                                | Status    |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | --------- |
| [RESEARCH_INDEX.md](./research/RESEARCH_INDEX.md)                                   | Research tracking hub                                                      | Canonical |
| [CONTRIBUTING.md](./research/CONTRIBUTING.md)                                       | Adding research                                                            | Canonical |
| [registry/papers.yaml](./research/registry/papers.yaml)                             | Paper metadata                                                             | Canonical |
| [registry/techniques.yaml](./research/registry/techniques.yaml)                     | Implementation status                                                      | Canonical |
| [cli-first-adapter-strategy.md](./research/cli-first-adapter-strategy.md)           | CLI-first adapter research                                                 | Canonical |
| [pr-review-experiment-results.md](./research/pr-review-experiment-results.md)       | pr_review #2233 baseline experiment results                                | Canonical |
| [pr-review-experiment-results-v5.md](./research/pr-review-experiment-results-v5.md) | pr_review v5 — JSON-native findings; 100% bug-catch + caught a real bug    | Canonical |
| [mcp-tool-distinctness-v1.md](./research/mcp-tool-distinctness-v1.md)               | MCP tool-description pairwise similarity report (#2650)                    | Canonical |
| [fitness-stratified-v1.md](./research/fitness-stratified-v1.md)                     | Stratified runtime-outcome report — per adapter / task-type / role (#2662) | Canonical |
| [defending-code-harness-eval.md](./research/defending-code-harness-eval.md)         | Eval of Anthropic defending-code-reference-harness (#3574)                 | Canonical |
| [fork-session-spike.md](./research/fork-session-spike.md)                           | Spike: fork_session / branch-comparison on the graph builder (#2665)       | Canonical |

### Tier 3: Supporting (Reference as Needed)

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

#### Guides

| Document                                                            | Description                                                                                                  |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| [MCP_INTEGRATION.md](./guides/MCP_INTEGRATION.md)                   | MCP server configuration                                                                                     |
| [COMPOSITION_PATTERNS.md](./guides/COMPOSITION_PATTERNS.md)         | Compose spec pipeline + GraphBuilder + consensus into custom pipelines                                       |
| [WORKFLOW_TEMPLATES.md](./guides/WORKFLOW_TEMPLATES.md)             | Creating YAML workflows                                                                                      |
| [CUSTOM_ENDPOINT_SETUP.md](./guides/CUSTOM_ENDPOINT_SETUP.md)       | Custom OpenAI-compatible gateway (direct SDK + OpenCode paths)                                               |
| [CLOUD_PROVIDERS.md](./guides/CLOUD_PROVIDERS.md)                   | Bedrock/Vertex/Azure via OpenRouter / LiteLLM / custom-gateway                                               |
| [PR_REVIEW_LOCAL.md](./guides/PR_REVIEW_LOCAL.md)                   | Run pr_review on your machine using subscription CLI auth                                                    |
| [HARNESS_COMPATIBILITY.md](./guides/HARNESS_COMPATIBILITY.md)       | Wire nexus-agents from OpenCode/Codex/Cursor/Aider/Cline                                                     |
| [RULE_PRECEDENCE.md](./guides/RULE_PRECEDENCE.md)                   | Per-adapter rule-loading precedence (Claude/Codex/Gemini/OpenCode)                                           |
| [DEBUGGING_OBSERVABILITY.md](./guides/DEBUGGING_OBSERVABILITY.md)   | Debug logging, tracing                                                                                       |
| [Claude Code Observability](./guides/claude-code-observability/)    | Hooks, status line, MCP logging for Claude Code                                                              |
| [PARALLEL_AGENT_WORKTREES.md](./guides/PARALLEL_AGENT_WORKTREES.md) | Safe parallel agents via `isolation: "worktree"` + the empirical WorktreeCreate/WorktreeRemove hook contract |

#### Reference

| Document                                              | Description                                                                    | Status    |
| ----------------------------------------------------- | ------------------------------------------------------------------------------ | --------- |
| [capabilities.md](./reference/capabilities.md)        | CLI/MCP/Workflow capability index                                              | Generated |
| [MCP tool reference](./reference/tools/index.md)      | Per-tool MCP reference (name, description, input schema)                       | Generated |
| [Strategy reference](./reference/strategies/index.md) | Force-strategy escape hatches: entrypoint tool, when-to-force, tiers, executor | Generated |
| [skills-index.md](./skills-index.md)                  | LLM context loading index                                                      | Canonical |

#### Operational Docs

| Document                                                     | Description                    | Status    |
| ------------------------------------------------------------ | ------------------------------ | --------- |
| [docops-spec.md](./ops/docops-spec.md)                       | Canonical DocOps pipeline spec | Canonical |
| [docops-manifest.json](./ops/docops-manifest.json)           | DocOps enforcement manifest    | Canonical |
| [docs-inventory.md](./ops/docs-inventory.md)                 | Documentation inventory        | Canonical |
| [release-changeset-race.md](./ops/release-changeset-race.md) | Publish-race runbook (#2382)   | Canonical |
| [git-housekeeping.md](./ops/git-housekeeping.md)             | Git GC cleanup runbook (#3062) | Canonical |

#### Interfaces

| Document                                              | Description                 |
| ----------------------------------------------------- | --------------------------- |
| [README.md](./interfaces/README.md)                   | Interface documentation hub |
| [agent.md](./interfaces/agent.md)                     | Agent interface spec        |
| [model-adapter.md](./interfaces/model-adapter.md)     | Model adapter spec          |
| [orchestrator.md](./interfaces/orchestrator.md)       | Orchestrator interface spec |
| [tool.md](./interfaces/tool.md)                       | Tool interface spec         |
| [workflow-engine.md](./interfaces/workflow-engine.md) | Workflow engine spec        |

#### Plans

_No active plan documents. Historical plans have been archived._

#### Design Documents

| Document                                                                        | Description                     | Status    |
| ------------------------------------------------------------------------------- | ------------------------------- | --------- |
| [as-is.md](./archive/design-v2/as-is.md)                                        | Current system state assessment | Archived  |
| [v2-proposal.md](./archive/design-v2/v2-proposal.md)                            | V2 pipeline OS architecture     | Archived  |
| [components.md](./design/components.md)                                         | Component inventory             | Canonical |
| [interfaces.md](./design/interfaces.md)                                         | Key interfaces and contracts    | Canonical |
| [flows.md](./design/flows.md)                                                   | Dataflow traces                 | Canonical |
| [gaps.md](./archive/design-v2/gaps.md)                                          | Intended vs actual gaps         | Archived  |
| [ARCHITECTURE_MAP.json](./design/ARCHITECTURE_MAP.json)                         | Machine-readable component map  | Generated |
| [scaling-coordination-predictor.md](./design/scaling-coordination-predictor.md) | Scaling design                  | Canonical |
| [EXECUTION_DASHBOARD_DESIGN.md](./architecture/EXECUTION_DASHBOARD_DESIGN.md)   | Dashboard design                | Canonical |
| [SWARM_OBSERVER_DESIGN.md](./architecture/SWARM_OBSERVER_DESIGN.md)             | OrchestrationObserver design    | Canonical |
| [SWE_BENCH_HARNESS.md](./architecture/SWE_BENCH_HARNESS.md)                     | SWE-Bench integration           | Canonical |

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

#### Proposals

| Document                                                                   | Description        | Status   |
| -------------------------------------------------------------------------- | ------------------ | -------- |
| [cli-pr-review-workflow.md](./archive/proposals/cli-pr-review-workflow.md) | PR review workflow | Archived |

</details>

#### Workflows

| Document                                                                 | Description                                                  |
| ------------------------------------------------------------------------ | ------------------------------------------------------------ |
| [SELF_DEVELOPMENT_WORKFLOW.md](./workflows/SELF_DEVELOPMENT_WORKFLOW.md) | Historical pointer — engine deleted in #2402, see epic notes |

#### Operational

| Document                                                                     | Description                                 |
| ---------------------------------------------------------------------------- | ------------------------------------------- |
| [ALIGNMENT_ROADMAP.md](./ALIGNMENT_ROADMAP.md)                               | Strategic alignment, north star, gaps       |
| [archive/system-reviews-2026-01.md](./archive/system-reviews-2026-01.md)     | Historical system review transcripts        |
| [SECRETS_SETUP.md](./SECRETS_SETUP.md)                                       | Secrets configuration                       |
| [security/API_KEY_BOUNDARIES.md](./security/API_KEY_BOUNDARIES.md)           | API key boundary documentation              |
| [audit-hash-chain-threat-model](./security/audit-hash-chain-threat-model.md) | Threat model for the audit hash chain       |
| [system-map.md](./architecture/system-map.md)                                | System component map                        |
| [deprecation-pipeline.md](./architecture/deprecation-pipeline.md)            | Deprecation tracking & v3.0 migration guide |
| [redundancy-analysis.md](./architecture/redundancy-analysis.md)              | Code redundancy analysis                    |
| [invocation-matrix.md](./architecture/invocation-matrix.md)                  | Component invocation map                    |
| [distribution/LISTING_SUBMISSIONS.md](./distribution/LISTING_SUBMISSIONS.md) | MCP registry & directory submission tracker |
| [distribution/PUBLISHING_GUIDE.md](./distribution/PUBLISHING_GUIDE.md)       | Step-by-step publishing commands            |

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

## Deprecated / Historical

Documents kept for historical reference only:

| Document                                                                       | Reason                                    | Replacement                                    |
| ------------------------------------------------------------------------------ | ----------------------------------------- | ---------------------------------------------- |
| [archive/REVIEW_2026-01-23.md](./archive/REVIEW_2026-01-23.md)                 | Archived system review                    | Current system reviews                         |
| [archive/SECURITY_AUDIT_2026-01-23.md](./archive/SECURITY_AUDIT_2026-01-23.md) | Archived security audit                   | Current security docs                          |
| [archive/consensus-vote-2026-01-17.md](./archive/consensus-vote-2026-01-17.md) | Archived consensus vote                   | Current consensus protocols                    |
| [archive/system-review-2026-05-31.md](./archive/system-review-2026-05-31.md)   | Full 13-domain system review (epic #3143) | [ALIGNMENT_ROADMAP.md](./ALIGNMENT_ROADMAP.md) |

**Previously Archived/Removed:**

- `PROJECT_PLAN.md`, plan docs — archived/removed
- `RESEARCH_SUMMARY.md` — content in [research/topics/agent-skills/](./research/topics/agent-skills/)
- `SECURITY_AUDIT_2026-01-23.md` — moved to [archive/](./archive/)
- Proposal docs (implemented) — removed after completion

---

## Machine-Parseable Index

For programmatic access, see [INDEX.yaml](./INDEX.yaml).

---

## Governance Rules

1. **Canonical Index**: This file is the single documentation entry point
2. **Indexing Required**: New documentation must be added to this index
3. **No Parallel Indexes**: This is the only documentation index permitted
4. **Update on Change**: Update this index when any documentation changes
5. **Classification Required**: All docs must have a classification (Canonical/Supporting/Deprecated)

---

## Files Not Indexed (Intentionally Excluded)

The following are excluded from this index:

- `.rules/` - Agent-specific configuration (loaded automatically)
- `.claude/skills/` - Agent skill definitions (loaded automatically)
- `coverage/` - Test coverage reports (generated)
- `node_modules/` - Dependencies
- `packages/nexus-agents/docs/api/` - Generated TypeDoc output

---

_This index follows the documentation governance defined in [CLAUDE.md](../CLAUDE.md)._
