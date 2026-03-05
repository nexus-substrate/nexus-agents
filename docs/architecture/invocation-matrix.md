# Invocation Matrix

Component call patterns for nexus-agents. Cross-reference with [wiring-graph.json](./wiring-graph.json).

## Entry Points

| Entry        | File                      | Purpose                        |
| ------------ | ------------------------- | ------------------------------ |
| MCP Server   | `src/cli-server.ts`       | Claude Desktop/CLI integration |
| CLI          | `src/cli.ts`              | Command-line interface         |
| Orchestrator | `src/cli-orchestrator.ts` | Standalone orchestration       |
| Library      | `src/index.ts`            | ESM module exports             |

## Layer-to-Layer Invocations

### External → Orchestration

```
MCP Server
    ├─→ orchestrate tool ──→ Orchestrator
    ├─→ create_expert ──→ ExpertFactory
    ├─→ execute_expert ──→ ExpertRegistry
    ├─→ run_workflow ──→ WorkflowEngine
    ├─→ consensus_vote ──→ ConsensusEngine
    └─→ delegate_to_model ──→ CompositeRouter
```

### Orchestration → Routing

| From         | To              | Type |
| ------------ | --------------- | ---- |
| Orchestrator | CompositeRouter | uses |
| ExpertSystem | CompositeRouter | uses |

### Routing → Execution

| Router          | Adapter       | Type   |
| --------------- | ------------- | ------ |
| CompositeRouter | ClaudeAdapter | routes |
| CompositeRouter | GeminiAdapter | routes |
| CompositeRouter | CodexAdapter  | routes |
| CompositeRouter | OllamaAdapter | routes |

### Execution → Learning

| From                | To                  | Type     |
| ------------------- | ------------------- | -------- |
| ClaudeAdapter       | FeedbackIntegration | reports  |
| GeminiAdapter       | FeedbackIntegration | reports  |
| FeedbackIntegration | OutcomeStorage      | persists |
| FeedbackIntegration | CompositeRouter     | updates  |

### Orchestration → Memory

| From           | To             | Type |
| -------------- | -------------- | ---- |
| Orchestrator   | ContextManager | uses |
| ContextManager | ContextPruner  | uses |

## Cross-Cutting Concerns

| From           | To                    | Type      |
| -------------- | --------------------- | --------- |
| MCPServer      | EventBusBridge        | uses      |
| EventBusBridge | OrchestrationObserver | publishes |
| MCPTools       | PolicyFirewall        | validates |
| Orchestrator   | SICAIntegration       | uses      |

## CLI Command Flows

### `nexus-agents orchestrate`

```
CLI → parseArgs → Orchestrator → Orchestrator
                                   ├─→ TaskDecomposition
                                   ├─→ ExpertSelection
                                   ├─→ CompositeRouter → ModelAdapter
                                   └─→ ResultSynthesis
```

### `nexus-agents review <url>`

```
CLI → GitHubClient → fetchPR
                       └─→ ReviewWorkflow
                              ├─→ CodeExpert
                              ├─→ SecurityExpert
                              └─→ ConsensusEngine → VotingProtocol
```

### `nexus-agents workflow run`

```
CLI → WorkflowParser → ExecutionPlanner
                          └─→ ParallelExecutor
                                 ├─→ StepExecutor (parallel)
                                 └─→ ResultAggregation
```

## MCP Tool Invocations

| Tool              | Dependencies               | Purpose                       |
| ----------------- | -------------------------- | ----------------------------- |
| orchestrate       | Orchestrator, ExpertSystem | Multi-agent task coordination |
| create_expert     | ExpertFactory              | Dynamic expert creation       |
| execute_expert    | ExpertRegistry             | Expert execution              |
| run_workflow      | WorkflowEngine             | Workflow template execution   |
| consensus_vote    | ConsensusEngine            | Multi-agent voting            |
| delegate_to_model | CompositeRouter            | Model routing                 |
| list_experts      | ExpertRegistry             | Discoverability               |
| list_workflows    | WorkflowRegistry           | Discoverability               |

## Event Bus Topics

| Topic            | Publishers      | Subscribers           |
| ---------------- | --------------- | --------------------- |
| agent.started    | Orchestrator    | OrchestrationObserver |
| agent.completed  | All Experts     | OrchestrationObserver |
| routing.decision | CompositeRouter | FeedbackIntegration   |
| model.response   | ModelAdapters   | OrchestrationObserver |
| consensus.vote   | ConsensusEngine | AuditLogger           |

---

_Generated from wiring-graph.json (v1.0.0)_
_See [MCP_PROTOCOL.md](./MCP_PROTOCOL.md) for protocol details_
