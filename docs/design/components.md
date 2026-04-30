# Component Inventory

_Evidence-backed inventory of all nexus-agents components. Every claim cites a source file._

_Generated: 2026-02-08_

---

## Module Summary

| Module        | Files | Tests | Layer | Purpose                                             |
| ------------- | ----- | ----- | ----- | --------------------------------------------------- |
| core          | 39    | 31    | 0     | Types, errors, logging, tracing, task analysis      |
| security      | 35    | 38    | 0     | Trust classification, policy gates, firewall        |
| config        | 25    | 15    | 1     | App config, model registry, routing config          |
| consensus     | 20    | 14    | 1     | Voting strategies, quorum, correlation              |
| agents        | 287   | 144   | 2     | Agent framework, experts, orchestrator              |
| adapters      | 26    | 19    | 2     | Direct API adapters, resilient wrapper              |
| cli-adapters  | 90    | 68    | 3     | CLI subprocess adapters, composite router           |
| learning      | 14    | 9     | 3     | Outcome feedback, A/B testing                       |
| orchestration | 33    | 17    | 4     | Graph workflows, spec factory, pattern router       |
| pipeline      | 20    | 18    | 4     | Task contracts, pipeline runner, event bus, plugins |
| mcp           | 81    | 71    | 4     | MCP server, 34 tool handlers, gateway               |

**Total: 650 source files, 426 test files**

---

## Layer 0: Foundation

### core/

The foundational module providing types, error handling, and task analysis.

**Key components:**

