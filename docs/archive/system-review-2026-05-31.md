---
title: Full System Review — 2026-05-31
description: Complete record of the 13-domain full-codebase fan-out review (14 agents) that ratified the closed-loop direction
tier: 2
keywords: [system-review, audit, findings, closed-loop, roadmap]
related_files: [../ALIGNMENT_ROADMAP.md]
---

# Nexus-Agents Full System Review — 2026-05-31

**Method:** 14-agent Workflow fan-out — 13 read-only domain reviewers + 1 chief-architect synthesis (~1.36M tokens).
**Outcome:** Closed-loop direction ratified 7-0 (higher_order `consensus_vote`). Tracked in **epic #3143** (children #3144–#3151).
**Why this doc exists:** the complete, evidence-cited findings are preserved here in git so nothing is lost to context limits. Per-domain findings are also filed as issues linked to #3143.

---

## Executive Summary

Nexus-agents is a well-architected, honestly-documented governance substrate with strong module boundaries (no circular deps, 18+ documented interfaces, clean MCP tool layer at 42/42 annotation parity). Every domain rates "adequate" or "strong" in isolation. The system's defining weakness is consistent across all 13 reviews and is structural, not local: the autonomous loop is a "C", not an "O". The write side is built and persists faithfully — OutcomeStore, FileAuditStorage, fitness-score, research synthesis, SwarmObserver health metrics, self-eval AggregatedResults — but the read-back/tune side is almost entirely unwired. Signals are produced and then either printed for humans, filed as GitHub issues, or written to stores nothing reads. Verified examples: createFeedbackSubscriber and its ensureFeedbackSubscriber auto-wire helper exist but are never invoked from production startup (only the definition and a test reference); SwarmObserver health metrics have zero consumers in cli-adapters/routing; self-eval results never reach OutcomeStore; improvement_review surfaces signals only as human-facing issue URLs; research synthesis never flows into the context retriever the plan/vote stages read. The biggest opportunity is therefore not new capability but CLOSING existing loops: a single SignalBus + tune stage that connects already-built producers to already-built consumers would convert ~5 separate "write-only" subsystems into a self-tuning whole and unlock the mission's headline claim (iterative self-tuning). Secondary cross-cutting opportunity: composability is real at the module level but undocumented and under-exported at the seam level (UnifiedAdapterRegistry, ConsensusEngine, OutcomeStore not in public barrels; no composition-patterns guide), blocking the "building-blocks shipped via npm" promise. Third: singletons (EventBus, ArtifactStore, OutcomeStore, ExpertPool, correlation tracker) are all in-memory and process-local, which is the hard blocker for distributed/multi-goal autonomy.

## Refined Mission

Nexus-agents is a governance substrate of composable building blocks — research, planning, voting/consensus, orchestration, QA, and security — that compose into pipelines and feed every action into a durable logging substrate. It is built to close the loop: outcomes, audits, evaluations, and fitness signals flow back to tune routing, thresholds, and plans, so the system measurably improves itself rather than only reporting on itself. Shipped via npm as documented, exported primitives, it generalizes beyond coding toward arbitrary goals, and acts as scaffolding that lets newer, more capable models operate safely and effectively under enforced rules. Today the producing half is built and honest; the mission is to make the consuming, self-tuning half real.

## Cross-Cutting Themes

### The loop is open: signals are written but never read back (the central mission gap)

_Affected: consensus-voting, orchestration-pipelines, security-audit, observability-feedback, research-memory-context, testing-eval, autonomous-readiness, mcp-public-api_

Across consensus, orchestration, security, observability, research-memory, testing, and autonomous-readiness, every domain independently reports the same failure: outputs are persisted but not consumed to change behavior. Vote recordings/correlation matrix not re-ingested; improvement_review only files issues; SwarmObserver metrics power dashboards only; self-eval never reaches OutcomeStore; research synthesis never reaches the context retriever; fitness score is read-only; hindsight beliefs flow outcomes->beliefs but never beliefs->voting. The 'tune' in plan->vote->implement->log->tune does not exist as an executable path.

### Built-but-unwired bridges (the glue is written, just not invoked)

_Affected: orchestration-pipelines, security-audit, routing-adapters-models, observability-feedback, autonomous-readiness_

Several integration points already EXIST in code but are never called in production: createFeedbackSubscriber/ensureFeedbackSubscriber (verified: defined, never invoked), feedback-integration.routeFeedbackToCompositeRouter (untested e2e), onRetirement adapter callback (defined, never wired), policyEnforcement firewall stage (declared, no-op), policy gate nodes in compiled plans (return success unconditionally). This makes closing the loop cheaper than it looks — much is a wiring task, not a build task.

### Process-local in-memory singletons block distributed and multi-goal autonomy

_Affected: orchestration-pipelines, consensus-voting, agents-framework, autonomous-readiness, routing-adapters-models_

EventBus, ArtifactStore, PluginRegistry, OutcomeStore (max 10k, in-memory), CompositeRouter learner state, correlation tracker, ExpertPool, and HeartbeatMonitor are all module-level singletons with reset-only cleanup and no persistence or injection point. This couples tests, prevents multiple independent pipelines in one process, and is the hard blocker for swarms/remote orchestrate sharing routing knowledge.

### Three+ disconnected policy/audit evaluation paths and two audit stores

_Affected: security-audit, orchestration-pipelines, mcp-public-api_

security/policy-gate, pipeline/policy-evaluator, and mcp/middleware/policy are independent evaluatePolicy implementations; in-memory AuditTrail and file-based FileAuditStorage have no bridge; firewall clears its audit trail every request. Policy enforcement is advisory (dryRun default) and not in the autonomous critical path. Compliance and the tuning loop both depend on a unified, persistent audit substrate that does not exist.

### Composability is real but undiscoverable: missing exports, missing factories, missing patterns

_Affected: mcp-public-api, cli-ux, docs-user-journey, Composability & Building Blocks, routing-adapters-models_

Module boundaries are clean but the composition UX fails. UnifiedAdapterRegistry/ConsensusEngine/OutcomeStore/getGlobalRegistry not in public barrels; export wiring fragmented across 20+ barrel files with recurring missed-re-export bugs; no createConsensusEngine/createOutcomeStore factories; no COMPOSITION_PATTERNS guide; CLI not self-describing (no command registry). A user has 42 tool names but no composition grammar.

### Schema drift and lossy error/identity handling at seams

_Affected: orchestration-pipelines, observability-feedback, testing-eval, autonomous-readiness_

Two TaskOutcome shapes (routing vs feedback-integration) with no compile-time alignment; AggregatedResult has no TaskOutcome mapping; stage errors collapse to String(e) losing stack/taxonomy; graph state lacks executionId so concurrent same-task runs collide; stage identity dropped in plan->graph compilation. These quietly break the data contracts any closed loop depends on.

### Routing decides CLI, not model — and routing knowledge is static

_Affected: routing-adapters-models, autonomous-readiness, observability-feedback_

CompositeRouter returns a CLI not a (CLI, model) pair; model is deferred to the subprocess. Model registry is built once and overlay/manifest updates never propagate. Two adapter hierarchies (IModelAdapter vs ICliAdapter) lack a bridge. Routing cannot express per-model quality/cost or hot-reload, weakening any outcome-driven tuning of routing.

### Correctness sharp edges in consensus aggregation

_Affected: consensus-voting_

opinion_wise omitted from fail_closed default; OWVoting.algorithm hardcoded mismatch; Bayesian weight reduction can collapse all agents to the floor; mixed-source votes skip ALL correlation recording. These are load-bearing for any autonomous voting path and are currently undertested.

## Prioritized Roadmap

1. **[XL] (epic) Build the SignalBus + Tune stage: one consumer for all existing signal producers** — The single highest-leverage move. Every domain's top mission-gap is 'signal produced, never consumed.' A unified SignalBus that all producers (OutcomeStore, FitnessAudit, SwarmObserver, improvement_review, self-eval, vote-rejection reasons) emit to, plus a tune stage that subscribes and emits parameter changes (routing downweights, threshold adjustments, auto-decomposed tasks), converts ~6 write-only subsystems into the self-tuning 'O' the mission promises. Closes the loop with mostly-existing parts.
2. **[M] Wire the bridges that already exist (feedback-subscriber, retirement callback, firewall policy stage, plan policy gates)** — Verified-cheap wins: createFeedbackSubscriber/ensureFeedbackSubscriber, onRetirement, firewall policyEnforcement stage, and compiled-plan policy gates are all written but never invoked. Invoking them at pipeline/server startup turns dead code into live feedback and enforcement at near-zero build cost.
3. **[L] (epic) Persist + unify the audit/outcome substrate (FileAuditStorage as source of truth; one TaskOutcome schema)** — Compliance, distributed autonomy, and tuning all require durable, queryable history. Bridge in-memory AuditTrail->FileAuditStorage, stop the firewall clearing on every request, unify the two TaskOutcome shapes with a compile-time mapping, and add requestId/traceId correlation. Prerequisite for the SignalBus tune stage to learn from real history.
4. **[L] (epic) Persistent, injectable OutcomeStore + router learner (replace process-local singletons)** — In-memory 10k-entry singletons block swarms, multi-goal runs, and surviving restarts. An optional SQLite/JSONL backend plus DI for EventBus/ArtifactStore/OutcomeStore/correlation-tracker unblocks distributed autonomy and removes test coupling.
5. **[M] Self-eval -> OutcomeStore -> improvement_review integration + e2e test** — Self-eval and benchmark results currently vanish. Mapping AggregatedResult->TaskOutcome and appending to OutcomeStore lets improvement_review surface code-quality-grounded signals, and a single e2e test (scan->eval->aggregate->append->review) guards the whole loop against schema drift.
6. **[M] Wire research synthesis into the context retriever (close the knowledge loop)** — research_synthesize output never reaches getContextForTask, so plan/vote stages are blind to the system's own research. Adding UnifiedContext.researchInsights (token-clipped) makes the knowledge substrate read-write and is required for 'accomplish any goal beyond coding.'
7. **[L] (epic) Publish composition primitives + COMPOSITION_PATTERNS guide** — Export UnifiedAdapterRegistry, ConsensusEngine, OutcomeStore, getGlobalRegistry, add missing createX factories, consolidate 20+ barrels, and write 3 worked composition examples (graph+consensus+outcomes). Delivers the 'building blocks shipped via npm' mission and stops recurring missed-re-export bugs.
8. **[S] Fix consensus correctness edges (opinion_wise fail_closed, OWVoting.algorithm, weight-collapse guard, mixed-source recording)** — Load-bearing for autonomous voting. Mostly single-line fixes plus a targeted integration test suite (fail_closed+higher_order, opinion_wise defaults, correlation under mixed sources). Cheap, high-correctness-leverage before voting drives unattended decisions.
9. **[L] (epic) Elevate model selection to routing tier + hot-reload registry** — Make route() return (CLI, model) and let registry overlays propagate post-startup. Without this, outcome-driven tuning can only steer CLI choice, not model choice — half the lever the mission wants for 'leveling up newer powerful models.'
10. **[M] Auto-create next-cycle tasks from improvement signals (close plan<-tune)** — For true autonomy, detected signals must become PipelineTasks fed into the next decompose() — not just GitHub issues. This is the concrete mechanism for 'never pause while backlog is non-empty' to be system-driven rather than human-driven.
11. **[M] Bounded-iteration cost/budget enforcement stage** — Loops cap iterations (vote<=3, QA<=3) but have no per-task spend ceiling vs plan estimate. A cost-enforcement stage that interrupts/escalates on overrun is a safety prerequisite before granting unattended multi-day operation.
12. **[S] Scheduled improvement_review + alerting (CronCreate + PushNotification)** — A daily improvement_review with fileIssues plus alerts on fitness-floor/security breaches makes the observability->action loop run without a human invoking it. Quick to stand up on existing tools; immediately makes the system feel autonomous.

## Overarching Plan

## Phased plan to a fully-autonomous, self-tuning substrate

**Guiding principle:** the producers exist; prioritize CLOSING loops over adding capability. correctness > simplicity > performance > cleverness throughout.

### Phase 0 — Correctness & cheap wiring (weeks 0-2)

- Fix consensus edges (opinion_wise fail_closed, OWVoting.algorithm config, weight-collapse guard, mixed-source partial recording) + integration tests.
- Invoke the already-written bridges at startup: ensureFeedbackSubscriber, onRetirement callback, firewall policyEnforcement stage, compiled-plan policy gates. Add e2e test proving FeedbackIntegration -> CompositeRouter.recordOutcome -> LinUCB/StrategyDistiller.
- Stop firewall clearing audit trail per request. Replace String(e) with getErrorMessage + retriable/fatal taxonomy on stage failures.
- Stand up scheduled improvement_review (CronCreate) with PushNotification alerts. Gives a visible, if shallow, autonomous heartbeat immediately.

### Phase 1 — Durable, unified substrate (weeks 2-6)

- Persistent OutcomeStore backend (JSONL/SQLite) behind the existing interface; inject EventBus/ArtifactStore/OutcomeStore/correlation-tracker via options. Keep singletons as defaults.
- Bridge AuditTrail -> FileAuditStorage; make FileAuditStorage the audit source of truth; add requestId/traceId/executionId correlation through firewall, graph state, and outcomes.
- Unify the two TaskOutcome shapes (one canonical type + compile-time mapper). Map AggregatedResult (self-eval) and benchmark results -> TaskOutcome and append.

### Phase 2 — The SignalBus (the keystone) (weeks 6-12)

- Define SignalBus: all producers (OutcomeStore, FitnessAudit, SwarmObserver, improvement_review, vote-rejection reasons, self-eval) emit typed Signals.
- Build the Tune stage as a subscriber that translates signals into bounded parameter changes: routing downweights for failing CLI/model+category pairs, adaptive thresholds/timeouts, and auto-created PipelineTasks for high-confidence improvement signals.
- Wire research synthesis into UnifiedContext (token-clipped) and feed hindsight beliefs backward into voting weights and plan prompts.

### Phase 3 — Composability as product (weeks 8-14, parallelizable)

- Export UnifiedAdapterRegistry, ConsensusEngine, OutcomeStore, getGlobalRegistry; add createX factories; consolidate barrels + pre-commit export-mirror check; ship COMPOSITION_PATTERNS.md + PIPELINE_BY_EXAMPLE.md; add a self-describing CLI CommandRegistry.

