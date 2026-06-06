---
title: Architecture Overview
description: System design, component relationships, pipeline, adapters, and orchestration
tier: 2
keywords: [agents, memory, routing, consensus, security, mcp, pipeline, design]
related_files:
  - ARCHITECTURE.md
  - docs/architecture/AGENT_SYSTEM.md
  - docs/architecture/MEMORY_SYSTEM.md
  - docs/architecture/ROUTING_SYSTEM.md
  - docs/architecture/CONSENSUS_PROTOCOLS.md
  - docs/architecture/MCP_PROTOCOL.md
---

# Architecture Overview

**Tier 2 Hub** | Load for architecture understanding
**Full Details:** [ARCHITECTURE.md](../../ARCHITECTURE.md)

---

## Quick Navigation

| Topic           | Hub       | Deep Dive                                                      |
| --------------- | --------- | -------------------------------------------------------------- |
| Agents          | This file | [AGENT_SYSTEM.md](./AGENT_SYSTEM.md)                           |
| Memory          | This file | [MEMORY_SYSTEM.md](./MEMORY_SYSTEM.md)                         |
| Routing         | This file | [ROUTING_SYSTEM.md](./ROUTING_SYSTEM.md)                       |
| Load Balancing  | This file | [CONTEXT_LOAD_BALANCING.md](./CONTEXT_LOAD_BALANCING.md)       |
| Consensus       | This file | [CONSENSUS_PROTOCOLS.md](./CONSENSUS_PROTOCOLS.md)             |
| Security        | This file | [SECURITY.md](./SECURITY.md)                                   |
| Input Hardening | This file | [UNTRUSTED_INPUT_HARDENING.md](./UNTRUSTED_INPUT_HARDENING.md) |
| MCP             | This file | [MCP_PROTOCOL.md](./MCP_PROTOCOL.md)                           |
| Observability   | This file | [SWARM_OBSERVER_DESIGN.md](./SWARM_OBSERVER_DESIGN.md)         |
| Event Buses     | This file | [EVENT_BUS_BOUNDARIES.md](./EVENT_BUS_BOUNDARIES.md)           |
| SWE-Bench       | This file | [SWE_BENCH_HARNESS.md](./SWE_BENCH_HARNESS.md)                 |
| ICTM Pattern    | This file | [ICTM_PATTERN.md](./ICTM_PATTERN.md)                           |
| Multi-Repo      | This file | [MULTI_REPO_ORCHESTRATION.md](./MULTI_REPO_ORCHESTRATION.md)   |

