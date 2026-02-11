# Nexus Agents Documentation

**Canonical Documentation Index** | Last Updated: 2026-02-10 (UI/UX design skill added, 14 skills total)

This is the **single source of truth** for all nexus-agents documentation. All documentation must be indexed here to be considered valid.

---

## Quick Start by Role

| Role               | Start Here                         | Then Read                                           |
| ------------------ | ---------------------------------- | --------------------------------------------------- |
| **New User**       | [Quick Start](../QUICK_START.md)   | [Installation](./getting-started/INSTALLATION.md)   |
| **Contributor**    | [Contributing](../CONTRIBUTING.md) | [Development Guide](./development/README.md)        |
| **Operator**       | [ENTRYPOINTS.md](./ENTRYPOINTS.md) | [Configuration](./getting-started/CONFIGURATION.md) |
| **Agent (Claude)** | [CLAUDE.md](../CLAUDE.md)          | This index                                          |

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
| **Quick Start**           | [QUICK_START.md](../QUICK_START.md)                | 5-minute getting started              |
| **README**                | [README.md](../README.md)                          | Project overview                      |
| **Architecture Overview** | [architecture/README.md](./architecture/README.md) | System design hub                     |
| **Development Guide**     | [development/README.md](./development/README.md)   | Contributor hub                       |
| **API Reference**         | [ENTRYPOINTS.md](./ENTRYPOINTS.md)                 | CLI, MCP, REST, API docs              |
| **Troubleshooting**       | [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)         | Common issues, FAQ                    |

### Tier 2: Reference (Regularly Updated)

Detailed technical documentation:

#### Getting Started

| Document                                               | Description                 | Status    |
| ------------------------------------------------------ | --------------------------- | --------- |
| [INSTALLATION.md](./getting-started/INSTALLATION.md)   | Platform installation guide | Canonical |
| [CONFIGURATION.md](./getting-started/CONFIGURATION.md) | YAML and env configuration  | Canonical |

#### Architecture

| Document                                                                    | Description                    | Status    |
| --------------------------------------------------------------------------- | ------------------------------ | --------- |
| [AGENT_SYSTEM.md](./architecture/AGENT_SYSTEM.md)                           | Agent framework design         | Canonical |
| [MEMORY_SYSTEM.md](./architecture/MEMORY_SYSTEM.md)                         | 7-type memory architecture     | Canonical |
| [ROUTING_SYSTEM.md](./architecture/ROUTING_SYSTEM.md)                       | Model routing pipeline         | Canonical |
| [CONSENSUS_PROTOCOLS.md](./architecture/CONSENSUS_PROTOCOLS.md)             | 5 consensus algorithms         | Canonical |
| [CONTEXT_LOAD_BALANCING.md](./architecture/CONTEXT_LOAD_BALANCING.md)       | Claude/Gemini/Codex routing    | Canonical |
| [SECURITY.md](./architecture/SECURITY.md)                                   | Security model, sandboxing     | Canonical |
| [MCP_PROTOCOL.md](./architecture/MCP_PROTOCOL.md)                           | MCP integration details        | Canonical |
| [TECHLEAD_WORKFLOW_ENGINE.md](./architecture/TECHLEAD_WORKFLOW_ENGINE.md)   | Orchestrator vs WorkflowEngine | Canonical |
| [ICTM_PATTERN.md](./architecture/ICTM_PATTERN.md)                           | Dynamic sub-agent creation     | Canonical |
| [UNTRUSTED_INPUT_HARDENING.md](./architecture/UNTRUSTED_INPUT_HARDENING.md) | Input trust & sanitization     | Canonical |
| [dependency-graph.md](./architecture/dependency-graph.md)                   | Module dependency diagram      | Generated |

#### Development

| Document                                                         | Description                  | Status    |
| ---------------------------------------------------------------- | ---------------------------- | --------- |
| [AGENT_DEVELOPMENT.md](./development/AGENT_DEVELOPMENT.md)       | Building new agents          | Canonical |
| [TOOL_DEVELOPMENT.md](./development/TOOL_DEVELOPMENT.md)         | Adding MCP tools             | Canonical |
| [MEMORY_DEVELOPMENT.md](./development/MEMORY_DEVELOPMENT.md)     | Memory system extensions     | Canonical |
| [CLI_DELEGATION_GUIDE.md](./development/CLI_DELEGATION_GUIDE.md) | CLI adapter patterns         | Canonical |
| [CONTRIBUTION_GUIDE.md](./development/CONTRIBUTION_GUIDE.md)     | PR workflow, git conventions | Canonical |