### Phase 4 — Routing depth + cost safety (weeks 10-16)

- route() returns (CLI, model); hot-reload registry overlays; cost-enforcement stage with per-task budget vs estimate and escalation.

### Phase 5 — Fully-autonomous operation (weeks 14+)

- Compose all of the above into a self-running orchestrator (see autonomousLoopDesign) that selects backlog work, votes, implements, logs, tunes, and re-plans without a human in the inner loop. Hard stops only per .rules/autonomous.md (cost gate, destructive blast radius, 3x-same-error wedge, blocked-on-external).
- Adaptive (data-driven) policy gates: gates read OutcomeStore+FitnessAudit and route to remediation experts based on learned patterns.

### Continuous

- Track every deferred item as a GitHub issue per .rules/track-deferred-work.md. Each phase ends with a consensus_vote on the next phase's scope (tie-break is the vote, not a human ask).

## Autonomous Loop Design

## Wiring existing primitives into a self-running loop

**The loop (outer controller, one iteration = one goal/task):**

1. SELECT — read the backlog top-down per .rules/autonomous.md: query OutcomeStore + improvement_review signals + open issues. Tie-break candidate work via `consensus_vote` (simple_majority), never a human ask. This selection step is the main MISSING GLUE — today nothing turns signals into a prioritized work queue.
2. RESEARCH — `research_discover` + `research_synthesize` on the chosen goal. MISSING GLUE: pipe synthesis into UnifiedContext.researchInsights so downstream stages actually read it (today it is write-only).
3. PLAN+VOTE — `run_dev_pipeline` / `executeConsensusPlan` (higher_order for arch/security). Feed hindsight beliefs and research-quality signals into voter weights. EXISTS but reads only raw text today.
4. IMPLEMENT — pipeline executes via GraphBuilder/executeGraph; agent-executor records outcomes. EXISTS.
5. LOG — outcomes -> OutcomeStore, audit events -> FileAuditStorage, traces -> TraceWriter. Producers EXIST; durability + correlation IDs are the gap.
6. TUNE — the keystone MISSING GLUE: a Tune stage subscribed to a new SignalBus that converts logged signals into (a) CompositeRouter.recordOutcome adjustments, (b) adaptive thresholds/timeouts, (c) auto-created PipelineTasks fed back into SELECT. `improvement_review`, `weather_report`, fitness-score, and SwarmObserver are the inputs; their outputs currently dead-end at dashboards/issues.
7. REPEAT — no stop on task completion; only the .rules/autonomous.md hard stops.

**Concrete wiring of existing primitives:**

- Use `run_graph_workflow` as the inner executor (checkpointable DAG), `run_dev_pipeline` as the plan->vote->implement->QA sub-pipeline, `consensus_vote` for both decisions and backlog tie-breaks.
- `verify_audit_chain` runs each iteration as the integrity gate before TUNE trusts the log.
- `weather_report` + `improvement_review` + `query_trace`/`query_task_state` are the observability inputs to TUNE.
- Outer controller scheduled via CronCreate; `PushNotification` on hard-stop conditions; `TaskCreate`/`TaskUpdate` to track in-flight goals.

**Named missing glue (build these):**

1. SignalBus — typed pub/sub all producers emit to (OutcomeStore, FitnessAudit, SwarmObserver, improvement_review, vote-rejection reasons, self-eval).
2. Tune stage — the only consumer that writes parameters back: routing downweights, adaptive thresholds, auto-decomposed tasks. Bounded + audited.
3. Backlog selector — turns SignalBus signals + open issues into a prioritized queue feeding SELECT.
4. ResearchContext wiring — synthesis -> UnifiedContext.
5. Hindsight->voting feedback — beliefs as voter-weight/prompt input.
6. Durable+correlated OutcomeStore/audit so TUNE learns from real, restart-surviving history.
7. Cost-enforcement stage so the loop can run unattended without runaway spend.

**Invoke-only (verified to already exist, just call them):** ensureFeedbackSubscriber, onRetirement callback, firewall policyEnforcement stage, compiled-plan policy gates, FeedbackIntegration.routeFeedbackToCompositeRouter.

## Quick Wins

- Fix consensus opinion_wise fail_closed default and make OWVoting.algorithm constructor-configurable — both single-line correctness fixes on a load-bearing autonomous path (consensus-voting domain).
- Invoke ensureFeedbackSubscriber at pipeline/server startup — verified-dead glue that already exists; turns on the outcome->routing feedback path for near-zero cost.
- Stop HostileInputFirewall clearing its audit trail on every process() call — currently loses all security events in any multi-input request (security-audit domain).
- Map self-eval AggregatedResult -> TaskOutcome and append to OutcomeStore + one e2e test — unblocks improvement_review consuming code-quality signals (testing-eval domain).
- Stand up a scheduled daily improvement_review (CronCreate) with fileIssues + PushNotification on fitness-floor/security breaches — instant visible autonomy on existing tools.
- Fix the broken FIRST_TASK.md link to the deleted SELF_DEVELOPMENT_WORKFLOW and add a 'when to use which orchestration tool' decision note — cheap docs fix that unblocks new-user composition (docs-user-journey domain).

---

## Domain Reviews (complete findings with evidence)

### consensus-voting (Bayesian/higher-order aggregation, voter roles, thresholds, error policies) — health: `adequate`

- **HIGH · correctness** opinion_wise strategy omitted from error-policy default logic
  - **Evidence:** src/mcp/tools/consensus-vote-types.ts:102-105 — getDefaultErrorPolicy() checks only 'unanimous' and 'higher_order' for fail_closed, not 'opinion_wise'. Opinion_wise is aliased to higher_order semantically (types-core.ts:16) but diverges in error policy defaults, causing inconsistent fail-closed behavior when opinion_wise votes encounter errors.
  - **Fix:** Add 'opinion_wise' to the fail_closed check: `if (strategy === 'unanimous' || strategy === 'higher_order' || strategy === 'opinion_wise') return 'fail_closed'`. This should be a single-line fix, but requires documentation update and test coverage for the opinion_wise alias.
- **HIGH · correctness** OWVoting algorithm property misalignment with HigherOrderVotingStrategy
  - **Evidence:** src/consensus/higher-order-voting.ts:52 — OWVoting.algorithm hardcoded to 'simple_majority'; HigherOrderVotingStrategy.algorithm set to 'opinion_wise' (line 254). When OWVoting is instantiated directly (vs via HigherOrderVotingStrategy subclass), the factory and correlation tracker see the wrong algorithm label. This breaks algorithm tracking and strategy dispatch in scenarios where createOWVoting() or `new OWVoting()` is used outside the factory.
  - **Fix:** Make OWVoting.algorithm configurable in the constructor (e.g., `algorithm?: ConsensusAlgorithm` parameter), defaulting to 'simple_majority' for backward compatibility. HigherOrderVotingStrategy can override it in constructor. Ensures consistency whether OWVoting is created directly or via the factory.
- **MED · modularity** Correlation tracker singleton and determinism assumptions not documented
  - **Evidence:** src/mcp/tools/consensus-vote.ts:80-92 — getOrCreateCorrelationTracker() maintains a module-level singleton without documented lifecycle, reset semantics, or thread safety. Tests export resetCorrelationTracker() but production code has no documented way to clear/rotate trackers. Higher-order voting depends on tracker state, but the state persists across consensus_vote tool invocations with no visibility into accumulation or memory bounds.
  - **Fix:** Document the singleton lifecycle, max observation limits, and reset behavior in comments. Consider adding a public API for coordinator (orchestrate, run_dev_pipeline) to signal tracker reset between major milestones. Add logging when proposals are evicted from the tracker to surface memory pressure.
- **MED · correctness** Higher-order voting misses recording when non-LLM votes are present
  - **Evidence:** src/mcp/tools/consensus-vote.ts:296-302 — recordVotesToTracker() skips ALL correlation recording if any vote source != 'llm' (including simulations, errors). This silently breaks correlation tracking for mixed-source voting (e.g., quickMode escalation to full panel where one voter was simulated). The correlation matrix is stale and higher-order future votes will use outdated data.
  - **Fix:** Split recording: (a) record only the LLM votes to the tracker; (b) log a note when mixed sources prevent full recording. This preserves correlation insights from real voters while acknowledging partial gaps. Update comment to explain the policy.
- **MED · correctness** Error policy and higher-order voting integration untested
  - **Evidence:** src/consensus/_.test.ts and src/mcp/tools/_.test.ts — no test fixtures covering fail_closed + higher_order combinations, opinion_wise error handling, or error policy interaction with correlation-aware voting. Agreement-cascade.test.ts covers early closure but not error-policy cascade interactions.
  - **Fix:** Add integration test suite: (1) fail_closed + higher_order with 1+ errors, (2) error policy default for opinion_wise matches higher_order, (3) error policy + contrarian escalation interactions, (4) correlation tracking under mixed error/llm votes. These are load-bearing paths for autonomous voting pipelines.
- **MED · correctness** Bayesian aggregation weight bounds not validated, can zero out agent influence
  - **Evidence:** src/consensus/higher-order-helpers.ts:107-108 — computeEffectiveWeights() clamps agent weights to Math.max(0.1, weight) to avoid over-penalizing, but the reduction formula `weight - reduction * 0.5` can still drive weights toward the floor when many agents are correlated. No validation that at least some agent weight remains >0.1, risking degenerate distributions where all agents are equally downweighted.
  - **Fix:** After the reduction loop, validate that at least one agent has weight > 0.5 (unpenalized). If all agents are heavily downweighted, log a warning and restore uniform weights (fallback to simple voting). This prevents correlation-driven consensus collapse.
- **MED · modularity** Composability friction: HigherOrderVotingStrategy tightly coupled to correlation persistence
  - **Evidence:** src/consensus/higher-order-voting.ts:176-206 (aggregate method) and src/mcp/tools/consensus-vote.ts:273-288 (runHigherOrderVoting) — OWVoting.aggregate() method requires an ICorrelationTracker argument, but the MCP tool always uses getOrCreateCorrelationTracker() (singleton). Higher-order voting cannot be used as a reusable building block in other pipelines without coupling to the singleton or modifying the aggregate signature.
  - **Fix:** Add a factory-level option to OWVoting constructor to inject a tracker, defaulting to the persistent singleton if omitted. This allows autonomous agents, test harnesses, and custom pipelines to supply their own tracker without modifying the voting logic. Enables better composability and testability.
- **LOW · architecture** quickMode escalation logic incomplete for higher_order strategy
  - **Evidence:** src/mcp/tools/consensus-vote.ts:477-491 (maybeEscalateContrarian) — escalation is only triggered when quickMode=true and outcome='approved'. For higher_order strategy, the escalation should also trigger on low-confidence posteriors (e.g., posteriorApproval near 0.5) even with approval, since Bayesian voting confidence is a first-class signal. Currently, a contrarian re-vote only fires on strict outcome, not on confidence bounds.
  - **Fix:** Extend escalation policy: trigger re-vote when `quickMode && (outcome === 'approved' && strategy === 'higher_order' && higherOrderResult.posteriorApproval < 0.65)`. This catches borderline Bayesian consensus as well as clean approvals, improving robustness for autonomous decisions.

**Composability:** Consensus-voting is well-modularized at the engine layer (ConsensusEngine, IVotingStrategy, VotingStrategyFactory) but has friction points in higher-order voting integration: (1) Correlation tracker is a persistent singleton with no injection point for alternative backends or test doubles; (2) OWVoting.aggregate() requires an ICorrelationTracker but has no way to override the global tracker from pipeline configs; (3) Error-policy and higher-order voting are logically independent but lack formal coupling documentation. To improve composability for autonomous pipelines: make tracker configurable in OWVoting constructor, split error-policy logic into a higher-level decorator, and export a higher-order voting builder that accepts optional tracker + config. Current setup works for the MCP tool but forces workarounds in custom orchestrators."

**Mission gaps:**

- No metrics or audit trail for correlation matrix convergence — pipelines cannot introspect whether independent-subset detection is stable or still learning.
- Missing adaptive thresholds: all strategies use static VOTING_THRESHOLDS; no support for confidence-weighted or uncertainty-adjusted thresholds that Bayesian voting could naturally express.
- Correlation tracking assumes vote history is available, but no mechanism to seed tracker with prior observations or pre-trained correlations for new agent cohorts.
- No explicit handling of adversarial agent patterns (sycophancy, groupthink) in higher-order aggregation beyond correlation downweighting — missing signal integration from the VotingProtocol's sycophancy detection.
- Plan→vote→implement→log feedback loop is incomplete: vote recordings and consensus metrics are written but not automatically ingested into agent performance or correlation tracker for closed-loop tuning.

---

### orchestration-pipelines (nexus-agents V2) — health: `adequate`

- **HIGH · architecture** Singleton EventBus/ArtifactStore/PluginRegistry creates invisible dependencies and test coupling
  - **Evidence:** src/pipeline/event-bus.ts:13-21, artifact-store.ts:140-153, core-plugins.ts:145-149 — global state via lazy singleton pattern with reset-only cleanup. No constructor injection in PipelineRunner or DevPipeline; getPipeline\*() calls are implicit dependencies that break composability.
  - **Fix:** Inject EventBus/ArtifactStore/PluginRegistry into PipelineRunner and stage executors rather than via getPipeline\*() singletons. Add dependency factory to PipelineRunnerOptions so callers can wire multiple independent pipelines in same process (e.g., parallel test suites, multi-tenant). Move reset helpers behind a dedicated TestHarness facade.
- **HIGH · correctness** Error context loss in stage execution — String(e) drops stack traces and error types
  - **Evidence:** src/pipeline/stage-wrappers.ts:75-76,104-105,129-130 (8 catch blocks using String(e)); agent-executor.ts:51-84 recordOutcome() skips outcome recording on bridge failure without propagating error to caller. Graph executor catches node errors but surface 'unknown' messages.
  - **Fix:** Use getErrorMessage() utility consistently. Preserve Error.stack in logged error details. In stage-wrappers, return structured error type with cause + stack instead of string. Emit 'stage.failed' event with errorTaxonomy ('retriable'|'fatal') per event-types.ts intent (line 118).
