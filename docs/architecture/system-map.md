# Nexus-Agents System Map

> Machine-readable companion: [`wiring-graph.json`](./wiring-graph.json)

## Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              EXTERNAL LAYER                                  │
├────────────────────┬────────────────────┬────────────────────────────────────┤
│    MCP Server      │    CLI Commands    │        REST API (planned)          │
│  (cli-server.ts)   │    (cli.ts)        │       (api-gateway.ts)             │
│                    │                    │                                    │
│  24 MCP Tools:     │  30+ Commands:     │  Future:                           │
│  • orchestrate     │  • doctor          │  • /orchestrate                    │
│  • create_expert   │  • setup           │  • /experts                        │
│  • execute_expert  │  • orchestrate     │  • /workflows                      │
│  • run_workflow    │  • workflow        │                                    │
│  • consensus_vote  │  • expert          │                                    │
│  • list_experts    │  • research        │                                    │
│  • list_workflows  │  • sprint/vote     │                                    │
│  • delegate_model  │  • session         │                                    │
└────────────────────┴────────────────────┴────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          ORCHESTRATION LAYER                                 │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐          │
│  │   Orchestrator  │◄───│  Expert System  │───►│ Workflow Engine │          │
│  │                 │    │                 │    │                 │          │
│  │ Master          │    │ • Factory       │    │ • Parser        │          │
│  │ Orchestrator    │    │ • Registry      │    │ • Planner       │          │
│  │                 │    │ • Selector      │    │ • Executor      │          │
│  │ Decomposes      │    │ • 10 Built-in   │    │ • LATTS         │          │
│  │ tasks, assigns  │    │   Experts       │    │ • AFlow         │          │
│  │ experts,        │    │                 │    │ • Self-Evolving │          │
│  │ synthesizes     │    │                 │    │                 │          │
│  └────────┬────────┘    └────────┬────────┘    └────────┬────────┘          │
│           │                      │                      │                    │
│           └──────────────────────┼──────────────────────┘                    │
│                                  │                                           │
│  ┌─────────────────────────────────────────────────────────────────┐        │
│  │                      Consensus Engine                            │        │
│  │  • VotingProtocol  • WeightedVoting  • HigherOrderVoting        │        │
│  │  • CorrelationTracker  • AegeanProtocol                         │        │
│  └─────────────────────────────────────────────────────────────────┘        │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────┐        │
│  │                    Collaboration Protocols                       │        │
│  │  • AegeanConsensus (arXiv:2512.20184)                           │        │
│  │  • TaskTypeClassifier (arXiv:2502.19130)                        │        │
│  │  • ConstitutionalCritic • MARS Protocol                         │        │
│  └─────────────────────────────────────────────────────────────────┘        │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────┐        │
│  │                   Self-Improving (SICA)                          │        │
│  │  • Self-Critique  • Code Generation  • Improvement Loops         │        │
│  │  (arXiv:2504.14809)                                              │        │
│  └─────────────────────────────────────────────────────────────────┘        │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            ROUTING LAYER                                     │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────┐        │
│  │                     CompositeRouter                              │        │
│  │                                                                  │        │
│  │  Multi-stage routing pipeline:                                   │        │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐         │        │
│  │  │ Budget   │─▶│ Zero     │─▶│Preference│─▶│ TOPSIS   │─▶LinUCB │        │
│  │  │ Filter   │  │ Router   │  │ Router   │  │ Ranking  │         │        │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘         │        │
│  │                                                                  │        │
│  │  Research: PILOT, RouteLLM, TOPSIS, LinUCB                       │        │
│  └─────────────────────────────────────────────────────────────────┘        │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────┐        │
│  │                      Support Systems                             │        │
│  │  • ResponseCache    • LatencyTracker   • CapacityTracker        │        │
│  │  • CircuitBreaker   • FallbackChains   • RoutingMetrics         │        │
│  └─────────────────────────────────────────────────────────────────┘        │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           EXECUTION LAYER                                    │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐           │
│  │   Claude   │  │   Gemini   │  │    Codex   │  │  OpenCode  │           │
│  │  Adapter   │  │  Adapter   │  │   Adapter  │  │  Adapter   │           │
│  │            │  │            │  │            │  │            │           │
│  │ claude-cli │  │ gemini-cli │  │ openai-    │  │ opencode   │           │
│  │ Streaming  │  │ Multimodal │  │ codex      │  │ Multi-     │           │
│  │ Cache ctrl │  │ 1M context │  │ Code focus │  │ provider   │           │
│  └────────────┘  └────────────┘  └────────────┘  └────────────┘           │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────┐        │
│  │                      Base Adapter                                │        │
│  │  Common interface: ICliAdapter                                   │        │
│  │  • executeTask()  • getCapabilities()  • checkHealth()          │        │
│  └─────────────────────────────────────────────────────────────────┘        │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           LEARNING LAYER                                     │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────┐        │
│  │                  FeedbackIntegration                             │        │
│  │                                                                  │        │
│  │  Records: Routing Decisions ─▶ Step Outcomes ─▶ Rewards          │        │
│  │  Persists: SQLiteOutcomeStorage (Issue #560)                     │        │
│  │  Updates: CompositeRouter preferences                            │        │
│  └─────────────────────────────────────────────────────────────────┘        │
│                                                                              │
│  ┌───────────────────┐  ┌───────────────────┐  ┌───────────────────┐        │
│  │  OutcomeFeedback  │  │   ABTestTracker   │  │ ValidationStats   │        │
│  │   Collector       │  │                   │  │                   │        │
│  └───────────────────┘  └───────────────────┘  └───────────────────┘        │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           MEMORY LAYER                                       │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────┐        │
│  │                    ContextManager                                │        │
│  │                                                                  │        │
│  │  8 Memory Types: Episodic, Semantic, Procedural, Working,       │        │
│  │                  Declarative, Short-term, Long-term, Meta       │        │
│  └─────────────────────────────────────────────────────────────────┘        │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────┐        │
│  │                    ContextPruner                                 │        │
│  │                                                                  │        │
│  │  Strategies: SlidingWindow, Hierarchical, Semantic (7 variants) │        │
│  └─────────────────────────────────────────────────────────────────┘        │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        OBSERVABILITY LAYER                                   │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌───────────────────┐  ┌───────────────────┐  ┌───────────────────┐        │
│  │  OrchestrationObserver    │  │   TraceExporter   │  │   AuditLogger     │        │
│  │                   │  │                   │  │                   │        │
│  │  Swarm metrics    │  │  Distributed      │  │  Structured       │        │
│  │  Event tracking   │  │  tracing          │  │  compliance logs  │        │
│  └───────────────────┘  └───────────────────┘  └───────────────────┘        │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────┐        │
│  │                      EventBus Bridge                             │        │
│  │  Connects MCP tools to observability without blocking           │        │
│  └─────────────────────────────────────────────────────────────────┘        │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          SECURITY LAYER                                      │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌───────────────────┐  ┌───────────────────┐  ┌───────────────────┐        │
│  │  STPA Analyzer    │  │  Policy Firewall  │  │    Sandbox        │        │
│  │                   │  │                   │  │                   │        │
│  │  50+ hazards      │  │  Tool execution   │  │  Process          │        │
│  │  6 categories     │  │  policy gates     │  │  isolation        │        │
│  └───────────────────┘  └───────────────────┘  └───────────────────┘        │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────┐        │
│  │                      Safety-Bench                                │        │
│  │  Agent safety evaluation with categories and scoring            │        │
│  └─────────────────────────────────────────────────────────────────┘        │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Layer Descriptions

### External Layer

Entry points for all system interactions:

- **MCP Server**: Claude Desktop/CLI integration via stdio transport
- **CLI Commands**: Direct command-line interface (30+ commands)
- **REST API**: Planned HTTP interface (Issue #184)

### Orchestration Layer

Agent coordination and task decomposition:

- **Orchestrator**: Master orchestrator, decomposes tasks, assigns experts
- **Expert System**: 10 built-in experts with factory/registry pattern
- **Workflow Engine**: YAML-based workflow execution with parallelism
- **Consensus Engine**: Multi-agent voting and agreement protocols
- **SICA**: Self-Improving Coding Agent integration

### Routing Layer

Model selection and load balancing:

- **CompositeRouter**: Multi-stage pipeline (Budget → Zero → Preference → TOPSIS → LinUCB)
- **Support Systems**: Caching, latency tracking, circuit breakers, fallbacks

### Execution Layer

Model adapters and response handling:

- **Claude Adapter**: Streaming, cache control, vision
- **Gemini Adapter**: Multimodal, 1M context
- **Codex Adapter**: Code-focused, fast execution
- **OpenCode Adapter**: Multi-provider model access

### Learning Layer

Closed-loop feedback and improvement:

- **FeedbackIntegration**: Records decisions, outcomes, rewards
- **OutcomeStorage**: SQLite persistence for cross-session learning
- **ABTestTracker**: A/B testing for routing strategies

### Memory Layer

Context management and persistence:

- **ContextManager**: 8 memory types
- **ContextPruner**: 7 pruning strategies

### Observability Layer

Metrics, tracing, and audit:

- **OrchestrationObserver**: Swarm-level metrics
- **TraceExporter**: Distributed tracing
- **AuditLogger**: Compliance logging

### Security Layer

Safety and isolation:

- **STPA Analyzer**: Formal safety analysis (50+ hazards)
- **Policy Firewall**: Tool execution gates
- **Sandbox**: Process isolation
- **Safety-Bench**: Agent safety evaluation

## Component Statistics

| Layer         | Components            | Status   | Test Coverage |
| ------------- | --------------------- | -------- | ------------- |
| External      | 3 entry points        | Complete | 95%+          |
| Orchestration | 15+ modules           | Complete | 90%+          |
| Routing       | 9 routers + 5 support | Complete | 85%+          |
| Execution     | 4 adapters            | Complete | 90%+          |
| Learning      | 4 modules             | Complete | 85%+          |
| Memory        | 3 modules             | Complete | 90%+          |
| Observability | 4 modules             | Complete | 80%+          |
| Security      | 4 modules             | Complete | 85%+          |

## Data Flow

```
User Request
    │
    ▼
┌──────────────────┐
│  Entry Point     │ (MCP Tool / CLI Command / REST Endpoint)
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Orchestration   │ (Orchestrator → Expert Selection → Task Decomposition)
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Routing         │ (CompositeRouter → Model Selection)
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Execution       │ (Model Adapter → API Call → Response)
└────────┬─────────┘
         │
         ├───────────────────────────────────────────┐
         ▼                                           ▼
┌──────────────────┐                     ┌──────────────────┐
│  Learning        │                     │  Observability   │
│  (Feedback)      │                     │  (Metrics/Trace) │
└──────────────────┘                     └──────────────────┘
```

## Cross-References

- Detailed interfaces: [`docs/interfaces/`](../interfaces/)
- Routing algorithms: [`ROUTING_SYSTEM.md`](./ROUTING_SYSTEM.md)
- Consensus protocols: [`CONSENSUS_PROTOCOLS.md`](./CONSENSUS_PROTOCOLS.md)
- Memory system: [`MEMORY_SYSTEM.md`](./MEMORY_SYSTEM.md)
- Security model: [`SECURITY.md`](./SECURITY.md)
- CLI/MCP reference: [`ENTRYPOINTS.md`](../ENTRYPOINTS.md)

---

_Last updated: 2026-02-25_
_Source: System Mandate - Loop A: Discovery + Wiring Graph Generation_
