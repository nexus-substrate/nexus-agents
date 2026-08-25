# Dataflow Traces

_Actual code paths through the system. Every reference points to real source code._

_Generated: 2026-02-08_

---

## Flow 1: MCP Tool Request (orchestrate)

The most common flow. An MCP client calls `orchestrate` to run a multi-agent task.

```
1. MCP Client sends CallToolRequest
   |
2. cli-server.ts:379 → registerMcpTools() called during server startup
   |
3. cli-server-tools.ts:67 → createGatewayServerProxy(server, gatewayConfig)
   |  Wraps the MCP server so ALL tool registrations go through gateway middleware
   |
4. cli-server-tools.ts:137-150 → registerOrchestrateTool(server, deps)
   |
5. Gateway intercepts: gateway-middleware.ts:92-128
   |  → classifyRequestTier('orchestrate', params) → returns ORCHESTRATED (tier 3)
   |  → Logs GatewayLogEntry with tier + timestamp
   |  → Calls wrapped handler
   |
6. orchestrate.ts:409-432 → Handler registered via server.setRequestHandler
   |
7. orchestrate.ts:381-403 → createOrchestrateHandler()
   |  → Validates input via OrchestrateInputSchema (Zod)
   |  → Calls executeOrchestration()
   |
8. orchestrate.ts:~200 → executeOrchestration()
   |  → SharedTaskAnalyzer.analyze(task) → TaskAnalysisResult
   |  → WorkflowRouter.route(signals) → RoutingDecision (pattern + confidence)
   |  → Dispatches to selected pattern executor
   |
9. Pattern execution (example: graph)
   |  → GraphBuilder constructs DAG
   |  → executeGraph() runs nodes in topological order
   |  → Each node calls CLI adapter via deps
   |
10. orchestrate.ts:401 → Returns JSON response
    |  → gateway-middleware.ts:112 → Logs completion + duration
    |
11. MCP Client receives CallToolResult
```

---

## Flow 2: Model Routing (delegate_to_model)

Routes a task to the optimal model using the composite routing pipeline.

```
1. MCP Client calls delegate_to_model
   |
2. Gateway: tier classification → ANALYZED (tier 2)
   |
3. delegate-to-model.ts:169 → registerDelegateToModelTool()
   |
4. delegate-to-model.ts:108-157 → Handler
   |  → Validates via DelegateInputSchema
   |  → Checks deps.router availability
   |
5. IF router present (production path):
   |  → delegate-to-model.ts:120-140 → routeViaCompositeRouter()
   |  → composite-router.ts → Pipeline stages:
   |     a. BudgetRouter: Filters models exceeding budget
   |     b. ZeroRouter: Removes zero-scored models
   |     c. PreferenceRouter: Applies user CLI preferences
   |     d. TopsisRouter: Multi-criteria scoring (quality, cost, speed)
   |     e. LinUCB: Bandit exploration/exploitation
   |  → Returns { model, cli, reasoning, scores }
   |
6. IF no router (fallback path):
   |  → delegate-to-model.ts:147 → selectModel() local scoring
   |  → Uses scoreModel() from delegate-to-model-helpers.ts
   |  → Applies TASK_SPECIALIZATION_MATRIX bonus
   |  → Records outcome via OutcomeStore (best-effort)
   |
7. Returns { model, recommendation, reasoning, tokenEstimate? }
```

---

## Flow 3: Consensus Vote

Multi-agent voting with configurable strategies.

```
1. MCP Client calls consensus_vote
   |
2. Gateway: tier classification → ORCHESTRATED (tier 3)
   |
3. consensus-vote.ts:377 → registerConsensusVoteTool()
   |
4. consensus-vote.ts:114-118 → getVoterRoles()
   |  → quickMode=true → 3 roles | quickMode=false → 6 roles
   |  → Roles: architect, security, devex, ai_ml, pm, catfish
   |
5. consensus-vote.ts:234 → collectRealVotes()
   |  → Round-robin CLI assignment (Issue #845):
   |     If 2+ CLIs available, each role gets a different CLI
   |  → For each role:
   |     a. Build system prompt with role persona
   |     b. Call CLI adapter.execute(prompt)
   |     c. Parse vote response (approve/reject + reasoning)
   |
6. consensus-vote.ts:239 → processVotesThroughEngine()
   |  → ConsensusEngine.aggregate(votes, strategy)
   |  → Strategy determines threshold:
   |     simple_majority: >50%
   |     supermajority: >=67%
   |     unanimous: 100%
   |     proof_of_learning: majority + evidence
   |     higher_order: simple tally; correlation drives escalation only (#4701)
   |
7. Returns { decision, votes[], reasoning, confidence }
```