- **MED · mission-gap** PolicyEngine unused at stage boundary — no actual enforcement in execution path
  - **Evidence:** src/pipeline/policy-engine.ts creates PolicyEngine but only evaluatePolicy() in v2-delegate.ts is called, only for initial task gate. Policy gates in PlanContract (plan-compiler.ts:140-125) become no-op graph nodes returning { success: true, outputArtifacts: [] }. Actual stage-to-stage policy checks never wired.
  - **Fix:** Wire PolicyContext into graph node execution: extract stageId/stageType from current node, snapshot pipelineState from graph state, call evaluatePolicy() before node handler. In 'block' mode, return failed NodeResult with policyViolation reason. Document as Phase 5-2 per ADR-001.
- **MED · modularity** PipelineRunner → GraphBuilder → executeGraph chain loses mid-layer composability
  - **Evidence:** src/pipeline/pipeline-runner.ts:95-160 — compilePlan() opaquely calls GraphBuilder.addNode(createStageHandler()). Stage handler wraps plugin.execute() but error handling is silent (lines 98-114: placeholder returns on missing plugin). Graph executor (graph-executor.ts:732-848) knows only NodeHandler type, not PipelinePlugin or StageSpec.
  - **Fix:** Add StageContext type that includes stageId, pluginId, pipelineId so handlers can emit stage events and record outcomes without re-parsing node id. Create typed NodeHandler factory: (spec: StageSpec, registry: IPluginRegistry) => NodeHandler so compilation preserves stage identity. Expose compilePlan result with stage→node mapping.
- **MED · mission-gap** EventBus → OutcomeStore bridge is manual and incomplete — no auto-feedback
  - **Evidence:** src/pipeline/feedback-subscriber.ts:1-30 defines createFeedbackSubscriber() but is never called in production code (grep finds 0 invocations). agent-executor.ts recordOutcome() writes directly to OutcomeStore, bypassing event bus. TraceWriter (trace-writer.ts) subscribes to EventBus but does not feed outcomes for routing.
  - **Fix:** Auto-wire feedback subscriber at PipelineRunner startup if eventBus is provided. Wire weather_report (agent-executor-routing feedback) as an observable that routing stages consume. Document as Phase 4-2 per ADR-006.
- **MED · correctness** Implicit task-to-context wiring in graph-executor misses production failure modes
  - **Evidence:** src/orchestration/graph/graph-executor.ts:61-82 populateUnifiedContextOnState() infers task category from state['task'] string and silently fails if context retrieval throws (line 80-81). Graph state has no task correlation ID, so stashed context can be stale if parallel graphs run same task.
  - **Fix:** Require executionId in GraphState. Pass it to getContextForTask() for deduping/TTL. In failure case, emit 'context.unavailable' event with fallback empty context, not silent catch. Add tests for concurrent execution with same task.
- **MED · correctness** Plan-to-graph compilation loses policy gate semantics — gates become no-ops
  - **Evidence:** src/pipeline/plan-compiler.ts:117-125 createGateHandler() returns Promise.resolve({ status: 'passed' }). PolicyGateSpec has no mapping to enforcer. Policy decisions happen at input time (v2-delegate.ts) or via evaluatePolicy() (policy-evaluator.ts) but never at inter-stage boundaries where gates should enforce.
  - **Fix:** Move policy evaluation from input-time to stage-boundary: wrap each stage node with a pre-stage gate node that calls evaluatePolicy(). Pass stageId, stageType into gate handler. Fail fast in block mode; emit event in warn mode.
- **LOW · user-journey** Stage task tracker integration is fragile — tracker creation is caller responsibility
  - **Evidence:** src/pipeline/agent-executor.ts:103-104 AgentExecutorConfig.tracker is optional; downstream code checks undefined and skips GitHub issue creation (lines 340-370). DevPipeline never passes tracker to agent-executor, so dev pipeline tasks never surface to GitHub.
  - **Fix:** Make tracker creation automatic: pass repo/issueNumber to DevPipelineOptions, create tracker in runDevPipeline, pass to agent-executor. If repo not provided, use in-memory tracker that logs. Document GitHub-less usage.

**Composability:** Moderate coupling via singletons and implicit context flow. EventBus/ArtifactStore/PluginRegistry are intended as pluggable boundaries but are hidden behind module-level getter functions, making it hard to instantiate multiple independent pipelines. GraphBuilder/executeGraph layers are clean and reusable, but the PipelineRunner/DevPipeline wrappers on top leak implementation details (policy gates become no-ops). Stage error handling converts exceptions to string, losing context for debugging and outcome classification. The plan-to-graph compilation preserves task metadata but drops stageSpec identity, so stage handlers cannot correlate their execution with pipeline-level tracing without re-parsing node IDs."

**Mission gaps:**