- **Result pattern** (`core/types/`): `ok(value)` / `err(error)` for fallible operations
- **Error hierarchy** (`core/types/`): `NexusError` base, specialized `ValidationError`, `ModelError`, `AgentError`
- **Logger** (`core/logger.ts`): Structured logger via `createLogger({ component })`. Supports sanitization.
- **Tracer** (`core/tracer.ts`): OpenTelemetry-compatible tracing with `getTracer()`, `withSpan()`
- **SharedTaskAnalyzer** (`core/task-analysis/shared-task-analyzer.ts`): Canonical task classification (ADR-0004). Consolidates 5 prior independent analyzers. Outputs: `taskType`, `complexity`, `reasoningType`, `ambiguityScore`, `constraints`, `requiredCapabilities`.
- **TaskAnalysisResult** extensions (Issue #903): `ambiguityScore` (0-1), `constraints` (time/quality/scope), `requiredCapabilities` (tools + experts).
- **Capability Gap Detector** (`core/task-analysis/capability-gap-detector.ts`, Issue #906): Cross-checks required capabilities against 34 registered tools and 10 expert roles.
- **Token Estimator** (`core/token-estimator.ts`): Approximate token counting for budget management.
- **ICompositeRouter** (`core/types/`): Interface for the canonical routing pipeline.

### security/

Trust classification and policy enforcement for untrusted input (Epic #818).

**Key components:**

- **Trust Types** (`security/trust/trust-types.ts`): 4-tier trust model (Authoritative, Semi-trusted, Untrusted, Hostile)
- **Input Sanitizer** (`security/input/`): Strips HTML injection vectors (`<picture>`, `<source>`, XML-like tags)
- **Trust Classifier** (`security/trust/trust-classifier.ts`): Classifies input by source (GitHub issue, comment, PR)
- **Policy Gate** (`security/policy/policy-gate.ts`): `evaluatePolicy()` / `canProceed()` for typed actions
- **Corroboration Validator** (`security/corroboration/`): Verifies claims against Tier 1 sources
- **Reputation Model** (`security/reputation/`): `assessReputation()` with bounded cache
- **Hostile Input Firewall** (`security/firewall/hostile-input-firewall.ts`, Issue #826): Composition layer over 8 security modules. Configurable stages. Agent Trust Labels (ATL).
- **Audit Trail** (`security/audit/`, Issue #832): Logs all security decisions

---

## Layer 1: Configuration & Consensus

### config/

Single source of truth for all model metadata and application configuration.

**Key components:**

- **Model Registry** (`config/model-capabilities.ts`, Issue #683): `DEFAULT_MODEL_CAPABILITIES` — pricing, quality scores, context windows, max output, CLI aliases for all supported models.
- **Model Helpers** (`config/model-config-helpers.ts`, Issue #807): Derived helpers — `getModelPricing()`, `buildModelInfo()`, `findCanonicalModel()`, `resolveCliAlias()`, `buildTopsisProfiles()`
- **App Config** (`config/schemas.ts`): Zod-validated `AppConfigSchema` — logging, security, observability, gateway
- **Defaults** (`config/defaults.ts`): `DEFAULTS` object — centralized timeout, rate-limit, retry, circuit-breaker defaults
- **Task Specialization Matrix** (`config/task-specialization.ts`, Issue #858): Maps 10 task categories to preferred CLIs with scoring bonuses

### consensus/

Multi-agent voting and decision aggregation.

**Key components:**

- **Consensus Engine** (`consensus/engine.ts`): `createConsensusEngine()` — tallies votes, applies strategies
- **Voting Strategies**: SimpleMajority, Supermajority, Unanimous, ProofOfLearning
- **Higher-Order Voting** (`consensus/strategies/`, Issue #333): Bayesian-optimal aggregation with correlation awareness
- **Quorum Validator** (`consensus/quorum.ts`, Issue #576): Unified quorum requirements
- **Correlation Tracker** (`consensus/correlation/`): Tracks agent agreement patterns

---

## Layer 2: Agents & API Adapters

### agents/

The largest module (287 files, 44% of source code). Contains the agent framework.

**Key components:**

- **BaseAgent / SimpleAgent** (`agents/base-agent.ts`): Abstract agent with lifecycle management
- **Orchestrator** (`agents/tech-lead.ts`, renamed Issue #759): Top-level coordinator that decomposes tasks and delegates to experts
- **ExpertFactory** (`agents/experts/expert-factory.ts`): Creates specialized expert agents (9 roles: code, architecture, security, documentation, testing, devops, research, pm, ux)
- **WaveScheduler** (`agents/wave-scheduler.ts`, Issue #769): Parallel agent execution with context exhaustion prevention. Launches in waves of 3-4.
- **AgentStateMachine** (`agents/state-machine.ts`): Lifecycle states for agent execution
- **ContextManager** (`agents/context/`): Token budget tracking and context pruning
- **Skills** (sub-exports): Reusable skill implementations
- **SICA** (sub-exports): Self-improving capability analysis
- **Forest-of-Thought** (sub-exports): Tree-based reasoning
- **ICTM** (sub-exports): AOrchestra-inspired agent creation (Issue #756)

### adapters/

Direct API adapters for model providers.

**Key components:**

- **AdapterFactory** (`adapters/factory.ts`): Registry pattern for adapter creation
- **BaseAdapter** (`adapters/base-adapter.ts`): Abstract base with retry, rate limiting
- **ResilientAdapter** (`adapters/resilient-adapter.ts`, Issue #811): Lazy detection, circuit breaker integration, automatic failover
- **Provider adapters**: Claude, OpenAI, Ollama, Gemini
- **StdinLifecycleMonitor** (`adapters/stdin-lifecycle.ts`, Issue #810): Zombie process prevention

---

## Layer 3: CLI Adapters & Learning

### cli-adapters/

CLI subprocess adapters and the canonical routing pipeline.

**Key components:**

- **CLI Adapters**: ClaudeCliAdapter, GeminiCliAdapter, CodexCliAdapter, CodexMcpAdapter — invoke CLI tools as subprocesses
- **Adapter Factory** (`cli-adapters/factory.ts`): `createAllAdapters()` — detects available CLIs
- **CompositeRouter** (`cli-adapters/composite-router.ts`, Issue #166): Canonical routing pipeline. Stages: BudgetRouter -> ZeroRouter -> PreferenceRouter -> TopsisRouter -> LinUCB
- **Circuit Breaker** (`cli-adapters/circuit-breaker.ts`, Issue #359): Per-adapter circuit breakers with registry
- **Response Cache** (`cli-adapters/response-cache.ts`, Issue #358): LRU caching for identical requests
- **Capacity Tracker** (`cli-adapters/capacity-tracker.ts`, Issue #456): Real rate limit tracking

### learning/

Closed-loop feedback for model routing optimization.

**Key components:**

- **OutcomeFeedbackCollector**: Records task outcomes (success/fail, duration, quality)
- **FeedbackIntegration** (Issue #167): Reward computation from outcomes
- **SQLiteOutcomeStorage** (Issue #188): Persistent outcome storage
- **ValidationStats** (Issue #273): Confidence intervals, regret analysis
- **AbTestTracker** (Issue #273): Experiment tracking for routing strategies

---

## Layer 4: Orchestration & MCP Server

### orchestration/

High-level workflow patterns and the AI software factory.

**Key components:**

- **GraphBuilder** (`orchestration/graph/graph-builder.ts`, Issue #831): DAG-based workflow construction with conditional edges
- **Graph Execution** (`orchestration/graph/`): Super-step execution, checkpointing, rollback
- **WorkflowRouter** (`orchestration/workflow-router.ts`, Issue #844): Rule-based pattern selection (sequential, wave, graph, consensus, aflow, puppeteer)
- **AI Software Factory** (`orchestration/spec/`, Epic #843): Full pipeline — `parseSpec` -> `decomposeSpec` -> `compileSpecToGraph` -> `executeGraph` -> `validateScenario` -> `analyzeFailures`
- **OutcomeStore** (`orchestration/outcomes/`, Issue #861): Bounded append-only store for task outcome tracking
- **Multi-CLI orchestration** (Issues #862-#866): `executeParallelExploration`, `executeTriangulatedReview`, `executeConsensusPlan`

### pipeline/

Task pipeline infrastructure: contracts, runners, plugins, and event bus.

**Key components:**

- **TaskContract** (`pipeline/task-contract.ts`): `TaskContractSchema` — canonical task shape with Zod validation
- **PipelineRunner** (`pipeline/pipeline-runner.ts`): Executes task contracts through registered plugins
- **PluginRegistry** (`pipeline/plugin-registry.ts`): Registers and resolves pipeline plugins
- **EventBus** (`pipeline/event-bus.ts`): Publish/subscribe event system for pipeline stage transitions
- **ArtifactStore** (`pipeline/artifact-store.ts`): Stores and retrieves task artifacts across pipeline stages
- **PolicyEngine** (`pipeline/policy-engine.ts`): Evaluates policy rules against pipeline state

### mcp/

MCP protocol server and tool handlers.

**Key components:**

- **Server** (`mcp/server.ts`): MCP 2025-11-25 protocol server
- **Tool Registration** (`mcp/tools/index.ts`): `registerTools()` — 34 tools total
- **Gateway** (`mcp/gateway/`, Issue #888): Tier classifier + middleware. Wraps all tool dispatch with classification (DIRECT, ANALYZED, ORCHESTRATED) and logging.
- **Rate Limiter** (`mcp/rate-limiter.ts`): Single shared bucket (capacity: 100, refill: 10/sec)
- **Tool handlers**: Each tool in `mcp/tools/*.ts`

**Registered tools (30):**
orchestrate, create_expert, execute_expert, run_workflow, delegate_to_model, list_experts, list_workflows, consensus_vote, research_query, research_add, research_add_source, research_discover, research_analyze, research_catalog_review, research_synthesize, memory_query, memory_stats, memory_write, weather_report, issue_triage, run_graph_workflow, execute_spec, registry_import, query_trace, repo_analyze, repo_security_plan, extract_symbols, search_codebase, run_dev_pipeline, run_pipeline