#### Research

| Document                                                                  | Description                | Status    |
| ------------------------------------------------------------------------- | -------------------------- | --------- |
| [RESEARCH_INDEX.md](./research/RESEARCH_INDEX.md)                         | Research tracking hub      | Canonical |
| [CONTRIBUTING.md](./research/CONTRIBUTING.md)                             | Adding research            | Canonical |
| [registry/papers.yaml](./research/registry/papers.yaml)                   | Paper metadata             | Canonical |
| [registry/techniques.yaml](./research/registry/techniques.yaml)           | Implementation status      | Canonical |
| [cli-first-adapter-strategy.md](./research/cli-first-adapter-strategy.md) | CLI-first adapter research | Canonical |

### Tier 3: Supporting (Reference as Needed)

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

#### Guides

| Document                                                          | Description              |
| ----------------------------------------------------------------- | ------------------------ |
| [MCP_INTEGRATION.md](./guides/MCP_INTEGRATION.md)                 | MCP server configuration |
| [WORKFLOW_TEMPLATES.md](./guides/WORKFLOW_TEMPLATES.md)           | Creating YAML workflows  |
| [DEBUGGING_OBSERVABILITY.md](./guides/DEBUGGING_OBSERVABILITY.md) | Debug logging, tracing   |

#### Reference

| Document                                       | Description                       | Status    |
| ---------------------------------------------- | --------------------------------- | --------- |
| [capabilities.md](./reference/capabilities.md) | CLI/MCP/Workflow capability index | Generated |
| [skills-index.md](./skills-index.md)           | LLM context loading index         | Canonical |

#### Operational Docs

| Document                                           | Description                    | Status     |
| -------------------------------------------------- | ------------------------------ | ---------- |
| [docops-spec.md](./ops/docops-spec.md)             | Canonical DocOps pipeline spec | Canonical  |
| [docops-manifest.json](./ops/docops-manifest.json) | DocOps enforcement manifest    | Canonical  |
| [docs-inventory.md](./ops/docs-inventory.md)       | Documentation inventory        | Canonical  |
| [docs-site-plan.md](./ops/docs-site-plan.md)       | Site migration plan            | Historical |

#### Interfaces

| Document                                              | Description                 |
| ----------------------------------------------------- | --------------------------- |
| [README.md](./interfaces/README.md)                   | Interface documentation hub |
| [agent.md](./interfaces/agent.md)                     | Agent interface spec        |
| [model-adapter.md](./interfaces/model-adapter.md)     | Model adapter spec          |
| [tool.md](./interfaces/tool.md)                       | Tool interface spec         |
| [workflow-engine.md](./interfaces/workflow-engine.md) | Workflow engine spec        |

#### Plans

| Document                                                                   | Description             | Status     |
| -------------------------------------------------------------------------- | ----------------------- | ---------- |
| [cli-integration-plan.md](./plans/cli-integration-plan.md)                 | CLI integration roadmap | Active     |
| [e2e-testing-epic-final.md](./plans/e2e-testing-epic-final.md)             | E2E testing plan        | Active     |
| [agent-improvement-epic-draft.md](./plans/agent-improvement-epic-draft.md) | Agent improvements      | Draft      |
| [e2e-testing-epic-draft.md](./plans/e2e-testing-epic-draft.md)             | E2E testing draft       | Superseded |
| [PROJECT_PLAN_2026-01-03.md](./plans/PROJECT_PLAN_2026-01-03.md)           | Original project plan   | Historical |

#### Design Documents

| Document                                                                        | Description                     | Status    |
| ------------------------------------------------------------------------------- | ------------------------------- | --------- |
| [as-is.md](./design/as-is.md)                                                   | Current system state assessment | Canonical |
| [v2-proposal.md](./design/v2-proposal.md)                                       | V2 pipeline OS architecture     | Canonical |
| [components.md](./design/components.md)                                         | Component inventory             | Canonical |
| [interfaces.md](./design/interfaces.md)                                         | Key interfaces and contracts    | Canonical |
| [flows.md](./design/flows.md)                                                   | Dataflow traces                 | Canonical |
| [gaps.md](./design/gaps.md)                                                     | Intended vs actual gaps         | Canonical |
| [ARCHITECTURE_MAP.json](./design/ARCHITECTURE_MAP.json)                         | Machine-readable component map  | Generated |
| [scaling-coordination-predictor.md](./design/scaling-coordination-predictor.md) | Scaling design                  | Canonical |
| [EXECUTION_DASHBOARD_DESIGN.md](./architecture/EXECUTION_DASHBOARD_DESIGN.md)   | Dashboard design                | Canonical |
| [SWARM_OBSERVER_DESIGN.md](./architecture/SWARM_OBSERVER_DESIGN.md)             | Swarm observer design           | Canonical |
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

