---
title: "Architecture Overview"
description: "┌─────────────────────────────────────────────────────────────┐"
---

**Full Details:** [ARCHITECTURE.md](../../ARCHITECTURE.md)

---

## Quick Navigation

| Topic           | Hub       | Deep Dive                                                      |
| --------------- | --------- | -------------------------------------------------------------- |
| Agents          | This file | [AGENT_SYSTEM.md](/nexus-agents/architecture/agent-system/)                           |
| Memory          | This file | [MEMORY_SYSTEM.md](/nexus-agents/architecture/memory-system/)                         |
| Routing         | This file | [ROUTING_SYSTEM.md](/nexus-agents/architecture/routing-system/)                       |
| Load Balancing  | This file | [CONTEXT_LOAD_BALANCING.md](/nexus-agents/architecture/context-load-balancing/)       |
| Consensus       | This file | [CONSENSUS_PROTOCOLS.md](/nexus-agents/architecture/consensus-protocols/)             |
| Security        | This file | [SECURITY.md](/nexus-agents/architecture/security/)                                   |
| Input Hardening | This file | [UNTRUSTED_INPUT_HARDENING.md](/nexus-agents/architecture/untrusted-input-hardening/) |
| MCP             | This file | [MCP_PROTOCOL.md](/nexus-agents/architecture/mcp-protocol/)                           |
| Observability   | This file | [SWARM_OBSERVER_DESIGN.md](/nexus-agents/architecture/swarm-observer-design/)         |
| SWE-Bench       | This file | [SWE_BENCH_HARNESS.md](/nexus-agents/architecture/swe-bench-harness/)                 |
| ICTM Pattern    | This file | [ICTM_PATTERN.md](/nexus-agents/architecture/ictm-pattern/)                           |

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
Task → TaskAnalyzer → BudgetRouter → TopsisRouter → LinUCB → Decision
```

- Budget constraints (tokens, cost, latency)
- Multi-criteria ranking (quality vs cost)
- Contextual learning from outcomes

### Consensus Protocols

5 core voting algorithms for multi-agent decisions:

- **simple_majority**: >50% approval threshold
- **supermajority**: ≥67% approval threshold
- **unanimous**: 100% approval required
- **proof_of_learning**: Weighted by agent performance
- **opinion_wise**: Opinion-based aggregation

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
├── swe-bench/             # SWE-Bench evaluation harness
└── observability/         # Metrics, tracing
```

---

## Related Documents

- **Full Architecture:** [ARCHITECTURE.md](../../ARCHITECTURE.md)
- **Coding Standards:** [CODING_STANDARDS.md](../../CODING_STANDARDS.md)
- **Research Index:** [RESEARCH_INDEX.md](../research/RESEARCH_INDEX.md)
- **API Reference:** [ENTRYPOINTS.md](../ENTRYPOINTS.md)