- Policy enforcement at stage boundaries is declared (PolicyGateSpec in plans) but never executed — gates are no-op graph nodes. Phase 5 vision requires active enforcement; currently only input-time checks exist.
- EventBus → OutcomeStore feedback loop is manually wired in test code only; production pipelines do not feed execution outcomes back to routing decisions per Phase 4 closure goals.
- Cross-stage error taxonomy (retriable vs fatal per event-types.ts:118) is declared but never populated — all stage failures treated equally, so retry logic cannot distinguish transient from permanent failures.
- Unified memory context (Phase 3 of #2792) is stashed in graph state but consumed only by graph-executor, not by stage implementations. Stage handlers cannot access beliefs/patterns/outcomes without additional lookups.
- Task-to-outcome correlation is implicit via string task description, not explicit via taskId. Concurrent executions with same task text will collide in OutcomeStore without deduping by executionId.

---

### routing-adapters-models — health: `adequate`

- **HIGH · architecture** Two disconnected adapter hierarchies (IModelAdapter vs ICliAdapter) without bridge
  - **Evidence:** /src/adapters/resilient-adapter.ts:70 (IModelAdapter plane) vs /src/cli-adapters/composite-router.ts:163 (ICliAdapter plane)
  - **Fix:** Define a unified adapter interface that supports both model-level (provider) and CLI-level (subprocess) dispatch. Implement adapter composition layer so routing decisions can express model preferences, not just CLI choices. Unifies the two planes into a single routing→model→execute pipeline.
- **HIGH · modularity** UnifiedAdapterRegistry not exported; building-block vision unrealized
  - **Evidence:** /src/adapters/index.ts:172-180 exports UnifiedAdapterRegistry, but /src/exports/adapters.ts does not; only internal code (cli-server.ts) imports it
  - **Fix:** Export UnifiedAdapterRegistry from main entry points (src/index.ts, src/exports/adapters.ts). Add public factory function createUnifiedRegistry(). Document as a reusable primitive for custom routing logic. Enables operators to build domain-specific routing strategies without reaching into internals.
- **HIGH · correctness** Model registry is static at initialization; overlay updates never propagate to routing
  - **Evidence:** /src/adapters/unified-registry.ts:299-311 (buildTaskRouting called once in constructor); /src/config/model-registry.ts:292-314 (lazy singleton built once, never refreshed)
  - **Fix:** Implement hot-reload for model registry: either subscription-based (routing subscribes to registry change events) or polling-based (periodic re-check of task specialization matrix). Ensure manifest overlays applied post-startup (e.g., via NEXUS_MODELS_OVERLAY_PATH update) propagate to routing decisions within bounded time.
- **MED · correctness** ResilientAdapter.refresh() is not atomic; concurrent requests can race state clears
  - **Evidence:** /src/adapters/resilient-adapter.ts:162-167 (clears currentAdapter synchronously without quiescing inflight); line 196-200 (dispose does not block or drain pending work)
  - **Fix:** Implement quiescence tracking: before clearing cached adapter, wait for ongoing requests to drain (with timeout). Add onFailover callback guarantee—either all callbacks complete or log which failed. Consider async dispose() signature instead of void. Prevents mid-request adapter swap from corrupting streaming state.
- **MED · user-journey** MODEL_NOT_FOUND fallback is silent; retirement events invisible to operators
  - **Evidence:** /src/adapters/model-not-found-fallback.ts:135-150 (completeWithFallback detects 404, picks fallback, retries, surfaces second error with no retirement indicator); onRetirement callback defined but never wired in production code
  - **Fix:** Wire onRetirement callback through adapter construction path. Log retirement decision with modelId, fallback id, and reason (e.g., vendor 404). Emit event to orchestration observer for telemetry/alerting. Helps operators detect vendor model churn and adjust task specialization matrix before outages.
- **MED · user-journey** AvailableModelsCache filtering is best-effort; missing cache hides model unavailability
  - **Evidence:** /src/cli-adapters/composite-router.ts:639-653 (getCandidateCliNames silently falls back to all CLIs if cache is undefined or returns empty)
  - **Fix:** Make cache wiring explicit: warn at router construction time if cache is undefined but would be useful (e.g., in multi-tenant mode). Log cache misses / fallback-to-all events at INFO level. Optionally fail routing if cache is configured but returns empty (strict mode for operators who depend on it).
- **MED · correctness** CompositeRouter never observes which model the CLI adapter will actually use
  - **Evidence:** /src/cli-adapters/composite-router.ts:601-607 (route picks CLI, builds CliTask); /src/cli-adapters/types-capability.ts:70-85 (CliTask.model is optional); subprocess adapter then selects default model or task.model override
  - **Fix:** Elevate model selection to routing tier: add required model field to CliTask, compute it in routing pipeline (not deferred to subprocess). Route returns (CLI, Model) pair explicitly. Allows routing stages to see full decision and enables per-model quality scores, cost estimates, and capability matching.
- **LOW · modularity** AdapterFactory pattern defined but not used; CLI adapters use hardcoded switch
  - **Evidence:** /src/adapters/factory.ts:79-195 (extensible factory with registry) vs /src/cli-adapters/factory.ts:51-75 (createCliAdapter is switch statement, not composable)
  - **Fix:** Implement factory registry for CLI adapters: registerCliAdapterCreator(cli, creator). Swap hardcoded switch for factory.get(). Enables operators to plug in custom CLI implementations (e.g., OpenCode variant, internal tool bridge) without modifying core code.

**Composability:** The domain is currently adequate for the CLI orchestrator use case (cli/orchestrate-command.ts) but NOT composable as building blocks. UnifiedAdapterRegistry, model registry, and adapter factories are internal primitives. External pipelines cannot import registry to implement custom routing, observe model fallback/retirement events, hot-reload model metadata post-startup, or implement custom adapters via factory pattern. To enable building-blocks→pipelines vision: export UnifiedAdapterRegistry and factories as public API, implement subscription-based model registry updates, define adapter lifecycle event contracts, and replace hardcoded CLI switch with extensible factory."

**Mission gaps:**

- Routing decisions express CLI choice only, not model preference; decouples model selection from task requirements
- UnifiedAdapterRegistry is not publicly composable; operators cannot implement domain-specific routing strategies
- Model metadata changes post-startup (manifest overlays) do not propagate to cached routing decisions
- Adapter lifecycle events (failover, retirement, disposal) are not observable to external systems for telemetry and orchestration
- CLI adapters hardcoded in switch statement; no plugin/extensibility path for custom CLI implementations

---

### security-audit (trust tiers, firewall, reputation, policy-gate, audit-trail, access-constraint-deriver) — health: `adequate`

- **HIGH · correctness** Audit emission gap in policy-gate.ts — no integration with audit-trail
  - **Evidence:** src/security/policy-gate.ts line 193-220; src/security/audit-trail.ts exports emitPolicyEvent() but policy-gate.ts evaluatePolicy() never calls it
  - **Fix:** Add audit emission to evaluatePolicy(). Callers in issue-triage.ts (line 274) and pr-reviewer.ts (line 417) invoke evaluatePolicy() without capturing audit trail. Either: (1) make evaluatePolicy() accept an optional AuditTrail and emit, or (2) require callers to manually emit via emitPolicyEvent() after receiving PolicyDecision. Currently violations are lost from audit trail.
- **HIGH · correctness** Firewall audit trail cleared on every process() call — events lost in request sequences
  - **Evidence:** src/security/firewall/firewall-pipeline.ts line 102: this.auditTrail.clear() in process(). MAX_EVENTS=10,000 in audit-trail.ts line 24 but firewall clears before each request
  - **Fix:** Audit trail should persist across requests or integrate with FileAuditStorage. Consider: (1) remove clear() and let AuditTrail handle bounded history internally, (2) export audit trail to FileAuditStorage after process() completes, or (3) provide a mechanism to drain/flush events to persistent storage without losing them. Current design loses all events when a second input is processed.
- **MED · modularity** Two parallel audit systems with no connection — in-memory AuditTrail vs FileAuditStorage
  - **Evidence:** src/security/audit-trail.ts (357 lines) is in-memory only; src/audit/audit-storage.ts (346 lines) is file-based; no integration layer or bridge between them
  - **Fix:** Add a persistence adapter that flushes AuditTrail events to FileAuditStorage. Create a FirewallAuditBridge (similar to createGraphAuditBridge) that lets HostileInputFirewall emit to both systems. Without this, security/audit-trail is transient and cannot serve as the source-of-truth for compliance audits. FileAuditStorage is currently only used by MCP tool middleware, not by the threat-model-critical firewall.
- **HIGH · mission-gap** Policy-gate enforcement not wired into the mission-critical plan→vote→execute→log loop
  - **Evidence:** src/security/policy-gate.ts evaluatePolicy() is a pure function with no effect hooks. Pipeline V2 (src/pipeline/policy-evaluator.ts) and MCP middleware (src/mcp/middleware/policy.ts) have separate evaluatePolicy() implementations unrelated to security/policy-gate.ts
  - **Fix:** Unify the three policy evaluation paths: (1) security/policy-gate (actions, trust tiers), (2) pipeline/policy-evaluator (stage rules), (3) mcp/middleware/policy (tool access). Currently issue-triage.ts and pr-reviewer.ts call security/policy-gate.evaluatePolicy() but the orchestration loop does not. Create a PolicyGateMiddleware that wraps this into the HostileInputFirewall pipeline and ensures all violations bubble to FileAuditStorage for the logging→tuning feedback loop.
- **MED · correctness** Effective trust tier reconciliation not enforced — reputation demotion invisible to policy-gate callers
  - **Evidence:** src/security/firewall/firewall-pipeline.ts lines 121, 124: effectiveTrustTier is computed and included in FirewallResult, but callers like issue-triage.ts and pr-reviewer.ts never received this. They only get trust.trustTier from ClassifyResult
  - **Fix:** Return effectiveTrustTier from firewall.process() in a visible field and ensure all policy-gate callers use it, not the classifier-only tier. Alternatively, make firewall compose policy-gate evaluation internally so the demotion is automatic. Add test coverage verifying that Tier-1 users with injection patterns downgrade correctly before policy decisions.
- **MED · architecture** Access constraint deriver missing from build; LLM path unreachable due to gating
  - **Evidence:** src/security/access-constraint-deriver/deriver.ts line 57-98 shows LLM path gated by trust tier (gateTrust). Trust Tier 3/4 always falls back to regex. But deriveWithTelemetry() never actually saves or retrieves policies from FileAuditStorage for compliance tracking
  - **Fix:** Route access-constraint policies through FileAuditStorage so policy derivations (both LLM and fallback) are auditable. Currently in-memory cache only; add a persistent policy registry. Also document the 7 PR conditions (#1977) that gate LLM path — unclear if they are enforced or still pending.
- **LOW · modularity** Audit trail query interface incomplete — missing index/search on trust tier, action type, violator
  - **Evidence:** src/security/audit-trail.ts lines 156-177: query() filters by type/since/until/trustTier only. No search by actionType, username, violation reason, or resource.
  - **Fix:** Extend AuditQuery interface to support actionType, actor, resource, violationType, and policyName. Add corresponding filters to query(). This is needed for security post-mortems ("which Tier-3 users triggered policy violations last week?") and for the tuning feedback loop to identify patterns.
- **HIGH · correctness** Rule of Two enforcement only in policy-gate, not enforced during firewall composition
  - **Evidence:** src/security/policy-gate.ts lines 125-136: checkRuleOfTwo checks CONTEXT (hasWriteAccess, hasSecretAccess) but firewall process() never populates ActionContext with these fields. Firewall stages.policyEnforcement defaults to true but is never connected to evaluatePolicy()
  - **Fix:** Wire firewall's policyEnforcement stage to actually call evaluatePolicy() if enabled. Currently the stage exists but is a no-op (line 48 declares it, but code never uses it). Populate ActionContext from firewall config (hasWriteAccess, hasSecretAccess) so Rule of Two fires.

**Composability:** The domain has strong intent but weak execution. AuditTrail, policy-gate, trust-classifier, and firewall are well-factored as isolated modules with clear interfaces, but they don't compose into a cohesive pipeline. The firewall absorbs input sanitization, trust classification, and reputation assessment but stops short of policy enforcement — evaluatePolicy() is still called ad-hoc by upper layers (issue-triage, pr-reviewer) without audit integration. FileAuditStorage is only wired for MCP middleware, not for the security subsystem. This breaks the building-blocks-to-pipelines vision: you cannot chain firewall → policy → audit → logger without manual glue code. Recommendation: Create a SecurityPipeline orchestrator that composes firewall + policy-gate + audit emission + file logging as a single reusable building block, allowing higher-level code (plan/vote/execute) to call a single entry point that logs everything.

**Mission gaps:**

- Audit trail not fed into the log→tune feedback loop: FileAuditStorage is populated by MCP middleware but not by security/firewall or policy-gate, so the system cannot observe patterns in policy violations to auto-tune trust thresholds.
- No persistent policy registry for access-constraint-deriver derivations: Policies are cached in memory only; compliance audits cannot reconstruct what policies were applied to what objectives.
- Effective trust tier not propagated to policy-gate callers: Reputation-based demotion happens in firewall but is invisible to the action-validation layer, so policy decisions may use stale (classifier-only) trust tiers.
- Policy-gate not in critical path for autonomous execution: issue-triage and pr-reviewer call evaluatePolicy() but their results are advisory (dryRun:true by default); the orchestration loop doesn't gate actions based on policy decisions.
- Cross-repo/cross-session audit correlation missing: AuditTrail is per-firewall instance (no requestId/traceId), FileAuditStorage has requestId/traceId but firewall never emits them.

---

### mcp-public-api — health: `strong`

- **HIGH · modularity** Incomplete exports in mcp.ts — research and memory tools missing from public barrel
  - **Evidence:** src/exports/mcp.ts:275 (end of file) vs src/mcp/tools/index.ts:614 (complete barrel)
  - **Fix:** Audit mcp.ts exports against tools/index.ts REGISTERED_TOOL_NAMES (42 tools). Currently missing research output schemas (ResearchQueryResponse, ResearchAnalyzeResponse), memory response types (MemoryQueryResponse, MemoryStatsResponse), async job types (GetJobResultResponse, CancelJobResponse), and improvement_review types (ImprovementReviewResponse). Add missing exports to restore public parity — callers embedding nexus-agents must re-export or re-declare these types.
- **MED · architecture** Tools register schemas twice — schema duplication in registerTool() functions
  - **Evidence:** src/mcp/tools/{research-query,memory-query,consensus-vote}.ts: both exported InputSchema and inline schema in registerTool()
  - **Fix:** Tools export InputSchema as public API but recreate it inside registerTool() (lines 15-25 of research-query.ts). Extract to a helper: `function getTool(schema: ZodSchema)` that builds schema once. Reduces duplication and ensures schema/registration parity; also cuts 50+ lines from per-tool registration boilerplate.
- **MED · user-journey** Missing tool composition patterns — no canonical guide for tools calling other tools
  - **Evidence:** src/mcp/tools/orchestrate-dispatch.ts, consensus-vote.ts, pipeline-tool.ts: each directly imports pipeline/ or agents/ internals instead of using tool-result contracts
  - **Fix:** Document tool-to-tool composition via ToolResult envelope (error-envelope.ts #2649). Create a guide showing how tools should parse ToolErrorEnvelope from peer tool results, handle retryability (isRetryable field), and integrate with autonomous loops. Current pattern couples tools to internal abstractions (Orchestrator, Expert, WorkflowEngine) instead of stable tool result contracts.
- **MED · architecture** Tool capabilities not exposed for discoverability — annotations lack capability matrix
  - **Evidence:** src/mcp/tool-annotations.ts: TOOL_ANNOTATIONS map has side-effects metadata but no per-tool capability tags (e.g., 'requires-auth', 'async-capable', 'records-outcome')
  - **Fix:** Extend ToolAnnotations with a `capabilities` field listing what a tool can do (e.g., `capabilities: ['multi-agent-voting', 'long-running', 'outcome-recording']`). Publish this in server.json and docs/interfaces/tool.md so callers can query 'which tools support async?' without reading source. Aligns with mission of composable building blocks.
- **MED · user-journey** registerTools() is infrastructure-only; individual tools require separate dependency injection
  - **Evidence:** src/mcp/tools/index.ts:586-604 (registerTools function is a no-op; returns logger/rateLimiter but does NOT register any tools)
  - **Fix:** The docstring (lines 500-529) claims registerTools() 'provides infrastructure' but then says 'Individual tools require their specific dependencies.' This is confusing UX. Either (1) have registerTools() auto-register all 42 tools given a unified Deps interface, or (2) rename to createToolInfrastructure() and clarify that callers must manually call registerCreateExpertTool(), registerOrchestrateTool() etc. Current pattern creates 42 boilerplate register calls in server setup.
- **HIGH · mission-gap** Async job tools lack outcome-loop integration — no automatic recording to audit log
  - **Evidence:** src/mcp/tools/get-job-result-tool.ts, cancel-job-tool.ts (2-5 KB each) vs src/orchestration/outcomes/index.ts (outcome recording); no integration bridge
  - **Fix:** Job result/cancellation tools (epic #2631, async-mode stage 1+5) retrieve outcomes but don't feed them back into OutcomeStore for the plan→vote→implement→log→tune loop. Add a bridge: when get_job_result returns, automatically categorize the outcome (success/failure/timeout via error-envelope) and write to OutcomeStore. This closes the autonomous feedback loop for long-running tasks and enables weather_report to aggregate async job performance.
- **LOW · correctness** Memory tools have inconsistent backend selection contracts
  - **Evidence:** src/mcp/tools/memory-query.ts:10-20 (source: enum field) vs memory-write.ts:21-25 (no source field; always targets 'adaptive')
  - **Fix:** memory_query requires explicit backend filter but memory_write does not expose source selection in its schema. Add source field to MemoryWriteInputSchema with same enum, defaulting to 'adaptive'. Currently callers cannot choose which backend to write to. This inconsistency breaks composability for tools building custom memory strategies.
- **LOW · architecture** Tool prerequisites and gate policy declarations scattered across files
  - **Evidence:** src/mcp/middleware/tool-prerequisites.ts (3KB) vs tool-annotations.ts (6KB sideEffects) vs orchestrate.ts (access-policy derivation)
  - **Fix:** Tool prerequisite gates (epic #2652) are declared in three places. Unify under a single ToolContract type exported from index.ts: {name, schema, annotations, prerequisites, sideEffects, capabilities}. Enables audit queries like 'list tools that require expert-registry-write' without grep.

**Composability:** Tools compose vertically (orchestrate calls consensus_vote, which calls delegate_to_model) but lack horizontal patterns. The async job loop (get_job_result → outcome recording → weather_report) is a missing bridge. Tools handle errors well (structured ToolErrorEnvelope #2649 with isRetryable category), but callers must manually parse \_meta for error details instead of receiving a stable, typed exception hierarchy. Pipeline/orchestration tools can be chained via orchestrate tool, but discoverability is low — no published registry of 'which tools can call which other tools' or 'what are tool dependency chains?' Middleware (rate-limiter, timeout-guard, secure-handler) is well-factored and reused, reducing per-tool friction. REGISTERED_TOOL_NAMES keeps tool list in sync with annotations (42/42 parity verified), but completeness of exports lags — mcp.ts misses ~8 response types, creating import friction for consumers building on the API."

**Mission gaps:**

- Async job outcome recording is not wired to OutcomeStore; jobs complete without feeding back into the plan→vote→implement→log→tune loop.
- Tool composition graph is implicit, not explicit. No published registry showing dependency chains for building complex multi-tool strategies.
- Memory tools have inconsistent backend selection contracts, blocking tools from implementing backend-specific strategies.
- registerTools() is infrastructure-only, requiring 42 manual register\*Tool() calls. No batch registration path for npm adopters using nexus-agents programmatically.

---

### cli-ux (CLI command dispatch, help text, error messaging, first-run experience) — health: `adequate`

- **MED · user-journey** Unimplemented commands lack precise escape hatches and discovery
  - **Evidence:** /home/william/git/nexus-agents/packages/nexus-agents/src/cli-commands-handlers.ts:93-107, /home/william/git/nexus-agents/packages/nexus-agents/src/cli-commands.ts:15-25
  - **Fix:** Expand handleUnimplementedCommand to include: (1) a dynamic list of similar commands the user might have meant (e.g., if `expert create` is requested, list `expert list`), (2) the exact MCP tool name in a runnable command snippet (`nexus-agents --mode=server && call create_expert`), (3) a link to the feature-tracking issue. This bridges the CLI→MCP gap without requiring manual docs lookup. Issue #2727 partially addressed this but the UX remains terse.
- **HIGH · user-journey** First-run setup message is reactive, not proactive
  - **Evidence:** /home/william/git/nexus-agents/packages/nexus-agents/src/cli-commands-handlers.ts:171-185 (printFirstRunHint only fires on TTY and during server command)
  - **Fix:** Integrate first-run detection into the CLI bootstrap (cli.ts:main) before dispatch. Show a minimal, non-blocking hint on first invocation of ANY command (except --version/--help), directing to `nexus-agents setup`. Current implementation only runs for server mode and checks TTY, missing CLI tooling users who run verification commands. Add a marker file (e.g., `.nexus-agents/.first-run-done`) to avoid repeated noise.
- **MED · architecture** Help text and command catalog are fragmented across three files
  - **Evidence:** cli-help-text.ts (HELP_TEXT template), cli-command-help.ts (per-command help), cli-command-catalog.ts (audience tiers). Editing a command requires changes in 2-3 places with no single source of truth.
  - **Fix:** Consolidate into a single command metadata registry: a YAML/JSON file at src/cli-commands-catalog.ts that holds {command, shortDesc, longDesc, examples, flags, requiresApiKey, audience}. Generate help text, man pages, and discovery aids (bash completion, fzf menus, MCP tool registry) from this single source. This unblocks composability into automation scripts and IDE integrations.
- **MED · correctness** Error codes and exit paths are inconsistent across handlers
  - **Evidence:** cli-commands-handlers.ts: some handlers call process.exit(SUCCESS) on exitCode 0 (line 116), others call process.exit(exitCode ? SUCCESS : FAILED) (line 309), others check result.success (line 309). No unified pattern.
  - **Fix:** Define a CommandResult contract: {success: boolean, exitCode?: number, message?: string, error?: Error}. All command handlers return this; the dispatcher converts to process.exit(). Current mix of early exit patterns makes it hard to add logging, metrics, or rollback hooks. See config-command.ts for a good model (ConfigResult extends CommandResult).
- **LOW · user-journey** Subcommand dispatch has no fallthrough help or suggestions
  - **Evidence:** /home/william/git/nexus-agents/packages/nexus-agents/src/cli-commands-handlers.ts:293-296 (handleIndexCommand), 316-321 (handleResearchCommand): on invalid subcommand, print usage and exit(INVALID_ARGS). No suggestion for typos or available alternatives.
  - **Fix:** Add typo detection using Levenshtein or nearest-neighbor matching: when `research overlpa` is typed, suggest `did you mean: overlap?`. Use the 'did-you-mean' or 'string-similarity' package (lightweight). Cache similarity scores in startup to avoid per-request cost. This is especially valuable for research/index subcommands which have many options.
- **HIGH · modularity** CLI adapters factory and MCP tool registration are decoupled from UX commands
  - **Evidence:** createAllAdapters() (cli-adapters/factory.ts) is called by doctor, setup, server. MCP tools are registered in mcp/tools/index.ts. Neither is aware of the CLI command surface; a new command requires manual wiring in cli-commands-handlers.ts.
  - **Fix:** Build a CommandRegistry that: (1) lists all available commands with metadata, (2) maps commands to handler factories, (3) auto-discovers MCP tool equivalents (via a tools-cli-mapping.ts file), (4) enables dynamic command help and subcommand suggestions. This unblocks the mission to 'accomplish any goal' — new commands can be added via config/composition rather than code.
- **MED · user-journey** Detection errors (CLI not found, permission denied, timeout) lack actionable recovery paths
  - **Evidence:** /home/william/git/nexus-agents/packages/nexus-agents/src/cli/cli-detection-error.ts correctly classifies ENOENT/EACCES/ETIMEDOUT, but formatDetectionMessage (line 51-56) only returns a short phrase. doctor output shows 'claude detection failed: binary present but not executable' with no next step.
  - **Fix:** Extend each DetectionError class with a recovery guide: not-found → 'brew install claude-cli' or npm install link. permission → 'chmod +x $(which claude)'. timeout → 'Check PATH for hung NFS mounts or run with --verbose to see where detection hangs.' Store in DETECTION_ERROR_SOLUTIONS map; print on doctor or setup errors. Link to docs/TROUBLESHOOTING.md#detection-timeouts.
- **LOW · modularity** Mode detection is correct but not exposed for composition
  - **Evidence:** /home/william/git/nexus-agents/packages/nexus-agents/src/cli/mode-detector.ts exports detectMode() and isValidServerMode(). Used only in cli.ts:buildOptions(). No CLI command to inspect detected mode or override signals.
  - **Fix:** Add `nexus-agents --info mode` subcommand that prints: detected mode, signals (TTY, CI, container, MCP client), and reasoning. Helps users debug CI/container issues and understand why 'orchestrator' is being chosen. Useful for automation scripts that need to verify environment before running tasks.

**Composability:** The CLI architecture fragments responsibility: dispatch logic lives in cli-commands-handlers.ts (888 lines), help text in separate files, and command metadata is embedded in handler conditionals. This makes it hard to compose commands into higher-level workflows or expose the same functionality via REST/gRPC. The 'plan→vote→implement→log→tune' loop should be CLI-composable; today, each step is a separate invocation with no transaction/rollback. Moving toward: (1) a unified CommandRegistry, (2) command handlers that return typed results (not process.exit), (3) metadata-driven discovery/dispatch. These would enable building a 'plan' command that chains setup/vote/execute internally without shelling out."

**Mission gaps:**

- No CLI command discovery API: the CLI is not self-describing. An external tool (IDE plugin, shell integration, MCP client) cannot enumerate available commands without parsing help text or source code.
- Incomplete mission-loop wiring: 'plan→vote→implement→log→tune' requires orchestration; today it's a shell loop of separate commands. Need a `nexus-agents flow` or `nexus-agents pipeline` command that chains these with transaction/rollback semantics.
- Adaptive model routing (LinUCB) is not exposed as a CLI command for inspection/debugging: users can't easily ask 'why did you route to Claude?' or 'show me the LinUCB state' without MCP server mode.
- Custom expert discovery and composition not wired: expert-list shows built-in experts, but custom experts (loaded from files per custom-expert-loader.ts) are not easily discoverable via CLI; no `expert search` or `expert describe <name>` subcommand.

---

### agents-framework (src/agents: experts, state machine, step executor) — health: `adequate`

- **HIGH · modularity** Agent lifecycle lacks explicit composition contracts for nested agent scenarios
  - **Evidence:** src/agents/base-agent.ts:130-170 and src/agents/tech-lead.ts:231-237. BaseAgent implements IAgent with 403 lines of monolithic initialization. The Orchestrator manually manages expertAgents via setExpertAgents() (a void setter with side effects), but there is no formal composition interface defining how agents coordinate their lifecycle (initialize → execute → cleanup) when nested. Experts are created ad-hoc by ExpertFactory/ExpertRegistry without a composable lifecycle hook.
  - **Fix:** Introduce an explicit IAgentComposition interface with async hooks: onAgentAdded(agent), onAgentRemoved(agent), coordinateInitialization(agents), coordinateCleanup(agents). This allows Orchestrator and other composite agents to manage sub-agent dependencies, error propagation, and resource cleanup predictably. Refactor setExpertAgents() to use this contract.
- **HIGH · correctness** Expert creation is decoupled from error recovery and re-initialization patterns
  - **Evidence:** src/agents/experts/expert-factory.ts:64-200 (Expert class extends SimpleAgent with no recovery semantics) and src/agents/resilience/failure-detector.ts. The ExpertFactory creates Expert instances once; if an expert encounters a transient failure (network timeout, rate-limit), there's no pattern for: (1) detecting the failure type, (2) deciding if the same expert can be reused or must be recreated, (3) re-initializing state without leaking resources. Failure-detector exists but is not wired into expert lifecycle.
  - **Fix:** Add an expert recovery policy to ExpertFactory: createRecoverableExpert(config, recoveryPolicy) returns a wrapper that detects failure classes (Transient vs Permanent), auto-recovers transients by reinitializing, and escalates permanents. Wire failure-detector.classify() into expert.execute() error handling. Document retry budgets and deadletter semantics.
- **MED · user-journey** Context pruning and memory initialization are optional features with inconsistent enablement patterns
  - **Evidence:** src/agents/base-agent.ts:115-119 (memoryEnabled: boolean checked at runtime), src/agents/base-agent-pruning-init.ts (resolveMemoryConfig/resolvePruningConfig require explicit opts), and src/agents/experts/expert-factory.ts:55 (contextPruning?: optional). When users create experts, memory and context pruning are opt-in. This creates confusing UX: some agents start with these features, others don't, leading to cache misses in production.
  - **Fix:** Enable context pruning and typed memory by default for all agents. Make disabling them explicit via AgentConfig.features. Update ExpertFactory and BaseAgentOptions to propagate defaults consistently. Document cost/benefit tradeoff in CLAUDE.md.
- **MED · correctness** State machine transitions lack enforcement of preconditions in agent execute flow
  - **Evidence:** src/agents/state-machine.ts:84-100 (canTransition, getNextState are advisory only) and src/agents/base-agent-execute-flow.ts:67-80 (setupExecute validates task/availability but doesn't enforce state). The state machine does NOT prevent execute() from being called while state==='error' or state==='waiting'. Subclasses like SimpleAgent and Experts do not check state before entering executeTask().
  - **Fix:** Enforce state transitions in BaseAgent.execute(): guard with canTransition('execute'), transition to 'acting' BEFORE calling executeTask(). Catch any executeTask() error, transition to 'error', persist to state machine history, THEN return. This eliminates silent state inconsistencies.
- **MED · user-journey** Expert selector does not surface composition cost or protocol incompatibilities
  - **Evidence:** src/agents/experts/expert-selector.ts (selectExperts returns ExpertMatch[] without composition metadata) and src/agents/tech-lead.ts:263-266 (baseAssignments used without checking incompatibilities). No API tells users: (1) which expert combinations create redundancy, (2) estimated cost of running N experts in parallel, (3) known protocol incompatibilities.
  - **Fix:** Extend ExpertMatch to include compositionCost: { estimatedTokens, estimatedDurationMs, riskFactors[] } and incompatibilities: ExpertIncompatibility[]. Update selectExperts() to return these. Document how Orchestrator should use this to filter selections.
- **MED · architecture** Task history and context are unbounded; no retention policy enforced
  - **Evidence:** src/agents/base-agent.ts:103 (history: Message[] = []), src/agents/base-agent-execute-flow.ts:29 (MAX_HISTORY_ITEMS = 100 defined but never enforced), and src/agents/base-agent.ts:390-395 (cleanup() clears history, no periodic pruning during runs). Agents accumulate unbounded task history in long-running sessions.
  - **Fix:** Implement a history retention policy in BaseAgent: configurable maxHistorySize (default 100), implement rolling buffer, evict oldest entries when exceeded. Attach retention metrics to ContextPruningMetrics. Document that history is transient, not durable.
- **LOW · modularity** Expert pool and heartbeat monitor are global singletons with no scoped alternatives for composition
  - **Evidence:** src/agents/expert-pool.ts (export class with getExpertPool() singleton), src/agents/heartbeat-monitor.ts (similar singleton pattern), and src/agents/index.ts:337-355 (exports resetExpertPool, resetHeartbeatMonitor). No way to create scoped instances for multi-tenant deployments or test isolation without state leakage.
  - **Fix:** Provide both singleton AND factory APIs: keep getExpertPool()/getHeartbeatMonitor() for default, but add createExpertPool(config)/createHeartbeatMonitor(config) for independent instances. Allow BaseAgent to accept optional pool/monitor instances in constructor. This unblocks composability in multi-tenant scenarios.
- **LOW · architecture** No explicit message ordering or delivery guarantees for inter-agent communication
  - **Evidence:** src/agents/collaboration/event-bus.ts (publish-subscribe, fire-and-forget) and src/agents/collaboration/collaboration-protocol.ts (assumes broadcast semantics). The IAgent.handleMessage() contract lacks specification for: (1) message ordering (FIFO? causal?), (2) delivery guarantees (at-least-once? exactly-once?), (3) error handling (if handleMessage returns err, is message retried?).
  - **Fix:** Document message semantics in IAgent.handleMessage() JSDoc: add @throws to specify error conditions. Introduce MessageQueueConfig interface (ordering, retries, deadletter) and wire into collaboration protocols. Consider persistence layer for critical multi-turn flows.

**Composability:** The agent framework has strong foundations (BaseAgent, IAgent interface, expert factory) but composition is _aspirational_ rather than _realized_. Experts are created but not formally composed; the Orchestrator orchestrates execution plans but doesn't coordinate sub-agent lifecycles. The framework works for single-agent and loosely-coupled expert scenarios, but breaks down when building composite agents (e.g., a TechLead that spawns sub-orchestrators, or a collaborative debugging flow with 3+ experts in a tight loop). The missing pieces are: (1) explicit lifecycle contracts for nested agents, (2) recovery/retry patterns wired into composition, (3) message delivery guarantees, (4) cost/compatibility surfacing. These gaps prevent building reusable orchestration patterns that can be nested, tested, and deployed independently. Rating: **Adequate for monolithic single-agent scenarios; weak for modular multi-agent pipelines.**

**Mission gaps:**

- Autonomous plan→vote→implement→log→tune loop does NOT have explicit checkpoints for agent composition failures. If an expert fails after task delegation, there's no standard recovery escalation.
- Building-blocks→pipelines vision requires composition abstractions that don't exist: no way to declare 'this pipeline composes agents A, B, C in sequence with shared context' and have initialization/cleanup/error recovery be automatic.
- No cost-aware composition: expert selection doesn't surface token budgets or estimated costs; parallel expert execution could exhaust model quotas without visibility.
- Memory continuity across composed agents is not guaranteed: if Expert A learns something and Expert B runs next, B doesn't automatically inherit A's learnings without explicit memory backend coordination.
- Scaling to 'accomplish any goal' with multi-agent loops: heartbeat monitor and expert pool are global singletons; no way to scope them for a specific goal/task without affecting concurrent goals.

---

### observability-feedback — health: `adequate`

- **HIGH · architecture** Unconnected SwarmObserver metrics: agent health insights collected but never fed to routing
  - **Evidence:** src/observability/swarm-observer.ts:getHealthMetrics() returns BottleneckInfo, AgentCluster, SwarmHealthMetrics; grep -r 'SwarmObserver|swarmHealth' in src/cli-adapters returns nothing. SwarmObserver events are recorded (mcp/eventbus-bridge.ts) and exposed (cli/health-command.ts), but zero integration with composite-router routing stages or strategy distiller.
  - **Fix:** Create a SwarmObserver adapter that extracts agent failure patterns (e.g., 'agent X has 70% error rate') and feeds them into StrategyDistiller as pseudo-outcomes, or add a routing stage that downweights CLIs with reported bottlenecks. This closes a critical gap: rich swarm observability exists but is write-only for dashboards.
- **HIGH · mission-gap** Self-evaluation (self-eval/) produces recommendations that never drive behavioral changes
  - **Evidence:** src/self-eval/evaluation-agents.ts evaluates code quality, architecture fit, practical value; AggregatedResult objects are formatted and printed (cli/self-eval.ts, cli/self-eval-format.ts) but zero code paths read these results to adjust routing, thresholds, or strategy. The system explicitly states 'All outputs are RECOMMENDATIONS for human review, not decisions.'
  - **Fix:** Define an automated action for high-severity findings: e.g., if all 3 evaluators flag a module with confidence >= 0.9 and severity='high', automatically demote it in StrategyDistiller until human review. Alternatively, pipe self-eval findings into improvement_review to surface as candidate GitHub issues, giving humans a single decision point.
- **MED · correctness** FeedbackIntegration wires feedback to CompositeRouter, but CompositeRouter.recordOutcome() lacks integration test showing end-to-end bandit update
  - **Evidence:** src/learning/feedback-integration.ts:routeFeedbackToCompositeRouter(line 483) calls compositeRouter.recordOutcome(cliName, task, reward) but no test verifies that this call propagates to LinUCBBandit.update() or StrategyDistiller rule promotion. The CompositeRouter accepts recordOutcome() but the code path is untested in e2e scenarios (only unit tests mock linucbBandit).
  - **Fix:** Add an e2e test: (1) route a task via CompositeRouter, (2) record an outcome via FeedbackIntegration, (3) verify the outcome appears in OutcomeStore, (4) manually inspect that getDistilledRules() now contains a promoted rule. Alternatively, add a 'feedback_loop_health' metric to improvement_review output that confirms N recent outcomes resulted in >= 1 distilled rule promotion.
- **MED · modularity** OutcomeStore as single source of truth, but schema mismatch between routing TaskOutcome and feedback-integration TaskOutcome
  - **Evidence:** src/orchestration/outcomes/outcome-types.ts TaskOutcome includes 'cli' field. src/learning/outcome-feedback-types.ts TaskOutcome has no 'cli' field, only routingDecisionId → RoutingDecision.cliName lookup. FeedbackIntegration.recordOutcome() calls collector.recordOutcome() which creates a different TaskOutcome shape than what ends up in OutcomeStore via FeedbackSubscriber. No compile-time guarantee these schemas align.
  - **Fix:** Unify TaskOutcome shape: make src/orchestration/outcomes/outcome-types.ts the canonical definition and import it in feedback-integration.ts. Add a compile-time check (e.g., a helper that maps RoutingDecision + outcome → complete TaskOutcome with all required fields) to catch schema drift at build time.
- **MED · mission-gap** Fitness audit (governance/fitness-score.ts) runs static code checks but zero feedback to improve low-fitness dimensions
  - **Evidence:** src/governance/fitness-score.ts calculates penalties for duplicate paths, cross-layer coupling, config sprawl; dimension scores are returned in FitnessAudit. improvement_review.ts reads fitness and surfaces below-floor signals as 'tech-debt' category, but zero code modifies routing, thresholds, or orchestration strategy based on fitness trends. Fitness is a read-only health metric.
  - **Fix:** Add a 'fitness_dimension_trending' signal in improvement_review that tracks whether low-fitness dimensions (e.g., observability_score=60/100) are improving/degrading; if declining 2+ consecutive runs, automatically suggest a GitHub issue to the DevEx team. Alternatively, wire fitness into adaptive thresholds in orchestration/outcomes/adaptive-thresholds.ts so low fitness triggers more conservative default timeouts/retries.
- **MED · modularity** Multiple feedback APIs but no composability: FeedbackIntegration, OutcomeFeedbackCollector, StrategyDistiller, RoutingMemory each maintain independent state
  - **Evidence:** src/learning/feedback-integration.ts manages decisionMap and calls collector. src/learning/outcome-feedback.ts manages pendingDecisions and callbacks. src/learning/strategy-distiller.ts reads OutcomeStore. src/context/routing-memory.ts maintains ModelPerformance separately. No shared interface or coordination — if one updates, others don't automatically refresh. Leads to false confidence in cold-start routing (memory might have stale rankings).
  - **Fix:** Create an IFeedbackCoordinator interface that all four systems register with. On significant events (rule promotion, memory refresh), emit a 'feedback_updated' event that all subscribers can act on. This prevents stale state and makes the loop observable (can log how many systems updated per feedback cycle).
- **MED · user-journey** Improvement_review threshold signals never trigger automated action; human must run tool, read output, and manually create GitHub issue
  - **Evidence:** src/mcp/tools/improvement-review.ts:runImprovementReview() returns signals with fileIssues=false by default. When fileIssues=true, tool calls 'gh issue create' but rate-limits to 5/run and requires user to invoke the tool. Zero automation: no scheduled job runs improvement-review, no alerts on fitness floor breach, no automatic escalation on repeated failures in same category.
  - **Fix:** Add a CronCreate scheduled task in the server startup (cli-server.ts) that runs improvement_review daily with fileIssues=true. For critical signals (security, fitness < 50), emit PushNotification so users see alerts in Claude Code status bar. This closes the feedback loop: observability → analysis → decision → action → user awareness.
- **LOW · mission-gap** No cross-domain feedback: outcomes from task execution don't inform self-eval thresholds or observability window sizing
  - **Evidence:** src/self-eval/evaluation-agents-types.ts has EvaluationThresholds (maxComplexity=15, etc.) hardcoded. src/observability/swarm-observer-types.ts has metricsWindowMs=300000 hardcoded. Neither reads from OutcomeStore to auto-tune. If outcomes show 80% of failures happen in 5-minute window, observability window should shrink; if self-eval fails to catch high-impact bugs, complexity threshold should lower. No adaptive feedback.
  - **Fix:** Add a tuning_loop module that periodically (weekly) reads recent outcomes grouped by failure category and suggests threshold adjustments. E.g., 'If latency-spike failures increased 15% and your metricsWindowMs=300s, try 180s next week.' Expose these suggestions in improvement_review under a new 'tuning' signal category.

**Composability:** Observability-feedback is composed of three independent pipelines: (1) execution → SwarmObserver → health metrics/dashboards (read-only), (2) routing → FeedbackIntegration → OutcomeFeedbackCollector → StrategyDistiller (routed via CompositeRouter.recordOutcome()), (3) codebase → fitness-score → improvement-review → GitHub issues (human-triggered). These don't compose: SwarmObserver insights are walled off from routing; self-eval recommendations don't drive changes; fitness audit is a diagnostic tool, not a tuning signal. The system works as a collection of building blocks but fails the 'modular pipeline' test: you can't plug a new observability signal into routing without touching 4 different files. Recommend creating a unified SignalBus pattern where all observability sources (SwarmObserver, OutcomeStore, FitnessAudit, ValidationDashboard) emit events that routing systems subscribe to."

**Mission gaps:**

- Observability metrics (SwarmObserver: agent errors, bottlenecks, clusters) are collected but never fed back into routing decisions or strategy distillation; they only power dashboards.
- Self-evaluation outputs are human-readable recommendations, not executable directives — high-severity findings don't trigger automatic thresholds or strategy adjustments.
- Fitness score is a read-only diagnostic; low fitness dimensions don't inform routing, observability window sizing, or self-eval thresholds.
- No automated execution of improvement-review loop; humans must invoke the tool and read results to decide on GitHub issues.
- Cross-domain feedback is missing: outcomes don't inform observability window sizing, self-eval thresholds, or timeout heuristics.

---

### research-memory-context — health: `adequate`

- **HIGH · mission-gap** Research discoveries not flowing into context retrieval — knowledge substrate remains write-only for most agents
  - **Evidence:** src/context/context-retriever.ts:90-113 fetches beliefs, agentic, adaptive, mobimem, outcomes, priorStrategies but NO research_synthesize results. src/mcp/tools/research-discover.ts tools emit DiscoveredItem but there's no code path wiring synthesis into UnifiedContext. Plan→vote→implement loop never reads research insights as input.
  - **Fix:** Add Phase 6 (#2792) entry point: wire research_synthesize output into either (a) a new `UnifiedContext.researchInsights` field carrying synthesized findings+alignments as structured belief precursors, or (b) auto-distill synthesis results into BeliefMemory during research_catalog_review. Enable the closed-loop: research feeds beliefs→context→routing→strategy distillation→priorStrategies.
- **HIGH · architecture** Memory persistence layers operate independently without unified ingestion contract — research metadata, quality scores, and alignment mappings not persisted
  - **Evidence:** src/research/research-schemas.ts defines quality_score, evidence_tier, venue_tier, related_issues but these are YAML registry only. No pipeline ingests papers.yaml quality assessments into belief/agentic/adaptive backends. src/context/belief-memory.ts and agentic-memory.ts have independent extraction logic (agentic-memory-extraction.ts) but don't consume research metadata as a source. Each memory system writes only from its own tool invocations.
  - **Fix:** Create src/context/research-metadata-ingester.ts exporting syncResearchQualityToBelief(paper) and syncTechniqueAlignmentToAgentic(technique) to run on papers.yaml changes (CI hook + on-demand via research_import tool). Wire into memory_write and memory_promotion pipelines so research quality assessments raise memory confidence scores.
- **MED · correctness** Context budgeting does not account for research synthesis output size — no token-aware clipping for synthesized insights
  - **Evidence:** src/context/token-budget-tracker.ts tracks session/model tokens but synthesizeResearch() from research-helpers-synthesize.ts returns arbitrarily large ClusterSynthesis[] with full paper lists, key insights, gaps. summarizeContextForPrompt() in context-retriever.ts does crude slice(0, 5) but no token counting. If synthesis output ever fed into context, token-aware clipping would be missing.
  - **Fix:** Add TokenCounterProvider call in research-discover.ts result assembly and context-retriever.ts `fetchResearchInsights()` (when added). Implement SynthesisCompressionStrategy in research-helpers-synthesize.ts: truncate keyInsights to top-3 by quality_score, limit gaps to 2, summarize implementationOpportunities to URL-only links. Store compression stats in memory metadata.
- **MED · modularity** MobiMem routing patterns never see research-derived task categories — experience patterns trained on CLI sequences only, not on task specialization
  - **Evidence:** src/context/routing-memory.ts recordExperience() takes workflow + model sequence but ignores research/domain context. src/context/mobimem.ts experience.recordExecution() stores action sequence and outcome but has no facility for research-informed task typing. src/cli-adapters/task-classifier.ts (TaskCategory inference) happens at routing, but routing→experience feedback loop ignores research classification.
  - **Fix:** Extend recordExperience signature to include optional `researchContext?: { topic: ResearchTopic; techniques: string[] }`. Store in MobiMem experience metadata so getExperiencePatterns() can filter by research alignment. Wire cli-adapters/task-classifier results → RoutingMemory so learned patterns are tagged with research domain (e.g., 'memory' domain tasks prefer Opus over Sonnet).
- **MED · modularity** Research quality assessment logic is fragmented across 4+ modules with inconsistent scoring — no single source of truth for paper evaluation
  - **Evidence:** src/research/research-quality.ts defines computeQualityScore(venue_tier, recency, citationCount) | src/research/source-quality.ts computeSourceQualityScore(stars, reviewed). src/research/research-index-generator.ts loads papers and computes stats. src/cli/research-helpers-synthesize.ts recomputes QualityDistribution in lines 293-301. No unified IQualityAssessor interface; scoring rules are inlined.
  - **Fix:** Extract to src/research/quality-assessor.ts exporting QualityAssessor interface with methods assessPaper(paper) → QualityAssessment, assessSource(source) → QualityAssessment, bulk operations. Use in research-index-generator.ts, synthesis, and memory-ingester. Document via ADR that this is the canonical quality authority consumed by MemoryPromoter and belief confidence.
- **MED · user-journey** Context-retriever returns 6 independent memory backends' results but no ranking by relevance to task — consumer must implement sorting
  - **Evidence:** src/context/context-retriever.ts UnifiedContext returns beliefs[], similarMemories[], recentLearnings[], experiencePatterns[] as parallel lists. summarizeContextForPrompt() slices each to top-N but never cross-ranks (e.g., a belief from 2 days ago vs. a pattern from 6 months with 95% success). No unified RankedMemory type. #2792 Phase 5 acceptance doesn't define ranking contract.
  - **Fix:** Add Phase 6: UnifiedContext.rankedMemories: readonly RankedMemoryItem[] carrying (source: 'belief'|'agentic'|'adaptive'|'experience'|'outcome'|'strategy', relevanceScore: 0-1, item: Belief|AgenticMemoryEntry|...). Implement unified ranker in context-retriever-helpers.ts: BM25 on free-text match + temporal decay + source confidence weights. consumers call getContextForTask().rankedMemories for a single, sorted list.
- **MED · correctness** Research schema evolution not coordinated with downstream memory/context consumers — quality_score added but no migration for old papers
  - **Evidence:** src/research/research-schemas.ts ResearchPaperSchema.quality_score is optional with default 0 in synthesis (line 244). Existing papers.yaml entries pre-quality_score stay at 0. No backfill script runs via CI. research-quality.ts computeQualityScore() can auto-assign but is never invoked at load time. Imported papers via research_add.ts have no quality assessment step.
  - **Fix:** Add scripts/backfill-research-quality.ts exporting backfillPaperQualities(registry): PapersRegistry to recompute missing scores. Wire into research-helpers-io.ts loadPapersRegistry() as an optional post-load transform (gate via NEXUS_BACKFILL_RESEARCH_QUALITY=1). Document schema version in frontmatter; error if consumer model version < schema version (fail-safe).
- **LOW · architecture** ContextRetriever faithfully implements #2792 Phase 2 but phases 3-6 are incomplete — entry-point wiring incomplete across orchestration
  - **Evidence:** src/context/context-retriever.ts fully implements getContextForTask(). Pipeline/stage-wrappers.ts at line 217 has TODO: 'getContextForTask once #2795 lands'. Orchestration/graph/graph-executor.ts DOES call getContextForTask at executor start. But mcp/tools/orchestrate.ts imports getContextForTask but code flow unclear. Multiple entry points, inconsistent adoption.
  - **Fix:** Complete Phase 3 (#2795) by documenting which entry points call getContextForTask() and which will in which version. Create integration map: routing (✓ composite-router), orchestration (✓ graph-executor, ? mcp-orchestrate), skill-creation (?), consensus-voting (?). Drive adoption via fitness audit: penalize entry points that skip context retrieval.

**Composability:** The research-memory-context substrate has strong modular separation (research::index, context::memory, context::retrieval) but the composition points are **not** designed for reuse. Research tools are write-only (papers.yaml emit DiscoveredItem, but never feed back into memory). Memory backends are callable individually but ContextRetriever is the only attempt at unified composition, and it's incomplete (research layer missing). No public contracts exist for "how to wire research quality into memory" or "how to rank unified context by relevance" — meaning external projects building on nexus-agents' memory system will have to reinvent integration. For the building-blocks→pipelines vision, this needs explicit composition interfaces: MemoryIngestor (research→memory), ContextAugmenter (memory→retrieval), RankedContextProvider (unified→consumer). Currently, only the last interface (ContextRetriever) exists, and it doesn't include research.

**Mission gaps:**

- Research synthesis output does not flow into plan→vote→implement loop: agents never see research findings as input to their decisions. The autonomous loop reads outcomes/beliefs/priors but ignores synthesized research insights, breaking the claim of 'expand beyond coding to accomplish any goal' when the knowledge substrate is write-only.
- No closed-loop tuning for research quality: papers are cataloged and synthesized but their impact on agent performance is not measured. No feedback mechanism to improve quality scoring, re-rank papers by outcome correlation, or deprecate low-signal sources.
- Memory ingestion from research metadata is manual/absent: quality_score, evidence_tier, related_issues, aligned_techniques all live in YAML but aren't persisted to belief/agentic/adaptive backends. The 'knowledge substrate' is partitioned into unconnected silos.
- Task specialization (TaskCategory) is not informed by research domains: routing/orchestration infer category from keywords, but nexus-agents' own research registry (memory, routing, consensus, etc.) is not visible to the routing decisions that rely on those domains.

---

### testing-eval — health: `adequate`

- **HIGH · correctness** Self-Eval Results Not Persisted to OutcomeStore
  - **Evidence:** src/cli/self-eval.ts:200-230; src/mcp/tools/improvement-review.ts:1-100
  - **Fix:** The evaluate command produces AggregatedResult objects (component-level recommendations) but never appends them to OutcomeStore (which tracks task outcomes). Unlike e2e-eval.ts (line 235) and warm-up.ts which call store.append(), self-eval results vanish. To close the plan→vote→implement→log→tune loop, store each AggregatedResult as a TaskOutcome. This enables improvement_review to surface code-quality signals grounded in actual evals.
- **HIGH · user-journey** Benchmark Extraction Incomplete: No CLI Harness or Integration
  - **Evidence:** src/benchmarks/adapter.ts (contract defined); src/benchmarks/orchestrator.ts (runBenchmark function); src/cli-commands.ts (no eval benchmark command)
  - **Fix:** The BenchmarkAdapter contract (#1960) is well-designed for external integrations (nexus-eval-swebench, etc.), but nexus-agents core has no CLI command to run or list available adapters. Users cannot discover or invoke benchmark runners from the CLI. Add a `nexus-agents benchmark --list` / `--run <name>` command that discovers registered adapters and wires them into improvement_review for threshold reporting.
- **MED · modularity** Evaluator Implementations Asymmetric: Three Roles but Limited Reuse
  - **Evidence:** src/self-eval/code-quality-evaluator.ts, architecture-fit-evaluator.ts, practical-value-evaluator.ts; each is ~130 LOC with similar structure but divergent scoring logic
  - **Fix:** The three evaluator roles (code-quality, architecture-fit, practical-value) each reimplement metric aggregation, concern tracking, and confidence calculation. Extract a template or base pattern (similar to base-evaluator.ts but more reusable) so new evaluators don't repeat this boilerplate. This reduces test maintenance overhead and ensures consistent evidence-quality scoring across roles.
- **MED · architecture** Aggregation Logic Decoupled from Outcome Recording
  - **Evidence:** src/self-eval/aggregation-logic.ts (builds audit trail, computes votes); src/orchestration/outcomes/outcome-store.ts (TaskOutcome schema does not match AggregatedResult)
  - **Fix:** The aggregation module produces rich audit trails and dissent tracking, but AggregatedResult lacks a schema mapping to TaskOutcome. Define an adapter or factory function that converts (component + AggregatedResult) → TaskOutcome(model, success, recommendation) so audit metadata can flow into the observability layer for stratified reporting.
- **MED · correctness** Component Scanner Excludes Tests: Evaluation Scope Mismatch
  - **Evidence:** src/self-eval/component-scanner.ts:53-56 (skipTests: false in CLI usage, but \_test.ts pattern suggests tests are scanned alongside code)
  - **Fix:** Verify the intent: should evaluators assess test code? Current config is inconsistent (skipTests flag exists but CLI always passes false). If tests should be excluded from production fitness checks, update CLI default. If included, document why—test code is evaluated for complexity/style but not for runtime reliability.
- **MED · correctness** Missing Integration Test: Eval Pipeline → OutcomeStore → Improvement Review
  - **Evidence:** src/self-eval/\*.test.ts (unit tests only); src/mcp/tools/improvement-review.test.ts (mocks OutcomeStore); no end-to-end test wiring components through the full loop
  - **Fix:** Add an integration test (`src/self-eval/self-eval-integration.test.ts`) that runs: scan → evaluate → aggregate → append to OutcomeStore → query via improvement_review. This validates the signal flow and catches future regressions when OutcomeStore schema changes (per issue #2703).
- **LOW · correctness** Evaluator Confidence Scoring Lacks Justification
  - **Evidence:** src/self-eval/evaluation-agents.ts; each evaluator sets confidence independently; aggregation weights by (confidence \* evidenceQuality)
  - **Fix:** The confidence calculation in each evaluator is intuitive but lacks a formal rubric. Document or refactor to use a deterministic formula: e.g., (metricsCount / totalClaims) \* (1 - dissent / evaluators). This makes confidence auditable and reproducible across refactors.
- **LOW · mission-gap** Benchmark Results Not Linked to Component-Level Fitness
  - **Evidence:** src/benchmarks/benchmark-runner.ts (tracks latency/throughput); src/governance/fitness-score.ts (analyzes source tree); no cross-reference between perf regressions and fitness penalties
  - **Fix:** Currently fitness-audit is static analysis, and benchmarks are performance metrics. To support 'accomplish any goal,' wire benchmark threshold breaches (e.g., p95 latency > SLO) into improvement_review as 'perf-regression' signals. This closes the gap between what the system measures (benchmarks) and what it optimizes for (fitness).

**Composability:** The testing-eval domain is moderately composable with significant friction. Benchmarks are well-extracted via the BenchmarkAdapter contract, allowing external packages (nexus-eval-swebench, etc.) to plug in without core changes. Self-eval components (scanner, evaluators, aggregator) are modular but tightly coupled to the CLI handler; they cannot easily be invoked from pipelines or MCP tools without threading OutcomeStore manually. The most critical gap: evaluation results are not persisted, so downstream tools (improvement_review, fitness audits, strategy distiller) cannot consume them. Closing this would immediately improve composability—once AggregatedResult → TaskOutcome, the eval pipeline becomes part of the broader observability substrate."

**Mission gaps:**

- Self-eval outputs not persisted to OutcomeStore—loop is broken; improvements cannot be proposed based on code-quality findings
- No benchmark CLI harness or integration; externally-extracted adapters (#1960) work but users cannot discover/run them
- Eval-to-fitness link missing; perf regressions (benchmarks) not surfaced as signals to improvement_review
- No end-to-end test of the eval→outcome→signal loop; risk of undetected breakage when task schemas evolve
- Evaluator confidence scores lack formal rubric; audit trail claims precision but scoring is heuristic

---

### docs-user-journey — health: `adequate`

- **HIGH · user-journey** Onboarding stops at voting; no path to composing building blocks into a pipeline within 30 min
  - **Evidence:** docs/getting-started/FIRST_TASK.md steps 1-4 cover install → verify → vote → wire editor. Step 5 jumps to `orchestrate` (standalone task), with no tutorial showing how to compose `consensus_vote`, `run_dev_pipeline`, `run_workflow`, etc. into a real pipeline. The mission states 'expanding to accomplish any goal' with 'building-blocks→pipelines vision' but docs/getting-started/ has zero examples of actual pipeline composition.
  - **Fix:** Create docs/getting-started/COMPOSE_YOUR_FIRST_PIPELINE.md (~2,000 words, ~15 min read + hands-on): show a newcomer how to chain 3-4 MCP tools together (e.g., `research_discover` → `consensus_vote` → `run_dev_pipeline`). Start with a concrete goal (e.g., 'Should we add auth to the API?') and show step-by-step MCP tool invocations, expected outputs, and how to feed output A into input B. Include a runnable example in Claude Code with skill triggers.
- **HIGH · correctness** Broken reference in FIRST_TASK.md points to deleted documentation
  - **Evidence:** docs/getting-started/FIRST_TASK.md line 139 points to '../workflows/SELF_DEVELOPMENT_WORKFLOW.md' as 'Run the full dev pipeline (research → plan → vote → implement → QA)'. That file exists but is marked deprecated/historical (lines 3-4); it says the engine was 'deleted 2026-05-05' and replaced by `improvement_review` MCP tool. Newcomer following this link will be confused.
  - **Fix:** Replace line 139 reference with a direct link to the `run_dev_pipeline` MCP tool docs in ENTRYPOINTS.md, plus a 1-paragraph explanation: 'The dev pipeline is the research→plan→vote→implement→QA loop. Run it with the `run_dev_pipeline` MCP tool (available after setup). See the `run_dev_pipeline` tool schema and [example] in ENTRYPOINTS.md.'
- **MED · architecture** Gap between mission ('accomplish any goal via building blocks + pipelines') and entrypoint documentation (lists tools but not composition patterns)
  - **Evidence:** README.md says 'MODULAR system of building blocks ... that compose into pipelines' and 'ships via npm'. CLAUDE.md says 'default to the full pipeline: research → vote → plan → epic → child issues → implement' for non-trivial work. ENTRYPOINTS.md documents 42 MCP tools and 11 workflows, but provides NO examples of how to chain them, what output contracts to expect, or which tools can feed into which. A newcomer has tool names but no composition grammar.
  - **Fix:** Add 'Composition Patterns' section to docs/architecture/README.md (500 words). Show 3 canonical patterns: (1) Sequential (tool A → tool B with output piping), (2) Parallel (independent tools), (3) Conditional (based on outcome). Use schema fragments from ENTRYPOINTS.md to show input/output shape matching. Link to examples in existing guides.
- **MED · user-journey** ENTRYPOINTS.md is technically complete but lacks 'How to use this tool' framing for newcomers
  - **Evidence:** docs/ENTRYPOINTS.md is a 1,385-line reference document with comprehensive CLI command tables, MCP tool schemas (JSON), and YAML examples. However, it provides zero guidance on: (a) When to use `run_pipeline` vs `run_dev_pipeline` vs `run_workflow` vs `orchestrate`, (b) Which tools are meant to be chained vs standalone, (c) How to interpret tool output to feed into the next tool. For example, `research_discover` returns a list of papers, but the doc doesn't say 'pass result to `research_add`' or 'feed to consensus_vote for prioritization'.
  - **Fix:** Add 'When to use which tool' decision tree (500 words, tree diagram) at the top of ENTRYPOINTS.md. Example: 'Choosing an orchestration entry point: orchestrate (standalone) vs run_dev_pipeline (full research→implement) vs run_workflow (custom YAML) vs run_graph_workflow (DAG with checkpointing).' Include a 1-page 'Typical pipelines' section with 3-4 realistic examples and which tools they chain together.
- **MED · modularity** Architecture docs reference 'building blocks' and 'composability' but don't explain how the blocks connect at runtime
  - **Evidence:** docs/architecture/README.md (lines 44-100) describes core components (Orchestrator, Memory, Routing, etc.) but treats them as conceptual layers, not as exposed composition points. CLAUDE.md lists 42 MCP tools but doesn't say which ones are 'primitives' (e.g., research_discover, memory_query) and which are 'orchestrators' (e.g., run_dev_pipeline, orchestrate) that consume primitives. The V2 rearchitecture docs (docs/v2/04-v2-architecture-pipeline-os.md) promise a 'plugin system' but it's future-tense, not present.
  - **Fix:** Add a 'Composability Model' section to docs/architecture/README.md (~800 words) explaining: (1) Tool/MCP tiers (primitives, coordinators, orchestrators), (2) Data flow contracts (which outputs are designed to feed into which inputs), (3) Runtime composition vs YAML composition vs programmatic composition. Use a single example (e.g., 'security audit pipeline') traced through 3-4 tools to show the model in action.
- **MED · user-journey** No example of a fully worked 'build a pipeline' journey from goal to implementation
  - **Evidence:** docs/v2/03-user-story-user-journey.md (lines 1-150) shows an idealized 5-stage software factory journey (intake → elicitation → plan proposal → execution → closeout) with internal details. However, this is a vision document (tier 2, V2 rearchitecture), not a working tutorial. The actual getting-started docs (FIRST_TASK.md) do not show this journey for a real user — they show install → vote → done. No docs show 'I want to add auth to my API; here's how I use nexus-agents end-to-end'.
  - **Fix:** Create docs/guides/PIPELINE_BY_EXAMPLE.md (~3,000 words) with a single end-to-end scenario: 'Add JWT authentication to a Node.js API in 30 min using nexus-agents.' Walk through: (1) Define goal, (2) Run research_discover for JWT best practices, (3) Use consensus_vote to decide JWT vs OAuth, (4) Run run_dev_pipeline to implement, (5) Verify with pr_review. Show actual command invocations, output snippets, and how each tool's result feeds into the next. Include screenshots/mockups of MCP tool outputs in Claude Code.
- **LOW · user-journey** CONFIGURATION.md documents knobs but not how they affect composition and reusability
  - **Evidence:** docs/getting-started/CONFIGURATION.md (line 50 onward) lists ~15 env vars and YAML keys (e.g., NEXUS_BILLING_MODE, NEXUS_SANDBOX, model tiers). It explains what each does but not 'what does setting billing_mode to plan vs api mean for a composed pipeline?' or 'if I want to make my pipeline reusable across teams, which config should be project-level vs user-level?' A newcomer trying to make their first pipeline reusable will be lost.
  - **Fix:** Add a 'Configuration for Reusable Pipelines' section (300 words) to CONFIGURATION.md explaining the 4-tier precedence (env → project → user → default) and when each is appropriate for: (a) single-run experiments, (b) team-shared pipelines, (c) deployed automation. Show an example project nexus-agents.yaml with comments explaining why each setting is set at project level.
- **LOW · architecture** No clear mental model of 'what is a pipeline' in the docs—conflates Orchestrator, workflow templates, dev pipeline, and MCP tool chains
  - **Evidence:** The term 'pipeline' is used inconsistently: (1) CLAUDE.md 'default to the full pipeline: research → vote → plan → ...' (agent decision sequence), (2) ENTRYPOINTS.md 'run_dev_pipeline' (MCP tool), (3) docs/guides/WORKFLOW_TEMPLATES.md 'workflow templates' (YAML definitions), (4) docs/architecture/ORCHESTRATOR_WORKFLOW_ENGINE.md Orchestrator vs WorkflowEngine (internal components). A newcomer reading docs in sequence will not form a coherent model of what a pipeline is.
  - **Fix:** Add a 400-word 'Pipeline Terminology' section to docs/README.md (tier 1, high visibility) defining: (1) Research loop (deliberate, gather facts), (2) Consensus loop (vote on direction), (3) Dev pipeline (implement + test + security review), (4) Workflow template (YAML reusable sequence), (5) Composition/orchestration (chaining tools). Use a table: Term | Definition | Example Tool(s). This is a lightweight fix that clarifies the namespace.

**Composability:** The system has strong composability at the MCP tool level (42 documented tools with clear I/O schemas) and promises modular 'building blocks → pipelines' composition in the README and mission statement. However, the docs provide zero guidance on how to compose these blocks in practice. The ENTRYPOINTS.md reference is technically complete but lacks a 'decision tree' or 'when to use which' framing that would help a user understand whether to call run_dev_pipeline, run_workflow, orchestrate, or chain individual tools. The guides (WORKFLOW_TEMPLATES.md, composition patterns) exist in fragments but aren't collected into a coherent journey. A user can discover the tools but cannot discover the composition grammar without reading source code (workflow-router.ts, spec-pipeline.ts, etc.). Strength: clean MCP interface boundaries. Weakness: no abstraction layer or mental model document that unifies the 42 tools into 3-4 canonical composition patterns.

**Mission gaps:**

- No documented path for 'accomplish any goal via building blocks'—the mission says this is the vision but getting-started docs don't show it. Missing: 'build your first 3-tool pipeline' tutorial.
- Reusability claim ('shipped via npm') is documented at config level but not at pipeline definition level. Missing: how to version, share, and reuse pipelines across projects/teams.
- V2 promises plugin system and policy gates but V2 is future-tense (docs/v2/). Current V1 docs don't explain how new tools are added or how a user extends the system with custom tools.
- Closed-loop telemetry (OutcomeStore, LinUCB routing, fitness audit) is documented in architecture but not in getting-started. Missing: 'how does my pipeline learn from outcomes?' tutorial.
- No clear on-ramp for non-coding users (e.g., product managers, ops) who want to use nexus-agents via MCP tools + Claude Code UI. All examples assume CLI or TypeScript.

---

### autonomous-readiness: plan→vote→implement→log→tune loop for arbitrary goals — health: `adequate`

- **HIGH · architecture** Plan→Vote→Implement loop is solid; Tune phase decoupled from execution
  - **Evidence:** /home/william/git/\_vendor/nexus-agents/packages/nexus-agents/src/pipeline/dev-pipeline.ts:203-237; consensus-plan.ts:468-495
  - **Fix:** Wire `improvement_review` MCP tool outputs (ImprovementSignal[]) directly into the pipeline task decomposition phase: detected signals (routing floor breaches, fitness drops, failure concentration) should auto-create PipelineTask objects and feed into the next cycle's decompose() stage, not just file GitHub issues. Currently improvement signals only produce issue URLs with no feedback loop to pipeline.
- **HIGH · architecture** Outcome recording is CLI-specific but tuning hooks are missing for strategic routing changes
  - **Evidence:** /home/william/git/\_vendor/nexus-agents/packages/nexus-agents/src/orchestration/outcomes/outcome-store.ts:85-102; /home/william/git/\_vendor/nexus-agents/packages/nexus-agents/src/cli-adapters/composite-router.ts (missing file)
  - **Fix:** OutcomeStore records outcomes with family/vendor enrichment and queryByModelWithFamilyFallback() enables cold-start warm-start. But there's no mechanism to apply recorded learnings back to routing config (adapting budget constraints, thresholds, or CLI affinity based on observed performance). Add a 'routing tune' stage that reads weather_report, detects pathological patterns (e.g., 'gemini always timeouts on security category'), and emits routing-policy changes that are applied to the next orchestrate() invocation.
- **MED · modularity** Belief memory (hindsight) is fire-and-forget with no integration to voting or plan refinement
  - **Evidence:** /home/william/git/\_vendor/nexus-agents/packages/nexus-agents/src/pipeline/dev-pipeline.ts:268-334
  - **Fix:** dev-pipeline applies hindsight records to IHindsightBeliefMemory after execution (lines 325), but consensus_vote and planning stages do NOT consume this memory to inform voting weights or plan reasoning. Hindsight should flow backward: before the next vote, the architect should see 'prior plan approach X failed 3 times last week; consider Y instead'. Add an optional 'hindsight context' parameter to executeConsensusPlan() and plan() stages that retrieves relevant belief updates.
- **MED · user-journey** Research stage is isolated; research_discover output never feeds into planning/voting
  - **Evidence:** /home/william/git/\_vendor/nexus-agents/packages/nexus-agents/src/pipeline/central-hub-vision.test.ts:14-19 (documents vision but not implemented); agent-executor.ts (research stage calls research_discover but output is not wired to plan prompts)
  - **Fix:** The research stage calls research_discover to populate the research context, but the plan() and vote() stages receive only raw research text—not the structured metadata (techniques_extracted, quality_signals, verdict_notes) that would help voters understand research confidence. Pass a ResearchContext object (not just string) through the pipeline containing technique tags, adoption status, and quality signals so voting can weight recommendations by research maturity.
- **MED · mission-gap** No explicit feedback loop between vote rejection and improvement discovery
  - **Evidence:** /home/william/git/\_vendor/nexus-agents/packages/nexus-agents/src/mcp/tools/consensus-vote.ts (records vote outcomes); improvement-review.ts (detects fitness/routing signals); no consumer links the two
  - **Fix:** When consensus_vote rejects a plan, the rejection reason (DRY_VIOLATION, OVER_ENGINEERING, etc. per ADR 0016) should seed the next improvement_review cycle as domain-specific signals ('DRY violations are common for this task type'; 'OVER_ENGINEERING detected; simplify scope'). Currently rejection reasons are local to the proposal. Add a rejection-signal analyzer that feeds vote feedback into the observability layer.
- **MED · architecture** Policy gates in V2 Pipeline OS spec exist but no wiring to autonomy loop or real policy decisions
  - **Evidence:** /home/william/git/\_vendor/nexus-agents/docs/v2/04-v2-architecture-pipeline-os.md:40-52; PolicyGateSpec type defined but no consumer in run_pipeline/run_graph_workflow that enforces learned policies
  - **Fix:** V2 architecture declares PolicyGateSpec between stages, but the actual policy-decision enforcement is structural (gates exist as node types) not learned (gates do not learn from outcomes or fitness signals). Implement adaptive gates: a policy-gate stage should read the OutcomeStore + FitnessAudit, apply a learned policy (e.g., 'if prior similar task failed on security, add security expert to decomposition'), and conditionally proceed or route to remediation. Gates should be data-driven.
- **MED · modularity** Task routing (CompositeRouter) learns from outcomes but has no persistence or distributed sync
  - **Evidence:** /home/william/git/\_vendor/nexus-agents/packages/nexus-agents/src/orchestration/outcomes/outcome-store.ts:1-40 (in-memory, max 10k entries); getOutcomeStore() is process singleton (no distributed state); CLI-adapters routing uses computeQualityReward() on every call (O(N) scan per executeTask per orchestrate invocation)
  - **Fix:** OutcomeStore is in-memory and process-local. For autonomous multi-agent swarms or remote orchestrate() calls, routing decisions cannot be cached or shared. Add optional persistent outcome store backend (SQLite, Redis, append-only JSONL) with a cache layer in CompositeRouter so routing decisions do not thrash N recent outcomes per task. This is blocking distributed autonomy and scaling.
- **MED · correctness** No bounded-iteration safeguard or cost-control loop back from execution to plan approval
  - **Evidence:** /home/william/git/\_vendor/nexus-agents/packages/nexus-agents/src/pipeline/dev-pipeline.ts:143-145 (MAX_VOTE_ITERATIONS=3, MAX_QA_ITERATIONS=3 hardcoded); pipeline-tool.ts:87 (dryRun stops after vote but cost/token tracking is not enforced)
  - **Fix:** Loops have max iterations (vote ≤3, QA ≤3) but no per-task cost accounting or global budget enforcement. If a task is estimated to cost $50 (buildDryRunReport) and actual execution is tracking at $200, the pipeline should interrupt and route to escalation. Add a cost-enforcement stage after each execute/validate that checks actual spend vs. plan estimate and decides proceed/refine/reject based on budget constraints from CompositeRouter.

**Composability:** The primitives (OutcomeStore, executeConsensusPlan, runDevPipeline, improvement_review, weather_report) are individually well-designed and modular. However, the COMPOSITION of these into a closed-loop autonomous cycle is incomplete. Specifically: (1) Improvement signals are produced (improvement_review surfaces issues) but not consumed by the pipeline to auto-generate next-cycle tasks. (2) Hindsight/belief memory flows one direction (outcomes → beliefs) but not backward (beliefs → voting). (3) Research outputs are string-only, not structured metadata, so research quality signals cannot inform voting weights. (4) Policy gates are architectural placeholders in V2 spec but not wired to actual learned policies from outcomes. (5) Routing learner (CompositeRouter) is ephemeral and cannot be distributed or persisted. To achieve true reusable building-block status, each primitive must declare its dependencies (e.g., executeConsensusPlan requires weather_report context, runDevPipeline optionally consumes improvement signals) and the pipeline orchestrator must wire these dependencies before execution. Currently each tool is callable standalone but their integration into a feedback loop is manual/implicit."

**Mission gaps:**

- Autonomous loop fails to close: improvement signals (bugs, routing failures, fitness drops) are detected but do NOT auto-create tasks for the next cycle. Signals are filed as GitHub issues (human-driven) but the system cannot independently self-improve by decomposing them.
- Tuning phase is missing: outcomes are logged and aggregated (weather_report, fitness_score) but there is NO automatic adjustment of orchestration parameters (routing thresholds, budget constraints, policy gates, CLI affinity) in response to observed performance.
- Distributed autonomy is blocked: OutcomeStore, composite router, and all learner state is in-memory and process-local. Swarms of remote agents cannot share routing decisions or outcome history.
- Arbitrary goal scope narrowing: Pipeline is task-driven (task → plan → implement) but has no automated scope-tightening when plans are rejected or over-budget. Vote rejection feedback does not automatically trigger scope-analysis stage.

---

### Composability & Building Blocks — health: `adequate`

- **HIGH · modularity** Export wiring fragmentation across 20+ barrel files creates maintenance surface and missed re-exports
  - **Evidence:** src/exports/ contains 20 domain-specific files (orchestration.ts, pipeline.ts, agents.ts, mcp.ts, etc.) each re-exporting 50-250+ symbols; export-contracts.test.ts documents recurring 'missing export wiring' bugs (#855, #867, #872, #876); fixes to src/mcp/tools/index.ts require parallel updates to src/exports/mcp.ts with no automatic sync
  - **Fix:** Consolidate into 3-4 mega-barrels (core, agents, orchestration-pipeline-and-tools) or use TypeScript declaration merging to auto-compose. Add pre-commit hook enforcing export mirroring within 24h, or use LSP to detect missing re-exports at edit time.
- **HIGH · user-journey** No documented or tested composition patterns for novel pipelines beyond MCP tools and run_dev_pipeline
  - **Evidence:** src/pipeline/dev-pipeline.ts and src/mcp/tools/dev-pipeline-tool.ts show one concrete pattern (plan→vote→implement→QA), but there is NO guide showing how to compose GraphBuilder + agents + consensus, when to use orchestrate vs run_dev_pipeline vs orchestrateInputToTaskContract, or how to wire the 'autonomous plan→vote→implement→log→tune loop' described in mission
  - **Fix:** Write docs/guides/COMPOSITION_PATTERNS.md with 3 worked examples: custom graph workflow (parse spec → decompose → execute), consensus-only flow, research pipeline. Show exact imports, typical defaults, error handling, outcome tracking integration. Link from ENTRYPOINTS.md.
- **HIGH · architecture** Outcome tracking infrastructure (OutcomeStore, failure categorization) is not integrated into shipping pipeline entry points; manual wiring required for 'tune' phase
  - **Evidence:** src/orchestration/outcomes/index.ts exports OutcomeStore and helpers; src/pipeline/dev-pipeline.ts does not return outcome data; runDevPipeline() result is not auto-recorded; mcp/tools/dev-pipeline-tool.ts would need custom logic to feed results back to learning loop
  - **Fix:** Add outcome-recording middleware to DevPipelineResult or create recordPipelineOutcome(result, store?) wrapper. Export from pipeline/index.ts. Update dev-pipeline-tool.ts to call it. Document expected failure categories and outcome lifecycle in learning.md.
- **MED · modularity** MCP tool registration requires manual wiring across 3+ files with no plugin/extension point model
  - **Evidence:** src/mcp/tools/index.ts is 614 lines of barrel exports; adding a new tool requires edits to (1) implementation file, (2) tools/index.ts, (3) server.ts registration call, (4) exports/mcp.ts. No trait/plugin registry. No dependency injection. Consumers cannot extend without forking.
  - **Fix:** Implement ToolRegistry (like PluginRegistry in pipeline/) with registerToolPlugin(manifest) method. Allow self-registration at module load. Document with an example custom tool in docs/guides/.
- **MED · architecture** GraphBuilder, spec parsing, and consensus engine are powerful orthogonal blocks but underutilized; no composition guide for wiring all three
  - **Evidence:** src/orchestration/graph/graph-builder.ts, src/orchestration/spec-parser.ts, src/consensus/engine.ts are independent (no circular deps) but the wiring pattern (parseSpec → decomposeSpec → dagToGraph → insertConsensusNodes → executeGraph) must be reverse-engineered from test files
  - **Fix:** Add docs/design/spec-graph-consensus-pattern.md with pseudocode flow. Provide runGraphWithConsensus() helper in src/orchestration/graph/index.ts that wires all three. Export from index.ts.
- **MED · modularity** Adapter factory (UnifiedAdapterRegistry) is internal; canonical path in CLAUDE.md not reachable via public exports
  - **Evidence:** CLAUDE.md line 127 directs to UnifiedAdapterRegistry.getGlobalRegistry() but it is in src/adapters/ (internal), not exported from index.ts. Custom tool builders must either use DI or read CLAUDE.md and navigate internal paths.
  - **Fix:** Export getGlobalRegistry() and key registry methods from exports/adapters.ts and index.ts. Add code example in COMPOSITION_PATTERNS.md showing usage in a custom tool.
- **LOW · user-journey** Inconsistent factory function presence; some modules export createX() helpers while others require manual instantiation
  - **Evidence:** src/workflows/budget-enforcement.ts exports createBudgetCircuitBreaker(); src/consensus/engine.ts exports ConsensusEngine class only (no factory); src/orchestration/outcomes/index.ts exports OutcomeStore class only. Users must know which require factories vs manual construction.
  - **Fix:** Add missing factories: createConsensusEngine(options?), createOutcomeStore(config?). Export from index.ts. Document all factories in 'Initialization Patterns' section of COMPOSITION_PATTERNS.md.

**Composability:** Strong interface design (18+ well-documented boundaries in docs/design/interfaces.md; no circular deps detected). Weakness in composition UX: (1) users assemble modules manually without clear entry points, (2) no documented patterns for extending (custom tools, workflows), (3) export wiring spans 20 files creating async maintenance burden, (4) learning loop designed but not integrated into pipeline APIs. Reusability: 7/10 — components work as blocks but require deep internal knowledge to wire together effectively.

**Mission gaps:**

- No documented guide for composing novel autonomous workflows using the full stack (GraphBuilder + agents + consensus + outcome tracking) as a reusable pattern
- Outcome tracking and learning loop ('tune' phase) exists in design but not auto-integrated; requires manual wiring in every custom pipeline
- Tool and workflow extension model is implicit (edit files, register manually) not declarative (no trait/plugin registry exposing composition points)
- Adapter factory access requires reading CLAUDE.md to locate internal paths; should be in public API with examples
- No worked examples showing how to compose parseSpec + decomposeSpec + GraphBuilder + ConsensusEngine in a single reusable function