| Document                                                                             | Description           | Status      |
| ------------------------------------------------------------------------------------ | --------------------- | ----------- |
| [TIERED_DOCS_PLAN.md](./proposals/TIERED_DOCS_PLAN.md)                               | Documentation tiering | Implemented |
| [automated-documentation-system.md](./proposals/automated-documentation-system.md)   | Auto-docs proposal    | Proposed    |
| [cli-pr-review-workflow.md](./proposals/cli-pr-review-workflow.md)                   | PR review workflow    | Proposed    |
| [hook-integration-proposal.md](./proposals/hook-integration-proposal.md)             | Hook integration      | Proposed    |
| [interface-contract-238.md](./proposals/interface-contract-238.md)                   | Interface contracts   | Proposed    |
| [process-automation-improvements.md](./proposals/process-automation-improvements.md) | Process automation    | Proposed    |
| [protocol-improvement-system.md](./proposals/protocol-improvement-system.md)         | Protocol improvements | Proposed    |
| [self-evaluation-mvp.md](./proposals/self-evaluation-mvp.md)                         | Self-evaluation MVP   | Proposed    |
| [adapter-architecture-review.md](./proposals/adapter-architecture-review.md)         | Adapter review        | Draft       |

#### Workflows

| Document                                                                 | Description              |
| ------------------------------------------------------------------------ | ------------------------ |
| [SELF_DEVELOPMENT_WORKFLOW.md](./workflows/SELF_DEVELOPMENT_WORKFLOW.md) | Self-development process |

#### Operational

| Document                                                          | Description                                 |
| ----------------------------------------------------------------- | ------------------------------------------- |
| [ALIGNMENT_ROADMAP.md](./ALIGNMENT_ROADMAP.md)                    | Project phases, progress                    |
| [SECRETS_SETUP.md](./SECRETS_SETUP.md)                            | Secrets configuration                       |
| [SECURITY_AUDIT_2026-01-23.md](./SECURITY_AUDIT_2026-01-23.md)    | Security audit report                       |
| [system-map.md](./architecture/system-map.md)                     | System component map                        |
| [deprecation-pipeline.md](./architecture/deprecation-pipeline.md) | Deprecation tracking & v3.0 migration guide |
| [redundancy-analysis.md](./architecture/redundancy-analysis.md)   | Code redundancy analysis                    |
| [invocation-matrix.md](./architecture/invocation-matrix.md)       | Component invocation map                    |
| [completeness-score.md](./metrics/completeness-score.md)          | CLI completeness metrics                    |

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

| Document                                       | Reason                    | Replacement                                       |
| ---------------------------------------------- | ------------------------- | ------------------------------------------------- |
| [docs/research/\_legacy/](./research/_legacy/) | Historical research notes | [RESEARCH_INDEX.md](./research/RESEARCH_INDEX.md) |

**Recently Archived/Removed:**

- `PROJECT_PLAN.md` - Moved to [plans/PROJECT_PLAN_2026-01-03.md](./plans/PROJECT_PLAN_2026-01-03.md)
- `RESEARCH_SUMMARY.md` - Removed (content exists in [research/topics/agent-skills/](./research/topics/agent-skills/))
- `docs/codebase-index.yaml` - Removed (was empty; use packages/nexus-agents/docs/codebase-index.yaml)

---

## Website Documentation

The documentation website at `/website/` renders this canonical documentation. Website content **must** be sourced from these canonical docs.

**Website source:** `/website/src/content/docs/`
**Build:** `cd website && npm run build`

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

- `.claude/rules/` - Agent-specific configuration (loaded automatically)
- `.claude/skills/` - Agent skill definitions (loaded automatically)
- `website/node_modules/` - Dependencies
- `coverage/` - Test coverage reports (generated)
- `node_modules/` - Dependencies
- `packages/nexus-agents/docs/api/` - Generated TypeDoc output
- `packages/nexus-agents/docs/codebase-index.yaml` - Generated codebase index

---

_This index follows the documentation governance defined in [CLAUDE.md](../CLAUDE.md)._