---

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    External Interfaces                       │
│   MCP Server │ REST API │ Standalone CLI                    │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                  Orchestration Layer                         │
│   Orchestrator │ Expert Pool │ Event Bus │ Consensus Engine │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                    Execution Layer                           │
│   CLI Adapters │ Model APIs │ Workflow Engine               │
└─────────────────────────────────────────────────────────────┘
```

---

## Core Components

### Agent System

The agent framework provides:

- **Orchestrator**: Orchestrates expert pool, delegates tasks
- **Experts**: Specialized domain agents (Code, Security, Architecture, etc.)
- **State Machine**: idle → thinking → acting → waiting → error

```typescript
interface IAgent {
  readonly id: string;
  readonly role: AgentRole;
  readonly state: AgentState;
  execute(task: Task): Promise<Result<TaskResult, AgentError>>;
}
```

### Memory System

7-type memory architecture (MIRIX-inspired):

- **Core**: Agent identity and constraints
- **Episodic**: Task experiences
- **Semantic**: Domain knowledge
- **Procedural**: Skills and workflows
- **Resource**: External references
- **Vault**: Cross-session persistence
- **Belief**: Hindsight belief memory for reasoning (arXiv:2512.12818)

### Routing System

CompositeRouter pipeline for intelligent model selection:

```
Task → BudgetRouter → ZeroRouter → PreferenceRouter → TopsisRouter → LinUCB → Decision
```

- Budget constraints (tokens, cost, latency)
- Multi-criteria ranking (quality vs cost)
- Contextual learning from outcomes

### Adapter Layers

Two adapter layers serve distinct purposes:

| Layer              | Interface       | Purpose                               | Location            |
| ------------------ | --------------- | ------------------------------------- | ------------------- |
| **Model Adapters** | `IModelAdapter` | Protocol translation (HTTP API calls) | `src/adapters/`     |
| **CLI Adapters**   | `ICliAdapter`   | Subprocess lifecycle and routing      | `src/cli-adapters/` |

These are **sequential, not parallel**: `CompositeRouter` selects a CLI → CLI adapter executes the subprocess → response is returned. When model-layer semantics are needed, `CliToModelAdapter` bridges `ICliAdapter → IModelAdapter`.

- `ResilientAdapter` wraps API adapters with lazy init and circuit-breaker failover
- `CliCircuitBreaker` provides subprocess-level resilience for CLI adapters
- `CompositeRouter` chains routing stages: Budget → ZeroRouter → Preference → TOPSIS → LinUCB

### Consensus Protocols

6 core voting algorithms for multi-agent decisions:

- **simple_majority**: >50% approval threshold
- **supermajority**: ≥67% approval threshold
- **unanimous**: 100% approval required
- **proof_of_learning**: Weighted by agent performance
- **higher_order**: Bayesian-optimal aggregation with correlation awareness
- **opinion_wise**: Opinion-based aggregation

---

## Composability Model

The 46 MCP tools are not a flat menu — they form three tiers, and the design intent is that **a higher tier composes lower tiers**. Knowing the tier of a tool tells you whether you call it directly or hand its output to something larger.

### Three tiers

| Tier              | What it does                                                                                   | Examples                                                                                                                                         |
| ----------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Primitives**    | One job, no internal fan-out. Read/inspect/retrieve a single artifact.                         | `extract_symbols`, `search_codebase`, `research_discover`, `research_query`, `repo_analyze`, `verify_audit_chain`, `memory_query`                |
| **Coordinators**  | Fan out to several agents/models for **one** decision or synthesis (single round, no looping). | `consensus_vote`, `research_synthesize`, `delegate_to_model`, `execute_expert`, `pr_review`, `repo_security_plan`, `supply_chain_tradeoff_panel` |
| **Orchestrators** | Chain primitives + coordinators across **multiple stages**, with gates and loops.              | `orchestrate`, `run_dev_pipeline`, `run_pipeline`, `run_graph_workflow`, `run_workflow`, `execute_spec`                                          |

The rule of thumb: a primitive answers a question, a coordinator makes a decision, an orchestrator runs a workflow. An orchestrator's stages are themselves coordinators and primitives — `run_dev_pipeline` internally calls a research primitive, then a `consensus_vote` coordinator, then expert execution, then a security-review gate.

### Data-flow contracts

Composition works because tool outputs are designed to feed specific downstream inputs. The hand-off is almost always a small, human-readable artifact you (or your agent) carry forward — not hidden wiring:

| Producer                              | Artifact                        | Consumer                               |
| ------------------------------------- | ------------------------------- | -------------------------------------- |
| `research_discover`                   | entries written to the registry | `research_synthesize` (by topic)       |
| `research_synthesize`                 | one-line trade-off framing      | `consensus_vote` (proposal text)       |
| `consensus_vote`                      | **approved** proposal text      | `run_dev_pipeline` (task)              |
| `repo_analyze`                        | structural map + risk surface   | `repo_security_plan`                   |
| `extract_symbols` / `search_codebase` | code context                    | `execute_expert` / `delegate_to_model` |

If a producer's output is `rejected` or empty, the contract is to **read the reason and revise**, not to push forward — the per-role feedback from `consensus_vote`, or the empty result from `research_synthesize`, is itself the signal.

### Three ways to compose

The same tiers compose at three levels of formality, in increasing order of reuse:

1. **Runtime (conversational)** — your agent calls tools ad hoc and carries each artifact by hand. Best for one-off, decision-shaped goals. Walkthrough: [COMPOSE_YOUR_FIRST_PIPELINE.md](../getting-started/COMPOSE_YOUR_FIRST_PIPELINE.md).
2. **YAML (declarative)** — a saved workflow template names the stages and their order once, then re-runs via `run_workflow`. Best for a repeatable chain. See [WORKFLOW_TEMPLATES.md](../guides/WORKFLOW_TEMPLATES.md).
3. **Programmatic (in code)** — `GraphBuilder` / `PipelineRunner` wire stages with typed contracts, gates, and loops. Best when you need branching, retries, or a consensus gate mid-graph. See [COMPOSITION_PATTERNS.md](../guides/COMPOSITION_PATTERNS.md).

All three target the same tiers; they differ only in where the chain is written down.

### Worked example — a security audit

One concrete goal, traced through four tools across the tiers:

```
repo_analyze ──▶ repo_security_plan ──▶ consensus_vote ──▶ run_pipeline (audit)
 (primitive:        (coordinator:          (coordinator:        (orchestrator:
  structural map)    ranked findings)       gate the plan)       execute the plan)
```

1. **`repo_analyze`** (primitive) maps the repo and surfaces the risk surface — a structural artifact, no decision made.
2. **`repo_security_plan`** (coordinator) turns that map into a ranked remediation plan, fanning out to security reasoning for one synthesis pass.
3. **`consensus_vote`** (coordinator, `supermajority` per the governance thresholds for security work) gates the plan: approved plans proceed, rejected ones return per-role reasons to revise.
4. **`run_pipeline`** with the `audit` template (orchestrator) executes the approved plan stage by stage, emitting findings into the audit chain you can later `verify_audit_chain` against.

Each arrow is a data-flow contract from the table above; each box is one tier doing exactly its job. That is the whole model: **pick the tier that matches the question, and let outputs flow forward as inputs.**

---

## Key Design Decisions

### Hybrid Architecture (ADR-001)

**Decision:** Combine MCP Gateway + Internal Event Bus + Standalone CLI
**Rationale:** Enables Claude CLI integration, peer-to-peer agent coordination, and CI/CD pipelines

### Zero-Credential Pattern (ADR-002)

**Decision:** OAuth for all CLI adapters, no stored credentials
**Rationale:** Security-first, delegates auth to CLI tools

### Result<T,E> Error Handling (ADR-003)

**Decision:** Explicit error types over exceptions
**Rationale:** Type-safe error handling, exhaustive matching

---

## File Map

```
packages/nexus-agents/src/
├── agents/
│   ├── tech-lead/         # Orchestration
│   ├── experts/           # Domain experts
│   ├── collaboration/     # Consensus protocols
│   └── self-improving/    # SICA implementation
├── cli-adapters/          # External CLI integration
├── context/               # Memory management
├── consensus/             # Voting protocols
├── mcp/                   # MCP server
└── observability/         # Metrics, tracing
```

---

## Related Documents

- **Full Architecture:** [ARCHITECTURE.md](../../ARCHITECTURE.md)
- **Coding Standards:** [CODING_STANDARDS.md](../../CODING_STANDARDS.md)
- **Research Index:** [RESEARCH_INDEX.md](../research/RESEARCH_INDEX.md)
- **API Reference:** [ENTRYPOINTS.md](../ENTRYPOINTS.md)
