# Invocation Matrix

> Machine-readable companion: [`wiring-graph.json`](./wiring-graph.json)

## Overview

This document maps all invocation patterns between components across MCP, CLI, and Hybrid execution modes.

## Entry Point Matrix

| Entry Point           | Mode    | Transport            | Handler                | Downstream Dependencies    |
| --------------------- | ------- | -------------------- | ---------------------- | -------------------------- |
| `cli-server.ts`       | MCP     | StdioServerTransport | `createServer()`       | mcp-tools, eventbus-bridge |
| `cli.ts`              | CLI     | Commander.js         | `program.parseAsync()` | cli-commands               |
| `cli-orchestrator.ts` | Hybrid  | Direct               | `OrchestratorMode`     | TechLead, CompositeRouter  |
| `index.ts`            | Library | ESM Import           | N/A                    | All exports                |

## MCP Tool Invocation Matrix

| MCP Tool            | Input Schema               | Invokes                          | Returns             | Side Effects      |
| ------------------- | -------------------------- | -------------------------------- | ------------------- | ----------------- |
| `orchestrate`       | `OrchestrateInputSchema`   | TechLead → Experts → Adapters    | `OrchestrateResult` | Metrics, Feedback |
| `create_expert`     | `CreateExpertInputSchema`  | ExpertFactory                    | `ExpertInstance`    | Registry update   |
| `execute_expert`    | `ExecuteExpertInputSchema` | ExpertRegistry → Expert          | `ExpertResult`      | Metrics           |
| `run_workflow`      | `RunWorkflowInputSchema`   | WorkflowParser → Executor        | `WorkflowResult`    | Metrics, Logs     |
| `consensus_vote`    | `ConsensusVoteInputSchema` | ConsensusEngine → VotingProtocol | `VoteResult`        | Vote history      |
| `list_experts`      | `ListExpertsInputSchema`   | ExpertRegistry                   | `ExpertList`        | None              |
| `list_workflows`    | `ListWorkflowsInputSchema` | WorkflowParser                   | `WorkflowList`      | None              |
| `delegate_to_model` | `DelegateInputSchema`      | CompositeRouter → Adapter        | `DelegateResult`    | Routing metrics   |

## CLI Command Invocation Matrix

### Core Commands

| Command                    | Handler                  | Invokes          | MCP Equivalent |
| -------------------------- | ------------------------ | ---------------- | -------------- |
| `nexus-agents doctor`      | `doctor.ts`              | Config, Adapters | N/A            |
| `nexus-agents setup`       | `setup-command.ts`       | Config           | N/A            |
| `nexus-agents hello`       | `hello.ts`               | Version, Config  | N/A            |
| `nexus-agents demo`        | `demo-command.ts`        | Demo data        | N/A            |
| `nexus-agents orchestrate` | `orchestrate-command.ts` | TechLead         | `orchestrate`  |
| `nexus-agents config`      | `config-command.ts`      | ConfigManager    | N/A            |

### Workflow Commands

| Command         | Handler           | Invokes        | MCP Equivalent   |
| --------------- | ----------------- | -------------- | ---------------- |
| `workflow list` | `workflow-run.ts` | WorkflowParser | `list_workflows` |
| `workflow run`  | `workflow-run.ts` | WorkflowEngine | `run_workflow`   |
| `expert list`   | `expert-list.ts`  | ExpertRegistry | `list_experts`   |

### Research Commands

| Command            | Handler                       | Invokes           | MCP Equivalent |
| ------------------ | ----------------------------- | ----------------- | -------------- |
| `research add`     | `research-command.ts`         | ArxivFetcher      | N/A            |
| `research status`  | `research-command.ts`         | TechniqueRegistry | N/A            |
| `research overlap` | `research-helpers-overlap.ts` | AlignmentChecker  | N/A            |
| `research index`   | `research-index-helpers.ts`   | IndexRebuilder    | N/A            |

### Planning Commands

| Command         | Handler             | Invokes        | MCP Equivalent   |
| --------------- | ------------------- | -------------- | ---------------- |
| `sprint`        | `sprint-command.ts` | SprintPlanner  | N/A              |
| `vote`          | `vote-command.ts`   | VotingProtocol | `consensus_vote` |
| `issue`         | `issue-command.ts`  | GitHub API     | N/A              |
| `system-review` | `system-review.ts`  | SystemAnalyzer | N/A              |

### Evaluation Commands

| Command            | Handler                       | Invokes             | MCP Equivalent |
| ------------------ | ----------------------------- | ------------------- | -------------- |
| `swe-bench`        | `swe-bench-command.ts`        | SweBenchHarness     | N/A            |
| `verify`           | `verify-command.ts`           | Verifier            | N/A            |
| `learning-metrics` | `learning-metrics-command.ts` | FeedbackIntegration | N/A            |

## Internal Invocation Patterns

### Orchestration Flow