---

## Flow 4: Graph Workflow

DAG-based workflow execution with checkpointing.

```
1. MCP Client calls run_graph_workflow
   |
2. Gateway: tier classification → ORCHESTRATED (tier 3)
   |
3. graph-workflow.ts → registerRunGraphWorkflowTool()
   |
4. Template resolution:
   |  → Looks up template name in GRAPH_TEMPLATES registry
   |  → Templates: echo, pipeline, code-review, security-scan,
   |     security-audit, test-generation, documentation
   |
5. Graph construction:
   |  → GraphBuilder.addNode(id, config) for each template node
   |  → GraphBuilder.addEdge(from, to, condition?) for dependencies
   |  → GraphBuilder.build() → WorkflowGraph
   |
6. Execution (super-step model):
   |  → Find all nodes with satisfied dependencies (ready set)
   |  → Execute ready nodes in parallel
   |  → Checkpoint after each super-step
   |  → Evaluate conditional edges for next ready set
   |  → Repeat until all nodes complete or error
   |
7. Returns { result, checkpointId, nodeResults[] }
```

---

## Flow 5: AI Software Factory (execute_spec)

Full pipeline from natural language spec to validated implementation.

```
1. MCP Client calls execute_spec
   |
2. Gateway: tier classification → ORCHESTRATED (tier 3)
   |
3. spec-executor.ts → Handler validates input
   |
4. Pipeline stages:
   |
   a. parseSpec(naturalLanguageSpec)
   |  → Extracts structured requirements from prose
   |  → Returns ParsedSpec { goals, constraints, acceptanceCriteria }
   |
   b. decomposeSpec(parsedSpec)
   |  → Breaks into subtasks with dependencies
   |  → Returns DecomposedSpec { subtasks[], dependencyGraph }
   |
   c. compileSpecToGraph(decomposedSpec)
   |  → Converts subtask DAG to executable WorkflowGraph
   |  → Each subtask becomes a graph node
   |
   d. executeGraph(graph, context)
   |  → Runs the graph (see Flow 4)
   |  → Returns execution results per node
   |
   e. validateScenario(results, spec)
   |  → Checks results against acceptance criteria
   |  → Returns validation report
   |
   f. analyzeFailures(validationReport) [if failures exist]
   |  → Categorizes failure modes
   |  → Suggests remediation
   |
5. Returns { success, results, validation, failures? }
```

---

## Flow 6: Gateway Middleware (cross-cutting)

The gateway wraps all tool dispatch — it's not a standalone flow but a cross-cutting concern.

```
Every MCP tool call:
  |
1. cli-server.ts:373 → Builds GatewayConfig from app config
   |  → Includes tier overrides from nexus-agents.yaml
   |
2. cli-server-tools.ts:67 → createGatewayServerProxy(server, config)
   |  → Returns a proxy that intercepts server.setRequestHandler
   |
3. gateway-middleware.ts:70-73 → wrapTool(name, handler)
   |  → Wraps each tool handler with gateway logic
   |
4. On every tool call:
   |  → gateway-middleware.ts:93-94 → Extract tool args
   |  → classifyRequestTier(toolName, params, overrides)
   |     → Returns: DIRECT(1) | ANALYZED(2) | ORCHESTRATED(3)
   |  → Execute original handler
   |  → Log: { tool, tier, duration, success, timestamp }
   |
5. Tier classification (tier-classifier.ts):
   |  → DIRECT: list_experts, list_workflows, memory_stats, research_query
   |  → ANALYZED: delegate_to_model, memory_query, weather_report
   |  → ORCHESTRATED: orchestrate, consensus_vote, execute_spec, run_graph_workflow

NOTE: Gateway currently observe-only — it does NOT block or modify requests.
It classifies and logs for future governance enforcement.
```