```
TechLead.executeTask(task)
├── ExpertSelector.selectExpert(task)
│   └── ExpertRegistry.query(capabilities)
├── CompositeRouter.route(task)
│   ├── BudgetRouter.checkBudget()
│   ├── ZeroRouter.estimateDifficulty()
│   ├── PreferenceRouter.getPreference()
│   ├── TopsisRouter.rank()
│   └── LinUCBRouter.explore()
├── SelectedAdapter.executeTask(task)
│   ├── ClaudeAdapter.execute() OR
│   ├── GeminiAdapter.execute() OR
│   ├── CodexAdapter.execute() OR
│   └── OllamaAdapter.execute()
├── FeedbackIntegration.recordOutcome()
│   └── OutcomeStorage.persist()
└── EventBusBridge.publish(event)
    └── SwarmObserver.record()
```

### Consensus Flow

```
ConsensusEngine.runConsensus(topic, agents)
├── ProtocolSelector.select(topic)
│   └── AegeanProtocol OR VotingProtocol OR WeightedVoting
├── foreach Agent:
│   └── Agent.vote(topic)
├── CorrelationTracker.recordVotes()
├── VotingProtocol.tally()
└── HigherOrderVoting.verifyQuorum()
```

### Workflow Flow

```
WorkflowEngine.execute(definition)
├── WorkflowParser.parse(yaml)
├── DependencyGraph.build()
├── ExecutionPlanner.createPhases()
└── foreach Phase:
    └── ParallelExecutor.executeSteps()
        └── StepExecutor.execute(step)
            └── CompositeRouter.route() → Adapter.execute()
```

## Event Bus Message Types

| Event Type          | Publisher       | Subscribers                        | Payload         |
| ------------------- | --------------- | ---------------------------------- | --------------- |
| `task.started`      | TechLead        | SwarmObserver, AuditLogger         | TaskInfo        |
| `task.completed`    | TechLead        | SwarmObserver, FeedbackIntegration | TaskResult      |
| `expert.selected`   | ExpertSelector  | SwarmObserver                      | ExpertInfo      |
| `routing.decision`  | CompositeRouter | SwarmObserver, FeedbackIntegration | RoutingDecision |
| `adapter.response`  | Adapters        | SwarmObserver                      | AdapterResponse |
| `vote.cast`         | VotingProtocol  | CorrelationTracker                 | VoteRecord      |
| `consensus.reached` | ConsensusEngine | AuditLogger                        | ConsensusResult |

## Middleware Chain

```
MCP Request
    │
    ▼
┌──────────────────┐
│  Rate Limiter    │ (per-tool throttling)
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Zod Validation  │ (input schema validation)
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Policy Firewall │ (execution policy enforcement)
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  STPA Safety     │ (hazard analysis)
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Tool Handler    │ (business logic)
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Logging         │ (structured audit)
└──────────────────┘
```

## Cross-Mode Parity

| Capability         | MCP                 | CLI             | Hybrid          | Parity Status |
| ------------------ | ------------------- | --------------- | --------------- | ------------- |
| Task Orchestration | `orchestrate`       | `orchestrate`   | Direct          | ✓ Complete    |
| Expert Creation    | `create_expert`     | N/A             | Programmatic    | ⚠ CLI gap     |
| Expert Execution   | `execute_expert`    | N/A             | Programmatic    | ⚠ CLI gap     |
| Workflow Execution | `run_workflow`      | `workflow run`  | Direct          | ✓ Complete    |
| Consensus Voting   | `consensus_vote`    | `vote`          | Direct          | ✓ Complete    |
| Expert Listing     | `list_experts`      | `expert list`   | Programmatic    | ✓ Complete    |
| Workflow Listing   | `list_workflows`    | `workflow list` | Programmatic    | ✓ Complete    |
| Model Routing      | `delegate_to_model` | `orchestrate`   | CompositeRouter | ✓ Complete    |

## Dependency Injection Points

| Interface         | Implementation                     | Injection Point     |
| ----------------- | ---------------------------------- | ------------------- |
| `IModelAdapter`   | ClaudeAdapter, GeminiAdapter, etc. | AdapterFactory      |
| `IExpert`         | CodeExpert, SecurityExpert, etc.   | ExpertFactory       |
| `IRouter`         | BudgetRouter, TopsisRouter, etc.   | CompositeRouter     |
| `IVotingProtocol` | VotingProtocol, WeightedVoting     | ConsensusEngine     |
| `IWorkflowEngine` | WorkflowEngine                     | MCP Tools           |
| `IOutcomeStorage` | SQLiteOutcomeStorage               | FeedbackIntegration |
| `ILogger`         | createLogger()                     | All components      |

## Error Propagation

```
Adapter Error
    │
    ▼
Result.err(CliError)
    │
    ▼
CircuitBreaker.recordFailure()
    │
    ├─── FallbackChains.tryNext() ─── Retry with different adapter
    │
    └─── (exhausted) ─── CompositeRoutingError
                              │
                              ▼
                         MCP ToolError
                              │
                              ▼
                         Client Error Response
```

---

_Last updated: 2026-01-29_
_Source: System Mandate - Loop A: Discovery + Wiring Graph Generation_
