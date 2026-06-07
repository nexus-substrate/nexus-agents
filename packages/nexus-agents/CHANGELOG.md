# nexus-agents

## 2.123.3

### Patch Changes

- [#3602](https://github.com/nexus-substrate/nexus-agents/pull/3602) [`5771d45`](https://github.com/nexus-substrate/nexus-agents/commit/5771d4542236c69d11b0665b92367e079c42eb66) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(ci): MCP tool description-drift gate ([#3528](https://github.com/nexus-substrate/nexus-agents/issues/3528))

  Adds `scripts/check-mcp-description-drift.ts` (wired into docs-check CI): for each
  tool in TOOL_MANIFEST it statically extracts the runtime `registerTool`
  description from the tool source and compares it to the `TOOL_DESCRIPTIONS`
  doc-table source via an overlap-coefficient similarity threshold — catching the
  [#3527](https://github.com/nexus-substrate/nexus-agents/issues/3527) class where the two long-form sources silently disagree about a tool's
  behavior. Per the consensus_vote (Option B): static/deterministic parsing (no
  eval), FAIL-LOUD on any unparseable runtime description (never silently skip),
  and a similarity metric that tolerates intentional emphasis differences. The
  deliberate short-form `README_TOOL_DESCRIPTIONS` is out of scope. Aligns the one
  pre-existing drift (`query_trace`) so the gate passes clean at 46/46 tools.

## 2.123.2

### Patch Changes

- [#3600](https://github.com/nexus-substrate/nexus-agents/pull/3600) [`d488b4a`](https://github.com/nexus-substrate/nexus-agents/commit/d488b4aa39d460d5af0999b9febbcf40ed61d60f) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - refactor: centralize duplicated consensus + model-fallback constants ([#3571](https://github.com/nexus-substrate/nexus-agents/issues/3571))

  Tier C of [#3568](https://github.com/nexus-substrate/nexus-agents/issues/3568) (vote-approved). Two single-source constants replace drift-prone
  duplicated literals: `SUPERMAJORITY_THRESHOLD` (the 2/3 governance threshold,
  previously a bare `0.67` across six consensus sites) and
  `FALLBACK_CONTEXT_WINDOW`/`FALLBACK_MAX_OUTPUT` (the unknown-model fallback,
  previously duplicated across the Claude/OpenCode CLI adapters,
  model-to-cli-adapter, and delegate-to-model-router). Behavior is unchanged
  (values identical). Per a verify-before-acting audit, the 8192-vs-200000
  unknown-context defaults were left distinct (context-appropriate, not drift),
  and adapter-specific pricing / provider-specific DEFAULT_MAX_TOKENS were left
  per-source rather than collapsed into a wrong global.

## 2.123.1

### Patch Changes

- [#3598](https://github.com/nexus-substrate/nexus-agents/pull/3598) [`4044964`](https://github.com/nexus-substrate/nexus-agents/commit/4044964482cd20d1956bca423cf97b64c55dba23) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - refactor(mcp): single TOOL_MANIFEST as the canonical tool-name source ([#3566](https://github.com/nexus-substrate/nexus-agents/issues/3566))

  Introduces `mcp/tools/tool-manifest.ts` — a pure-data leaf module whose
  `TOOL_MANIFEST` array is the single source of truth for which MCP tools exist
  and their registration order. `REGISTERED_TOOL_NAMES` is now a derived
  re-export, the capability-gap detector's `AVAILABLE_TOOLS` derives directly from
  the manifest (replacing a 46-line hand-maintained copy that was kept in lockstep
  by a freshness test), and `scripts/inject-governance.ts` parses the manifest.
  Because the manifest imports nothing, core modules can derive from it without
  pulling in the MCP tool dependency graph — no import cycle. Parity tests assert
  `REGISTERED_TOOL_NAMES`, `TOOL_ANNOTATIONS` keys, and the gap-detector list all
  match the manifest, so adding/removing a tool is a one-array edit.

  Annotation-data folding (so `TOOL_ANNOTATIONS` also derives) and the AST-parser
  upgrade are tracked as follow-ups.

## 2.123.0

### Minor Changes

- [#3594](https://github.com/nexus-substrate/nexus-agents/pull/3594) [`7dbaa1c`](https://github.com/nexus-substrate/nexus-agents/commit/7dbaa1ce0f28f92010ed28cb6daaed65c153a35e) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(orchestration): shadow-logged learned strategy selection ([#3551](https://github.com/nexus-substrate/nexus-agents/issues/3551))

  MetaOrchestrator step 3 of epic [#3548](https://github.com/nexus-substrate/nexus-agents/issues/3548). Adds a learned selector that, given the
  same task signals as the rule-based selection, predicts an `ExecutionStrategy`
  and logs its would-be choice alongside the executed rule-based choice — SHADOW
  MODE only; the learned choice is never acted on (that is step 4 / [#3552](https://github.com/nexus-substrate/nexus-agents/issues/3552)). It
  reuses the existing `LinUCBBandit` (arms = strategies) rather than forking a
  second learning stack, and exposes `summarizeShadowAgreement()` as the
  would-select-vs-selected comparison surface (overall + per task class) for
  offline policy evaluation. Shadow logging is wired default-on into the `run`
  entry point via process-scoped singletons; the executed path is unchanged.

## 2.122.0

### Minor Changes

- [#3592](https://github.com/nexus-substrate/nexus-agents/pull/3592) [`232f1b1`](https://github.com/nexus-substrate/nexus-agents/commit/232f1b1824579bfe5676c85066c03808af7137a4) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(cli): safeguarded auto-file helper for suggested tasks ([#3382](https://github.com/nexus-substrate/nexus-agents/issues/3382) core)

  Adds `autoFileSuggestions()` — files candidate `PipelineTask[]` (from `checkForResearchTriggers` / `checkForCapabilityGapTriggers`) as GitHub issues with hard safeguards: rate limit (default 3/run), dedup against open issues by title, a `machine-suggested` label, sensitive org/gov-ref scrubbing, and fail-closed when the GitHub boundary is unavailable. The `gh` boundary is injectable so the safeguards are fully unit-tested without touching `gh`. This is the safe core of the suggest-only → auto-file move ([#3382](https://github.com/nexus-substrate/nexus-agents/issues/3382), Option B); the default-on entry point that invokes it lands as a focused follow-up.

- [#3581](https://github.com/nexus-substrate/nexus-agents/pull/3581) [`c173b12`](https://github.com/nexus-substrate/nexus-agents/commit/c173b12524e3726d27df0fcdb9480ffbc9e12bb7) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(pipeline): surface recurring capability gaps as suggested tasks

  Adds `checkForCapabilityGapTriggers()` to `research-trigger.ts` (extends, not forks): it reads the capability-gap ledger (`getGapLedger().summarize()`, fed by live routing traffic) and turns gaps that recur at/above a threshold (default 3) into candidate `PipelineTask`s — deduped against known ids and capped, most-frequent first. The `suggest_research_tasks` tool now returns these as a distinct `gapCandidates` list alongside the research-derived `candidates`. Suggest-only: builds task objects in memory, files/executes nothing — the human-gated front of "gap → MetaOrchestrator" ([#3540](https://github.com/nexus-substrate/nexus-agents/issues/3540)). Increment 3 of the capability-gap-ledger epic ([#3555](https://github.com/nexus-substrate/nexus-agents/issues/3555)).

- [#3573](https://github.com/nexus-substrate/nexus-agents/pull/3573) [`1c29208`](https://github.com/nexus-substrate/nexus-agents/commit/1c292080b8639cae40283beb92619708496b4b93) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(mcp): add `run` — the unified adaptive entry point (read-only)

  Adds the `run` MCP tool: give a goal and nexus-agents selects the right strategy (single-shot / dev-pipeline / pipeline / graph-workflow / orchestrate / consensus / spec / research) via the MetaOrchestrator (epic [#3548](https://github.com/nexus-substrate/nexus-agents/issues/3548)) and returns the routing decision plus the `recommendedTool` to execute it. Read-only in this release — it returns a decision and executes nothing; `forceStrategy` overrides the choice. This is intended to become the default entry point so callers stop hand-picking a pipeline tool; the specialized tools remain available as advanced force-strategy paths. Brings the registered MCP tool count to 46 (counts now derive from `REGISTERED_TOOL_NAMES`, so no count literals were edited). Inline execution via the MetaDispatcher lands in a follow-up.

- [#3584](https://github.com/nexus-substrate/nexus-agents/pull/3584) [`8775f53`](https://github.com/nexus-substrate/nexus-agents/commit/8775f53338660b5488610f0861f096700aa0a22b) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(mcp): run inline execution — wire consensus executor

  Wires the `consensus` strategy into the `run` tool's inline-execution path via a new `runConsensusForGoal()` helper (votes on the goal as the proposal through the real consensus engine; non-simulated). Now wired for `execute: true`: dev-pipeline, pipeline, research, consensus. The remaining strategies (spec, orchestrate, single-shot, graph-workflow) stay fail-closed with documented reasons. Increment B slice (c) of [#3575](https://github.com/nexus-substrate/nexus-agents/issues/3575).

- [#3582](https://github.com/nexus-substrate/nexus-agents/pull/3582) [`2dab72a`](https://github.com/nexus-substrate/nexus-agents/commit/2dab72ab264c7019cb42952422a93ae2be1563ee) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(mcp): run tool inline execution — execute:true (dev-pipeline wired)

  The `run` entry point gains `execute: true` (default false). When set, it selects a strategy via the MetaOrchestrator and dispatches it through the MetaDispatcher to a real engine executor, returning the result and recording a `MetaOutcomeRecord` keyed by `decisionId`. The first wired executor is `dev-pipeline` (real, non-simulated — via a new `runDevPipelineForGoal` helper); strategies without an executor fail closed with a typed `MetaDispatchError`. Executors live at the MCP-tool layer (injected into the dispatcher) so the orchestration core stays cycle-free. Default behavior is unchanged (read-only routing decision). Increment B slice (a) of [#3575](https://github.com/nexus-substrate/nexus-agents/issues/3575); remaining engine executors and the demotion of the specialized tools follow in later slices.

- [#3583](https://github.com/nexus-substrate/nexus-agents/pull/3583) [`943703a`](https://github.com/nexus-substrate/nexus-agents/commit/943703a4b139eb941319092f81cd533c1af1c39a) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(mcp): run inline execution — wire pipeline + research executors

  Wires two more strategy executors into the `run` tool's inline-execution path (`execute: true`): `pipeline` and `research` both dispatch to a new `runPipelineForGoal()` helper (auto-detected template, non-simulated) over the adaptive orchestrator. `graph-workflow` remains intentionally unwired (graph workflows are pre-defined templates, not a goal-only call) and fails closed with a typed error, as do the still-unwired strategies. Increment B slice (b) of [#3575](https://github.com/nexus-substrate/nexus-agents/issues/3575).

### Patch Changes

- [#3589](https://github.com/nexus-substrate/nexus-agents/pull/3589) [`40ee903`](https://github.com/nexus-substrate/nexus-agents/commit/40ee9031005ffe3df50fba9a5c2f6684145c284f) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - fix(mcp): correct ci_health_check annotation — not read-only/idempotent

  `ci_health_check` appends a CI-health telemetry event on every call (`appendCiHealthEvent`), so its MCP annotation claiming `readOnlyHint: true` + `idempotentHint: true` was inaccurate ([#3530](https://github.com/nexus-substrate/nexus-agents/issues/3530)). Sets both to false and documents the per-call telemetry append in `sideEffects`. Because the tool is now non-read-only, the `check:tool-prerequisites` gate requires it to be classified — added to `NO_PREREQUISITE` (it has no world-state precondition). No behavior change; the annotation now matches reality.

- [#3577](https://github.com/nexus-substrate/nexus-agents/pull/3577) [`65227cd`](https://github.com/nexus-substrate/nexus-agents/commit/65227cd22e85758975545a9428aac40ef6bd6295) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - docs(governance): codify dependency-blocked work tracking

  Strengthens the "track all work" discipline (AGENTS.md + `.rules/track-deferred-work.md`) to explicitly cover the most-forgotten case: work deferred _because it depends on another deliverable_ ("do after X lands", "increment B once A merges"). Such work must get an issue the moment it's named — not when the blocker clears — with the blocking dependency and unblock trigger recorded. Adds a "when a blocker clears, surface its dependents" step (search `gh issue list --search "#<id>"` / walk the epic's children) so a completed dependency surfaces the next work instead of relying on memory. Clarifies that a prose "Phase 3 / increment B will…" in an epic body is a description, not a tracked task — every step needs its own issue.

- [#3586](https://github.com/nexus-substrate/nexus-agents/pull/3586) [`3a53050`](https://github.com/nexus-substrate/nexus-agents/commit/3a530504e35a2cd7e0da5749af5faa68e0fac52c) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - docs(research): evaluate Anthropic defending-code-reference-harness ([#3574](https://github.com/nexus-substrate/nexus-agents/issues/3574))

  Adds a research-spike findings doc evaluating the (unmaintained) Anthropic defending-code-reference-harness against nexus-agents across five overlap areas, with adopt/adapt/skip + trigger per area (capability-bias gated). Net: two genuine borrows deferred behind triggers — execution-verified findings (stronger than our reasoning-only Discovered-Issues gate) and the generate→validate→iterate patch loop (a model for the [#3540](https://github.com/nexus-substrate/nexus-agents/issues/3540) auto-implementation frontier); the rest is shape we already have (consensus/Workflow verify-dedupe, sandbox [#2500](https://github.com/nexus-substrate/nexus-agents/issues/2500) + ClawGuard). Reference only — extract patterns, do not vendor.

- [#3578](https://github.com/nexus-substrate/nexus-agents/pull/3578) [`139f5ca`](https://github.com/nexus-substrate/nexus-agents/commit/139f5ca8a7576fb4ae0331032b6fd25bfd2793a7) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - chore(test): derive governance-entity counts from canonical sources

  Removes hardcoded count literals from the test suite for built-in experts (12), evaluation tasks (15), and failure categories, deriving them from their canonical sources (`BuiltInExpertTypeSchema.options.length`, `EVALUATION_TASKS.length`, `OutcomeFailureCategorySchema.options.length`) so adding/removing one no longer requires bumping a number across multiple files. The canonical lists' own count assertions are replaced with structural invariants (non-empty, unique ids); consumer/registry assertions cross-check against the canonical length. Also couples the supply-chain `FULL_PANEL` to the voter-role count and fixes a stale "10 built-in experts" comment. Tier A of the evergreen DRY epic ([#3568](https://github.com/nexus-substrate/nexus-agents/issues/3568)).

- [#3567](https://github.com/nexus-substrate/nexus-agents/pull/3567) [`41f1d99`](https://github.com/nexus-substrate/nexus-agents/commit/41f1d99ca1fa047fc5b9c879e38b5db167bdaffd) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - chore(mcp): derive MCP tool counts from REGISTERED_TOOL_NAMES.length

  Removes the hardcoded `45` tool-count literal from the test suite so adding or removing a tool no longer requires bumping a number in multiple files. `mcp/tools/index.test.ts` and `tool-annotations.test.ts` now cross-check their registries against `REGISTERED_TOOL_NAMES.length`; the redundant count assertion in `cli-server-tools.test.ts` (which asserted the canonical list's own length — a tautology) is replaced with structural invariants (unique, non-empty names). Also corrects the stale "all 20 registered MCP tools" comment on `TOOL_TIER_MAP`. Phase 1 of the tool-registry centralization epic ([#3563](https://github.com/nexus-substrate/nexus-agents/issues/3563)).

- [#3591](https://github.com/nexus-substrate/nexus-agents/pull/3591) [`845f703`](https://github.com/nexus-substrate/nexus-agents/commit/845f703b846b91ef59148ca28ac8c5b9c5fb4741) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - refactor(security): single canonical FINDING_SEVERITY_LEVELS source

  Extracts `FINDING_SEVERITY_LEVELS` (`['critical','high','medium','low','info'] as const`) in `security/sarif-types.ts` as the single source of truth for the 5-value finding-severity vocabulary. The five previously-inline `z.enum([...])` re-declarations (severity-consensus, finding-triage, agents/output-schemas ×2, expert-types VulnerabilitySeverity) + the pr-review `minSeverity` enum + `ReviewSeverity` type now derive from it, and both `SEVERITY_ORDER` maps derive their keys from the tuple (sarif ascending; pr-review keeps its intentionally-inverted descending direction — only the key set is unified). No behavior change; the [#3570](https://github.com/nexus-substrate/nexus-agents/issues/3570)/[#3579](https://github.com/nexus-substrate/nexus-agents/issues/3579) lockstep guard stays green and now structurally can't drift. Scoped to the 5-value family only — the distinct 4-value and major/minor/suggestion vocabularies are untouched. consensus_vote 5/0.

- [#3590](https://github.com/nexus-substrate/nexus-agents/pull/3590) [`fa9d7cb`](https://github.com/nexus-substrate/nexus-agents/commit/fa9d7cbcc6648c4be5a6c9b648ac323ccb705136) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - chore(pipeline): remove orphaned runResearchPipeline subsystem ([#3492](https://github.com/nexus-substrate/nexus-agents/issues/3492))

  Removes the dead `runResearchPipeline` lineage ([#1711](https://github.com/nexus-substrate/nexus-agents/issues/1711)): `research-pipeline.ts` + its test, the no-op `RESEARCH_PIPELINE_PLUGIN` and its `CORE_PLUGINS` entry, and the `pipeline/index.ts` exports. It had zero runtime call sites, its only consumer (the `research` pipeline template) was retired in [#3488](https://github.com/nexus-substrate/nexus-agents/issues/3488), and the capability is served by the AdaptiveOrchestrator templates + the MetaOrchestrator `research` strategy (routes to `run_pipeline`). Decided by consensus_vote (higher_order, 5/0 REMOVE). If a distinct research pipeline is wanted later, rebuild against the current architecture.

- [#3585](https://github.com/nexus-substrate/nexus-agents/pull/3585) [`ca8d6ba`](https://github.com/nexus-substrate/nexus-agents/commit/ca8d6bab8a23de0cd3349d40c296f8694c441114) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - docs: establish `run` as the default MCP entry point

  Documents `run` as THE default way to drive nexus-agents (give a goal → MetaOrchestrator selects, and with `execute: true` runs, the right strategy) and frames the specialized pipeline tools (`run_dev_pipeline`, `run_pipeline`, `run_graph_workflow`, `orchestrate`, `execute_spec`, `consensus_vote`, `delegate_to_model`) as advanced force-strategy paths — de-emphasized but fully callable. Completes the demotion condition from the MetaOrchestrator design vote. Increment B slice (d) / closes the functional scope of the run entry point ([#3575](https://github.com/nexus-substrate/nexus-agents/issues/3575)).

- [#3579](https://github.com/nexus-substrate/nexus-agents/pull/3579) [`9535f7a`](https://github.com/nexus-substrate/nexus-agents/commit/9535f7a25cf58e07b53369f2830b09240db9d5e4) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - test(security): add finding-severity vocabulary consistency guard

  Adds a lockstep test pinning `FindingSeveritySchema` (security/sarif-types.ts) as the canonical 5-value finding-severity vocabulary (`critical|high|medium|low|info`) and asserting the other importable members of that family stay in sync: `VulnerabilitySeveritySchema`, and the key sets of both `SEVERITY_ORDER` maps (sarif-types + dogfooding/pr-review-types). A severity added to one but not another now fails CI instead of drifting silently. The two order maps' values are intentionally inverted (opposite sort directions) so only their key sets are compared. Distinct vocabularies (4-value no-info, major/minor/suggestion, failure/error/audit/hazard) are explicitly out of scope. Tier B (guard step) of evergreen DRY epic [#3568](https://github.com/nexus-substrate/nexus-agents/issues/3568); the extract-and-derive consolidation of inline copies is a vote-gated follow-up.

- [#3580](https://github.com/nexus-substrate/nexus-agents/pull/3580) [`b9b8b10`](https://github.com/nexus-substrate/nexus-agents/commit/b9b8b10e7151e8b8ff59fe57b43c20a94eb7759e) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - test(mcp): consolidated tool-registry consistency guard

  Adds a single audit test asserting every MCP-tool-keyed parallel registry stays in sync with the canonical `REGISTERED_TOOL_NAMES`: `TOOL_ANNOTATIONS` must cover exactly the registered tools (complete), while the intentional-subset registries (`TOOL_PREREQUISITES`, `NO_PREREQUISITE`, `tool-risk` `READ_ONLY_TOOLS`, `TOOL_TIER_MAP`) may omit tools but must contain no orphan keys (a dangling entry for a removed/renamed tool now fails CI with a message naming the registry). `policy-rules.ts` `READ_ONLY_TOOLS` is deliberately excluded — it is a different vocabulary (generic agent/filesystem tools, not MCP tool names). Phase 2 of the tool-registry centralization epic ([#3563](https://github.com/nexus-substrate/nexus-agents/issues/3563)).

- [#3588](https://github.com/nexus-substrate/nexus-agents/pull/3588) [`ada676a`](https://github.com/nexus-substrate/nexus-agents/commit/ada676aad23ae87a7be0006f62b9ed065a79dccf) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - fix(consensus): retry voter completion without responseFormat on tool-use 404

  Restores the 2/7 voters (OpenRouter-backed devex/catfish) that failed every vote with `404 "No endpoints found that support tool use"`. Root cause: the vote request asks for native structured output via `responseFormat: json_schema`, which OpenRouter implements through provider tool-use — a provider without tool-use endpoints returns a hard 404 instead of ignoring the field, silently shrinking a 7-role panel to 5. The fix retries the completion once without `responseFormat` on that specific error (the existing prose-JSON parse path handles a response without it), keeping the panel at full strength. Generic errors are unaffected (no retry). Fixes [#3497](https://github.com/nexus-substrate/nexus-agents/issues/3497).

## 2.121.0

### Minor Changes

- [#3561](https://github.com/nexus-substrate/nexus-agents/pull/3561) [`17f2847`](https://github.com/nexus-substrate/nexus-agents/commit/17f2847e468970f4af24ec9e7567ebe3df5c4e51) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(task-analysis): add CapabilityGapLedger — aggregate discarded gap reports into a build backlog

  Adds `createCapabilityGapLedger()`, which aggregates the `CapabilityGapReport`s produced on every routing / MetaOrchestrator decision (currently computed and thrown away) into a frequency-ranked, deduplicated summary of the tools and experts the system keeps wanting but lacks — the substrate for a self-directed build backlog ([#3555](https://github.com/nexus-substrate/nexus-agents/issues/3555)). `record()` ingests a report with optional `{goal, decisionId}` context; `summarize()` returns distinct gaps ranked by observation count (with a bounded sample of example goals); storage is bounded. `createMetaOrchestrator()` gains an optional `gapLedger` injectable that records each decision's gaps when provided (default absent — no behavior change). Later increments aggregate this and feed `suggest_research_tasks`.

- [#3562](https://github.com/nexus-substrate/nexus-agents/pull/3562) [`2065820`](https://github.com/nexus-substrate/nexus-agents/commit/2065820bd4c987f9d6e554e67d7c28244e4dc160) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(orchestration): feed the capability-gap ledger from live routing traffic

  Adds a process-wide `getGapLedger()` singleton (mirroring `getOutcomeStore()`) plus a `recordRoutingGaps()` helper, and wires the live `orchestrate` tool to record the capability gaps its routing decision already computes (`workflow-router.ts` had been discarding them). The gap ledger ([#3555](https://github.com/nexus-substrate/nexus-agents/issues/3555)) now accumulates real signal from production routing traffic — no longer dependent on the (owner-gated) unified entry point — turning recurring "tool/expert needed but missing" gaps into a frequency-ranked, self-directed build backlog. No-op when a decision satisfied every required capability.

- [#3560](https://github.com/nexus-substrate/nexus-agents/pull/3560) [`9ca09e9`](https://github.com/nexus-substrate/nexus-agents/commit/9ca09e998bbec94e6600a5ecdab45cf608c7c395) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(orchestration): add MetaDispatcher with decision-keyed outcome recording

  Adds `createMetaDispatcher()` — executes the strategy a `MetaDecision` selected and records the result as a dedicated `MetaOutcomeRecord` keyed by `decisionId`. The dispatcher takes an injected per-strategy executor map so the orchestration core stays free of the engine/MCP dependency graph (cycle-safe); real engine executors are wired in later by the outward-facing entry point. Strategy-level outcomes get their own record type rather than reusing the orchestration/learning `TaskOutcome` types (both of which require CLI/model fields a strategy spanning many CLIs cannot supply) — joining selection records with these by `decisionId` gives learned selection an uncontaminated dataset. Fails closed: a missing executor or a throwing executor records a failure outcome and rejects with a typed `MetaDispatchError` (never silent). Includes audit-log and in-memory recording outcome sinks.

- [#3554](https://github.com/nexus-substrate/nexus-agents/pull/3554) [`c35b365`](https://github.com/nexus-substrate/nexus-agents/commit/c35b3650c6da25ffa0408dfc22bee455ced01e34) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(orchestration): add MetaOrchestrator selection tier (step 1)

  Introduces `createMetaOrchestrator()` — a thin, deterministic selection tier that, given a goal, picks one `ExecutionStrategy` among the existing specialized pipelines (single-shot / dev-pipeline / pipeline / graph-workflow / orchestrate / consensus / spec / research). It reuses the existing `SharedTaskAnalyzer`, `WorkflowRouter`, and `classifyTask` brains rather than duplicating their logic, and returns a transparent `MetaDecision` (strategy + reasoning + confidence + alternatives + shaping flag + underlying signals) with a `forceStrategy` power-user override. This is the "routing" pattern (select once per task), not a runtime-switching mega-pipeline. Dispatch wiring, decision logging, and learned selection follow in later steps of the epic.

- [#3558](https://github.com/nexus-substrate/nexus-agents/pull/3558) [`42ef02c`](https://github.com/nexus-substrate/nexus-agents/commit/42ef02ce2b67851f06e52724a57ebfe154f9059f) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(orchestration): log MetaOrchestrator selection decisions (step 2)

  Every MetaOrchestrator selection now emits a `MetaSelectionRecord` (decision id, goal, chosen strategy, confidence, pattern, pipeline type, alternatives, shaping flag, forced flag, timestamp) to a configurable `MetaDecisionSink`. The default sink writes a structured audit log line; `createRecordingSink()` provides an in-memory bounded buffer for inspection. `MetaDecision` now carries a `decisionId` — the join key a later task outcome references (mirrors `TaskOutcome.routingDecisionId`), the substrate that learned selection (step 3) will mine. Observability only: selection behavior is unchanged. This record type is intentionally distinct from the model-centric `RoutingDecision` in the learning module (strategy selection vs model selection).

### Patch Changes

- [#3557](https://github.com/nexus-substrate/nexus-agents/pull/3557) [`1edb106`](https://github.com/nexus-substrate/nexus-agents/commit/1edb1061cf1ce683333621cf60a3dc0e57588756) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - fix(task-analysis): sync capability-gap-detector registry with canonical sources

  The `capability-gap-detector` static registries had drifted: the tool set listed 21 names (doc-comment claimed "20") against 45 actually registered, and the expert set listed 10 against 12. A task requiring a real-but-unlisted tool/expert (e.g. `search_codebase`, `pr_review`, `qa_expert`) would be falsely reported as a capability gap. This was latent today (the routing path only requires a small fixed subset) but becomes a real defect as required-capability inference expands or as the capability-gap ledger ([#3555](https://github.com/nexus-substrate/nexus-agents/issues/3555)) consumes these reports. Synced both sets to the canonical `REGISTERED_TOOL_NAMES` and `BuiltInExpertTypeSchema`, corrected the misleading doc-comments, and added freshness tests that import the canonical sources and fail CI on future drift.

## 2.120.4

### Patch Changes

- [#3545](https://github.com/nexus-substrate/nexus-agents/pull/3545) [`e00879c`](https://github.com/nexus-substrate/nexus-agents/commit/e00879c3db6f328a6f850696b7b07eb32acc0874) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - fix(research): arXiv discovery OR-joins topic terms + sorts by relevance ([#3543](https://github.com/nexus-substrate/nexus-agents/issues/3543))

  `buildArxivUrl` AND-joined every topic term (`(ti:w1 OR abs:w1) AND (ti:w2 OR abs:w2) …`),
  requiring all terms to co-occur in one paper — so multi-word topics returned 0 arXiv
  results. Now OR-joins terms (any may match) and sorts `sortBy=relevance` (so the fetched
  set is on-topic rather than merely recent); the coverage-based relevance filter ([#3542](https://github.com/nexus-substrate/nexus-agents/issues/3542))
  refines downstream. Completes the research_discover repair started in [#3542](https://github.com/nexus-substrate/nexus-agents/issues/3542) (the [#3543](https://github.com/nexus-substrate/nexus-agents/issues/3543)
  arXiv sub-finding split from [#3541](https://github.com/nexus-substrate/nexus-agents/issues/3541)).

## 2.120.3

### Patch Changes

- [#3542](https://github.com/nexus-substrate/nexus-agents/pull/3542) [`7c1fd1b`](https://github.com/nexus-substrate/nexus-agents/commit/7c1fd1b05547dd4dcab646e523283fadfe23bb37) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - fix(research): relevance scoring no longer filters out all results for long topics ([#3541](https://github.com/nexus-substrate/nexus-agents/issues/3541))

  `computeRelevanceScore` normalized by `keywords.length * 3` (requiring every keyword
  in both title AND description), so long/compound topics drove every candidate below
  the 0.3 threshold — `research_discover` returned nothing on the default path, breaking
  the loop's research stage. Now scores by keyword **coverage** (`0.8·matched/keywords +
0.2·titleHits/keywords`, distinct keywords), preserving title-weighting while keeping
  clearly-relevant items above threshold. (The separate arXiv-returns-0 sub-finding in
  [#3541](https://github.com/nexus-substrate/nexus-agents/issues/3541) needs live-API investigation and is not addressed here.)

## 2.120.2

### Patch Changes

- [#3537](https://github.com/nexus-substrate/nexus-agents/pull/3537) [`639608f`](https://github.com/nexus-substrate/nexus-agents/commit/639608fafa4a125bfed043e406c91cf748b56730) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(graph): add priorResults replay to executeGraph (selective-retry slice 2)

  `GraphExecuteOptions.priorResults` lets a caller pass prior NodeResults; the
  executor replays any node with a `success` entry (reusing its stateUpdates so
  downstream state is faithful) instead of re-executing it, while failed/absent
  nodes run fresh. Additive/optional — no behavior change without the option.
  Foundation primitive for `retryFailed` to re-run only failed nodes (slice 3, [#3534](https://github.com/nexus-substrate/nexus-agents/issues/3534)).

- [#3535](https://github.com/nexus-substrate/nexus-agents/pull/3535) [`0b92889`](https://github.com/nexus-substrate/nexus-agents/commit/0b9288905cd19297725539082de52eb895e9a8dc) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(graph): classify failed NodeResults with errorCategory + isRetryable (selective-retry foundation)

  Failed `NodeResult`s now carry an optional `errorCategory` (5-value taxonomy) and
  derived `isRetryable` (only `transient` is retry-safe by default). The executor
  classifies thrown node errors via `categorizeOutcomeError` → `coarsenFailureCategory`;
  node-not-found → internal, post-step verification failure → business (both
  non-retryable). Additive/optional — no behavior change for existing consumers.
  This is slice 1 of selective-retry ([#3534](https://github.com/nexus-substrate/nexus-agents/issues/3534)): gives retry logic a safe signal so
  only transient failures are re-run. Part of [#3531](https://github.com/nexus-substrate/nexus-agents/issues/3531).

- [#3538](https://github.com/nexus-substrate/nexus-agents/pull/3538) [`16e0887`](https://github.com/nexus-substrate/nexus-agents/commit/16e0887601f1b3a5b436347b317e818949265253) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(pipeline): make retryFailed selective + retryability-gated (selective-retry slice 3)

  `PipelineRunner.retryFailed` now replays prior successful nodes (via the slice-2
  `priorResults` executor option) so only the failed nodes and their dependents
  re-run, and it only retries when at least one failure is `isRetryable` (transient)
  — permanent failures (validation/permission/business/internal) no longer trigger
  a pointless re-run. `PipelineResult` gains optional `nodeResults` (the raw results,
  carrying the retryability signal). Back-compat: a result without `nodeResults`
  falls back to the prior whole-pipeline retry. Completes [#3534](https://github.com/nexus-substrate/nexus-agents/issues/3534) ([#3531](https://github.com/nexus-substrate/nexus-agents/issues/3531)).

## 2.120.1

### Patch Changes

- [#3527](https://github.com/nexus-substrate/nexus-agents/pull/3527) [`a789e53`](https://github.com/nexus-substrate/nexus-agents/commit/a789e53762d69894f344fdbcf78b81ab37cc57d9) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - fix(mcp): correct 5 inaccurate tool descriptions (JSDoc audit Phase 2b)

  Removes false/overstated claims from registered MCP tool descriptions (consumer-facing):
  run_graph_workflow advertised "rollback" (no rollback exists — only checkpoints/events/audit);
  execute_expert promised "confidence" (not in the response); list_experts promised "default model"
  (not returned); list_workflows promised "required inputs" (returns name/version/description/category);
  ci_health_check claimed "idempotent / no state mutated" (appends a local telemetry event per call).
  Fixed in both the tool files and scripts/tool-descriptions-data.ts (the docs source), and regenerated
  ENTRYPOINTS/README/capabilities. [#3516](https://github.com/nexus-substrate/nexus-agents/issues/3516) / [#3520](https://github.com/nexus-substrate/nexus-agents/issues/3520).

## 2.120.0

### Minor Changes

- [#3511](https://github.com/nexus-substrate/nexus-agents/pull/3511) [`975f228`](https://github.com/nexus-substrate/nexus-agents/commit/975f228622e0c8d4a86ae898d658277ca20a3efc) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(consensus): escalate borderline higher_order quickMode approvals to the full panel ([#3174](https://github.com/nexus-substrate/nexus-agents/issues/3174))

  `quickMode` approvals now escalate to the full 7-voter panel when a
  `higher_order`/`opinion_wise` vote approves with a borderline Bayesian
  posterior (`posteriorApproval` below `HIGHER_ORDER_ESCALATION_POSTERIOR_FLOOR`,
  0.65). Previously escalation fired only via the contrarian-agent check, which
  ignored the posterior — a low-confidence Bayesian approval looked identical to a
  clean one. The posterior check runs first, so a borderline approval escalates
  without spending a contrarian call. New pure predicate `shouldEscalateLowPosterior`
  in `consensus-vote-types.ts` (unit-tested); non-higher-order strategies,
  rejections, and full-panel votes are unaffected.

### Patch Changes

- [#3508](https://github.com/nexus-substrate/nexus-agents/pull/3508) [`d8b9ae0`](https://github.com/nexus-substrate/nexus-agents/commit/d8b9ae06dd3b75e61141337b54d25e5eccde3f54) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - docs(architecture): add a Composability Model section to the architecture overview

  Documents the three-tier model behind the 45 MCP tools — primitives,
  coordinators, orchestrators — the data-flow contracts that let one tool's
  output feed the next, the three composition levels (runtime / YAML /
  programmatic), and a worked security-audit example traced through four tools.
  Closes the gap where the architecture overview had Core Components but no
  explicit composability/tiering model ([#3251](https://github.com/nexus-substrate/nexus-agents/issues/3251)).

## 2.119.2

### Patch Changes

- [#3504](https://github.com/nexus-substrate/nexus-agents/pull/3504) [`5277377`](https://github.com/nexus-substrate/nexus-agents/commit/5277377d76a089d0e0b0243cbcca99856154f6a8) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(cli): actionable recovery guidance for CLI detection errors ([#3213](https://github.com/nexus-substrate/nexus-agents/issues/3213))

  CLI detection failures now carry a class-specific, runnable recovery step (via
  `detectionRecoveryHint` / `DETECTION_ERROR_SOLUTIONS`) with a
  `docs/TROUBLESHOOTING.md` pointer — e.g. permission → `chmod +x "$(command -v
<cli>)"`, timeout → check PATH for hung mounts / re-run with `--verbose`,
  not-found → install + PATH guidance. `nexus-agents setup` prints the hint beneath
  each unavailable CLI's status line instead of just a terse cause phrase.

## 2.119.1

### Patch Changes

- [#3501](https://github.com/nexus-substrate/nexus-agents/pull/3501) [`43a79de`](https://github.com/nexus-substrate/nexus-agents/commit/43a79de47ae69cfc313729285ad1f83c3433a06a) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - fix(routing): log INFO when the model-availability cache falls back to all CLIs ([#3188](https://github.com/nexus-substrate/nexus-agents/issues/3188))

  `CompositeRouter`'s availability gate had two silent fallback-to-all paths (empty
  cache union; fully-filtered-out set) — so an operator relying on
  `AvailableModelsCache` couldn't tell when the gate had degraded to a no-op (only
  the cache-error path logged). Both now log at INFO with the candidate count.
  Behavior-preserving (routing still never wedges); the events are just observable.

## 2.119.0

### Minor Changes

- [#3498](https://github.com/nexus-substrate/nexus-agents/pull/3498) [`b6e0730`](https://github.com/nexus-substrate/nexus-agents/commit/b6e07305453506fcf676b2759be000ff0d30b6d2) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(graph): in-graph consensus gate node + `runGraphWithConsensus` ([#3267](https://github.com/nexus-substrate/nexus-agents/issues/3267))

  Adds a reusable in-graph consensus primitive (consensus vote, Option A): an
  injected `ConsensusVoter` runs at a `createConsensusGateNode`, writes a typed
  `ConsensusVerdict` to graph state, and **fails closed** (any voter or
  proposal-extraction error → `rejected`, never a silent pass-through). Branch on
  the verdict with `addConditionalEdge`, or use the `runGraphWithConsensus`
  one-shot convenience. The dev-pipeline `vote` stage is refactored to delegate to
  the same `runConsensusGate` core, so there is a single in-graph-consensus
  implementation. All exported from the package root; documented in
  `COMPOSITION_PATTERNS.md`.

## 2.118.0

### Minor Changes

- [#3495](https://github.com/nexus-substrate/nexus-agents/pull/3495) [`2cd6dbe`](https://github.com/nexus-substrate/nexus-agents/commit/2cd6dbe6bfdd369f7116717741f8b47bbacca7c1) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(pipeline): estimate-relative token budget for run_pipeline ([#3262](https://github.com/nexus-substrate/nexus-agents/issues/3262))

  Activates the existing `BudgetGuard`/`BudgetCircuitBreaker` ([#3395](https://github.com/nexus-substrate/nexus-agents/issues/3395)) with a budget
  seeded from the task's token estimate, so a `run_pipeline` run that overruns its
  plan estimate is short-circuited (fail-closed, with an observable
  `budget_exceeded` event) instead of spending unboundedly. New pure helpers
  `estimateRelativeBudget` + `resolveBudgetTolerance` (`NEXUS_BUDGET_TOLERANCE`,
  default 1.5×; token-based so it holds under `NEXUS_BILLING_MODE=plan`). Gated
  behind `NEXUS_BUDGET_ENFORCE=1` (default-off — no behavior change until enabled);
  the whole-run estimate is approximated as `perCall × stageCount`.

## 2.117.3

### Patch Changes

- [#3493](https://github.com/nexus-substrate/nexus-agents/pull/3493) [`b1f2374`](https://github.com/nexus-substrate/nexus-agents/commit/b1f237411c99404e0d1b45b336b173a768dfc81d) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - chore(pipeline): retire the unrunnable `research` pipeline template ([#3488](https://github.com/nexus-substrate/nexus-agents/issues/3488))

  Per the [#3488](https://github.com/nexus-substrate/nexus-agents/issues/3488) consensus vote (5-0), the `research` template — whose
  `investigate`/`synthesize` stages were never implemented and whose stage order
  was incoherent — has been removed along with its orphaned `SYNTHESIS`/
  `DELIVERABLES` graph state keys. Research-classified tasks now route to the
  `general` pipeline (research → plan → vote → implement → qa → security) via an
  explicit retired-template alias, instead of failing or emitting an "unknown
  template" warning. The unwired `runResearchPipeline` subsystem ([#1711](https://github.com/nexus-substrate/nexus-agents/issues/1711)) is tracked
  separately in [#3492](https://github.com/nexus-substrate/nexus-agents/issues/3492).

## 2.117.2

### Patch Changes

- [#3489](https://github.com/nexus-substrate/nexus-agents/pull/3489) [`30af19e`](https://github.com/nexus-substrate/nexus-agents/commit/30af19e00a8756068c112db8488f4c0624382e98) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - fix(pipeline): fall back to a runnable template instead of failing on unimplemented stages ([#3487](https://github.com/nexus-substrate/nexus-agents/issues/3487))

  A research-shaped task auto-classified to the `research` pipeline template, whose
  `investigate`/`synthesize` stages have no implementation in any registry, so
  `run_pipeline` hard-failed with "Missing stage implementations". The orchestrator
  now validates the resolved template against the stage registry and substitutes a
  satisfiable built-in template (general → dev) when stages are missing, so the
  research/plan/vote workflow runs end-to-end instead of erroring. The fallback
  compile error is also now actionable — naming the template, the missing stages,
  and the available stages — so an unimplemented-stage failure is distinguishable
  from an auth or transport error.

## 2.117.1

### Patch Changes

- [#3486](https://github.com/nexus-substrate/nexus-agents/pull/3486) [`3b991bc`](https://github.com/nexus-substrate/nexus-agents/commit/3b991bcd46b87f8a63334959e7998a104c3d8803) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - fix(cli-adapters): classify OpenCode error-only streams instead of PARSE_ERROR ([#3485](https://github.com/nexus-substrate/nexus-agents/issues/3485))

  An error-only OpenCode NDJSON stream (e.g. an upstream 401 → `{"type":"error",…}`
  with no assistant content) was misclassified as `PARSE_ERROR`, masking the real
  cause and dropping the remediation hint. The subprocess adapter now consumes the
  parser's extracted error message via a new optional
  `ICliResponseParser.extractErrorMessage`, classifying it through the shared
  `classifyExtractedError` (rate-limit → auth → generic). An upstream 401 now
  surfaces as `NOT_AUTHENTICATED: … → Re-authenticate: run \`opencode auth login\``
  instead of "Failed to parse response". The optional parser method lets other CLI
  adapters opt into the same handling for their error-only streams.

## 2.117.0

### Minor Changes

- [#3483](https://github.com/nexus-substrate/nexus-agents/pull/3483) [`7d784d6`](https://github.com/nexus-substrate/nexus-agents/commit/7d784d6e9f747281729b90ffa075f9ad15150163) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(pipeline): wire accumulated context into the run_pipeline research stage ([#2795](https://github.com/nexus-substrate/nexus-agents/issues/2795))

  Closes the long-standing `[#2795](https://github.com/nexus-substrate/nexus-agents/issues/2795)` TODO in `stage-wrappers.ts`: the research stage
  of the `run_pipeline` MCP tool now prepends accumulated memory context
  (beliefs, prior research, outcomes) to the task, completing the [#2792](https://github.com/nexus-substrate/nexus-agents/issues/2792) Phase-3
  entry-point wiring for that path. Adds a shared `getContextPromptPrefix` helper
  in `context-retriever.ts` that centralizes the `NEXUS_CONTEXT_RETRIEVER_INJECT`
  rollout gate (default-off) and the fetch→summarize sequence reused by
  orchestrate / execute_expert / stage-wrappers. Fail-soft and behavior-preserving
  until the bake-in flips the flag on.

## 2.116.0

### Minor Changes

- [#3481](https://github.com/nexus-substrate/nexus-agents/pull/3481) [`85815c5`](https://github.com/nexus-substrate/nexus-agents/commit/85815c5fcdd0394d22c2730b963896be0f39d5e6) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(mcp): wire accumulated context into execute_expert ([#3238](https://github.com/nexus-substrate/nexus-agents/issues/3238))

  Extends the [#2792](https://github.com/nexus-substrate/nexus-agents/issues/2792) entry-point context wiring to `execute_expert` (previously only
  routing/orchestrate/graph consumed `getContextForTask`). Gated behind
  `NEXUS_CONTEXT_RETRIEVER_INJECT=1` — the same default-off rollout flag orchestrate
  uses — so there is no behavior change until the bake-in flips it on. When enabled,
  the expert task is prefixed with a sanitized "[Prior context]" block (beliefs,
  memories, prior research, outcomes). Fail-soft on any retrieval error. The prefix
  is run through `sanitizeExpertSummary` (the memory backends are writable by the
  untrusted `memory_write` tool), and the access policy is derived from the
  prefix-free task so accumulated context can never widen the derived operations.

## 2.115.1

### Patch Changes

- [#3479](https://github.com/nexus-substrate/nexus-agents/pull/3479) [`9d12375`](https://github.com/nexus-substrate/nexus-agents/commit/9d123754a88dd6475bafa799100dba91e4d5f9a6) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - fix(pipeline): remove the dead `reinforcePlanBeliefs` no-op ([#3465](https://github.com/nexus-substrate/nexus-agents/issues/3465))

  `reinforcePlanBeliefs` ([#1720](https://github.com/nexus-substrate/nexus-agents/issues/1720)) reinforced/weakened a `plan-approach:<task>` belief
  that was never `retain`ed, so the call had been a silent no-op since it landed.
  Removed it: the functional plan-learning channel is `HindsightRecord`s (written by
  `applyPipelineHindsight`, read into plan/vote by [#3257](https://github.com/nexus-substrate/nexus-agents/issues/3257)), making the never-wired,
  task-specific belief path redundant dead code. No behavior change.

## 2.115.0

### Minor Changes

- [#3477](https://github.com/nexus-substrate/nexus-agents/pull/3477) [`255aaf2`](https://github.com/nexus-substrate/nexus-agents/commit/255aaf2783d5460584e71e688ac3e25086336019) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(pipeline): surface prior research to dev-pipeline plan/vote ([#3472](https://github.com/nexus-substrate/nexus-agents/issues/3472))

  Completes the research→context loop. [#3148](https://github.com/nexus-substrate/nexus-agents/issues/3148) wired research insights into
  `getContextForTask` (orchestrate + graph workflows); this brings the same signal
  to the multi-agent dev-pipeline, which assembles its own research context.
  `runPlanningPhase` now prepends a bounded, labeled "Prior research on related
  topics" block — technique name + status + topic — to the plan/vote context,
  complementing the [#3257](https://github.com/nexus-substrate/nexus-agents/issues/3257) hindsight block (hindsight = what happened on similar
  work; research = what we already investigated and decided, including rejected
  approaches). Always-on and fail-soft (registry read failure → no block); each
  field is whitespace-collapsed + length-capped so a poisoned registry value can't
  escape the data-framing. The former private `fetchResearchInsights` is now an
  exported `getResearchInsightsForTask` for reuse.

## 2.114.1

### Patch Changes

- [#3475](https://github.com/nexus-substrate/nexus-agents/pull/3475) [`7e24d93`](https://github.com/nexus-substrate/nexus-agents/commit/7e24d939f331593b696650b837763e9f2de5763b) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - fix(context): collapse + cap summary fields to block prompt-line injection ([#3471](https://github.com/nexus-substrate/nexus-agents/issues/3471))

  `summarizeContextForPrompt` renders backend strings (belief subject/predicate/
  object, memory descriptions, experience taskType, research name/topic) into an
  LLM system-prompt prefix. A value containing a newline could inject extra
  un-prefixed lines that escape the `- ` data-framing. A shared `oneLine()` helper
  now collapses whitespace and caps each interpolated field at 200 chars across
  every section — making the data-framing a local guarantee. Behavior-preserving
  for the current T1 repo/internal sources; defense-in-depth follow-up to [#3148](https://github.com/nexus-substrate/nexus-agents/issues/3148).

## 2.114.0

### Minor Changes

- [#3473](https://github.com/nexus-substrate/nexus-agents/pull/3473) [`5b2491f`](https://github.com/nexus-substrate/nexus-agents/commit/5b2491f8d2622ae84c632c15259dc3d7e8b619b6) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(context): surface prior research in UnifiedContext ([#3148](https://github.com/nexus-substrate/nexus-agents/issues/3148))

  Closes the research→context half of the knowledge loop. The research registry
  accumulated findings, but `ContextRetriever` (the canonical pre-task read used by
  `orchestrate` and graph workflows) had no field for them, so planners couldn't
  reuse research. `getContextForTask` now returns `researchInsights` — research
  techniques whose name/topic is relevant to the task, with their status
  (implemented / rejected / planned) — and `summarizeContextForPrompt` renders a
  "Prior research on this topic" block into the planner prompt. The read is
  fail-soft (missing/failed registry → no insights, context assembly never
  breaks) and uses the lightweight registry status read, not full synthesis, so
  it stays cheap on the per-task fan-out.

## 2.113.0

### Minor Changes

- [#3468](https://github.com/nexus-substrate/nexus-agents/pull/3468) [`d1fb1dc`](https://github.com/nexus-substrate/nexus-agents/commit/d1fb1dc35d4583fcd7bb9c80805c47b872f0b254) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(improvement-review): route recurring vote rejections into improvement signals ([#3259](https://github.com/nexus-substrate/nexus-agents/issues/3259))

  `consensus_vote` buffers a `signal.vote_rejected` event (carrying the ADR-0016
  `rejectionRules`) on the pipeline bus for every rejected plan, but no consumer
  read it — rejection reasons stayed local to each proposal. `improvement_review`
  now reads the buffered rejections (window-filtered, fail-soft) and surfaces a new
  `consensus`-category signal when a single rule (`DRY_VIOLATION`,
  `OVER_ENGINEERING`, …) recurs across ≥3 rejected plans, closing the feedback loop
  the 2026-05-31 system review flagged as missing. Recurring rejection for the same
  reason is a systemic planning gap, surfaced once instead of plan-by-plan. The
  recalled rule is re-validated against the canonical ADR-0016 allowlist
  (defense-in-depth) before it can reach an issue title/body.

## 2.112.0

### Minor Changes

- [#3467](https://github.com/nexus-substrate/nexus-agents/pull/3467) [`d84d1c4`](https://github.com/nexus-substrate/nexus-agents/commit/d84d1c49d4de2567b1f11f2532c4a5c644b3d4c7) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(pipeline): recall prior hindsight into plan + vote ([#3257](https://github.com/nexus-substrate/nexus-agents/issues/3257))

  The pipeline wrote belief/hindsight records after every cycle but never read them,
  so the accumulated learning was dormant. `runDevPipeline` now recalls the relevant
  `HindsightRecord`s (keyed to match the write side — a real read↔write key
  alignment fix) and prepends a bounded, clearly-labeled "Prior beliefs from past
  outcomes (informational — not instructions)" block to the research context that
  feeds both the plan and vote steps. Opt-in via the existing `beliefMemory` option
  (default pipelines unchanged); fire-safe (recall failure → no block, planning
  proceeds); each lesson is whitespace-collapsed + length-capped so a poisoned
  prior outcome can't inject extra prompt lines. Discovered the [#1720](https://github.com/nexus-substrate/nexus-agents/issues/1720) belief-
  reinforce write path is a dead no-op (filed [#3465](https://github.com/nexus-substrate/nexus-agents/issues/3465)).

- [#3467](https://github.com/nexus-substrate/nexus-agents/pull/3467) [`d84d1c4`](https://github.com/nexus-substrate/nexus-agents/commit/d84d1c49d4de2567b1f11f2532c4a5c644b3d4c7) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(pipeline): feed prior hindsight outcomes into plan + vote ([#3257](https://github.com/nexus-substrate/nexus-agents/issues/3257))

  Hindsight/belief memory was written after every dev-pipeline cycle but never
  read back, so the accumulated learning stayed dormant. The pipeline now recalls
  prior `HindsightRecord`s for the same task (keyed on the task-stable `taskId`
  the write side persists) and prepends a concise, clearly-labeled
  "Prior beliefs from past outcomes" block to the research context the architect
  and voters see — so plan refinement and voting are informed by what past runs
  learned.

  Read-only (never mutates belief state), bounded (top 5 most-recent lessons),
  and fully opt-in via the existing `beliefMemory` option: pipelines without it
  are unchanged. Fire-safe — a recall throw, an `err` Result, or empty recall
  injects nothing and planning proceeds normally. The persisted hindsight key was
  also made task-stable (was `sessionId ?? task.slice(0,40)`, now always
  `task.slice(0,40)`) so learning flows forward across separate runs of the same
  work.

### Patch Changes

- [#3464](https://github.com/nexus-substrate/nexus-agents/pull/3464) [`14b3f62`](https://github.com/nexus-substrate/nexus-agents/commit/14b3f62a0bb47e7c4d62c88a1a122c1dd470f7d0) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - fix(docops): escape backslashes before pipes in the ENTRYPOINTS table generator

  Resolves a HIGH `js/incomplete-sanitization` CodeQL alert in
  `entrypointsToolDescription` ([#3334](https://github.com/nexus-substrate/nexus-agents/issues/3334)): it escaped `|` for markdown-table safety but
  not backslashes first, so a description containing a backslash could smuggle a
  half-escaped pipe past the escaping. Now escapes `\` → `\\` before `|` → `\|`.
  Behavior-preserving (the curated tool descriptions contain no backslashes;
  inject output is unchanged).

## 2.111.1

### Patch Changes

- [#3462](https://github.com/nexus-substrate/nexus-agents/pull/3462) [`97b844d`](https://github.com/nexus-substrate/nexus-agents/commit/97b844d7bdcdac89ddf766c2e375d4d7f2f4361d) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(harness): add GEMINI.md redirect to AGENTS.md ([#3446](https://github.com/nexus-substrate/nexus-agents/issues/3446) Phase 4)

  Completes the model-agnostic governance refactor: adds a root-level `GEMINI.md`
  that redirects to AGENTS.md (the Gemini CLI reads `GEMINI.md` natively, or can be
  pointed at `AGENTS.md` via `context.fileName`), and registers it in the
  harness-alignment CI gate (`doctor-harness-alignment.ts`) so it can't silently
  stop referencing AGENTS.md. Updates the AGENT_COMPATIBILITY matrix (Gemini row +
  notes CLAUDE.md is now generated from AGENTS.md).

## 2.111.0

### Minor Changes

- [#3460](https://github.com/nexus-substrate/nexus-agents/pull/3460) [`01d729b`](https://github.com/nexus-substrate/nexus-agents/commit/01d729b0756fc0fc05de499c7d9629e67a6d8952) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(docops): generate CLAUDE.md from AGENTS.md ([#3446](https://github.com/nexus-substrate/nexus-agents/issues/3446) Phases 2+3)

  CLAUDE.md is now GENERATED by `inject-governance.ts` instead of hand-maintained:
  an authored header + a `GENERATED:FROM_AGENTS` block sliced from AGENTS.md's
  `AGNOSTIC:BODY` (the single source of harness-neutral guidance) + a hand-authored
  Claude-specific overlay (the `Agent`/`subagent_type` delegation table, plugin
  skills, and the existing `GOVERNANCE:*` tool/model/version markers). The
  agnostic ~75% that previously lived in both files is no longer authored twice —
  de-duplicated, with a CI drift-gate (`check`) that fails on a hand-edited
  generated block or an AGENTS.md edit that wasn't re-injected. `checkCanonicalPaths`
  now validates the AGENTS.md table and checks every path in multi-path rows.
  Content fully preserved (verified section-by-section); the loop's `.rules/`
  auto-load and other inject targets are unchanged.

## 2.110.1

### Patch Changes

- [#3458](https://github.com/nexus-substrate/nexus-agents/pull/3458) [`422c2b4`](https://github.com/nexus-substrate/nexus-agents/commit/422c2b4407272942f166d94f94a7e4ca123821f8) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - docs(agents): promote agnostic sections into the AGENTS.md superset ([#3446](https://github.com/nexus-substrate/nexus-agents/issues/3446) Phase 1)

  First step of making AGENTS.md the canonical model-agnostic source (mechanism C —
  generation). Promotes the 5 agnostic-but-CLAUDE-only sections (Default Working
  Mode, Context Budget, Error-Handling Q Protocol, Self-Check Quality Gate,
  Autonomous Operation) into AGENTS.md in its harness-neutral voice, and wraps its
  agnostic body in `<!-- AGNOSTIC:BODY:START/END -->` markers so a later generator
  can slice it into CLAUDE.md. Additive only — CLAUDE.md is unchanged (de-dup is a
  later phase); the existing RULES_INDEX injection + count probes are unaffected.

- [#3457](https://github.com/nexus-substrate/nexus-agents/pull/3457) [`b765468`](https://github.com/nexus-substrate/nexus-agents/commit/b765468d6f3db71d4fc7e053ef42687e942fe418) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - fix(tune): audit routing reversals on TuneAdjustmentStore.clear() ([#3452](https://github.com/nexus-substrate/nexus-agents/issues/3452))

  `clear()` dropped all active demotions — a routing-state restore — without
  emitting `onReversal`, so a bulk clear left no `tune.reversal` audit entry. It now
  emits a `cleared`-cause reversal for each active adjustment before dropping it, so
  the "every routing mutation is on the immutable audit chain" invariant
  ([#3323](https://github.com/nexus-substrate/nexus-agents/issues/3323) criterion 1) holds unconditionally, not just for decay/supersede. `clear()`
  is currently test-only, so this is hardening against a future production reset
  path rather than a live gap.

## 2.110.0

### Minor Changes

- [#3453](https://github.com/nexus-substrate/nexus-agents/pull/3453) [`e07429d`](https://github.com/nexus-substrate/nexus-agents/commit/e07429dbb83f4f84d21e5806bfd2f241c9d2231d) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(tune): durable audit for routing-demotion reversals ([#3323](https://github.com/nexus-substrate/nexus-agents/issues/3323) criterion 1)

  The self-tuning loop's routing mutations are now fully recorded on the immutable
  `AuditLogger` chain (verifiable via `verify_audit_chain`): the demotion
  (`tune.demote`, shipped in [#3325](https://github.com/nexus-substrate/nexus-agents/issues/3325)) AND its reversal (`tune.reversal`) when an
  adjustment decays/expires (`cause: decay_expiry`) or is superseded by a fresh
  demotion (`cause: superseded`). `TuneAdjustmentStore` gains a state-only
  `onReversal` hook; `TuneStage` records the audit entry via the existing canonical
  audit sink, gated identically to the demotion audit (enforce + audit-sink wired;
  shadow mode records nothing). Best-effort/fail-safe at both the store and stage
  layers so auditing never throws on the router hot-read path or gates a mutation.

  Satisfies exit-criterion 1 (durable audit) of the tune-loop default-on bar
  ([#3323](https://github.com/nexus-substrate/nexus-agents/issues/3323)); the other criteria remain open. No defaults changed.

### Patch Changes

- [#3454](https://github.com/nexus-substrate/nexus-agents/pull/3454) [`7463935`](https://github.com/nexus-substrate/nexus-agents/commit/74639353697df950afdbf41e5ee0fe0975f3d2a1) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - test(routing): full-chain shadow assertion for the self-tuning loop ([#3323](https://github.com/nexus-substrate/nexus-agents/issues/3323) criterion 2)

  Strengthens the tune-loop e2e proof (the enforce-on producer→store→router
  selection-change test already existed, [#3324](https://github.com/nexus-substrate/nexus-agents/issues/3324)): adds the shadow-mode producer-side
  gate assertion — firing a `signal.swarm_unhealthy` through a SHADOW `TuneStage`
  records the intended demotion (telemetry `intended++`) but does NOT apply it
  (`applied=0`, `effectiveMultiplier=1.0`, routing/rank unchanged). Proves the
  `NEXUS_TUNE_ENFORCE` gate sits exactly between record and apply. Satisfies
  exit-criterion 2 of [#3323](https://github.com/nexus-substrate/nexus-agents/issues/3323).

- [#3456](https://github.com/nexus-substrate/nexus-agents/pull/3456) [`80072fd`](https://github.com/nexus-substrate/nexus-agents/commit/80072fdf5689f06c47540ee83e8a0dbb7b6954e8) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - docs(tune): correct stale TuneStageOptions JSDoc (loop is default-ON) ([#3323](https://github.com/nexus-substrate/nexus-agents/issues/3323))

  The `TuneStageOptions.enabled` JSDoc still said "When false (default), SHADOW
  mode", but `startTuneStage` derives the default from `NEXUS_TUNE_ENFORCE` which
  defaults to `true` (enforce) since v2.96 — production runs the self-tuning loop
  default-ON. Corrected the comment so a maintainer isn't misled into thinking the
  loop is shadow-by-default. (CONFIGURATION.md already documents the default-ON
  behavior + opt-out accurately.)

## 2.109.4

### Patch Changes

- [#3450](https://github.com/nexus-substrate/nexus-agents/pull/3450) [`53e70e8`](https://github.com/nexus-substrate/nexus-agents/commit/53e70e897410acd0b547488b6fac005977d30733) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - test(sdk): de-flake the "missing AI SDK export" cases ([#3449](https://github.com/nexus-substrate/nexus-agents/issues/3449))

  The two `SdkAdapter` "missing generateObject/jsonSchema export" tests used
  `vi.doMock('ai')` + `vi.resetModules()` to simulate a partial module, which leaked
  module-registry state across the parallel suite and intermittently failed CI on
  unrelated PRs. `extractAiSdkFunctions` is now exported and the cases are
  unit-tested directly with hand-built partial module objects (table-driven via
  `it.each`) — no global mock mutation, fully hermetic.

- [#3448](https://github.com/nexus-substrate/nexus-agents/pull/3448) [`83f06a7`](https://github.com/nexus-substrate/nexus-agents/commit/83f06a79e832345086376213bb469fa0744568aa) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - fix(docops): restore silently-broken tool-prerequisite coverage gate ([#3444](https://github.com/nexus-substrate/nexus-agents/issues/3444))

  `checkToolPrerequisites` (the [#2652](https://github.com/nexus-substrate/nexus-agents/issues/2652) CI gate ensuring every non-read-only MCP tool
  declares a deliberate prerequisite decision) read the wrong annotations file after
  the [#3358](https://github.com/nexus-substrate/nexus-agents/issues/3358) move — `src/mcp/tool-annotations.ts` (a wrapper with no annotation
  blocks) instead of `src/mcp/tools/tool-annotations.ts` — so its non-read-only set
  was always empty and the gate could never fail. Point it at the real map; the gate
  passes on current code (maps were maintained, only enforcement was broken). Two
  gate-meta-tests with the same stale path are corrected so they actually exercise
  the gate.

## 2.109.3

### Patch Changes

- [#3445](https://github.com/nexus-substrate/nexus-agents/pull/3445) [`b5ba06a`](https://github.com/nexus-substrate/nexus-agents/commit/b5ba06a0820b7919e4f7c5871195bf4c4f5096d4) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - docs(entrypoints): auto-generate ENTRYPOINTS.md tool enumerations + drift-gate ([#3334](https://github.com/nexus-substrate/nexus-agents/issues/3334))

  `docs/ENTRYPOINTS.md`'s prose MCP-tools table and machine-parseable YAML block
  are now generated from `REGISTERED_TOOL_NAMES` + `TOOL_DESCRIPTIONS` by
  `inject-governance.ts` (both `inject` and `check`/CI modes), so they can no
  longer drift from the registered tool set by hand. Both enumerations now list all
  45 tools (were 42/42 on disk; the audit's 38/20 figures were already stale). The
  count derives from `REGISTERED_TOOL_NAMES.length` — nothing hardcoded.

## 2.109.2

### Patch Changes

- [#3442](https://github.com/nexus-substrate/nexus-agents/pull/3442) [`370e23a`](https://github.com/nexus-substrate/nexus-agents/commit/370e23a83dc325d449d6410bbbaca10e631d33e1) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Add a DNS-resolve-time SSRF guard for the custom-openai gateway ([#3426](https://github.com/nexus-substrate/nexus-agents/issues/3426)). A public
  DNS name that resolves to a private/loopback/link-local/metadata IP is now rejected
  before the first outbound request, closing the documented gap in the string-level
  `classifyPrivateHost` check. Fail-open on transient DNS errors; bypassed by
  `NEXUS_CUSTOM_API_ALLOW_PRIVATE=1`. Resolve-time only — a TOCTOU/DNS-rebinding
  window remains pending a socket-layer `lookup` hook.

## 2.109.1

### Patch Changes

- [#3440](https://github.com/nexus-substrate/nexus-agents/pull/3440) [`fbd6a6a`](https://github.com/nexus-substrate/nexus-agents/commit/fbd6a6a30ff422e089ade3ea20f06e2a644b27b7) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - test(routing): lock api:\* arm participation in tier stages ([#3424](https://github.com/nexus-substrate/nexus-agents/issues/3424))

  Verify-before-implement found [#3424](https://github.com/nexus-substrate/nexus-agents/issues/3424) already resolved by the [#3422](https://github.com/nexus-substrate/nexus-agents/issues/3422) migration:
  `filterByPreferenceTier` and `filterByDifficultyTier` collapse an `api:*` arm to
  its display slot (`routingArmDisplaySlot`) for tier membership/ordering, so a
  wrapped API arm inherits its vendor slot's tier and is never dropped. Adds
  regression tests pinning that behavior (api:anthropic → strong/powerful as
  claude; api:openai → weak as codex; arms preserved, not filtered out).

## 2.109.0

### Minor Changes

- [#3436](https://github.com/nexus-substrate/nexus-agents/pull/3436) [`c2d3b1e`](https://github.com/nexus-substrate/nexus-agents/commit/c2d3b1ed435c291898ffde5c5ad1ee3550c5fdb1) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(adapters): native structured output for Gemini + SDK adapters ([#3433](https://github.com/nexus-substrate/nexus-agents/issues/3433) phases 2+3)

  `GeminiAdapter` and `SdkAdapter` now honor `CompletionRequest.responseFormat`
  instead of ignoring it:
  - **Gemini** sets `responseMimeType: 'application/json'` (json_object/json_schema)
    and `responseSchema` (json_schema) on the generation config; the warn-and-ignore
    is removed.
  - **SdkAdapter** routes `json_object`/`json_schema` through the Vercel AI SDK
    `generateObject({schema})` (via `jsonSchema()`), returning the structured object
    as a JSON text block; `text`/absent stays on `generateText` (unchanged), and
    streaming remains text-only. The duck-typed `ai` exports + result shape are
    runtime-validated (clear errors on a missing `generateObject`/`jsonSchema`
    export; no unsafe casts).

  With Claude (phase 1) this means all three API adapters now produce native
  structured output — the backend for routing consensus voters off brittle regex
  extraction (remaining: voter wiring).

- [#3438](https://github.com/nexus-substrate/nexus-agents/pull/3438) [`3b1d074`](https://github.com/nexus-substrate/nexus-agents/commit/3b1d0743c56cad07ecfcdef6e0b374d46253e43c) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(consensus): voters request native structured output ([#3433](https://github.com/nexus-substrate/nexus-agents/issues/3433) phase 4)

  `executeSingleVoteAttempt` now sets `responseFormat: {type:'json_schema', schema:
VOTE_JSON_SCHEMA}` on the vote request, so voters backed by Claude (tool_use),
  OpenAI/SDK (generateObject), or Gemini (json mode) return a schema-valid vote
  object natively instead of prose-wrapped JSON — the brittle regex extraction that
  caused intermittent voter parse failures. Adapters that don't honor
  responseFormat ignore it and the existing `extractTextFromResponse` +
  `parseVoteResponse` (regex + Zod) path is the unchanged fallback, so no backend
  regresses. Completes [#3433](https://github.com/nexus-substrate/nexus-agents/issues/3433) (epic [#3317](https://github.com/nexus-substrate/nexus-agents/issues/3317) finding [#5](https://github.com/nexus-substrate/nexus-agents/issues/5)).

## 2.108.0

### Minor Changes

- [#3435](https://github.com/nexus-substrate/nexus-agents/pull/3435) [`b0414fe`](https://github.com/nexus-substrate/nexus-agents/commit/b0414feaf2706d2ee97a93b423fa4666274c1b7c) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(claude): honor responseFormat via forced tool_use ([#3433](https://github.com/nexus-substrate/nexus-agents/issues/3433) Phases 0+1)

  `ClaudeAdapter` now honors `CompletionRequest.responseFormat` instead of
  warn-and-ignoring it ([#470](https://github.com/nexus-substrate/nexus-agents/issues/470)). A `json_object`/`json_schema` request injects a
  forced synthetic `respond` tool (`tool_choice` pinned to it, `input_schema` =
  the requested schema), and the tool's input is surfaced as a JSON text block so
  existing parsers work unchanged. Caller-supplied tools are merged, never
  clobbered; the `text`/absent path is unchanged.

  Adds a hand-authored `VOTE_JSON_SCHEMA` (the single source of truth for the vote
  shape, mirroring the Zod `VoteResponseSchema`) with a drift contract test
  covering top-level AND nested (`findings`/`gate`) fields — no new dependency.
  Foundation for routing consensus voters through native structured output
  ([#3433](https://github.com/nexus-substrate/nexus-agents/issues/3433) remaining phases: Gemini, SdkAdapter, voter wiring).

## 2.107.1

### Patch Changes

- [#3430](https://github.com/nexus-substrate/nexus-agents/pull/3430) [`b7a3b7e`](https://github.com/nexus-substrate/nexus-agents/commit/b7a3b7e69b982e5e11ae6262594978b95f882b8c) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - fix(routing): collapse api:\* arm keys in model-source registration ([#3425](https://github.com/nexus-substrate/nexus-agents/issues/3425))

  After [#3422](https://github.com/nexus-substrate/nexus-agents/issues/3422), the router's adapter map can be keyed by `api:<vendor>` arm ids.
  `buildDefaultModelSources`/`registerDefaultModelSources` iterated those keys and
  would register an availability source under the literal `api:anthropic` name.
  Harmless today (the candidate filter gates on the display slot), but a future
  model-source consumer iterating raw keys could see an `api:*` key where a CLI
  slot is expected. Sources are now named by the display slot
  (`routingArmDisplaySlot`); the cache de-dups by name, so a CLI slot and its api
  arm collapse to one slot-named source.

- [#3431](https://github.com/nexus-substrate/nexus-agents/pull/3431) [`b6a90a8`](https://github.com/nexus-substrate/nexus-agents/commit/b6a90a87304ea89c9ba976c68075ca3e0707d22a) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - fix(adapters): retry transient MODEL_UNAVAILABLE + drop empty stream deltas ([#3317](https://github.com/nexus-substrate/nexus-agents/issues/3317) [#7](https://github.com/nexus-substrate/nexus-agents/issues/7)/[#8](https://github.com/nexus-substrate/nexus-agents/issues/8))

  Two small api-mode parity findings from the [#3317](https://github.com/nexus-substrate/nexus-agents/issues/3317) audit:
  - **[#7](https://github.com/nexus-substrate/nexus-agents/issues/7)** `isRetryableError` now treats `MODEL_UNAVAILABLE` (transient 503/overloaded)
    as retryable, matching HTTP 503. `MODEL_NOT_FOUND` stays non-retryable (retry
    won't help).
  - **[#8](https://github.com/nexus-substrate/nexus-agents/issues/8)** the SDK streaming adapter skips empty-string (`''`) `text_delta` chunks —
    the AI SDK can emit zero-length keepalive/boundary chunks that are noise for
    downstream re-assemblers.

## 2.107.0

### Minor Changes

- [#3429](https://github.com/nexus-substrate/nexus-agents/pull/3429) [`e419ab9`](https://github.com/nexus-substrate/nexus-agents/commit/e419ab98c9e68c6a49fa4d57329d6c8d7ca31ca5) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - fix(resilience): record API ModelError failures to the circuit breaker ([#3423](https://github.com/nexus-substrate/nexus-agents/issues/3423), epic [#3317](https://github.com/nexus-substrate/nexus-agents/issues/3317))

  Direct-API adapters (`ResilientAdapter`) previously recorded only rate-limit
  events — an API `ModelError` never opened a circuit breaker or triggered
  failover, so a degrading API endpoint had no degradation/failover learning (the
  CLI subprocess path already did). `ResilientAdapter.complete()` now maps a
  `ModelError` to a `FailureCategory` (`mapModelErrorToCategory`) and records it to
  the current adapter's breaker, reusing the existing open→failover wiring.

  Rate limits are skipped here (checked via BOTH the mapped category and
  `isRateLimitLikeError`, whose pattern lists differ) so they aren't double-counted
  against the telemetry branch. The recorded payload is a `FailureCategory` enum
  and the log carries only `{provider, category}` — no credentials, message, or
  request ever reach the breaker, logs, or events.

## 2.106.0

### Minor Changes

- [#3427](https://github.com/nexus-substrate/nexus-agents/pull/3427) [`e95fd1d`](https://github.com/nexus-substrate/nexus-agents/commit/e95fd1d184c3118e755ee1b299eb90c2eb686e9e) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(routing): make API adapters first-class bandit arms ([#3422](https://github.com/nexus-substrate/nexus-agents/issues/3422), epic [#3317](https://github.com/nexus-substrate/nexus-agents/issues/3317))

  Direct-API adapters (Anthropic/OpenAI/Google/custom-OpenAI) are now first-class
  routing/bandit arms (`api:<vendor>`), scored **distinctly** from the four CLI
  slots — so the self-tuning loop learns CLI-vs-API performance separately instead
  of dropping API outcomes (the silent data loss audited in [#3317](https://github.com/nexus-substrate/nexus-agents/issues/3317)).
  - New `RoutingArmId = CliName | ApiArmId` arm space; a `ModelToCliAdapter` shim
    bridges `IModelAdapter` into the router's `ICliAdapter` surface; a
    `wrapApiSelectionForRouter`/`collectApiRoutingArms` factory enumerates
    key-present vendors.
  - The ranking/selection pipeline carries the distinct arm end-to-end; only the
    **bandit outcome** stays distinct, while registry/pricing lookups, telemetry,
    and secondary learners collapse to the display slot (`routingArmDisplaySlot`).
    `decisionsPerCli` stays slot-keyed.
  - Wiring is gated: `createAllAdapters` appends API arms **only** when
    `NEXUS_BILLING_MODE=api` and the vendor key is present — default plan mode is
    CLIs-only, no surprise API spend.

  Reviewed: QA (one trace-attribution collapse fixed), security (clean — keys
  never logged/echoed, SSRF guard intact), cleanup (orphan export removed).
  Follow-ups: [#3424](https://github.com/nexus-substrate/nexus-agents/issues/3424) (tier-stage participation), [#3425](https://github.com/nexus-substrate/nexus-agents/issues/3425) (model-source key collapse),
  [#3426](https://github.com/nexus-substrate/nexus-agents/issues/3426) (connect-time SSRF check).

## 2.105.0

### Minor Changes

- [#3420](https://github.com/nexus-substrate/nexus-agents/pull/3420) [`88c6b80`](https://github.com/nexus-substrate/nexus-agents/commit/88c6b808f37efa4110aab27c6d6ec55de31a080e) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(observability): emit `model.called` events with real model/token attribution ([#3387](https://github.com/nexus-substrate/nexus-agents/issues/3387))

  `ModelCalledEvent` was part of the V2 event vocabulary with consumers in
  `trace-writer` and `query_trace`, but no code ever emitted it — so the advertised
  `query_trace` `model.called` filter was permanently empty. The expert pipeline now
  emits a meaningful `model.called` event at the model-invocation boundary
  (`runExpert`/`executeExpert`) carrying the real `cli`, `model`, `tokensIn`,
  `tokensOut`, and `durationMs`.

  The expert-bridge surfaces the concrete `model` and a `tokensIn`/`tokensOut` split
  (new `tokenSplitFromUsage`, reconciling with the existing `tokensUsed` total) from
  `CliResponse`. Events are emitted only after a successful call with a known
  cli/model and real token usage — absent usage skips emission rather than recording
  zeros ("skip, don't lie"). Purely additive: `OutcomeStore` remains the single
  outcome authority, so there is no double-counting. Approved 2-0 by consensus
  (architect + security).

## 2.104.0

### Minor Changes

- [#3418](https://github.com/nexus-substrate/nexus-agents/pull/3418) [`25b1c51`](https://github.com/nexus-substrate/nexus-agents/commit/25b1c5173c81e67577adf7d41f88373b994bbea3) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(routing): resolve difficulty tier to a concrete model at route time ([#3394](https://github.com/nexus-substrate/nexus-agents/issues/3394))

  `CompositeRouter.route()` can now return a concrete `model` alongside `cliName`,
  chosen from the in-tree registry by a tier-appropriate quality dimension
  (`powerful`→reasoning, `balanced`→codeGeneration, `fast`→speed). Opt-in behind
  `NEXUS_ROUTE_MODEL_SELECTION=true` (default OFF). Pure, deterministic, and
  synchronous — no probe on the hot path. Consumers (`orchestrate`,
  `delegate_to_model`) prefer `decision.model` and fall back to the CLI default
  when absent or the flag is off. Builds on the live-discovery enumeration from
  epic [#3403](https://github.com/nexus-substrate/nexus-agents/issues/3403).

## 2.103.2

### Patch Changes

- [#3416](https://github.com/nexus-substrate/nexus-agents/pull/3416) [`5823452`](https://github.com/nexus-substrate/nexus-agents/commit/58234522b7af465b1135717af8447339dc72f0f3) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Rate-limit cooldown for the opencode/OpenRouter path ([#3408](https://github.com/nexus-substrate/nexus-agents/issues/3408), epic [#3403](https://github.com/nexus-substrate/nexus-agents/issues/3403) follow-up). When an opencode call returns `RATE_LIMITED` (the OpenRouter free-tier 429s), the model is marked in the AvailabilityCache cooldown so subsequent selections skip it until the TTL recovers — and the opencode adapter's `--model` resolution now treats a cooled model as unusable, resolving to the closest non-cooled live alternative (or falling back to the CLI default). Completes the two-sided wiring: the cooldown _consumer_ already existed (delegate-to-model filtered `isKnownUnavailable`); this adds the _producer_ (mark on 429) + the opencode consumer. Opt-in via `NEXUS_DYNAMIC_MODELS`, fail-open (off → no cooldown, identical prior behavior), and advisory (a cooled model is still usable via an explicit available `--model`). Scoped to the opencode adapter where the 429s actually occur — the shared base adapter is untouched.

## 2.103.1

### Patch Changes

- [#3414](https://github.com/nexus-substrate/nexus-agents/pull/3414) [`bdb9c72`](https://github.com/nexus-substrate/nexus-agents/commit/bdb9c727c4dbafa3e10edbf73db92d59578c42a5) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Logical→live model-id resolution — Phase 2 ([#3407](https://github.com/nexus-substrate/nexus-agents/issues/3407), epic [#3403](https://github.com/nexus-substrate/nexus-agents/issues/3403)). When a configured model id has gone stale because the provider renamed it (the exact case: OpenRouter `qwen/qwen3-coder-480b-a35b:free` → `qwen/qwen3-coder:free`), the opencode adapter now resolves it to the closest id the transport actually offers — so a rename is zero-touch instead of needing a registry edit. The new `resolveLiveModelId(configured, available)` is a pure, deterministic, conservative resolver: exact match always wins; otherwise it substitutes only within the same provider namespace and only when the shared prefix is substantial (≥60%), preferring a matching `:free`/paid tier; anything else returns unchanged. Wired into the opencode adapter's `--model` resolution (where it already probes `opencode models`), opt-in via `NEXUS_DYNAMIC_MODELS` and fail-open — when discovery is off or the catalog is cold, behavior is byte-for-byte unchanged.

## 2.103.0

### Minor Changes

- [#3413](https://github.com/nexus-substrate/nexus-agents/pull/3413) [`0abdcbe`](https://github.com/nexus-substrate/nexus-agents/commit/0abdcbe30661e536b3e77b362ace1396b4f6ca1d) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Expose dynamic model discovery to the harness — Phase 1c ([#3406](https://github.com/nexus-substrate/nexus-agents/issues/3406), epic [#3403](https://github.com/nexus-substrate/nexus-agents/issues/3403)). Adds a callable **`list_available_models`** MCP tool that actively probes every discovery transport (OpenRouter live catalog + opencode/claude/codex/gemini CLI adapters) and returns a per-transport health report `{ transport, ok, modelCount, sampleModelIds, error }` — a one-call way to validate the CLIs and APIs are wired and reachable (`includeModelIds` for the full list; `includeOpenRouter` toggles the catalog). Also adds a read-only **`nexus://available-models`** MCP resource surfacing the live discovered set (complements the static `nexus://models`). Both are existence-only — the in-tree registry stays authoritative for pricing/capability, and neither emits key-presence or credential data. Read-only; changes no routing. MCP tool count: 44 → 45.

### Patch Changes

- [#3411](https://github.com/nexus-substrate/nexus-agents/pull/3411) [`1dc5478`](https://github.com/nexus-substrate/nexus-agents/commit/1dc5478e89d21f1d475363cca931f7bca4effc85) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Key-free CLI model enumeration via models.dev — Phase 1b ([#3405](https://github.com/nexus-substrate/nexus-agents/issues/3405), epic [#3403](https://github.com/nexus-substrate/nexus-agents/issues/3403)). The claude/codex/gemini CLI adapters now implement `listModels()`, backed by the committed, CI-refreshed models.dev snapshot filtered by vendor (`anthropic`/`openai`/`google`) — no API key needed (their OAuth tokens can't call the vendor `/v1/models` REST endpoints; only opencode has a native list command). New `config/models-dev-by-vendor.ts` exposes `listModelsForCli(cli)` / `listModelsByVendor(vendor)` (fail-open: a missing/malformed snapshot yields `[]`). With this, `registerDefaultModelSources` ([#3404](https://github.com/nexus-substrate/nexus-agents/issues/3404)) now populates the AvailableModelsCache with all four transports, so the CLI routing pre-filter finally sees real per-CLI model sets. Existence only — the in-tree registry stays authoritative for pricing/capability.

## 2.102.8

### Patch Changes

- [#3409](https://github.com/nexus-substrate/nexus-agents/pull/3409) [`d3c3481`](https://github.com/nexus-substrate/nexus-agents/commit/d3c3481d006073fa661fd2e83e2a459d80debb7d) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Activate dynamic model discovery — Phase 1 ([#3404](https://github.com/nexus-substrate/nexus-agents/issues/3404), epic [#3403](https://github.com/nexus-substrate/nexus-agents/issues/3403)). The `AvailableModelsCache` + the CLI-level routing pre-filter already existed but the cache had **no sources registered**, so it was always empty and the pre-filter was inert. This adds a live **OpenRouter `/api/v1/models`** catalog source (`createOpenRouterModelsSource` — Zod-validated, size/timeout-bounded, fail-open) and a `registerDefaultModelSources()` helper that also wraps any adapter implementing `listModels()` (opencode + SDK adapters) as a CLI-named cache source. `createCompositeRouter` now attaches the populated global cache when dynamic discovery is enabled. Opt-in via `NEXUS_DYNAMIC_MODELS=true` (default OFF; behavior unchanged until set). Fail-open throughout: a failed probe yields `[]` and an empty cache leaves routing using all CLIs, so discovery can never wedge routing. The 429/5xx execution-time cooldown is tracked as a follow-up.

## 2.102.7

### Patch Changes

- [#3401](https://github.com/nexus-substrate/nexus-agents/pull/3401) [`9b0f4b9`](https://github.com/nexus-substrate/nexus-agents/commit/9b0f4b93ed9e0b4fe033680938a7790de72c4dc2) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Expose the per-run token budget via the `run_dev_pipeline` MCP tool ([#3395](https://github.com/nexus-substrate/nexus-agents/issues/3395) follow-up). A new optional `maxBudgetTokens` input threads through to the dev-pipeline's `BudgetGuard`: when set, expert calls stop once cumulative token usage crosses the ceiling — a hard-stop safety cap for unattended/multi-day runs. Omitted by default (enforcement off). This makes the budget mechanism (shipped in 2.102.6) reachable by MCP clients rather than programmatic-only.

## 2.102.6

### Patch Changes

- [#3399](https://github.com/nexus-substrate/nexus-agents/pull/3399) [`4d619da`](https://github.com/nexus-substrate/nexus-agents/commit/4d619da7bdaff854c6c055816bfc8a50a21d8fca) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Add opt-in per-run token-budget enforcement to the dev-pipeline ([#3395](https://github.com/nexus-substrate/nexus-agents/issues/3395), the first half of [#3150](https://github.com/nexus-substrate/nexus-agents/issues/3150) P4). A new `BudgetGuard` wraps the existing, tested `BudgetCircuitBreaker` and meters every expert call in `agent-executor`: it records the real `tokensUsed` (now available via [#3396](https://github.com/nexus-substrate/nexus-agents/issues/3396)) and, once cumulative usage crosses the configured ceiling, short-circuits further expert calls to a failure result — stopping token spend without aborting the pipeline mid-flight (hard-stop, not silent model downgrade; graceful fallback was deferred to [#3394](https://github.com/nexus-substrate/nexus-agents/issues/3394) by the consensus_vote). Strictly opt-in: absent `AgentExecutorConfig.budget` → a no-op guard → behavior is byte-for-byte unchanged. This is the per-task safety mechanism for unattended multi-day operation that [#3150](https://github.com/nexus-substrate/nexus-agents/issues/3150)'s cost-enforcement stage called for.

## 2.102.5

### Patch Changes

- [#3397](https://github.com/nexus-substrate/nexus-agents/pull/3397) [`478c25c`](https://github.com/nexus-substrate/nexus-agents/commit/478c25c119d0448cff632f82ef1ff88aa56073a1) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Propagate adapter token usage through the expert bridge ([#3396](https://github.com/nexus-substrate/nexus-agents/issues/3396)). `CliResponse.usage` was produced upstream (SDK adapters report `TokenUsage`; CLI adapters extract it best-effort) but silently dropped across `expert-bridge.ts`'s result-mapping hops, so `agent-executor` recorded `tokensUsed: 0`. Now `ExpertBridgeResult` carries an optional `tokensUsed` (total tokens, preferring the reported `totalTokens`, falling back to input+output, left undefined when no usage was reported), and the routing-experience metric records the real value instead of zero. This is the shared prerequisite for token-based budget enforcement ([#3395](https://github.com/nexus-substrate/nexus-agents/issues/3395)), `model.called` attribution ([#3387](https://github.com/nexus-substrate/nexus-agents/issues/3387)), and routing-time cost scoring ([#3394](https://github.com/nexus-substrate/nexus-agents/issues/3394)).

## 2.102.4

### Patch Changes

- [#3392](https://github.com/nexus-substrate/nexus-agents/pull/3392) [`fdeab67`](https://github.com/nexus-substrate/nexus-agents/commit/fdeab67abbd85891f6b0620cdaa0e16ccaa47543) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Extend the security `AuditQuery` interface with post-mortem dimensions ([#3197](https://github.com/nexus-substrate/nexus-agents/issues/3197)): `actionType` (PolicyGate/Corroboration events), `actor` (username on Trust/Reputation events), and `violationRule` (PolicyGate `violationRules` membership). These enable security forensics like "which Tier-3 events tripped RULE_OF_TWO?" and combine with the existing `trustTier`/`type`/time filters. The new filters narrow to events that actually carry the field (events lacking it are excluded). The original ask's `resource` and `policyName` were intentionally dropped — no `AuditEvent` records them, so those filters would be dead config; the policy-rule intent is served by `violationRule`.

## 2.102.3

### Patch Changes

- [#3390](https://github.com/nexus-substrate/nexus-agents/pull/3390) [`a4920fa`](https://github.com/nexus-substrate/nexus-agents/commit/a4920fa8de42b5fa2d299e1a8830a4119d7981c0) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Remove the dormant `feedbackToRoutingOutcome` mapper and resolve a `TaskOutcome` name collision ([#3146](https://github.com/nexus-substrate/nexus-agents/issues/3146)/[#3226](https://github.com/nexus-substrate/nexus-agents/issues/3226)). The mapper (added in [#3284](https://github.com/nexus-substrate/nexus-agents/issues/3284) as [#3146](https://github.com/nexus-substrate/nexus-agents/issues/3146)'s first step) was never wired — and wiring it would have re-introduced the synthetic-positive pollution that [#2724](https://github.com/nexus-substrate/nexus-agents/issues/2724) deliberately removed: `delegate_to_model` is a recommendation tool, not an execution, so routing recommendation outcomes into the routing OutcomeStore corrupts every downstream aggregation (weather*report, recommendedMappings, LinUCB, TOPSIS, fitness-audit). The routing OutcomeStore must hold only real execution outcomes; the feedback and routing outcome layers are intentionally separate. Removed the footgun mapper + its test. Separately, renamed the unrelated `consensus/types-weighted-voting.ts` `TaskOutcomeSchema`/`TaskOutcome` (a 4-state vote \_status* enum) to `TaskOutcomeStatusSchema`/`TaskOutcomeStatus` to end a 3-way name collision with the canonical outcome _record_ (consensus-internal only; not part of the public barrel).

## 2.102.2

### Patch Changes

- [#3388](https://github.com/nexus-substrate/nexus-agents/pull/3388) [`e1cbbed`](https://github.com/nexus-substrate/nexus-agents/commit/e1cbbed2425c039cf2108d3235d175d6b5963ef1) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Drop the dead `model.called` branch from the EventBus→OutcomeStore feedback subscriber ([#3179](https://github.com/nexus-substrate/nexus-agents/issues/3179)). The bridge now subscribes to `stage.failed` only — its sole event with a producer. `model.called` was in the event vocabulary ([#912](https://github.com/nexus-substrate/nexus-agents/issues/912)) with consumers here and in trace-writer ([#952](https://github.com/nexus-substrate/nexus-agents/issues/952)), but no code ever emitted it, so the branch never fired; had a producer been added it would have double-counted against the cli-attributed outcomes `agent-executor.recordOutcome()` already writes directly. The `ModelCalledEvent` type and trace-writer handler are retained as valid vocabulary. Emitting `model.called` with real model/token attribution (the originally-intended [#952](https://github.com/nexus-substrate/nexus-agents/issues/952) observability) is tracked in [#3387](https://github.com/nexus-substrate/nexus-agents/issues/3387). Also corrects the now-stale "auto-feedback never wired" framing of [#3179](https://github.com/nexus-substrate/nexus-agents/issues/3179) — [#2938](https://github.com/nexus-substrate/nexus-agents/issues/2938) already auto-wires the subscriber at server startup.

## 2.102.1

### Patch Changes

- [#3385](https://github.com/nexus-substrate/nexus-agents/pull/3385) [`fd96d46`](https://github.com/nexus-substrate/nexus-agents/commit/fd96d4696ffd66156411ebc7efcf7e16080327ef) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Make the pipeline engine's PluginRegistry dependency explicit ([#3175](https://github.com/nexus-substrate/nexus-agents/issues/3175)). `PipelineRunner.compile()` previously reached for the process-global `getPipelinePluginRegistry()` singleton inline — an implicit dependency. It now resolves through a small, tested seam: the new `resolvePipelineDeps(deps)` + `PipelineDeps` bundle (exported from the pipeline barrel), where an injected `pluginRegistry` wins and an omitted one falls back to the documented global default. Behavior is unchanged when nothing is injected; the seam is the extension point the injectable-OutcomeStore work ([#3145](https://github.com/nexus-substrate/nexus-agents/issues/3145)) builds on. Verified scope note: the EventBus is already injected via `PipelineExecuteOptions.eventBus` (global fallback already centralized in `pipeline-observability.resolveBus`), and the ArtifactStore is unconsumed by the runner — so this pass intentionally covers only the one dependency the engine actually resolved implicitly.

## 2.102.0

### Minor Changes

- [#3383](https://github.com/nexus-substrate/nexus-agents/pull/3383) [`267e817`](https://github.com/nexus-substrate/nexus-agents/commit/267e8173d244f4f86f5f891425b076e5bec50650) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Add SUGGEST-ONLY `suggest_research_tasks` MCP tool ([#1715](https://github.com/nexus-substrate/nexus-agents/issues/1715) / [#1711](https://github.com/nexus-substrate/nexus-agents/issues/1711)).

  Thin wrapper over `checkForResearchTriggers` that returns CANDIDATE
  `PipelineTask[]` derived from `research_discover` findings for a
  human/orchestrator to review. Ratified by consensus_vote (5/0, Option A):
  it creates no GitHub issues, executes nothing, and mutates nothing. The
  candidate text is externally discovered (T3, untrusted) and is framed as
  data/suggestions in the response, never as instructions. Input: `topic`,
  `qualityThreshold` (0-10), `maxTriggers` (≥1), `existingTaskIds` (→Set for
  dedup) — all optional, all passed straight into the engine's existing
  guardrails. Read-only annotations (`readOnlyHint: true`,
  `openWorldHint: true`). Tool count 43 → 44.

## 2.101.4

### Patch Changes

- [#3379](https://github.com/nexus-substrate/nexus-agents/pull/3379) [`254060f`](https://github.com/nexus-substrate/nexus-agents/commit/254060f0a987939c5dad7e3a98a28479a57ed82d) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Persist self-eval results to the OutcomeStore so the eval -> log -> tune loop closes.

  `nexus-agents evaluate` now maps each aggregated component evaluation to a `TaskOutcome` (via the new `aggregatedResultToOutcome` adapter) and appends it to `getOutcomeStore()`, so self-eval output feeds `improvement_review` / tuning instead of being discarded. Outcomes use a stable `self-eval-<component-path>` id (re-runs upsert rather than pile up), carry the recommendation in `qualitySignals`, and map `retain` -> `success: true`. Persistence is guarded: a store failure is logged and skipped, never crashing the eval run.

  Closes [#3219](https://github.com/nexus-substrate/nexus-agents/issues/3219), [#3235](https://github.com/nexus-substrate/nexus-agents/issues/3235), [#3241](https://github.com/nexus-substrate/nexus-agents/issues/3241).

## 2.101.3

### Patch Changes

- [#3377](https://github.com/nexus-substrate/nexus-agents/pull/3377) [`3128893`](https://github.com/nexus-substrate/nexus-agents/commit/3128893e8a5d8d89b892594faa14956694749eb9) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Export `UnifiedAdapterRegistry` (+ `createUnifiedRegistry`, `getGlobalRegistry`, `resetGlobalRegistry`, and the `UnifiedRegistryConfig`/`TaskRoutingEntry`/`RegistrySnapshot` types) from the public package barrel ([#3184](https://github.com/nexus-substrate/nexus-agents/issues/3184), [#3268](https://github.com/nexus-substrate/nexus-agents/issues/3268)). CLAUDE.md's Canonical Paths names `UnifiedAdapterRegistry` (via `getGlobalRegistry()`) as the canonical way to access adapters, but it was only exported from the internal `adapters/index.ts` — not reachable by package consumers. It's now part of the public API, so operators can build custom routing on the documented primitive without reaching into internals.

## 2.101.2

### Patch Changes

- [#3375](https://github.com/nexus-substrate/nexus-agents/pull/3375) [`44b42c1`](https://github.com/nexus-substrate/nexus-agents/commit/44b42c184ce937f8eaa1c0f60cea7af80357f182) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Restore public-API parity for the MCP barrel (`exports/mcp.ts`, [#3199](https://github.com/nexus-substrate/nexus-agents/issues/3199)): the memory tools' response types (`MemoryQueryResponse`, `MemoryStatsResponse`, `MemoryWriteResponse`) and the async-job + improvement-review tools (`get_job_result` / `list_jobs` / `cancel_job` / `improvement_review` — their `register*Tool`, input schemas, and `*Response`/`*Input`/`*Deps` types) were exported from the internal `mcp/index.ts` but missing from the public package barrel, so embedders had to re-declare them. All are now re-exported. Additive, no behavior change.

## 2.101.1

### Patch Changes

- [#3373](https://github.com/nexus-substrate/nexus-agents/pull/3373) [`8f5f462`](https://github.com/nexus-substrate/nexus-agents/commit/8f5f46262b37400d5d436f2dfa24bc08f23e3c16) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - The dev-pipeline research stage no longer dead-ends: its output is now surfaced to the consensus `vote()` stage, which previously received no research context at all ([#3258](https://github.com/nexus-substrate/nexus-agents/issues/3258)). Research is appended to the vote proposal as a clearly-delimited, size-capped, informational block — explicitly marked as not-instructions so untrusted research text can't steer the vote — and the proposal stays hard-capped at the 4000-char limit with the plan taking priority. Voters can now weigh plans against what research found. (Option A / thin slice; the structured-`ResearchContext` follow-up is tracked in [#3372](https://github.com/nexus-substrate/nexus-agents/issues/3372).)

## 2.101.0

### Minor Changes

- [#3370](https://github.com/nexus-substrate/nexus-agents/pull/3370) [`d0cbc6f`](https://github.com/nexus-substrate/nexus-agents/commit/d0cbc6f08101dd091e8bc6c8c869209a9d9b8853) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - The user overlay `~/.nexus-agents/models.yaml` (in ManifestSchema/`ModelEntry` format) now overrides registry model data — below the operator manifest, above in-tree. This consolidates the two overlay loaders onto `manifest-overlay`, which now loads both the user path (`models.yaml`, lower precedence) and the operator path (`models-manifest.yaml`, higher precedence) and merges them into the single `manifest` registry tier (operator wins on id collision). Completes [#3293](https://github.com/nexus-substrate/nexus-agents/issues/3293)'s overlay-consolidation intent and removes the dead `capability-overlay` loader (its old `ModelCapability` format had zero production effect). Both paths are validated with `ManifestSchema` and fail closed on malformed/oversized files. `registry doctor` now reports the user-overlay path/status from the manifest loader. ([#3351](https://github.com/nexus-substrate/nexus-agents/issues/3351))

## 2.100.2

### Patch Changes

- [#3367](https://github.com/nexus-substrate/nexus-agents/pull/3367) [`720144a`](https://github.com/nexus-substrate/nexus-agents/commit/720144ab21916f02f2f9a53af846ac91489feb5b) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Consolidate the two duplicate `TOOL_ANNOTATIONS` registries into one ([#3358](https://github.com/nexus-substrate/nexus-agents/issues/3358)). The MCP-hints registry (`mcp/tool-annotations.ts`) and the side-effects registry (`mcp/tools/tool-annotations.ts`) each required a per-tool entry, and had silently **drifted** on 9 hint values across 7 tools. The side-effects superset is now the single source of truth; `getToolAnnotations`/`getMcpAnnotations` derive from it (same signatures — callers unchanged), and the curated side-effects metadata is preserved. This also corrects several inaccurate live hints, e.g. `registry_import` is now `readOnlyHint: false` (it writes a draft entry) and `issue_triage` is now `readOnlyHint: true` (it only reads/classifies). Adding a new MCP tool now requires exactly one annotation entry instead of two.

- [#3369](https://github.com/nexus-substrate/nexus-agents/pull/3369) [`e22835b`](https://github.com/nexus-substrate/nexus-agents/commit/e22835b465ee7fb52152e4435bc22e429f130aa4) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Remove the unused public `SharedMemoryStore` export (plus the `SharedMemoryEntry` / `SharedMemoryTag` types). It was a [#1737](https://github.com/nexus-substrate/nexus-agents/issues/1737) Phase-4 cross-stage-memory scaffold whose pipeline read-integration was de-integrated to a write-only husk in [#2937](https://github.com/nexus-substrate/nexus-agents/issues/2937) and whose sibling scaffolds were deleted in [#2939](https://github.com/nexus-substrate/nexus-agents/issues/2939). It had zero production consumers — only barrel re-exports and direct-use timing/edge tests instantiated it. Recoverable via git history if cross-stage memory is ever revived (epic [#3313](https://github.com/nexus-substrate/nexus-agents/issues/3313)).

## 2.100.1

### Patch Changes

- [#3364](https://github.com/nexus-substrate/nexus-agents/pull/3364) [`a6dba7d`](https://github.com/nexus-substrate/nexus-agents/commit/a6dba7dbced687378acf6f279eb7a27893d3abec) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - `registry refresh` now enforces its 5 MiB download cap via streaming with early abort, instead of buffering the entire body before checking the size ([#3354](https://github.com/nexus-substrate/nexus-agents/issues/3354)). It rejects on an over-cap `Content-Length` before reading a byte, and otherwise reads the body through a running byte counter that cancels the stream the moment the cap is exceeded — so a compromised or mistyped mirror serving a multi-gigabyte (or undeclared-length) body can no longer exhaust process memory before the guard fires.

## 2.100.0

### Minor Changes

- [#3360](https://github.com/nexus-substrate/nexus-agents/pull/3360) [`3c6fc94`](https://github.com/nexus-substrate/nexus-agents/commit/3c6fc94f819331115b0c2f3138803e863e379061) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Wire the local QA gate into `run_dev_pipeline` as a pre-ship stage ([#3356](https://github.com/nexus-substrate/nexus-agents/issues/3356) Step 2). A new `qualityGate` option (`'off' | 'advisory' | 'blocking'`, default `'off'`) runs the same `runQualityGate` engine (typecheck/lint/tests) after implement, before the security scan: `advisory` records feedback without failing the pipeline, `blocking` fails the phase on a red gate (same posture as a blocking security finding), and `off` (the default — safe for repos lacking standard build/test scripts) skips it. The stage is a thin caller over the one canonical engine (no new check logic), and is an optional `DevPipelineStages` method so existing consumers are unaffected. Completes the consensus-ratified wiring begun with the `run_quality_gate` MCP tool.

### Patch Changes

- [#3362](https://github.com/nexus-substrate/nexus-agents/pull/3362) [`abc1300`](https://github.com/nexus-substrate/nexus-agents/commit/abc1300bf5ab4da3de143f3def88883f54e85f0c) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - When a consensus voter fails because a CLI's stored OAuth token is stale (e.g. codex's "your refresh token was already used. Please log out and sign in again"), the voter's error now includes an actionable remediation — ``Re-authenticate: run `codex login` …`` — instead of surfacing the raw provider error as a silent fail-closed vote ([#3350](https://github.com/nexus-substrate/nexus-agents/issues/3350)). Extends the existing `cli-error-envelope` auth classifier to recognize the refresh-token-rotation error class and reuses its per-CLI login-hint map; vote semantics are unchanged (still an error/abstain vote, just with a clearer message).

## 2.99.0

### Minor Changes

- [#3357](https://github.com/nexus-substrate/nexus-agents/pull/3357) [`1a53963`](https://github.com/nexus-substrate/nexus-agents/commit/1a539632769130e2e4febf5e6791705efef93e7e) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Add the `run_quality_gate` MCP tool ([#3356](https://github.com/nexus-substrate/nexus-agents/issues/3356)) — a callable QA capability that runs a local quality gate (typecheck / lint / tests / build / security) over a project directory and returns a structured pass/fail verdict with per-check details and actionable feedback. It's a thin wrapper over the existing-but-previously-unwired `runQualityGate` engine ([#1684](https://github.com/nexus-substrate/nexus-agents/issues/1684)), reusing the in-tree check factories and `checkSecurityScan` — closing the gap where `run_dev_pipeline`/`run_pipeline` orchestrate and SARIF-scan but never run a local QA gate before declaring work done. Hardened: `projectDir` is validated via `resolveInsideRoot` (path-traversal rejected) and must be an existing directory; check names are a fixed allowlist mapped to fixed commands (no arbitrary shell); output is bounded. Ratified by consensus vote (higher_order, 7/7). Resolves [#3346](https://github.com/nexus-substrate/nexus-agents/issues/3346).

## 2.98.0

### Minor Changes

- [#3352](https://github.com/nexus-substrate/nexus-agents/pull/3352) [`efc3756`](https://github.com/nexus-substrate/nexus-agents/commit/efc37566272a9c2db00782b8491c129097efc44f) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Complete the CapabilityDiscovery → ModelRegistry consolidation ([#3293](https://github.com/nexus-substrate/nexus-agents/issues/3293)). `ModelRegistry` (`getDefaultRegistry().getEntry`) is now the single model-data resolver. The legacy four-tier `CapabilityDiscovery` resolver — which had no production callers; its `resolve()` chain was dead code — is removed, along with its bundled-registry loader. `registry doctor` now derives its report from the registry: it lists effective entry counts per source (in-tree / models-dev / manifest / generated / derived) and the unknown-id fallback context window, instead of the old T1/T2/T3/T4 tier view. No change to model resolution behavior. The user `models.yaml` overlay is still reported by `doctor` for inspection but, as before, does not yet affect live resolution — wiring it into the registry is tracked in [#3351](https://github.com/nexus-substrate/nexus-agents/issues/3351).

### Patch Changes

- [#3355](https://github.com/nexus-substrate/nexus-agents/pull/3355) [`e48c704`](https://github.com/nexus-substrate/nexus-agents/commit/e48c70401b0bae801bcba4bd59eec5d50e5c2f40) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Add a recursion guard to the Codex MCP adapter ([#3350](https://github.com/nexus-substrate/nexus-agents/issues/3350)). nexus launches `codex mcp-server` as the codex adapter; if codex is configured to launch `nexus-agents --mode=server` as one of its own MCP servers, this forms a recursive spawn loop that leaks dozens of half-initialized servers, all racing the shared codex OAuth refresh-token rotation — which corrupts the on-disk token ("refresh token already used") and degrades consensus votes. The adapter now stamps each spawned `codex mcp-server` child with `NEXUS_MCP_DEPTH` and refuses to spawn when already nested, breaking the cycle after the first level. No effect on normal (non-nested) usage.

## 2.97.1

### Patch Changes

- [#3345](https://github.com/nexus-substrate/nexus-agents/pull/3345) [`6a5428c`](https://github.com/nexus-substrate/nexus-agents/commit/6a5428c18abb3188b84fa2510c7db5be9972cb50) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - chore: remove orphaned mapPartToContentBlock helper (vestigial cleanup)

  `mapPartToContentBlock` in `adapters/gemini-types.ts` was exported but had zero
  importers anywhere (not in any public barrel, not tested) — a refactor leftover.
  Removed it and its now-unused imports (`ContentBlock`, `getTimeProvider`,
  `getRandomProvider`). Gemini adapter behavior unchanged; 51 gemini tests pass.

- [#3349](https://github.com/nexus-substrate/nexus-agents/pull/3349) [`1e5d758`](https://github.com/nexus-substrate/nexus-agents/commit/1e5d758a789d3184b13100c3e4ada21747bd1754) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - fix(consensus): serialize voter calls per-CLI to stop OAuth refresh race ([#3348](https://github.com/nexus-substrate/nexus-agents/issues/3348))

  The 7-role consensus panel round-robins onto available CLIs, so the busiest CLI
  gets 3 of 7 roles. `launchVotesWithOverallDeadline` fanned those out via
  `Promise.all` with only a 2s stagger, so same-CLI subprocess calls overlapped.
  When a CLI's access token was expired, concurrent calls each triggered an OAuth
  refresh; with refresh-token rotation the first rotated the token and the rest
  failed with "refresh token already used" — dropping ~2 voters per run (varying
  roles) and fail-closing real governance votes.

  Votes are now serialized per CLI (keyed by adapter CLI name): at most one
  same-CLI call is in flight at a time, so the cold-start refresh completes before
  the next same-CLI call begins. Cross-CLI parallelism is preserved. Deadline-safe
  within the existing 600s `consensus_vote` MCP wrapper.

## 2.97.0

### Minor Changes

- [#3336](https://github.com/nexus-substrate/nexus-agents/pull/3336) [`53c2b58`](https://github.com/nexus-substrate/nexus-agents/commit/53c2b5865a5210a687299f3b5c4d558f8049a646) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(config): connect the 1071-entry generated catalog to ModelRegistry ([#3293](https://github.com/nexus-substrate/nexus-agents/issues/3293))

  Ingests `model-registry.generated.json` (the broad LiteLLM/models.dev catalog,
  ~1071 entries) into `ModelRegistry` as a LOWEST-priority breadth tier. Each
  record is converted to a full `ModelEntry` (behavior fields derived from the
  id's identity, then the catalog's context window / pricing / display name
  overlaid). In-tree, manifest, and models-dev tiers all still win; the breadth
  tier only fills the long tail, so unknown/new models resolve to real catalog
  data instead of a bare derived default.

  This is the non-destructive "connect, don't drop" step toward the
  CapabilityDiscovery → ModelRegistry consolidation ([#3293](https://github.com/nexus-substrate/nexus-agents/issues/3293)) — it preserves the
  coverage the legacy T2 tier provided (parity test asserts zero context-window
  mismatches across all catalog ids). The CapabilityDiscovery removal stays gated
  behind the binding confirmation vote and remains a follow-up.

- [#3340](https://github.com/nexus-substrate/nexus-agents/pull/3340) [`6bcaf67`](https://github.com/nexus-substrate/nexus-agents/commit/6bcaf67bbd0195c6c0531b2f94201677d8317db6) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(server): warn at startup when running a stale version ([#3283](https://github.com/nexus-substrate/nexus-agents/issues/3283))

  A long-lived MCP server can drift many versions behind the published package and
  silently serve old code (47 stale `--mode=server` processes pinned at v2.76.0
  were found in the wild — which is what let an already-fixed `consensus_vote` bug
  reappear). The server now does a best-effort check at startup and logs a
  prominent WARN if the running build is behind the latest published version, with
  the fix command. Fail-soft and non-blocking: any network/timeout/parse failure
  is swallowed, it never gates startup, and it auto-skips dev builds + CI. One
  outbound npm-registry call; opt out with `NEXUS_VERSION_CHECK=0`.

### Patch Changes

- [#3342](https://github.com/nexus-substrate/nexus-agents/pull/3342) [`b46d0ef`](https://github.com/nexus-substrate/nexus-agents/commit/b46d0ef2e126643688d1b0636d00ac614b121b7c) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - docs: complete both ENTRYPOINTS MCP tool enumerations (38/20 → 42, [#3334](https://github.com/nexus-substrate/nexus-agents/issues/3334))

  `docs/ENTRYPOINTS.md` had two stale tool enumerations: the prose table listed
  38 of 42 registered tools, and the machine-parseable `mcp_tools:` YAML block only 20. Both now list all 42 (regenerated from `REGISTERED_TOOL_NAMES`), with the
  prose descriptions matching the README and per-tool `auth` (run_dev_pipeline =
  optional, rest = none). Automating these via the governance injector (the
  markers exist but inject-governance doesn't yet target ENTRYPOINTS) + a drift
  gate remains tracked in [#3334](https://github.com/nexus-substrate/nexus-agents/issues/3334).

- [#3341](https://github.com/nexus-substrate/nexus-agents/pull/3341) [`8d21337`](https://github.com/nexus-substrate/nexus-agents/commit/8d21337b37d5c9068d6344f7e9bb57d0474ce40f) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - fix(consensus): opinion_wise now gets higher-order Bayesian aggregation ([#3271](https://github.com/nexus-substrate/nexus-agents/issues/3271))

  `opinion_wise` is documented as an alias of `higher_order`, but the Bayesian/
  correlation-aware aggregation was gated on the literal `'higher_order'` in two
  places — so an `opinion_wise` vote silently fell through to the plain engine
  with no `higherOrderMetadata` in the response. Added a shared
  `isHigherOrderStrategy()` helper and used it at both the `runHigherOrderVoting`
  gate and the `higherOrderMetadata` serialization, so `opinion_wise` is a true
  alias. Tests assert `opinion_wise` produces `higherOrderMetadata` like
  `higher_order`.

## 2.96.0

### Minor Changes

- [#3330](https://github.com/nexus-substrate/nexus-agents/pull/3330) [`7f0caa2`](https://github.com/nexus-substrate/nexus-agents/commit/7f0caa298745c3e74ff4643010257dd7fbf6d5fa) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(tune): enable the self-tuning routing loop by default ([#3323](https://github.com/nexus-substrate/nexus-agents/issues/3323))

  **NOTABLE — behavior change.** `NEXUS_TUNE_ENFORCE` now defaults to **`true`**:
  routing self-tunes by default. When a CLI's health degrades (SwarmObserver
  bottleneck or adapter circuit-breaker failover emits `signal.swarm_unhealthy`),
  the `CompositeRouter` applies a **bounded** demotion to that CLI's candidate
  score.

  The demotion is strictly safety-bounded so it is self-correcting, never a
  ratchet: demotion-only (a CLI is slowed, never boosted), floored at `0.5` (never
  zeroed — a sole-viable CLI is always still selectable), capped at `0.2` per step,
  and time-decaying linearly back to neutral over 30 minutes. Every demotion is
  recorded to the immutable audit log (`tune.demote`, verify via
  `verify_audit_chain`).

  **Opt out** with `NEXUS_TUNE_ENFORCE=false` to restore shadow mode (the loop logs
  what it _would_ do and records the `intended` counter — visible in
  `nexus-agents health` → "Self-Tuning Demotions" — but leaves routing untouched).

  Completes epic [#3143](https://github.com/nexus-substrate/nexus-agents/issues/3143) (close the loop) / keystone [#3147](https://github.com/nexus-substrate/nexus-agents/issues/3147).

- [#3331](https://github.com/nexus-substrate/nexus-agents/pull/3331) [`487dc7d`](https://github.com/nexus-substrate/nexus-agents/commit/487dc7d18d4a7babffb47219115bfddbf0657141) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(observability): scheduled improvement_review producer ([#3229](https://github.com/nexus-substrate/nexus-agents/issues/3229))

  Adds an opt-in server-side scheduler that periodically runs `improvement_review`
  so its `signal.fitness_declined` fires automatically, closing the
  observability→action gap (a human previously had to invoke the tool by hand).
  Mirrors the swarm-health-signals lifecycle (idempotent start + paired shutdown,
  unref'd timer, errors swallowed, concurrency-guarded). **Disabled by default**
  (`NEXUS_IMPROVEMENT_REVIEW_INTERVAL_MS=0`); a conservative 6h is suggested when
  opting in. Auto-filing GitHub issues stays a SEPARATE opt-in
  (`NEXUS_IMPROVEMENT_REVIEW_FILE_ISSUES`, default false) so the timer never spams
  issues. Analysis-only by default.

- [#3333](https://github.com/nexus-substrate/nexus-agents/pull/3333) [`ee78185`](https://github.com/nexus-substrate/nexus-agents/commit/ee78185d5c5c5b698731c95e6bc6152b8b8202c7) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(observability): surface self-eval findings as improvement_review signals ([#3224](https://github.com/nexus-substrate/nexus-agents/issues/3224))

  Closes the gap where self-evaluation produced recommendations that never drove
  any action. `improvement_review` gains an opt-in `selfEvalReportPath` input: when
  set, it reads a `self-eval --json` report and converts **high-confidence,
  unanimous** `deprecate`/`refactor` findings (confidence ≥ 0.8, no dissent) into
  `tech-debt` signals that flow through the SAME deduped + rate-limited GitHub-issue
  path as the other detectors. This is the safe, non-behavioral path: it surfaces a
  human decision point (a candidate issue), never an automatic routing change.
  Fail-soft — an absent/unreadable/malformed report yields no signals (logged), and
  absent input leaves behavior unchanged.

### Patch Changes

- [#3335](https://github.com/nexus-substrate/nexus-agents/pull/3335) [`cdbbe79`](https://github.com/nexus-substrate/nexus-agents/commit/cdbbe79ce12874d2b5e181506b302de7d84c55aa) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - docs: align package metadata + READMEs with the governance-substrate positioning; fix stale counts

  Accuracy/no-exaggeration pass over the publication surfaces:
  - **package.json**: description reframed from "intelligent orchestration platform" to the actual "governance substrate" positioning (matches the README); added `governance`/`code-review`/`consensus`/`audit`/`codex`/`opencode` keywords; added `homepage` + `bugs`.
  - **npm README** (`packages/nexus-agents/README.md`): governance-first tagline + overview; corrected "24 MCP tools" → 42 and "10 Expert types" → 12.
  - **Root README**: removed the unverifiable "No other framework closes this loop" marketing line; documented the now-default bounded self-tuning loop (capped, auto-decaying, opt-out `NEXUS_TUNE_ENFORCE=false`); "11 built-in expert types" → 12.
  - **consensus_vote schema**: `quickMode` description "3 agents instead of 5" → "instead of the full 7-role panel" (the panel is 7).
  - **docs/ENTRYPOINTS.md**: `--quick` count fixes (→7); refreshed Last Updated. (Tool-table/YAML completeness tracked in [#3334](https://github.com/nexus-substrate/nexus-agents/issues/3334).)

## 2.95.0

### Minor Changes

- [#3325](https://github.com/nexus-substrate/nexus-agents/pull/3325) [`cc96ef9`](https://github.com/nexus-substrate/nexus-agents/commit/cc96ef95e4c1379d8976506c62eca07e5995f9ed) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(tune): durable audit trail for self-tuning routing demotions ([#3323](https://github.com/nexus-substrate/nexus-agents/issues/3323))

  Each enforced routing demotion now appends a tamper-evident `tune.demote` record
  to the immutable AuditLogger (category `configuration`, queryable via
  `verify_audit_chain`), in addition to the structured log. The record carries the
  CLI, magnitude, resulting multiplier, reason, provenance, and timestamp. The
  audit sink is optional/injectable (omitted in shadow/unit contexts) and wired
  from the server through `initV2PipelineSubsystems` → `startTuneStage`. Audit
  failures never break the tune path. Satisfies a default-on exit criterion for
  the self-tuning loop ([#3323](https://github.com/nexus-substrate/nexus-agents/issues/3323)): a default-on auto-mutating router must leave an
  auditable trail.

- [#3328](https://github.com/nexus-substrate/nexus-agents/pull/3328) [`a4467a2`](https://github.com/nexus-substrate/nexus-agents/commit/a4467a2b872ca1e8789113ebf6a62e10fc9c1f4f) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(tune): shadow-soak demotion telemetry for the self-tuning loop ([#3323](https://github.com/nexus-substrate/nexus-agents/issues/3323))

  Adds inspectable per-CLI demotion counters to `TuneAdjustmentStore` — `applied`
  (demotions that biased routing in enforce mode) and `intended` (demotions the
  loop WOULD have applied while shadow). The new `recordIntended()` increments the
  shadow counter WITHOUT touching routing, so an operator can observe what enabling
  the loop would do during a soak while `effectiveMultiplier` stays 1.0. Counters
  survive decay/eviction (bounded by CLI cardinality; reason capped at 512 chars).
  TuneStage records intended demotions in shadow mode; the `health` command now
  surfaces a "Self-Tuning Demotions" section (table + JSON). A default-on exit
  criterion for [#3323](https://github.com/nexus-substrate/nexus-agents/issues/3323).

### Patch Changes

- [#3329](https://github.com/nexus-substrate/nexus-agents/pull/3329) [`a248429`](https://github.com/nexus-substrate/nexus-agents/commit/a248429411470c28928e99f13cecbe699ca95f9f) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - docs(tune): document the self-tuning loop and NEXUS_TUNE_ENFORCE ([#3323](https://github.com/nexus-substrate/nexus-agents/issues/3323))

  Adds a `NEXUS_TUNE_ENFORCE` entry to CONFIGURATION.md (shadow default vs enforce,
  the bounded-safety invariants, the `health` "Self-Tuning Demotions" telemetry,
  and the opt-out) and a "The self-tuning loop ([#3143](https://github.com/nexus-substrate/nexus-agents/issues/3143))" architecture section in
  EVENT_BUS_BOUNDARIES.md (producers → TuneStage → store → router, end-to-end,
  replacing the stale shadow-only description). The last default-on exit criterion
  from [#3323](https://github.com/nexus-substrate/nexus-agents/issues/3323).

## 2.94.0

### Minor Changes

- [#3310](https://github.com/nexus-substrate/nexus-agents/pull/3310) [`6a1d954`](https://github.com/nexus-substrate/nexus-agents/commit/6a1d954b83b30a83b7c3ec76380516399afbe97f) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - fix(consensus): higher_order no longer fail-closes on a single voter error ([#3138](https://github.com/nexus-substrate/nexus-agents/issues/3138), [#3304](https://github.com/nexus-substrate/nexus-agents/issues/3304))

  `getDefaultErrorPolicy` now returns `fail_closed` only for `unanimous` (where a
  missing voter genuinely breaks the guarantee). `higher_order` and its
  `opinion_wise` alias default to `reduce_denominator`: Bayesian/weighted
  aggregation over the non-error voters is well-defined, so one voter's infra
  timeout (e.g. the slow Security voter's adapter transport) no longer voids an
  otherwise-unanimous result. The >50% `ERROR_FLOOR_FRACTION` hard floor still
  voids any vote where most voters errored. Callers can still pass an explicit
  `errorPolicy` override.

- [#3322](https://github.com/nexus-substrate/nexus-agents/pull/3322) [`6a7bdb6`](https://github.com/nexus-substrate/nexus-agents/commit/6a7bdb6e09c778f78953d212b724b7677cbf175c) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(observability): emit signal.swarm_unhealthy from adapter failovers ([#3321](https://github.com/nexus-substrate/nexus-agents/issues/3321))

  Adds a second, higher-reliability `signal.swarm_unhealthy` producer alongside
  the SwarmObserver-bottleneck poll ([#3223](https://github.com/nexus-substrate/nexus-agents/issues/3223)). `ResilientAdapter` emits
  `adapter.failover` events on the collaboration bus whose payload carries the
  exact `CliName` and health state on circuit-breaker trips / failovers. This
  producer subscribes to that bus and re-emits `signal.swarm_unhealthy` on the
  typed pipeline bus when an adapter degrades or becomes unavailable — directly
  CLI-attributable, no `confidentCliSlot` guesswork. A per-CLI cooldown absorbs
  breaker flapping. `api`-source and healthy events are ignored. The
  shadow-by-default TuneStage consumes it; under `NEXUS_TUNE_ENFORCE` it applies a
  bounded, decaying routing demotion. Bus direction is B→A, preserving the
  observability/messaging boundary.

- [#3318](https://github.com/nexus-substrate/nexus-agents/pull/3318) [`ece910f`](https://github.com/nexus-substrate/nexus-agents/commit/ece910f439d4846b8685330eaa22024fe4ebbb74) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - fix(routing): resolve any model to a CliName slot so api-mode + new models are recorded ([#3317](https://github.com/nexus-substrate/nexus-agents/issues/3317), [#3293](https://github.com/nexus-substrate/nexus-agents/issues/3293))

  `resolveCliFromModelString` returned undefined for any model not in the curated
  `MODEL_IDS` list, and `recordOutcome` skips an undefined-cli outcome — so a
  brand-new release (gpt-5.5, claude-4.8) or an API/openrouter model not yet in
  the registry had its routing outcomes silently dropped, breaking LinUCB learning
  and tune signals in api-mode. New `resolveCliSlot(model)` resolves known models
  to their exact slot and falls back to a vendor-derived slot for unknown models
  (anthropic→claude, openai→codex, google→gemini, others→opencode), so the
  routing/outcome/tune pipeline records and learns regardless of CLI-vs-API
  backing or model novelty. Additive — known models keep their exact slot.

- [#3316](https://github.com/nexus-substrate/nexus-agents/pull/3316) [`e00b234`](https://github.com/nexus-substrate/nexus-agents/commit/e00b2348df250964269a691262847452bbca4d66) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(routing): CompositeRouter applies bounded tune demotions ([#3147](https://github.com/nexus-substrate/nexus-agents/issues/3147) keystone step 2)

  The router now reads the TuneAdjustmentStore and folds each demoted CLI's
  multiplier into TOPSIS stage scoring as an additive penalty (`-(1 - multiplier)
  - 10`, consistent with the distilled penalize/-5 scale; bounded by the store's
floor to ≈ -5 max). Gated by `NEXUS_TUNE_ENFORCE` — empty/no-op by default, so
    zero behavior change until the Tune loop is switched on. Completes the read side
    of the self-tuning loop; the TuneStage write/enforce path is the next step.

- [#3320](https://github.com/nexus-substrate/nexus-agents/pull/3320) [`736b0b1`](https://github.com/nexus-substrate/nexus-agents/commit/736b0b18a8f8a1b4b35bb6f1a40034f6a1f03b00) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(observability): emit signal.swarm_unhealthy from SwarmObserver health ([#3223](https://github.com/nexus-substrate/nexus-agents/issues/3223))

  Adds the final producer that makes the self-tuning loop fire end-to-end. A
  server-lifecycle poll reads `SwarmObserver.getHealthMetrics()` and emits
  `signal.swarm_unhealthy` onto the typed pipeline bus for CLI-attributable
  severe (high/critical) bottlenecks. The (shadow-by-default) TuneStage consumes
  it; under `NEXUS_TUNE_ENFORCE` it applies a bounded, decaying routing demotion.
  Attribution is conservative — a bottleneck only signals when its agentId
  confidently resolves to a canonical CLI slot (CLI-name literal or curated model
  id); role names / trace ids are skipped (debug-logged), never mis-attributed to
  the opencode catch-all. Closes the observability→routing gap ([#3223](https://github.com/nexus-substrate/nexus-agents/issues/3223)): rich swarm
  health was previously write-only for dashboards.

- [#3315](https://github.com/nexus-substrate/nexus-agents/pull/3315) [`0bd5fcd`](https://github.com/nexus-substrate/nexus-agents/commit/0bd5fcdffbb9914786a26d4f25761ade113c6625) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(core): bounded, time-decaying TuneAdjustmentStore for the self-tuning loop ([#3147](https://github.com/nexus-substrate/nexus-agents/issues/3147))

  Adds the provenance-tagged routing-adjustment channel the closed-loop Tune stage
  needs — separate from the LinUCB real-outcome channel (per the P2 ratifying-vote
  dissent). Hard safety bounds: demotion-only (≤1.0), floored (never below 0.5 —
  a CLI is never zeroed out by tuning), capped per step (≤0.2), and time-decaying
  linearly back to 1.0 over 30min so a transient blip auto-reverses. The
  CompositeRouter read (apply the multiplier in TOPSIS scoring) and the TuneStage
  write (enforce path) land in the immediately-following PRs.

- [#3319](https://github.com/nexus-substrate/nexus-agents/pull/3319) [`e5c2250`](https://github.com/nexus-substrate/nexus-agents/commit/e5c225027982ef4092f563140244e014f91828ce) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(tune): TuneStage applies bounded routing demotions when enforced ([#3147](https://github.com/nexus-substrate/nexus-agents/issues/3147))

  Flips the TuneStage enforce path from a fail-closed no-op to a real bounded
  mutation: on `signal.swarm_unhealthy` it calls `TuneAdjustmentStore.demote`
  (demotion-only, floored, capped, time-decaying), audited via a structured log.
  Gated by `NEXUS_TUNE_ENFORCE` — the SAME flag the router read uses, so the loop
  is either fully live or fully shadow, never half-wired. Default off (shadow).
  Non-routing signals (fitness_declined/vote_rejected) stay shadow even when
  enforced — they belong to issue-filing/review paths, not routing. Closes the
  self-tuning loop's write side end-to-end (store + router read + this write).

### Patch Changes

- [#3314](https://github.com/nexus-substrate/nexus-agents/pull/3314) [`9b42297`](https://github.com/nexus-substrate/nexus-agents/commit/9b4229791f741734567e8a9da5c1f4abd19f14bb) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - perf(routing): cache the per-CLI quality-reward scan ([#3261](https://github.com/nexus-substrate/nexus-agents/issues/3261))

  `computeQualityReward` ran an O(N) `OutcomeStore.query({cli})` scan on every
  `executeTask`; with persistence default-on the store grows, so this was a
  per-task hot-path cost. The per-CLI success rate is now cached with a short TTL
  (15s) — a smoothed historical signal tolerates that staleness. Adds
  `resetQualityRewardCache()` for tests. (Verify-first note: persistence itself was
  already enabled by default — `NEXUS_PERSIST_LEARNING` — so [#3261](https://github.com/nexus-substrate/nexus-agents/issues/3261)'s "no
  persistence" premise was stale; the real cost was the uncached scan.)

- [`458d639`](https://github.com/nexus-substrate/nexus-agents/commit/458d63983023e35c04cf30225ef8234fbdb67eee) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - fix(consensus): cancel slow voters cleanly across CLI and API adapters ([#3304](https://github.com/nexus-substrate/nexus-agents/issues/3304))

  Generalizes the [#3311](https://github.com/nexus-substrate/nexus-agents/issues/3311) vote-timeout fix to API-backed voters. The voter request
  now also carries an `AbortSignal.timeout(timeoutMs)`: CLI adapters honor
  `timeoutMs` (subprocess timeout) and `signal` ([#3026](https://github.com/nexus-substrate/nexus-agents/issues/3026) SIGTERM); API adapters
  honor `signal` ([#3036](https://github.com/nexus-substrate/nexus-agents/issues/3036), aborts the in-flight SDK call). Previously the API-voter
  path relied only on the outer `withTimeout` race, which bounded the wait but
  left the API call running. Now both adapter types cancel at the vote budget —
  CLI-vs-API parity.

- [#3311](https://github.com/nexus-substrate/nexus-agents/pull/3311) [`421a433`](https://github.com/nexus-substrate/nexus-agents/commit/421a433b174d9c09f586168fec6e746aca911dc1) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - fix(consensus): thread the vote budget into the voter's adapter call ([#3304](https://github.com/nexus-substrate/nexus-agents/issues/3304))

  Adds an optional `timeoutMs` to `CompletionRequest`; `CliToModelAdapter.complete`
  now uses `request.timeoutMs ?? defaultTimeoutMs`, and the voter passes its
  per-vote budget (300s). Previously the adapter fell back to its shorter standard
  CLI timeout (120-180s), which fired first on slow voters (e.g. the Security role
  on complex proposals) and surfaced as an `MCP -32001` — dropping that voter.
  Now the slow voter completes within the vote budget and its input is counted.

## 2.93.0

### Minor Changes

- [#3307](https://github.com/nexus-substrate/nexus-agents/pull/3307) [`b437454`](https://github.com/nexus-substrate/nexus-agents/commit/b437454ca89bb67662d40b3ffdd76d91cea31718) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(security): durable audit bridge — mirror security decisions to the hash-chained log ([#3291](https://github.com/nexus-substrate/nexus-agents/issues/3291))

  Phase 1 of AuditLogger convergence (epic [#3288](https://github.com/nexus-substrate/nexus-agents/issues/3288) item 3). The security `AuditTrail`
  was in-memory-only, so trust/policy/reputation/sanitization decisions were lost on
  exit. Adds `security/audit-bridge.ts` mapping each security `AuditEvent` into the
  durable `AuditEventInput` schema (`action: security.*`, `source` via category) and
  a `createDurableAuditSink(auditLogger)`. `AuditTrail` gains an optional durable
  sink (default-off — zero behavior change); `FirewallConfig.auditLogger` opts a
  firewall into durable mirroring. Per the [#3291](https://github.com/nexus-substrate/nexus-agents/issues/3291) vote (fold-in over a separate
  SecurityAuditLogger). Phase 2 threads the logger from server init + retires
  `AuditTrail.append`.

- [#3301](https://github.com/nexus-substrate/nexus-agents/pull/3301) [`42f94ab`](https://github.com/nexus-substrate/nexus-agents/commit/42f94ab824d63747f6f229a3915fd872507fd763) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(pipeline): shadow-mode TuneStage closes the signal loop (consumer core, [#3147](https://github.com/nexus-substrate/nexus-agents/issues/3147))

  Adds `signal.fitness_declined` / `signal.swarm_unhealthy` / `signal.vote_rejected`
  to the typed `PipelineEvent` union and a `createTuneStage` consumer that maps each
  signal to its bounded intended action. Ships dry-run first: it logs the intended
  action and mutates nothing; `enabled=true` fails closed (no-op) because the
  human-gated mutation path ([#3147](https://github.com/nexus-substrate/nexus-agents/issues/3147) PR-4) is not implemented and must not reuse the
  LinUCB real-outcome channel. Producers are wired after the event-bus unification
  ([#3289](https://github.com/nexus-substrate/nexus-agents/issues/3289)). Unlike the removed [#3022](https://github.com/nexus-substrate/nexus-agents/issues/3022) learning.\* types, these ship WITH their consumer.

- [#3306](https://github.com/nexus-substrate/nexus-agents/pull/3306) [`892c22b`](https://github.com/nexus-substrate/nexus-agents/commit/892c22b8a32c8b661649abdd1d5a3e2ccc8956e3) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(improvement-review): emit signal.fitness_declined to close the tune loop ([#3147](https://github.com/nexus-substrate/nexus-agents/issues/3147))

  Second `signal.*` producer per the [#3289](https://github.com/nexus-substrate/nexus-agents/issues/3289) narrow-merge scope: when the
  `improvement_review` MCP tool's fitness audit falls below the governance floor,
  it emits `signal.fitness_declined` (score, floor, worst-offending dimension)
  onto the typed pipeline bus, where the shadow TuneStage consumes it
  (`flag_tech_debt`). Emitter lives at the MCP layer (server context, live
  consumer) to keep `governance/fitness-score` decoupled from the bus
  (A=observability / B=messaging).

- [#3305](https://github.com/nexus-substrate/nexus-agents/pull/3305) [`9a4de04`](https://github.com/nexus-substrate/nexus-agents/commit/9a4de04b55b5151eb4d620a22339a1ee19432418) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(consensus): close the self-tuning loop for rejected votes ([#3147](https://github.com/nexus-substrate/nexus-agents/issues/3147))

  Wires the first `signal.*` producer onto the typed pipeline bus per the [#3289](https://github.com/nexus-substrate/nexus-agents/issues/3289)
  narrow-merge scope: when a `consensus_vote` resolves to `rejected`, the MCP
  handler emits `signal.vote_rejected` (proposalId, approvalPercentage, distinct
  rejectionRules) via the new `consensus-vote-signals` emitter. The shadow
  `TuneStage` is now instantiated at server init (`startTuneStage`, paired with
  `shutdownTuneStage`), so the loop is closed end-to-end in shadow mode (logs the
  intended `record_rejection` action, mutates nothing). The emitter lives at the
  MCP layer to keep the consensus engine decoupled from the pipeline bus
  (A=observability / B=messaging boundary, documented in EVENT_BUS_BOUNDARIES.md).

### Patch Changes

- [#3309](https://github.com/nexus-substrate/nexus-agents/pull/3309) [`2ed6372`](https://github.com/nexus-substrate/nexus-agents/commit/2ed6372f33d204d23078051fc8676add996f237b) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - refactor(config): adopt canonical parseBoolEnv in 3 duplicate bool-env parsers ([#3297](https://github.com/nexus-substrate/nexus-agents/issues/3297))

  Three benign flag sites reimplemented `process.env[K] === '1' || === 'true'` inline
  (research scaffold, two hook-utils flags). They now call the existing canonical
  `parseBoolEnv(key, false)`, which also makes them case-insensitive (a desirable
  normalization). Deliberately EXCLUDES the SSRF-guard-bypass flag
  (`NEXUS_CUSTOM_API_ALLOW_PRIVATE`), which stays strict/case-sensitive so extra
  case variants can't loosen the security control.

- [#3308](https://github.com/nexus-substrate/nexus-agents/pull/3308) [`73807ce`](https://github.com/nexus-substrate/nexus-agents/commit/73807ceb84db796f8c4438f22750349c6aa4dc1a) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - refactor(core): extract canonical BoundedLRUCache; adopt in PolicyCache ([#3292](https://github.com/nexus-substrate/nexus-agents/issues/3292))

  First step of the cache consolidation (epic [#3288](https://github.com/nexus-substrate/nexus-agents/issues/3288) item 4, scoped by verify-first):
  adds `core/BoundedLRUCache<K,V>` — the single size-bound LRU implementation that
  was hand-rolled across several caches — and adopts it behind `PolicyCache`'s
  existing interface (dropping its unused `insertedAt` field). Behavior-preserving:
  the existing PolicyCache tests pass unchanged. The TTL-bearing and domain-specific
  caches stay separate (per the [#3292](https://github.com/nexus-substrate/nexus-agents/issues/3292) scoping).

- [#3303](https://github.com/nexus-substrate/nexus-agents/pull/3303) [`2b82873`](https://github.com/nexus-substrate/nexus-agents/commit/2b828733db3f4463b84d5c49d4270f57405be362) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - refactor(pipeline): adopt shared CircularBuffer in the pipeline EventBus ([#3288](https://github.com/nexus-substrate/nexus-agents/issues/3288))

  The pipeline EventBus stored history in a plain array with O(n) `Array.shift()`
  eviction, reinventing the O(1) `CircularBuffer` that already existed (and whose
  own doc cited "EventBus history" as its purpose). Relocates `CircularBuffer` from
  `agents/collaboration/` to `core/` (its natural shared home; the collaboration
  barrel keeps a back-compat re-export) and adopts it in the pipeline EventBus.
  Behavior-preserving: same oldest-first eviction and query order.

- [#3302](https://github.com/nexus-substrate/nexus-agents/pull/3302) [`0a17170`](https://github.com/nexus-substrate/nexus-agents/commit/0a171701a76a06704c00b6922de3837f5b912790) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - refactor(pipeline): name the pipeline policy fn evaluatePipelinePolicy at source ([#3194](https://github.com/nexus-substrate/nexus-agents/issues/3194))

  The pipeline `policy-evaluator` function was named `evaluatePolicy`, colliding with
  the unrelated MCP-middleware `evaluatePolicy`. The public `exports/pipeline.ts`
  already aliased it to `evaluatePipelinePolicy` to dodge the clash; this renames the
  source function so the alias hack is gone and the symbol is unambiguous in-tree.
  No public API change (the exported name is unchanged).

## 2.92.5

### Patch Changes

- [#3281](https://github.com/nexus-substrate/nexus-agents/pull/3281) [`88e14ee`](https://github.com/nexus-substrate/nexus-agents/commit/88e14eea3a4d3f3ba98f2f37cc5217a323938291) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(outcomes): optional traceId/requestId correlation on routing TaskOutcome ([#3146](https://github.com/nexus-substrate/nexus-agents/issues/3146), epic [#3143](https://github.com/nexus-substrate/nexus-agents/issues/3143) P1)

  Adds optional `traceId?`/`requestId?` to the routing `TaskOutcomeSchema` so outcomes can be correlated across the pipeline/audit substrate. Zod-optional and backward-compatible — older JSONL records without the fields hydrate unchanged. First additive PR of the ratified P1 durable-substrate plan; the feedback-side `StoredTaskOutcome` already carries `traceId`.

- [#3284](https://github.com/nexus-substrate/nexus-agents/pull/3284) [`463281d`](https://github.com/nexus-substrate/nexus-agents/commit/463281d28b6e3e9bcbc64c4338320638210a449b) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(outcomes): feedback→routing TaskOutcome mapper ([#3146](https://github.com/nexus-substrate/nexus-agents/issues/3146), epic [#3143](https://github.com/nexus-substrate/nexus-agents/issues/3143) P1)

  Adds `feedbackToRoutingOutcome(feedback, context)` (new `learning/feedback-outcome-mapper.ts`) — a one-way, pure mapper converting a feedback-layer `TaskOutcome` into a routing-layer one, so feedback outcomes can be recorded into the routing OutcomeStore for unified analysis. The feedback `traceId` is carried through (lands in the optional routing `traceId` from PR-1/[#3281](https://github.com/nexus-substrate/nexus-agents/issues/3281)), giving cross-layer correlation. The two `TaskOutcome` types stay separately exported (no symbol collapse). Lossy by design: the feedback `qualitySignals`/`qualityScore` have no routing-schema home and are dropped; `errorMessage` is clipped to the schema's 500-char max. Output is schema-valid. Additive — no existing code paths changed.

## 2.92.4

### Patch Changes

- [#3272](https://github.com/nexus-substrate/nexus-agents/pull/3272) [`f783208`](https://github.com/nexus-substrate/nexus-agents/commit/f783208655f788d5f4a452abfa6a3166c99aa11d) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - fix(consensus): correctness edges on the higher-order voting path ([#3144](https://github.com/nexus-substrate/nexus-agents/issues/3144) P0)
  - `opinion_wise` now shares `higher_order`'s `fail_closed` default error policy instead of silently diverging to `reduce_denominator` ([#3167](https://github.com/nexus-substrate/nexus-agents/issues/3167)) — it is an alias of higher_order.
  - `OWVoting.algorithm` is constructor-configurable (defaults to `simple_majority`); `HigherOrderVotingStrategy` sets `opinion_wise` via the constructor so the label is correct whether built directly or via a factory ([#3168](https://github.com/nexus-substrate/nexus-agents/issues/3168)).
  - Correlation recording no longer drops ALL data on a mixed-source panel — it records the real (LLM) votes and logs the excluded count, instead of leaving the correlation matrix permanently stale when one voter simulated/errored ([#3170](https://github.com/nexus-substrate/nexus-agents/issues/3170)).
  - Added the missing tests for these paths ([#3171](https://github.com/nexus-substrate/nexus-agents/issues/3171)).

  Investigated and **rejected** [#3172](https://github.com/nexus-substrate/nexus-agents/issues/3172) (a "restore uniform weights when all collapse to the floor" guard): equal downweighting of equally-correlated agents is correct, and the Bayesian weighted-average is invariant under equal scaling, so all-at-floor is not degenerate — restoring uniform would wrongly treat correlated agents as independent (guarded by the existing "all perfectly correlated" test).

- [#3279](https://github.com/nexus-substrate/nexus-agents/pull/3279) [`cd37b07`](https://github.com/nexus-substrate/nexus-agents/commit/cd37b07c9e59d69184ba2179d16eb1e12ed6389c) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - fix(pipeline): preserve error context in stage execution ([#3176](https://github.com/nexus-substrate/nexus-agents/issues/3176), [#3144](https://github.com/nexus-substrate/nexus-agents/issues/3144) P0)

  Stage-execution catch blocks used `String(e)`, which mangles non-Error throws to `"[object Object]"` and drops the real message. Replaced with `getErrorMessage(e)` across the 9 stage wrappers (`stage-wrappers.ts`) plus the orchestration CLI-plan-parse and triangulated-review error paths, so a thrown object/string surfaces its actual message in `StageOutput.error` and logs.

- [#3278](https://github.com/nexus-substrate/nexus-agents/pull/3278) [`2a86389`](https://github.com/nexus-substrate/nexus-agents/commit/2a86389698afcc7320e3702a240312088cca117e) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(security): policy-gate can emit decisions to an audit trail ([#3191](https://github.com/nexus-substrate/nexus-agents/issues/3191), [#3144](https://github.com/nexus-substrate/nexus-agents/issues/3144) P0)

  `evaluatePolicy` accepts an optional `auditTrail` and, when supplied, emits a `policy_gate` audit event (actionType, allowed, requiresApproval, inputTrustTier, violationRules) via the existing `emitPolicyEvent`. Previously policy decisions left no audit record. Optional + additive — pure callers pass no trail and incur zero side effects; existing call sites are unchanged. Foundation for the durable audit/tune substrate ([#3146](https://github.com/nexus-substrate/nexus-agents/issues/3146)).

- [#3277](https://github.com/nexus-substrate/nexus-agents/pull/3277) [`23d6203`](https://github.com/nexus-substrate/nexus-agents/commit/23d62033247c328b46b960e03de670e3e2d96bff) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(security): firewall policyEnforcement stage surfaces Rule-of-Two ([#3198](https://github.com/nexus-substrate/nexus-agents/issues/3198), [#3144](https://github.com/nexus-substrate/nexus-agents/issues/3144) P0)

  The firewall's `policyEnforcement` stage was declared (default on) but never read — Rule-of-Two was only checked in `policy-gate`, not during firewall composition. `HostileInputFirewall.process()` now evaluates Rule-of-Two against the effective (reputation-reconciled) trust tier + the configured `context` (write/secret access) and **surfaces** a `ruleOfTwoViolation` on `FirewallResult` (signal-only — the firewall is a library; the consumer enforces; no hard block, so no breaking behavior). `checkRuleOfTwo` is exported from `policy-gate` to avoid duplicating the predicate. Tier-1/allowlisted authors are immune.

- [#3275](https://github.com/nexus-substrate/nexus-agents/pull/3275) [`f92f98f`](https://github.com/nexus-substrate/nexus-agents/commit/f92f98fdae2a6cd61b52b1090c02821456968e31) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - fix(adapters): default a logging onRetirement callback when missing-model fallback is enabled ([#3144](https://github.com/nexus-substrate/nexus-agents/issues/3144) P0)

  The model-not-found fallback's `onRetirement` callback was declared but never wired in production, so model retirements were silent. `UnifiedAdapterRegistry` now defaults `onRetirement` to a `logger.warn` when `enableMissingModelFallback` is on (callers can still override it), making retirements observable. Extracted as the exported, testable `withDefaultOnRetirement` helper.

## 2.92.3

### Patch Changes

- [#3141](https://github.com/nexus-substrate/nexus-agents/pull/3141) [`dcef3bd`](https://github.com/nexus-substrate/nexus-agents/commit/dcef3bd85fcd3e06fef8b19787571a2679d383ea) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - fix(security): warn on coercion of invalid security-mode env vars ([#3130](https://github.com/nexus-substrate/nexus-agents/issues/3130))

  `NEXUS_ACCESS_POLICY_MODE` (ClawGuard) and `NEXUS_REPUTATION_GATING` (reputation gating) previously **silently** coerced an invalid/typo'd value (e.g. `enfroce`) to their default, so a misconfigured `enforce` degraded to a less-strict mode with no signal. Both now route through a shared `resolveEnvMode` helper that emits a one-line `warn` on coercion of a non-empty invalid value (unset/empty stays silent — absence is normal), while keeping the never-throw, never-fatal coercion a security layer requires. Extracting the shared helper also guarantees the two flags coerce identically.

## 2.92.2

### Patch Changes

- [#3139](https://github.com/nexus-substrate/nexus-agents/pull/3139) [`82f6dfa`](https://github.com/nexus-substrate/nexus-agents/commit/82f6dfabe6a37207289971eaafff76df007de6d8) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - fix(consensus): error-policy short-circuit reports honest vote counts ([#3124](https://github.com/nexus-substrate/nexus-agents/issues/3124))

  A `consensus_vote` that short-circuits on an error policy (`fail_closed`, or the >50%-error hard floor) reported `voteCounts: {approve:0,reject:0,abstain:0}` and `approvalPercentage:0` even when most voters clearly approved — so a 6/7 approval with one timed-out voter looked like a flat rejection at 0%. `createPolicyFailedResult` now reports the TRUE breakdown of the responding (non-error) voters (e.g. `approve:6`, `approvalPercentage:100`) while the decision still fails closed, and the response carries a new `policyReason` field (e.g. `fail_closed: 1 voter(s) errored`) so callers don't mistake a policy short-circuit for a genuine rejection. The gate decision is unchanged — the contested question of whether `higher_order`/`unanimous` should _default_ to `reduce_denominator` is tracked separately (decided via consensus_vote, see [#3138](https://github.com/nexus-substrate/nexus-agents/issues/3138)).

## 2.92.1

### Patch Changes

- [#3136](https://github.com/nexus-substrate/nexus-agents/pull/3136) [`0f98fad`](https://github.com/nexus-substrate/nexus-agents/commit/0f98fad914c933a4c41efb5a75a383c3b5c8c313) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - fix(security): pr-reviewer reputation uses real account age ([#3133](https://github.com/nexus-substrate/nexus-agents/issues/3133))

  `pr-reviewer` now fetches the PR author's real account age (via the provider's `fetchUserMetadata` → `createdAt`) and feeds it into the reputation assessment, so the `new_account` signal actually fires in the PR-review path — the Phase-3 equivalent of [#3121](https://github.com/nexus-substrate/nexus-agents/issues/3121) for `issue_triage`. Best-effort: on fetch failure, an unparseable date, or an unexpected rejection, `accountAgeDays` is omitted (never fabricated) and the review never blocks. The review result's `trustAssessment` now also surfaces `suspiciousSignals` (parity with `issue_triage`). The reputation-gating orchestration was consolidated into `pr-reviewer-helpers` (`gatePRAuthor`, `assessPRReputation`, `fetchAccountAgeDays`). Closes [#3133](https://github.com/nexus-substrate/nexus-agents/issues/3133).

## 2.92.0

### Minor Changes

- [#3132](https://github.com/nexus-substrate/nexus-agents/pull/3132) [`96873d6`](https://github.com/nexus-substrate/nexus-agents/commit/96873d6ddad8b542a0bbe80994701605f459f2e7) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(security): gate pr_review posting on author reputation ([#3123](https://github.com/nexus-substrate/nexus-agents/issues/3123), epic [#3118](https://github.com/nexus-substrate/nexus-agents/issues/3118) Phase 5)

  `pr-reviewer` now assesses author reputation and feeds the reputation-reconciled tier into its policy gate, closing the PR-path equivalent of the [#828](https://github.com/nexus-substrate/nexus-agents/issues/828)/[#3106](https://github.com/nexus-substrate/nexus-agents/issues/3106) dead-end (the author was trust-classified but reputation was never gated). Reuses the global `NEXUS_REPUTATION_GATING` rollout flag (`off`/`audit`/`enforce`, default `audit`) and the `gateWithReputation` primitive from Phase 4, so behavior matches `issue_triage`. The review result now surfaces `trustAssessment` (`enforcedTrustTier`, `reputationReconciledTier`, `gatingMode`, `reputationScore`, `isSuspicious`) for observability, controlled by a new `enableReputation` config (default on). Account-age fetch for the PR path is deferred to a follow-up (PR signals used: author association + injection flags; absent signals are omitted, never fabricated). The maintainer allowlist (Tier 1) remains the escape hatch in every mode.

## 2.91.0

### Minor Changes

- [#3131](https://github.com/nexus-substrate/nexus-agents/pull/3131) [`bde542f`](https://github.com/nexus-substrate/nexus-agents/commit/bde542f020333b13b4185ba8c4da57cf8b3533b8) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(security): NEXUS_REPUTATION_GATING rollout flag for reputation tier gating ([#3122](https://github.com/nexus-substrate/nexus-agents/issues/3122), epic [#3118](https://github.com/nexus-substrate/nexus-agents/issues/3118) Phase 4)

  Reputation-based trust-tier demotion in `issue_triage` now follows the same `off`/`audit`/`enforce` rollout convention as `NEXUS_ACCESS_POLICY_MODE`, defaulting to **`audit`** (compute + log + surface the would-be demotion, but enforce the classifier tier). Operators graduate to `enforce` after the demotion rate is known. `gateWithReputation()` + `resolveReputationGatingMode()` are exported from `reputation-model`; the triage result surfaces `trustAssessment.enforcedTrustTier` (the tier actually gated on), `reputationReconciledTier` (the would-be demotion), and `gatingMode` for telemetry, and a suppressed demotion is logged. The maintainer allowlist (Tier 1) remains the false-positive escape hatch in every mode.

### Patch Changes

- [#3128](https://github.com/nexus-substrate/nexus-agents/pull/3128) [`f148ca4`](https://github.com/nexus-substrate/nexus-agents/commit/f148ca4b1a8a1df0bf9b761ed1bf4f9bfe42933e) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **fix(security):** issue-triage reputation uses the author's real account age ([#3121](https://github.com/nexus-substrate/nexus-agents/issues/3121), Phase 3 of epic [#3118](https://github.com/nexus-substrate/nexus-agents/issues/3118)).

  `estimateAccountAge()` was a stub that ignored its argument and always returned `365` — so every author looked like an established account and the `new_account` reputation signal **never fired**, leaving Phase 0's gating unable to act on account age (the same dead-signal class Phase 1 fixed in the firewall).

  `fetchIssueData` now fetches the author's real account creation date via the existing `provider.fetchUserMetadata()` and derives `accountAgeDays`, threaded into `assessAuthorReputation`. Best-effort: on fetch failure or an unparseable date the value is **omitted**, so the engine **skips** the `new_account` signal (per [#3106](https://github.com/nexus-substrate/nexus-agents/issues/3106)'s optional fields) — never fabricated, and triage never blocks on the lookup. The `estimateAccountAge`/`DEFAULT_ACCOUNT_AGE_DAYS` stub is deleted. Tests: `new_account` fires for a recent account, not for an established one, and is omitted on fetch failure.

## 2.90.0

### Minor Changes

- [#3125](https://github.com/nexus-substrate/nexus-agents/pull/3125) [`1198d0c`](https://github.com/nexus-substrate/nexus-agents/commit/1198d0c8371ac2483316bf13a7e46aff5bccbce5) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **feat(security):** contributor reputation now GATES issue-triage actions ([#3119](https://github.com/nexus-substrate/nexus-agents/issues/3119), Phase 0 of epic [#3118](https://github.com/nexus-substrate/nexus-agents/issues/3118)).

  `issue_triage` computed a `ReputationAssessment` per issue ([#828](https://github.com/nexus-substrate/nexus-agents/issues/828)) but passed only the trust-classifier tier to the policy gate — so the assessment surfaced in output metadata yet enforced nothing (a live dead end). It now reconciles the gate's input tier via a new `reconcileTrustTier(classifierTier, reputation)`:
  - **demotion-only** — reputation can only raise the tier (more restrictive), never lower it;
  - **Tier-1/allowlist wins** — an owner/allowlisted maintainer is never demoted by reputation;
  - **absent reputation → classifier tier** — no fabrication, no escalation on missing data;
  - **`reputationScore` stays advisory** — only `effectiveTrustTier` moves the gate.

  Effect: a suspicious author (e.g. injection-flagged content) is demoted and their tier-gated proposed actions (`ProposeLabels`/`DraftReply`) are marked `policyApproved: false`. Live by default (`enableReputation` defaults true); `issue_triage` emits proposals, not auto-actions. A graduated off/audit/enforce rollout flag for higher-stakes wiring lands in Phase 4 ([#3122](https://github.com/nexus-substrate/nexus-agents/issues/3122)). `reconcileTrustTier` is exported for reuse by the firewall ([#3106](https://github.com/nexus-substrate/nexus-agents/issues/3106)) and the Phase 2 consolidation ([#3120](https://github.com/nexus-substrate/nexus-agents/issues/3120)).

### Patch Changes

- [#3127](https://github.com/nexus-substrate/nexus-agents/pull/3127) [`dfc3089`](https://github.com/nexus-substrate/nexus-agents/commit/dfc3089737935e04e9738cce18db22b9958abe22) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **fix(security):** firewall reputation is honest, and its tier is enforced, not dropped ([#3106](https://github.com/nexus-substrate/nexus-agents/issues/3106), Phase 1 of epic [#3118](https://github.com/nexus-substrate/nexus-agents/issues/3118)).

  Two fixes to `HostileInputFirewall`'s reputation stage:
  1. **No fabrication.** `runReputation` fed the engine hardcoded benign metadata (`accountAgeDays:365`, `priorContributions:0`, `recentCommentCount:0`) — so the account/activity signals were always either off or falsely firing (`no_prior_contributions` tripped on every author). The engine's `GitHubUserMetadata` account/activity fields are now **optional**; absent data **skips** those signals (and their score bonuses, guarded against `NaN`) rather than fabricating a value. The firewall now supplies only what it actually knows from the event — `authorAssociation` + `injectionFlags` — so its reputation reflects injection/authority signals honestly until real fetching lands (Phase 3, [#3121](https://github.com/nexus-substrate/nexus-agents/issues/3121)).
  2. **Tier enforced, not dropped.** The computed `effectiveTrustTier` was discarded — `FirewallResult`/ATL used only the classifier tier. `FirewallResult` now carries `effectiveTrustTier = reconcileTrustTier(classifierTier, reputation)` (the shared [#3119](https://github.com/nexus-substrate/nexus-agents/issues/3119) helper: demotion-only, Tier-1/allowlist wins, absent→classifier), and the ATL is labelled with it.

  `issue_triage` is unaffected (it always supplies real account data). Tests: engine no-fabrication + no-NaN; firewall demotes on a hostile signal and surfaces/labels the enforced tier; the `no_prior_contributions` fabrication no longer fires for an unknown-activity author.

## 2.89.2

### Patch Changes

- [#3113](https://github.com/nexus-substrate/nexus-agents/pull/3113) [`d115a69`](https://github.com/nexus-substrate/nexus-agents/commit/d115a698cc25041ea39b26291b27186d99f93627) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **fix(routing):** constrain LinUCB selection to the candidate set — fail-closed category overrides can no longer be bypassed ([#3111](https://github.com/nexus-substrate/nexus-agents/issues/3111)).

  `runLinUCBStage` returned whatever `LinUCBBandit.select()` picked, but `select()` ranks over **all** registered arms and ignored the already-filtered candidate list (`topsisRanking`). So a fail-closed category override (e.g. `security_review → [codex]`) or a quality filter could be silently defeated when the bandit's learned preference favored an excluded CLI — routing a security task to a CLI the policy had removed. The stage now falls back to the TOPSIS-best candidate when the bandit's pick is not in the candidate set. Learning attribution is unaffected: `recordOutcome` keys the reward update on the routed `cliName`. Found via a proactive security audit.

- [#3115](https://github.com/nexus-substrate/nexus-agents/pull/3115) [`f899665`](https://github.com/nexus-substrate/nexus-agents/commit/f8996658da061c750913ec54b28e2c98ea5514e8) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **fix(memory):** reconcile Markdown sidecars on prune/expire — no more orphaned-file disk growth ([#3112](https://github.com/nexus-substrate/nexus-agents/issues/3112)).

  Only the explicit `delete(key)` path removed a memory's `.md` sidecar; `prune`, `expireAll`, and auto-expire deleted SQLite rows but left the Markdown files behind. With `MemoryDecayManager` running prune on a timer, the markdown dir grew without bound. Added `MemoryMarkdownHelper.reconcile(liveKeys)` (forward-maps every live key to its filename and removes any `.md` not in that set) and call it from the backend's `prune`/`expireAll`, covering every row-deletion path uniformly. Best-effort, never throws. Found via a proactive audit.

## 2.89.1

### Patch Changes

- [#3104](https://github.com/nexus-substrate/nexus-agents/pull/3104) [`ba17cb5`](https://github.com/nexus-substrate/nexus-agents/commit/ba17cb5dc06f4c31f6707a576ab28f4f329ee130) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **docs(guides):** parallel-agent git-worktree isolation guide + reference hooks ([#3060](https://github.com/nexus-substrate/nexus-agents/issues/3060)).

  Adds `docs/guides/PARALLEL_AGENT_WORKTREES.md` documenting how to run multiple Claude Code `general-purpose` agents in parallel against one checkout without git/build/test contention, via `isolation: "worktree"` + custom `WorktreeCreate`/`WorktreeRemove` hooks. Captures the **empirical hook stdin contract** (which is undocumented upstream: the hook receives `session_id`/`cwd`/`name` and must mint the worktree path + base branch itself — it does NOT receive `worktree_path`/`base_branch`/`worktree_name`) and the multi-worktree gotchas (Playwright `reuseExistingServer`, `NODE_ENV` bundle-size skew, inherited test artifacts).

  Ships dry-run-verified reference hooks `scripts/hooks/worktree-create.sh` + `worktree-remove.sh` (bash/git/jq; detached worktrees under `/tmp/claude-worktrees/<session>-<agent>/`, session-prefix teardown, opportunistic age sweep scoped to the worktree root). Indexed in `docs/README.md`. [#3060](https://github.com/nexus-substrate/nexus-agents/issues/3060)'s per-agent-cleanup + random-preview-port suggestions remain tracked there.

- [#3108](https://github.com/nexus-substrate/nexus-agents/pull/3108) [`117c607`](https://github.com/nexus-substrate/nexus-agents/commit/117c607e2ac897ec601754c5b42bd4b540f8c6c7) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **docs(skills):** add a branch-safety guard to the `pre-push-parity` skill ([#3072](https://github.com/nexus-substrate/nexus-agents/issues/3072)).

  The harness can silently switch an agent's working branch mid-session — a long run can end up on `main` carrying another branch's uncommitted edits, risking lost work or an accidental push to `main`. The skill's pre-push one-shot now gates on `git branch --show-current` being a non-empty, non-`main`/`master` branch (`PARITY OK (<branch>)`), and a new "Branch safety" section documents the STOP-and-recover habit. This is the in-repo agent-side mitigation; the underlying harness branch-switch bug ([#3072](https://github.com/nexus-substrate/nexus-agents/issues/3072)) is upstream.

- [#3102](https://github.com/nexus-substrate/nexus-agents/pull/3102) [`5439757`](https://github.com/nexus-substrate/nexus-agents/commit/5439757ef8315898a4c511e94594abe30c5c6fd5) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **feat(skills):** codify the blind pre-merge-review pass in `reviewing-code` ([#3074](https://github.com/nexus-substrate/nexus-agents/issues/3074)).

  Adds a "Pre-merge blind-reviewer pass" section to the existing `reviewing-code` skill (extended, not a new skill — per a 3/3 `consensus_vote` on anti-sprawl): after local gates are green and before merging, spawn a fresh `code-reviewer`/`Explore` subagent on the diff, blind to the author's reasoning, returning BLOCKER/WARN/NIT findings that map onto the skill's existing Critical/Important/Suggestion categories. The pattern caught a real merge-blocking bug on 6 of 22 PRs (27%) in a prior autonomous session.

  The section references the existing five-axis framework + 4-point Verification Gate (no restatement) and primes the reviewer on bug-shape _classes_ (accessibility/semantics drift, test brittleness, double-emitted output, layout/state clobbering, contract drift) rather than a frozen list, to avoid overfitting. Discoverability added via "pre-merge review" / "blind reviewer" / "before merge" trigger keywords. [#3074](https://github.com/nexus-substrate/nexus-agents/issues/3074) proposals [#2](https://github.com/nexus-substrate/nexus-agents/issues/2) (ship-velocity signal) and [#3](https://github.com/nexus-substrate/nexus-agents/issues/3) (failure-mode memory pre-loading) remain tracked in that issue.

- [#3107](https://github.com/nexus-substrate/nexus-agents/pull/3107) [`5add19e`](https://github.com/nexus-substrate/nexus-agents/commit/5add19e4644c40b78a0c296610aa8dd41e3611f7) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **fix(adapters):** `ResilientAdapter.stream()` errors instead of silently yielding empty when no adapter is available ([#3105](https://github.com/nexus-substrate/nexus-agents/issues/3105)).

  `stream()` did a bare `return` when adapter detection produced nothing, emitting a clean empty stream — while the sibling `complete()` returns `err(ModelError('No model adapter available'))` for the same condition. The `streamWithFallback` consumer only falls back on a thrown error, so a silent-empty stream masked "no adapter available" as a legitimately-empty completion. `stream()` now throws `ModelError` to match `complete()`'s contract. (`countTokens()` returning `0` is left as-is: no error channel, and a 0 estimate is benign.)

  Found via a proactive security/QA audit.

- [#3110](https://github.com/nexus-substrate/nexus-agents/pull/3110) [`ee6fceb`](https://github.com/nexus-substrate/nexus-agents/commit/ee6fceb0aaf22f7ac18b7c92c27f4d49595b3369) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **fix(security):** redact ALL secret matches in tool output, not just the first ([#3109](https://github.com/nexus-substrate/nexus-agents/issues/3109)).

  `sanitizeOutput` (secure-handler) used non-global `SECRET_PATTERNS` with a `pattern.test()`-then-`replace()` loop, so `String.replace` substituted only the **first** match per pattern. Tool output (or a thrown error's text) containing two or more secrets of the same shape — e.g. a rotated old+new API key, or two `Bearer` tokens in one stack trace — leaked every secret after the first to the MCP caller. Patterns are now global and the redaction replaces unconditionally (dropping the `test()` guard, which would advance a global regex's `lastIndex` and skip earlier matches). Found via a proactive security audit.

## 2.89.0

### Minor Changes

- [#3094](https://github.com/nexus-substrate/nexus-agents/pull/3094) [`c74eb67`](https://github.com/nexus-substrate/nexus-agents/commit/c74eb67c114cc6781db5724be9e41be6854029b9) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **feat(jobs):** dual-read job results from StructuredTaskState ([#3090](https://github.com/nexus-substrate/nexus-agents/issues/3090), reader half of the [#3069](https://github.com/nexus-substrate/nexus-agents/issues/3069) sidecar→Stage-2 migration).

  `get_job_result` can now resolve an async job's result from the canonical Stage-2 `StructuredTaskState` log instead of the Stage-1 sidecar, via a new `mcp/jobs/task-state-source.ts` adapter. Flag-gated and **OFF by default** (`NEXUS_JOB_RESULT_SOURCE=task_state` to opt in), so production behavior is unchanged until the writer half ([#3091](https://github.com/nexus-substrate/nexus-agents/issues/3091)) makes `jobId === taskId` real — this is the strangler-fig reader step.

  Supporting schema additions (backward-compatible):
  - `TaskStageSchema` gains a terminal `'failed'` stage (distinct from the recoverable `'blocked'`), so async-mode writers can record a failed run in task-state.
  - `StructuredTaskState` gains an optional `createdAt`; the reducer backfills it from the `init` entry's ts and never mutates it (job-result readers need the original creation time, which `updatedAt` can't supply once a transition is recorded).

  Mapping contract (consensus-voted under [#3069](https://github.com/nexus-substrate/nexus-agents/issues/3069), documented on [#3090](https://github.com/nexus-substrate/nexus-agents/issues/3090)): `cancellation`→`cancelled`; stage `complete`→`complete`; stage `failed`→`failed`; else `pending`. No behavior change for existing logs; `version` monotonicity preserved.

- [#3095](https://github.com/nexus-substrate/nexus-agents/pull/3095) [`7ce7227`](https://github.com/nexus-substrate/nexus-agents/commit/7ce72273b32f8b071eb48a38a9884baada54fad5) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **feat(orchestrate):** async-mode writes results to StructuredTaskState ([#3091](https://github.com/nexus-substrate/nexus-agents/issues/3091), writer half of the [#3069](https://github.com/nexus-substrate/nexus-agents/issues/3069) sidecar→Stage-2 migration).

  `orchestrate({ mode: 'async' })` now records its result into the canonical Stage-2 task-state log, so `get_job_result` resolves directly from it once `NEXUS_JOB_RESULT_SOURCE=task_state` (default still sidecar — see [#3094](https://github.com/nexus-substrate/nexus-agents/issues/3094)). Completes the reader+writer pair: the dual-read is now activatable end-to-end.

  What changed:
  - **`jobId === taskId`.** Async dispatch now mints the jobId via the orchestration's own `generateTaskId()` and threads it through the pipeline, so the job's result lands in the task-state log keyed identically. **User-visible:** the async-mode `jobId` format changes from `job-orch-<uuid>` to `orch-<ts>-<rand>`. Callers that treat the jobId as an opaque token (the documented contract) are unaffected; only code that parsed the `job-orch-` prefix would need updating.
  - **Terminal failures record stage `'failed'`** (the new stage from [#3094](https://github.com/nexus-substrate/nexus-agents/issues/3094)) instead of the recoverable `'blocked'`, at both `executeOrchestration` failure sites. This applies to sync orchestrate too — its task-state log now shows `'failed'` on a hard failure (observability only; nothing gates on the prior `'blocked'`). The blocker entry (carrying the message) is unchanged.
  - On completion the background run mirrors the result into task-state via `appendResult`; throws escaping the pipeline record a `'failed'` terminal stage so pollers never see a stuck `'pending'`.

  Fast-path (simple) async tasks skip task-state recording and remain resolvable via the sidecar fallback. Deferred: `run_workflow`/`consensus_vote` writers ([#3092](https://github.com/nexus-substrate/nexus-agents/issues/3092)), `list_jobs` dual-read ([#3090](https://github.com/nexus-substrate/nexus-agents/issues/3090)), sidecar deletion ([#3093](https://github.com/nexus-substrate/nexus-agents/issues/3093)).

### Patch Changes

- [#3099](https://github.com/nexus-substrate/nexus-agents/pull/3099) [`1f678b5`](https://github.com/nexus-substrate/nexus-agents/commit/1f678b53374d2a35c2e049334d7fc629d1674bcb) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **feat(skills):** add `pre-push-parity` skill ([#3073](https://github.com/nexus-substrate/nexus-agents/issues/3073)).

  Agents kept discovering CI-only checks one failure at a time — push, wait ~3 min, parse logs, fix, repeat — for gates not in the local quality gate (the [#3073](https://github.com/nexus-substrate/nexus-agents/issues/3073) incident: `ruff format --check` and a `gitleaks` false-positive). CI is a strict superset of any local gate; this skill runs that superset locally first.

  The skill (1) enumerates the repo's CI checks from `.github/workflows/`, (2) runs the locally-runnable subset in CI's order via a fail-fast one-shot (typecheck, lint, test, build, changeset presence, producer/consumer [#3024](https://github.com/nexus-substrate/nexus-agents/issues/3024), model-drift, commitlint, clean-tree, gitleaks), (3) names the checks that _can't_ run locally (CodeQL, Scorecard, Semgrep, Socket, docker consolidation) as residual risk, and (4) prompts writing a `ci-vs-local-gate-*` memory the first time in a repo so the delta isn't rediscovered. Includes the gitleaks test-fixture hygiene tip.

  Brings the registered skill count to 32 (index + governance docs regenerated).

- [#3097](https://github.com/nexus-substrate/nexus-agents/pull/3097) [`a8cd953`](https://github.com/nexus-substrate/nexus-agents/commit/a8cd95300847c69d26438a59d4cda8a8317cae28) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **fix(ci-health):** bound telemetry log growth + surface corrupted lines ([#3089](https://github.com/nexus-substrate/nexus-agents/issues/3089)).

  The CI-health event log (`ci-health-log.ts`, shipped in [#3084](https://github.com/nexus-substrate/nexus-agents/issues/3084)) had two reliability gaps that this fixes:
  - **Unbounded growth.** `appendCiHealthEvent` runs on every `ci_health_check`, and `getCiOutageFrequency` reads the whole file each call — so an autonomous polling loop grew the log (and every read) without limit. `pruneOlderThan` existed but was never wired, and being age-based it can't bound a burst of _recent_ events anyway. Appends now opportunistically cap the file to the most recent lines that fit within `NEXUS_CI_HEALTH_MAX_BYTES` (default 2 MiB), gated by a cheap `statSync` so the O(n) rewrite only runs when the cap is actually exceeded. Best-effort — telemetry never blocks or throws.
  - **Silent corruption.** `readAllEvents` dropped unparseable lines with no signal, so a partial write or tampered line made aggregates under-count invisibly. It now logs a `warn` with the skipped-line count.

- [#3098](https://github.com/nexus-substrate/nexus-agents/pull/3098) [`0b5291b`](https://github.com/nexus-substrate/nexus-agents/commit/0b5291b194a61cfbdb062c8443e85c2fde16d42f) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **chore(tooling):** `git:cleanup` can now prune squash-merged branches ([#3096](https://github.com/nexus-substrate/nexus-agents/issues/3096)).

  `git branch --merged` can't detect squash-merged branches — a squash merge creates a new commit on main, so the branch's own commits are never ancestors of main and the branch is never seen as merged. With the repo squash-merging every PR, ~64 stale local branches had accumulated that `git:cleanup` reported as "no merged branches."

  New opt-in `--include-squash-merged` mode (npm: `git:cleanup:branches` / `git:cleanup:branches:dry`) asks GitHub for each branch's PR state via `gh`. A branch is force-deleted **only** when it has a MERGED PR, **no** open PR, and its local tip exactly equals the merged PR's head SHA — so no unpushed or extra local commits are ever lost. Dry-run supported; degrades gracefully when `gh` is absent.

## 2.88.1

### Patch Changes

- [#3087](https://github.com/nexus-substrate/nexus-agents/pull/3087) [`65e5f01`](https://github.com/nexus-substrate/nexus-agents/commit/65e5f01d6c96ebfa591a4eb47b94297c77efa36e) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **security(deps):** bump `brace-expansion` to ≥5.0.6 to patch CVE-2026-45149 (GHSA-jxxr-4gwj-5jf2).

  Scorecard alert [#85](https://github.com/nexus-substrate/nexus-agents/issues/85) (severity error, CVSS 6.5) flagged the existing pnpm override `brace-expansion@>=4.0.0 <5.0.5: '>=5.0.5'` as still permitting the vulnerable `5.0.5`. The CVE is a DoS — `max` option protection is defeated by large numeric ranges like `{1..10000000}`, generating all 10M intermediate elements (~505 MB allocation) before the cap is applied.

  Override tightened to `brace-expansion@>=4.0.0 <5.0.6: '>=5.0.6'`. Verified: `pnpm install` removes all `5.0.5` entries from the lockfile; only `5.0.6` remains.

  No app code change required — pnpm override forces the transitive resolution. Patch bump appropriate.

## 2.88.0

### Minor Changes

- [#3085](https://github.com/nexus-substrate/nexus-agents/pull/3085) [`6f725f3`](https://github.com/nexus-substrate/nexus-agents/commit/6f725f3563a2795e91d0f412f2db91b5e9eeaa91) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **feat(mcp):** CI-outage frequency telemetry — log + query primitive ([#3084](https://github.com/nexus-substrate/nexus-agents/issues/3084) / closes [#3076](https://github.com/nexus-substrate/nexus-agents/issues/3076) primitive [#4](https://github.com/nexus-substrate/nexus-agents/issues/4)).

  The final primitive from [#3076](https://github.com/nexus-substrate/nexus-agents/issues/3076). Every `ci_health_check` call now appends one record to `<NEXUS_DATA_DIR>/ci-health/events.jsonl`, and `getCiOutageFrequency()` returns a rolling-N-day aggregate so callers (primarily `improvement_review`) can surface frequency-based signals.

  ## Surface
  - **`appendCiHealthEvent({ status, signals, repo? })`** — best-effort write. Failures are logged but never thrown; the diagnostic surface (`ci_health_check`) must not block on telemetry. Wired into `ci_health_check` itself — no caller-side opt-in needed.
  - **`getCiOutageFrequency(days = 30)`** — returns `{ events, outages, degraded, degradedRatio, windowDays, windowStart }`. `degradedRatio = (outages + degraded) / events`; both states are operator-relevant.
  - **`pruneOlderThan(keepDays)`** — idempotent log compaction. Periodic-caller concern; not on every append.

  ## Record shape

  ```ts
  {
    v: 1,
    ts: '<iso>',
    status: 'healthy' | 'degraded' | 'outage' | 'unknown',
    repo?: 'owner/name',
    signals: [{ source, status, evidence }, ...],
  }
  ```

  ## Storage

  Per-repo under `<NEXUS_DATA_DIR>/ci-health/` (`ci-health` added to `PER_REPO_SUBDIRS`). Outages reported via `ci_health_check({ repo })` are repo-correlated; a wedge on repo A's queue doesn't predict repo B's health, so cross-repo aggregation would be misleading.

  ## Tests (15 new cases in `ci-health-log.test.ts`)
  - Append: line shape, ordering preserved, optional `repo` field round-trips.
  - Query: empty log returns zeros; status discrimination; window exclusion (40-day-old events ignored from 30-day window); custom window; non-positive `days` throws.
  - Prune: no-op when nothing old; correctly drops + reports counts.
  - `eventFromCheck` adapter: optional repo handling, signal-field stripping.
  - Integration: malformed JSON lines tolerated (skipped, not fatal) — pre-existing corruption shouldn't break new queries.

  ## What this is NOT (yet)
  - **`improvement_review` integration** — surface a frequency-threshold signal. Recommended next iteration but separate concern (touches `improvement_review`'s threshold table); deferring to the follow-up.
  - **Cross-session anonymized aggregation** — would need an opt-in upload surface; design discussion explicitly out of scope per [#3084](https://github.com/nexus-substrate/nexus-agents/issues/3084).
  - **Auto-polling `ci_health_check`** — only writes happen on explicit caller invocation, by design. False-positive outage signals from network blips would pollute the telemetry.

  ## Closes

  Closes [#3084](https://github.com/nexus-substrate/nexus-agents/issues/3084) (the scoped primitive [#4](https://github.com/nexus-substrate/nexus-agents/issues/4) issue). [#3076](https://github.com/nexus-substrate/nexus-agents/issues/3076) is already closed.

## 2.87.1

### Patch Changes

- [#3082](https://github.com/nexus-substrate/nexus-agents/pull/3082) [`f872e82`](https://github.com/nexus-substrate/nexus-agents/commit/f872e829ca98a6d04ce362e3b29ca15f5c7e1af3) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **docs(rules):** admin-merge clause for CI outages in `.rules/autonomous.md` ([#3076](https://github.com/nexus-substrate/nexus-agents/issues/3076) primitive [#3](https://github.com/nexus-substrate/nexus-agents/issues/3)).

  Follow-up to PR [#3078](https://github.com/nexus-substrate/nexus-agents/issues/3078) (primitive [#1](https://github.com/nexus-substrate/nexus-agents/issues/1), `ci_health_check`) and PR [#3080](https://github.com/nexus-substrate/nexus-agents/issues/3080) (primitive [#2](https://github.com/nexus-substrate/nexus-agents/issues/2), codified wait-pattern). This addition codifies WHEN admin-merge is acceptable during a CI infrastructure outage — five clauses that ALL must hold.

  ## Why

  During the 2026-05-26 outage ([#3070](https://github.com/nexus-substrate/nexus-agents/issues/3070)), I admin-merged 7 PRs once the local quality gates were green and the CI failures were confirmed to be infrastructure-wide (not per-PR). The pattern worked but wasn't codified — the next agent session would have to re-derive when admin-merge is appropriate vs. when to keep waiting. This change makes the bypass conditions explicit so the audit chain stays clean.

  ## What the rule says

  `gh pr merge --admin` is allowed during outages ONLY when all five clauses hold:
  1. `ci_health_check` returned `outage` or `degraded` AND the failure is confirmed global.
  2. Local quality gates green on the branch.
  3. Change is mechanical or well-tested (no untested new features).
  4. An outage tracking issue exists with a link to the PR.
  5. PR was waiting >30 min with no progress, OR crosses a release boundary.

  Plus: state the bypass reason in the merge commit body, comment on the outage issue. Audit chain over convenience.

  ## Closes

  Partial close on [#3076](https://github.com/nexus-substrate/nexus-agents/issues/3076) — primitive [#3](https://github.com/nexus-substrate/nexus-agents/issues/3) of 4 shipped. Primitive [#4](https://github.com/nexus-substrate/nexus-agents/issues/4) (outage frequency telemetry via `outcome_store` tagging) remains.

- [#3080](https://github.com/nexus-substrate/nexus-agents/pull/3080) [`cfce278`](https://github.com/nexus-substrate/nexus-agents/commit/cfce2780dd9833085a37058094fa2dee4247c243) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **docs(rules):** codified CI-outage wait-pattern in `.rules/autonomous.md` ([#3076](https://github.com/nexus-substrate/nexus-agents/issues/3076) primitive [#2](https://github.com/nexus-substrate/nexus-agents/issues/2)).

  Follow-up to PR [#3078](https://github.com/nexus-substrate/nexus-agents/issues/3078) (which shipped `ci_health_check` as [#3076](https://github.com/nexus-substrate/nexus-agents/issues/3076) primitive [#1](https://github.com/nexus-substrate/nexus-agents/issues/1)). This change codifies the behavior — when CI fires unexplained / cross-PR failures (status checks not queuing, `workflow_dispatch` HTTP 5xx, codeload 404), the agent should diagnose with `ci_health_check` BEFORE retriggering, and pivot to non-CI work during confirmed outages.

  ## Why

  The failure mode this addresses: during the 2026-05-26 outage ([#3070](https://github.com/nexus-substrate/nexus-agents/issues/3070)), my session spent 90+ min retriggering via close+reopen and empty-commit pushes before recognizing the outage was global — every retrigger was wasted cycles because webhook delivery itself was broken. The user's [#3076](https://github.com/nexus-substrate/nexus-agents/issues/3076) documented the same pattern on a parallel session.

  ## What the rule says

  When CI exhibits outage symptoms:
  1. **Diagnose first** — `ci_health_check` or manual status-page + recent-runs check.
  2. **When `status === 'outage'`**: pause the PR (no retriggers), pivot to non-CI work (docs, design, local-test verification), file an outage tracking issue, schedule a 30-min wakeup.
  3. **When status resolves to `healthy`**: push a `chore(ci): kick after recovery` commit and resume.
  4. **CI outages are NOT a hard stop** — the autonomous directive's "keep working" clause covers "work elsewhere and come back."

  ## Closes

  Partial close on [#3076](https://github.com/nexus-substrate/nexus-agents/issues/3076) — primitive [#2](https://github.com/nexus-substrate/nexus-agents/issues/2) (codified wait-pattern) shipped. Primitives [#3](https://github.com/nexus-substrate/nexus-agents/issues/3) (CI-down merge clause) and [#4](https://github.com/nexus-substrate/nexus-agents/issues/4) (outage frequency telemetry) remain open.

## 2.87.0

### Minor Changes

- [#3078](https://github.com/nexus-substrate/nexus-agents/pull/3078) [`5740047`](https://github.com/nexus-substrate/nexus-agents/commit/5740047cdb682213decc22cbd3f8b8d4dff5fb39) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **feat(mcp):** `ci_health_check` MCP tool — agent-readable signal for CI infrastructure outages ([#3076](https://github.com/nexus-substrate/nexus-agents/issues/3076)).

  Read-only diagnostic for "is CI working right now?" Composes two signals an autonomous agent would otherwise have to derive by grepping failed-CI logs:
  1. **GitHub status page** (`https://www.githubstatus.com/api/v2/components.json`) — reports per-component health. The `GitHub Actions` component flips to `degraded_performance` / `partial_outage` / `major_outage` during the kind of incident [#3076](https://github.com/nexus-substrate/nexus-agents/issues/3076) describes.
  2. **Recent-runs activity window** — query the configured repo's `actions/runs` endpoint over a short window (default 30 min, configurable 5-180). When the status page says "operational" but no runs have completed for the repo in that window despite known recent pushes, the local queue is wedged (exactly the failure mode hit on 2026-05-26 — global status was operational but our org's queue was dead for >90 min, per [#3070](https://github.com/nexus-substrate/nexus-agents/issues/3070)).

  ## Surface

  ```ts
  ci_health_check({
    repo?: 'owner/name',           // optional — composes the repo-activity signal
    activityWindowMinutes?: 30,    // 5-180, default 30
  }) => {
    status: 'healthy' | 'degraded' | 'outage' | 'unknown',
    checkedAt: '<iso>',
    signals: [
      { source: 'github-status', status, evidence: 'GitHub Actions component reports: operational' },
      { source: 'repo-activity-window', status, evidence: '14 workflow run(s) in last 30 min on ...' },
    ],
  }
  ```

  ## Combined verdict — pessimistic

  If the status page reports outage, return outage. If the status page is healthy but the local repo has been silent for the activity window, return degraded (operator can still act, but with the warning). Unknown signals are ignored unless every signal is unknown.

  ## Annotations
  - `readOnlyHint: true` — no state mutated
  - `idempotentHint: true` — same inputs return the same shape
  - `openWorldHint: true` — outbound network to githubstatus.com + GitHub API (already accessed by other tools)

  ## Tests

  18 cases in `ci-health-check-tool.test.ts`:
  - Schema: required-form validation (`owner/repo`), bounds on activity window, optional fields.
  - Per-signal: status-page operational/degraded/outage/missing-component/fetch-fail.
  - Combined: pessimistic combination (healthy status + wedged repo → degraded), all-healthy → healthy, runs-outside-window ignored.
  - Edge: unknown when only the repo signal fails; ISO timestamp shape; validation error envelope for malformed repo.

  ## What this is NOT
  - **Not a workaround for outages.** It's a _signal_ for the agent to stop wedging on auto-merge waits during an outage, NOT a substitute for CI. When `outage` returns, the right behavior is "pause this PR, work elsewhere, retrigger in 30 min" — exactly the [#3076](https://github.com/nexus-substrate/nexus-agents/issues/3076)-proposed pattern.
  - **Not telemetry.** Single-shot diagnostic — does not persist to the outcome store. Telemetry primitive ([#3076](https://github.com/nexus-substrate/nexus-agents/issues/3076) ask [#4](https://github.com/nexus-substrate/nexus-agents/issues/4)) is separate work, not included here.

  ## Closes

  Partial close on [#3076](https://github.com/nexus-substrate/nexus-agents/issues/3076) — primitive [#1](https://github.com/nexus-substrate/nexus-agents/issues/1) (`ci_health_check`) shipped. Primitives [#2](https://github.com/nexus-substrate/nexus-agents/issues/2) (codified wait-don't-retrigger pattern), [#3](https://github.com/nexus-substrate/nexus-agents/issues/3) (CI-down merge clause), [#4](https://github.com/nexus-substrate/nexus-agents/issues/4) (outage frequency telemetry) remain open as follow-ups.

### Patch Changes

- [#3079](https://github.com/nexus-substrate/nexus-agents/pull/3079) [`908fcc3`](https://github.com/nexus-substrate/nexus-agents/commit/908fcc367ea84e94e007907ee069c49c1f7a93e2) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **chore(scripts):** `scripts/git-housekeeping.sh` + `pnpm git:cleanup` for [#3062](https://github.com/nexus-substrate/nexus-agents/issues/3062) recurring git-gc warning.

  The recurring `warning: There are too many unreachable loose objects` was firing on every `git commit` / `git push` because:
  1. Auto-gc bails on prune (objects "too young") and writes `.git/gc.log`.
  2. While `.git/gc.log` exists, git refuses to retry auto-gc and re-prints the warning on every subsequent invocation.
  3. Heavy branch churn + TypeDoc HTML regen on every release + changeset deletions keep producing fresh unreachable objects faster than the default 2-week prune window can clear.

  Ships Option C from the [#3062 RCA](https://github.com/nexus-substrate/nexus-agents/issues/3062): tighter per-repo config + script for periodic runs.

  ## What the script does
  1. **Per-repo gc config** (does NOT touch global): `gc.pruneExpire=7.days.ago`, `gc.reflogExpire=30.days`, `gc.reflogExpireUnreachable=7.days`.
  2. **Wipes `.git/gc.log`** so auto-gc retries on next invocation.
  3. **Deletes merged branches** (uses `-d` not `-D`; filters worktree-checked-out branches).
  4. **Runs `git gc --prune=now`**.
  5. **Reports `du -sh .git/` before/after**.

  ## Usage

  ```bash
  pnpm git:cleanup        # apply config + delete merged + prune
  pnpm git:cleanup:dry    # show what would happen, no changes
  ./scripts/git-housekeeping.sh --aggressive   # also pass --aggressive to gc
  ```

  ## Validation on this repo

  Initial run cleared 47 merged branches (including 40+ stale `worktree-agent-*` branches from Claude Code parallel-agent sessions) and shrank `.git/` from 92M to 84M. Repeat runs are idempotent.

  ## Also ships
  - `.gitignore` entries for `docs/research/timeout-mismatch-v1.md` + `docs/research/nexus-agents-multi-harness-alignment-audit.md` — per-machine telemetry files first removed in commit `4bf99884dd` that keep getting swept in by `git add docs/`. Pinned by name so legitimate `docs/research/` files stay tracked.
  - New canonical doc at `docs/ops/git-housekeeping.md`.

  ## Closes

  Closes [#3062](https://github.com/nexus-substrate/nexus-agents/issues/3062).

## 2.86.0

### Minor Changes

- [#3067](https://github.com/nexus-substrate/nexus-agents/pull/3067) [`da9f876`](https://github.com/nexus-substrate/nexus-agents/commit/da9f876ffe9df5197ce189744ee34ea011745521) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **feat(jobs):** `cancel_job` MCP tool ([#3042](https://github.com/nexus-substrate/nexus-agents/issues/3042) Stage 1b / epic [#2631](https://github.com/nexus-substrate/nexus-agents/issues/2631)).

  Cancellation tool for the async-mode pattern. Returns to close the Stage-1 follow-up reserved under [#3042](https://github.com/nexus-substrate/nexus-agents/issues/3042) (the cancel piece deferred when [#3048](https://github.com/nexus-substrate/nexus-agents/issues/3048) shipped the protocol skeleton).

  ## Surface

  `cancel_job({ jobId, reason? })` — returns a discriminated `CancelJobResponse` with one of four outcomes:
  - **`cancelled`** — the job was `pending` and is now `cancelled`. The dispatching process's in-flight `AbortController` (already wired in Stages 1/3/4) is the actual stop signal for same-process work; this tool writes the durable cancellation record so cross-session pollers can observe.
  - **`already_complete`** — job is already `complete` / `failed`. The terminal record is preserved (Security flag from the [#3041](https://github.com/nexus-substrate/nexus-agents/issues/3041) vote: cancel-after-complete must NOT rewrite history). The original result payload + error context are intact.
  - **`already_cancelled`** — second + cancellation against the same jobId is a no-op. Idempotent for safe retry.
  - **`unknown_job`** — no record found for the jobId. Sidecar file missing or unreadable.

  ## What this tool does NOT do
  - **Cross-process abort.** Per-process AbortControllers can only signal what they own. For a multi-process deployment, the durable cancellation record is observable via `get_job_result` and `list_jobs`, but the worker process needs to poll for it (future work; not part of this PR).
  - **Result deletion.** Once a job is `complete`, the result payload stays in the sidecar — cancel doesn't redact it.

  ## Lifecycle invariants (next-contributor flags)
  1. **`already_complete` MUST NOT overwrite the terminal record.** Security flag from [#3041](https://github.com/nexus-substrate/nexus-agents/issues/3041) vote — if a future contributor "simplifies" the handler to always call `writeJobCancelled`, the post-complete cancel-then-poll race would erase the original result. Test covers this.
  2. **`cancelled` writes the same JSON shape as other terminal records.** `JobResult.status === 'cancelled'` lets clients treat it as a terminal state (no further polling needed).

  ## What's still open under the umbrella
  - **Stage 1c — `idempotencyKey`** (sha256 replay-safe re-invocation). Final piece of [#3042](https://github.com/nexus-substrate/nexus-agents/issues/3042).
  - **Cross-process cancel propagation** — workers polling `get_job_result` mid-execution to honor cancellation. Future work, separate issue.
  - **Sidecar→Stage 2 schema migration** — moves async-mode writers to `appendResult` / `appendCancellation` from [#3061](https://github.com/nexus-substrate/nexus-agents/issues/3061). Separate small PR.

  ## Tests
  - 4 schema cases (jobId required, reason optional + length-bounded).
  - 3 store-integration cases (writeJobCancelled visible after read, preserves createdAt, omits error when reason undefined).
  - 5 outcome cases (cancel pending → cancelled; cancel-after-complete preserves result; cancel-after-fail preserves error; second cancel = already_cancelled; unknown_job).
  - Existing tool-count assertions bumped 39 → 40 (`EXPECTED_TOOL_COUNT`, `TOOL_ANNOTATIONS`, `REGISTERED_TOOLS`).
  - 150 targeted tests pass (`src/mcp/jobs/`, `src/mcp/tools/cancel-job-tool.test.ts`, `index.test.ts`, `tool-annotations.test.ts`, `cli-server-tools.test.ts`); `tsc` + `eslint` clean.

  ## Note on tool count

  This PR adds `cancel_job` as the 40th tool, parallel to [#3066](https://github.com/nexus-substrate/nexus-agents/issues/3066) (Stage 5) which adds `list_jobs` as ALSO the 40th. Whichever merges first claims [#40](https://github.com/nexus-substrate/nexus-agents/issues/40); the other rebases to [#41](https://github.com/nexus-substrate/nexus-agents/issues/41). The count assertions in tests will need a rebase pass from the loser.

## 2.85.0

### Minor Changes

- [#3075](https://github.com/nexus-substrate/nexus-agents/pull/3075) [`1a7cf15`](https://github.com/nexus-substrate/nexus-agents/commit/1a7cf15f44906294bfc6662e43db5a31914b8652) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **feat(jobs):** `idempotencyKey` for async-mode dispatch ([#3042](https://github.com/nexus-substrate/nexus-agents/issues/3042) Stage 1c / epic [#2631](https://github.com/nexus-substrate/nexus-agents/issues/2631)).

  Final piece of [#3042](https://github.com/nexus-substrate/nexus-agents/issues/3042). The three async-mode-enabled tools (`orchestrate`, `run_workflow`, `consensus_vote`) now accept an optional `idempotencyKey?: string` (max 256 chars). Lets a caller re-invoke the same logical operation safely across process restarts / session reconnects without double-dispatching.

  ## Contract
  - Same `(tool, idempotencyKey, inputs)` → `{ status: 'replay', jobId }` pointing at the existing job. Caller polls `get_job_result(jobId)` exactly as if it had dispatched fresh and gets whatever state the job is in (pending / complete / failed / cancelled).
  - Same `(tool, idempotencyKey)` + DIFFERENT inputs → fails closed with a validation error referencing the existing jobId. Reusing a key with different inputs is almost certainly a caller bug; silent merge would either hide a typo or leak the first call's result into a second logical operation.
  - No `idempotencyKey` → caller falls back to a fresh `randomUUID()` jobId (existing behavior; no schema impact).

  ## Storage

  One file per `(tool, key)` tuple at `<NEXUS_DATA_DIR>/jobs/key-<sha256(tool + ':' + key)>.json`:

  ```json
  {
    "v": 1,
    "tool": "orchestrate",
    "key": "<user-key>",
    "inputsHash": "<sha256>",
    "jobId": "job-orchestrate-<16-hex>",
    "createdAt": "<iso>"
  }
  ```

  The filename is hashed so a directory listing doesn't leak user-supplied keys. The on-disk record retains the cleartext key for debugging — same trust boundary as the result sidecar.

  ## Determinism guarantees
  - JobId for a keyed dispatch is derived as `job-<tool>-<sha256(tool:key:inputsHash)[:16]>`. Two concurrent dispatches with the same `(tool, key, inputs)` converge on the same id even if both miss the index-lookup race.
  - Input hashing uses a canonical JSON serializer that sorts object keys recursively, so `{a:1,b:2}` and `{b:2,a:1}` produce identical hashes. Array order is significant. `undefined` values are dropped (JSON semantics).

  ## Security tests (per [#3041](https://github.com/nexus-substrate/nexus-agents/issues/3041) vote flag)
  - Replay across sessions: same (tool, key, inputs) from different processes returns the same jobId.
  - Replay survives input-object key reordering.
  - Collision: same key + different inputs returns the `collision` envelope with both hashes.
  - Concurrent dispatch race: `registerIdempotentJob` is idempotent and never overwrites an existing entry with a different jobId.

  ## Caller hot-path order

  `shortCircuitOrFreshJobId` runs BEFORE `tryAcquire('<tool>')`. A replay or collision must not burn a concurrency slot the live caller could use.

  ## Out of scope
  - Cross-process index locking. The current design relies on filesystem write-then-rename semantics + the deterministic jobId derivation; under heavy contention two concurrent dispatches may both write `pending` records, but they converge on the same jobId so the polling client sees one record either way. Adding `flock` is tracked separately if telemetry shows duplicate dispatches.
  - `cancel_job` interaction. A replayed job that's already cancelled returns its cancelled record via `get_job_result` — caller can decide whether to re-dispatch with a fresh key or surface the cancellation. No special replay-of-cancelled semantic was requested in the vote.

  ## Tests

  16 new cases in `mcp/jobs/job-idempotency.test.ts` covering hash determinism, fresh/replay/collision outcomes per tool, key-reorder canonicalization, and idempotent register behavior.

  Lint + typecheck clean. `mcp/jobs/job-idempotency.test.ts` (16) + `orchestrate.test.ts` (42) + `run-workflow.test.ts` (~70) + `consensus-vote.test.ts` (~22) — 150 tests pass, no regressions.

  ## Closes

  Closes [#3042](https://github.com/nexus-substrate/nexus-agents/issues/3042) (the parent issue tracking Stage 1's three pieces — async-mode, cancel_job, idempotencyKey). Stage 1 is complete. Stages 2–5 are merged or in flight separately.

- [#3061](https://github.com/nexus-substrate/nexus-agents/pull/3061) [`9040d3c`](https://github.com/nexus-substrate/nexus-agents/commit/9040d3cae2d54e9af2b0919212443078d772716b) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **feat(state):** `StructuredTaskState` gains `version`, `result`, `cancellation` fields (Stage 2 of [#2631](https://github.com/nexus-substrate/nexus-agents/issues/2631)).

  Stage 2 of 5 in the async-mode build (epic [#2631](https://github.com/nexus-substrate/nexus-agents/issues/2631), design vote approved 7-0 on [#3041](https://github.com/nexus-substrate/nexus-agents/issues/3041)). Adds the schema fields the rest of the async-mode pattern reads/writes. Backward-compatible by construction.

  ## Schema additions

  ```ts
  {
    // ...existing fields
    /** Monotonic ++1 on every write. Backward-compat: missing = 0. */
    version?: number,
    /** Tool result payload, set via `appendResult` (capped at 1 MiB). */
    result?: unknown,
    /** Set via `appendCancellation`; append-only — first one wins. */
    cancellation?: { requestedAt: string; reason?: string },
  }
  ```

  Two new log-entry variants on `StructuredTaskLogEntrySchema`:
  - `{ event: 'result', ts, result: unknown }`
  - `{ event: 'cancellation', ts, cancellation: { requestedAt, reason? } }`

  Two new helpers on `structured-task-state.ts`:
  - `appendResult(taskId, result, ts, customDir?)` — JSON-serializes the payload, measures `Buffer.byteLength` (UTF-8 bytes, not JS code units), truncates over-cap writes to `{ truncated: true, originalBytes, maxBytes, note }`. Returns `err` cleanly on non-serializable inputs (BigInt etc.).
  - `appendCancellation(taskId, cancellation, customDir?)` — writes the marker. Reducer keeps the FIRST cancellation in memory across duplicate events (audit-trail-only).

  ## Backward compatibility (the invariant that keeps Stage 1 polling clients alive)

  `version` is optional in the schema; the reducer treats missing as `0`. A polling client written against pre-Stage-2 nexus-agents reading post-Stage-2 logs sees `version` show up; a post-Stage-2 client reading pre-Stage-2 logs sees `version: 0`. Either direction works.

  ## Lifecycle invariants (next-contributor flags)

  Two contracts shipped here that are hard to walk back:
  1. **`version` is monotonic and 1-per-event.** Every non-init log entry bumps version by exactly 1. Even an append-only-blocked cancellation (second one ignored in state) still bumps version so polling clients can observe the log grew. Don't change to "only bump on visible state change" — that would lose audit visibility.
  2. **`cancellation` is first-wins in memory.** Disk keeps every cancellation event for audit, but `state.cancellation` is whichever request landed first. A malicious or buggy double-cancel can't rewrite the requestedAt timestamp.

  ## Result size cap (security flag from [#3041](https://github.com/nexus-substrate/nexus-agents/issues/3041) vote)

  `TASK_RESULT_MAX_BYTES = 1_048_576` (1 MiB). Over-cap payloads get the truncation marker, not silent drop — caller can tell "result was dropped at write" vs "result was never written." Caps result-retention DoS where a misbehaving tool could write a 100 MiB blob and block reads of every other task on the data dir.

  ## Tests

  10 new cases in `structured-task-state.test.ts`:
  - Monotonic version starts at 0, increments on every event, two consecutive events reach v2 (catches a one-time bump-at-end bug).
  - Backward-compat: old-shape state log without `version` reduces to v0.
  - `appendResult` writes payload visible after `readTaskState`, version bumps.
  - `appendResult` truncates over-cap payloads to a typed marker.
  - `appendResult` measures UTF-8 bytes (emoji-heavy payload trips the cap even with low JS code-unit length).
  - `appendResult` returns `err` cleanly on serialization failure (BigInt).
  - `appendCancellation` writes marker visible after read.
  - `appendCancellation` append-only — second event doesn't overwrite first `requestedAt`, but version still bumps so audit growth is observable.

  1,195 targeted tests pass (`src/context/`, `src/mcp/tools/orchestrate.test.ts`, `src/mcp/tools/query-task-state-tool.test.ts`, `src/mcp/jobs/`); `tsc` + `eslint` clean.

  ## What's next (Stage 3, [#3044](https://github.com/nexus-substrate/nexus-agents/issues/3044))

  `run_workflow` async-mode lands next — that PR migrates the orchestrate async-mode writer from the Stage-1 sidecar (`mcp/jobs/job-result-store.ts`) to `appendResult` / `appendCancellation`, then ships async-mode for `run_workflow` itself. After Stage 3 lands, the sidecar files become legacy that the next cleanup sweep removes (per the Stage 1 PR's note).

- [#3063](https://github.com/nexus-substrate/nexus-agents/pull/3063) [`1dae6b9`](https://github.com/nexus-substrate/nexus-agents/commit/1dae6b922db52a5d326c4454f0fdb91eb15573a9) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **feat(run_workflow):** async-mode dispatch + per-tool concurrency caps (Stage 3 of [#2631](https://github.com/nexus-substrate/nexus-agents/issues/2631)).

  Stage 3 of 5 in the async-mode build (epic [#2631](https://github.com/nexus-substrate/nexus-agents/issues/2631)). This is the **payoff PR** — `run_workflow` is the gate-firing tool that drove the epic: per [#2703](https://github.com/nexus-substrate/nexus-agents/issues/2703) telemetry, `28.6% of run_workflow's errors were timeout-shaped` against a 900_000ms server budget while clients use the MCP-SDK 60_000ms default. Async-mode sidesteps the mismatch entirely.

  ## Surface

  `run_workflow` gains the same `mode?: 'sync' | 'async'` param that landed on `orchestrate` in [#3048](https://github.com/nexus-substrate/nexus-agents/issues/3048). Default sync (backward-compat invariant — schema deliberately omits `.default('sync')` so the inferred type stays optional). When `mode: 'async'` + non-dry-run:
  - Returns `{ status: 'pending', jobId, pollTool: 'get_job_result', note }` immediately (well under any client timeout).
  - Pipeline runs on a background promise; result lands in the existing Stage-1 sidecar (`$NEXUS_DATA_DIR/jobs/result-<jobId>.json`).
  - `dryRun: true` stays synchronous regardless of mode — no point backgrounding a sub-second validation.
  - `timeoutMs` ([#3017](https://github.com/nexus-substrate/nexus-agents/issues/3017) per-phase override) still applies inside the background dispatch.

  ## Concurrency cap (per Contrarian vote flag from [#3041](https://github.com/nexus-substrate/nexus-agents/issues/3041))

  New `mcp/jobs/job-concurrency.ts` primitive — in-process per-tool cap with env override. The Contrarian voter's 0.78-confidence approval was specifically gated on "caps must land before async-mode expands past orchestrate." This PR delivers that, AND retrofits orchestrate to the same primitive so both tools share the safety net.

  Defaults (starting points; re-tune after observing real workloads):
  - `orchestrate: 3`
  - `run_workflow: 3`
  - `consensus_vote: 2` (Stage 4)
  - `execute_expert: 4` (Stage 4)

  Env override: `NEXUS_JOB_MAX_CONCURRENT_<TOOL_UPPER>`. A value of `0` disables async-mode for that tool entirely. Invalid (non-numeric) values fall back to the default with a logged warning. Over-cap acquisitions return `{ status: 'busy', retryAfterMs }` synchronously — no jobId created.

  `suggestRetryAfterMs` scales linearly with fullness, clamped to [5s, 60s].

  ## A/B-measurement setup

  After this PR ships in the next release, re-run `scripts/analyze-timeout-mismatch.ts`. Async-mode `run_workflow` invocations should NOT show up in the timeout-shaped-error column — they finish via polling, not transport. If the timeout-shaped error rate on `run_workflow` doesn't drop materially over the following weeks, the design didn't address the root cause and Stage 4 should re-vote.

  ## Out of scope (deferred to a follow-up PR)

  **Migrating the sidecar writers to Stage 2's `appendResult` / `appendCancellation`.** Both `orchestrate` and `run_workflow` async-mode still write to the `mcp/jobs/job-result-store.ts` sidecar shipped with [#3048](https://github.com/nexus-substrate/nexus-agents/issues/3048). Stage 2 ([#3061](https://github.com/nexus-substrate/nexus-agents/issues/3061) → v2.85.0) added the `result` / `cancellation` fields on `StructuredTaskState` that these writers can migrate to — but doing the migration in THIS PR would have doubled the surface area for review. The migration is bounded (3 call sites in orchestrate, 3 in run_workflow), has zero behavior change for polling clients (the get_job_result tool will fall through to query_task_state once migrated), and gets its own PR.

  ## Tests
  - 12 new `job-concurrency.test.ts` cases: default cap returned, env override honored, cap=0 disables, non-numeric env falls back with warning, unknown tools get global default, acquire/release lifecycle, per-tool isolation, release-with-no-inflight is logged not crashed, suggestRetryAfterMs returns 0 for disabled tools / scales with load.
  - 4 new `run-workflow.test.ts` schema cases: accepts `'async'`, accepts `'sync'`, undefined-stays-undefined (backward-compat invariant), rejects unknown mode value.
  - 90 targeted tests pass (`src/mcp/jobs/`, `src/mcp/tools/run-workflow.test.ts`, `src/mcp/tools/orchestrate.test.ts`); `tsc` + `eslint` clean.

  ## Lifecycle invariants
  1. **`mode: 'sync'` stays default forever** (same as [#3048](https://github.com/nexus-substrate/nexus-agents/issues/3048)).
  2. **`tryAcquire` returning true requires exactly one matching `release`** in a `finally` — both orchestrate ([#3048](https://github.com/nexus-substrate/nexus-agents/issues/3048)-retrofit) and run_workflow (new) follow this. Release-without-acquire logs a caller-bug warning, doesn't crash, doesn't underflow.
  3. **`busy` response carries `retryAfterMs`** — clients implementing backoff should honor it (linear scaling, clamped to [5s, 60s]).

  ## What's next

  **Stage 4, [#3045](https://github.com/nexus-substrate/nexus-agents/issues/3045)** — `consensus_vote` and `execute_expert` async-mode. Inherits the same cap primitive + sidecar; cancellation semantics (mid-vote / mid-execution) are the new design surface.

  **Migration PR** — sidecar writers → Stage 2 schema. Drops `mcp/jobs/job-result-store.ts` once both consumers are migrated.

- [#3064](https://github.com/nexus-substrate/nexus-agents/pull/3064) [`f7c7d0a`](https://github.com/nexus-substrate/nexus-agents/commit/f7c7d0a7c676d5c56e463ac965f3e028488569af) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **feat(consensus_vote):** async-mode dispatch (Stage 4 of [#2631](https://github.com/nexus-substrate/nexus-agents/issues/2631)).

  Stage 4 of 5 in the async-mode build (epic [#2631](https://github.com/nexus-substrate/nexus-agents/issues/2631)). `consensus_vote` joins `orchestrate` (Stage 1, [#3048](https://github.com/nexus-substrate/nexus-agents/issues/3048)) and `run_workflow` (Stage 3, [#3063](https://github.com/nexus-substrate/nexus-agents/issues/3063)) on the unified async-mode protocol.

  ## Surface

  `consensus_vote` gains `mode?: 'sync' | 'async'` matching the Stage 1 + Stage 3 shape. Default sync — backward-compat invariant; schema omits `.default('sync')` so the inferred type stays optional and existing fixtures don't churn.
  - `mode: 'async'` returns `{ status: 'pending', jobId, pollTool: 'get_job_result' }` immediately.
  - Background dispatch runs the existing `handleConsensusVote` end-to-end — 7-voter fan-out, error policy, correlation persistence all unchanged.
  - Result written to the Stage-1 sidecar (`mcp/jobs/job-result-store.ts`).
  - Per-tool cap via `NEXUS_JOB_MAX_CONCURRENT_CONSENSUS_VOTE` (default **2**, lower than orchestrate's 3 because voting is 7-fan-out and concurrent jobs multiply adapter load fast).
  - Over-cap returns `{ status: 'busy', retryAfterMs }` synchronously.

  ## What's covered + what's deferred

  **In this PR:** `consensus_vote` async-mode.

  **Not in this PR (intentional):** `execute_expert` async-mode. Investigation showed it ALREADY has async via MCP SDK Tasks primitive (SEP-1686) — registered via `server.experimental.tasks.registerToolTask` with `taskSupport: 'optional'`. The sidecar pattern this epic ships is for explicit-polling clients; the SDK Tasks primitive is for auto-polling clients. Both serve valid use cases and coexist. Forcing a third pattern (`mode: 'async'` via sidecar) onto `execute_expert` would create overlapping facilities with no functional gain. Filing as [#3064](https://github.com/nexus-substrate/nexus-agents/issues/3064) follow-up if a use case demonstrates the need.

  ## Cancellation semantics ([#3041](https://github.com/nexus-substrate/nexus-agents/issues/3041) vote deferred this to Stage 4)

  When `cancel_job` lands while a vote is in-flight, the existing `collectRealVotes` collector unwinds via the AbortSignal plumbing from [#3038](https://github.com/nexus-substrate/nexus-agents/issues/3038) (per-voter signals). The dispatcher writes whatever partial vote set landed before the abort as the job result — preserves audit visibility into who voted before the cancel happened. The full `cancel_job` MCP tool is still part of the deferred Stage 1b under [#3042](https://github.com/nexus-substrate/nexus-agents/issues/3042); once that lands, this dispatcher path picks it up without further changes.

  ## Refactor note

  `createConsensusVoteHandler` was extracted into a 3-piece structure: validation → branch on mode → dispatch helper. The sync path moved into `runSyncConsensusVote` to keep both branches readable + within the per-function size cap as the handler grew.

  ## Tests

  4 new schema tests on `consensus-vote.test.ts`: accepts `'async'`/`'sync'`, undefined-stays-undefined (backward-compat invariant), rejects unknown mode values.
  - 60 wider consensus-vote tests pass (was 56 — 4 new).
  - 84 targeted tests pass (`consensus-vote.test.ts`, `mcp/jobs/`); `tsc` + `eslint` clean.

  ## What's next

  **Stage 5, [#3046](https://github.com/nexus-substrate/nexus-agents/issues/3046)** — cross-tool concurrency cap + `list_jobs` MCP tool (per-session discovery). Final stage of the epic.

  **Sidecar→Stage 2 schema migration** — separate small PR. Migrates the 3 writers (orchestrate, run_workflow, consensus_vote) from `mcp/jobs/job-result-store.ts` to `appendResult` / `appendCancellation` from [#3061](https://github.com/nexus-substrate/nexus-agents/issues/3061). Deprecates the sidecar.

- [#3066](https://github.com/nexus-substrate/nexus-agents/pull/3066) [`4bfa683`](https://github.com/nexus-substrate/nexus-agents/commit/4bfa683a86c700f84e17d43bb45f263f1b152f7c) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **feat(jobs):** cross-tool concurrency cap + `list_jobs` MCP tool (Stage 5 of [#2631](https://github.com/nexus-substrate/nexus-agents/issues/2631)).

  **Final stage of epic [#2631](https://github.com/nexus-substrate/nexus-agents/issues/2631)** — closes the async-mode build series ([#3048](https://github.com/nexus-substrate/nexus-agents/issues/3048) / [#3061](https://github.com/nexus-substrate/nexus-agents/issues/3061) / [#3063](https://github.com/nexus-substrate/nexus-agents/issues/3063) / [#3064](https://github.com/nexus-substrate/nexus-agents/issues/3064) → this PR).

  ## Changes

  ### Cross-tool global concurrency cap

  `getGlobalJobCap()` + `getTotalInFlight()` added to `mcp/jobs/job-concurrency.ts`. `tryAcquire` now enforces BOTH the per-tool cap (existed) AND the global cross-tool cap (new). Defensive backstop the Contrarian vote on [#3041](https://github.com/nexus-substrate/nexus-agents/issues/3041) specifically called for: prevents 5 tools × 3 jobs each saturating the host's adapter slots even when each per-tool cap is satisfied.
  - Default cap: **10** (`DEFAULT_GLOBAL_JOB_CAP`). Comfortably above the sum of per-tool defaults (3+3+2+4=12 is also fine because no realistic workload fills every tool simultaneously) but stops runaway parallel fan-outs.
  - Env override: `NEXUS_JOB_MAX_CONCURRENT_TOTAL`. `0` disables async-mode across ALL tools simultaneously.

  ### `list_jobs` MCP tool (40th tool)

  Cross-session discovery surface. Walks `<NEXUS_DATA_DIR>/jobs/result-*.json` and returns one `JobSummary` per record — jobId, toolName, status, timestamps, hasError. Filters by `toolName` (exact match) and `status` (`pending | complete | failed | cancelled`). `limit` capped at 200. Newest-first sort matches the typical "what just happened" discovery flow.

  **Result payloads are intentionally excluded from summaries** — large `complete` records can be 1 MiB each (per Stage 2's `TASK_RESULT_MAX_BYTES` cap), and `list_jobs` is meant for discovery, not retrieval. Callers fetch full records via `get_job_result(jobId)`.

  Registered through every dispatch surface: `cli-server-tools.ts` STANDALONE_TOOLS, `mcp/tools/index.ts` REGISTERED_TOOL_NAMES + EXPECTED_TOOL_NAMES, both tool-annotation tables, the security RISKY_TOOLS_ALLOWLIST (read-only), and `scripts/tool-descriptions-data.ts` (long + README forms). Tool count: 39 → 40.

  ## Why this completes the epic

  The original epic [#2631](https://github.com/nexus-substrate/nexus-agents/issues/2631) listed five open questions; the staged build answered each:

  | Open question                                                                     | Resolution                                                                                                                                                                                                                                                                                        |
  | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | Discovery — how does the caller find a job they kicked off in a previous session? | **This PR** — `list_jobs` walks the sidecar dir; cross-session discoverable.                                                                                                                                                                                                                      |
  | Cancellation                                                                      | `cancel_job` is a separate deferred PR under Stage 1 ([#3042](https://github.com/nexus-substrate/nexus-agents/issues/3042)). AbortSignal plumbing from [#3035](https://github.com/nexus-substrate/nexus-agents/issues/3035)/[#3038](https://github.com/nexus-substrate/nexus-agents/issues/3038). |
  | Resource limits                                                                   | Stage 3 added per-tool caps ([#3044](https://github.com/nexus-substrate/nexus-agents/issues/3044)); **this PR** adds the global cross-tool cap.                                                                                                                                                   |
  | Notification on completion                                                        | Polling via `get_job_result` (Stage 1, [#3048](https://github.com/nexus-substrate/nexus-agents/issues/3048)). MCP doesn't have push-after-request semantics so the deferred-by-vote answer stands.                                                                                                |
  | Backpressure                                                                      | Stages 3 + 5 — `busy` envelope with `retryAfterMs` synchronous when caps fill.                                                                                                                                                                                                                    |

  ## Lifecycle invariants (next-contributor flags)
  1. **Both caps must pass** to acquire a slot — per-tool AND global. A future caller can't accidentally weaken this by checking only one.
  2. **`getTotalInFlight()` sums across all tools** — used by both the cap check and observability. If it drifts (negative count, stale entries), `tryAcquire` would either over-admit or under-admit; tests guard this.
  3. **`list_jobs` result-payload exclusion is by design** — the JobSummary shape doesn't include `result`. A future contributor wanting to "make it easier" by inlining the payload would re-introduce the 1 MiB × N response size that the size discipline was protecting against.

  ## Tests
  - 6 new `list-jobs-tool.test.ts` schema cases (input validation across `toolName`/`status`/`limit`).
  - 7 new `list-jobs-tool.test.ts` integration cases (empty dir, summary shape excludes payload, newest-first sort, status preservation, hasError flag, non-matching filenames defensively skipped).
  - 7 new `job-concurrency.test.ts` global-cap cases (default, env override, non-numeric fallback, cap=0 disables all tools, global blocks across tools, release frees slot, getTotalInFlight sums).
  - Existing tool-count assertions bumped 39 → 40 (`EXPECTED_TOOL_COUNT`, `TOOL_ANNOTATIONS`, `REGISTERED_TOOLS` in tests).
  - 72 targeted tests pass (`src/cli-server-tools.test.ts`, `src/mcp/jobs/`, `src/mcp/tools/list-jobs-tool.test.ts`); `tsc` + `eslint` clean.

  ## What's still open under the umbrella
  - **`cancel_job` MCP tool** — Stage 1b under [#3042](https://github.com/nexus-substrate/nexus-agents/issues/3042). Reserved status enum (`cancelled`) and dispatcher cancellation paths are already in place from Stages 1 + 4. Just needs the tool wrapper.
  - **`idempotencyKey` + sha256 replay-safe re-invocation** — Stage 1c under [#3042](https://github.com/nexus-substrate/nexus-agents/issues/3042).
  - **Sidecar→Stage 2 schema migration** — separate small PR. Migrates the 3 writers (orchestrate / run_workflow / consensus_vote) from `mcp/jobs/job-result-store.ts` to `appendResult` / `appendCancellation` from [#3061](https://github.com/nexus-substrate/nexus-agents/issues/3061). Deprecates the sidecar.
  - **execute_expert sidecar evaluation** — [#3065](https://github.com/nexus-substrate/nexus-agents/issues/3065) (deferred unless real use case shows up; SDK Tasks primitive already covers async there).

  ## A/B-measurement reminder

  After this PR + Stages 3-4 ship in v2.85.0, re-run `scripts/analyze-timeout-mismatch.ts`. Async-mode invocations of `run_workflow` / `consensus_vote` / `orchestrate` should NOT show up in the timeout-shaped-error column. If the rate doesn't drop materially over 1-2 weeks, the design didn't address the root cause and the epic should re-vote (per the [#3041](https://github.com/nexus-substrate/nexus-agents/issues/3041) decision-binding clause).

### Patch Changes

- [#3068](https://github.com/nexus-substrate/nexus-agents/pull/3068) [`533fa21`](https://github.com/nexus-substrate/nexus-agents/commit/533fa21a38aab40417732be10f317c55411b25a4) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **fix(workflows):** thread AbortSignal through step-executor → BaseAgent → CompletionRequest ([#3016](https://github.com/nexus-substrate/nexus-agents/issues/3016), [#3040](https://github.com/nexus-substrate/nexus-agents/issues/3040)).

  Closes [#3016](https://github.com/nexus-substrate/nexus-agents/issues/3016) and [#3040](https://github.com/nexus-substrate/nexus-agents/issues/3040). Step-executor's `Promise.race` was dropping the race-loser — when the step timer fired at 120s, the in-flight model call kept running to its own 10-minute SDK timeout, surfacing as the "first-step adapter hang" from [#2931](https://github.com/nexus-substrate/nexus-agents/issues/2931).

  ## What changed
  - `IAgent.execute` accepts an optional second arg `{ signal?: AbortSignal }`. Optional so existing callers don't break.
  - `BaseAgent.execute` stashes the caller's signal in a per-task instance field (`currentExecutionSignal`), cleared in `finally`.
  - `BaseAgent.complete` forwards `currentExecutionSignal` onto `CompletionRequest.signal` unless the caller already set one.
  - `runTaskWithTimeout` takes optional `externalSignal`, wires it into the existing internal `AbortController` so a single signal covers both heartbeat expiry and caller-initiated cancellation.
  - `StepExecutor.runExpertWithTimeout` creates an `AbortController`, passes the signal to `expert.execute(task, { signal })`, and aborts in `finally`. Abort fires for both arms of the race — clean resolution OR timeout — so the SDK call always cancels.

  ## Why this is a patch, not minor

  The IAgent interface change adds an optional second arg; every existing `agent.execute(task)` call site keeps working. No subclass needs to override the new signature unless it wants to honor the signal. SimpleAgent, Expert, Orchestrator, and all expert subclasses inherit the signal-forwarding behavior from `BaseAgent.complete`.

  ## Tests
  - New: `runTaskWithTimeout` external signal cancels in-flight task.
  - New: pre-aborted external signal settles task immediately.
  - New: step-executor passes a signal into `expert.execute` and aborts it after the race resolves.
  - 148 pre-existing tests in `base-agent.test.ts`, `base-agent-execute-flow.test.ts`, `base-agent-task-helpers.test.ts`, and `step-executor.test.ts` continue to pass unchanged.

  ## Out of scope (deferred)
  - `IModelAdapter.complete` already honors `request.signal` ([#3036](https://github.com/nexus-substrate/nexus-agents/issues/3036)/PR [#3038](https://github.com/nexus-substrate/nexus-agents/issues/3038)). Vendor SDKs (Anthropic, OpenAI, Google) wire `request.signal` into their respective HTTP client abort paths.
  - Per-call timeout knob on `adapter.complete` is tracked separately as [#2931](https://github.com/nexus-substrate/nexus-agents/issues/2931) item 4.
  - Whether the upstream model legitimately blocks for 120s vs wedges on bad network state needs repro via `query_trace(runId=<real id>)` enabled (now possible after PR [#3015](https://github.com/nexus-substrate/nexus-agents/issues/3015) — failure-envelope debuggability).

## 2.84.0

### Minor Changes

- [#3048](https://github.com/nexus-substrate/nexus-agents/pull/3048) [`2a6ac34`](https://github.com/nexus-substrate/nexus-agents/commit/2a6ac341aa7effe060cea04c48844ed768c8717c) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **feat(orchestrate): async-mode dispatch + `get_job_result` MCP tool (Stage 1 of [#2631](https://github.com/nexus-substrate/nexus-agents/issues/2631)).**

  First implementation slice of epic [#2631](https://github.com/nexus-substrate/nexus-agents/issues/2631) (job-style invocation for long-running MCP tools). The async-mode design vote — `consensus_vote higher_order`, **approved 7-0 on 2026-05-25** — locked the staging order: orchestrate first, schema additions second, run_workflow third. This PR delivers Stage 1.

  ## What changed
  - **`orchestrate` tool** gains an optional `mode: 'sync' | 'async'` param. Default behavior is unchanged — every existing sync caller sees zero difference. With `mode: 'async'`, the handler returns `{ status: 'pending', jobId }` immediately and runs the pipeline on a background promise.
  - **New MCP tool `get_job_result(jobId)`** returns the structured job-result record. Status lifecycle: `pending → complete | failed | cancelled` (cancellation comes in Stage 1b under the same Stage-1 umbrella). On `complete` the record carries the same payload sync mode would have returned inline; on `failed` it carries an error message.
  - **New `jobs/` subdir** in `nexusDataPath` (added to `PER_REPO_SUBDIRS` — a job dispatched on repo A shouldn't be pollable on repo B). Records serialize to `<NEXUS_DATA_DIR>/jobs/result-<jobId>.json` via a tiny `job-result-store.ts` module. Stage 2 ([#3043](https://github.com/nexus-substrate/nexus-agents/issues/3043)) migrates the result inline to `StructuredTaskState`; sidecar files become legacy that the next cleanup sweep removes.
  - Tool registered through every dispatch surface: `cli-server-tools.ts` STANDALONE_TOOLS, `mcp/tools/index.ts` REGISTERED_TOOLS + EXPECTED_TOOL_NAMES, both tool-annotation tables, the security `RISKY_TOOLS_ALLOWLIST` (read-only), and `scripts/tool-descriptions-data.ts` (long + README forms). Governance and repo-index regen: tool count moves 38 → 39.

  ## What's deferred to Stage 1b/1c (under [#3042](https://github.com/nexus-substrate/nexus-agents/issues/3042))
  - `cancel_job(jobId)` MCP tool. Rides on the `AbortSignal` plumbing from [#3035](https://github.com/nexus-substrate/nexus-agents/issues/3035)/[#3038](https://github.com/nexus-substrate/nexus-agents/issues/3038). Lands next; lifecycle states already reserve the `cancelled` enum so this is a non-breaking add.
  - `idempotencyKey` param + sha256 lookup index. Replay-safe re-invocation returns the existing jobId rather than re-dispatching.
  - `inlineDeadlineMs` short-circuit (Ilya's design constraint 3): if the work finishes inside the deadline, return the inline result instead of a jobId. Performance polish; not blocking the contract.

  ## Why staged this way

  Per the vote's binding staging order, the polling protocol gets validated end-to-end on a tool that already writes state (`orchestrate` writes `StructuredTaskState` via `recordTaskStateInit` already) BEFORE the gate-firing tool (`run_workflow`, with 28.6% timeout-shaped errors per the [#2703](https://github.com/nexus-substrate/nexus-agents/issues/2703) telemetry) migrates. Schema additions to `StructuredTaskState` (Stage 2, [#3043](https://github.com/nexus-substrate/nexus-agents/issues/3043)) follow once the wire protocol is proven; that's the path that lets us drop the sidecar files entirely.

  ## Lifecycle invariants the next contributor inherits

  From the vote's Scope Steward flag: once shipped, two contracts that can't be relaxed without breaking polling clients:
  1. **`mode: 'sync'` stays the default forever** — backward-compat invariant. The schema deliberately omits `.default('sync')` so the inferred type stays optional and existing test fixtures don't need to add `mode: 'sync'`; the handler treats `undefined` as `'sync'`.
  2. **JobResult schema is versioned (`v: 1`)** — readers tolerate future versions by returning `null` (treated as "unknown jobId") so an older nexus-agents process polling against a record written by a newer process doesn't crash.

  ## Tests
  - 8 new `job-result-store.test.ts` cases: pending/complete/failed lifecycle, createdAt preservation across writeJobComplete, idempotent re-write of pending, future-schema graceful handling, corrupt-JSON graceful handling.
  - 4 new schema-level cases on `orchestrate.test.ts`: accepts `'async'`/`'sync'`, undefined-stays-undefined (backward-compat invariant), rejects unknown mode value.
  - `EXPECTED_TOOL_COUNT` and `TOOL_ANNOTATIONS` count bumped 38 → 39 to match the new `get_job_result`.

  136 targeted tests pass; `tsc` + `eslint` clean.

### Patch Changes

- [#3032](https://github.com/nexus-substrate/nexus-agents/pull/3032) [`a01ca0e`](https://github.com/nexus-substrate/nexus-agents/commit/a01ca0ec4107097f1537c4b3d2de0ef9be722724) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **perf(context):** `RoutingMemory.getPreferences` caches per-taskType results (closes [#2955](https://github.com/nexus-substrate/nexus-agents/issues/2955) site 4).

  Pre-fix, every `getPreferences(taskType)` call did N=`CLI_NAMES.length` MobiMem profile lookups followed by an in-place sort, on every `CompositeRouter.route()` invocation. With `enableRoutingMemory=true` (default with persistence on), most calls produced empty results after the N lookups — pure waste on the routing hot path.

  ### Fix
  - Added `preferencesCache: Map<string, readonly ModelPreference[]>` on `RoutingMemory`.
  - `getPreferences` returns the cached entry on hit (O(1)); on miss, does the original full `CLI_NAMES` sweep, freezes the sorted result, caches it, and returns. The CLI_NAMES sweep is preserved on cache miss so MobiMem data written by another `RoutingMemory` instance or a prior session (shared singleton from [#2719](https://github.com/nexus-substrate/nexus-agents/issues/2719)) is still observed on first read.
  - `storePreference` invalidates the per-taskType cache entry (O(1) `Map.delete`) so the next read rebuilds with the new observation included.

  ### Why the cache is safe

  The cache is correct within a single `RoutingMemory` instance's lifetime, which matches `CompositeRouter`'s usage pattern (process-singleton via `getGlobalRegistry()`). Cross-instance writes to the shared MobiMem aren't detected, but in practice no second instance writes to it during normal operation. If that changes, the cache can be invalidated externally by calling `storePreference` with any value, or replaced with a TTL-bounded variant.

  ### Test coverage

  3 new tests (`routing-memory.test.ts`):
  - Second read returns the **same reference** (cache hit confirmed).
  - `storePreference` to a cached taskType invalidates and the rebuilt result reflects the new observation (different reference + higher strength).
  - Cache invalidation is **scoped to the modified taskType** — writing to `task-y` does not invalidate `task-x`'s cache.

  28 tests pass (was 25); `tsc + eslint` clean.

  Closes [#2955](https://github.com/nexus-substrate/nexus-agents/issues/2955) site 4. Sites 1, 2, and 3 (partial) shipped in [#3005](https://github.com/nexus-substrate/nexus-agents/issues/3005).

- [#3039](https://github.com/nexus-substrate/nexus-agents/pull/3039) [`7cbd339`](https://github.com/nexus-substrate/nexus-agents/commit/7cbd339d7ede20bdb691bf96c8ebaa9783703934) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **feat(ci):** add producer-without-consumer detection gate (closes [#3024](https://github.com/nexus-substrate/nexus-agents/issues/3024)).

  The 2026-05-24 audit sweep deleted ~5,250 LOC across 7 issues ([#2937](https://github.com/nexus-substrate/nexus-agents/issues/2937), [#2938](https://github.com/nexus-substrate/nexus-agents/issues/2938), [#2939](https://github.com/nexus-substrate/nexus-agents/issues/2939), [#2940](https://github.com/nexus-substrate/nexus-agents/issues/2940), [#3018](https://github.com/nexus-substrate/nexus-agents/issues/3018), [#3022](https://github.com/nexus-substrate/nexus-agents/issues/3022)) all with the same shape: a producer/utility was built and exported on a public barrel, but the consumer never landed. This adds a PR-time gate so the next sweep doesn't accumulate the same dead-code surface over a quiet six-month window.

  **What the gate checks:**

  Every new `.ts` file added under `packages/nexus-agents/src/**` in a PR must have at least one non-test, non-barrel import elsewhere in `src/`. Implemented as `scripts/check-new-unused-exports.ts`, run as a new `Producer/Consumer Check` job in `.github/workflows/ci.yml`.

  **What it does NOT check (v1 scope):**
  - New exports added to _existing_ files. Most of the audit-sweep cases were new files; new-export-in-existing-file detection requires an AST diff against the base ref and is meaningful future work.
  - Type-only usage. The greedy `from '*/name.js'` grep catches both value and type imports without distinguishing.

  **Opt-out:** add `// @export-no-consumer-yet — see #<issue>` to the file. The marker requires a tracking-issue reference so deferred-but-tracked work doesn't bypass the gate untraced — the rule from `.rules/track-deferred-work.md` still applies.

  **Verified end-to-end:** the gate runs on the watchdog PR ([#3038](https://github.com/nexus-substrate/nexus-agents/issues/3038), which adds `src/adapters/abort-utils.ts`) and correctly reports "1 new file(s) have production consumers — OK." 7 unit tests cover the classification logic (test/barrel/declaration skipping).

- [#3034](https://github.com/nexus-substrate/nexus-agents/pull/3034) [`afc51ff`](https://github.com/nexus-substrate/nexus-agents/commit/afc51ffaa51551c39abf0e59475ec200c5010768) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **fix(subprocess):** SIGKILL escalation when child ignores SIGTERM on timeout (closes [#3026](https://github.com/nexus-substrate/nexus-agents/issues/3026) finding 1).

  The subprocess timeout path fired SIGTERM and resolved the parent promise immediately so callers don't wait on a hung child. But if the child ignored SIGTERM — Node CLIs that install graceful-shutdown handlers can hang on a broken stream, or spawn subprocesses of their own that keep stdio open — the `'close'` event never fired and the process accumulated as a zombie. Under sustained timeout pressure (long consensus votes with rate-limited backends), zombie Node CLI processes pile up holding file descriptors, API session tokens, and PIDs — eventually exhausting OS limits in ways operators can't trace back to nexus-agents.

  The fix:
  - Added `SIGKILL_GRACE_MS = 5_000` constant. Five seconds gives well-behaved children time to flush state and exit cleanly while bounding zombie-process accumulation when the child ignores SIGTERM.
  - Extracted a `scheduleTimeoutWithSigkillEscalation` helper from `setupChildProcessHandlers` (the latter was at the 50-line cap). The escalation timer fires after the grace window, checks `child.exitCode === null && child.signalCode === null` (still running), and force-reaps with `child.kill('SIGKILL')`. Logs a warn before escalating so operators can correlate the resource cleanup.
  - The escalation timer is `.unref()`'d so it doesn't keep the Node event loop alive — process shutdown wins over the escalation wait.
  - Both the primary timeout and the escalation timer are cleared from the `'close'` handler, so a child that exits within the grace window doesn't see the second signal.

  2 regression tests in `subprocess-adapter.test.ts`:
  - SIGKILL fires after the grace window when child ignores SIGTERM (`exitCode` and `signalCode` both stay `null`).
  - SIGKILL does NOT fire when the child exits cleanly within the grace window (`exitCode = 143` set on close).

  39 tests pass (was 37); `tsc + eslint` clean.

  [#3026](https://github.com/nexus-substrate/nexus-agents/issues/3026) finding 2 (AbortSignal threading through `ICliAdapter.execute` so race-loser subprocesses get cancelled cleanly) is the larger half of PR 2 — still pending, will land separately as a contract change touching all 5 concrete adapters + 3 call sites.

- [#3035](https://github.com/nexus-substrate/nexus-agents/pull/3035) [`2afb4ce`](https://github.com/nexus-substrate/nexus-agents/commit/2afb4ce944807cb57b5650948f82fa6e1cad03b8) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **fix(cli-adapters):** thread AbortSignal through `ICliAdapter.execute` so race-loser subprocesses get cancelled (closes [#3026](https://github.com/nexus-substrate/nexus-agents/issues/3026) finding 2).

  Callers that bounded adapter latency with `Promise.race([adapter.execute(task), timeout])` had no way to tell the adapter "the timeout won, stop running." When timeout won, `adapter.execute` kept executing — the subprocess kept running to completion, then posted its result into OutcomeStore and LinUCB state for a task whose decision was already recorded. Symptoms: late outcome rows attributing success/failure to the wrong (already-discarded) candidate, LinUCB feature updates from stale CLI calls, and orphan subprocess fan-out under sustained timeout pressure.

  The fix:
  - Added `signal?: AbortSignal | undefined` to `ExecutionOptions`. Typed as `AbortSignal | undefined` (not `AbortSignal?`) so the pervasive internal `Required<ExecutionOptions>` shape keeps working under `exactOptionalPropertyTypes`.
  - Added `ResolvedExecutionOptions = Required<Omit<ExecutionOptions, 'signal'>> & Pick<ExecutionOptions, 'signal'>` — the internal resolved-options shape used by adapters and tests. `signal` stays optional because it's a per-call hook, not a defaultable value.
  - `SubprocessCliAdapter.spawnSubprocess` now:
    - Fast-fails with `TIMEOUT: Aborted before spawn` if `signal.aborted === true` (saves a child process start when an upstream wave/loop has already moved on).
    - Attaches an abort listener that SIGTERMs the child mid-execution if `signal` aborts. SIGKILL escalation from [#3026](https://github.com/nexus-substrate/nexus-agents/issues/3026) finding 1 still applies if the child ignores SIGTERM.
    - Removes the abort listener on `'close'` so it doesn't leak across child lifetimes.
  - Three orchestration call sites pass `signal: controller.signal` and abort the controller in `finally`:
    - `orchestration/parallel-exploration.ts` (per-CLI partition timeout)
    - `orchestration/consensus-plan.ts` (per-CLI plan timeout)
    - `orchestration/triangulated-review.ts` (per-CLI review timeout)

  Three regression tests in `subprocess-adapter.test.ts`:
  - `signal.aborted === true` before call → fast-fails without spawning.
  - Signal aborts mid-execution → SIGTERMs child, returns `TIMEOUT: Aborted by caller signal`.
  - Signal aborts after child already exited → no SIGTERM (listener detached on `'close'`).

  42 tests pass (was 39); 50 orchestration tests pass; `tsc + eslint` clean.

  `orchestration/aorchestra/watchdog.ts` also races a generic `task: () => Promise<T>` against a timeout, but its callback is opaque to the watchdog so threading AbortSignal through requires a signature change at every caller — tracked as a follow-up.

- [#3038](https://github.com/nexus-substrate/nexus-agents/pull/3038) [`d4ef3f2`](https://github.com/nexus-substrate/nexus-agents/commit/d4ef3f2c1674d1ad1553a404a8b42b38bb7fba87) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **fix(orchestration):** thread AbortSignal through `withWatchdog` so race-loser worker calls get cancelled (closes [#3036](https://github.com/nexus-substrate/nexus-agents/issues/3036)).

  Follow-up to [#3035](https://github.com/nexus-substrate/nexus-agents/issues/3035) (which closed [#3026](https://github.com/nexus-substrate/nexus-agents/issues/3026) finding 2 for the `ICliAdapter.execute` path). The watchdog wraps `worker-dispatcher` calls that go through `IModelAdapter.complete()` — a separate adapter contract from `ICliAdapter`. When the watchdog timeout won the `Promise.race`, the underlying SDK call (Anthropic/OpenAI/Gemini/Ollama HTTP request) kept running to completion. Late results posted into `OutcomeStore` and updated `LinUCB` state for a worker whose decision had already been recorded.

  Changes:
  - `withWatchdog<T>` callback shape is now `(signal: AbortSignal) => Promise<T>`. The watchdog creates an internal `AbortController`, passes the signal to the task, and calls `controller.abort()` BEFORE rejecting on timeout (so signal listeners fire before the rejection propagates). The `finally` block also aborts so orphan sub-work the task spawned-but-didn't-await sees the cancel.
  - `CompletionRequest` gains `signal?: AbortSignal | undefined`. Typed as union (not `AbortSignal?`) so adapter internals that destructure `request` keep working under `exactOptionalPropertyTypes`.
  - `worker-dispatcher` `attemptExecution` threads the signal through `executeWorker(entry, prior, signal)`. `executeWorker` / `altExecuteWorker` signatures extended with optional `signal` third param.
  - `orchestrate-dispatch` `createWorkerExecutor` / `createAltWorkerExecutor` forward the signal to `executeOnAdapter`, which sets it on `adapter.complete({ messages, signal })`.
  - Concrete adapter wiring:
    - **claude**: `client.messages.create(params, { signal })` (Anthropic SDK supports per-call signal).
    - **openai**: `client.chat.completions.create(params, { signal })`.
    - **gemini**: forwarded as `config.abortSignal` on `client.models.generateContent` (`@google/genai` per-call signal).
    - **ollama**: no per-call signal in the SDK (only `Ollama.abort()` which cancels every ongoing request), so the call is wrapped in a new `raceAbort` helper. The HTTP request may still complete server-side, but no late result is awaited — `OutcomeStore` and `LinUCB` don't see ghost attributions.
    - **openai-compat**: pass-through wrapper around an inner adapter, so signal threading happens at the inner level (no change needed).

  Both the `request.signal !== undefined` branches in claude/openai use explicit if/else to avoid passing `undefined` as a positional second arg — vitest 4 `toHaveBeenCalledWith(params)` treats `(params, undefined)` as a distinct call shape from `(params)`.

  Tests:
  - 3 new `watchdog.test.ts` cases: timeout aborts the signal before rejecting; the task can observe the abort and stop early; abort still fires in `finally` when the task wins cleanly.
  - New `abort-utils.test.ts` with 7 cases for the `raceAbort` helper.
  - All 1,820 tests in `src/adapters/`, `src/orchestration/`, and `src/mcp/tools/orchestrate-dispatch.test.ts` pass.

  `tsc --noEmit` + `eslint` clean.

- [#3037](https://github.com/nexus-substrate/nexus-agents/pull/3037) [`4639b2f`](https://github.com/nexus-substrate/nexus-agents/commit/4639b2f5f3a6ad30bf912f35db0b3a9badfa52dd) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **chore(deps):** bump qs override to ≥6.15.2 to close GHSA-q8mj-m7cp-5q26 (Dependabot alert 102).

  `qs.stringify` with `arrayFormat: 'comma'` and `encodeValuesOnly: true` throws `TypeError` on `null`/`undefined` array elements (CVE-2026-8723, medium-severity DoS). Patched in qs 6.15.2.

  Transitive via `@modelcontextprotocol/sdk` → `express` → `body-parser` → `qs` (and via `express-rate-limit`). The existing `qs: ">=6.14.2"` pnpm override admitted the vulnerable 6.15.1; bumped to `>=6.15.2`. `pnpm install` now resolves every qs site to 6.15.2.

  We don't pass `arrayFormat: 'comma'` + `encodeValuesOnly: true` from this codebase, so the practical impact was bounded — but transitive npm deps can change call patterns silently, and a patch-level pnpm-override bump is cheap.

## 2.83.2

### Patch Changes

- [#3031](https://github.com/nexus-substrate/nexus-agents/pull/3031) [`99a9285`](https://github.com/nexus-substrate/nexus-agents/commit/99a9285597c23e53a76104293faecfdb11aa4980) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **test(cli):** cover the `login`/`auth status` exit-code truth table (closes [#2953](https://github.com/nexus-substrate/nexus-agents/issues/2953)).

  Pre-fix, `packages/nexus-agents/src/cli/login-command.ts` shipped 142 LOC with zero tests against a 4-cell truth table on `(anyAuthenticated, actionable.length)` at line 86:

  ```ts
  if (summary.anyAuthenticated || summary.actionable.length === 0) process.exit(0);
  process.exit(1); // exit 1 only when no CLI authenticated AND a clear next action exists
  ```

  A refactor flipping `||` to `&&` would have silently broken the script-detection contract documented in [#2447](https://github.com/nexus-substrate/nexus-agents/issues/2447) (the issue that introduced the exit-1 case so CI/setup scripts can detect "no creds at all but a clear next step"). The other 3 truth-table cells all exit 0 — script detection only fires in cell 4.

  The fix:
  - Exposed the existing internal helpers `orderForDisplay` and `summarize` as `export` (with a JSDoc explicitly marking them as test-surface) so unit tests can exercise pure logic without `console.log` mocking gymnastics.
  - Added `packages/nexus-agents/src/cli/login-command.test.ts` with **15 tests** covering:
    - `orderForDisplay` — canonical CLI sort order, identity preservation, single/empty input.
    - `summarize` — all-authed, all-need-login, mixed, empty, all-not-installed cases including the exact status-line strings.
    - `handleLoginCommand` exit-code truth table — all 4 cells via a `process.exit` spy that throws to abort the function under test cleanly.
    - The `login` alias deprecation hint ([#2449](https://github.com/nexus-substrate/nexus-agents/issues/2449)) — fires on `command: 'login'`, suppressed on canonical `auth`.

  No production-code change beyond promoting two functions from file-private to `export`. tsc + eslint clean.

- [#3027](https://github.com/nexus-substrate/nexus-agents/pull/3027) [`5647a35`](https://github.com/nexus-substrate/nexus-agents/commit/5647a35921cb703f835f956076ff47bacbd3344e) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **fix(scm):** Zod-validate `gh` CLI JSON at the boundary so schema drift surfaces as `schema mismatch` instead of misleading "Failed to parse JSON" (closes [#2962](https://github.com/nexus-substrate/nexus-agents/issues/2962) site 4).

  `packages/nexus-agents/src/scm/github-provider.ts` had 5 parallel `JSON.parse(result.value) as Gh<X>Json` casts feeding mappers (`mapIssue`, `mapComment`, `mapPRStatus`) that dereferenced nested fields like `raw.labels.map((l) => l.name)` and `raw.author.login`. When `gh` CLI returned the JSON in an unexpected shape (rename, removed nullable, missing nested object), the deref blew up with a TypeError that the surrounding `try/catch` then rewrapped as `Failed to parse <X> JSON: …` — misleading: the JSON parsed fine; the shape mismatched. Operators debugging this chased a parser bug that didn't exist.

  The fix:
  - Added four `z.object(...)` schemas mirroring each `--json <fields>` projection: `GhIssueJsonSchema`, `GhCommentJsonSchema`, `GhPrJsonSchema`, `GhPrStatusJsonSchema`.
  - Extracted a `safeParseGhJson<T>(rawJson, schema, label)` helper that does `JSON.parse` → `schema.safeParse` and distinguishes the two failure modes:
    - `<label>: Failed to parse JSON: …` (gh returned non-JSON — html error page, empty output)
    - `<label>: schema mismatch — <path>: <message>` (gh returned valid JSON in an unexpected shape, with Zod's path pointing at the broken field)
  - Replaced all 5 raw casts in `getIssue`, `listIssues`, `createPR`, `getPRStatus`, `listComments`.

  Same Zod-validate-at-the-boundary pattern as [#2932](https://github.com/nexus-substrate/nexus-agents/issues/2932) (policy-engine), [#2943](https://github.com/nexus-substrate/nexus-agents/issues/2943) (PaperEntry), and [#2962](https://github.com/nexus-substrate/nexus-agents/issues/2962) sites 1+3 (repo-analyze + issue-command, already shipped).

  2 regression tests added: schema-drift surfaces the new typed error with the broken-field path; non-JSON output surfaces the parse-failure label distinctly. 15 tests pass (was 13).

- [#3030](https://github.com/nexus-substrate/nexus-agents/pull/3030) [`49f14d5`](https://github.com/nexus-substrate/nexus-agents/commit/49f14d50e0831f2d871ca1f036e011c1d5cae98d) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **fix(observability):** subprocess timing logs now carry a `requestId` for correlation (closes [#2963](https://github.com/nexus-substrate/nexus-agents/issues/2963) site 3).

  `subprocess-adapter.ts:logTimingBreakdown` emits `'Subprocess timing'` at `info` level on every subprocess close, with the explicit goal (per JSDoc) of _"group by cli + provider + model and surface tail-latency outliers."_ Pre-fix the log had no per-call correlation key — multiple subprocesses for the same CLI run concurrently in pipelines and consensus votes, so the timing entries for the same CLI couldn't be disambiguated. Identifying which timing row belonged to which `executeTask` call was impossible from the logs alone.

  The fix generates a per-`executeTask` `requestId = generateHyphenId('cli-req', 8)` and threads it through:
  - `executeTask` → `spawnSubprocess` (initial attempt)
  - `executeTask` → `retryTransient` → `spawnSubprocess` (every retry uses the same `requestId` so retries-of-the-same-call group together)
  - `spawnSubprocess` → `setupChildProcessHandlers` (refactored to an opts-object to stay under the 5-param cap) → the `child.on('close')` handler
  - `logTimingBreakdown(state, startTime, code, requestId)` — emits `requestId` alongside the existing `cli` / `totalMs` / `spawnLatencyMs` / etc.

  `requestId` also appears in the `'Retrying transient error'` debug log so all log lines for a single call (initial attempt + retries + final timing) carry the same correlation key.

  The ID is adapter-internal — it doesn't propagate up to MCP. CliTask's contract is unchanged.

  37 existing tests pass; tsc + eslint clean. Added a `/* eslint-disable max-lines */` to the file header since the threading bumped the line count just past the 400-line cap (the file is one cohesive base-adapter class, governance allows 400-600 for cohesive files).

  Closes [#2963](https://github.com/nexus-substrate/nexus-agents/issues/2963) site 3. (Sites 1, 2, 4 shipped in [#3002](https://github.com/nexus-substrate/nexus-agents/issues/3002).)

- [#3029](https://github.com/nexus-substrate/nexus-agents/pull/3029) [`4422ca4`](https://github.com/nexus-substrate/nexus-agents/commit/4422ca4812b4bf0c45443c84cd52ae9617996cae) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **feat(workflows):** `run_workflow` MCP tool now accepts an optional `timeoutMs` input to override the per-phase execution budget (closes [#3017](https://github.com/nexus-substrate/nexus-agents/issues/3017)).

  Pre-fix, the per-phase execution timeout was always `workflow.timeout` (set in the template YAML) or the engine's `defaultTimeoutMs` — known-long templates like `security-audit` over a large repo couldn't be given a one-off larger budget without editing the template. [#2931](https://github.com/nexus-substrate/nexus-agents/issues/2931) surfaced the need: a 120s default-tripped run was un-debuggable; [#3017](https://github.com/nexus-substrate/nexus-agents/issues/3017) follows up with the ability to extend the budget for legitimately-slow workloads.

  ### Wiring (top to bottom)
  - **`RunWorkflowInputSchema`** (`mcp/tools/run-workflow-types.ts`): added optional `timeoutMs: z.number().int().min(1000).max(1_800_000)` — bounded to [1s, 30min] to prevent both flapping cancellations and unbounded hangs that would defeat the timeout-mismatch telemetry.
  - **MCP tool schema** (`mcp/tools/run-workflow.ts`): added `timeoutMs` to the `inputSchema` so the field appears in the tool advertisement.
  - **`handleRunWorkflow`**: extracts `timeoutMs` from validated args and threads it into `executeWorkflow` as `{ stepTimeoutMs: timeoutMs }` (renamed to `phaseTimeoutMs` internally — see the docstring update on `IWorkflowEngine.execute`).
  - **`executeWorkflow`**: passes `{ phaseTimeoutMs }` to `workflowEngine.execute()`.
  - **`IWorkflowEngine.execute`** (`core/types/workflow.ts`): added the optional third `options?: { phaseTimeoutMs?: number }` parameter (documented as winning over both `workflow.timeout` and the engine's `defaultTimeoutMs`).
  - **`WorkflowEngine.execute` → `runExecution` → `executePhases`**: threads `phaseTimeoutMs` down to the `ExecutionOptions` builder, where it now wins over `workflow.timeout ?? this.config.defaultTimeoutMs`.

  ### Semantic clarification

  This overrides the per-phase **overall** execution timeout — `executeParallel`'s `setupOverallTimeout`. It is NOT a per-step timeout (per-step uses `step.timeout` from the workflow definition, separately). The docstrings and schema descriptions explicitly say "per-phase" to avoid the same confusion that `run_dev_pipeline`'s identically-named-but-dead `timeoutMs` field already creates.

  ### Test coverage

  2 new tests in `workflow-engine.test.ts`:
  - `threads phaseTimeoutMs option down to executePhase ExecutionOptions` — passing `{ phaseTimeoutMs: 999_999 }` wins over a template with `timeout: 5000`.
  - `falls back to workflow.timeout when phaseTimeoutMs is omitted` — omitting the option correctly uses `workflow.timeout`.

  26 tests pass (was 24); `tsc + eslint` clean.

  Closes [#3017](https://github.com/nexus-substrate/nexus-agents/issues/3017). [#2931](https://github.com/nexus-substrate/nexus-agents/issues/2931)'s other deferred follow-up ([#3016](https://github.com/nexus-substrate/nexus-agents/issues/3016), first-step adapter hang root cause) is separate.

- [#3028](https://github.com/nexus-substrate/nexus-agents/pull/3028) [`031313e`](https://github.com/nexus-substrate/nexus-agents/commit/031313ea256a2f5ee6e224b252825633b1e1f662) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **fix:** 3 small isolated bugs surfaced by the deep audit ([#3026](https://github.com/nexus-substrate/nexus-agents/issues/3026) findings 3–5).

  PR 1 of [#3026](https://github.com/nexus-substrate/nexus-agents/issues/3026) — three independent fixes, each < 30 LOC + a regression test, no contract changes.

  ### Finding 5 — circuit breaker `failureCount` grows monotonically across recoveries

  `packages/nexus-agents/src/cli-adapters/circuit-breaker.ts:212-227`. `transitionTo('open',…)` only zeroed failure/success counts when going to `'closed'`. After a `half-open → open → half-open` cycle, `failureCount` carried over — under flaky failure patterns (intermittent rate-limit + recovery), `getSnapshot().failureCount` and `CircuitStateChangeEvent.failureCount` grew without bound across cycles, even though each cycle's failures had already served their threshold purpose. Operator dashboards / alerts triggered on absolute failure count saw misleading inflation. **Fix:** reset `failureCount = 0` on transitions to `'half-open'`.

  ### Finding 4 — capacity tracker over-counts requests; sliding window vs tumbling reset mismatch

  `packages/nexus-agents/src/cli-adapters/capacity-tracker.ts:122-216`. `usageHistory` was slide-pruned (entries older than `now - windowMs` shifted off), but `requestCount` was only reset by the "tumbling" branch (`windowStart < cutoff`), which fires whenever the _earliest_ request is older than `windowMs` — even though more-recent requests are still inside the sliding window. Result: continuous traffic across a window boundary triggered a mass-prune that incorrectly dropped current-window requests, making `remainingRequests === 0` exhaustion fire prematurely (or too late) depending on burst pattern. Upstream routing (`composite-router-helpers.fetchCapacityData`) then re-routed away from a CLI that actually had capacity.

  **Fix:** added a parallel `requestTimestamps: number[]` array that is slide-pruned identically to `usageHistory`; `requestCount` is now derived from `.length` after pruning. Dropped the tumbling-reset branch in `pruneOldEntries` — both arrays now use pure sliding-window semantics. `windowStart` is rebased to the earliest remaining entry (used by `resetTime` reporting), falling back to `now` when both arrays are empty.

  ### Finding 3 — stagger delay compounds with bounded concurrency

  `packages/nexus-agents/src/orchestration/aorchestra/worker-dispatcher.ts:485-488`. The stagger delay applied `taskIndex * staggerDelayMs` (absolute index), but `executeWithConcurrencyLimit` only runs `maxConcurrency` workers in parallel — tasks beyond that already wait naturally for a slot to free, then _additionally_ slept `taskIndex * staggerDelayMs`. For a wave of 10 with `maxConcurrency=3` and 500ms stagger, `tasks[9]` slept 4500ms AFTER waiting for `tasks[0-6]` to complete, defeating the rate-limit-burst-prevention goal (by the time `tasks[9]` ran, the API burst window had long since cleared).

  **Fix:** modulo by `maxConcurrency` so the stagger applies within each concurrency slot without compounding across them.

  ### Test coverage

  3 new regression tests (1 per finding): failureCount reset across recovery cycles, sliding-window request counting across a boundary, stagger non-compounding with `maxConcurrency=2` + 5-task wave. 150 tests pass across the 3 affected test files (was 147).

  ### What's left on [#3026](https://github.com/nexus-substrate/nexus-agents/issues/3026)

  PR 2 will tackle findings 1+2 together — the SIGKILL escalation + AbortSignal threading through `ICliAdapter.execute`. That's a contract change touching all 5 concrete adapters + 3 call sites (parallel-exploration, watchdog, consensus-plan); deserves its own focused review.

## 2.83.1

### Patch Changes

- [#3015](https://github.com/nexus-substrate/nexus-agents/pull/3015) [`fcdd62f`](https://github.com/nexus-substrate/nexus-agents/commit/fcdd62ffc88f9d4aefa3be77dbdd50f7ef89e75d) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **fix(workflows):** `run_workflow` failure envelope is now queryable — real `executionId` + `durationMs` instead of `'unknown'`/`0`.

  Pre-fix, every timed-out or failed `run_workflow` MCP call returned `{ executionId: 'unknown', durationMs: 0, ... }`. The two values are queried by clients via `query_trace(runId=...)` and weather-report dashboards — so a hung run was effectively un-debuggable from the client side. (See [#2931](https://github.com/nexus-substrate/nexus-agents/issues/2931) for the original repro: 4 of 5 substantive calls hit the 120s step timer with `executionId: 'unknown'`.)

  Root cause was a missing wire between two layers:
  - `parallel-executor.ts:createStepError` builds a `WorkflowError` with `{ stepId, error }` context — the step's diagnostic, but no run-level id.
  - `workflow-engine.ts:runExecution` returned that inner error as-is when steps failed, so `executionId` never reached the caller.
  - `mcp/tools/run-workflow-helpers.ts:createFailedResult` hardcoded `'unknown'` and `0` for both fields.

  The fix:
  1. **`workflow-engine.ts:runExecution`** now wraps the inner step-failure error to enrich the context with `executionId` + elapsed `durationMs` (preserving the original message + the per-step `stepId` for diagnostic continuity).
  2. **`createFailedResult`** accepts optional `{ executionId, durationMs }` opts and keeps the legacy sentinels as defaults for backwards compatibility with any other caller.
  3. **`run-workflow.ts:handleRunWorkflow`** extracts both from the enriched error context via a `buildFailureEnvelope` helper (split out to keep complexity under the 10-cap).

  Out of scope (filed as follow-up for [#2931](https://github.com/nexus-substrate/nexus-agents/issues/2931)): item 1 (root-cause investigation of the first-step adapter hang) and item 4 (per-call `timeoutMs` parameter). Those need a separate PR — this one closes the debuggability gap so the root cause can actually be traced via `query_trace` next time.

  5 regression tests added (1 in `workflow-engine.test.ts` for the enrichment, 4 in `run-workflow-helpers.test.ts` for envelope shape across opt combinations).

- [#3013](https://github.com/nexus-substrate/nexus-agents/pull/3013) [`ebaef6f`](https://github.com/nexus-substrate/nexus-agents/commit/ebaef6f0afebebdd9302730ffa60ed92abcf7da4) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **cleanup(pipeline):** delete the two unwired [#1737](https://github.com/nexus-substrate/nexus-agents/issues/1737) Phase-4 scaffolds.

  `pipeline/incomplete-result.ts` (85 LOC) and `pipeline/dynamic-expert.ts` (123 LOC) were exported in [#1737](https://github.com/nexus-substrate/nexus-agents/issues/1737) Phase 4 as partial-completion plumbing and bounded runtime-expert plumbing respectively. Both were exported on `pipeline/index.ts` and `exports/pipeline.ts` and exercised by `phase4.test.ts` (273 LOC) — but tree-wide grep found zero non-test, non-barrel callers. No stage ever returned an `IncompleteResult`; nothing gated on `canPipelineProceed`; the PM/Orchestrator path that the `DynamicExpertManager` docstring described was never built.

  YAGNI call: adopt or delete. Deleted. Closes [#2939](https://github.com/nexus-substrate/nexus-agents/issues/2939).

  Removed:
  - `packages/nexus-agents/src/pipeline/incomplete-result.ts` (and exports: `IncompleteResult`, `IncompleteSeverity`, `isIncompleteResult`, `createIncompleteResult`, `canPipelineProceed`, `filterBySeverity`).
  - `packages/nexus-agents/src/pipeline/dynamic-expert.ts` (and exports: `DynamicExpertManager`, `MAX_DYNAMIC_EXPERTS`, `DynamicExpertSpec`, `DynamicExpert`).
  - `packages/nexus-agents/src/pipeline/phase4.test.ts` (only tested the two deleted scaffolds).
  - Re-exports through `pipeline/index.ts` and `exports/pipeline.ts`. `SharedMemoryStore` (the only [#1737](https://github.com/nexus-substrate/nexus-agents/issues/1737) Phase-4 scaffold with actual standalone value) is kept — see the sibling [#2937](https://github.com/nexus-substrate/nexus-agents/issues/2937) cleanup.

  If the use cases come back (typed partial-completion, dynamic runtime experts), reintroduce with both producer AND consumer in the same PR — the lesson [#2937](https://github.com/nexus-substrate/nexus-agents/issues/2937), [#2938](https://github.com/nexus-substrate/nexus-agents/issues/2938), [#2921](https://github.com/nexus-substrate/nexus-agents/issues/2921), and this issue all surface.

- [#3021](https://github.com/nexus-substrate/nexus-agents/pull/3021) [`28252b4`](https://github.com/nexus-substrate/nexus-agents/commit/28252b40ceb8a31623eae6fe02fbabaf60397b2c) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **refactor(cli-adapters):** retire the unwired DAAO difficulty estimator (closes [#2940](https://github.com/nexus-substrate/nexus-agents/issues/2940)).

  DAAO (Difficulty-Aware Agent Orchestration, arXiv:2509.11079) was prototyped under Issue [#334](https://github.com/nexus-substrate/nexus-agents/issues/334) and exported from `cli-adapters/index.ts` as `DAAOEstimator` / `createDAAOEstimator` / `estimateDAAODifficulty` / `routeByDAAODifficulty` / `encodeTaskFeatures` plus a full Zod-validated config + 8-dimensional feature surface. But `[#334](https://github.com/nexus-substrate/nexus-agents/issues/334)` ended up implemented via `ZeroRouter` — `composite-router.ts` consumes `decision.difficulty` / `decision.tier` from ZeroRouter for fast/balanced/powerful tier selection, and never touches DAAO. The only non-test consumer was `routing-integration.test.ts`, which existed primarily to compare DAAO against ZeroRouter.

  Continuing the activation-or-delete YAGNI sweep from [#2937](https://github.com/nexus-substrate/nexus-agents/issues/2937), [#2938](https://github.com/nexus-substrate/nexus-agents/issues/2938), [#2939](https://github.com/nexus-substrate/nexus-agents/issues/2939), [#3018](https://github.com/nexus-substrate/nexus-agents/issues/3018).

  ## Removed
  - `packages/nexus-agents/src/cli-adapters/daao-estimator.ts` (387 LOC)
  - `packages/nexus-agents/src/cli-adapters/daao-feature-extraction.ts` (386 LOC)
  - `packages/nexus-agents/src/cli-adapters/daao-types.ts` (274 LOC)
  - `packages/nexus-agents/src/cli-adapters/daao-estimator.test.ts` (819 LOC)
  - `packages/nexus-agents/src/cli-adapters/daao-feature-extraction.test.ts` (403 LOC)
  - `packages/nexus-agents/src/cli-adapters/routing-integration.test.ts` (1010 LOC) — primarily DAAO-vs-ZeroRouter comparison; ZeroRouter has its own dedicated 700-LOC test file (`zero-router.test.ts`) and CompositeRouter has 938 LOC + 7 additional helper test files, so the routing-integration coverage is preserved elsewhere.
  - All DAAO entries from `cli-adapters/index.ts` (5 values + 9 types + 9 schemas/constants).
  - DAAO mention in `utils/text-utils.ts` consumers comment.

  ## Doc updates
  - `docs/architecture/ROUTING_SYSTEM.md`: replaced the "DAAO Difficulty Estimator" section with a "Difficulty Estimation" note pointing at ZeroRouter; updated the Source Files table; removed DAAO from the Research Sources table.
  - `docs/research/RESEARCH_INDEX.md`: annotated the DAAO row as retired with link to [#2940](https://github.com/nexus-substrate/nexus-agents/issues/2940).
  - `docs/research/registry/techniques.yaml`: flipped `daao-difficulty-estimation.status` from `implemented` to `retired`, cleared `integration_files`, added a 2026-05-24 retirement decision entry with the ZeroRouter-supersedes rationale.

  ## Test plan
  - [x] `pnpm tsc --noEmit` clean post-deletion.
  - [x] `pnpm vitest run src/cli-adapters/composite-router.test.ts src/cli-adapters/zero-router.test.ts` → 125 pass (no regressions from losing routing-integration coverage).
  - [x] `pnpm eslint` on the 2 touched files clean.
  - [ ] CI: full matrix, governance + registry-coverage gates.

  ## If DAAO returns

  If a true alternate VAE-based estimator with different feature weights becomes a real production need, reintroduce alongside the wiring stage in `composite-router.ts` (or as an explicit alternate stage with a flag) in the same PR. Producer-without-consumer was what the issue called out as contributor confusion.

- [#3020](https://github.com/nexus-substrate/nexus-agents/pull/3020) [`98ae2ae`](https://github.com/nexus-substrate/nexus-agents/commit/98ae2ae9b17cacb75210c4540d71d4344d9799c4) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **fix(plugin):** marketplace.json now passes `claude plugin validate` (closes [#2983](https://github.com/nexus-substrate/nexus-agents/issues/2983)).

  Two schema violations the validator reported:
  1. **Missing top-level `owner`** — the schema referenced by the `$schema` URL requires an `owner` object alongside `name`/`description`/`plugins`. Added with `name` + `url` pointing at the maintainer GitHub profile.
  2. **`plugins[0].source` shape** — pre-fix used the `{ type: 'github', owner: 'williamzujkowski', repo: 'nexus-agents' }` triple. Schema-accepted form is `{ source: 'github', repo: 'williamzujkowski/nexus-agents' }` (single `repo` field with `owner/repo` slug, `source` key instead of `type`).

  Both fixes are mechanical — values are derived from the existing data; no behavior change beyond the validator now passing.

- [#3019](https://github.com/nexus-substrate/nexus-agents/pull/3019) [`2efec78`](https://github.com/nexus-substrate/nexus-agents/commit/2efec78cee1a904c4fc9b5354cafc40ff2776a35) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **refactor(cli-adapters):** delete 3 exported-but-unused symbols (closes [#3018](https://github.com/nexus-substrate/nexus-agents/issues/3018)).

  Continuing the [#2937](https://github.com/nexus-substrate/nexus-agents/issues/2937)/[#2938](https://github.com/nexus-substrate/nexus-agents/issues/2938)/[#2939](https://github.com/nexus-substrate/nexus-agents/issues/2939)/[#2940](https://github.com/nexus-substrate/nexus-agents/issues/2940) activate-or-delete sweep. Three symbols on `cli-adapters/index.ts` had zero non-test, non-barrel callers anywhere in the tree, and none were re-exported through the documented `packages/nexus-agents/src/exports/` public API:
  - **`generateObject`** (`generate-object.ts`, 244 LOC) — Zod-schema-driven retry-with-feedback structured-output helper. Tested in `generate-object.test.ts` (222 LOC). No production caller.
  - **`createCircuitBreakerRegistryWithMetrics`** (`circuit-breaker.ts:384`) — a wrapper that added a state-change logging listener to `CircuitBreakerRegistry`. Tested but never wired into the real adapter pipeline.
  - **`integrateCapacityMonitorWithCircuitBreaker`** (`circuit-breaker.ts:455`) + its `CapacityMonitorIntegrationConfig` interface — bridge that would trip circuits on low-capacity signals (Issue [#543](https://github.com/nexus-substrate/nexus-agents/issues/543)'s "wire up onLowCapacity callback"). The bridge was built; the callback wire-up never landed.

  Removed:
  - `packages/nexus-agents/src/cli-adapters/generate-object.ts` + its test file (466 LOC total).
  - The two functions + interface + default-config block (~107 LOC) at the bottom of `circuit-breaker.ts`.
  - Their test blocks (~261 LOC across two `describe` sections) in `circuit-breaker.test.ts`.
  - Six entries on `cli-adapters/index.ts` (5 values + 1 type re-export).

  Preserved:
  - `CircuitBreakerRegistry`, `CliCircuitBreaker`, `CircuitError`, `mapCliErrorToCategory`, `categorizeError`, `DEFAULT_CIRCUIT_BREAKER_CONFIG` — these are the real production circuit-breaker surface and are actively used by adapters. Plus all their tests.

  63 circuit-breaker tests still pass (was 87 — the 24 tests for the two deleted functions are gone). `tsc` + `eslint` clean.

  If structured-output or capacity-monitor integration come back as real requirements, reintroduce them alongside the consumer code in the same PR. The pattern of producer-without-consumer is what [#2937](https://github.com/nexus-substrate/nexus-agents/issues/2937), [#2938](https://github.com/nexus-substrate/nexus-agents/issues/2938), [#2939](https://github.com/nexus-substrate/nexus-agents/issues/2939), and [#2940](https://github.com/nexus-substrate/nexus-agents/issues/2940) all surfaced — adopting that lesson now.

- [#3023](https://github.com/nexus-substrate/nexus-agents/pull/3023) [`6820949`](https://github.com/nexus-substrate/nexus-agents/commit/682094947684cb28c06da5678c77d355dba3fd6a) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **refactor:** delete 2 producer-less surfaces — learning-events + tool-output validation (closes [#3022](https://github.com/nexus-substrate/nexus-agents/issues/3022)).

  Second audit pass after the [#2937](https://github.com/nexus-substrate/nexus-agents/issues/2937)/[#2938](https://github.com/nexus-substrate/nexus-agents/issues/2938)/[#2939](https://github.com/nexus-substrate/nexus-agents/issues/2939)/[#2940](https://github.com/nexus-substrate/nexus-agents/issues/2940)/[#3018](https://github.com/nexus-substrate/nexus-agents/issues/3018) sweep — same activation-or-delete shape, this time in `orchestration/outcomes` and `mcp/middleware`.

  ### 1. `emitThresholdUpdate` + `emitTrendDetected` (Issue [#901](https://github.com/nexus-substrate/nexus-agents/issues/901) Phase 4 scaffolding)

  `packages/nexus-agents/src/orchestration/outcomes/learning-events.ts`. Both emit `learning.threshold_updated` / `learning.trend_detected` EventBus events and were exported through three barrels (`outcomes/index.ts`, `orchestration/index.ts`, `exports/orchestration.ts`). The adaptive-threshold computation in `adaptive-thresholds.ts` computes the threshold updates but never broadcasts them via these helpers — **and nothing in the codebase subscribed for these event types either.** Pure producer-less + subscriber-less scaffolding.

  Removed:
  - `orchestration/outcomes/learning-events.ts` (69 LOC) + its 143-LOC test file.
  - `LearningThresholdUpdatedEvent` + `LearningTrendDetectedEvent` interfaces in `pipeline/event-types.ts` + their literal entries in `PIPELINE_EVENT_TYPES` + the union members in the `PipelineEvent` discriminated union.
  - Re-exports through 3 barrel files.
  - `'exports learning event emitters'` test in `export-contracts.test.ts`.

  ### 2. `validateToolOutput` + `createOutputValidator` (Issue [#547](https://github.com/nexus-substrate/nexus-agents/issues/547) sibling)

  `packages/nexus-agents/src/mcp/middleware/validation.ts:121, 159`. The output-validation siblings of `validateToolInput` (which IS used everywhere). Exported through `mcp/middleware/index.ts` and tested in `validation.test.ts`, but no MCP tool ever called them — every tool returns its result without schema-validating first.

  Removed:
  - Both functions from `validation.ts` (~75 LOC).
  - Both test describes from `validation.test.ts` (~53 LOC across the two blocks).
  - Re-exports from `mcp/middleware/index.ts`.

  ### Preserved
  - `validateToolInput` + `createValidator` (Issue [#547](https://github.com/nexus-substrate/nexus-agents/issues/547)'s input-validation half) — actively used by every MCP tool; tests untouched.
  - `computeAdaptiveThresholds` + `detectTrend` — both have real consumers and stay exported.

  If learning-event broadcasting or per-tool output validation come back as real production requirements, reintroduce alongside the consumer/producer in the same PR — that's the recurring lesson from the entire [#2937](https://github.com/nexus-substrate/nexus-agents/issues/2937)–[#3022](https://github.com/nexus-substrate/nexus-agents/issues/3022) sweep.

  73 affected tests pass (`validation.test.ts` + `export-contracts.test.ts`). `tsc` clean.

## 2.83.0

### Minor Changes

- [#2998](https://github.com/nexus-substrate/nexus-agents/pull/2998) [`499d886`](https://github.com/nexus-substrate/nexus-agents/commit/499d8869d950f1422fea6d60ff4a54cae59413d3) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **feat(security):** wire `RequestContext.trustTier` end-to-end into V2 pipelines and access-policy derivation. Closes [#2957](https://github.com/nexus-substrate/nexus-agents/issues/2957), [#2993](https://github.com/nexus-substrate/nexus-agents/issues/2993), [#2994](https://github.com/nexus-substrate/nexus-agents/issues/2994).

  Three coupled security gaps converged on one missing wire — the caller's trust tier never reached the gates that needed it. This PR plumbs the value through:

  ### Producers
  - `pipeline/v2-orchestrate.ts:orchestrateInputToTaskContract` and `pipeline/v2-delegate.ts:delegateInputToTaskContract` both gained an `opts.trustTier?: string` parameter that, when provided, writes `metadata.trustTier` onto the constructed `TaskContract`. Pre-fix, neither producer wrote this field, so the V2 policy engine's only built-in rule (`trust-tier`) could not gate anything — it silently allowed every execute stage regardless of caller ([#2994](https://github.com/nexus-substrate/nexus-agents/issues/2994)).

  ### Callers
  - `mcp/tools/orchestrate.ts`: `createOrchestrateHandler` now threads `ctx.requestContext.trustTier` through `runOrchestratePipeline` → `executeOrchestrationWithDeadline` → `executeOrchestration` → `deriveOrchestratePolicy` and into `instrumentV2Orchestrate` → `orchestrateInputToTaskContract`.
  - `mcp/tools/delegate-to-model.ts`: similar — `createDelegateHandler` passes `ctx.requestContext.trustTier` into `instrumentV2Pipeline` → `delegateInputToTaskContract`.
  - `mcp/tools/execute-expert.ts`: runs through MCP's native task handler (not the `ContextAwareHandler` chain), so `RequestContext` is not directly available there. `deriveExpertAccessPolicy` now takes the trustTier as an explicit param; the call site currently passes `undefined`, which defaults to `'4'` (untrusted) — defensive default until proper end-to-end wiring lands as a follow-up.

  ### Gates
  - `mcp/tools/orchestrate.ts:deriveOrchestratePolicy` and `mcp/tools/execute-expert.ts:deriveExpertAccessPolicy`: the hardcoded `trustTier: '1'` ([#2993](https://github.com/nexus-substrate/nexus-agents/issues/2993)) is replaced with the threaded value, defaulting to `'4'` when missing. Pre-fix, every untrusted caller's input was treated as fully trusted by the LLM derivation, which would consistently produce a permissive policy regardless of actual caller risk.
  - `pipeline/policy-engine.ts:trustTierRule`: missing or non-numeric `pipelineState.trustTier` now defaults to `4` (untrusted) instead of the prior fail-open `undefined → allow`. With producer wiring in place, the only paths that hit the default are buggy producers or test fixtures — both should fail closed.

  ### Tests
  - `pipeline/policy-engine.test.ts`: updated the two "allows when trustTier is missing/invalid" tests to assert blocks-execute behavior; added "still allows non-execute stages" to confirm the default doesn't break planning paths.
  - 137 tests pass across the 6 affected test files (policy-engine, v2-orchestrate, v2-delegate, orchestrate, execute-expert, delegate-to-model). `tsc + eslint` clean.

  ### Migration / behavior change
  - Operators running V2 pipelines (`NEXUS_V2_ORCHESTRATE=true`, `NEXUS_V2_DELEGATE=true`, etc.) previously had no policy enforcement at all (the bug). Post-fix: legitimate callers via `orchestrate` and `delegate_to_model` get their real trust tier and pass through; programmatic callers that bypass `secure-handler` (or test fixtures that don't populate `pipelineState.trustTier`) now block at execute stages. This is the correct new behavior — the rule is finally doing its job.
  - The hardcoded `trustTier: '1'` removal means LLM-derived access policies may now be more restrictive for the same input under tier `'4'`. This is a real behavioral change but matches the documented intent of the trust-classification system.

  ### Follow-ups
  - Properly thread `RequestContext` (or equivalent caller info) into `execute-expert`'s background task handler path so its `trustTier` isn't always defaulted to `'4'`.
  - Audit producers other than orchestrate/delegate (none in current production code paths, but defensive coverage).

### Patch Changes

- [#3008](https://github.com/nexus-substrate/nexus-agents/pull/3008) [`e1cb697`](https://github.com/nexus-substrate/nexus-agents/commit/e1cb697e4ffafe725c07d1c3051035240038ca92) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **fix(cli):** `nexus-agents system-review --create-issue` silently failed on every run.

  `system-review-helpers.ts:createIssue` embedded the markdown review body in the command string as `gh issue create --body '<body>'`. The body has tables (`|`), `coveragePercent.toFixed(1)%` parens, and ET-timestamp parens, so the sandbox `validateArgs` gate (`DENIED_ARG_PATTERNS[0] = /[;&|\`$()]/`) rejected the argument, `safeExecSandboxed`warn-logged and returned null, and the CLI showed neither an issue URL nor a clear error. The GitHub Actions`system-review.yml` workflow bypasses this helper and was unaffected — the broken surface was the local CLI subcommand only.

  Same anti-pattern as [#2863](https://github.com/nexus-substrate/nexus-agents/issues/2863) (vote-command, fixed in [#2912](https://github.com/nexus-substrate/nexus-agents/issues/2912)) and [#2913](https://github.com/nexus-substrate/nexus-agents/issues/2913) (sprint-command, fixed in [#2916](https://github.com/nexus-substrate/nexus-agents/issues/2916)); this site was missed by the audit sweep. Fix: pipe the body via `--body-file -` over stdin. Title is `System Review: ${date}` (YYYY-MM-DD), metacharacter-free by construction. Closes [#2934](https://github.com/nexus-substrate/nexus-agents/issues/2934).

  Regression: 4 new tests in `system-review-helpers.test.ts` mirroring the `createSprintIssue` pattern — assert `--body-file -` is in the command string, `--body '` is not, the markdown body arrives over stdin, and the command string is free of shell metacharacters.

- [#3007](https://github.com/nexus-substrate/nexus-agents/pull/3007) [`38ea720`](https://github.com/nexus-substrate/nexus-agents/commit/38ea7207450d71f30cfa1d62012fdd495a9fa078) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **chore(mcp):** kill the duplicate `REGISTERED_TOOLS` array.

  Before: `cli-server-tools.ts:REGISTERED_TOOLS` and `mcp/tools/index.ts:REGISTERED_TOOL_NAMES` were two hand-maintained 38-entry arrays — both consumed by separate dispatch paths (allowlist log + `extractMcpTools` → `server.json`). Issue [#2935](https://github.com/nexus-substrate/nexus-agents/issues/2935) originally tracked them being out of sync; that drift was independently fixed but the duplication remained, ready to drift again.

  Now: `REGISTERED_TOOL_NAMES` is the single source of truth (exported from `mcp/tools/index.ts`, re-exported through `mcp/index.ts`), and `cli-server-tools.ts` aliases it as `REGISTERED_TOOLS` for backwards compatibility with `tool-annotations.test.ts` and the `registerToolCategories` allowlist-status log. `inject-governance.ts:extractMcpTools` already reads the same canonical const, so server.json sync is unaffected. Closes [#2935](https://github.com/nexus-substrate/nexus-agents/issues/2935).

  **Drive-by — registry-coverage gate hardening ([#2406](https://github.com/nexus-substrate/nexus-agents/issues/2406)).** The v1 line-based detection in `scripts/check-registry-coverage.ts` fires when any added/removed diff line contains the marker token. Adding `export` to the marker const tripped the false-positive class the v1 docstring explicitly called out ("Comment-only touches that mention the marker would false-positive — acceptable for v1; promote to AST-based detection if the noise rate gets high"). Added a structural-equivalence exemption: when the marker line is touched, extract the array contents from the PR pre-image and the working tree and skip the violation if the sorted-deduped lists are identical. Conservative — any extraction failure falls back to v1 line-based detection rather than incorrectly skipping a real wiring miss.

  Test contract change: the cli-server-tools test now compares the two arrays order-insensitively (sort-then-equal). The canonical const declares names in a different order than the legacy duplicate did, and the order has never been semantically meaningful — it's a name list, not a priority list.

- [#3009](https://github.com/nexus-substrate/nexus-agents/pull/3009) [`f1b2a7f`](https://github.com/nexus-substrate/nexus-agents/commit/f1b2a7fc9f7be74c0128d124b676fbcfbaedc5e1) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **fix(catalog):** add `init` to `COMMAND_CATALOG` so it appears in `nexus-agents --help`.

  `init` is a real CLI command — in the `CliCommand` type union, in `VALID_COMMANDS`, and dispatched via `ASYNC_COMMAND_HANDLERS` — but it had no entry in `COMMAND_CATALOG`, so `nexus-agents --help` and `nexus-agents --help --all` both omitted it and the catalog-driven extractors (`repo-index` + `entrypoints.yaml`) under-reported the command surface. Added an `advanced`-audience entry covering the `--portable`/`--install`/`--uninstall`/`--mcp-config`/`--opencode` flag set introduced across [#2305](https://github.com/nexus-substrate/nexus-agents/issues/2305) / [#2308](https://github.com/nexus-substrate/nexus-agents/issues/2308) / [#2311](https://github.com/nexus-substrate/nexus-agents/issues/2311) / [#2504](https://github.com/nexus-substrate/nexus-agents/issues/2504). Closes [#2936](https://github.com/nexus-substrate/nexus-agents/issues/2936).

- [#3012](https://github.com/nexus-substrate/nexus-agents/pull/3012) [`fe9311e`](https://github.com/nexus-substrate/nexus-agents/commit/fe9311ecaf617589b4985a62ee34c25ed505d111) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **cleanup(pipeline):** remove the write-only `SharedMemoryStore` integration with `PipelineContext`.

  Six pipeline stages (`research`, `plan`, `implement` × 2, `analyze`, `scan`) wrote to `ctx.sharedMemory` with comments like _"for downstream stages"_. Tree-wide grep finds zero `.read()` / `.readFromStage()` callers. The `SharedMemoryStore` was instantiated in `graph-pipeline-runner.ts:107` and threaded through `PipelineContext.sharedMemory`, but no consumer ever closed the loop. Same activate-or-delete YAGNI call as [#2921](https://github.com/nexus-substrate/nexus-agents/issues/2921) and [#2938](https://github.com/nexus-substrate/nexus-agents/issues/2938) (`createFeedbackSubscriber` advertised-not-wired).

  **Removed (the dead integration):**
  - `PipelineContext.sharedMemory` field (stage-types.ts) and the `SHARED_MEMORY` entry from `PIPELINE_STATE_KEYS`.
  - All 6 `ctx.sharedMemory.write(...)` calls in `stage-wrappers.ts`.
  - The `extractSymbolsForTask` helper — its only consumer was the now-removed implement-stage write, and the function had no other side effects.
  - `classifyImplementationTrust` — same story; was solely a sharedMemory writer.
  - `SharedMemoryStore` instantiation in `pipeline-graph.ts:createNodeHandler` and `graph-pipeline-runner.ts:runGraphPipeline`.
  - The corresponding test sections in `pipeline-eval-stages.test.ts`, `pipeline-eval.test.ts`, `pipeline-integration.test.ts`, `stage-wrappers.test.ts` that exercised propagation through `PipelineContext.sharedMemory`.

  **Preserved (the standalone utility):**
  - `SharedMemoryStore` class itself + its `pipeline/index.ts` and `exports/pipeline.ts` exports. It's a small tagged in-memory store that's useful on its own; future cross-stage handoff should route through `PipelineContext.state` with a documented `PIPELINE_STATE_KEYS` entry.
  - Direct-class coverage in `phase4.test.ts` (17 tests) and `pipeline-eval-edge.test.ts` (44 tests) untouched.
  - The `Pipeline Eval — SharedMemoryStore Performance` block in `pipeline-eval.test.ts` (now exercises the standalone class only).

  122 tests across the 6 affected test files still pass. Closes [#2937](https://github.com/nexus-substrate/nexus-agents/issues/2937).

- [#3011](https://github.com/nexus-substrate/nexus-agents/pull/3011) [`275bd53`](https://github.com/nexus-substrate/nexus-agents/commit/275bd53a1cef0f185dd9d665b1afd137e99b9c84) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **fix(pipeline):** wire the `createFeedbackSubscriber` bridge so the advertised feedback loop actually runs.

  `feedback-subscriber.ts`'s module docstring claimed it _"closes the feedback loop: execution → events → outcomes → routing"_ — but the only consumers were the unit test and two re-exports. No `PipelineRunner` or graph runner ever subscribed the bridge, so `EventBus` `model.called` / `stage.failed` events never reached `OutcomeStore` via this path.

  Added `startFeedbackSubscriber` / `shutdownFeedbackSubscriber` lifecycle wrappers around the existing `createFeedbackSubscriber` (kept that function intact for test-suite use). Wired into:
  - `cli-server-tools.ts:initV2PipelineSubsystems` — starts the subscription once on server init, paired with the EventBus bridge wiring.
  - `cli-server.ts:createShutdownCleanup` — releases the subscription on SIGTERM teardown (same lifecycle slot as `shutdownExpertBridge` from [#2946](https://github.com/nexus-substrate/nexus-agents/issues/2946)).

  Both start and shutdown are idempotent. 4 new regression tests cover: subscription wires correctly, idempotency on repeated start, shutdown releases the subscription, double-shutdown does not throw. Closes [#2938](https://github.com/nexus-substrate/nexus-agents/issues/2938).

- [#3010](https://github.com/nexus-substrate/nexus-agents/pull/3010) [`4ac1ebf`](https://github.com/nexus-substrate/nexus-agents/commit/4ac1ebffdf54e4415800ff4d434f170f992d4529) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **refactor(types):** drop the `as unknown as` cast around `OrchestratorFactoryConfig.techLead`.

  `cli-server-tools.ts:createOrchestratorForOrchestration` cast a real `Orchestrator` instance to `{ execute: (task: unknown) => Promise<Result<unknown, unknown>> }` because `OrchestratorFactoryConfig.techLead` and `orchestratorAgent` had that wide shape. The cast hid two type-safety regressions:
  - **Input widening to `unknown`** — if any caller ever wired a non-`Task` value into the factory, `BaseAgent.execute` would surface opaque Zod/structural failures from inside the agent instead of a compile-time error.
  - **Error erasure** — discriminating `AgentError` codes at catch sites was impossible because the surfaced error type was `unknown`.

  Introduced `OrchestratorAgentLike = { execute(task: Task): Promise<Result<unknown, unknown>> }` (exported from `orchestrator-adapters.ts` — the same module that already used this exact shape internally on `OrchestratorAdapter.setOrchestrator`). Used it for both `techLead` and `orchestratorAgent` config fields. `puppeteerOrchestrator` stays `{ execute(task: unknown) => ... }` — Puppeteer takes arbitrary policy-shaped tasks, not the core `Task` type. `Result<TaskResult, AgentError>` → `Result<unknown, unknown>` is sound by covariance; kept the error wide because `orchestrator-adapters.test.ts` covers `err('string-error')` (non-`Error` failures the adapter is intentionally resilient to).

  The cast and the now-unused `Result` import in `cli-server-tools.ts` are gone. Closes [#2944](https://github.com/nexus-substrate/nexus-agents/issues/2944).

- [#3003](https://github.com/nexus-substrate/nexus-agents/pull/3003) [`6e94d42`](https://github.com/nexus-substrate/nexus-agents/commit/6e94d42bd619fc6799c67798d0b6e0ec6a9a3efb) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **fix(adapters):** `withModelNotFoundFallbackResilient` no longer silently drops future methods on `T`. Closes [#2945](https://github.com/nexus-substrate/nexus-agents/issues/2945).

  Pre-fix `Object.assign(wrapped, { 5 bound methods }) as unknown as T` silently dropped any methods on a concrete `T` (e.g. a future `IResilientAdapter` subtype with `getMetrics()`) beyond the 5 explicitly re-attached. The type system claimed they were present; callers hit `TypeError: x.getMetrics is not a function` at runtime.

  Fix: wrap the explicit-binding object in a `Proxy` that forwards unknown property access to `inner`. The five explicit bindings are kept so existing health/lifecycle methods are pre-bound (avoids losing `this` if the caller destructures), matching prior semantics for the existing surface. New methods on `T` are now transparently available without the wrapper needing to know about them.

  19 tests pass against the new implementation; tsc + eslint clean.

- [#2999](https://github.com/nexus-substrate/nexus-agents/pull/2999) [`56ffe89`](https://github.com/nexus-substrate/nexus-agents/commit/56ffe89cb82fada5ffd09674bc4c3ae1439565b0) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **fix(pipeline):** cleanup the cached MCP-config tempdir on shutdown. Closes [#2946](https://github.com/nexus-substrate/nexus-agents/issues/2946).

  `expert-bridge.getMcpConfigPath` cached the path returned by `generateMcpConfig` but threw away the `cleanup` function that came with it, so the parent `mkdtemp` (`<tmpdir>/nexus-mcp-XXXXXX/`) accumulated one entry per daemon lifetime. Per-process not per-call (caching limits the blast radius), but stale tempdirs piled up across `nexus-agents --mode=server` restarts.

  Fix: store the cleanup alongside the cached path; expose `shutdownExpertBridge()`; wire it into `cli-server.ts:createShutdownCleanup` next to `shutdownToolMemory()`. Cleanup is idempotent, never throws (failures log + swallow).

  89 tests pass across the affected test files (cli-server, agent-executor, pipeline-eval-edge, research-trigger); tsc + eslint clean.

- [#3004](https://github.com/nexus-substrate/nexus-agents/pull/3004) [`cc285bc`](https://github.com/nexus-substrate/nexus-agents/commit/cc285bce3108e4d945ffa25c5cc3497346a149cb) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **docs(routing):** update `composite-router` @module + 2 architecture docs to list the actual pipeline stages. Closes [#2947](https://github.com/nexus-substrate/nexus-agents/issues/2947).

  The pre-2026 docstring claimed the pipeline was 5 stages (`Budget → ZeroRouter → Preference → TOPSIS → LinUCB`), pre-dating [#755](https://github.com/nexus-substrate/nexus-agents/issues/755) / [#1350](https://github.com/nexus-substrate/nexus-agents/issues/1350) / [#1686](https://github.com/nexus-substrate/nexus-agents/issues/1686) / [#1790](https://github.com/nexus-substrate/nexus-agents/issues/1790) / [#2414](https://github.com/nexus-substrate/nexus-agents/issues/2414). The real pipeline `composite-router-stages.ts:runPipeline` has ~12 stages, including two that can **short-circuit** routing (`QualityConstraint`, `CategoryOverride`). A maintainer debugging "why was my model rejected?" reading the old 5-stage line would never find them.

  Updated:
  - `cli-adapters/composite-router.ts` module docstring — full 8-step ordered list with short-circuit notes
  - `docs/architecture/ROUTING_SYSTEM.md` overview diagram — full pipeline + the same short-circuit callout
  - `docs/design/components.md` CompositeRouter line — full stage list + link to `ROUTING_SYSTEM.md` for rationale

  Docs-only change; 68 routing tests pass unchanged.

- [#3000](https://github.com/nexus-substrate/nexus-agents/pull/3000) [`5911376`](https://github.com/nexus-substrate/nexus-agents/commit/5911376be41082e94dd034577f9a2d46aade9b6e) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **fix:** four silent `catch {}` sites now log the swallowed error. Closes [#2952](https://github.com/nexus-substrate/nexus-agents/issues/2952).

  Each pre-fix collapsed a real failure mode (subprocess error, DB lock, schema mismatch, import error) into a sentinel value with no log trail — operators saw degraded behavior with no way to diagnose.
  - `cli-adapters/factory.ts:167` — `isCliAvailable` catch dropped probe exceptions; "unavailable" gave no clue whether the binary was missing, probe timed out, or auth failed. Now the cached `message` field carries the error string. Extracted `cacheHealthCheckFailure` helper to keep the function under the complexity-10 cap.
  - `mcp/tools/consensus-vote.ts:399` — `runContrarianCheck` catch silently disabled the escalation guardrail on `executeExpert` failure, JSON parse failure, or expert-bridge import error. Now logs at `warn` with the error message; the default "no escalation" envelope is preserved.
  - `cli-adapters/composite-router-stages.ts:453, 716` — `getPerformanceDataForCategory` and `getWeatherBonusForTask` catches silently disabled the performance-floor penalty and weather bonus on OutcomeStore read failures. Empty-Map fallback is the right behavior (no data → no signal), but now the debug log gives operators a trail when something stops working.

  135 tests pass across the 3 affected test files; tsc + eslint clean.

- [#3006](https://github.com/nexus-substrate/nexus-agents/pull/3006) [`94dad31`](https://github.com/nexus-substrate/nexus-agents/commit/94dad31f99a3a73f11ee224bb406aa899b466a6f) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **test:** handler-branch coverage for `issue_triage` (closes [#2953](https://github.com/nexus-substrate/nexus-agents/issues/2953) site 1).

  The `issue_triage` handler closure has three branches whose envelope shape flows into MCP transport, the audit log, and the adaptive-routing OutcomeStore — but `issue-triage-tool.test.ts` covered only the input schema. A refactor that swapped `recordTriageOutcome(false)` and `recordTriageOutcome(true)` would have shipped green and inverted the adaptive routing signal for the `planning` category forever.

  Added `mcp/tools/issue-triage-tool-handler.test.ts` (separate file because it needs a module-level mock of `dogfooding/issue-triage.js` that the sibling test relies on being real) with 3 tests covering:
  1. Validation failure returns a structured `validation` error envelope and never invokes triage.
  2. Triage failure returns a structured `internal` error envelope carrying the underlying cause message (asserts the error-path side of `recordTriageOutcome`).
  3. Success returns a JSON-stringified `TriageResponse` (asserts the success-path side of `recordTriageOutcome`).

  Also exported a `_testing.createIssueTriageHandler` surface from the tool module so the handler is testable without bypassing types — same pattern the sibling tools use (`search-codebase-tool`, etc.).

  9 tests pass across the 2 issue-triage test files (6 schema + 3 handler-branch); tsc + eslint clean.

  The other two [#2953](https://github.com/nexus-substrate/nexus-agents/issues/2953) gaps (login-command exit-code truth-table; the broader "wrapper-only-tested vs branch-tested" sweep) are deferred to a follow-up.

- [#3005](https://github.com/nexus-substrate/nexus-agents/pull/3005) [`0d3ae4f`](https://github.com/nexus-substrate/nexus-agents/commit/0d3ae4f6af229cec76651f58b5effaf6ee1c25a4) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **perf:** three hot-path inefficiencies from [#2955](https://github.com/nexus-substrate/nexus-agents/issues/2955).
  - **Site 1 — `OutcomeStore.query()` full-array filter per executeTask.** The composite-router calls this inside `computeQualityReward()` on every single executeTask with `{ cli, limit: 20 }`. Pre-fix did `entries.filter(...).slice(-limit)` — a full O(N) scan of all ~10 000 entries even when only 20 matches were needed. At default cap × 30-stage workflow that was ~300 000 unnecessary predicate evaluations per workflow. Added `tailScan(entries, filter, limit)` that walks from the tail backward and stops once `limit` matches accumulate, then reverses for chronological order. Preserves "last N matching" semantics; the limit-undefined path still uses `applyFilters` to keep that surface unchanged.
  - **Site 2 — `OutcomeStore.queryByModelWithFamilyFallback()` walked entries twice.** Pre-fix called `applyFilters(this.entries, base)` for the literal-id matches, then again for the same-vendor/same-family matches. 2× O(N) for a single-pass partition. Extracted `partitionByLiteralAndFamily` helper that collects both buckets in one walk. Family bucket includes literal-id matches — the family-broadened result remains a superset of literal, matching pre-fix semantics.
  - **Site 3 (partial) — `tool-wrapper.appendTimeoutMismatchEvent` dir cache.** Pre-fix did `existsSync` on every call to check the telemetry dir. Added an `ensuredDirs` Set so the existsSync runs at most once per dir per process. The full sync→async write conversion is deferred to a follow-up: `tool-wrapper-budget-check.test.ts` reads the JSONL synchronously after `await callback(...)`, and the test contract assumes the write is visible — switching to `fs.promises.appendFile` (fire-and-forget) broke those tests. The cheap part of the perf win lands now; the larger one needs a test-helper that awaits pending writes.

  72 tests pass across `outcome-store.test.ts` (63) and `tool-wrapper-budget-check.test.ts` (9); tsc + eslint clean.

  Site 4 (`RoutingMemory.getPreferences` iterates CLI_NAMES with per-CLI MobiMem lookup per recommendation) deferred — needs a reverse-index keyed by `preferenceKey → CliName[]` populated on `storePreference`, larger scope than this PR is taking.

- [#3001](https://github.com/nexus-substrate/nexus-agents/pull/3001) [`2342066`](https://github.com/nexus-substrate/nexus-agents/commit/23420669835abaa313a8042de6dc48007beeed01) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **fix(validation):** Zod-validate two external-payload boundaries. Partial fix for [#2962](https://github.com/nexus-substrate/nexus-agents/issues/2962) (3 of 4 sites — the 4th was already fixed in [#2990](https://github.com/nexus-substrate/nexus-agents/issues/2990)).
  - **[#2962](https://github.com/nexus-substrate/nexus-agents/issues/2962) site 1 — `mcp/tools/repo-analyze.ts:426`.** `JSON.parse(metaJson.trim()) as GhRepoMetadata` on `gh api repos/{repoId}` stdout. A GitHub-side schema drift produced a typed-but-mismatched object that either crashed deep in `analyzeRepo` or silently surfaced a wrong field (same shape as [#2943](https://github.com/nexus-substrate/nexus-agents/issues/2943)). Added `GhRepoMetadataSchema` (Zod) and `safeParse`; failures throw with a payload preview instead of corrupting the downstream analysis.
  - **[#2962](https://github.com/nexus-substrate/nexus-agents/issues/2962) site 3 — `cli/issue-command.ts:37`.** `JSON.parse(output) as { number; title; … }` on `gh issue view`. Any GitHub-schema drift threw `TypeError` inside the outer `catch` and surfaced as the misleading "issue not found." Split error handling: gh-exit failures still return `null`, but malformed JSON or schema mismatches now write a diagnostic line to stderr before returning `null` — operators can see the actual cause.
  - **[#2962](https://github.com/nexus-substrate/nexus-agents/issues/2962) site 2 — `pipeline/pipeline-checkpoint.ts:157`** was fixed in [#2990](https://github.com/nexus-substrate/nexus-agents/issues/2990) (closes [#2981](https://github.com/nexus-substrate/nexus-agents/issues/2981), same schema-cast pattern). No further action needed.
  - **[#2962](https://github.com/nexus-substrate/nexus-agents/issues/2962) site 4 — `scm/github-provider.ts:107` + 4 parallel sites** (P2, 5 casts feeding mappers that dereference `raw.labels.map`). **Deferred to a follow-up issue** because it spans 5 call sites with a shared schema set — bigger scope than this PR is taking.

  98 tests pass across the 2 changed files (repo-analyze, issue-command); tsc + eslint clean.

- [#3002](https://github.com/nexus-substrate/nexus-agents/pull/3002) [`2555a75`](https://github.com/nexus-substrate/nexus-agents/commit/2555a759a1b28cbe0a33654f7f92ba8643517a0d) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **fix(logging):** three of four hygiene issues from [#2963](https://github.com/nexus-substrate/nexus-agents/issues/2963). Site 3 (subprocess-adapter taskId correlation) deferred — requires `CliTask` shape change.
  - **Site 1 (MEDIUM) — `cli/hooks/handlers/session-end.ts:134`.** `logger.debug('Session metrics', metrics)` was leaking `metrics.tasks[].task`, which is the raw user-task prompt string. A user pasting `"deploy with API_KEY=sk-…"` would land their key in debug logs. Added `summarizeMetricsForDebug()` that emits only `id`, `status`, `durationMs`, `tokensUsed` per task — the load-bearing observables. Full metrics still written to the operator-requested `--export` file (no behavior change there).
  - **Site 2 (MEDIUM) — `cli/hooks/handlers/pre-tool.ts:122`.** `logger.info('Sensitive file access', { filePath, warning })` was emitting at always-on `info` for every `Edit`/`Write` touching `.env`/`id_rsa`/AWS-cred paths — aggregated in log services this built a map of where secrets live. Dropped to `debug`; added `toolUseId` correlation field already present in the sibling `validateBashTool` call.
  - **Site 4 (LOW) — `pipeline/dev-pipeline.ts:567,572,575`.** The plan-iteration loop's "Plan approved" / "Plan rejected, iterating" / "Max vote iterations reached" lines lacked the `sessionId` that's in scope at the caller. Threaded `sessionId` through `runPlanOrResume` → `planVoteLoop` so plan-loop post-mortems can correlate to checkpointed sessions on disk.

  53 tests pass across the 3 affected test files; tsc + eslint clean.

## 2.82.0

### Minor Changes

- [#2992](https://github.com/nexus-substrate/nexus-agents/pull/2992) [`665e660`](https://github.com/nexus-substrate/nexus-agents/commit/665e6601b85fba86a6e0c0869f1b441bafb2f993) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **fix(consensus):** switch correlation persistence to append-only JSONL. Closes [#2973](https://github.com/nexus-substrate/nexus-agents/issues/2973).

  The previous design — read `correlations.json`, merge with the proposals to save, write to a PID-suffixed temp file, then `renameSync` — was race-free **within** a process but unsafe **across** processes. Two processes voting concurrently (e.g., the MCP server and a parallel `nexus-agents vote` CLI) each loaded N entries, each merged their own proposal, each renamed over the same file. The first writer's proposal was silently lost. HOV (Higher-Order Voting) correlation history degraded over time under fan-out load — the Bayesian correlation signal depended on the proposals we were dropping.

  Switched the store to append-only `correlations.jsonl` (one `PersistedProposal` per line). POSIX `O_APPEND` (used implicitly by `appendFileSync`) guarantees atomic writes per line for sizes under `PIPE_BUF` (4 KB Linux, 512 B macOS) — well above what a typical 3-7-voter proposal line takes. Concurrent writers from any number of processes all land their lines. No read-merge-rename cycle on save.

  **Reads** consolidate both stores: legacy `correlations.json` (skipped if corrupt/invalid-schema) plus all JSONL lines, dedup by `proposalId` (later wins per id), FIFO-truncate to `config.maxProposals`. Loaders previously got truncation enforced at save time; now they enforce it themselves on `loadCorrelationData(config)` — pass the config explicitly if you care about the cap (callers that pass nothing get `DEFAULT_HIGHER_ORDER_CONFIG.maxProposals = 5000`, generous enough for any single-session use).

  **Compaction:** added `compactCorrelationData()` that consolidates JSONL + legacy into a fresh deduplicated JSONL and removes the legacy file. Safe to call periodically (e.g., on session shutdown) to bound disk size. Compaction itself is NOT cross-process race-free — serialize it (single compactor per data dir, or guard with a lockfile).

  **Migration:** zero-touch for existing users. The legacy `correlations.json` is read alongside the JSONL on every load; new writes go to JSONL. After `compactCorrelationData()` runs (or after any session that calls it), the legacy file is removed.

  **Schema bumped to version 2** because the wrapper format around `proposals` is now load-time, not on-disk. Tests updated: `PersistedCorrelationData.version === 2` now; corrupt legacy files yield empty-success rather than err-Corrupt (we still warn-log); `maxProposals` truncation tested against the load path.

  23 tests pass including a new concurrent-writer test that exercises the race the JSONL switch is for: 10 parallel `saveCorrelationData([…])` calls and verifies all 10 land. Pre-fix this test would frequently lose proposals to the rename-clobber.

- [#2991](https://github.com/nexus-substrate/nexus-agents/pull/2991) [`dc04968`](https://github.com/nexus-substrate/nexus-agents/commit/dc04968a3e7b17966ed394993b2f89cf4168b36c) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **refactor(config):** remove the unused `WORKER_DEFAULTS` category. Closes [#2977](https://github.com/nexus-substrate/nexus-agents/issues/2977).

  The `WORKER_DEFAULTS` category — 8 settings (`maxWorkers`, `poolSize`, `idleTimeoutMs`, `workflowMaxParallel`, `testParallelism`, `evaluationMaxWorkers`, `eventBusMaxHistory`, `swarmObserverMaxEvents`) — was wired into the config-command help text, the env-schema, the config-manager mapping, and the runtime resolver (`getWorkerConfig`), but had **zero production consumers**. Setting any of `NEXUS_WORKERS_MAX` / `NEXUS_WORKERS_POOL_SIZE` / `NEXUS_WORKERS_IDLE_TIMEOUT` / `NEXUS_WORKFLOW_MAX_PARALLEL` / `NEXUS_TEST_PARALLELISM` / `NEXUS_EVALUATION_MAX_WORKERS` / `NEXUS_EVENTBUS_MAX_HISTORY` / `NEXUS_SWARM_OBSERVER_MAX_EVENTS` — or `nexus-agents config set WORKER_DEFAULTS.foo X` — was a silent no-op.

  Silent config rot is worse than missing knobs. Removed the category entirely; can re-add when a concrete consumer exists.

  **Removed surfaces:** `DEFAULTS.WORKER_DEFAULTS`, `getWorkerConfig`, `WorkerDefaults` + `WorkerDefaultsConst` types, `WorkerDefaultsSchema` (Zod), the 7 env-schema entries for `NEXUS_WORKERS_*` + 1 for `NEXUS_EVENTBUS_MAX_HISTORY`, the 8 mappings in `config-manager.ts`, the help-text line in `cli/config-command.ts`, the "Workers" table from `getEnvVarDocumentation`, the test block in `defaults.test.ts`, and 3 cross-cutting tests that referenced `WORKER_DEFAULTS.foo` as a sample key.

  **Migration:** operators setting any removed env var get no warning today (the var was already silent); after this PR the var still has no effect — same behavior. CLI users running `nexus-agents config set WORKER_DEFAULTS.foo X` will get a "key not found" error instead of the previous false success. Test runners reading `DEFAULTS.WORKER_DEFAULTS` need to derive the value elsewhere (most likely from the consumer's own config schema — `WorkflowConfig.maxParallel`, evaluation-harness types, etc.).

  133 tests pass across the 4 affected test files (defaults, config-command-handlers, env-schema, config-command); tsc + eslint clean.

  Marking patch because — despite removing an exported type — the type had no external consumers and the behavior change is "documented knob that did nothing now actually does nothing." Bumped to **minor** out of caution given the type-export removal and the CLI behavior change for `config set WORKER_DEFAULTS.*`.

- [#2996](https://github.com/nexus-substrate/nexus-agents/pull/2996) [`cf3e6b9`](https://github.com/nexus-substrate/nexus-agents/commit/cf3e6b9985631034b2ce213bfbcaea2dcb21cac9) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **fix(security):** access-policy derivation failures now fail closed under active enforcement. Partial fix for [#2993](https://github.com/nexus-substrate/nexus-agents/issues/2993).

  Pre-fix: in both `mcp/tools/orchestrate.ts` (`deriveOrchestratePolicy`) and `mcp/tools/execute-expert.ts` (`deriveExpertAccessPolicy`), the `catch (error)` branch fell back to a wildcard policy with `mode: 'off'`. Any exception in LLM derivation — a transient API failure, a Zod schema drift, an adapter bug — converted to a security bypass. Even operators running `NEXUS_ACCESS_POLICY_MODE=enforce` ended up with `allowedTools: '*'` and `allowedOperations: '*'` enforcement disabled, contradicting their explicit configuration.

  Fix: the fallback now preserves the operator's configured mode in the returned policy and restricts to empty allow-lists (`allowedTools: []`, `allowedOperations: []`, `allowedPathPatterns: []`) when the mode is `confirm_risky` or `enforce`. For `off` and `audit` modes the permissive fallback is preserved (operators in those modes have either opted out entirely or accepted log-only semantics, both of which would be surprised by a sudden block). The warn log now includes `failClosed: boolean` so the operator can correlate.

  68 tests pass across the two changed files. `tsc + eslint` clean.

  **Still open** (the multi-file half of [#2993](https://github.com/nexus-substrate/nexus-agents/issues/2993)): the hardcoded `trustTier: '1'` in the same two functions. Threading `requestContext.trustTier` from `secure-handler` through both tools' deps needs careful audit of the entire call graph — deferred to a follow-up so this fail-closed half ships immediately.

- [#2995](https://github.com/nexus-substrate/nexus-agents/pull/2995) [`7a787e7`](https://github.com/nexus-substrate/nexus-agents/commit/7a787e7eb5e7687edd797e021e7e1f12edf2fe4b) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **fix(security):** three MCP-surface hardening fixes from the 2026-05-24 wave-3 audit.

  These are exploitable from untrusted MCP input that operators routinely route through nexus-agents (issue bodies, PR comments, third-party MCP servers wired into the gateway). Marked minor because the secret-redaction change to tool-error responses can clip legitimate strings that happen to match the secret patterns.
  - **Path traversal — sibling-prefix bypass in 5 MCP tools.** `mcp/tools/dev-pipeline-tool.ts`, `pipeline-tool.ts`, `compare-data-feeds.ts`, `search-codebase-tool.ts`, `extract-symbols-tool.ts` all checked `resolved.startsWith(cwdRoot)` without a trailing separator. From cwd `/home/u/proj`, a caller passing `directory: "../projEVIL/secret.txt"` resolves to `/home/u/projEVIL/secret.txt`, which passes the bare `startsWith` check. Fixed to match the convention in `security/safe-path.ts` and `mcp/tools/query-trace-tool.ts`: `(resolved === cwdRoot || resolved.startsWith(cwdRoot + sep))`.
  - **Secret leak in tool-error responses.** `mcp/middleware/secure-handler.ts:460-472`: success-branch `ToolResult` went through `sanitizeToolResult` (which redacts AWS keys, Bearer tokens, hex secrets, `password=`/`token=`/`api_key=` patterns), but the `catch (error)` branch returned the raw `error.message` to the MCP client. Adapter SDKs commonly echo offending credentials in their error messages (Anthropic's `AuthenticationError` carries `sk-ant-api03-…` substrings; fetch wrappers echo `Authorization` headers). The exception path now runs the same `sanitizeOutput`.
  - **Supply-chain env leak in MCP gateway.** `mcp/gateway/upstream-client.ts` previously spread full `process.env` into spawned upstream subprocesses — every API key (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GITHUB_TOKEN`, `OPENROUTER_API_KEY`, etc.) leaked to whatever third-party MCP server the operator wired up, contradicting the schema comment "use `{env:VAR}` references, not plaintext secrets" (`schemas-gateway.ts:37`). Now passes only `UPSTREAM_BASELINE_KEYS` (`PATH`, `HOME`, `USER`, `LANG`, `LC_ALL`, `LC_CTYPE`, `TMPDIR`, `TZ`, `PWD`, `SHELL`, `TERM`) plus the operator's explicit `env` mappings.

  144 tests pass across the 7 affected test files. Two remaining wave-3 findings ([#2993](https://github.com/nexus-substrate/nexus-agents/issues/2993) hardcoded `trustTier=1` + fail-open in orchestrate/execute-expert, [#2994](https://github.com/nexus-substrate/nexus-agents/issues/2994) V2 delegate strips `trustTier`) need multi-file changes and are filed for separate PRs.

### Patch Changes

- [#2986](https://github.com/nexus-substrate/nexus-agents/pull/2986) [`bfdc880`](https://github.com/nexus-substrate/nexus-agents/commit/bfdc8802c4010d73eecc4b63b103f130b6c0afb4) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **fix(mcp):** `search_codebase` no longer races on cold-start, evicts stale indexes, and bounds retention. Closes [#2970](https://github.com/nexus-substrate/nexus-agents/issues/2970).

  The previous module-level `cachedIndex` / `cachedDir` pair had two coupled bugs:
  1. **Singleton-init race.** Two concurrent MCP `search_codebase` calls both missed the cache and each `await index.index(4)` (a seconds-long tree-walk + AST extraction over every TS/JS file). The loser's work was wasted.
  2. **Unbounded retention with stale results.** `CodebaseIndex` (~50,000 symbols × ~200 bytes for this repo) was kept for the life of the MCP server with no TTL, no LRU, no file-watcher invalidation. Memory grew + search results went stale after the user's first `git pull` / file edit.

  Fix: replace the pair with a small bounded cache (`MAX_CACHED_DIRS = 3`, `INDEX_TTL_MS = 15 minutes`) plus an `inflightIndex` `Map<dir, Promise<CodebaseIndex>>` that coalesces concurrent indexing of the same directory. LRU eviction uses `Map` insertion order: cache hits delete-then-reinsert the entry, demoting LRU candidates to the head. Mirrors the `PolicyCache` pattern in `security/access-constraint-deriver/cache.ts`. TTL is computed via `getTimeProvider()` so seeded tests reproduce.

  5 new tests cover: race coalescing (one constructor call on two concurrent calls), LRU eviction past 3 dirs, LRU refresh on cache hit, TTL expiry past 15 min, `clearIndexCache()` clearing inflight promises. The 3 existing cache tests ([#2159](https://github.com/nexus-substrate/nexus-agents/issues/2159)) still pass against the new implementation. 24 tests in the file; tsc + eslint clean.

- [#2989](https://github.com/nexus-substrate/nexus-agents/pull/2989) [`7165342`](https://github.com/nexus-substrate/nexus-agents/commit/7165342abe1440ab48fd3bda4d8d8ca004a001be) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **fix(setup):** `configureHooks` no longer silently overwrites user hooks when the claude CLI returns malformed JSON. Closes [#2975](https://github.com/nexus-substrate/nexus-agents/issues/2975).

  `getExistingHooks()` collapsed three distinct outcomes — "no hooks set," "the CLI errored," "the response was malformed" — into `undefined`. Downstream `mergeHookConfigs(undefined, nexus)` returns `nexus` only, and `configureHooks` then called `claude config set hooks` with that as the new total. Net effect: any user with their own `PreToolUse` / `Stop` hooks could lose them all after a claude-cli version bump that changed the JSON shape. The original [#420](https://github.com/nexus-substrate/nexus-agents/issues/420) fix only covered the happy path; this regresses on the parse-failure path.

  Added `readExistingHooks()` that returns a discriminated union `{ kind: 'absent' | 'present' | 'unreadable' | 'parse_failed' }`. `configureHooks` now branches on `kind === 'parse_failed'` and returns a structured error asking the operator to inspect `claude config get hooks` and resolve manually — instead of overwriting. `getExistingHooks()` stays as a thin compat wrapper that maps any non-present to `undefined` so existing callers and tests are unchanged.

  6 new tests: 4 cover the `readExistingHooks` discriminated outcomes; 2 cover the `configureHooks` parse-failure guard (asserts `execFileSync` is NOT called on parse failure — the load-bearing safety invariant). 52 tests in the file pass; tsc + eslint clean.

- [#2987](https://github.com/nexus-substrate/nexus-agents/pull/2987) [`4b8c6ab`](https://github.com/nexus-substrate/nexus-agents/commit/4b8c6ab1e14417eb3d83656dce042f89e1be7d4f) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **fix(audit):** flush storage on every timer tick and bound the in-memory queue. Closes [#2979](https://github.com/nexus-substrate/nexus-agents/issues/2979).

  Two coupled bugs in `AuditLogger`/`FileAuditStorage` could indefinitely buffer audit events in memory under sustained load, with disk only catching up at shutdown:
  1. The flush timer called `flushQueue()` — which drained the in-memory `eventQueue` into `storage.write()` — but never called `storage.flush()`. `FileAuditStorage.write()` only appends to its `writeBuffer` (no disk I/O), so events accumulated until `close()`. As a side-effect, `currentFileSize` was incremented optimistically, triggering phantom rotation that abandoned un-pushed buffer contents.
  2. `flushQueue()` ran serially via `await` in a for-loop, and the interval kept firing while a flush was already in flight. Overlapping flushes plus no cap on `eventQueue` length meant unbounded memory growth under backpressure.

  Fix:
  - `audit-logger.ts:startFlushTimer` now calls `this.flush()` (which drains the queue **and** flushes storage) instead of `this.flushQueue()`.
  - `flush()` coalesces concurrent callers into a single in-flight promise via `inFlightFlush` — overlapping timer ticks or callers wait on the existing drain instead of spawning a parallel one.
  - `log()` enforces a new `maxQueueDepth` config (default `10_000`) with a drop-oldest policy when the cap is exceeded; a `warn` log fires the first time the cap is hit and once per `1_000` further drops to avoid log spam.
  - `audit-types.ts:AuditLogConfigSchema` adds `maxQueueDepth: z.number().positive().optional().default(10_000)`.
  - `cli-server-audit.ts` passes the default explicitly when wiring the production audit logger.
  - New tests cover all three behaviors: timer-tick storage flush (regression for bug 1), concurrent-flush coalescing, and drop-oldest backpressure.

  Behavior change: existing callers that don't set `maxQueueDepth` get the `10_000`-event cap automatically. Disk writes now happen on every flush interval (default 1s) instead of only at shutdown.

- [#2988](https://github.com/nexus-substrate/nexus-agents/pull/2988) [`c90e7ec`](https://github.com/nexus-substrate/nexus-agents/commit/c90e7ec29e1d9a8ac2d0ab779acd7a64118c16c5) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **fix:** two more single-file fixes from epic [#2982](https://github.com/nexus-substrate/nexus-agents/issues/2982).
  - **Closes [#2969](https://github.com/nexus-substrate/nexus-agents/issues/2969)** — `pipeline/expert-bridge.ts:79,143`: `getMcpConfigPath` + `getRouter` cold-start race. `consensus_vote` fans out N=7 callers on cold start; both helpers used the unguarded `if (cached !== null) return; await init(); cached = result` pattern, so each caller ran the full init. `getMcpConfigPath` leaked N-1 mcp-config temp dirs via `mkdtemp` (no cleanup path). `getRouter` ran `createAllAdapters()` N times (N sets of CLI probe subprocesses). Added `mcpConfigInitPromise` and `routerInitPromise` coalescing — same `??=` pattern that the rest of the codebase uses (`scanner-registry-fetcher.ts`, `workflow-engine-factory.ts`, `agent-executor.ts`).
  - **Closes [#2978](https://github.com/nexus-substrate/nexus-agents/issues/2978)** — `workflows/parallel-executor.ts:282-292`: replaced two manual `addEventListener('abort', ...)` calls per step with `AbortSignal.any([signal, state.abortController.signal])`. The manual approach accumulated 2 listeners per step on two long-lived shared signals, never removing them — a 50-step plan exceeded Node's default `MaxListeners=10` after step 5 and spammed `MaxListenersExceededWarning` to stderr. `AbortSignal.any` (Node 20+) composes signals natively and the resulting signal is GC'd as soon as the step's promise resolves.

  65 tests pass across the test files that exercise these paths (research-trigger, agent-executor, pipeline-eval-edge, parallel-executor). No behavior change in the happy path.

- [#2990](https://github.com/nexus-substrate/nexus-agents/pull/2990) [`a2c2022`](https://github.com/nexus-substrate/nexus-agents/commit/a2c2022d6b67a928e10e937436ea79442bfa0ba6) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **fix:** two more error-handling fixes from epic [#2982](https://github.com/nexus-substrate/nexus-agents/issues/2982).
  - **Closes [#2980](https://github.com/nexus-substrate/nexus-agents/issues/2980)** — `cli/release-notes-helpers.ts:48-64`: `getCommitsBetween` collapsed git failures into `[]`, which downstream `release-notes-command` mapped to `{ success: true, content: 'No commits found in range.' }`. Operator running `release-notes --from=v0.5.99` (typo, tag doesn't exist) got a "successful" empty release notes file. CI without git in container generated a blog post claiming "0 changes." Added `tryGetCommitsBetween` returning a `CommitsResult` discriminated union (`'ok' | 'invalid_ref' | 'git_failed'`); legacy `getCommitsBetween` stays as a thin compat wrapper. `release-notes-command` now surfaces ref-validation + git-execution failures explicitly; `release-announce-command` emits a `console.warn` when stats can't be computed so the operator notices before posting.
  - **Closes [#2981](https://github.com/nexus-substrate/nexus-agents/issues/2981)** — `pipeline/pipeline-checkpoint.ts:144-163`: `rebuildState` did `JSON.parse(line) as PipelineCheckpointEntry` and silently dropped malformed lines via bare `catch {}`. The cast accepted any successfully-parsed JSON (`null`, `42`, `{}`), so `applyEntry` could read undefined fields and poison the recovered state. Added `PipelineCheckpointEntrySchema` (Zod, mirrors the type exactly) and validate every line; skipped lines are counted and reported at `warn` level so corrupt checkpoints surface in operator logs.

  90 tests pass across the affected files (release-notes-helpers, release-notes-command, release-announce-command, pipeline-checkpoint); tsc + eslint clean.

- [#2985](https://github.com/nexus-substrate/nexus-agents/pull/2985) [`409962f`](https://github.com/nexus-substrate/nexus-agents/commit/409962f6dc44c95d54545aa756cb598d4cc82954) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **fix:** bundle 4 trivial single-file fixes from the 2026-05-23 system-review epic ([#2982](https://github.com/nexus-substrate/nexus-agents/issues/2982)).

  Each fix follows a pattern already established elsewhere in the codebase — none introduces new concepts.
  - **Closes [#2971](https://github.com/nexus-substrate/nexus-agents/issues/2971)** — `pipeline/agent-executor.ts:190`: `routingMemoryCache` lost-init race. Added `routingMemoryInitPromise` coalescing so concurrent `recordRoutingExperience` calls share one `createRoutingMemory()` instance. Mirrors the `memoryInitPromise ??=` pattern 70 lines above. Without this, N concurrent expert dispatches each built their own `RoutingMemory` and the loser's events landed in an orphaned instance that may leak handles or duplicate-write outcomes.
  - **Closes [#2972](https://github.com/nexus-substrate/nexus-agents/issues/2972)** — `learning/strategy-distiller-persistence.ts:147`: `saveSnapshot` wrote to a non-PID-suffixed `.tmp` file. Two processes calling `distill()` against the same `rules.json` could race the rename and clobber each other's content. One-token change to match the convention in `consensus/correlation-persistence.ts:184` and `cli/research-auto-catalog.ts:99`.
  - **Closes [#2974](https://github.com/nexus-substrate/nexus-agents/issues/2974)** — `cli-orchestrator.ts:64-77`: REPL hang on `orchestrateCommand` rejection. The `void (async () => { await ...; rl.prompt() })()` had no `.catch`, so any rejection became an unhandled promise and the prompt never returned. Extracted the body into `executeReplTask` with `try`/`catch`/`finally rl.prompt()` so the prompt always recovers and the user sees a useful error.
  - **Closes [#2976](https://github.com/nexus-substrate/nexus-agents/issues/2976)** — `agents/collaboration/agent-message-router.ts:333`, `orchestration/parallel-exploration.ts:236`, `orchestration/triangulated-review.ts:232`: the three `Promise.race([cliCall(), createTimeout(...)])` helpers left un-`.unref()`'d `setTimeout` handles. When the CLI call resolved first, the timer kept the event loop alive for up to `perCliTimeoutMs` (commonly 300 s) — so `nexus-agents` CLI commands hung at the end of orchestration subcommands. `.unref()` on each `setTimeout` lets the process exit as soon as the user's work is done.

  91 tests pass across the 5 changed-file tests. No behavior change in the happy path; observable improvement on the cold-start race, multi-process write, REPL recovery, and CLI shutdown latency paths.

## 2.81.4

### Patch Changes

- [#2966](https://github.com/nexus-substrate/nexus-agents/pull/2966) [`6f6c337`](https://github.com/nexus-substrate/nexus-agents/commit/6f6c337606f5e70a11e8ce3a233ec17cb79d699d) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **docs(config):** rewrite the env-var contract in `docs/getting-started/CONFIGURATION.md`. Closes [#2954](https://github.com/nexus-substrate/nexus-agents/issues/2954).

  The env-var section had drifted from production. Three classes of bug:
  - **Default mismatches (operator-impacting).** `NEXUS_VOTE_TIMEOUT_MS` was documented as `60000` but `VOTE_TIMEOUTS.defaultMs` is `300_000` (raised in [#1640](https://github.com/nexus-substrate/nexus-agents/issues/1640) — architecture/security experts averaged 315s). An operator setting "the default" got 1/5 the real budget. `NEXUS_EXPERT_TIMEOUT_MS` was documented as `120000` but the system uses tiered `standardMs=300_000` / `complexMs=600_000` (the `120_000` value is only the `execute_expert`-specific floor).
  - **Fictional vars (silent no-ops).** Removed 8 entries with zero production references: `NEXUS_API_ENABLED`, `NEXUS_API_KEY`, `NEXUS_API_PORT`, `NEXUS_BUDGET_TOKENS`, `NEXUS_BUDGET_COST_USD`, `NEXUS_ROUTING_ALPHA`, `NEXUS_LOG_FORMAT`, `NEXUS_SANDBOX_MODE` (was a typo for `NEXUS_SANDBOX`). Also removed the matching fictional REST-API YAML block (`api:` config) from the sample `nexus-agents.yaml`.
  - **Undocumented user-facing vars.** Added 11 real vars: `NEXUS_CONSOLE`, `NEXUS_DATA_DIR`, `NEXUS_REPO_PREFERRED`, `NEXUS_PORTABLE_MODE`, `NEXUS_GITIGNORE_AUTO`, `NEXUS_NO_SCAFFOLD`, `NEXUS_CONTEXT_RETRIEVER_INJECT`, `NEXUS_OPENAI_COMPAT_URL`, `NEXUS_OPENAI_COMPAT_KEY`, `NEXUS_OPENCODE_CONFIG`, plus the `GEMINI_API_KEY` alias for `GOOGLE_AI_API_KEY`. The `NEXUS_OPENAI_COMPAT_*` pair configures an entire adapter route (epic [#2500](https://github.com/nexus-substrate/nexus-agents/issues/2500)); operators had no way to discover it.

  Single-file change. Doc-only — no code/behavior change.

- [#2964](https://github.com/nexus-substrate/nexus-agents/pull/2964) [`3ead04c`](https://github.com/nexus-substrate/nexus-agents/commit/3ead04c90f79d5e15dff3366d663525daa6612b5) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **fix(async):** add `.catch` to two fire-and-forget Promises. Closes [#2960](https://github.com/nexus-substrate/nexus-agents/issues/2960).

  Two `void`-discarded async calls could reject without a handler — silent in default Node mode, crash in `--unhandled-rejections=strict`:
  - `cli-server-tools.ts:664` `void initUpstreamServers(...)` — upstream MCP server init failure was a silent diagnostic loss.
  - `mcp/tools/delegate-to-model.ts:159` `void executeDelegatePipeline(...)` — exact pattern of the sibling at `mcp/tools/orchestrate.ts:822-826` but missing the `.catch` the precedent uses.

  Both now `.catch` and log; behavior on success is unchanged. Mirrors the established resilience pattern in the codebase.

- [#2965](https://github.com/nexus-substrate/nexus-agents/pull/2965) [`1f7007a`](https://github.com/nexus-substrate/nexus-agents/commit/1f7007a9722b017142d2e8e77e94400fdcc2ce7d) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **fix(determinism):** route 4 ID/random sites through the time/random providers. Closes [#2961](https://github.com/nexus-substrate/nexus-agents/issues/2961).

  Four production sites escape-hatched the `getTimeProvider()` / `getRandomProvider()` abstractions, breaking replay reproducibility + snapshot testing. Audit found 4 real bugs out of ~450 candidate sites — the abstractions are well-adopted; these were the gaps on **persistence keys** (IDs that get written to disk and compared in tests).
  - `agents/orchestration/experience-buffer.ts:80` — replay-buffer episode `id` was `crypto.randomUUID()` → `getRandomProvider().uuid()`.
  - `mcp/tools/weather-report.ts:238` — routing exploration gate was `Math.random()` (the only such call in production code) → `getRandomProvider().random()`.
  - `pipeline/agent-executor.ts:69` + `:126` — persisted outcome-store record ID + memory session ID used raw `Date.now()` → both via `getTimeProvider().now()`.
  - `pipeline/dev-pipeline.ts:308` — `HindsightRecord.hindsightId` (the persisted belief-store lookup key) used `Date.now().toString(36)` → `getTimeProvider().now().toString(36)`.

  Behavior is unchanged in production (the providers default to real time / `crypto`); tests using seeded providers now get reproducible IDs.

- [#2968](https://github.com/nexus-substrate/nexus-agents/pull/2968) [`8e0221f`](https://github.com/nexus-substrate/nexus-agents/commit/8e0221f02eaef1d5c681021ba18c2e8157bd558a) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **fix(mcp):** register `pr_review` and `supply_chain_tradeoff_panel` MCP tools; sync `REGISTERED_TOOLS` allowlist with the actual STANDALONE_TOOLS table. Closes [#2967](https://github.com/nexus-substrate/nexus-agents/issues/2967).

  Two MCP tools were advertised in `server.json`, `README.md`, `docs/ENTRYPOINTS.md`, and shipped tool-annotations + tool-prerequisites — but never registered with the MCP server. Any client calling `tools/call { name: "pr_review", ... }` or `{ name: "supply_chain_tradeoff_panel", ... }` got `MethodNotFound`. The README v5 evaluation results for `pr_review` (100% bug-catch on 10 PRs) referred to a tool no MCP client could reach.

  Root cause: `mcp/tools/index.ts` `REGISTERED_TOOL_NAMES` (the source `inject-governance.ts` uses to write `server.json`) listed both tools, but the actual registration path in `cli-server-tools.ts` (`STANDALONE_TOOLS` table + `REGISTERED_TOOLS` audit allowlist) had drifted behind. The lockstep promised in the comment at `mcp/tools/index.ts:497-500` was only between `REGISTERED_TOOL_NAMES` and `server.json` — not between what was advertised and what was actually wired.

  Fix:
  - Added `registerPrReviewTool` + `registerSupplyChainTradeoffPanelTool` to the `STANDALONE_TOOLS` table in `cli-server-tools.ts`.
  - Re-exported `registerSupplyChainTradeoffPanelTool` from `mcp/index.ts` (the barrel `cli-server-tools.ts` imports from). `registerPrReviewTool` was already re-exported.
  - Synced `REGISTERED_TOOLS` allowlist (28 → 38 entries) with the actual set registered via `STANDALONE_TOOLS` + category helpers. Adds the 10 names that had drifted: `pr_review`, `supply_chain_tradeoff_panel`, `research_add_source`, `research_synthesize`, `query_task_state`, `verify_audit_chain`, `extract_symbols`, `search_codebase`, `run_dev_pipeline`, `run_pipeline`. This fixes the `logToolRegistration` audit log lying about which tools are blocked when an operator configures `securityConfig.toolAllowlist`.
  - Updated `cli-server-tools.test.ts` to mock the 2 new register functions and assert `REGISTERED_TOOLS.length === 38` against the new expected list.

  Behavior change: clients can now `tools/list` the 2 tools and call them. No effect on existing tools.

## 2.81.3

### Patch Changes

- [#2958](https://github.com/nexus-substrate/nexus-agents/pull/2958) [`8717dad`](https://github.com/nexus-substrate/nexus-agents/commit/8717dad069554ab5cc20f6189f26d658644c31b4) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **fix(pipeline):** type the policy snapshot, delete 4 inert rules. Closes [#2932](https://github.com/nexus-substrate/nexus-agents/issues/2932) (P1 security partial — see follow-up note).

  The policy engine's `BUILT_IN_RULES` declared 5 gates: `trust-tier`, `security-review`, `bounded-iteration`, `cost-budget`, `high-risk-approval`. Each of the latter 4 read a `pipelineState` key — `securityReviewRequired`, `stageAttempts`, `costAccumulator`, `highRisk` — that **no producer ever wrote**. With the snapshot typed as `Record<string, unknown>`, every comparison evaluated against `undefined` and every rule silently allowed. They were aspirational scaffolding, not real gates.

  This change:
  - Replaces `PolicyContext.pipelineState: Readonly<Record<string, unknown>>` with a typed `PipelineStateSnapshot` interface listing only fields with a real producer chain. Adding a new rule now requires a corresponding producer wire-up at compile time.
  - Deletes the 4 inert rules. Re-add them when a producer subsystem exists.
  - Adds `toPipelineStateSnapshot()` in `v2-delegate.ts` as the single narrowing chokepoint between the untyped `task.metadata` producer surface and the typed snapshot.
  - The kept `trust-tier` rule's wiring (caller-trust → `task.metadata.trustTier`) is owner-scoped follow-up — the chain runs through MCP middleware `RequestContext` and isn't trivially threaded; tracked in a focused follow-up issue.

  49 tests pass across `policy-engine`, `policy-evaluator`, `v2-delegate`.

- [#2956](https://github.com/nexus-substrate/nexus-agents/pull/2956) [`e2d9347`](https://github.com/nexus-substrate/nexus-agents/commit/e2d93479495e70e3a414d9ba469e25fed4e06cb7) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **fix(pipeline):** `iterative-consensus` fails closed on vote-execution error. Closes [#2951](https://github.com/nexus-substrate/nexus-agents/issues/2951).

  `executeSingleVote` previously caught any exception from the consensus-vote tool (subprocess crash, JSON parse failure, network error, rate limit) and returned `{ kind: 'approved', approvalPercentage: 0 }` — **auto-approving on infrastructure failure inverts the gate's purpose.** The dev pipeline would log "vote approved, proceeding to implement" when zero votes were physically cast.

  Now returns `{ kind: 'rejected', feedback: 'Vote infrastructure failed — no consensus produced: <message>', approvalPercentage: 0 }`. `runIterativeConsensus` counts this against `maxIterations`, the operator sees the failure, and an unverified plan never proceeds because the vote couldn't run.

## 2.81.2

### Patch Changes

- [#2949](https://github.com/nexus-substrate/nexus-agents/pull/2949) [`f7313e0`](https://github.com/nexus-substrate/nexus-agents/commit/f7313e0cef1c045bd07e4ee7bfa41deffa0f6623) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **fix(research):** `PaperEntry` now mirrors `ResearchPaper`'s rigor fields; drops the unsafe cast. Closes [#2943](https://github.com/nexus-substrate/nexus-agents/issues/2943).

  `research-helpers-registry.ts` cast each `PaperEntry` to `ResearchPaper` via `as unknown as ResearchPaper` before scoring — but `PaperEntry` was a strict subset, missing `rigor_tags`, `citation_count`, `has_code`, `code_url`, `quality_notes`, `last_quality_check`. `computeEvidenceTier`'s high-tier branch reads `rigor_tags`, so at runtime `new Set(undefined)` produced an empty set and the path was unreachable for anything flowing through that cast.

  `PaperEntry` now carries the rigor fields as optional. A typed `paperEntryToResearchPaper` helper replaces the cast, copying the readonly arrays to mutable ones (Zod-inferred shape). Behavior is unchanged for arXiv ingest (which still leaves rigor empty), but the high-evidence-tier path is now reachable when a maintainer populates `rigor_tags` on a paper — and the type system enforces it instead of silently stripping the field.

## 2.81.1

### Patch Changes

- [#2941](https://github.com/nexus-substrate/nexus-agents/pull/2941) [`341166a`](https://github.com/nexus-substrate/nexus-agents/commit/341166a39d16160fa39e3d1cc1411d97860b3f14) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **fix(security):** match triage verdicts to findings by id, not array position. Closes [#2933](https://github.com/nexus-substrate/nexus-agents/issues/2933) (P1 security).

  `security-gate.ts`'s `getConfirmedBlockingFindings` filtered blocking findings using `verdicts[i]` — but `triageFindings` sorts findings by severity and may skip parse-failed verdicts, so position `i` in `verdicts` did not refer to the same finding as `blocking[i]`. A high-severity finding whose triage parse failed would be matched against a downstream verdict (often a low-severity finding's `confirmed: false`) and **silently dropped from the blocking set**.

  `triageFindings` now returns `TriagedFinding[]` (each entry is `{ finding, verdict }` — pairing intrinsic, not positional). `getConfirmedBlockingFindings` and `recordTriageLifecycle` look up by `finding.id`. The duplicate `TriagedFinding` type in `severity-consensus.ts` was consolidated into `finding-triage.ts` (its natural producer) and re-exported.

  Regression test exercises the exact bug: three findings (2 high + 1 low), the second high's triage response fails to parse — pre-fix the gate returned 1 confirmed blocking; post-fix it correctly returns 2 (the unverdicted high is kept under the existing fail-safe).

## 2.81.0

### Minor Changes

- [#2928](https://github.com/nexus-substrate/nexus-agents/pull/2928) [`347a58b`](https://github.com/nexus-substrate/nexus-agents/commit/347a58b9edb8f0401af5ddbb29b8248800058426) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **feat(cli):** add `nexus-agents tour` — an interactive walkthrough of the four headline tools. Closes [#2851](https://github.com/nexus-substrate/nexus-agents/issues/2851).

  `nexus-agents tour` is a no-API-keys, no-quota guided walkthrough of `orchestrate`, `vote --quick`, `research_synthesize`, and `verify_audit_chain`. Each step explains what the tool does, shows a representative output (hand-authored fixture, clearly labeled as illustrative), surfaces the relevant `~/.nexus-agents/` paths, and gives a one-line takeaway. The tour pauses between steps in interactive mode; `--non-interactive` runs straight through, suitable for CI / scripted demos.

  Architected as `runTour(opts, io: TourIO)` taking an injected I/O surface — the steps are pure, all terminal interaction goes through `TourIO`, and `node:readline` lives only in the `interactiveIO()` factory. Tests pass a fake I/O that captures `write` calls and scripts `prompt` answers — no readline, no stdout spying.

  Reuses the existing `--non-interactive` option (no new CLI flag) and is placed in the `advanced` audience band of the command catalog so the curated `essential` tier stays at its 12-entry cap.

## 2.80.4

### Patch Changes

- [#2926](https://github.com/nexus-substrate/nexus-agents/pull/2926) [`048afe4`](https://github.com/nexus-substrate/nexus-agents/commit/048afe4e68c26f605c7fce1279e262d0b4fe1fef) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **feat(orchestrate):** wire the prior-memory context into the task prompt (behind the existing flag). Part of [#2921](https://github.com/nexus-substrate/nexus-agents/issues/2921) / [#2792](https://github.com/nexus-substrate/nexus-agents/issues/2792) Phase 3.

  `injectMemoryContextForOrchestrate` fetched the unified memory context on every `orchestrate` call and, when `NEXUS_CONTEXT_RETRIEVER_INJECT=1`, stashed a `priorMemorySummary` on `input.context` — but nothing read it. A consensus vote on [#2921](https://github.com/nexus-substrate/nexus-agents/issues/2921) (2/1) decided to **wire the consumer** rather than delete the code.

  `createTaskFromInput` now routes `priorMemorySummary` into the task's `context.history` as a synthetic entry, which the prompt builder already renders — so no per-adapter `buildPrompt` change is needed. The summary is wrapped in a clearly-delimited, length-capped (`PRIOR_MEMORY_MAX_CHARS`), explicitly **non-instructional** reference block: accumulated memory can contain untrusted content, so it is presented as background the model may consult, not as instructions.

  `NEXUS_CONTEXT_RETRIEVER_INJECT` stays **default-off** — with the flag unset the key is never written and behavior is unchanged. Flipping the default on is a separate, bake-gated change (the security reviewer rejected default-on without measurement; tracked on [#2921](https://github.com/nexus-substrate/nexus-agents/issues/2921)).

## 2.80.3

### Patch Changes

- [#2924](https://github.com/nexus-substrate/nexus-agents/pull/2924) [`85be752`](https://github.com/nexus-substrate/nexus-agents/commit/85be752e292bdc60bb79fa1f38fcb1a0d2be0a77) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **fix(config):** route `sessions.db` per-repo, with a one-time legacy migration. Closes [#2902](https://github.com/nexus-substrate/nexus-agents/issues/2902).

  The session database resolved via `nexusDataPath('sessions.db')`. Because the data-dir router (epic [#2872](https://github.com/nexus-substrate/nexus-agents/issues/2872)) keys on the first path segment and `sessions.db` is not in `PER_REPO_SUBDIRS`, the DB landed cross-repo at `~/.nexus-agents/sessions.db` — while the session journals directory `sessions/` correctly routed per-repo. A session DB started in repo A was visible when working in repo B.

  Resolved per consensus vote on [#2902](https://github.com/nexus-substrate/nexus-agents/issues/2902) (approved 3/3): the session DB is per-repo episodic data and belongs in the `sessions/` bucket alongside the journals (vote [#2876](https://github.com/nexus-substrate/nexus-agents/issues/2876) categorized `sessions/` as per-repo). New canonical `sessionsDbPath()` in `config/nexus-data-dir.ts` resolves `nexusDataPath('sessions', 'sessions.db')`; both `getDefaultDbPath()` helpers delegate to it.

  On first resolution per process, a guarded one-time migration relocates any pre-existing legacy DB (and its SQLite sidecars) from the old cross-repo path to the new per-repo path — so existing session history is preserved, not silently orphaned (the gating condition all three voters flagged). The move is best-effort: cross-filesystem moves fall back to copy+unlink, and any failure leaves the legacy DB untouched for manual recovery. `NEXUS_DATA_DIR` / `NEXUS_REPO_PREFERRED` / `NEXUS_SESSIONS_DB` overrides are unaffected.

## 2.80.2

### Patch Changes

- [#2919](https://github.com/nexus-substrate/nexus-agents/pull/2919) [`72e9c49`](https://github.com/nexus-substrate/nexus-agents/commit/72e9c4994b7f59b621df080cea642a827c47f808) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **docs(orchestration):** clarify `WorkflowRouter` outcome-recording scope. Part of [#2824](https://github.com/nexus-substrate/nexus-agents/issues/2824) (audit P2).

  Audit [#2824](https://github.com/nexus-substrate/nexus-agents/issues/2824) flagged `workflow-router.ts` `PatternOutcome` history as per-instance, suggesting it be wired through `OutcomeStore` for cross-process learning. Verified: `route()` is a deterministic rule-based classifier that never reads recorded outcomes — there is no per-instance learning to lose and nothing to aggregate across processes. `recordOutcome` / `getMetrics` are an observability surface only. Added doc comments on `createWorkflowRouter` and `IWorkflowRouter` stating this explicitly, so a future maintainer who wants cross-process pattern metrics knows to add a dedicated `OutcomeStore` consumer rather than widening the router. Closes the audit bullet via its sanctioned "document explicitly" option — no behavior change.

- [#2920](https://github.com/nexus-substrate/nexus-agents/pull/2920) [`a08d1c3`](https://github.com/nexus-substrate/nexus-agents/commit/a08d1c31b08726ca0d196a5e3419f54e1fb73f9b) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **fix(pipeline):** `ArtifactStore.provenance()` walks `inputRefs` transitively. Closes [#2867](https://github.com/nexus-substrate/nexus-agents/issues/2867) ([#2824](https://github.com/nexus-substrate/nexus-agents/issues/2824) audit P2).

  `provenance()` previously returned only the queried artifact's direct entry — the `inputRefs` ancestors were never followed, so the "provenance chain" was one link long. It now does an iterative DFS over `inputRefs`, returning the artifact plus every transitively reachable ancestor. A `visited` set makes it safe against cycles and diamond/multi-parent DAGs (each artifact appears once); a FIFO-evicted ancestor truncates the chain rather than throwing.

  Also corrected two stale docs: the store does **FIFO** eviction (insertion order), not LRU — header comments said "LRU". And the class docstring now states this is a bounded in-memory working cache, not the durable audit substrate — for retained, tamper-evident history use the on-disk Merkle audit log via `verify_audit_chain`. This resolves the audit's FIFO-vs-"audit trail" concern: the cache is correctly bounded; the durable audit lives elsewhere.

## 2.80.1

### Patch Changes

- [#2914](https://github.com/nexus-substrate/nexus-agents/pull/2914) [`4a1b2b2`](https://github.com/nexus-substrate/nexus-agents/commit/4a1b2b240ccf38dbd5552995b3950de6adbef93e) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **fix(cli-adapters):** collapse nested retry layers for subprocess CLIs. Part of [#2824](https://github.com/nexus-substrate/nexus-agents/issues/2824) (audit P1).

  Subprocess CLI adapters had two independent retry layers on the same call path: the inner `retryTransient` in `SubprocessCliAdapter` (1 initial + 2 transient retries) and the shared outer `executeCliRetryLoop` (`maxRetries: 1` → 2 attempts). On a persistent transient error (TIMEOUT / RATE_LIMITED / CONNECTION_ERROR) they multiplied — outer × inner = up to **6 subprocess spawns**, and because the inner layer extends the timeout by 1.5× on every TIMEOUT retry, a stuck call could hang ~9–10 minutes before finally failing.

  New `BaseCliAdapter.shouldOuterRetry()` hook decides whether the outer loop may retry. `SubprocessCliAdapter` overrides it to return `false` whenever its own `transientRetry` layer is enabled (the default), making the inner layer the single retry authority. The outer loop still runs once, so circuit-breaker failure recording is unchanged. Applies to the claude/codex/opencode adapters (via `BaseCliAdapter`) and the gemini adapter (via its circuit-breaker-coupled `executeWithRetryTracking`). Non-subprocess adapters are unaffected.

- [#2915](https://github.com/nexus-substrate/nexus-agents/pull/2915) [`ffea2f6`](https://github.com/nexus-substrate/nexus-agents/commit/ffea2f6eaf09942ad71c833ce1041aa3ae142da2) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **fix(mcp):** route `run_pipeline` / `run_dev_pipeline` through the standard secure-handler chain. Part of [#2824](https://github.com/nexus-substrate/nexus-agents/issues/2824) (audit P1).

  Both pipeline tools registered a bare `server.registerTool()` callback, bypassing the `createSecureHandler → wrapToolWithTimeout → toSdkCallback` chain every other MCP tool uses. Consequences: no rate-limiting, no abort-signal or progress-token plumbing (the very tools that need it most, being long-running), and `schema.parse(args)` ran outside any try/catch — so a `ZodError` on bad input surfaced as a raw JSON-RPC `-32603` internal error instead of a structured `validation` envelope.

  Both tools now use the standard chain: input is validated with `safeParse` inside the handler and a bad payload returns a `toolStructuredError({ errorCategory: 'validation' })`. `run_pipeline` and `run_dev_pipeline` are added to `MCP_TIMEOUTS.perTool` at 15 min so the newly-applied `wrapToolWithTimeout` does not kill these multi-stage pipelines at the 60s default.

- [#2917](https://github.com/nexus-substrate/nexus-agents/pull/2917) [`537d52e`](https://github.com/nexus-substrate/nexus-agents/commit/537d52e334f7c3aaf949280dc8c84cc31b5d146c) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **refactor(consensus):** extract `evaluateThreshold` — dedup voting-strategy threshold math. Part of [#2824](https://github.com/nexus-substrate/nexus-agents/issues/2824) (audit P2).

  `SimpleMajorityStrategy`, `SupermajorityStrategy` and `ProofOfLearningStrategy` each repeated the same approval-ratio math: `approvalPercentage = (approve / total) * 100` and `approved = approve / total {>|>=} threshold`. The three copies are now a single `evaluateThreshold(approveCount, votingTotal, threshold, inclusive)` helper. `inclusive` selects `>=` (supermajority) vs strict `>` (simple-majority, proof-of-learning). Behavior is unchanged — the 34 existing strategy tests pass.

- [#2910](https://github.com/nexus-substrate/nexus-agents/pull/2910) [`3e32460`](https://github.com/nexus-substrate/nexus-agents/commit/3e32460aa21f38a252463dcaf30e48c060273c97) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **fix(consensus):** guard `ConsensusEngine.vote()` against double quorum expansion. Closes [#2861](https://github.com/nexus-substrate/nexus-agents/issues/2861).

  `vote()` is `async` and `await`s the expansion callback inside `tryExpandQuorum()` — and `tryExpandQuorum()` mutates `state.proposal.requiredVoters` / `expansionRounds` _after_ that await. Two `vote()` calls that both observe a complete quorum across the await gap would each start an expansion: the callback fires twice and the second expansion clobbers the first's voter list (and `expansionRounds` undercounts).

  Fix: a per-proposal `expansionInFlight` flag on `ProposalState`. `vote()` sets it before `await tryExpandQuorum`, clears it in a `finally`, and a concurrent `vote()` that sees it set returns `ok` immediately (its vote is already recorded — the in-flight expansion handles the quorum decision). The flag is per-proposal, so independent proposals never block each other.

  Severity note: the current production caller (`mcp/tools/consensus-vote.ts`) submits votes in a sequential `for await` loop, so the race is **latent** today — but `ConsensusEngine.vote()` is a public `async` method and any concurrent caller would hit it. This hardens the public contract.

  Regression test in `incremental-quorum.test.ts` fires two `vote()` calls racing the final voter and asserts the expansion callback runs exactly once (verified to fail without the guard).

- [#2909](https://github.com/nexus-substrate/nexus-agents/pull/2909) [`45a8207`](https://github.com/nexus-substrate/nexus-agents/commit/45a8207365c71e93f838bb2e37fa01425a8cf26f) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **fix:** two correctness bugs from the [#2824](https://github.com/nexus-substrate/nexus-agents/issues/2824) code-review audit. Closes [#2862](https://github.com/nexus-substrate/nexus-agents/issues/2862) and [#2864](https://github.com/nexus-substrate/nexus-agents/issues/2864).

  **[#2862](https://github.com/nexus-substrate/nexus-agents/issues/2862) — `decomposeTask` crashed on markdown-fenced JSON.** The Orchestrator's `decomposeTask()` called `JSON.parse()` directly on the LLM response. LLMs routinely wrap the JSON array in a ` ```json … ``` ` fence; the fence made `JSON.parse` throw and `decomposeTask` silently fell back to heuristic decomposition — discarding the model's actual plan. It now strips the fence first via the existing `extractCodeBlock()` helper (the same path `parseJson()` already uses).

  **[#2864](https://github.com/nexus-substrate/nexus-agents/issues/2864) — parallel tool calls dropped sibling outcomes on the first error.** `processToolCallsParallel()` used `Promise.all` (a single rejection aborts collection) and its reduction loop `return`ed on the first `stop-tool-error` outcome — so when one tool in a parallel batch failed, the turns from the _other_ tools (which ran fine) were never recorded in history. Now uses `Promise.allSettled` and drains _every_ outcome into `state.turns` before deciding to stop. A rejected promise (an unexpected escape from `invokeToolForParallel`'s own try/catch) is logged and treated as a stop signal without losing the siblings.

  Tests: a markdown-fence decomposition test in `tech-lead.test.ts`, and a mid-batch-error parallel-drain test in `agentic-adapter.test.ts` asserting both tool turns are recorded.

- [#2912](https://github.com/nexus-substrate/nexus-agents/pull/2912) [`40bbca1`](https://github.com/nexus-substrate/nexus-agents/commit/40bbca158e04a5bc06496dab35cd65940bd3096c) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **fix(vote):** record vote comments via `gh ... --body-file -` stdin. Closes [#2863](https://github.com/nexus-substrate/nexus-agents/issues/2863) ([#2824](https://github.com/nexus-substrate/nexus-agents/issues/2824) audit bullet 10).

  `recordVoteToGitHub` embedded the markdown comment body directly in the command string as `gh issue comment N --body '<comment>'`. The sandbox `validateArgs` gate rejects any argument containing shell metacharacters (`/[;&|`$()]/`), and every vote comment from `formatVoteComment` contains a markdown table (`|`) plus a `(NN% approval)`parenthetical — so the body token always matched a denied pattern and`safeExecSandboxed`returned`null`. Result: **every** vote comment was silently dropped with "command denied or failed", regardless of the proposal text.

  The body is now piped to `gh` over stdin via `--body-file -`, so it never touches the shell. `escapeForShell` is removed (no longer needed). `SandboxExecOptions` gains an optional `stdin` field, wired into `safeExecSandboxed`/`execSandboxed` as `execSync`'s `input` option.

- [#2911](https://github.com/nexus-substrate/nexus-agents/pull/2911) [`e66dfc8`](https://github.com/nexus-substrate/nexus-agents/commit/e66dfc80727200a58b0a1d250ae755c3d000c189) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **harden(subprocess):** env-var allowlist for spawned CLI subprocesses. Closes [#2865](https://github.com/nexus-substrate/nexus-agents/issues/2865) ([#2824](https://github.com/nexus-substrate/nexus-agents/issues/2824) audit).

  `spawnSubprocess()` passed the entire `process.env` to every spawned CLI (claude / gemini / codex / opencode) — only `CLAUDECODE` was stripped. That leaked cross-vendor secrets: the **gemini** CLI received `ANTHROPIC_API_KEY` and `OPENAI_API_KEY`; the **codex** CLI received `GOOGLE_AI_API_KEY`; every CLI also saw unrelated secrets like `AWS_SECRET_ACCESS_KEY` and `GITHUB_TOKEN`.

  New `cli-adapters/subprocess-env.ts` builds a curated child environment via `buildChildEnv(cliName)`:
  - **Base infrastructure** every CLI needs — `PATH`, `HOME`, locale (`LANG`, `LC_*`), proxy (`HTTP_PROXY`/…), `NODE_*`, TLS cert vars, `npm_config_*`, and `NEXUS_*` (config + nested-run credentials).
  - **Only the spawned CLI's own vendor key(s)** — gemini gets the Google keys, codex gets `OPENAI_API_KEY`, claude gets `ANTHROPIC_API_KEY`, opencode (routes to any provider) gets the full set. Cross-vendor keys are dropped.

  `CLAUDECODE` is still never forwarded. Escape hatch: `NEXUS_SUBPROCESS_ENV_ALLOWLIST=0` restores the pre-[#2865](https://github.com/nexus-substrate/nexus-agents/issues/2865) full-passthrough behavior — a field un-break if the allowlist ever drops a var a CLI needs.

  10 tests in `subprocess-env.test.ts` cover per-CLI vendor-key isolation, base-infra passthrough, prefix families, unrelated-secret stripping, `CLAUDECODE` removal, and the escape hatch. The 35 existing `subprocess-adapter` tests still pass.

- [#2906](https://github.com/nexus-substrate/nexus-agents/pull/2906) [`477e90f`](https://github.com/nexus-substrate/nexus-agents/commit/477e90f4738c7f1b37653758c309735331700a53) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **fix(mcp):** harden the stdin-lifecycle monitor so `--mode=server` processes don't leak as zombies. Closes [#2905](https://github.com/nexus-substrate/nexus-agents/issues/2905).

  The [#810](https://github.com/nexus-substrate/nexus-agents/issues/810) fix used a single signal — `process.stdin.once('end')` — to detect parent death. That misses SIGKILLed parents and abrupt pipe death, where `'end'` never cleanly emits. A process sweep found **134 leaked `nexus-agents --mode=server` processes** aged up to 17 days.

  `StdinLifecycleMonitor` now watches three independent signals, firing the shutdown callbacks exactly once whichever arrives first:
  1. stdin `'end'` — clean parent exit (unchanged).
  2. stdin `'close'` — the stdin fd closed; covers abrupt death `'end'` misses.
  3. **ppid change** — polls the parent pid; if it differs from the value captured at `start()`, the original parent died and the process was reparented. This is the catch-all for SIGKILLed parents that the stream events can't see. The poll timer is `unref()`'d so it never keeps the process alive.

  The monitor is constructable with `{ getPpid, ppidPollMs }` overrides so the ppid path is unit-testable without real reparenting. 9 tests cover all three signals, fire-once semantics, throwing-callback isolation, and interval cleanup.

- [#2916](https://github.com/nexus-substrate/nexus-agents/pull/2916) [`c140a61`](https://github.com/nexus-substrate/nexus-agents/commit/c140a612e8247fe7e2d4e4e47b0a4c2cf0b426c3) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **fix(sprint):** create sprint epics via `gh ... --body-file -` stdin. Closes [#2913](https://github.com/nexus-substrate/nexus-agents/issues/2913) ([#2824](https://github.com/nexus-substrate/nexus-agents/issues/2824) audit bullet 10, sprint half).

  `createSprintIssue` embedded the markdown proposal body in the command string as `gh issue create --body '<body>'`. The body has a markdown table (`|`) and `(effort)` parentheticals, so the sandbox `validateArgs` gate denied the argument and `safeExecSandboxed` returned `null` — every sprint epic silently failed to create. The title was also affected: `generateSprintTitle` produced `sprint: MM/DD/YYYY (duration)`, and the `(duration)` parentheses tripped the gate on the inline `--title` argument.

  The body is now piped to `gh` over stdin (`--body-file -`), so it never touches the shell. `generateSprintTitle` uses `sprint: MM/DD/YYYY - duration` (dash, no parentheses) so the title stays a metacharacter-free inline `--title` argument. This completes audit bullet 10 — the `vote-command` half shipped in [#2863](https://github.com/nexus-substrate/nexus-agents/issues/2863).

## 2.80.0

### Minor Changes

- [#2886](https://github.com/nexus-substrate/nexus-agents/pull/2886) [`2487c2e`](https://github.com/nexus-substrate/nexus-agents/commit/2487c2e8d65ffd8fbada0287226105151b1f1d03) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **feat(config):** repo-preferred data directory is now the default behavior — runtime artifacts for per-repo work land in `<repo>/.nexus-agents/` automatically. Final piece of epic [#2872](https://github.com/nexus-substrate/nexus-agents/issues/2872) (vote [#2876](https://github.com/nexus-substrate/nexus-agents/issues/2876)).

  When nexus-agents runs inside a git repo, per-repo state (sessions, checkpoints, traces, runs, audit, pipeline, tasks) now lands in `<repo-root>/.nexus-agents/<subdir>/` instead of `~/.nexus-agents/`. Cross-repo state (learning, voting, memory, weather, research, auth, usage) still goes to `~/.nexus-agents/` so the cross-project learning loop from [#1389](https://github.com/nexus-substrate/nexus-agents/issues/1389) / [#1407](https://github.com/nexus-substrate/nexus-agents/issues/1407) stays intact — vote [#2876](https://github.com/nexus-substrate/nexus-agents/issues/2876) made this state-category split a hard condition.

  ## Auto-gitignore

  On first resolution per process per repo, `.nexus-agents/` is auto-appended to `<repo>/.gitignore` (idempotent — won't duplicate). This is the fail-closed behavior required by the security review in vote [#2876](https://github.com/nexus-substrate/nexus-agents/issues/2876).

  ## Escape hatches preserved
  - `NEXUS_REPO_PREFERRED=0` — fully opt out; behaves like the previous homedir-default release.
  - `NEXUS_DATA_DIR=~/.nexus-agents` — explicit override wins over the tier AND the categorization both. Users with cross-repo workflows can pin to homedir for everything.
  - `NEXUS_GITIGNORE_AUTO=0` — silences the auto-gitignore append (useful on CI runners with a frozen working tree).

  ## Migration

  If you have existing state in `~/.nexus-agents/` you want to keep working with, run `nexus-agents migrate` (shipped in the previous release via [#2879](https://github.com/nexus-substrate/nexus-agents/issues/2879)) **before** running any other nexus-agents command in your repo. The migrate command copies per-repo subdirs from homedir → `<repo>/.nexus-agents/` (source untouched, cross-repo subdirs skipped, destination conflicts skipped).

  Users with multi-repo cross-pollination workflows who want to keep the old behavior should add `export NEXUS_DATA_DIR=$HOME/.nexus-agents` to their shell rc.

  Closes the final piece of epic [#2872](https://github.com/nexus-substrate/nexus-agents/issues/2872). After this lands, running `nexus-agents` in a fresh repo produces one new top-level entry — `.nexus-agents/`, auto-gitignored, containing every per-repo runtime artifact. Removing that one directory fully resets the repo's state.

- [#2885](https://github.com/nexus-substrate/nexus-agents/pull/2885) [`7151770`](https://github.com/nexus-substrate/nexus-agents/commit/7151770053ae8cdf4711b973ce6f41e2cd30caa3) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **feat(cli):** `nexus-agents migrate` relocates homedir state into `<repo>/.nexus-agents/` for users adopting the repo-preferred resolver. Closes [#2879](https://github.com/nexus-substrate/nexus-agents/issues/2879) (epic [#2872](https://github.com/nexus-substrate/nexus-agents/issues/2872)).

  Required companion to [#2882](https://github.com/nexus-substrate/nexus-agents/issues/2882) — without this, opting into `NEXUS_REPO_PREFERRED=1` silently orphans users' existing homedir state. Vote [#2876](https://github.com/nexus-substrate/nexus-agents/issues/2876) made this an explicit gate (PM + Catfish dissent: "shipping [#2882](https://github.com/nexus-substrate/nexus-agents/issues/2882) without migrate orphans existing users' homedir state").

  ## Behavior

  ```bash
  nexus-agents migrate            # copy per-repo state from ~/.nexus-agents to <repo>/.nexus-agents
  nexus-agents migrate --dry-run  # report the plan without writing
  nexus-agents migrate --input <path>   # custom source (default: ~/.nexus-agents)
  nexus-agents migrate --output <path>  # custom target (default: <repo>/.nexus-agents)
  ```

  Source is never modified (uses `cpSync`, not move). Cross-repo subdirs (`learning`, `voting`, `memory`, `weather`, `research`, `auth`, `usage`) are SKIPPED with an explicit status — they stay homedir-scoped per the [#2882](https://github.com/nexus-substrate/nexus-agents/issues/2882) state-split contract. Target subdirs that already contain state are SKIPPED (no merge, no overwrite). Empty source subdirs are SKIPPED.

  The per-repo allowlist is read from `getPerRepoSubdirs()` (single source of truth in `nexus-data-dir.ts`) so the migration mirror always matches the resolver.

  ## Tests

  11 tests in `migrate-command.test.ts` covering: empty source (no-op), per-repo copy, cross-repo skip, existing-target skip, empty-source skip, dry-run (writes nothing), missing-repo failure, explicit `--to` override outside a repo, mixed source (copies per-repo and skips every cross-repo subdir), and formatter output for success/dry-run/failure states.

- [#2884](https://github.com/nexus-substrate/nexus-agents/pull/2884) [`94cf6ae`](https://github.com/nexus-substrate/nexus-agents/commit/94cf6ae30e1293ca5aa1aba6e21b64bf080c3148) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **feat(config):** opt-in repo-preferred data dir with state-category split (`NEXUS_REPO_PREFERRED=1`). Closes [#2882](https://github.com/nexus-substrate/nexus-agents/issues/2882) (epic [#2872](https://github.com/nexus-substrate/nexus-agents/issues/2872), ratified by vote [#2876](https://github.com/nexus-substrate/nexus-agents/issues/2876)).

  When `NEXUS_REPO_PREFERRED=1` is set and the caller is inside a git repo, runtime state splits across two locations per its sharing semantics:

  | Category       | Subdirs                                                                                        | Location                              |
  | -------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------- |
  | **Per-repo**   | `sessions/`, `checkpoints/`, `traces/`, `runs/`, `audit/`, `pipeline/`, `tasks/`               | `<repo-root>/.nexus-agents/<subdir>/` |
  | **Cross-repo** | `learning/`, `voting/`, `memory/`, `weather/`, `research/`, `auth/`, `usage/`, models manifest | `~/.nexus-agents/<subdir>/`           |

  The split preserves the cross-project learning loop ([#1389](https://github.com/nexus-substrate/nexus-agents/issues/1389) / [#1407](https://github.com/nexus-substrate/nexus-agents/issues/1407)) — outcomes, routing memory, weather, and model registry stay homedir-scoped so routing quality on low-sample repos isn't degraded. Per-repo work goes per-repo. The state-category split was a hard condition surfaced in vote [#2876](https://github.com/nexus-substrate/nexus-agents/issues/2876) by Architect, DevEx, PM, Scope Steward, and Catfish.

  **Behavior is opt-in this release** so users with months of homedir state aren't silently orphaned. The follow-up minor will flip the default to ON after [#2879](https://github.com/nexus-substrate/nexus-agents/issues/2879) (`nexus-agents migrate`) lands.

  Mechanism: new `getNexusRepoDir()` helper detects the ancestor `.git` (walks upward, handles git worktrees where `.git` is a file, stops at filesystem boundaries, realpath defense). `nexusDataPath(subdir, ...)` checks the first segment against the per-repo allowlist and routes accordingly — existing callsites don't need to change. New `nexusSharedPath(...)` helper for code that wants a hard homedir guarantee. New `repo-root-detection.ts` module is testable in isolation.

  Resolution order (final):
  1. `NEXUS_DATA_DIR` env (explicit override — wins for both categories)
  2. Sandbox mode (`NEXUS_SANDBOX` — unchanged)
  3. **NEW:** `NEXUS_REPO_PREFERRED=1` + `.git` ancestor → per-repo for allowlisted subdirs, homedir for everything else
  4. Homedir fallback for both categories when not opted in

  Tests: 11 new in `nexus-data-dir.test.ts` (env-gated routing, state-split regression guards, walk-upward), 8 new in `repo-root-detection.test.ts` (worktrees, nested repos, symlinks, no-`.git` fallback).

- [#2896](https://github.com/nexus-substrate/nexus-agents/pull/2896) [`e0973a2`](https://github.com/nexus-substrate/nexus-agents/commit/e0973a24efbe08bd3300b94e26586ff6b0e5b0dd) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **feat(config):** sandbox-fallback for cross-repo paths + `nexusDataPathEnsure()` helper. Closes [#2888](https://github.com/nexus-substrate/nexus-agents/issues/2888) + [#2890](https://github.com/nexus-substrate/nexus-agents/issues/2890) (epic [#2887](https://github.com/nexus-substrate/nexus-agents/issues/2887)).

  ## Sandbox-fallback ([#2888](https://github.com/nexus-substrate/nexus-agents/issues/2888))

  Cross-repo subdirs (`research`, `learning`, `memory`, `voting`, `weather`, `auth`, `usage`) now transparently fall back to `<repo>/.nexus-agents/<subdir>/` when `~/.nexus-agents/` is physically unwritable AND we're inside a git repo. Per the user direction at epic [#2887](https://github.com/nexus-substrate/nexus-agents/issues/2887): _"research could be cross repo but we need to be able to support it locally in a repo as well and create the folder if missing — I don't want to override the vote I just want things to work for users running nexus-agents in a sandbox without cross repo access."_

  The fallback fires only when homedir is genuinely unreachable. Normal-machine users see no change — vote [#2876](https://github.com/nexus-substrate/nexus-agents/issues/2876)'s state-split is preserved. A one-time stderr warning per subdir announces the fallback so operators can see what happened without per-call noise.

  If homedir is unwritable AND we're not in a repo, the resolver returns the homedir path anyway — the caller's eventual write surfaces the underlying EACCES, which is the right error to show because the environment is genuinely broken.

  ## `nexusDataPathEnsure()` ([#2890](https://github.com/nexus-substrate/nexus-agents/issues/2890))

  New helper that resolves like `nexusDataPath()` then auto-creates the parent directory. Eliminates the class of "forgot `mkdirSync(dirname(p), { recursive: true })`" bugs that callers were working around individually. `nexusDataPath()` itself stays pure (no syscalls on resolve) — callers that want auto-create opt in explicitly.

  ## Tests

  11 new tests covering: per-repo subdir short-circuits before the writability probe, cross-repo fallback fires only when homedir unwritable + in repo, no fallback when not in a repo (surfaces the underlying error), once-per-subdir announce, `nexusDataPathEnsure` creates parents idempotently.

### Patch Changes

- [#2871](https://github.com/nexus-substrate/nexus-agents/pull/2871) [`18f38db`](https://github.com/nexus-substrate/nexus-agents/commit/18f38db6986560bc42280d868bcdaca259ef1480) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **fix(mcp):** `execute_expert` timeout hint now reflects the client-side SDK abort, not the server-side budget.

  The previous hint told callers to "omit `timeoutMs` to use auto-detected timeout (300-600s)" when the MCP client SDK timed out the request. That advice was misleading because the kill happens client-side (typically 60s SDK default), not at our configured server budget — so omitting `timeoutMs` has no effect on the outcome. The new hint reports the actual measured duration, names the underlying spec-compliance issue (most MCP clients don't honor server-side progress extensions), and gives two real workarounds plus a link to the tracking epic [#2631](https://github.com/nexus-substrate/nexus-agents/issues/2631).

- [#2860](https://github.com/nexus-substrate/nexus-agents/pull/2860) [`8344039`](https://github.com/nexus-substrate/nexus-agents/commit/834403931a899e41fcfe4a9a7f47bd12fabb70cb) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **Addresses [#2824](https://github.com/nexus-substrate/nexus-agents/issues/2824) (Wave A).** fix: trustTier string coercion + race deadline try/catch + UUIDv4 variant nibble + SDK adapter output sanitizer + opencode TTL doc fix

  Five P1/P2 hardening fixes from the 2026-05-16 code-reviewer audit, bundled because each is one-file-disjoint and surgical.
  - **policy-engine.ts** — `trust-tier` rule now coerces string-typed trustTier (`'3'`, `'4'`) the same as numeric, restoring the "untrusted input cannot trigger execute stages" invariant for every real producer (issue-triage, pr-reviewer, secure-handler). Regression tests added.
  - **race-against-deadline.ts** — wraps `onTimeout()` invocation in try/catch + reject so a throwing callback can't escape the `setTimeout` and crash the process. Regression tests added.
  - **random-provider.ts (System)** — switched to `crypto.randomUUID()` for spec-compliant RFC 4122 v4. Existing test tightened to enforce the variant nibble.
  - **random-provider.ts (Seeded)** — constrained the variant nibble to `8/9/a/b` while preserving determinism. Added 100-sample regression test.
  - **sdk-adapter.ts** — applies `sanitizeOutput()` to upstream SDK error messages before logging + wrapping, achieving parity with the subprocess-adapter path. Prevents stray API keys / bearer tokens reaching logs.
  - **opencode-adapter.ts** — corrected stale comment claim that `probeAvailableModels()` is 5-min cached; the cache is actually process-lifetime.

  Audit bullet [#19](https://github.com/nexus-substrate/nexus-agents/issues/19) (firewall-pipeline.ts docstring vs evaluatePolicy) was a false positive — the file contains zero `policy` references — and is being dropped from the epic.

- [#2880](https://github.com/nexus-substrate/nexus-agents/pull/2880) [`5a1522c`](https://github.com/nexus-substrate/nexus-agents/commit/5a1522c85464955dca2aef538fa0ff1f4f1eaa8d) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **fix(sprawl):** redirect three hardcoded relative paths so runtime artifacts land under `getNexusDataDir()` instead of sprawling at `cwd`. Closes [#2873](https://github.com/nexus-substrate/nexus-agents/issues/2873), [#2874](https://github.com/nexus-substrate/nexus-agents/issues/2874), [#2875](https://github.com/nexus-substrate/nexus-agents/issues/2875) (epic [#2872](https://github.com/nexus-substrate/nexus-agents/issues/2872)).
  - **`./runs/` → `getNexusDataDir()/runs/`** (`pipeline-runner.ts`). The previous `DEFAULT_RUNS_DIR = './runs'` const is replaced with `getDefaultRunsDir()` so trace output for every `PipelineRunner` execution lands under the centralized data dir. Function form (not const) so `NEXUS_DATA_DIR` env changes are honored at call time. Was the single biggest sprawl source (1063 entries observed in one example checkout).
  - **`./.nexus-pipeline/` → `getNexusDataDir()/pipeline/`** (`task-tracker.ts`). The `JsonTaskTracker` JSON-fallback default no longer drops a `.nexus-pipeline/` directory at the repo root.
  - **`./logs/run_evaluation/` default removed** (`cli-types.ts`). The only consumer of `--output-dir` (`handleSweBenchCommand`) is a deprecation shim that ignores the value, so the default was advertising a sprawl-creating fallback for no reason. Live callers should pass an explicit path or resolve through `getNexusDataDir()` at use time.

  No behavior change for callers that pass `runsDir` / `outputDir` / `--output-dir` explicitly. Tests added covering the new defaults + the call-time env resolution.

- [#2883](https://github.com/nexus-substrate/nexus-agents/pull/2883) [`ee6bacd`](https://github.com/nexus-substrate/nexus-agents/commit/ee6bacd1e012556e74532abcf357fa8f22ac7d31) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **feat(config):** `nexus-agents.yaml` now lives in `.nexus-agents/` by default. Closes [#2877](https://github.com/nexus-substrate/nexus-agents/issues/2877) (epic [#2872](https://github.com/nexus-substrate/nexus-agents/issues/2872)).

  The config-loader checks `.nexus-agents/nexus-agents.yaml` ahead of the legacy root-level location, and `nexus-agents setup` / `nexus-agents config init` write new configs to the dotdir. Existing root-level configs keep working without action — both writers and the loader fall back to them transparently. The migrate command ([#2879](https://github.com/nexus-substrate/nexus-agents/issues/2879)) is the explicit way to relocate.

  Locations checked in order:
  1. `NEXUS_CONFIG_PATH` env (unchanged)
  2. **NEW:** `<cwd>/.nexus-agents/nexus-agents.yaml`
  3. **NEW:** `<cwd>/.nexus-agents/nexus-agents.yml`
  4. `<cwd>/nexus-agents.yaml` (legacy root, still works)
  5. `<cwd>/nexus-agents.yml` (legacy root, still works)
  6. `<getNexusDataDir()>/nexus-agents.yaml` (global fallback, unchanged)

  Touches: `config/config-loader.ts` (lookup), `cli/setup-config.ts` (writer), `cli/config-init.ts` (writer), `cli/doctor.ts` (probe), `cli-commands-handlers.ts` (first-run hint), `cli/setup-environment.ts` (env probe). 4 new tests in `config-loader.test.ts` pin the precedence + NEXUS_CONFIG_PATH dominance.

- [#2881](https://github.com/nexus-substrate/nexus-agents/pull/2881) [`386c837`](https://github.com/nexus-substrate/nexus-agents/commit/386c837f91d7b1f30eb926491fe78172000f49e0) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **ci(sprawl):** working-tree-clean gate after `pnpm test:coverage`. Closes [#2878](https://github.com/nexus-substrate/nexus-agents/issues/2878) (epic [#2872](https://github.com/nexus-substrate/nexus-agents/issues/2872)).

  CI now fails if tests leave files matching the sprawl-pattern paths from the epic-[#2872](https://github.com/nexus-substrate/nexus-agents/issues/2872) audit (`runs/`, `logs/`, `.nexus-pipeline/`, `.nexus-agents/`, `predictions.jsonl`, `coverage.json`, `.test-*`). The check runs unconditionally (`if: always()`) so it catches leaks even when tests pass.

  The audit found the test suite is already clean — every test uses `mkdtempSync(tmpdir(), ...)` with `afterEach` cleanup. This gate locks that discipline in so a future test that writes to `cwd` without cleanup gets caught at PR time rather than discovered later as accumulated sprawl.

- [#2897](https://github.com/nexus-substrate/nexus-agents/pull/2897) [`794c8c7`](https://github.com/nexus-substrate/nexus-agents/commit/794c8c7311faae811729e59ab484a86d1f810313) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **fix(config):** route per-repo subdir writes through `nexusDataPath()` so the epic-[#2872](https://github.com/nexus-substrate/nexus-agents/issues/2872) state-split actually fires. Closes [#2889](https://github.com/nexus-substrate/nexus-agents/issues/2889) (epic [#2887](https://github.com/nexus-substrate/nexus-agents/issues/2887)).

  Two callers joined a per-repo subdir directly under `getNexusDataDir()` instead of going through `nexusDataPath()`. The manual join bypassed the per-repo routing — so the state landed in homedir even with `NEXUS_REPO_PREFERRED` ON, partly defeating the consolidation epic [#2872](https://github.com/nexus-substrate/nexus-agents/issues/2872) shipped.
  - **`pipeline-runner.ts` — `getDefaultRunsDir()`** did `join(getNexusDataDir(), 'runs')`. `runs` is a per-repo subdir, so pipeline trace output went to `~/.nexus-agents/runs/` instead of `<repo>/.nexus-agents/runs/`. Now `nexusDataPath('runs')`.
  - **`setup-data-dir.ts` — `initDataDirectories()`** did `join(NEXUS_DATA_DIR, subdir)` for every subdir in `DATA_SUBDIRECTORIES`, pre-creating `sessions/`, `checkpoints/`, `audit/` (all per-repo) in homedir. Now each subdir routes through `nexusDataPath(...subdir.split('/'))` so per-repo subdirs land in `<repo>/.nexus-agents/` and cross-repo subdirs in homedir.

  No behavior change when `NEXUS_DATA_DIR` is explicitly set or `NEXUS_REPO_PREFERRED=0` — both paths still resolve identically. The fix only matters when the repo-preferred default is active, which is where it was silently not working.

  Tests: a per-repo-routing test added to each of `pipeline-runner.test.ts` and `setup-data-dir.test.ts`; existing homedir-path tests fenced with `NEXUS_REPO_PREFERRED=0` to keep testing the homedir branch explicitly.

- [#2898](https://github.com/nexus-substrate/nexus-agents/pull/2898) [`e909447`](https://github.com/nexus-substrate/nexus-agents/commit/e9094479c864a1e07aab20bb4c08a96787b30c8d) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **feat(cli):** `nexus-agents setup` auto-gitignores `.nexus-agents/` + prints a data-layout hint. Closes [#2891](https://github.com/nexus-substrate/nexus-agents/issues/2891) (epic [#2887](https://github.com/nexus-substrate/nexus-agents/issues/2887)).

  The auto-gitignore landed in `getNexusRepoDir()` (epic [#2872](https://github.com/nexus-substrate/nexus-agents/issues/2872)) but only fired lazily on the first resolver call — a user who ran `setup` and read its output had no idea where state would live. Setup now, at the end of a successful run:
  - Calls `ensureGitignored(repoRoot, '.nexus-agents/')` explicitly so the entry is present immediately (idempotent — won't duplicate).
  - Prints a "Data layout" section explaining per-repo (`.nexus-agents/`) vs cross-project (`~/.nexus-agents/`) state and pointing at `nexus-agents doctor` for the full picture.

  Skipped on `--dry-run` (nothing was installed) and when not inside a git repo. Both the interactive and non-interactive setup paths are covered.

  4 tests in `setup-command.test.ts`: appends the entry, idempotent on an existing entry, no-op on dry-run, no-op outside a repo.

- [#2899](https://github.com/nexus-substrate/nexus-agents/pull/2899) [`b1613fd`](https://github.com/nexus-substrate/nexus-agents/commit/b1613fd6832551534f2ea4386ff042790a2bdfce) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **feat(cli):** `nexus-agents doctor` reports per-subdir data paths grouped by the state-split. Closes [#2892](https://github.com/nexus-substrate/nexus-agents/issues/2892) (epic [#2887](https://github.com/nexus-substrate/nexus-agents/issues/2887)).

  Before, `doctor` reported a single `~/.nexus-agents/` root and `checkDataDirectory()` did `join(getNexusDataDir(), name)` — which (like [#2889](https://github.com/nexus-substrate/nexus-agents/issues/2889)) bypassed the per-repo router, so the _reported_ paths were wrong after the epic [#2872](https://github.com/nexus-substrate/nexus-agents/issues/2872) flip.

  `checkDataDirectory()` now resolves each subdir through `nexusDataPath()` (the real location), tags it `per-repo` or `cross-repo`, and exposes `repoRoot`. The doctor output groups accordingly:

  ```
  ✓ Data directory layout:
    Per-repo — /repo/.nexus-agents (5/7)
      ✓ sessions     /repo/.nexus-agents/sessions
      ✓ audit        /repo/.nexus-agents/audit
      · pipeline     /repo/.nexus-agents/pipeline  (missing — created on first use)
      …
    Cross-repo — /home/u/.nexus-agents (7/7)
      ✓ learning     /home/u/.nexus-agents/learning
      ✓ auth         /home/u/.nexus-agents/auth
      …
  ```

  `DataSubdirStatus` gains a `scope` field; `DataDirectoryCheck` gains `repoRoot`. Tests added covering scope tagging + the `repoRoot` field.

- [#2901](https://github.com/nexus-substrate/nexus-agents/pull/2901) [`05bf0e0`](https://github.com/nexus-substrate/nexus-agents/commit/05bf0e0284682ffeb48bee081fe26d3dccb96928) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **docs:** align documentation + source docstrings with the post-[#2872](https://github.com/nexus-substrate/nexus-agents/issues/2872) data-directory split. Closes [#2893](https://github.com/nexus-substrate/nexus-agents/issues/2893) (epic [#2887](https://github.com/nexus-substrate/nexus-agents/issues/2887)).

  After epics [#2872](https://github.com/nexus-substrate/nexus-agents/issues/2872) / [#2887](https://github.com/nexus-substrate/nexus-agents/issues/2887) flipped the default to a per-repo data directory, 15 user-facing doc references and several source docstrings still claimed everything lives under `~/.nexus-agents/`. This corrects them:
  - **`docs/getting-started/INSTALLATION.md`** — the Data Storage section now has a per-repo / cross-repo scope column and explains the `NEXUS_DATA_DIR` / `NEXUS_REPO_PREFERRED` / sandbox-fallback behavior.
  - **`docs/guides/SANDBOXED-USAGE.md`** — the "forcing the behavior you want" table updated; `NEXUS_REPO_PREFERRED=0` documented as the pre-[#2872](https://github.com/nexus-substrate/nexus-agents/issues/2872) opt-out.
  - **`docs/architecture/SECURITY.md`** — audit-log paths corrected to `<repo>/.nexus-agents/audit/` (`audit/` is per-repo); `auth/` paths left as-is (correctly cross-repo).
  - **`docs/getting-started/CONFIGURATION.md`, `docs/getting-started/FIRST_TASK.md`, `docs/TROUBLESHOOTING.md`, `CLAUDE.md`** — per-repo vs cross-repo paths corrected and contextualized.
  - **Source docstrings** in `doctor.ts`, `setup-data-dir.ts`, `verify-command.ts`, `pipeline-checkpoint.ts`, `wave-checkpoint-persistence.ts`, `wave-checkpoint-types.ts` — corrected to reflect the split.
  - **`handler-utils.test.ts`** — added a clarifying comment: `sessions.db` (a top-level file) resolves cross-repo, distinct from the per-repo `sessions/` directory. The test was already correct — the audit's "misleading" flag was a false positive.

  No behavior change — documentation + comments only.

- [#2900](https://github.com/nexus-substrate/nexus-agents/pull/2900) [`e1a44d0`](https://github.com/nexus-substrate/nexus-agents/commit/e1a44d07fa1a199decbf918c7ae19ac9937071c3) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **chore(ci):** `.devcontainer/` for contributor parity + a docker-compose consolidation E2E test. Closes [#2894](https://github.com/nexus-substrate/nexus-agents/issues/2894) + [#2895](https://github.com/nexus-substrate/nexus-agents/issues/2895) (epic [#2887](https://github.com/nexus-substrate/nexus-agents/issues/2887)).

  ## `.devcontainer/devcontainer.json` ([#2894](https://github.com/nexus-substrate/nexus-agents/issues/2894))

  A Node 22 + pnpm 9.15.0 devcontainer pinned to match CI. Contributors get a one-click CI-identical environment; `pnpm install && pnpm test` works with zero manual setup. No change to CI or anyone's existing local workflow.

  ## Consolidation E2E test ([#2895](https://github.com/nexus-substrate/nexus-agents/issues/2895))

  `docker-compose.consolidation-test.yml` + `scripts/consolidation-test.sh` verify the epic-[#2872](https://github.com/nexus-substrate/nexus-agents/issues/2872) directory contract against a real filesystem in a clean container — the bug class unit tests can't catch because they mock `fs`. Two modes:
  - **normal** — writable homedir. Asserts per-repo subdirs land in `<repo>/.nexus-agents/`, cross-repo subdirs in `$HOME/.nexus-agents/`, `.gitignore` carries the entry, no `runs/`/`logs/`/`.nexus-pipeline/` sprawl, and per-repo subdirs do NOT leak into homedir.
  - **sandbox** — read-only homedir mount. Asserts cross-repo subdirs fall back to `<repo>/.nexus-agents/` per [#2888](https://github.com/nexus-substrate/nexus-agents/issues/2888).

  Wired as a required `consolidation-test` CI job (gates merge via `ci-success`). No new Dockerfile — uses `node:22` directly.

  ## Bug caught + fixed

  Building the test surfaced a real bug: `initDataDirectories()` created the homedir root up-front and aborted the _whole_ operation on EROFS — so a read-only-homedir sandbox got nothing, never reaching the per-repo subdirs (which ARE writable). Fixed: dropped the explicit root `ensureDir` (recursive mkdir of each subdir creates its parent) and made per-subdir failures non-fatal. This is what makes the [#2888](https://github.com/nexus-substrate/nexus-agents/issues/2888) sandbox-fallback actually usable from `setup`.

## 2.79.4

### Patch Changes

- [#2825](https://github.com/nexus-substrate/nexus-agents/pull/2825) [`71156db`](https://github.com/nexus-substrate/nexus-agents/commit/71156dbcb22b9c27db80a7bccd083f32467d7558) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **Closes [#2821](https://github.com/nexus-substrate/nexus-agents/issues/2821).** fix(adapters/opencode): error events surface as failure, not success

  OpenCode NDJSON `{"type":"error",...}` events (e.g. `ProviderModelNotFoundError`) were folded into the response's `content` string as `[OpenCode error: <msg>]` and returned via `ok()` from the subprocess-adapter. Consensus voters and the routing learner consumed the error marker as the model's reasoning text — polluting votes and adaptive-routing memory.

  The parser now captures error-event messages in a new `errorMessage` field on `OpenCodeCliResponse` (separate from `content`). When a stream produces no text but does carry an error event, `content` stays empty so `extractResponse()` returns null and the subprocess-adapter classifies the call as `EXECUTION_ERROR` — same handling as any other failed CLI call. The error message is preserved in `errorMessage` and the existing `logger.warn('OpenCode returned error event')` log for observability.

  Mixed streams (text arrives, then an error) keep the text in `content` and surface the error in `errorMessage` so callers see both.

  Six new regression tests cover error-only streams, error-after-text streams, the explicit `extractResponse → null` contract, and the previously-passing-but-wrong test cases that codified the bug.

- [#2828](https://github.com/nexus-substrate/nexus-agents/pull/2828) [`37dd078`](https://github.com/nexus-substrate/nexus-agents/commit/37dd0782399318b0201d733d0efe5a98ce42b923) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **Closes [#2822](https://github.com/nexus-substrate/nexus-agents/issues/2822).** fix(consensus): canCascadeEarly uses wrong denominator vs strategy — wrong-winner with abstains

  The agreement-based cascade in `ConsensusEngine.canCascadeEarly` computed approval rates against `totalExpected = requiredVoters.length` and compared against `VOTING_THRESHOLDS[algorithm]` directly. Every voting strategy (`SimpleMajorityStrategy`, `SupermajorityStrategy`, `UnanimousStrategy`, `ProofOfLearningStrategy`) uses `approve + reject` as its denominator — abstains explicitly excluded.

  Pre-fix concrete failure: 5-voter `supermajority` with `[approve, abstain, abstain, abstain, pending]`. Cascade computed max approval = `(1+1)/5 = 0.40 < 0.67` → cascade-reject. Strategy at close (last approves): 2 approve / 0 reject / 3 abstain → 2/2 = 1.0 ≥ 0.67 → APPROVE. Different winners. Cascade also used strict `>` while supermajority/unanimous strategies use `>=`, mismatching at the exact threshold.

  The fix delegates to the strategy itself: build a best-case (all pending voters approve) and worst-case (all pending voters reject) hypothetical vote map, call `strategy.calculateOutcome` on each, and cascade only when both extremes yield the same outcome. This guarantees parity with the strategy's denominator semantics and inequality operator by construction — including correct behavior for `higher_order`/`opinion_wise` (whose `IVotingStrategy.calculateOutcome` falls back to simple-vote aggregation; the Bayesian correlation path is invoked separately and is unaffected).

  Three new regression tests cover (a) supermajority + abstain wrong-winner scenario, (b) cascade-fires-early when both extremes agree (no abstain confusion), (c) supermajority `>=` boundary semantics. All 520 consensus tests pass; typecheck + lint clean.

- [#2827](https://github.com/nexus-substrate/nexus-agents/pull/2827) [`e509f9e`](https://github.com/nexus-substrate/nexus-agents/commit/e509f9edaeca08111f012e65c184b3f216bb2182) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **Closes [#2823](https://github.com/nexus-substrate/nexus-agents/issues/2823).** fix(pipeline): outcome recording hardcodes cli='claude' — regression of [#1154](https://github.com/nexus-substrate/nexus-agents/issues/1154)

  `pipeline/agent-executor.ts` and `pipeline/adaptive-orchestrator.ts` both wrote to `OutcomeStore` with `cli: 'claude' as const` — a regression of the bug [#1154](https://github.com/nexus-substrate/nexus-agents/issues/1154) fixed elsewhere. Every pipeline-executed task (research / plan / vote / decompose / code_gen / review / security) was credited to claude regardless of which CLI actually ran, poisoning weather-report visualizations and the LinUCB cold-start `warmStart()` (composite-router.ts:353/374).

  **Fix:**
  1. `ExpertBridgeResult` now carries the resolved `cli?: CliNameLiteral`. The expert-bridge derives it from `CliResponse.model` via the canonical `getCliForModelId` registry mapping — guards against unknown model strings rather than fabricating a default.
  2. `recordOutcome` in `agent-executor.ts` now takes a `RecordOutcomeArgs` options bundle including `cli: CliNameLiteral | undefined`. When `cli` is undefined (bridge failed before dispatch, or non-CLI stage like local security scan / consensus vote), the helper **skips the record** rather than fabricating a wrong attribution. Stage events still emit; only the cli-attributed outcome that would poison the routing learner is suppressed.
  3. All 9 call sites (research / plan / vote / decompose / implement / qaReview / securityScan) updated. Sub-call stages with multiple expert calls (research) pick whichever sub-call actually reached a CLI.
  4. `recordPipelineOutcome` in `adaptive-orchestrator.ts` removed entirely — it duplicated the per-stage records, fabricated `cli: 'claude'` for pipeline-level data, hardcoded `category: 'code_generation'` regardless of classification, and had no downstream consumer.

  **Tests:** 3 new regression cases in `agent-executor.test.ts` assert (a) the threaded cli wins over any hardcoded value, (b) `undefined cli` skips the record entirely, (c) different stages can have different cli attributions. All 719 pipeline + parser tests pass; typecheck + lint clean.

- [#2830](https://github.com/nexus-substrate/nexus-agents/pull/2830) [`597ce63`](https://github.com/nexus-substrate/nexus-agents/commit/597ce63e6c9bee268a53cd1fb9de0639295ee851) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **Closes one bullet of [#2824](https://github.com/nexus-substrate/nexus-agents/issues/2824).** fix(routing): cold-start LinUCB warmStart ingests e2e-eval outcomes

  `CompositeRouter.initializeLinucbBandit` has two `getOutcomeStore().query()` paths:
  - 30-day lookback (composite-router.ts:353) — already filters `excludeQualitySignals: ['e2e-eval']` to keep synthetic test outcomes out of the routing learner
  - Cold-start fallback (composite-router.ts:374) — pre-fix queried with **no filter**, replaying any e2e-eval outcomes that survived from prior test runs into LinUCB

  The cold-start path activated on fresh checkouts against an existing `nexus-data/` directory, or after restarts where the 30-day window happened to be empty. A handful of e2e-eval rows could measurably skew early routing decisions.

  One-line fix: mirror the 30-day filter on line 374. No new tests — existing 248 composite-router tests still pass.

- [#2829](https://github.com/nexus-substrate/nexus-agents/pull/2829) [`58b69dd`](https://github.com/nexus-substrate/nexus-agents/commit/58b69ddf42032c48e26cd131117de1e945aa9907) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **Closes one bullet of [#2824](https://github.com/nexus-substrate/nexus-agents/issues/2824).** fix(adapters/codex,gemini): cleanup removes the tempdir parent, not just the file

  `CodexCliAdapter.getCommand` and `GeminiCliAdapter.getCommand` created a `mkdtempSync` tempdir per call when a `systemPrompt` was provided, dropped an `instructions.md`/`policy.md` into it, then on cleanup unlinked only the file. The empty `/tmp/nexus-codex-sysprompt-XXXXXX` and `/tmp/nexus-gemini-sysprompt-XXXXXX` parent dirs were leaked, waiting for the OS reaper.

  Long-running MCP daemons and CI workers that fan out many subagent calls accumulated thousands of empty dirs, eventually hitting inode/disk limits. Fix is one-line per adapter: switch `unlinkSync(file)` → `rmSync(dir, { recursive: true, force: true })`.

  Two new regression tests cover the post-cleanup state — both the file AND parent dir must be gone. Pre-fix only the file was unlinked.

- [#2835](https://github.com/nexus-substrate/nexus-agents/pull/2835) [`86ccc72`](https://github.com/nexus-substrate/nexus-agents/commit/86ccc7299d3867aa92f995d6e8a349c33af43715) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **Addresses [#2832](https://github.com/nexus-substrate/nexus-agents/issues/2832) (part of epic [#2831](https://github.com/nexus-substrate/nexus-agents/issues/2831)).** chore(migrate): pre-transfer sweep for nexus-substrate org

  Updates CI workflows, package.json repository fields, MCP server identity (`mcpName` + `server.json`), CLI URLs, docs, and the TypeDoc config to reference the new `nexus-substrate` org. CI workflow owner refs use `${{ github.repository_owner }}` so they follow the repo wherever it lives.

  No behavior changes — this is metadata + string sweep ahead of `gh api -X POST repos/williamzujkowski/nexus-agents/transfer -f new_owner=nexus-substrate`. After transfer, npm trusted publishers for `nexus-agents` and `nexus-memory` need to be reconfigured on npmjs.com under the new repo path.

  Intentional keeps documented in the PR body ([#2835](https://github.com/nexus-substrate/nexus-agents/issues/2835)): personal maintainer @handle, contact email, GitHub Sponsors profile, website deploy URL, design-system refs, security-test fixtures, vulnerability-scanner-registry refs, non-migrating ECOSYSTEM.md links, CHANGELOG history, TypeDoc HTML output.

- [#2855](https://github.com/nexus-substrate/nexus-agents/pull/2855) [`3fab4d4`](https://github.com/nexus-substrate/nexus-agents/commit/3fab4d49978a634c5b2b1467910f7222f75cc295) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **Closes [#2844](https://github.com/nexus-substrate/nexus-agents/issues/2844) and [#2846](https://github.com/nexus-substrate/nexus-agents/issues/2846).** docs: relocate SANDBOXED-USAGE.md to docs/guides/; demote CLAUDE.md from new-user surfaces

  `docs/getting-started/SANDBOXED-USAGE.md` moves to `docs/guides/` (it's ops material, not new-user onboarding). The runtime messages in `cli-server-gateway.ts`, `portable-mode.ts`, and `sandbox-factory.ts` were updated to print the new path so the auto-detected portable-mode banner and the sandbox-factory error message both point to the file's new home.

  No behavior change; only the printed string changed.

## 2.79.3

### Patch Changes

- [#2818](https://github.com/williamzujkowski/nexus-agents/pull/2818) [`f6d8604`](https://github.com/williamzujkowski/nexus-agents/commit/f6d8604e97ea0098934ac708182ce6c3801c1fd8) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **ci(release):** Bump the publish-path Node version from 22 to 24 LTS so npm 11.x is available for OIDC trusted publishing. Node 22 LTS ships npm 10.9.x, which silently emits `E404 'not in this registry'` on OIDC-authenticated publishes — diagnosed during `nexus-eval-atbench` v0.1.0–0.1.3 attempts ([#2524](https://github.com/williamzujkowski/nexus-agents/issues/2524)). The CI composite default stays at 22; only the two publish-path `setup-node` calls in `release.yml` (changesets/action step + manual-publish step) override to 24.

  Unblocks OIDC publishes for `nexus-agents` and `nexus-memory` (the latter's bootstrap `0.1.0` was a local publish via the granular `NPM_TOKEN`; subsequent versions need OIDC because the token is being retired — see [#2814](https://github.com/williamzujkowski/nexus-agents/issues/2814)).

## 2.79.2

### Patch Changes

- [#2815](https://github.com/williamzujkowski/nexus-agents/pull/2815) [`e0e5c0b`](https://github.com/williamzujkowski/nexus-agents/commit/e0e5c0bb1b62161838f573d745b6845df33d4d9c) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **Closes [#2814](https://github.com/williamzujkowski/nexus-agents/issues/2814).** Migrate the Release workflow to npm trusted publishing via OIDC. Removes `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}` from all four publish-relevant env blocks (changesets/action step, publish-race fallback step, manual-publish dry-run + actual publish steps). Auth now flows via the workflow's `id-token: write` permission + per-package trusted-publisher configuration on npmjs.com.

  `NPM_CONFIG_PROVENANCE: true` is kept — the same OIDC token covers both auth and Sigstore provenance signing.

  One-time configuration required on npmjs.com per package (Settings → Trusted Publishers → Add Publisher):
  - Publisher: GitHub Actions, Organization: `williamzujkowski`, Repository: `nexus-agents`, Workflow filename: `release.yml`
  - Package name: `nexus-agents`
  - Repeat with Package name: `nexus-memory`

  After both are configured, the `NPM_TOKEN` GitHub secret is no longer used and can be deleted (recommended after 1-2 successful OIDC releases). Same OIDC pattern as the nexus-eval-\* repos ([#2524](https://github.com/williamzujkowski/nexus-agents/issues/2524)).

  Side effect: resolves the granular-token-scope 403 on `nexus-memory` that was the root cause of [#2814](https://github.com/williamzujkowski/nexus-agents/issues/2814) — OIDC trusts per-package, no token-scope semantics.

## 2.79.1

### Patch Changes

- [#2810](https://github.com/williamzujkowski/nexus-agents/pull/2810) [`9355e2a`](https://github.com/williamzujkowski/nexus-agents/commit/9355e2a82e759b29c082eedca3f58f958541d73c) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **Phase 5 of [#2805](https://github.com/williamzujkowski/nexus-agents/issues/2805) (federated AGENTS.md adoption).** New CI drift gate prevents harness-config drift from re-introducing the content-duplication that the federation was built to eliminate.
  - `scripts/check-harness-alignment.ts` — reuses `checkHarnessAlignment()` from `src/cli/doctor-harness-alignment.ts` (Phase 3); exits non-zero when any harness file exists but doesn't reference `AGENTS.md`
  - New `Harness Alignment Drift` job added to `.github/workflows/docs-check.yml`
  - Same logic the `doctor` command uses; the CI gate just makes it blocking

  A PR that pastes content into a harness file instead of refactoring to a redirect will now fail CI with a pointer to `docs/architecture/AGENT_COMPATIBILITY.md`.

  Closes [#2805](https://github.com/williamzujkowski/nexus-agents/issues/2805) (federation epic).

## 2.79.0

### Minor Changes

- [#2808](https://github.com/williamzujkowski/nexus-agents/pull/2808) [`456ea82`](https://github.com/williamzujkowski/nexus-agents/commit/456ea82f088e24edd2401e975e88f3f9a38efea2) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **Phase 3 of [#2805](https://github.com/williamzujkowski/nexus-agents/issues/2805) (federated AGENTS.md adoption).** `nexus-agents doctor` now reports per-harness config alignment.

  The check walks each of the 5 known harness discovery files in the current working directory:
  - `.cursor/rules/agents.mdc` (Cursor)
  - `.windsurf/rules/agents.md` (Windsurf)
  - `.aider.conf.yml` (Aider)
  - `.continue/rules/agents.md` (Continue)
  - `.clinerules/agents.md` (Cline)

  For each, it reports one of three states:
  - **aligned** — file exists and references `AGENTS.md` (the federation invariant)
  - **drift** — file exists but doesn't reference `AGENTS.md` (content duplication; needs refactor)
  - **absent** — file not present (harness not in use; fine)

  Plus a top-level `AGENTS.md: present/MISSING` line. If any drift is detected, the section emits a warning pointing at `docs/architecture/AGENT_COMPATIBILITY.md` for the federation contract.

  Implementation:
  - New module `src/cli/doctor-harness-alignment.ts` exports `checkHarnessAlignment(cwd)` returning a typed `HarnessAlignmentCheck`
  - `DoctorResult` grows a `harnessAlignment` field
  - `printDoctorResults` calls a new `printHarnessAlignment` section before the summary
  - 8 new tests cover empty repo, all-aligned, mixed drift, mixed absent, unreadable paths

  Phases 4-5 of [#2805](https://github.com/williamzujkowski/nexus-agents/issues/2805) still pending: AGENTS.md preamble update (Phase 4 — folded into [#2806](https://github.com/williamzujkowski/nexus-agents/issues/2806)) and periodic drift detection (Phase 5 — separate work).

## 2.78.0

### Minor Changes

- [#2790](https://github.com/williamzujkowski/nexus-agents/pull/2790) [`a6e8aba`](https://github.com/williamzujkowski/nexus-agents/commit/a6e8abae9ec83cb8dbe69006b9724037f157b1ce) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **Closes [#2697](https://github.com/williamzujkowski/nexus-agents/issues/2697).** Add optional `baselineId` field to `TaskOutcomeSchema` for fork-session branch correlation.

  Follows the established additive-optional-field pattern (`wasRetried`/`triageAction` [#1506](https://github.com/williamzujkowski/nexus-agents/issues/1506), `routingStage`/`retryCount` [#1785](https://github.com/williamzujkowski/nexus-agents/issues/1785), `vendor`/`family` [#2548](https://github.com/williamzujkowski/nexus-agents/issues/2548), `voterRole` [#2662](https://github.com/williamzujkowski/nexus-agents/issues/2662)) — backward-compatible, no migration.
  - `TaskOutcomeSchema.baselineId: z.string().min(1).max(64).optional()` — set on outcomes recorded inside a fork-then-merge graph branch. Free-form, caller-assigned (typically the parent node's `executionId` or `taskId`).
  - `OutcomeQuerySchema.baselineId` filter added — `query({ baselineId: 'B' })` returns every outcome that forked from baseline B as a cohort.
  - `applyFilters` predicate-builder picks up the new filter.
  - `OutcomeStoreAdapter.query` (Phase 6 of [#2766](https://github.com/williamzujkowski/nexus-agents/issues/2766)) threads `baselineId` through `where`.

  Closes the correlation gap surfaced by the [#2665](https://github.com/williamzujkowski/nexus-agents/issues/2665) fork-session spike. The orchestration shape already works today via `GraphBuilder`; this PR closes the remaining "let me later compare branches as a cohort" gap so the telemetry is queryable.

  Three test groups added: `OutcomeQuerySchema` length bounds, `TaskOutcomeSchema` accept/reject cases, `OutcomeStore` round-trip + filter composition + JSONL persistence round-trip.

  Part of Epic F ([#2667](https://github.com/williamzujkowski/nexus-agents/issues/2667)). A `fork-comparison` graph template (spike recommendation 2) is intentionally out of scope here — file separately if a concrete tool needs it.

- [#2791](https://github.com/williamzujkowski/nexus-agents/pull/2791) [`bc2a4c8`](https://github.com/williamzujkowski/nexus-agents/commit/bc2a4c80664caeea337f5d4b70824b416b87822e) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **Follow-ups to Phases 5, 7, and 9 of epic [#2766](https://github.com/williamzujkowski/nexus-agents/issues/2766)** (memory unification). Closes review findings from the post-merge code review.
  - **Phase 9 cleanup is now actually invoked.** `runBeliefCleanup` is wired into `ToolMemoryManager`'s constructor and runs once on first startup (marker-file gated). Previously the cleanup logic existed and was fully tested but had zero production callers, so polluted arXiv rows never got removed.
  - **`memory_stats` reads the unified `MemoryRegistry`.** Adds a `registry` array to the response with one entry per attached domain (`belief`, `agentic`, `adaptive`, `typed`, `mobimem`, `outcomes`). This delivers the Phase 5 architectural goal — discoverability through one canonical fan-out — that the per-backend `is*Available()` calls left undone.
  - **Real counts on `agentic` + `adaptive`.** Both now expose `count()` (delegating to the shared `HybridMemoryBackend`) and the registry attachments report actual row totals instead of the hardcoded `0` placeholder.
  - **`HindsightBeliefMemory.forget(id)` is a public API.** Removes a single belief and cleans up index entries; used by the cleanup driver and available for future tooling.
  - Polish: drift-gate probes use boundary-aware regex (`new Database(?!\w)` etc.) so `new DatabaseAdapter(...)` and `new MobiMemAdapter(...)` no longer false-positive. `RunBeliefCleanupOptions` callbacks are async-only — production wiring always returns promises, and the tighter contract surfaces sync-vs-async confusion at type-check time.

- [#2780](https://github.com/williamzujkowski/nexus-agents/pull/2780) [`e969f55`](https://github.com/williamzujkowski/nexus-agents/commit/e969f55c4fb5fb2e40952b89ce367459232c731e) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Scaffold the `nexus-memory` workspace package (Phase 3 of [#2766](https://github.com/williamzujkowski/nexus-agents/issues/2766)). Closes [#2769](https://github.com/williamzujkowski/nexus-agents/issues/2769).

  New package at `packages/nexus-memory/` with:
  - **`IMemoryBackend<TKey, TValue>` contract** — every concept-space implements `read`, `write`, `query`, `delete`, `stats`, `close`. Async surface; sync `better-sqlite3` inside.
  - **`MemoryRegistry`** — singleton via `getMemoryRegistry()`, test-injectable via `setMemoryRegistry()`. Backends share one SQLite connection. `createInMemoryMemoryRegistry()` for tests.
  - **`SqliteBackend`** + **`InMemoryBackend`** — both implement the same contract; the contract test in `backends/contract.test.ts` runs against both with identical assertions.
  - **Telemetry** — aggregated counters (default) + opt-in full-audit mode via `NEXUS_MEMORY_AUDIT_MODE=audit` (Phase 2 vote ballot 2: C with 6/7 supermajority). `recordMemoryEvent` / `subscribeToMemoryEvents` / `getMemoryEventCounters`. Audit-mode summaries truncated to 120/240 chars (catfish-mitigation: per-event payload capture, not just counters).
  - **Cold-archive Zod validation** (Phase 2 vote mitigation [#1](https://github.com/williamzujkowski/nexus-agents/issues/1), security dissent) — any backend constructed with `schema` rejects invalid writes via `MemoryValidationError` before they hit storage.
  - **Importer skeleton** — `registerImporter` / `runImporters` with marker-file gating. Phase 4+ migrations plug in concrete importers (MobiMem JSON, OutcomeStore JSONL, agentic.db, etc.). `backupSourceFile` helper renames source to `.bak.<timestamp>` after a successful import.

  57 tests across 4 files. Contract test ensures both backends behave identically; telemetry tests pin both default-mode and audit-mode behaviors; importer tests cover idempotency + error isolation.

  No nexus-agents migrations yet — that starts in Phase 4 ([#2770](https://github.com/williamzujkowski/nexus-agents/issues/2770)).

- [#2781](https://github.com/williamzujkowski/nexus-agents/pull/2781) [`10cebdd`](https://github.com/williamzujkowski/nexus-agents/commit/10cebdd4053f587684a0410d71b46cafe40c2ab4) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **Closes [#2719](https://github.com/williamzujkowski/nexus-agents/issues/2719)**: MobiMem now persists to SQLite. Phase 4 of [#2766](https://github.com/williamzujkowski/nexus-agents/issues/2766).

  Pre-Phase 4, MobiMem's `dbPath` config was a dead surface — the impl classes used pure `Map<string, Entry>` and `dbPath` was passed in but never opened. The result was a triple-disconnect:
  1. `routing-memory.ts:179` `new MobiMem()` → in-memory only, died on process exit.
  2. `pipeline/agent-executor.ts:163` `persistMobiMemState` → saved an empty MobiMem to `mobimem-state.json` (stats only, no data).
  3. `tool-memory.ts:270` `new MobiMem({ dbPath })` → opened a SQLite file that nobody wrote to.

  KnnRoutingStage (`composite-router.ts:282`) had nothing to retrieve and the opt-in `enableKnnRouting` feature literally couldn't work.

  **Fix:**
  - New `mobimem-persistence.ts` — tiny synchronous SQLite mirror keyed by domain (`mobimem_profile` / `mobimem_experience` / `mobimem_action`). When MobiMem is constructed with a real `dbPath`, every write to the in-memory Map is mirrored to SQLite; on construction the Map is hydrated from SQLite first.
  - `mobimem.ts:MobiMem` ctor actually opens `dbPath` (when not `:memory:`) and threads the handle through the three impls.
  - New `getSharedMobiMem()` singleton — process-wide instance backed by `~/.nexus-agents/memory/mobimem.db`. `RoutingMemory` ctor now defaults to it (was `new MobiMem()`). `tool-memory.ts` routes through it via `setSharedMobiMemDbPathResolver`.
  - `agent-executor.ts:persistMobiMemState` deleted — SQLite mirror handles persistence inline.
  - `MobiMem.save()` JSON path deleted — it only persisted stats, not data.

  The architectural goal (`MobiMem` flowing through `nexus-memory`'s `IMemoryBackend`) is deferred to a future Phase 4.1. The async contract on `IMemoryBackend` would require an async ripple across `KnnRoutingStage` / `StrategyDistiller` / `routing-context-store-impl`; this synchronous side-channel closes [#2719](https://github.com/williamzujkowski/nexus-agents/issues/2719) with minimum blast radius and lets the routing pipeline see real cross-session learning today.

  **Tests:**
  - 6 new persistence regression tests in `mobimem-persistence.test.ts`. Pin the core invariant: writes through one MobiMem instance are visible to a fresh instance opened against the same `dbPath`. Date fields survive the JSON round-trip via `hydrateDates`.
  - 1094 existing tests pass (40 test files in the broader `context/` + `pipeline/` sweep).

- [#2799](https://github.com/williamzujkowski/nexus-agents/pull/2799) [`acb72b7`](https://github.com/williamzujkowski/nexus-agents/commit/acb72b76549482bdcd1c75ad2dbfdfb1325b5989) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **Closes [#2793](https://github.com/williamzujkowski/nexus-agents/issues/2793). Phase 1 of [#2792](https://github.com/williamzujkowski/nexus-agents/issues/2792) (cross-cutting memory access).**

  `StatsOnlyAdapter.query()` now delegates to the underlying backend's native search instead of returning `[]`. This unblocks the registry-level fan-out that the rest of [#2792](https://github.com/williamzujkowski/nexus-agents/issues/2792) builds on.
  - `CountableBackend` grows an optional `search(query, limit): Promise<readonly unknown[]>` callback.
  - `StatsOnlyAdapter.query()` reads the free-text term from the conventional `filter.where.text`, dispatches to `backend.search()`, falls back to `[]` on missing callback / missing text / search failure (the consumer relies on `query()` never throwing).
  - `tool-memory.ts` attaches each backend's idiomatic search call to its registry entry:
    - `belief` → `recallBySubject(text, limit)`
    - `agentic` → `searchAgentic(text, limit)` (A-MEM attribute-rich entries)
    - `adaptive` → `retrieveByPriority({ query, limit })` (priority-scored)
    - `typed` → underlying `HybridMemoryBackend.search(query, limit)`
    - `mobimem` → `experience.findPatterns(query, limit)`

  `OutcomeStoreAdapter.query()` is unchanged — it already supports structured `where` (cli, category, success, baselineId) which is the appropriate API for that domain.

  Verified end-to-end: `scripts/e2e-memory-validation.ts` exercises the new fan-out and confirms `registry.get('belief').query({ where: { text: '...' } })` returns matching beliefs from a real `HindsightBeliefMemory`.

  Next: [#2794](https://github.com/williamzujkowski/nexus-agents/issues/2794) (`ContextRetriever.getContextForTask()`) builds on this.

- [#2800](https://github.com/williamzujkowski/nexus-agents/pull/2800) [`cf9fcd0`](https://github.com/williamzujkowski/nexus-agents/commit/cf9fcd063fe4736064c545f26aabf44e14fb910f) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **Closes [#2794](https://github.com/williamzujkowski/nexus-agents/issues/2794). Phase 2 of [#2792](https://github.com/williamzujkowski/nexus-agents/issues/2792) (cross-cutting memory access).**

  Adds `getContextForTask({ task, category, limit? })` — the single function every entry point will call to learn what we already know about a task. Fans out across the shared backends in parallel, tolerates individual backend failures (never throws), and returns a typed `UnifiedContext`.

  ```ts
  import { getContextForTask } from 'nexus-agents';

  const ctx = await getContextForTask({ task, category: 'code_generation' });
  // ctx.beliefs            — Belief[] from HindsightBeliefMemory.recallBySubject
  // ctx.similarMemories    — AgenticMemoryEntry[] from A-MEM searchAgentic
  // ctx.recentLearnings    — ScoredMemoryEntry[] from adaptive retrieveByPriority
  // ctx.experiencePatterns — ExperienceEntry[] from MobiMem findPatterns
  // ctx.outcomes           — PerformanceSummary | null (category-scoped)
  // ctx.priorStrategies    — DistilledRule[] (empty until [#2797](https://github.com/williamzujkowski/nexus-agents/issues/2797) lands)
  ```

  **Design choice:** typed singletons over registry fan-out. Phase 1 ([#2793](https://github.com/williamzujkowski/nexus-agents/issues/2793)) made `IMemoryBackend.query()` real, so registry-level `Promise.all(...domains.map(d => d.query(...)))` works — but the result type is `unknown[]` per domain, which loses the typed shapes consumers want. Reaching into `getToolMemory()` and `getOutcomeStore()` directly is cleaner for typed reads. The registry-level fan-out remains the right path for opaque/observability consumers like `memory_stats`.

  New public accessors on `ToolMemoryManager`: `getBeliefMemory()`, `getAgenticMemoryBackend()`, `getAdaptiveMemoryBackend()` — so cross-cutting consumers can perform typed reads without reconstructing backends or routing through MCP tools.

  Phase 3 ([#2795](https://github.com/williamzujkowski/nexus-agents/issues/2795)) wires `getContextForTask` into `CompositeRouter.route`, `orchestrate`, and graph workflow start — that's where the consumer-side benefit shows up.

- [#2802](https://github.com/williamzujkowski/nexus-agents/pull/2802) [`52a7202`](https://github.com/williamzujkowski/nexus-agents/commit/52a7202009d3f5e7f2df5a69c1bfdb72671e39de) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **Closes [#2795](https://github.com/williamzujkowski/nexus-agents/issues/2795). Phase 3 of [#2792](https://github.com/williamzujkowski/nexus-agents/issues/2792) (cross-cutting memory access).**

  Wires `getContextForTask` into three high-leverage entry points so every task starts informed by accumulated memory:
  - **`CompositeRouter.route`** — consults the unified context before routing; stashes the result on `lastUnifiedContext` for observability. Fire-and-forget for now; later phases plumb the signal into routing stages.
  - **`orchestrate` MCP tool** — fetches context at the top of `runOrchestratePipeline`, logs the shape. When `NEXUS_CONTEXT_RETRIEVER_INJECT=1`, stashes `priorMemorySummary` on `input.context` for downstream stages.
  - **`executeGraph`** — fetches context at graph start, stashes the typed `UnifiedContext` under `state[GRAPH_UNIFIED_CONTEXT_KEY]` so node implementations can consume it without a second fetch.

  All three call sites are best-effort: failure to read memory never blocks the work.

  Two new helpers:
  - `inferTaskCategory(task)` — keyword-based fallback mapper from free-text to `TaskCategory`. Used by the entry-point wiring when the caller doesn't carry a structured category. Returns `'exploration'` when nothing matches.
  - `summarizeContextForPrompt(ctx)` — compact human-readable rendering for prepending to system prompts. Skips empty sections so the prefix never wastes tokens on "no signal."

  Both exported from `nexus-agents` via `context/index.ts`.

  14 new tests cover the helpers; the wiring is exercised by the existing 569 entry-point tests passing without regression. Phase 5 ([#2797](https://github.com/williamzujkowski/nexus-agents/issues/2797)) populates `priorStrategies`; Phase 6 ([#2798](https://github.com/williamzujkowski/nexus-agents/issues/2798)) feeds more signal into the substrate.

- [#2803](https://github.com/williamzujkowski/nexus-agents/pull/2803) [`2a7f664`](https://github.com/williamzujkowski/nexus-agents/commit/2a7f664f8029bd8a2111cd3fba61accdf1ae111c) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **Closes [#2797](https://github.com/williamzujkowski/nexus-agents/issues/2797). Phase 5 of [#2792](https://github.com/williamzujkowski/nexus-agents/issues/2792) (cross-cutting memory access).**

  Populates `UnifiedContext.priorStrategies` by reading the persisted distilled-rules snapshot. The learning loop now closes end-to-end: outcomes → `StrategyDistiller` → `rules.json` → `ContextRetriever.priorStrategies` → every entry point that consults the unified context.

  ### What was already done

  Phase 5 turned out to be much smaller than estimated. The infrastructure was already in place from earlier work:
  - ✅ `PersistentStrategyDistiller` writes rules to `~/.nexus-agents/learning/rules.json` (atomic write + Zod-validated hydration)
  - ✅ `DistilledRuleStage` consumes rules in `CompositeRouter` at priority 45 (penalize -5 / boost +5 / avoid -10 score adjustments)
  - ✅ `StrategyDistiller.getRules('active')` reader exists

  What was missing: nothing read the rules outside of the live `CompositeRouter` instance, so `UnifiedContext.priorStrategies` was hardcoded `[]`.

  ### What this PR adds
  - **`loadPersistedRules(filePath?): readonly DistilledRule[]`** — process-wide reader for `~/.nexus-agents/learning/rules.json`. No singleton required; consumers in any scope can see the same rules the router applies. Tolerates missing file / corrupt JSON / schema mismatch (returns `[]`, never throws).
  - **`ContextRetriever.getContextForTask` populates `priorStrategies`** by loading persisted rules and filtering to (a) `status === 'active'`, (b) `tainted === false` (security gate), (c) category matches the task's category or a global rule.
  - 5 new tests on `loadPersistedRules` + 5 new tests on `priorStrategies` in `ContextRetriever`.

  ### Deferred to follow-ups

  The Phase 5 issue also called for surfacing distilled rules in `weather_report` (observability). That's nice-to-have and not strictly necessary for closing the learning loop — filed implicitly via the issue's open checkboxes if needed.

  Phase 6 ([#2798](https://github.com/williamzujkowski/nexus-agents/issues/2798)) audits per-instance backends for promotion paths into the shared substrate.

- [#2804](https://github.com/williamzujkowski/nexus-agents/pull/2804) [`5ba5874`](https://github.com/williamzujkowski/nexus-agents/commit/5ba5874f4506b08e831e2ce1bd4fec179b2ff1ba) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **Closes [#2798](https://github.com/williamzujkowski/nexus-agents/issues/2798). Phase 6 of [#2792](https://github.com/williamzujkowski/nexus-agents/issues/2792) (cross-cutting memory access).**

  Per-instance memory backends stay per-instance; the **signal they produce** now reaches the shared substrate via promotion bridges.

  ### What ships
  - **`SkillLibrary` → shared beliefs (wired)**. New optional `SkillLibraryConfig.skillPromoter` callback. When a skill crosses `minSuccessesForPromotion` (default 5 successful executions), the bridge fires once with `{skillId, name, category, successRate, executionCount}`. The production global library in `cli-server-skills.ts` wires this to `getToolMemory().recordBelief('skill:{name}', 'is_reliable_for', '{category}', 'high'|'medium')` so every later `getContextForTask` call sees the learning regardless of which agent ran the skill.
  - **`SicaVersionManager` and `MemoryState` → documented templates**. AGENTS.md grows a new sub-section (`Per-instance → shared-substrate promotion`) with a table describing the signal/target/wiring shape for each backend. SICA and MemoryState bridges are not wired today — the template shows how to add them when a concrete need materializes (mirror the SkillLibrary pattern: optional config field + dynamic-import promoter in the per-singleton wiring point + dedicated test).

  ### Design choices
  - **Fire once, not on every event.** Promotion is gated by a "just-crossed-threshold" check using the previous + updated metrics. Re-firing on every subsequent success would flood the belief store.
  - **Defensive isolation.** Throws and promise rejections from the promoter are caught inside `SkillLibrary.maybePromote` so a broken bridge never breaks local skill bookkeeping.
  - **Dynamic import in production wiring.** `cli-server-skills.ts` reaches `getToolMemory` via `await import(...)` to avoid a hard module-load circular dep with `mcp/tools/`.

  6 new tests cover: threshold crossing, no-re-fire, no-fire-on-failure, throw isolation, async-rejection isolation, event payload shape.

  This closes the autonomous loop for the full [#2792](https://github.com/williamzujkowski/nexus-agents/issues/2792) epic: outcomes → distilled rules → skill-promoted beliefs → `ContextRetriever` → every entry point.

### Patch Changes

- [#2756](https://github.com/williamzujkowski/nexus-agents/pull/2756) [`d978725`](https://github.com/williamzujkowski/nexus-agents/commit/d978725c6c3da31eb43926c3ae93e9e38b21366e) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Pipeline integration tests now pin the `run_pipeline` tool description against `listTemplateIds()` ([#2728](https://github.com/williamzujkowski/nexus-agents/issues/2728)).

  [#2728](https://github.com/williamzujkowski/nexus-agents/issues/2728) caught the case where `PIPELINE_TEMPLATES` registered 5 templates but three static description strings (`pipeline-tool.ts:46` JSDoc, `pipeline-tool.ts:163` MCP tool description, `scripts/tool-descriptions-data.ts:84` CLAUDE.md render) named only the pre-`general` 4: an LLM caller reading the MCP description would never pass `template: 'general'` because the surface said it didn't exist. The three strings were already fixed in earlier commits; this adds the missing acceptance criterion from [#2728](https://github.com/williamzujkowski/nexus-agents/issues/2728) — a test that fails the next time someone adds a template without updating the description.

  Verified the gate fails pre-fix with the expected message `template id(s) missing from description: general`.

- [#2755](https://github.com/williamzujkowski/nexus-agents/pull/2755) [`7c4527c`](https://github.com/williamzujkowski/nexus-agents/commit/7c4527ca156750bc491f8c395cd0646f4e601553) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - `repo_security_plan` now emits a GitHub Actions CI snippet for every scanner it can recommend, and caps `critical` priority at one scanner per category ([#2732](https://github.com/williamzujkowski/nexus-agents/issues/2732)).

  **CI snippet coverage.** Pre-fix, the `CI_SNIPPETS` map covered only 11 of the 27 fallback scanners. A TypeScript repo asking for a plan therefore got `ciSnippet: null` for `npm-audit`, `eslint-security`, `sonarqube`, and `trivy` — the recommendations all rendered with a copy-paste-ready snippet missing. Python, Ruby, Go, Java, PHP, Rust, Kotlin, HCL, and shell repos hit the same gap on their language-specific scanners. Added entries for 19 missing scanners (`eslint-security`, `sonarqube`, `npm-audit`, `trivy`, `trufflehog`, `cppcheck`, `spotbugs`, `pip-audit`, `cargo-audit`, `bundler-audit`, `composer-audit`, `govulncheck`, `detekt`, `brakeman`, `phpstan`, `tfsec`, `owasp-dependency-check`, `owasp-zap`, `syft`).

  **Priority noise.** Pre-fix every SCA and secrets entry was marked `critical`, so a TypeScript plan came back with three `critical` scanners (`npm-audit` + `osv-scanner` + `gitleaks`) — the priority signal was meaningless. SAST already used "first scanner → critical, rest → recommended"; now SCA and secrets follow the same rule.

  **Drift gates.** Two regression tests bind the registry: (1) iterates `FALLBACK_SCANNER_DATA.scanners` and fails when any recommendation comes back with `ciSnippet: null` on github-actions, (2) asserts no category has more than one `critical` recommendation across TypeScript/Python/Go/Ruby/Java plans. Both gates verified to fail on pre-fix code.

- [#2762](https://github.com/williamzujkowski/nexus-agents/pull/2762) [`f76b845`](https://github.com/williamzujkowski/nexus-agents/commit/f76b8454614e281539f4b6d28dd2f59748924707) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - `system-review` now aborts early with a clear "must run from source repo" error when invoked from a directory that doesn't contain `CLAUDE.md` ([#2760](https://github.com/williamzujkowski/nexus-agents/issues/2760), [#2720](https://github.com/williamzujkowski/nexus-agents/issues/2720) brainstorm item [#5](https://github.com/williamzujkowski/nexus-agents/issues/5)).

  Pre-fix `system-review` from `/tmp` ran all five phases anyway. Every tracked doc came back `unknown` → mapped to `stale` by `mapFreshnessStatus` → 7× `DOC_STALE_PENALTY` deducted, plus typecheck/lint fail penalties. The user saw `Health Score: 35/100` (looks "warning-ish") and the docs all marked stale "(0 days)" — surface said "your repo is unhealthy," state said "I'm running in the wrong directory." Same shape as the closed [#2716](https://github.com/williamzujkowski/nexus-agents/issues/2716) and [#2759](https://github.com/williamzujkowski/nexus-agents/issues/2759).

  The fix mirrors [#2759](https://github.com/williamzujkowski/nexus-agents/issues/2759): a `detectWrongProjectRoot` precondition checked in `systemReviewCommand` before any phase runs. CLAUDE.md is the canonical marker because it's in the repo root but NOT in the npm tarball — so it cleanly distinguishes "source repo" from "anywhere else."

  The dispatcher's exit-code plumbing ([#2761](https://github.com/williamzujkowski/nexus-agents/issues/2761)) propagates `systemReviewCommand`'s return value via `handleSystemReviewCommand` → confirmed `exit: 1` from `/tmp` with this fix; no separate plumbing change needed for this command.

  One regression test pins the wrong-CWD message + early-abort behavior. Verified to fail on pre-fix logic.

- [#2763](https://github.com/williamzujkowski/nexus-agents/pull/2763) [`a67b4a9`](https://github.com/williamzujkowski/nexus-agents/commit/a67b4a9593a78b284363866b9f29c7d3f3f0f9c5) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - `nexus-agents research <subcommand>` now propagates exit codes from its subcommand handlers ([#2761](https://github.com/williamzujkowski/nexus-agents/issues/2761)). Pre-fix `handleResearchCommand` always called `process.exit(EXIT_CODES.SUCCESS)` regardless of what the subcommand returned, so:
  - `research index check` printing "Research index is out of date" exited 0 — silently passing in CI hooks that depended on the exit code.
  - `research add` with a missing `arxivId` printed "Error: arxiv-id is required" and exited 0.
  - `research unknown-subcommand` printed "Unknown subcommand: ..." and exited 0.

  The contract is now: subcommand handlers return `ResearchCommandResult { text, exitCode }`; the dispatcher exits with `exitCode` (translated to `EXIT_CODES.SUCCESS` for 0, `EXIT_CODES.SERVER_START_FAILED` for non-zero). Existing string-returning handlers were wrapped via an `ok()` helper that defaults `exitCode` to 0 — no behavior change for the success paths.

  Verified by smoke test: `cd /tmp && nexus-agents research index check; echo $?` now prints `1` (was `0`).

  Caveat: the broader bug class — every dispatcher in `cli-commands-handlers.ts` that calls a command and `process.exit(SUCCESS)` unconditionally — likely affects other commands too (e.g., `run_pipeline`, `validate`, `improvement-review`). Those are tracked under the parent [#2761](https://github.com/williamzujkowski/nexus-agents/issues/2761); this PR fixes `research` first because it had a confirmed user-visible regression.

- [#2783](https://github.com/williamzujkowski/nexus-agents/pull/2783) [`79f10a4`](https://github.com/williamzujkowski/nexus-agents/commit/79f10a43057d008de34a44bc8ad3f5ad2e5a7a19) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **Phase 6 of [#2766](https://github.com/williamzujkowski/nexus-agents/issues/2766)** — OutcomeStore discoverable via the unified MemoryRegistry. Closes [#2771](https://github.com/williamzujkowski/nexus-agents/issues/2771) (minimum-viable scope; full JSONL→SQLite migration filed as Phase 6.1 follow-up).

  `getOutcomeStore()` now attaches the singleton to the unified registry on first call. `getMemoryRegistry().get('outcomes')` returns an `IMemoryBackend` view backed by the existing OutcomeStore — `stats()` reports the live row count and timestamp bounds; `query({ where, limit })` translates to `OutcomeStore.query`. Writes still go through `store.append()` directly (the adapter rejects with an explanatory error).

  The 10+ writer call sites are unchanged — this PR ships the architectural piece (registry discoverability + telemetry-ready) without the JSONL→SQLite blast radius. Phase 6.1 (separate follow-up) does the deeper migration.

  9 new tests in `outcome-store-adapter.test.ts` cover the cli filter, limit, timestamp bounds, and the no-op CRUD semantics.

- [#2782](https://github.com/williamzujkowski/nexus-agents/pull/2782) [`06d5bba`](https://github.com/williamzujkowski/nexus-agents/commit/06d5bba809f02f6d347eba7aa4999e0f6a31ef61) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **Phase 5 of [#2766](https://github.com/williamzujkowski/nexus-agents/issues/2766)** — tool-memory backends now discoverable through the unified `MemoryRegistry`. Closes [#2772](https://github.com/williamzujkowski/nexus-agents/issues/2772) (minimum-viable scope; full storage-migration is filed as Phase 5.1 follow-up).

  Each tool-memory backend (agentic, adaptive, typed, belief, mobimem) is attached to the shared registry via a thin `StatsOnlyAdapter` after its initialization. Callers can now reach every domain via `getMemoryRegistry().get(domain)` for discovery + telemetry, while the underlying CRUD still flows through the existing typed surfaces (`HybridMemoryBackend`, `AgenticMemoryBackend`, etc.).

  Adds:
  - `MemoryRegistry.attach(domain, backend)` in `nexus-memory` — new entry point for externally-managed backends that own their own storage.
  - `StatsOnlyAdapter` in `mcp/tools/tool-memory-registry-adapters.ts` — wraps any `{ count(): unknown }` into a contract-compliant `IMemoryBackend`. Tolerates plain `number`, `Promise<number>`, and `Result<number, _>` return shapes.
  - Wiring in `tool-memory.ts.initAgenticMemory / initAdaptiveMemory / initTypedMemory / initMobiMem` and the BeliefMemory constructor.
  - 10 regression tests for `StatsOnlyAdapter` (count shapes, no-op CRUD, close delegation).

  Deferred: fully folding each backend's storage into `nexus-memory`'s `SqliteBackend`. That's a substantial refactor (changes the persistence layout under `~/.nexus-agents/memory/`) and warrants its own scoped PR. The registry attachment ships the architectural piece (every backend is contract-compliant and discoverable) without the rewrite blast radius.

- [#2786](https://github.com/williamzujkowski/nexus-agents/pull/2786) [`ce5eae0`](https://github.com/williamzujkowski/nexus-agents/commit/ce5eae05e9c5c93ba31f33a02cafa8ff4e7bac56) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **Phase 7 of [#2766](https://github.com/williamzujkowski/nexus-agents/issues/2766)** — document remaining backends as intentionally per-instance. Closes [#2773](https://github.com/williamzujkowski/nexus-agents/issues/2773) (minimum-viable scope).

  `SICA SicaVersionManager`, `SkillLibrary`, `StrategyDistiller`, `MemoryState` (agent execution patterns), and `SharedMemoryStore` (pipeline scratch) don't have process-wide singletons. They're constructed on-demand per agent/run/instance. Forcing them into a global `MemoryRegistry` would require either (a) tracking N concurrent instances under generated keys or (b) rewriting their lifecycles to be singleton-owned — both of which exceed the architectural value at this stage.

  AGENTS.md `Canonical paths` section now:
  - Lists `MemoryRegistry` alongside the other canonical registries.
  - Adds a `Memory contract scope` subsection explicitly documenting the per-instance backends as **out of registry scope by design**, with rationale and the Phase 7.1+ follow-up condition ("once a clear cross-process consumer needs them").

  This closes the architectural piece of [#2773](https://github.com/williamzujkowski/nexus-agents/issues/2773). Phase 7.1 (deferred) would fold these in once there's demonstrated cross-process demand.

- [#2785](https://github.com/williamzujkowski/nexus-agents/pull/2785) [`b8b3525`](https://github.com/williamzujkowski/nexus-agents/commit/b8b35257c90ea19025e7dc56a8ebded7b8f23725) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **Phase 8 of [#2766](https://github.com/williamzujkowski/nexus-agents/issues/2766)** — drift gate enforcing the unified memory contract. Closes [#2774](https://github.com/williamzujkowski/nexus-agents/issues/2774).

  New script `scripts/check-memory-contract.ts` scans `packages/nexus-agents/src/**/*.ts` for direct memory access bypassing the contract:

  | Probe                      | Pattern            | Why it's flagged                                                                                             |
  | -------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------ |
  | `better-sqlite3-direct`    | `new Database(`    | Should route through `MemoryRegistry`                                                                        |
  | `mobimem-direct-construct` | `new MobiMem(`     | Should call `getSharedMobiMem()` ([#2719](https://github.com/williamzujkowski/nexus-agents/issues/2719) fix) |
  | `outcomes-jsonl-path`      | `'outcomes.jsonl'` | Should call `getOutcomeStore()`                                                                              |

  The gate is baseline-aware (mirrors `check-tool-distinctness.ts`): existing call sites are recorded in `docs/ops/memory-contract-baseline.json`; new offenders fail CI. The baseline starts with 10 existing entries (all known-justified or pre-migration). Future PRs introducing new direct access must either go through the contract OR regenerate the baseline with a documented justification.

  Wired into `pnpm governance:check` via a new `checkMemoryContract()` call in `inject-governance.ts`, so it runs on every CI pass alongside the other governance gates.

  9 regression tests in `scripts/check-memory-contract.test.ts` cover positive + negative classifier cases, baseline filtering, and the JSON read path.

- [#2784](https://github.com/williamzujkowski/nexus-agents/pull/2784) [`adf7be0`](https://github.com/williamzujkowski/nexus-agents/commit/adf7be0e89ae50b15a99e08bd56ce1185c42dfd3) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **Phase 9 of [#2766](https://github.com/williamzujkowski/nexus-agents/issues/2766)** — one-shot cleanup for belief-backend rows polluted by the [#2719](https://github.com/williamzujkowski/nexus-agents/issues/2719)-era arXiv feed-fallback bug. Closes [#2775](https://github.com/williamzujkowski/nexus-agents/issues/2775).

  Pre-[#2755](https://github.com/williamzujkowski/nexus-agents/issues/2755) the `extractEntryXml` helper fell back to the feed-level `<title>` when an arXiv query returned no entries. The feed title for a no-results query is literally `arXiv Query: search_query=...`, which then got persisted as a "belief" with the bogus title as the subject. [#2755](https://github.com/williamzujkowski/nexus-agents/issues/2755) fixed the writer; this PR ships the reader-side cleanup.

  New module `context/belief-cleanup.ts`:
  - `classifyBelief(belief) → { polluted, matchedPattern? }`: pattern-match on `subject` / `predicate` / `object`.
  - `runBeliefCleanup({ loadBeliefs, deleteBelief, markerDir, force })`: storage-aware driver. Marker file `.belief-cleanup-done` makes re-runs no-op.
  - `readBeliefCleanupMarker()`: status display helper.

  Storage callbacks are dependency-injected so production wires them to `HindsightBeliefMemory` and tests can inject in-memory stores.

  13 regression tests cover classifier positive + negative cases (real `arXiv:NNNN.NNNNN` references kept intact), idempotency marker, force re-run, async callbacks, and the samples cap.

- [#2777](https://github.com/williamzujkowski/nexus-agents/pull/2777) [`cbe1a73`](https://github.com/williamzujkowski/nexus-agents/commit/cbe1a73421990f37caa7f16b70d3de4602e956a6) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Correct the arXiv citation for `KnnRoutingStage` ([#2776](https://github.com/williamzujkowski/nexus-agents/issues/2776)). 7 sites cited arXiv:2507.05370, which is a general-relativity paper on Schwarzschild-de Sitter spacetimes — not KNN routing. The intended source is arXiv:2505.12601 — "Rethinking Predictive Modeling for LLM Routing: When Simple kNN Beats Complex Learned Routers" (May 2025) — which matches `KnnRoutingStage`'s actual implementation (cosine similarity over keyword vectors, K-nearest experience patterns, weighted by success rate).

  Discovered during Phase 1 of the memory unification epic ([#2766](https://github.com/williamzujkowski/nexus-agents/issues/2766), [#2767](https://github.com/williamzujkowski/nexus-agents/issues/2767)) when the survey agent fetched arXiv:2507.05370 to verify prior-art citations. Companion PR registers the correct paper in the research registry.

  Pure documentation/citation fix; no behavior change.

- [#2801](https://github.com/williamzujkowski/nexus-agents/pull/2801) [`58ae024`](https://github.com/williamzujkowski/nexus-agents/commit/58ae0249fffcdc1181285f53d75db3dfdc143527) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **Closes [#2796](https://github.com/williamzujkowski/nexus-agents/issues/2796). Phase 4 of [#2792](https://github.com/williamzujkowski/nexus-agents/issues/2792) (cross-cutting memory access).**

  Remove the dead `retrieveAdaptiveMemory` bridge from `pipeline/stage-wrappers.ts`. It was constructing a fresh `AdaptiveMemoryBackend` instance (not the shared one) and looking up `task.slice(0, 50)` as a literal key — writers use UUIDs, so the lookup never matched. Net effect: a false bottom that hid the cross-cutting gap.

  Cross-cutting memory enrichment for the Research stage will return via `getContextForTask` (Phase 2 [#2794](https://github.com/williamzujkowski/nexus-agents/issues/2794)) once Phase 3 ([#2795](https://github.com/williamzujkowski/nexus-agents/issues/2795)) wires it into the pipeline entry points.

- [#2765](https://github.com/williamzujkowski/nexus-agents/pull/2765) [`a7566e5`](https://github.com/williamzujkowski/nexus-agents/commit/a7566e5c8b1ac53fb532f93d9e0eafc269781a1c) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Fix CodeQL alert [#217](https://github.com/williamzujkowski/nexus-agents/issues/217) (`js/double-escaping`) in `research-helpers-arxiv.ts`.

  The pre-fix `decodeXmlEntities` chained `.replace(/&amp;/g, '&')` followed by `.replace(/&lt;/g, '<')`. Order-sensitive: input `&amp;lt;` (the XML encoding of literal `&lt;`) became `<` instead of `&lt;`. Replaced with a single-pass regex + entity map so each entity is decoded atomically.

  Two regression tests pin both behaviors: `Paper &amp;lt;tag&amp;gt; Title` now decodes to `Paper &lt;tag&gt; Title` (one pass), and standard single-encoded input (`&amp; Co.`, `&quot;quoted&quot;`) still decodes correctly. Verified to fail on pre-fix logic.

- [#2759](https://github.com/williamzujkowski/nexus-agents/pull/2759) [`3150929`](https://github.com/williamzujkowski/nexus-agents/commit/31509290b888328e516739232ac0b7782606e7d8) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - `index freshness` no longer reports `success: true` / "0 documents are fresh" when invoked from outside the nexus-agents source repo ([#2720](https://github.com/williamzujkowski/nexus-agents/issues/2720) brainstorm item [#5](https://github.com/williamzujkowski/nexus-agents/issues/5)).

  Pre-fix `hasIssues = stale > 0 || warning > 0` ignored `summary.unknown`. When run from any directory that doesn't contain the tracked docs (README.md, ARCHITECTURE.md, CLAUDE.md, etc.) — typically because `projectRoot` defaulted to `process.cwd()` — all 7 tracked documents came back `unknown`, `hasIssues` stayed `false`, and the command exited successfully with the misleading message. Same surface-vs-state shape as [#2716](https://github.com/williamzujkowski/nexus-agents/issues/2716) (fitness-audit silently passing from outside the repo).

  The fix: include `summary.unknown` in `hasIssues`, and when _every_ tracked doc is unknown (`unknown === total`) emit a wrong-CWD hint instead of a generic stale/warning summary. Two regression tests pin both behaviors — verified to fail on pre-fix logic with the expected "expected '0 stale...' to contain 'No tracked documents found'" error.

  The dispatcher still translates `success: false` to exit 0 (separate `result.exitCode` plumbing issue, not in scope for this PR); the visible message change is the immediate correctness fix.

- [#2758](https://github.com/williamzujkowski/nexus-agents/pull/2758) [`c2b0066`](https://github.com/williamzujkowski/nexus-agents/commit/c2b00666a428bc91788e18eaeb309381bf9a8ead) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - `TechniqueStatus` in `cli/research-types.ts` is now sourced from the canonical Zod enum (`TechniqueStatusSchema` in `research-index-base-types.ts`) instead of a hand-maintained 5-value union ([#2720](https://github.com/williamzujkowski/nexus-agents/issues/2720) umbrella, same shape as the [#2717](https://github.com/williamzujkowski/nexus-agents/issues/2717) `PaperImplementationStatus` fix).

  Pre-fix both definitions named the same 5 values, so the surface and the schema agreed _right now_ — but nothing forced them to agree the next time someone added a value. The union was redundant code that the next contributor could trivially make wrong. The CLI now reads `import('...').TechniqueStatus`, the same single-source pattern `PaperImplementationStatus` uses.

- [#2779](https://github.com/williamzujkowski/nexus-agents/pull/2779) [`f4fc897`](https://github.com/williamzujkowski/nexus-agents/commit/f4fc897e2ea9743e7bb45ffbd864e9544985cdaa) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Wave 5 vestigial-code sweep: 6 stale references to `model-capabilities.ts` (renamed to `in-tree-data.ts` in [#2546](https://github.com/williamzujkowski/nexus-agents/issues/2546) slice E) updated to point at the current canonical surface.

  Waves 3 + 4 ([#2617](https://github.com/williamzujkowski/nexus-agents/issues/2617), [#2618](https://github.com/williamzujkowski/nexus-agents/issues/2618), [#2621](https://github.com/williamzujkowski/nexus-agents/issues/2621), [#2622](https://github.com/williamzujkowski/nexus-agents/issues/2622), [#2624](https://github.com/williamzujkowski/nexus-agents/issues/2624)) scoped their greps to `.md` + `.test.ts` files and to one round of source JSDoc audits. This sweep caught references that slipped through:
  - `core/trace-pricing.test.ts:5` — module header docstring
  - `learning/usage-log.ts:15, 38, 57` — 3 sites in JSDoc + interface docs
  - `cli-adapters/adapters/gemini-adapter-helpers.test.ts:25` — inline comment
  - `docs/design/ARCHITECTURE_MAP.json:72` — `canonical_paths.model_registry`

  Pure documentation drift; no behavior change. CHANGELOG and `docs/archive/design-v2/` references intentionally left alone (frozen historical context).

  Sweep methodology recorded in `cleanup_waves.md` (memory): cheap 15-min version — 5 parallel greps for sprawl filenames, `@deprecated`, dated TODOs, disabled workflows, recent renames. Found 0 hits on the first 4, real findings on the rename pattern (this fix).

## 2.77.13

### Patch Changes

- [#2753](https://github.com/williamzujkowski/nexus-agents/pull/2753) [`7aa810b`](https://github.com/williamzujkowski/nexus-agents/commit/7aa810be954385b97536c34a0734fb17e33bd3cc) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - `delegate_to_model` reasoning text now states when the preferred CLI didn't win ([#2722](https://github.com/williamzujkowski/nexus-agents/issues/2722) final sub-bug).

  Pre-fix the reasoning line read `architecture task (prefer gemini)` unconditionally, even when gemini got filtered out (by `needsMcp`, score loss, etc.) and an opencode/claude/codex model was actually selected. So an LLM caller reading the response saw text contradicting the recommendation.

  `buildReasons` now takes the chosen CLI; if `specialization.primaryCli !== chosenCli` the reasoning says `architecture task (preferred gemini, selected opencode after filtering)`. Same when the preference matches, just without the "selected after filtering" tail.

  This closes the third and final [#2722](https://github.com/williamzujkowski/nexus-agents/issues/2722) sub-bug. The first two (MCP_KEYWORDS narrowed in [#2737](https://github.com/williamzujkowski/nexus-agents/issues/2737), adapter availability via [#2735](https://github.com/williamzujkowski/nexus-agents/issues/2735)) were resolved earlier.

## 2.77.12

### Patch Changes

- [#2751](https://github.com/williamzujkowski/nexus-agents/pull/2751) [`8ee1433`](https://github.com/williamzujkowski/nexus-agents/commit/8ee14337453805e55c5f31bf3bad7a47c298f45d) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Fix doctor's fictional "Capacity: 100% remaining" + 4-warning-per-run spam ([#2714](https://github.com/williamzujkowski/nexus-agents/issues/2714)).

  `BaseCliAdapter.getCapacity()` warned and returned a hardcoded 100k-token fallback when `capacityTracker` was null. `doctor.ts:337` calls `adapter.getCapacity()` without first running `adapter.initialize()` (which is what assigns the tracker), so every `doctor` invocation logged 4 `Capacity tracker uninitialized` WARNs (one per CLI) AND surfaced a fictional `Capacity: 100% remaining` line in human-readable output — making the gauge look like real data when it was a constant.

  `getCapacity()` now lazy-inits the tracker on first read. The pre-existing test that pinned `remainingRequests: 100_000` was checking the fallback value, not anything real — updated to assert the canonical claude defaults from `capacity-tracker.ts` (`100_000` tokens, `50` requests per minute).

## 2.77.11

### Patch Changes

- [#2749](https://github.com/williamzujkowski/nexus-agents/pull/2749) [`3c9f880`](https://github.com/williamzujkowski/nexus-agents/commit/3c9f880bbd5b96b1d0c16cdccb9d2d719e5f37ed) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Fix the main belief-pollution path: `parseArxivXml` no longer falls back to feed-level XML when no `<entry>` is present ([#2719](https://github.com/williamzujkowski/nexus-agents/issues/2719)).

  `extractEntryXml` used to return the full feed XML when the arXiv API response contained no `<entry>` tags (paper not found / API miss). The feed's outer `<title>` is something like `arXiv Query: search_query=&id_list=X&start=0&max_results=10` — which then got persisted as the paper's "title" and recorded as a belief-memory learning. `memory_query` audit found 1671 belief rows, a substantial fraction shaped like:

  ```
  topic=routing, priority=P2 learned-pattern Added paper: arXiv Query: search_query=&amp;id_list=2602.03814&amp;...
  ```

  — including HTML-encoded ampersands because XML entities weren't decoded.

  `extractEntryXml` now returns `null` when no `<entry>` is found; `parseArxivXml` returns `null` instead of inventing data. `decodeXmlEntities` runs over the title + summary so persisted text is plain.

  The other [#2719](https://github.com/williamzujkowski/nexus-agents/issues/2719) sub-findings (typed/mobimem backends 0 entries despite "available"; decay 100 runs / 0 evictions) are separate; they need a "where are the writers, do they fire" audit and aren't blocked by this fix.

## 2.77.10

### Patch Changes

- [#2747](https://github.com/williamzujkowski/nexus-agents/pull/2747) [`b9ba587`](https://github.com/williamzujkowski/nexus-agents/commit/b9ba587534995bd749326710083238a2fbfdf32e) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - `repo_analyze` / `repo_security_plan`: detect gitleaks via `.gitleaks.toml` ([#2732](https://github.com/williamzujkowski/nexus-agents/issues/2732)).

  Pre-fix the `detectSecurityTooling` rule list didn't include gitleaks config files, so a repo with `.gitleaks.toml` at the top level reported `existingTooling: [security-policy, codeowners, semgrep, codeql]` — gitleaks invisible. Downstream `repo_security_plan` consequently showed `coverage[secrets] = { covered: true, scanners: [] }` (covered by existing-but-undetected tooling), which read as inconsistent.

  Now matches `.gitleaks.toml` (canonical), `gitleaks.toml` (legacy), and `.gitleaksignore`. `existingTooling` includes `gitleaks` when any are present; `coverage[secrets]` now has the matching tool in `scanners` or in `existing` consistently.

  The other [#2732](https://github.com/williamzujkowski/nexus-agents/issues/2732) sub-bugs (`ciSnippet: null` for most scanners, "3 critical SCA scanners" priority noise) are scanner-registry data work — they're tracked separately because they're 60+ lines of YAML edits, not a code fix.

## 2.77.9

### Patch Changes

- [#2745](https://github.com/williamzujkowski/nexus-agents/pull/2745) [`26afdef`](https://github.com/williamzujkowski/nexus-agents/commit/26afdefc72b15f224090f33f61ba32278c6b9a05) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Consolidate the three drifting `PaperStatusSchema` definitions to one canonical source + add `deferred` + surface Zod issues in validation errors ([#2717](https://github.com/williamzujkowski/nexus-agents/issues/2717)).

  Pre-fix the codebase had three disagreeing copies of the same enum: `indexer/research-index/research-index-base-types.ts` (6 values incl. in-progress), `research/research-schemas.ts` (5 values, no in-progress), and `cli/research-types.ts:31 PaperImplementationStatus` (4-value TS union with no partial / rejected). The data (`papers.yaml`) used a 7th value, `deferred`, that NONE of them accepted — `nexus-agents research stats` / `research check` / `research refresh` all failed with the opaque message `Validation failed for papers.yaml`, no further detail.
  - **Canonical source**: `PaperStatusSchema` in `research-index-base-types.ts` now includes `deferred` (legitimate distinct state — 2 papers have it with a documented `deferral_rationale` + explicit re-open trigger block).
  - **`research/research-schemas.ts`** imports + re-exports the canonical schema; no parallel z.enum.
  - **`cli/research-types.ts`** `PaperImplementationStatus` is now `z.infer<typeof PaperStatusSchema>`-equivalent (TS-only `PaperStatus` re-export).
  - **Validation error path** now includes the first 5 Zod issues in the user-facing message (`Validation failed for <path> — papers.X.implementation_status: Invalid option …; (+N more)`). Pre-fix the issues were stored in `error.details` but never made it to the user.

  `research-index-test.ts:539` integration suite (skip-on-invalid-registry) un-blocks once this lands — was silently skipping itself for ~26 days because the registry didn't parse.

## 2.77.8

### Patch Changes

- [#2743](https://github.com/williamzujkowski/nexus-agents/pull/2743) [`2657466`](https://github.com/williamzujkowski/nexus-agents/commit/26574665d430369e143a7fabe63d1b733930c332) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Fix two of three [#2726](https://github.com/williamzujkowski/nexus-agents/issues/2726) workflow CLI UX bugs: \`--format=json\` is now respected, and table descriptions get an ellipsis on overflow instead of truncating mid-word.
  - **A**: \`nexus-agents workflow list --format=json\` previously parsed the flag but the dispatcher never forwarded it to \`printWorkflowTemplates\`, and the renderer didn't branch on format anyway — so the table form rendered regardless. Both call sites now thread \`format\` through and the renderer emits \`JSON.stringify(templates, null, 2)\` when requested.
  - **B**: Table descriptions used \`desc.slice(0, 60)\` and clipped mid-word (\`"Documentation audit workflow that systematically verifies do"\`). Now truncates at 59 chars and adds a single ellipsis so the operator knows there's more — they can use \`--format=json\` to get full text.

  The third sub-bug I originally reported (\`workflow run\` only listing one missing input) turned out to be operator error on my part — the \`bug-fix\` template actually has only one required input. Updated the issue.

## 2.77.7

### Patch Changes

- [#2741](https://github.com/williamzujkowski/nexus-agents/pull/2741) [`0de397a`](https://github.com/williamzujkowski/nexus-agents/commit/0de397aaae9b5e9510a8a09b1272af84d8e4dfc9) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Round 5b — fix fitness-audit's published-package false-finding cascade ([#2716](https://github.com/williamzujkowski/nexus-agents/issues/2716)).

  The audit's `existsSync` checks look at `SRC_ROOT`-relative paths (`cli-adapters/composite-router.ts`, `cli/doctor.ts`, etc.). The actual cause of the "CompositeRouter missing / No CLAUDE.md / 0 createLogger / Missing Doctor" findings I originally diagnosed as "CWD-dependent": **`npx nexus-agents fitness-audit` resolves to the GLOBAL `npm install -g nexus-agents` binary**, not the local workspace bundle. The published 2.76.0 package ships `src/` containing **only** `workflows/` (workflow templates loaded at runtime) — none of the dirs fitness-audit checks for. So every existsSync returned false against the installed copy.

  `audit()` now checks for `${SRC_ROOT}/cli-adapters` at the start; if missing, returns a single info-level finding with score 0 telling the operator to run from the source repo (or use `pnpm fitness-audit` from the workspace root). Same audit run from a real source checkout is unchanged.

  This also stops `improvement_review` from emitting bogus tech-debt signals downstream of the fitness-audit pollution.

## 2.77.6

### Patch Changes

- [#2739](https://github.com/williamzujkowski/nexus-agents/pull/2739) [`010003a`](https://github.com/williamzujkowski/nexus-agents/commit/010003a344f2bd4860cbb6c70bacb152fe339693) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Drift cleanups — round 5 of the [#2720](https://github.com/williamzujkowski/nexus-agents/issues/2720) umbrella ([#2724](https://github.com/williamzujkowski/nexus-agents/issues/2724)).

  **Stop `delegate_to_model` from writing synthetic `success: true` outcomes to the OutcomeStore.** The tool returns a routing recommendation — it does NOT execute the task — but `recordToOutcomeStore` unconditionally appended `{success: true, source: 'delegate'}` per invocation. Those synthetic rows fed the routing-feedback loop (`weather_report.byCategory`, `recommendedMappings`, LinUCB, TOPSIS, fitness-audit) as if real evidence, biasing future routing toward whatever was last recommended.

  Audit of `~/.nexus-agents/learning/outcomes.jsonl` found ~3993 `source: 'delegate'` rows total; a large fraction of the `success: true` ones were from this synthetic path (the other 9 `source: 'delegate'` writers — orchestrate, agent-executor, parallel-exploration, triangulated-review, feedback-subscriber, adaptive-orchestrator, consensus-plan, run-graph-workflow, orchestrate-dispatch — record REAL execution outcomes and are unchanged).

  Fix: delete `recordToOutcomeStore`; `recordDelegation` now only writes to the tool-memory "learned pattern" trail (which is the recommendation log, not the routing-evidence stream). The `source: 'delegate'` field is now exclusively populated by real-execution writers.

## 2.77.5

### Patch Changes

- [#2737](https://github.com/williamzujkowski/nexus-agents/pull/2737) [`f368ddf`](https://github.com/williamzujkowski/nexus-agents/commit/f368ddf7b2080f1b8ad7dd0854885cdd1d5cbd14) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Drift cleanups — round 4 of the [#2720](https://github.com/williamzujkowski/nexus-agents/issues/2720) umbrella ([#2718](https://github.com/williamzujkowski/nexus-agents/issues/2718), [#2722](https://github.com/williamzujkowski/nexus-agents/issues/2722) partial).
  - **[#2718](https://github.com/williamzujkowski/nexus-agents/issues/2718) — `getWeatherContext` now reads `m.recommendedCli` (the real field).** The pre-fix code cast `recommendedMappings` to `Array<{cli: string}>` and read `m.cli`, which doesn't exist — so every agent invocation that called `getWeatherContext` had `category → undefined` lines injected into its plan/exec prompt context. The mock in `agent-executor.test.ts` had propagated the same wrong shape, hiding the bug from tests. Test fixture now drift-gates on a literal `'→ undefined'` substring.
  - **[#2722](https://github.com/williamzujkowski/nexus-agents/issues/2722) (partial) — Tighten `MCP_KEYWORDS`.** Removed `'interact'` and `'browse'` — both false-positive on plain English (`"how do these components interact?"` flipped `needsMcp` true and silently filtered out gemini; `'browse the documentation'` did the same). Replaced with the explicit phrases `'mcp tool'`, `'browse the web'`, `'browser automation'`. Test fixture pins the negative cases (`'interact'` in normal prose → `needsMcp: false`) and the positive cases (`'browser automation'` → `needsMcp: true`). [#2722](https://github.com/williamzujkowski/nexus-agents/issues/2722)'s other two sub-bugs (adapter-availability check + reasoning-text accuracy) tracked separately under the same issue — [#2725](https://github.com/williamzujkowski/nexus-agents/issues/2725) already addressed half of (b) downstream.

## 2.77.4

### Patch Changes

- [#2735](https://github.com/williamzujkowski/nexus-agents/pull/2735) [`a94f3e4`](https://github.com/williamzujkowski/nexus-agents/commit/a94f3e40f8d36d1b4e24eac76ff80d56463210b3) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Drift cleanups — round 3 of the [#2720](https://github.com/williamzujkowski/nexus-agents/issues/2720) umbrella ([#2725](https://github.com/williamzujkowski/nexus-agents/issues/2725), [#2727](https://github.com/williamzujkowski/nexus-agents/issues/2727)).
  - **[#2725](https://github.com/williamzujkowski/nexus-agents/issues/2725) — `isCliAvailable` now consults the auth probe alongside `healthCheck()`.** The [#2447](https://github.com/williamzujkowski/nexus-agents/issues/2447) fix added a real authentication probe and applied it to `doctor`, but the parallel consumer `isCliAvailable` (and the `getAvailableClis` rollup it powers) kept the binary-detection-only path — so `nexus-agents orchestrate --dry-run --verbose` listed `opencode` as "Available" when the user wasn't logged in. The factory now runs `adapter.healthCheck()` and `probeCli(cli)` in parallel; a CLI is reported available only when both pass. Cache entries record the auth-failure reason in the `message` field so a follow-up `doctor` doesn't have to re-probe.
  - **[#2727](https://github.com/williamzujkowski/nexus-agents/issues/2727) — Unimplemented CLI subcommands now exit non-zero and write to stderr.** The `expert create` / `expert execute` / unimplemented `workflow` subcommands previously printed `"The 'X' command is coming soon."` to **stdout** and exited with `EXIT_CODES.SUCCESS (0)` — automation scripts couldn't detect the no-op. Now: stderr, exit `EXIT_CODES.NOT_IMPLEMENTED (4)`, and when an MCP equivalent exists (`create_expert`, `execute_expert`), the message names it so the operator has an escape hatch today.

## 2.77.3

### Patch Changes

- [#2733](https://github.com/williamzujkowski/nexus-agents/pull/2733) [`e5c7819`](https://github.com/williamzujkowski/nexus-agents/commit/e5c78192be2e970024454d75535ae820751f22ee) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Drift cleanups — round 2 of the [#2720](https://github.com/williamzujkowski/nexus-agents/issues/2720) umbrella ([#2721](https://github.com/williamzujkowski/nexus-agents/issues/2721), [#2723](https://github.com/williamzujkowski/nexus-agents/issues/2723), [#2730](https://github.com/williamzujkowski/nexus-agents/issues/2730)).
  - **[#2723](https://github.com/williamzujkowski/nexus-agents/issues/2723) — `delegate_to_model` removes the dead `estimate_tokens` flag.** The field was declared in two schemas (`DelegateInputSchema`, `TOOL_SCHEMA`) plus echoed in `cli-server-stpa.ts` and `v2-delegate.ts`'s `DelegateInputLike` interface, but no consumer read it. Calling `delegate_to_model { estimate_tokens: true }` returned the same response as omitting the flag. Removed from all four sites + the test that pinned its propagation through the v2 pipeline. The `estimated_tokens` output field is unchanged.
  - **[#2730](https://github.com/williamzujkowski/nexus-agents/issues/2730) — `repo_analyze.hasDockerfile` matches `Dockerfile.<purpose>`.** The exact-match check missed `Dockerfile.npm-verify`, `Dockerfile.opencode`, `Dockerfile.sandbox` (this repo) and similar multi-target setups elsewhere. Now uses prefix match (`e === 'Dockerfile' || e.startsWith('Dockerfile.')`). Test fixture pins the new positive cases and a negative case (`Dockerfiler` doesn't match). `repo_security_plan`'s container-scanner recommendation will now appear for repos that genuinely have Dockerfiles.
  - **[#2721](https://github.com/williamzujkowski/nexus-agents/issues/2721) — `query_trace` emits clean per-category error messages.** The old `sanitizeErrorMessage` regex stripped paths starting with `/` but left relative segments exposed, producing artifacts like `errorMessage: "ENOENT: no such file or directory, stat 'runs<path>'"`. Replaced with `userFacingTraceError(err, runId)` that classifies and synthesizes a deterministic message per category — matching the pattern `query_task_state` already uses (`"No state log for task: …"`). No sanitization needed because we never include filesystem text.

## 2.77.2

### Patch Changes

- [#2729](https://github.com/williamzujkowski/nexus-agents/pull/2729) [`69d4750`](https://github.com/williamzujkowski/nexus-agents/commit/69d47502af08807a5c1d70f43def94db3ec59203) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Drift cleanups — round 1 of the [#2720](https://github.com/williamzujkowski/nexus-agents/issues/2720) umbrella ([#2715](https://github.com/williamzujkowski/nexus-agents/issues/2715), [#2728](https://github.com/williamzujkowski/nexus-agents/issues/2728), plus a 7th drift instance uncovered along the way).

  **[#2715](https://github.com/williamzujkowski/nexus-agents/issues/2715) — `createAllBuiltInExperts` now derives from `BUILT_IN_EXPERTS` keys.** The previous hardcoded 9-element list silently dropped `infrastructure-expert`, `qa-expert`, and `data-visualization-expert` from the runtime registry even though `expert list` advertised all 12. A drift test now pins `result.value.length === Object.keys(BUILT_IN_EXPERTS).length` so adding a future expert in `expert-config.ts` can't silently miss the factory.

  **[#2728](https://github.com/williamzujkowski/nexus-agents/issues/2728) — `run_pipeline` description now reads `listTemplateIds()` dynamically.** The MCP tool description had hardcoded the pre-`general` 4-template list; now it can't drift from `PIPELINE_TEMPLATES`.

  **Surfaced en route: a 6-way `AgentRoleSchema` drift cluster.** Fixing [#2715](https://github.com/williamzujkowski/nexus-agents/issues/2715) made `createAllBuiltInExperts` actually instantiate the previously-dropped 3 experts — at which point `BaseAgentOptionsSchema.role` (`agents/agent-schemas.ts:95`) rejected `qa_expert` and `data_visualization_expert` as invalid roles. The canonical `AgentRole` type in `core/types/agent.ts:18` includes them; this one Zod copy didn't. Patched here so the experts actually load; the full 6-copy consolidation is tracked in [#2720](https://github.com/williamzujkowski/nexus-agents/issues/2720).

  Other drifting `AgentRoleSchema` definitions (NOT touched in this PR — each one needs its own review):
  - `workflows/workflow-types.ts:52` — 8 values (missing 9 from canonical)
  - `workflows/template-types.ts:112` — 13 values
  - `skills/skill-security-schemas.ts:33` — 11 values
  - `agents/experts/expert-config.ts:95` — 14 values

  Same enum, six different copies, none in full agreement. The right fix is one `AgentRoleSchema = z.enum(AGENT_ROLES)` derived from the canonical `AgentRole` type — left for a follow-up because changing schemas in `workflows/` may affect serialized workflow templates.

## 2.77.1

### Patch Changes

- [#2713](https://github.com/williamzujkowski/nexus-agents/pull/2713) [`1992aef`](https://github.com/williamzujkowski/nexus-agents/commit/1992aefaa7872a611b60255a8e0538433a191778) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Rewrite the 8 MCP tool-description pairs flagged by the [#2650](https://github.com/williamzujkowski/nexus-agents/issues/2650) distinctness lint ([#2677](https://github.com/williamzujkowski/nexus-agents/issues/2677)).

  LLM callers reading `list_experts` vs `list_workflows`, `run_workflow` vs `run_graph_workflow`, `extract_symbols` vs `search_codebase`, `delegate_to_model` vs `registry_import`, `research_add` vs `research_add_source`, and `execute_expert` vs `list_experts` previously got near-identical "List/Execute/Add available X" sentences. Each description now leads with the distinguishing concept (`ROLES` vs `TEMPLATES`; `LINEAR` vs `DAG`; `SINGLE file AST` vs `cross-file ripgrep`; `pick existing` vs `draft new`; `PAPER-only` vs `NON-PAPER`; `PREVIOUSLY-created expert`) and explicitly cross-references the sibling tool so a caller can pick the right one.

  Two pairs dropped below the lint threshold entirely (`list_experts ↔ list_workflows`, `delegate_to_model ↔ registry_import`). The other five remain in the baseline at slightly higher similarity scores — the cross-references intentionally re-introduce the sibling tool's name into the text, raising the lexical-overlap metric while improving the actual goal (LLM decision-distinctness). One new pair, `research_add ↔ research_discover`, joined the baseline as a similar trade.

  Updated: long + README short descriptions in `scripts/tool-descriptions-data.ts`, live `server.registerTool` `description:` fields across 11 tool files, the distinctness baseline at `docs/ops/tool-distinctness-baseline.json`, and the v1 report at `docs/research/mcp-tool-distinctness-v1.md`.

  No `research_add → research_add_paper` rename — that's a breaking MCP-surface change tagged "Decision needed" in [#2677](https://github.com/williamzujkowski/nexus-agents/issues/2677) and would need a separate unanimous vote. Clarification suffices for the cross-adapter distinguishability gain.

## 2.77.0

### Minor Changes

- [#2708](https://github.com/williamzujkowski/nexus-agents/pull/2708) [`51d879a`](https://github.com/williamzujkowski/nexus-agents/commit/51d879a87347228f0cca4a4635efd2e4f900e349) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Record timeout-mismatch events to a queryable JSONL ([#2703](https://github.com/williamzujkowski/nexus-agents/issues/2703), Epic [#2631](https://github.com/williamzujkowski/nexus-agents/issues/2631) prerequisite).

  The `toSdkCallbackWithBudgetCheck` WARN added in [#2632](https://github.com/williamzujkowski/nexus-agents/issues/2632) was log-only — operators could grep for "budget exceeds client default" but couldn't answer "of N mismatched calls, what fraction ended in a timeout?" Each mismatch is now also appended to `$NEXUS_DATA_DIR/mcp-telemetry/timeout-mismatch-events.jsonl` as one JSON row carrying a correlation `eventId` (also surfaced in the WARN log entry's context) and the call's eventual outcome (`success` / `error` + `errorCategory` from the post-[#2649](https://github.com/williamzujkowski/nexus-agents/issues/2649) envelope when present). Joinable per the Contrarian's correlation point on the [#2631](https://github.com/williamzujkowski/nexus-agents/issues/2631) disposition vote — bare counts don't prove causation.

  Schema documented in `docs/architecture/MCP_PROTOCOL.md` (Correlation-keyed event log section). Best-effort recording: a telemetry-write failure logs at `debug` and never fails the user's tool call. The aggregation surface ("does mismatch dominate timeouts?") belongs in `improvement_review` / a fitness report and is intentionally out of scope here.

## 2.76.0

### Minor Changes

- [#2688](https://github.com/williamzujkowski/nexus-agents/pull/2688) [`fb22bf7`](https://github.com/williamzujkowski/nexus-agents/commit/fb22bf718663331111afc2b0f67d04b861baf430) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - OpenCode permission-system parity ([#2658](https://github.com/williamzujkowski/nexus-agents/issues/2658), Epic D).

  `nexus-agents init --opencode` now emits a conservative default `permission` block into `opencode.json` instead of leaving operators on OpenCode's defaults:
  - `bash` → `ask` (highest-risk surface)
  - `edit` → `ask` for everything, with `.env*` / `*.pem` / `*.key` / `id_rsa*` / `secrets/**` / `.git/**` **hard-denied**. OpenCode resolves glob maps last-match-wins, so the deny patterns are ordered after the broad `"*"` rule.
  - `skill` → `allow` (trusted, in-repo, CI-validated content)

  Never overwrites an operator's existing `permission` block (merge-not-overwrite, matching the file's existing pattern). Documented in `.rules/security.md`.

- [#2692](https://github.com/williamzujkowski/nexus-agents/pull/2692) [`b3b7238`](https://github.com/williamzujkowski/nexus-agents/commit/b3b723810b2c68c90ca6b0184b621b4d413f159d) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Stratified runtime-outcome report ([#2662](https://github.com/williamzujkowski/nexus-agents/issues/2662), Epic E).

  `fitness-audit` is static source-tree analysis — it never sees runtime data. This adds the **separate** runtime-outcome report (the [#2662](https://github.com/williamzujkowski/nexus-agents/issues/2662) design vote kept the concerns apart): `scripts/stratify-outcomes.ts` reads the OutcomeStore JSONL and breaks task outcomes down per stratum — `adapter` × `task-type` × `voter-role` — because an aggregate success rate hides where failures live (the v1 snapshot shows `architecture` tasks at 21.5% while the aggregate stays high).
  - `TaskOutcomeSchema` gains an optional `voterRole` field; `recordVoteOutcomes` now threads `vote.role` through, so the voter-role dimension populates as consensus votes accumulate.
  - The `self-dogfood` workflow — which actually exercises the agents and accumulates OutcomeStore data — uploads a `fitness-stratified.json` artifact. (Per the design vote, this is wired where runtime data exists, not onto the static `fitness-audit` CI job which would see an empty store.)
  - Novel/uncategorized failures (`generic`/`unknown` failure category) are surfaced separately for triage. v1 snapshot at `docs/research/fitness-stratified-v1.md`.

- [#2693](https://github.com/williamzujkowski/nexus-agents/pull/2693) [`2e6e8fd`](https://github.com/williamzujkowski/nexus-agents/commit/2e6e8fd3663834861d6330ac4218a4b566fdc732) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Source provenance through research synthesis ([#2663](https://github.com/williamzujkowski/nexus-agents/issues/2663), Epic E).

  `research_synthesize` previously dropped source attribution at the merge: `extractPapers` pulled `id`/`title`/`summary`/`keyFindings` but not `url`/`arxiv_id`/`publication_date`, and `keyInsights` was a flat string array — a voter couldn't trace any synthesized claim back to a paper.

  Research scoped this to the single leaking path — `research_catalog_review` is a review-queue manager (no merge) and `pr_review` aggregation already preserves per-finding attribution, so neither is touched.
  - `SynthesisPaper` carries `sourceUri` + `publicationDate`; `SynthesisPaperRef` carries them into `ClusterSynthesis.papers` (now `{id, title, sourceUri}` refs, not bare titles).
  - `keyInsights` is now `AttributedInsight[]` — `{insight, sourcePaperIds}`. When two papers assert the same finding, **both** ids survive, so a contradiction is _representable_ rather than silently collapsed into one source's claim.
  - Structural enforcement, not just a doc rule: `AttributedInsightSchema` (Zod `.min(1)` on `sourcePaperIds`) is parsed at construction — every merged claim is a validated-attributed claim.
  - New `.rules/research.md` documents the provenance invariants.

### Patch Changes

- [#2689](https://github.com/williamzujkowski/nexus-agents/pull/2689) [`1eb9a06`](https://github.com/williamzujkowski/nexus-agents/commit/1eb9a0642b6cce15ccbb05579e20ce3997b40e20) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Codex subagent-limit awareness ([#2659](https://github.com/williamzujkowski/nexus-agents/issues/2659), Epic D).

  Codex CLI's `~/.codex/config.toml` `[agents]` section defaults to `max_depth = 1` and `max_threads = 6` (the originating issue's `max_thread_depth` key name was wrong — corrected against the Codex config reference).

  Per the [#2659](https://github.com/williamzujkowski/nexus-agents/issues/2659) design vote (Option C), nexus-agents now **warns** at fan-out time when a planned topology would exceed these — it does not write the operator's global config or silently auto-flatten routing. `collectRealVotes` emits a structured warning when more voter roles land on Codex than `max_threads` (the narrow single-CLI-fallback case; the existing round-robin + the `worker-dispatcher` cap-of-3 already keep the common paths within limits). New `src/cli-adapters/codex-limits.ts` exports the defaults + `checkCodexConcurrency` / `checkCodexDepth`; `.rules/subagent-coordination.md` documents the Codex limits.

- [#2690](https://github.com/williamzujkowski/nexus-agents/pull/2690) [`d7e3206`](https://github.com/williamzujkowski/nexus-agents/commit/d7e32064bcce5a4a54dcac6b577cc43cde9c02c1) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Codex Skills cross-vendor compatibility ([#2660](https://github.com/williamzujkowski/nexus-agents/issues/2660), Epic D).

  Research refuted the issue's "translation layer" premise: Codex's Skills primitive (Dec 2025) uses the **same** `SKILL.md` filename and the **same** required frontmatter (`name`, `description`) as the Anthropic Agent Skills spec — the 31 skills are already cross-vendor compatible, and `generate-skills-index.ts` already validates the required fields and is CI-gated. There is nothing to convert and no redundant new gate to add.

  Delivered instead: the `name`/`description` validation in `generate-skills-index.ts` is now documented + test-locked as the cross-vendor contract, and `AGENTS.md` documents Codex's discovery path (`.agents/skills/` or a `[[skills.config]]` entry pointing at `skills/`) so Codex operators get the full catalog.

## 2.75.1

### Patch Changes

- [#2684](https://github.com/williamzujkowski/nexus-agents/pull/2684) [`6bafd6f`](https://github.com/williamzujkowski/nexus-agents/commit/6bafd6ff3549d58ff470d17ee2d3785c19223c8e) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Tool-output consistency lint + hook-layering guide ([#2653](https://github.com/williamzujkowski/nexus-agents/issues/2653), Epic B).

  [#2653](https://github.com/williamzujkowski/nexus-agents/issues/2653) originally proposed a runtime PostToolUse normalization layer. Codebase research refuted the premise — the 38 MCP tools already return uniform shapes (memory backends use `Date` objects, no conflicting status taxonomies, no pagination envelopes). So [#2653](https://github.com/williamzujkowski/nexus-agents/issues/2653) ships as a **preventive** lint, not a corrective runtime layer that would only mask future drift.
  - `.rules/hooks.md` documents the hook-vs-voter-rule-vs-prompt-rule layering decision, the output-consistency contract, and when a runtime normalization boundary _would_ be justified (the gateway proxying untrusted external MCP servers).
  - `check:tool-output-consistency` (`scripts/check-tool-output-consistency.ts`, wired into `governance:check`) scans each MCP tool's output surface — `outputSchema` blocks and `*Response` types, scoped by brace depth so internal cache types are exempt — and fails when a timestamp-named field (`*At`/`*Date`/`timestamp`) is typed as a bare `number`. A voter once compared an epoch-ms number to an ISO date as the same type; this catches the next one at source.

## 2.75.0

### Minor Changes

- [#2683](https://github.com/williamzujkowski/nexus-agents/pull/2683) [`ce4483c`](https://github.com/williamzujkowski/nexus-agents/commit/ce4483c3232dfbf7bbff6d1557adf037e227d5b5) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Programmatic prerequisite gates for sensitive MCP tools ([#2652](https://github.com/williamzujkowski/nexus-agents/issues/2652), Epic B).

  A guarded MCP tool now declares a **call-time world-state predicate** that must hold before it runs. `withPrerequisite()` (`src/mcp/middleware/tool-prerequisites.ts`) evaluates it on every invocation and, on failure, returns a structured `permission` error envelope carrying the failed prerequisite name + a remediation hint in `detail` — so the caller knows how to recover.

  Prerequisites are **world-state predicates**, not session-ordering ("call X first" is the tool's own internal responsibility, never a gate). Three tools are guarded: `improvement_review` (`gh-cli-available`), `memory_write` and `registry_import` (`data-dir-writable`). The `check:tool-prerequisites` CI gate requires every non-read-only tool to appear in either `TOOL_PREREQUISITES` or `NO_PREREQUISITE` (with a reason), so a new sensitive tool can't ship ungated by omission. Graph documented in `.rules/tool-prerequisites.md`.

## 2.74.0

### Minor Changes

- [#2678](https://github.com/williamzujkowski/nexus-agents/pull/2678) [`0dc04ca`](https://github.com/williamzujkowski/nexus-agents/commit/0dc04ca8e9033bf43db852adf69195fc0c7e4b5a) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Epic C (cross-adapter rule precedence) + Epic A (MCP tool surface foundation).

  **Epic C — cross-adapter rule loading**
  - `docs/guides/RULE_PRECEDENCE.md` documents how Claude Code / Codex CLI / Gemini CLI / OpenCode each resolve rule files, with a `check:adapter-precedence-docs` CI gate ([#2655](https://github.com/williamzujkowski/nexus-agents/issues/2655)).
  - Every `.rules/*.md` now carries `paths:` + `description:` YAML frontmatter so non-Claude harnesses can resolve rules deterministically, with a `check:rule-frontmatter` CI gate ([#2656](https://github.com/williamzujkowski/nexus-agents/issues/2656)).

  **Epic A — MCP tool surface foundation** ([#2651](https://github.com/williamzujkowski/nexus-agents/issues/2651))
  - All 38 registered MCP tools now declare the full set of MCP 2025-11-25 annotation hints (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`) via a central source-of-truth map, with a `check:tool-annotations` CI gate ([#2648](https://github.com/williamzujkowski/nexus-agents/issues/2648)).
  - All 38 tools + the shared error-producing middleware return a **structured error envelope** (`errorCategory` ∈ `transient | validation | permission | business | internal`, `isRetryable`, `message`, optional `detail`) instead of opaque strings. The envelope is carried in the result's `_meta` (never `structuredContent`, which MCP clients validate against `outputSchema` even on error results). `toolError(msg)` remains as a back-compat alias. New `check:mcp-error-envelope` CI gate ([#2649](https://github.com/williamzujkowski/nexus-agents/issues/2649)).
  - A `check:tool-distinctness` CI gate computes pairwise TF-IDF similarity across the 38 tool descriptions and catches regressions in description distinctness (baseline-aware, mirrors the orphan-allowlist pattern) ([#2650](https://github.com/williamzujkowski/nexus-agents/issues/2650)).

## 2.73.0

### Minor Changes

- [#2540](https://github.com/williamzujkowski/nexus-agents/pull/2540) [`dc693bf`](https://github.com/williamzujkowski/nexus-agents/commit/dc693bfad05b950dd108eba928f983ecdb49d252) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Add unified `ModelRegistry` ([#2540](https://github.com/williamzujkowski/nexus-agents/issues/2540) PR 1 of 8). Single source of truth for per-model metadata — combines what was previously split between `model-capabilities.ts` (canonical hardcoded `MODEL_IDS`) and `model-behavior-profile.ts` (vendor-pattern-matched profiles).

  `ModelEntry` carries both capability + behaviour fields. Resolution chain: operator manifest > in-tree authoritative > models.dev snapshot > derived defaults (vendor → family → universal). Always returns something — unknown models get derived entries with sensible defaults so routing decisions don't hard-miss.

  Public API:
  - `ModelRegistry` class + `getEntry(modelId, hints?)` lookup
  - `ModelEntry` / `ModelRegistryOptions` / `EntrySource` types
  - `deriveEntry(modelId, identity)` for consumers building entries from resolved identity
  - `getDefaultRegistry()` / `setDefaultRegistry()` for the lazy global singleton
  - `DEFAULT_ENTRY` for the universal fallback shape

  `model-behavior-profile.ts` is `@deprecated` — will be deleted in PR 2 of the [#2540](https://github.com/williamzujkowski/nexus-agents/issues/2540) plan once `AgenticAdapter` migrates to the unified registry. `model-capabilities.ts` callers migrate in PR 3.

  Also extends `model-identity.ts`'s `dated` quirk regex to catch ISO-style date suffixes (`2024-08-06`, `2024-08`) in addition to compact-8-digit formats.

- [#2541](https://github.com/williamzujkowski/nexus-agents/pull/2541) [`d60112f`](https://github.com/williamzujkowski/nexus-agents/commit/d60112fca10dcb4fbf22bb8865d2b1b159ef2356) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Migrate `AgenticAdapter` to the unified `ModelRegistry` ([#2540](https://github.com/williamzujkowski/nexus-agents/issues/2540) PR 2 of 8).

  `AgenticAdapter` now consumes `ModelEntry` from the registry instead of `ModelBehaviorProfile` from the deprecated `model-behavior-profile.ts`. Behaviour is unchanged — the registry's derived-fallback chain matches the prior `lookupModelProfile` semantics field-for-field.

  `AgenticAdapterOptions` gains an optional `registry: ModelRegistry` field for dependency injection (tests + multi-tenant deployments). Default is the lazy global registry.

  `forceProfile` now accepts a `ModelEntry` instead of `ModelBehaviorProfile` — minor breaking change for tests that constructed the profile inline. Tests updated.

  **Deletes** `model-behavior-profile.ts` + its tests. The behaviour fields, defaults, and lookup-with-vendor/family-fallback logic moved into `model-registry.ts` in PR 1. No code paths reference the deleted module.

- [#2542](https://github.com/williamzujkowski/nexus-agents/pull/2542) [`466774c`](https://github.com/williamzujkowski/nexus-agents/commit/466774ca9c2faa8709496d60ef3ad3bd1c2371a1) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - `listModels()` across direct-API and CLI adapters ([#2540](https://github.com/williamzujkowski/nexus-agents/issues/2540) PR 5 of 8).

  Anthropic and Google direct-API adapters (`ClaudeAdapter`, `GeminiAdapter`) gain `listModels()` that wraps the SDKs' `client.models.list()` surface — 5-min cache, in-flight promise sharing, throws on probe failure so the harness-side identity resolver can fall back. The OpenCode CLI adapter (`OpenCodeCliAdapter`) gains a `listModels()` that reshapes the existing `opencode models` probe into `CliModelInfo` rows, splitting `provider/model` ids when present.

  `ICliAdapter` gains an optional `listModels?(): Promise<readonly CliModelInfo[]>` slot mirroring the one on `IModelAdapter`. The new `CliModelInfo` type is exported from `cli-adapters/types`. The custom-OpenAI gateway wrapper (`openai-compat-adapter.ts`) now forwards `listModels` from the inner adapter when the inner adapter exposes one — so a multi-vendor gateway (Claude/Gemini/OpenAI/etc behind one base URL) reports its inventory honestly.

  Subprocess CLI adapters whose CLIs have no native list surface (`claude`, `codex`, `gemini`) intentionally leave `listModels` undefined. Identity for those falls back to `modelId` parse via `ModelRegistry`.

- [#2543](https://github.com/williamzujkowski/nexus-agents/pull/2543) [`8298d8a`](https://github.com/williamzujkowski/nexus-agents/commit/8298d8ab47a318019c0335e7575229a5a46f605c) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - `AvailableModelsCache` — harness-driven view of routable models ([#2540](https://github.com/williamzujkowski/nexus-agents/issues/2540) PR 6 of 8).

  PR 5 added `listModels()` on direct-API and CLI adapters. This PR stitches those probes into one queryable surface so `CompositeRouter` (PR 7) can gate scoring on what's actually routable right now.

  Design invariants:
  - **Sources are the source of truth.** If a harness drops a model, the registry never decides it's still routable. `ModelRegistry` answers "how should this model behave"; `AvailableModelsCache` answers "is this model routable at all."
  - **Stale-while-revalidate.** Fresh < 5 min. Stale-but-usable < 25 min (returns cached, kicks background refresh). Beyond → blocks. Defaults configurable per call site.
  - **Bad sources don't poison the union.** A failing `listModels` logs and is excluded from the next snapshot; remaining sources stay queryable.
  - **No persistence.** Process-local; operators restart and get a fresh probe.

  API: `new AvailableModelsCache({ sources, ttlMs?, staleTtlMs?, now? })` → `getAll()`, `byProvider(name)`, `has(modelId)`, `refresh()`. Sources adapt themselves to the minimal `AvailableModelsSource` interface (one `listModels()` method) so both `IModelAdapter` and `ICliAdapter` can be wrapped without entangling the cache with either contract.

- [#2544](https://github.com/williamzujkowski/nexus-agents/pull/2544) [`e613cba`](https://github.com/williamzujkowski/nexus-agents/commit/e613cbae223c7dea4774f65b9276f675d458a89e) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - `CompositeRouter` consumes `AvailableModelsCache` ([#2540](https://github.com/williamzujkowski/nexus-agents/issues/2540) PR 7 of 8).

  `CompositeRouterConfigWithPreference` gains an optional `availableModelsCache` field. When set, the router gates its candidate-CLI list on the cache before running the routing pipeline:
  - A CLI is excluded only when the cache has been queried at least once and reports zero models for it.
  - An empty cache union (cold start, all sources failing) falls back to all registered CLIs — the gate never wedges routing on a transient cache miss.
  - Cache errors do not block routing — they are logged and the router falls through to all registered CLIs.

  `getAvailableModelsCache()` exposes the wired cache (or undefined) for downstream consumers (the runtime model-not-found fallback in PR 8 will use this).

  OutcomeStore wiring deferred to follow-on ([#2540](https://github.com/williamzujkowski/nexus-agents/issues/2540) makes the registry available for OutcomeStore key normalization, but the actual wiring touches more than this PR's scope).

- [#2545](https://github.com/williamzujkowski/nexus-agents/pull/2545) [`1daf9e6`](https://github.com/williamzujkowski/nexus-agents/commit/1daf9e66b0e8d584bc08732e622af8b8191b3210) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - `withModelNotFoundFallback` — runtime retire-and-retry primitive ([#2540](https://github.com/williamzujkowski/nexus-agents/issues/2540) PR 8 of 8, completes the epic).

  When a vendor retires a model id (Codex moving to GPT-5.4 while older 5.x releases 404, Anthropic bumping minor versions, etc.), the next request returns 404 / `model_not_found` / "this model is deprecated." This PR closes that gap end-to-end:
  - **Distinct error code**: `ErrorCode.MODEL_NOT_FOUND`. `BaseAdapter` now classifies HTTP 404 + the standard vendor messages ("model not found", "no such model", "model is deprecated", etc.) under this code, separate from transient `MODEL_UNAVAILABLE` (502/503).
  - **Wrapper utility**: `withModelNotFoundFallback(adapter, { cache, registry?, adapterFactory?, onRetirement? })`. On a `MODEL_NOT_FOUND`, the wrapper refreshes the `AvailableModelsCache` (PR 6), uses `ModelRegistry` (PR 1) to find the closest same-vendor/same-family alternative from what's now routable, and:
    - With an `adapterFactory`: builds a fallback adapter and retries the call once. Returns the second error verbatim if the retry fails.
    - Without a factory: surfaces the original error enriched with the suggested fallback id, so the caller can re-route.
  - **Single retry by design** — looping risks wedging when a whole family is retired. Caller escalates after one attempt.
  - **Streams left as passthrough** — streaming retries need partial-result reconciliation that belongs in a follow-up.

  Closes the wiring loop opened by epic [#2540](https://github.com/williamzujkowski/nexus-agents/issues/2540): PR 1 unified the registry, PR 2 migrated AgenticAdapter, PR 5 added `listModels()` across direct-API and CLI adapters, PR 6 stitched those probes into a stale-while-revalidate cache, PR 7 gated `CompositeRouter`'s candidate set on the cache, and PR 8 closes the loop at the call site — when an inflight request hits a retired id, the system observes the retirement, picks a fallback, and keeps moving.

### Patch Changes

- [#2537](https://github.com/williamzujkowski/nexus-agents/pull/2537) [`92b8360`](https://github.com/williamzujkowski/nexus-agents/commit/92b836082a372b7c9cd816501347c4a430a61a35) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Expose `IAgenticAdapter` + factory + types from the package root ([#2536](https://github.com/williamzujkowski/nexus-agents/issues/2536)). The pieces landed in main as part of [#2529](https://github.com/williamzujkowski/nexus-agents/issues/2529)'s PRs but the `exports/agents.ts` re-export wiring was missed, so consumers importing from `'nexus-agents'` couldn't see `createAgenticAdapter`, `AgenticAdapter`, `IAgenticAdapter`, `AgentRunResult`, etc.

  Adds explicit re-exports of:
  - `AgenticAdapter`, `createAgenticAdapter`
  - `AgenticAdapterOptions`, `AgentRunResult`, `AgentStopReason`, `AgentTurn`, `IAgenticAdapter`, `RunAgentArgs`
  - `AgenticToolCall` (= `ToolCall` from agentic), `AgenticToolResult` (= `ToolResult` from agentic) — aliased to avoid collision with the existing MCP `ToolCall` / `ToolResult` shapes

  Eval-repo v0.3 consumers (aider-polyglot / livecodebench / tau-bench) can now import the agentic primitive directly. Patch bump only — no behaviour change, just visibility fix.

## 2.72.0

### Minor Changes

- [#2535](https://github.com/williamzujkowski/nexus-agents/pull/2535) [`62d5f5f`](https://github.com/williamzujkowski/nexus-agents/commit/62d5f5ff9f1ad0dcb6cd00d992e7f0b41970a882) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Add `IAgenticAdapter` primitive for multi-turn tool-use agent loops ([#2529](https://github.com/williamzujkowski/nexus-agents/issues/2529)). Counterpart to `IModelAdapter`'s single-shot `complete()` — eval harnesses (and any other consumer driving an agent loop) own their toolset + tool execution while the adapter handles model orchestration.

  **Public API additions** (re-exported from the package root):
  - `createAgenticAdapter(modelAdapter, options)` factory + `AgenticAdapter` class
  - `IAgenticAdapter` / `RunAgentArgs` / `AgentRunResult` / `AgentTurn` / `ToolCall` / `ToolResult` / `AgentStopReason` / `AgentError` types
  - `resolveModelIdentity(adapter, options)` + `resolveModelIdentitySync` + `parseModelId`
  - `ResolvedModelIdentity` / `ModelHints` / `ModelVendor` / `IdentitySource` types
  - `lookupModelProfile(identity)` + `lookupProfileFromModelId(modelId)` + `DEFAULT_PROFILE`
  - `ModelBehaviorProfile` / `ToolDefinitionFormat` / `PromptCachingMode` types
  - `IModelAdapter.listModels?()` optional method + `ModelMetadata` type

  **What it does**: handles the model-orchestration loop for tool-using agents — call → tool_use blocks → harness routes calls → tool_result blocks back → repeat until the model stops, hits the turn budget, errors, or is cancelled.

  Per-model behaviour is profile-driven: a custom OpenAI gateway fronting Claude gets Anthropic's profile (parallel tool execution + ephemeral prompt-caching markers) automatically based on the resolved `modelId`, not the `IModelAdapter.providerId`. Operators override via `modelHints`.

  **Key invariants**:
  - `runAgent` returns `Result<AgentRunResult, AgentError>`; `Result.ok` includes `stopReason ∈ {agent-stopped, turn-budget, tool-error, cancelled}` so partial-progress runs are gradable
  - `onTurn` callback fires after each turn for operator visibility
  - `AbortSignal` cancels between turns
  - `maxConcurrent` semaphore caps concurrent model API calls (released during tool execution)
  - Refuses to construct for embedding models (e.g., `text-embedding-3-large`)
  - `turnBudget` defaults to `profile.maxRecommendedTurnBudget` when omitted
  - `cache_control: ephemeral` marker added to the last tool definition for Anthropic vendors

  **Identity resolution** stacks: `modelHints` (operator force) > `/v1/models` probe (`OpenAIAdapter` implements `listModels`) > `modelId`-string parse > `'unknown'`.

  Lands in PRs [#2530](https://github.com/williamzujkowski/nexus-agents/issues/2530)/[#2531](https://github.com/williamzujkowski/nexus-agents/issues/2531)/[#2532](https://github.com/williamzujkowski/nexus-agents/issues/2532)/[#2533](https://github.com/williamzujkowski/nexus-agents/issues/2533). Pre-work for the eval-repo v0.3 promotions ([nexus-eval-aider-polyglot#9](https://github.com/williamzujkowski/nexus-eval-aider-polyglot/issues/9), [nexus-eval-livecodebench#7](https://github.com/williamzujkowski/nexus-eval-livecodebench/issues/7), [nexus-eval-tau-bench#4](https://github.com/williamzujkowski/nexus-eval-tau-bench/issues/4)) which build on the new primitive.

## 2.71.0

### Minor Changes

- [#2404](https://github.com/williamzujkowski/nexus-agents/pull/2404) [`8aeabe8`](https://github.com/williamzujkowski/nexus-agents/commit/8aeabe80d2b0d3546f9a8a4288d54f6e850c1382) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Add `improvement_review` MCP tool (PR 2 of epic [#2402](https://github.com/williamzujkowski/nexus-agents/issues/2402)). Replaces the deleted self-development engine with a focused, threshold-gated observability-driven loop.

  **What it does**: reads existing observability primitives (`OutcomeStore`, `fitness-audit`) and surfaces patterns that cross documented thresholds as candidate signals. When `fileIssues=true`, files candidate GitHub issues via `gh issue create` (rate-limited to 5 per run, deduped against open issues by signal key). Never auto-merges.

  **Detectors**:
  - `detectCliPerformanceFloor` — CLI × category success rate < 60% with ≥ minSampleSize observations (default 5)
  - `detectFailureCategoryConcentration` — single failure category > 50% of failures with ≥ 10 failures
  - `detectFitnessSignals` — fitness score below floor (default 90) AND/OR critical fitness findings

  **Safety**:
  - `gh issue create` invoked via `execFile` (no shell — safe against command injection from `errorMessage` content)
  - Dedup query also via `execFile` with literal-phrase search of signal key in body
  - Rate-limited per run; per-signal-class week-long throttle via the signal-key dedup
  - Each filed issue includes the signal key in the body for stable cross-run dedup

  **Inputs**: `lookbackDays` (default 7), `fileIssues` (default false → return signals only), `minSampleSize` (default 5), `fitnessFloor` (default 90).

  **Outputs**: `{ window, totalOutcomes, signals[], issuesFiled[], issuesSkipped[] }`.

  Skill count unchanged at 26. MCP tool count: 37 → 38. New file: `src/mcp/tools/improvement-review.ts` (~430 LOC) + `improvement-review.test.ts` (18 unit tests for the threshold detectors). Wired into `mcp/index.ts`, `mcp/tools/index.ts`, `cli-server-tools.ts`, and `tool-annotations.ts`.

  Closes the build half of epic [#2402](https://github.com/williamzujkowski/nexus-agents/issues/2402). Replaces the unwired engine deleted in PR [#2403](https://github.com/williamzujkowski/nexus-agents/issues/2403) (~7,700 LOC). Net code delta: −7,000 LOC.

- [#2511](https://github.com/williamzujkowski/nexus-agents/pull/2511) [`65b7398`](https://github.com/williamzujkowski/nexus-agents/commit/65b73989ce860af5909491f4573d55eb33bbdd86) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Deprecate the unused sandbox executor surface ([#2499](https://github.com/williamzujkowski/nexus-agents/issues/2499)). The OS-level sandbox executors in `packages/nexus-agents/src/security/sandbox/` (`DenoSandboxExecutor`, `DockerSandboxExecutor`, `createSandboxExecutor`, `getSandboxExecutor`/`getSandboxExecutorOrNull`, `policyToDenoFlags`, `collectPolicyConfigurationWarnings`) carry `@deprecated` JSDoc tags pointing at [#2499](https://github.com/williamzujkowski/nexus-agents/issues/2499). **Behaviour is unchanged in this release** — the symbols still work, just emit IDE/lint deprecation warnings.

  The supported sandbox surface remains the validation primitives (`validateCommand`, `validateArgs`, `SandboxPolicy` types, `DEVELOPMENT_POLICY`, `READONLY_POLICY`) consumed by `cli/sandbox-exec.ts` for command-allowlist gating. Those are NOT deprecated.

  **Why**: the executor classes have no production callers. The product direction (epic [#2500](https://github.com/williamzujkowski/nexus-agents/issues/2500)) is "compatible with running inside a host-provided sandbox" (Codex sandbox, Claude Code sandbox, OpenCode's docker template, locked-down CI) — not "ship our own sandbox runtime." Carrying ~600 lines of unreachable executor code makes the module look more capable than it is and tempts new contributors to extend a layer that doesn't run.

  **Migration**: most consumers are internal (this repo) — the deprecated symbols are still exported but should not be the basis of new work. External consumers using `createSandboxExecutor` should plan to migrate to either (a) host-provided sandbox boundaries, or (b) the validation primitives directly.

  **Removal**: tracked separately. After this minor release ships, a follow-up issue will delete the executor classes + their tests in a single PR.

- [#2521](https://github.com/williamzujkowski/nexus-agents/pull/2521) [`2a284d8`](https://github.com/williamzujkowski/nexus-agents/commit/2a284d8fb2183c18f2d01921f4c2d4e271536740) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Extract the SWE-bench harness from `packages/nexus-agents/src/swe-bench/` to its own repo: [`nexus-eval-swebench`](https://github.com/williamzujkowski/nexus-eval-swebench). Per the harness-extraction policy (epic [#2514](https://github.com/williamzujkowski/nexus-agents/issues/2514), originally [#1960](https://github.com/williamzujkowski/nexus-agents/issues/1960)). Closes [#2515](https://github.com/williamzujkowski/nexus-agents/issues/2515).

  **What changed**:
  - `packages/nexus-agents/src/swe-bench/` (~101 files, ~11,594 LOC of runtime + tests) is **deleted**.
  - `packages/nexus-agents/src/exports/swe-bench.ts` and the corresponding re-export from `index.ts` are removed — `SWEBenchRunner`, `EvaluationHarness`, `SWEBenchInstance`, `SWEBenchPrediction`, `SWEBenchVariant`, `SWEBenchConfig`, etc. are no longer exported from `nexus-agents`.
  - `packages/nexus-agents/src/cli/swe-bench-command.ts` is deleted.
  - The `nexus-agents swe-bench` CLI subcommand is preserved as a **deprecation shim** for one minor release — prints a migration message pointing at `npx nexus-eval-swebench` and exits with code 3 (`INVALID_ARGS`). Removed in the next minor.
  - `packages/nexus-agents/src/swe-bench/mcp-config.ts` (used by `pipeline/expert-bridge.ts` to spawn child Claude CLI sessions with MCP access) is **relocated** to `packages/nexus-agents/src/cli-adapters/child-mcp-config.ts` — the helper is generic CLI-spawn infrastructure, not benchmark-specific.

  **Migration**:

  ```diff
  - npx nexus-agents swe-bench --variant lite --limit 5
  + export OPENAI_API_KEY=sk-...
  + npx nexus-eval-swebench --variant lite --limit 5

  - import { SWEBenchRunner } from 'nexus-agents';
  + import { SweBenchAdapter } from 'nexus-eval-swebench';
  + // wraps the BenchmarkAdapter contract with an IModelAdapter you provide
  ```

  Note that `nexus-eval-swebench` v0.2 is a **clean-room rewrite** — it does NOT re-export the legacy `SWEBenchRunner` API. The new adapter takes any `IModelAdapter` and produces `SweBenchPrediction` directly. See the [v0.2 README](https://github.com/williamzujkowski/nexus-eval-swebench#readme) for the new shape.

  **Why**: keeps the published nexus-agents bundle lean — the SWE-bench harness was ~11,594 LOC of evaluation-only code that consumers running orchestration / MCP tools never needed at runtime. The harness-extraction policy concentrates benchmark code in dedicated `nexus-eval-*` repos so they can evolve independently. Per discussion in [#2515](https://github.com/williamzujkowski/nexus-agents/issues/2515), no breaking-change concern: the only consumers of the legacy `nexus-agents/swe-bench` exports were the eval repo itself (now self-contained) and the in-tree CLI subcommand (now a shim).

- [#2520](https://github.com/williamzujkowski/nexus-agents/pull/2520) [`c3f1a7e`](https://github.com/williamzujkowski/nexus-agents/commit/c3f1a7ef2ae9a9cb3fb3dab2dbb5b90782edde23) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Extract Atbench (agent-trajectory safety benchmark, originally [#1981](https://github.com/williamzujkowski/nexus-agents/issues/1981)) from `packages/nexus-agents/src/benchmarks/atbench/` to its own repo: [`nexus-eval-atbench`](https://github.com/williamzujkowski/nexus-eval-atbench). Per the harness-extraction policy (epic [#2514](https://github.com/williamzujkowski/nexus-agents/issues/2514), originally [#1960](https://github.com/williamzujkowski/nexus-agents/issues/1960)).

  **Behaviour changes**:
  - The in-tree `packages/nexus-agents/src/benchmarks/atbench/` directory is **deleted** — `import { ATBenchAdapter } from 'nexus-agents/benchmarks/atbench'` no longer works. Migrate to `import { ATBenchAdapter } from 'nexus-eval-atbench'`.
  - `packages/nexus-agents/src/cli/atbench-command.ts` is deleted.
  - The `nexus-agents atbench` CLI subcommand is preserved as a **deprecation shim** for one minor release — it prints a migration message pointing at `npx nexus-eval-atbench` and exits with code 3 (`INVALID_ARGS`). The shim is removed in the next minor.

  **Migration**:

  ```diff
  - npx nexus-agents atbench --fixture ./fixture.jsonl
  + npx nexus-eval-atbench --fixture ./fixture.jsonl

  - import { ATBenchAdapter } from 'nexus-agents/benchmarks/atbench';
  + import { ATBenchAdapter } from 'nexus-eval-atbench';
  ```

  The eval repo is published at npm as `nexus-eval-atbench` and peer-deps `nexus-agents >= 2.33.1`.

  **Why**: keeps the published nexus-agents bundle lean — atbench was ~1,328 LOC of benchmark-only code that consumers running orchestration / MCP tools never need at runtime. The harness-extraction policy concentrates benchmark code in dedicated `nexus-eval-*` repos so they can evolve independently.

  **No public-API breakage**: atbench was never exposed via `nexus-agents`'s top-level `exports/`, only via the deep import path above. Operators using the CLI subcommand get the shim's migration message; library consumers using the deep import get a build error pointing at the new package.

### Patch Changes

- [#2400](https://github.com/williamzujkowski/nexus-agents/pull/2400) [`cb7e5d0`](https://github.com/williamzujkowski/nexus-agents/commit/cb7e5d0d6ed3c2b4cfc17895855762ca2ad53066) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Tiers 2 + 3 of epic [#2398](https://github.com/williamzujkowski/nexus-agents/issues/2398) — enhance `ui-ux-design` skill with patterns from Apache-2.0-licensed [nexu-io/open-design](https://github.com/nexu-io/open-design):

  **Tier 2 — Brand extraction protocol** (5 steps with explicit safety guards per security voter):
  1. **Locate** — local repo asset preferred, user-pasted excerpt as fallback, external URL as last resort
  2. **Safety guards (when fetching URL)** — non-negotiable per security review:
     - Explicit user confirmation (never auto-fetch)
     - HTTPS only (reject `http://`, `file://`, `ftp://`, protocol-relative)
     - Public-IP allowlist (reject RFC 1918 + link-local + CGNAT + IPv6 equivalents — full list inline)
     - Content-type allowlist (HTML/CSS/SVG/PNG/JPEG/WebP only)
     - 5 MB size cap, 30 s timeout
     - Treat fetched content as untrusted per `.rules/untrusted-input.md`
  3. **Extract tokens** — concrete `grep -hoiE` patterns for hex codes, font families, spacing scale
  4. **Codify in `brand-spec.md`** — path-traversal guard (cwd subtree only)
  5. **Vocalize** — read tokens back to user in own words for confirmation before generating code

  **Tier 3 — 9-section DESIGN.md schema** — portable design-system structure adopted from Open Design as the canonical brand-spec format. Sections: Visual theme / Color palette / Typography / Component stylings / Layout / Depth & elevation / Dos and don'ts / Responsive strategy / Agent prompt guide. Cross-tool portable (Open Design, Claude Design, future nexus-agents UI tooling).

  **Tier 2.5 (bundled) — 8-dimension brief input format** — structured brief schema (palette / accent / typography / display / layout / mood / density / exclude) with default-resolution rules and "don't silently default" discipline.

  License: Apache-2.0 attribution in section quotes. Pure-patch — additive only, no API change.

  **Tier 4 (P0/P1/P2 standardization) skipped after audit** — severity language across skills is already domain-appropriate (`critical/high/medium/low` for security per CVSS, `P1/P2` for issue priority). No drift; no convergence needed.

- [#2403](https://github.com/williamzujkowski/nexus-agents/pull/2403) [`bd70f9d`](https://github.com/williamzujkowski/nexus-agents/commit/bd70f9dee8b64940e360b79b92381552c8277de8) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Delete dead `src/workflows/self-development/` engine (PR 1 of epic [#2402](https://github.com/williamzujkowski/nexus-agents/issues/2402)).

  The engine (~7,700 LOC source + tests) was authored before our observability primitives existed (`OutcomeStore`, `weather_report`, `LinUCB`, `fitness-audit`). By the time those landed, no consumer had wired up to invoke its runner — `package.json`, `.github/workflows/`, and CLI dispatch all bypass it. Six months of unwired existence + an in-place replacement (the `improvement_review` MCP tool from PR 2 of [#2402](https://github.com/williamzujkowski/nexus-agents/issues/2402), plus the manual `dogfooding-issues` skill) make this a clean Tier-A internal-only removal per `deprecation-and-migration`.

  Removed:
  - `src/workflows/self-development/` (58 files: engine, phases, audit-trail, github-client shim, git-client, docker-sandbox, notifications incl. `WebhookNotificationHandler`, etc.)
  - `scripts/run-self-dev.ts` runner
  - `workflows/templates/self-development.yaml`
  - `docs/archive/workflows/self-dev-{phases,execution,operations,validation}.md`

  Updated:
  - `docs/workflows/SELF_DEVELOPMENT_WORKFLOW.md` rewritten as a historical pointer to epic [#2402](https://github.com/williamzujkowski/nexus-agents/issues/2402)
  - Stale comments cleaned in `src/scm/{github-provider,index}.ts`, `src/exports/scm.ts`, `src/cli-adapters/cli-to-model-adapter.ts`, `src/security/sandbox/default-policies.ts`, `docs/architecture/UNTRUSTED_INPUT_HARDENING.md`

  Public API: unchanged (the module had zero `src/exports/*` reach).

  Verified locally: `pnpm typecheck` clean, `pnpm lint` clean, `pnpm vitest run`: 25,811 pass / 16 skipped (was 26,386 — 575 tests deleted along with the dead engine).

## 2.70.0

### Minor Changes

- [#2399](https://github.com/williamzujkowski/nexus-agents/pull/2399) [`9e9b5f1`](https://github.com/williamzujkowski/nexus-agents/commit/9e9b5f14f2ab17e3cdd828f64feb25d139c9264e) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Tier 1 of epic [#2398](https://github.com/williamzujkowski/nexus-agents/issues/2398) — adopt the five-dimensional self-critique pattern from Apache-2.0-licensed [nexu-io/open-design](https://github.com/nexu-io/open-design) as a new `self-critique` skill.

  This is the **pre-emit gate**: before an agent emits work (code, design, docs, spec, PR description), it silently scores the output 0-10 across 5 task-appropriate dimensions. Worst sustained band < 3 = regression; fix lowest dimension and rescore.

  Distinct from `reviewing-code` (which reviews _others'_ code post-hoc). Self-critique is the _internal_ gate that runs _first_. Both can apply to the same artifact at different lifecycle points.

  **Concrete dimension tables included** (per architect's QA on epic [#2398](https://github.com/williamzujkowski/nexus-agents/issues/2398) — "rubric tables, not vague guidance"):
  - **Code**: Correctness / Readability / Architecture / Security / Performance
  - **Design**: Philosophy / Hierarchy / Detail / Functionality / Innovation (Open Design's original)
  - **Documentation**: Accuracy / Discoverability / Density / Examples / Tone
  - **Spec/PR/ADR**: Completeness / Testability / Reversibility / Stakeholder-fit / Scope
  - **Default**: Soundness / Clarity / Coverage / Specificity / Restraint

  **Scoring bands** (universal): 0-4 Broken / 5-6 Functional / 7-8 Strong / 9-10 Exceptional.

  **Scoring discipline rules** ported verbatim from upstream:
  - Always cite evidence (no "feels inconsistent")
  - Don't average up (worst sustained band wins)
  - Don't grade-inflate (7 = strong, not acceptable)
  - Innovation/Restraint allowed to be low for production work
  - One dimension can fail without the others

  Wired as cross-link from `reviewing-code` (external counterpart) and `dev-pipeline` (Phase-4 pre-emit gate).

  License: Apache-2.0 attribution in skill source comment. Skill count: 25 → 26.

### Patch Changes

- [#2396](https://github.com/williamzujkowski/nexus-agents/pull/2396) [`41edc26`](https://github.com/williamzujkowski/nexus-agents/commit/41edc2635adb8f56e125a100d320ae158ad5b9b8) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Tier E of epic [#2385](https://github.com/williamzujkowski/nexus-agents/issues/2385) (FINAL TIER) — standardize 17 remaining skills with anti-rationalization tables, red-flags sections, and verification checklists. Closes the epic.

  State of the world before this PR:
  - 8 of 25 skills had all three sections (the new + Tier-D-pollinated ones)
  - 17 skills had partial or no coverage

  State after:
  - All 25 skills have anti-rationalization tables, red-flags lists, and verification-shaped content (named variously: "Verification checklist", "Quality Checklist", "Pre-launch checklist", "Implementation Complete Checklist" — all serve the same gate function)

  Per architect's epic-vote cap (~30 lines per skill), each addition is small and focused. Total ~430 lines added across 17 skill files.

  Skills enhanced:
  research-and-vote, dev-pipeline, codex-delegator, gemini-delegator, release, security-scanning, security-advisory-response, hotfix, system-review, dogfooding-issues, version-check, infrastructure-management, bug-fix, documentation-management, implement-feature, requirements-gathering, reviewing-code, ui-ux-design.

  Pure-patch — no API change, no behavior change, no new skills (count stays at 25), frontmatter unchanged in all 17 skills.

  This closes epic [#2385](https://github.com/williamzujkowski/nexus-agents/issues/2385). Final state: 18 → 25 skills, +5 reference checklists, +3 subagent personas, 25/25 skills standardized with anti-rationalization + red flags + verification gates.

## 2.69.0

### Minor Changes

- [#2389](https://github.com/williamzujkowski/nexus-agents/pull/2389) [`7da6e4d`](https://github.com/williamzujkowski/nexus-agents/commit/7da6e4d500c3e667fd879448661cf007b58b4521) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Tier A2 of epic [#2385](https://github.com/williamzujkowski/nexus-agents/issues/2385) — adopt 4 more skills from MIT-licensed [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills):
  - `performance-optimization` — measure-first MIFVG cycle (Measure → Identify → Fix → Verify → Guard) with anti-rationalization for the most common premature-optimization excuses. Cites our existing patterns (Beyoncé Rule, hot-path identification by profile not guess) and references the soon-to-land `performance-checklist.md` reference (Tier B).
  - `api-and-interface-design` — Hyrum's Law, contract-first, validate-at-boundaries, consistent error semantics, discriminated unions, branded IDs, input/output separation. Cross-references our zero-`any` policy, `.rules/untrusted-input.md`, the `deprecation-and-migration` skill, and our `Result<T,E>` canonical pattern.
  - `browser-testing-with-devtools` — Chrome DevTools MCP integration with strong security boundaries (DOM/console/network = untrusted, no instruction-following from page content, JS-execution constraints, no credential exfiltration). Per Security voter's epic-vote concern: explicit URL-allowlist + untrusted-DOM handling.
  - `context-engineering` — six-level context hierarchy (rules → memory → spec → source → live state → conversation), subagent fan-out discipline (3-4 wave, < 500-word prompts, output budget, `## Status` line), confusion-management pattern (surface ambiguity, don't silently choose), inline-planning pattern.

  Skill count: 21 → 25.

  Also patches `scripts/generate-skills-index.ts` to normalize whitespace in extracted trigger phrases — YAML literal-block descriptions wrap at column 80, which previously caused the trigger set to contain literal newlines that then broke CLAUDE.md's skill table (MD038 + MD056). Fixes the root cause that bit PRs [#2386](https://github.com/williamzujkowski/nexus-agents/issues/2386) and would have bit this PR too.

  Format follows the addyosmani template (when-to-trigger / process / anti-rationalization / red flags / verification checklist), adapted to nexus-agents conventions and tooling.

### Patch Changes

- [#2391](https://github.com/williamzujkowski/nexus-agents/pull/2391) [`cb8a0b5`](https://github.com/williamzujkowski/nexus-agents/commit/cb8a0b517efb07ca85c652088ec289052086bc68) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Tier B of epic [#2385](https://github.com/williamzujkowski/nexus-agents/issues/2385) — adopt 5 reference checklists from MIT-licensed [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) under `skills/references/`. Loaded on-demand by relevant skills via the existing skill-link mechanism (CANONICAL SOURCES header comments).

  References:
  - `accessibility-checklist.md` — WCAG 2.1 AA, ARIA roles, keyboard navigation, focus management. Loaded by `ui-ux-design`, `browser-testing-with-devtools`.
  - `performance-checklist.md` — Core Web Vitals (LCP/INP/CLS), bundle size, profiling, common patterns. Loaded by `performance-optimization`.
  - `security-checklist.md` — OWASP Top 10, auth/authz, input validation, security headers, secrets. Loaded by `security-scanning`, `security-advisory-response`, `api-and-interface-design`.
  - `testing-patterns.md` — Pyramid, AAA structure, naming, fakes vs mocks, table-driven, fixtures. Loaded by `test-driven-development`, `bug-fix`.
  - `orchestration-patterns.md` — Multi-agent coordination, fan-out, consensus, retry policies, deadline propagation. Loaded by `dev-pipeline`, `research-and-vote`, `codex-delegator`, `gemini-delegator`.

  Each reference file gets a header comment citing the upstream addyosmani source (MIT, Copyright 2025) and listing the nexus-agents skills that load it. A `skills/references/README.md` indexes the set.

  Eight existing skills updated with reference links in their CANONICAL SOURCES headers (no behavioral change to the skills themselves — purely additive citation). Pure-patch release: no public-API impact.

- [#2392](https://github.com/williamzujkowski/nexus-agents/pull/2392) [`6bced26`](https://github.com/williamzujkowski/nexus-agents/commit/6bced26ccf7f43b938e8b8f2faaa6a39bceb8fc4) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Tier C of epic [#2385](https://github.com/williamzujkowski/nexus-agents/issues/2385) — adopt 3 subagent persona prompts from MIT-licensed [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) under `.claude/agents/`. **Per architect QA on the epic vote**: adopted as subagent prompt templates only, NOT as new voter roles (the 7-role panel `architect, security, devex, ai_ml, pm, catfish, scope_steward` stays unchanged).

  Personas:
  - `code-reviewer.md` — Senior Staff-Engineer code-review persona. Five-axis assessment (correctness, readability, architecture, security, performance) with categorized findings (Critical / Important / Suggestion).
  - `security-auditor.md` — Security audit persona. Vulnerability scan + threat modeling, OWASP-aligned findings, severity classification.
  - `test-engineer.md` — Test-engineer persona. Coverage assessment, missing edge cases, test-quality review (DAMP / AAA / naming).

  These are **distinct from** the voter-pipeline experts at `agents/*.md` (repo root), which output structured JSON for `ConsensusEngine`. The new personas output human-readable narrative review and are consumed by the Agent tool's `subagent_type` dispatch (or direct invocation where `.claude/agents/` discovery is supported).

  `.claude/agents/README.md` documents the split and the related voter-pipeline counterparts.

  Pure-patch: no public-API impact, no behavior change to ConsensusEngine, no skills/index.yaml change.

- [#2393](https://github.com/williamzujkowski/nexus-agents/pull/2393) [`23c3fff`](https://github.com/williamzujkowski/nexus-agents/commit/23c3fffd674c3b80465731e737680c64aa25921a) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Tier D1 of epic [#2385](https://github.com/williamzujkowski/nexus-agents/issues/2385) — cross-pollinate addyosmani/agent-skills patterns into 2 existing skills:

  **`reviewing-code`** (was 104 → now 137 lines):
  - Five-axis review framework (Correctness / Readability / Architecture / Security / Performance)
  - Anti-rationalization table (6 rows: small-change excuse, tests-pass-so-correct, trust-the-author, CI-catches-everything, refactor-differently, author-decides)
  - Output categorization (Critical / Important / Suggestion) with discipline note ("if everything is Critical, nothing is")
  - References cross-link to security-checklist and testing-patterns
  - Cross-link to .claude/agents/code-reviewer.md persona

  **`documentation-management`** (was 305 → now 380 lines):
  - New ADR section: when to write, full template, lifecycle (PROPOSED → ACCEPTED → SUPERSEDED/DEPRECATED), when NOT to ADR
  - Anti-rationalization table for documentation (6 rows: code-self-documenting, document-later, next-release, comments-lie, nobody-reads, internal-API-doesn't-need)
  - New verification checklist for doc changes
  - Cross-link to docs/adr/ tree

  Both skills retain their existing content unchanged — purely additive cross-pollination. Pure-patch release.

- [#2394](https://github.com/williamzujkowski/nexus-agents/pull/2394) [`6ee3e47`](https://github.com/williamzujkowski/nexus-agents/commit/6ee3e47f4a8bce5d97bee304674ce271caf62837) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Tier D2 of epic [#2385](https://github.com/williamzujkowski/nexus-agents/issues/2385) — cross-pollinate addyosmani/agent-skills patterns into 3 existing skills:

  **`security-scanning`** — adds the Three-Tier Boundary System (Always Do / Ask First / Never Do) for hardening discipline, cross-referenced with our existing `.rules/untrusted-input.md` Tier 1-4 trust system. Adds an anti-rationalization table for security review (6 rows: internal-tool, real-users-later, library-handles-it, fix-audit-later, trust-third-party, dev-only-path).

  **`release`** — adds a comprehensive pre-launch checklist (Code quality / Security / Documentation / Pipeline health) gated before tagging. References `docs/ops/release-changeset-race.md` ([#2382](https://github.com/williamzujkowski/nexus-agents/issues/2382)) for the publish-race avoidance protocol that bit us 2026-05-04. Cross-link to `deprecation-and-migration` skill for releases that retire deprecated APIs.

  **`dev-pipeline`** — adds the spec-driven 4-phase gated workflow (SPECIFY → PLAN → TASKS → IMPLEMENT) with vote() gates between phases. Includes the assumption-surfacing pattern ("ASSUMPTIONS I'M MAKING: …" before producing the spec) which is the highest-leverage discipline from the upstream spec-driven-development skill. Cross-references our `run_dev_pipeline` MCP tool, `.rules/subagent-coordination.md`, and the new `context-engineering` skill.

  All edits purely additive — existing content unchanged. Pure-patch release.

- [#2395](https://github.com/williamzujkowski/nexus-agents/pull/2395) [`938c5ae`](https://github.com/williamzujkowski/nexus-agents/commit/938c5ae95353095c403c9bc3844237bc0ab250ad) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Tier D3 of epic [#2385](https://github.com/williamzujkowski/nexus-agents/issues/2385) — final cross-pollination batch. Enhances 3 existing skills with patterns from addyosmani/agent-skills (MIT, © 2025 Addy Osmani):

  **`requirements-gathering`** — adds Divergent → Convergent thinking (3-step ideation pass: diverge with sharpening questions + 2-3 variations, converge by clustering and stress-testing, sharpen-and-ship with explicit "Not Doing" list). Adds dependency-graph identification for multi-task plans (parallel-safe vs serial bottlenecks). Anti-rationalization table (5 rows: solution-not-problem, obvious-no-need-to-write, scope-as-we-go, "works"-criterion, ignore-dependencies).

  **`implement-feature`** — adds Thin vertical slices methodology (Implement → Test → Verify → Commit → Next slice cycle), the 100-line rule (stop and reconsider before writing more than ~100 lines without testing), anti-rationalization table for incremental implementation (5 rows).

  **`ui-ux-design`** — adds "Avoid the AI aesthetic" table calling out 8 common LLM-generated UI tells (gradient hero, lorem ipsum, oversized padding, stock card grids, shadow-heavy elevation, emoji icons, every-weight sans-serif, generic CTAs) with production-quality alternatives. Adds composition-over-configuration pattern with cross-link to api-and-interface-design. Anti-rationalization table (6 rows).

  All edits purely additive — existing content unchanged. Pure-patch release. Completes Tier D of the epic.

## 2.68.0

### Minor Changes

- [#2386](https://github.com/williamzujkowski/nexus-agents/pull/2386) [`8dc2ef4`](https://github.com/williamzujkowski/nexus-agents/commit/8dc2ef48647133e158ab346cf47dd1ed946ed6ec) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Add three new skills (Tier A1 of epic [#2385](https://github.com/williamzujkowski/nexus-agents/issues/2385), adapted from MIT-licensed [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills)):
  - `test-driven-development` — encodes the Red-Green-Refactor discipline already named in CLAUDE.md's prime directive but previously not surfaced as a discoverable skill. Includes the Prove-It Pattern for bug fixes, the test pyramid (~80/15/5), DAMP-over-DRY guidance, and an anti-rationalization table covering common excuses ("I'll write tests after," "too simple to test," etc.).
  - `code-simplification` — post-feature refactor discipline. Five principles (preserve behavior, follow conventions, clarity over cleverness, balance, scope to changes), Chesterton's Fence guidance for understanding before deleting, and red flags for misapplied simplification.
  - `deprecation-and-migration` — direct lessons learned from epic [#2368](https://github.com/williamzujkowski/nexus-agents/issues/2368) (v3.0 gate retirement, 2026-05-04). Pre-removal checklist, four-batch decomposition by blast radius (internal-only / typed-string-union / public-type / runtime), per-batch implementation steps, and post-merge verification including the publish-race check.

  Each skill follows the addyosmani template (when-to-trigger, process, anti-rationalization, red flags, verification checklist) and is annotated with nexus-agents canonical sources (CLAUDE.md prime directive, .rules/, docs/architecture/, docs/ops/) and our specific tooling (`pnpm`, `gh`, `consensus_vote`, ESLint gates).

  Skill count: 18 → 21. Governance regenerated: `skills/index.yaml`, CLAUDE.md skill table, AGENTS.md routing, plugin manifest.

## 2.67.0

### Minor Changes

- [#2380](https://github.com/williamzujkowski/nexus-agents/pull/2380) [`71700f0`](https://github.com/williamzujkowski/nexus-agents/commit/71700f07b7c94fdb215db5d90814b62b65b76078) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **Breaking (TypeScript-typed only)**: Rename `'tech_lead'` member of the `OrchestratorType` discriminator union to `'orchestrator'` ([#2375](https://github.com/williamzujkowski/nexus-agents/issues/2375), follow-up to epic [#2368](https://github.com/williamzujkowski/nexus-agents/issues/2368)).

  `OrchestratorType` is the orchestrator-implementation discriminator (LLM-based vs declarative-workflow vs browser-puppeteer vs custom) — separate from the `AgentRole` union that Batch B ([#2371](https://github.com/williamzujkowski/nexus-agents/issues/2371)) cleaned up. The `'tech_lead'` member was a stale reference to the original class name; the underlying class has been called `Orchestrator` since [#759](https://github.com/williamzujkowski/nexus-agents/issues/759).

  ```diff
  - type OrchestratorType = 'tech_lead' | 'puppeteer' | 'workflow' | 'custom';
  + type OrchestratorType = 'orchestrator' | 'puppeteer' | 'workflow' | 'custom';
  ```

  ```diff
  - factory.create('tech_lead');
  + factory.create('orchestrator');
  ```

  ```diff
  - if (adapter.type === 'tech_lead') { ... }
  + if (adapter.type === 'orchestrator') { ... }
  ```

  Runtime semantics unchanged: the `'orchestrator'` discriminator now produces the same orchestrator implementation that `'tech_lead'` produced before (the LLM-based decomposition orchestrator, wrapped via `OrchestratorAdapter`).

  Internal call sites (cli-server-tools.ts, mcp/tools/orchestrate.ts, mcp/tools/orchestrate-types.ts, orchestration/orchestrator-factory.ts, orchestration/orchestrator-adapters.ts) and tests (~25 fixtures) updated. `docs/interfaces/orchestrator.md` reference doc updated.

## 2.66.0

### Minor Changes

- [#2372](https://github.com/williamzujkowski/nexus-agents/pull/2372) [`6353f24`](https://github.com/williamzujkowski/nexus-agents/commit/6353f247d828e5d02dbcd785d2b22ae89c96f0e7) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **Breaking (TypeScript-typed only)**: Remove deprecated public-barrel types from the MCP entry points (Batch C of [#2368](https://github.com/williamzujkowski/nexus-agents/issues/2368), completes [#1986](https://github.com/williamzujkowski/nexus-agents/issues/1986) partial).

  Removed from `mcp/index.ts` and `mcp/tools/index.ts` public re-exports, and from `OrchestrateDeps`:
  - `ITechLead` — internal-only now (kept for the SICA adapter cascade); no longer re-exported on public barrels. Use `IOrchestrator` from `core/types/orchestrator.js` instead.
  - `IOrchestratorLegacy` — pure dead alias of `ITechLead`. Removed.
  - `IExpertFactory` (the one in `orchestrate-types.ts`) — pure dead interface, only typed an unused field. The unrelated `IExpertFactory` interfaces in `workflows/step-executor.ts` and `mcp/tools/create-expert.ts` are unaffected.
  - `IOrchestrateExpertFactory` aliased re-export — no longer needed.
  - `createMockTechLead` — public export removed; the mock task-executor logic is now an inlined private helper inside `createMockOrchestrator`.
  - `OrchestrateDeps.techLead` field — use `OrchestrateDeps.orchestrator` instead. The internal cli-server-tools.ts callsite now wraps the legacy `Orchestrator` agent class with `OrchestratorFactory.create('tech_lead')` to produce an `IOrchestrator`.
  - `OrchestrateDeps.expertFactory` field — never used. Removed along with the `IExpertFactory` interface that typed it.

  **Migration**:

  ```diff
  - import type { ITechLead, IOrchestratorLegacy } from 'nexus-agents';
  + import type { IOrchestrator } from 'nexus-agents';
  ```

  ```diff
  - registerOrchestrateTool(server, { techLead: myOrchestrator });
  + registerOrchestrateTool(server, { orchestrator: myOrchestrator });
  ```

  ```diff
  - import { createMockTechLead } from 'nexus-agents';
  - const mock = createMockTechLead();
  + import { createMockOrchestrator } from 'nexus-agents';
  + const mock = createMockOrchestrator();
  ```

  Bake duration: deprecated since [#595](https://github.com/williamzujkowski/nexus-agents/issues/595)/[#759](https://github.com/williamzujkowski/nexus-agents/issues/759) — multi-month under the `@deprecated` marker. Runtime semantics are unchanged; the cascade through `OrchestratorFactory.create('tech_lead')` produces identical behavior.

  The `useMockTechLead` config field name and `OrchestratorType = 'tech_lead' | …` discriminator are deliberately preserved for now — separate concerns, separate follow-up PRs.

- [#2378](https://github.com/williamzujkowski/nexus-agents/pull/2378) [`15aa1b8`](https://github.com/williamzujkowski/nexus-agents/commit/15aa1b81476e865ed73c3f2a412952d3f75fe17a) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **Breaking (TypeScript-typed only)**: Remove the deprecated `agents/experts/task-analyzer.ts` module from the public surface ([#2374](https://github.com/williamzujkowski/nexus-agents/issues/2374), follow-up to epic [#2368](https://github.com/williamzujkowski/nexus-agents/issues/2368)).

  Removed exports from `src/agents/index.ts` and `src/exports/agents.ts` (publicly reachable):
  - `analyzeTask(task) → Result<TaskAnalysisResult, AnalysisError>` — keyword-based heuristic classifier
  - `TaskDomain` enum (`'code'`, `'architecture'`, `'security'`, `'documentation'`, `'testing'`, `'devops'`)
  - `TaskComplexity` enum (`'low'`, `'medium'`, `'high'`)
  - `AnalysisError` class — note: a different `AnalysisError` from `failure-analyzer-types.js` is still exported via `orchestration/index.ts`; the name collision was always present
  - `TaskAnalysisResult` type
  - `TaskAnalysisResultSchema` Zod schema

  **Migration**: use `SharedTaskAnalyzer` from `core/task-analysis/` (canonical path per ADR-0004 / Issue [#574](https://github.com/williamzujkowski/nexus-agents/issues/574)). Different output shape — `TaskTypeCategory` enum and `ComplexityLevel` (`'simple' | 'moderate' | 'complex' | 'expert'`) — but the underlying analysis is more capable.

  ```diff
  - import { analyzeTask } from 'nexus-agents';
  - const result = analyzeTask(task);
  - if (result.ok) console.log(result.value.domain);
  + import { createSharedTaskAnalyzer } from 'nexus-agents';
  + const analyzer = createSharedTaskAnalyzer();
  + const analysis = await analyzer.analyze(task);
  + console.log(analysis.taskType);
  ```

  The deprecated module had been marked `@deprecated Use SharedTaskAnalyzer` since [#574](https://github.com/williamzujkowski/nexus-agents/issues/574) — multi-month bake. Two e2e tests updated: `agent-expert-system.e2e.test.ts` 'Task Analysis' describe block removed (functionality now covered by SharedTaskAnalyzer's own tests in `core/task-analysis/`); `agent-skill-library.e2e.test.ts` performance test migrated to use `analyzer.analyze()`.

### Patch Changes

- [#2377](https://github.com/williamzujkowski/nexus-agents/pull/2377) [`f2f4336`](https://github.com/williamzujkowski/nexus-agents/commit/f2f433695a540ef6c650b68b94e9e47d822d76b2) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Remove the deprecated `BaseAgent.setState()` method ([#2373](https://github.com/williamzujkowski/nexus-agents/issues/2373), follow-up to [#2368](https://github.com/williamzujkowski/nexus-agents/issues/2368)/[#1986](https://github.com/williamzujkowski/nexus-agents/issues/1986)).

  The protected `setState` method was marked `@deprecated Use stateMachine.transition() directly`. It is removed; callers should use `stateMachine.transition(event)` for known events, or the renamed helper `transitionToState({ stateMachine, logger, newState })` when only the target state is known.

  `base-agent-state-helpers.ts` `performLegacyStateTransition` is renamed to `transitionToState` (drops the deprecation marker, function preserved with the same `mapStatesToEvent` mapping logic). The 2 internal callers in `BaseAgent.complete()` and the test helper are updated accordingly.

  Patch-level break: `setState` was a `protected` method — internal-only. No public consumer impact.

## 2.65.0

### Minor Changes

- [#2371](https://github.com/williamzujkowski/nexus-agents/pull/2371) [`d614436`](https://github.com/williamzujkowski/nexus-agents/commit/d614436ff0e2e88c93f85a7b1658cea81c986a2a) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **Breaking (TypeScript-typed only)**: Remove the deprecated `'tech_lead'` member from the `AgentRole` union (Batch B of [#2368](https://github.com/williamzujkowski/nexus-agents/issues/2368), completes [#1986](https://github.com/williamzujkowski/nexus-agents/issues/1986) partial).

  The `'tech_lead'` role string has been a documented alias of `'orchestrator'` since [#595](https://github.com/williamzujkowski/nexus-agents/issues/595)/[#759](https://github.com/williamzujkowski/nexus-agents/issues/759) (multi-month bake). It is removed from:
  - `AgentRole` union in `core/types/agent.ts`
  - `OrchestratorRole` derived type (now `Extract<AgentRole, 'orchestrator'>`)
  - All `z.enum` role schemas: `agent-schemas.ts`, `workflows/template-types.ts`, `workflows/workflow-types.ts`, `workflows/aflow/aflow-types.ts`, `workflows/aflow/evaluation-types.ts`, `agents/tech-lead-types.ts` (2 schemas), `agents/collaboration/collaboration-schemas.ts`, `agents/experts/expert-config.ts`, `agents/skills/skill-loader-types.ts`, `agents/skills/skill-security-schemas.ts`
  - `EXPERT_CAPABILITIES` map (`tech-lead-types.ts`, `experts/expert-types.ts`)
  - `MEMORY_BY_ROLE` map (`context/memory-types.ts`)
  - `DEFAULT_RBAC.allowedRoles` (`skills/skill-security-types.ts`)
  - `DEFAULT_ROLE_SKILLS` (`skills/skill-loader-types.ts`)
  - `Orchestrator` class — now self-identifies as `role: 'orchestrator'` (was `'tech_lead'`) with default `id: 'orchestrator'`

  **Migration**: replace `'tech_lead'` with `'orchestrator'` everywhere it's used as a role name. Runtime behavior is unchanged — both names mapped to identical capability sets.

  **Out of scope (separate follow-up)**: the unrelated `OrchestratorType = 'tech_lead' | 'workflow' | 'puppeteer' | 'custom'` discriminator union in `core/types/orchestrator.ts` (an orchestrator-implementation discriminator, not an agent role) keeps `'tech_lead'` for now. Will rename in a focused PR.

### Patch Changes

- [#2369](https://github.com/williamzujkowski/nexus-agents/pull/2369) [`524e485`](https://github.com/williamzujkowski/nexus-agents/commit/524e485780b2772c0487036ab3144d3062f8c29e) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Remove internal-only `@deprecated` markers (Batch A of [#2368](https://github.com/williamzujkowski/nexus-agents/issues/2368)). No public-API impact at runtime.
  - `StateManagerConfig.charsPerToken` — already ignored at runtime; consumers should use `getTokenEstimator()` from core.
  - `TaskConstraints.outputFormat` and `TaskConstraints.allowedTools` — fields existed in both the Zod schema (`agent-schemas.ts`) and the TS interface (`core/types/agent.ts`) but were never enforced. Use prompt-level structured output and policy firewall rules instead.
  - 6 `Swarm*` type aliases in `agents/observability/orchestration-observer-types.ts` (`SwarmStats`, `SwarmObserverEvent`, `SwarmObserverListener`, `SwarmObserverConfig`, `SwarmObserverOptions`, `ISwarmObserver`) plus the `SwarmObserverConfigSchema` const alias. None were re-exported on the public `src/exports/observability.ts` barrel; canonical `OrchestrationObserver*` names remain.
  - `cli-adapters/task-analyzer.ts` deprecated module + its keyword constants. Internal-only; not in any public barrel. Use `SharedTaskAnalyzer` from `core/task-analysis/`.
  - Dead barrel `agents/observability-exports.ts` (no importers anywhere).

  Two known-deferred surfaces stay until Batch A2 / B / C: `BaseAgent.setState` (8 internal callers + state-event mapping helper), and `agents/experts/task-analyzer.ts` (publicly exposed via `analyzeTask` on the agents barrel — handled in the breaking-minor batch).

## 2.64.0

### Minor Changes

- [#2358](https://github.com/williamzujkowski/nexus-agents/pull/2358) [`a5a29d9`](https://github.com/williamzujkowski/nexus-agents/commit/a5a29d9caa28874f6acc3d8d9f99b97be0f2627e) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - New MCP tool: `survey_oss_landscape` — transient OSS project search ([#2295](https://github.com/williamzujkowski/nexus-agents/issues/2295), child of [#2293](https://github.com/williamzujkowski/nexus-agents/issues/2293)).

  Returns a ranked list of GitHub repositories matching a free-text query, with license (SPDX), last-commit, star-count, language, and one-line description. **Does NOT persist** to the research registry — for one-off engineering decisions like "what tools exist in this space?" or "should we adopt cargo-nextest?". Use `research_add_source` if you want to add an entry to the registry.

  SSRF-safe by construction: the user-supplied input is a search query string, not a URL. Outbound URL is constructed from a fixed base (`https://api.github.com/search/repositories`); an attacker cannot make us fetch arbitrary endpoints.

  v1 is GitHub-only. Codeberg + GitLab providers can be added when there's demand. Authenticated calls (5000 req/hr) are used when `GITHUB_TOKEN` is available; otherwise falls back to the unauthenticated 60 req/hr quota.

  Tool count: 34 → 35.

- [#2363](https://github.com/williamzujkowski/nexus-agents/pull/2363) [`0b94649`](https://github.com/williamzujkowski/nexus-agents/commit/0b946493a5bf600bbe090c66aa6ce9ca3bf9c983) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - New MCP tool: `vendor_publishing_audit` — vendor signing-infra lookup ([#2296](https://github.com/williamzujkowski/nexus-agents/issues/2296), child of [#2293](https://github.com/williamzujkowski/nexus-agents/issues/2293)).

  Given a vendor identifier (`ubuntu`, `debian`, `fedora`), returns the vendor's published-artifact signing infrastructure: GPG key fingerprints, SHA256SUMS URL pattern, signature shape (clearsigned vs detached vs detached-on-iso), release cadence, key rotation notes, and the authoritative vendor doc citation. Static lookup against a curated seed dataset; the vendor doc URL is the single source of truth.

  Use case: aegis-boot's image catalog needs to know HOW to verify each vendor's published images. v1 covers Ubuntu, Debian, Fedora — the seed shape allows additional vendors to land as data-only PRs.

  Tool count: 35 → 36. Auto-sync via `inject-governance.ts` propagated to all 7 surfaces.

- [#2364](https://github.com/williamzujkowski/nexus-agents/pull/2364) [`dbfe6e4`](https://github.com/williamzujkowski/nexus-agents/commit/dbfe6e409168e4a58eb898bd53fc4b0cc0e8b003) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - New MCP tool: `compare_data_feeds` — diff two YAML/JSON feeds along coverage and per-field axes ([#2297](https://github.com/williamzujkowski/nexus-agents/issues/2297), child of [#2293](https://github.com/williamzujkowski/nexus-agents/issues/2293)).

  Given two file paths to YAML or JSON feeds, returns a structured diff: which entries exist in A, B, both (membership diff), plus optional field-level diffs across matched entries. Use case: aegis-boot's catalog cross-checks against upstream feeds (e.g., netboot.xyz/endpoints.yml) to surface "what's new in A?" or "what fields differ between A and B for entries that exist in both?".

  **v1 takes file paths only.** URL-fetch mode is deferred — fetching arbitrary user-supplied URLs needs an SSRF design pass. For now, users `curl` the remote feed to a local file and pass the path. Path traversal is guarded (must be within cwd subtree).

  Tool count: 36 → 37. Auto-sync via `inject-governance.ts` propagated to all 7 surfaces.

### Patch Changes

- [#2362](https://github.com/williamzujkowski/nexus-agents/pull/2362) [`8b09163`](https://github.com/williamzujkowski/nexus-agents/commit/8b09163f0802b8478668a40de9d71dbb1e5f9936) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Auto-sync MCP tool count + tools[] across all release surfaces ([#2295](https://github.com/williamzujkowski/nexus-agents/issues/2295) follow-up).

  Adding a new MCP tool in [#2358](https://github.com/williamzujkowski/nexus-agents/issues/2358) (`survey_oss_landscape`) required manual edits in 7 places — `server.json` (tools[] array + description prose), `website/src/data/site-data.ts` (`MCP_TOOL_COUNT`), `docs/design/components.md` (3 inline mentions), and `README.md` (architecture diagram + capabilities table). The `Docs Content Drift` CI gate ([#2107](https://github.com/williamzujkowski/nexus-agents/issues/2107)) caught the drift but didn't auto-fix.

  Extended `scripts/inject-governance.ts` to write all of these from the authoritative `STANDALONE_TOOLS` list:
  - `syncServerJson` now writes `tools[]` (was: only version + description count).
  - New `syncWebsiteToolCount` updates `MCP_TOOL_COUNT` in site-data.ts.
  - New `syncDesignDocsToolCount` updates the 3 mentions in components.md.
  - New `syncReadmeToolCount` updates the 2 mentions in README.md.

  Test files (`tool-annotations.test.ts`, `index.test.ts`, `cli-server-tools.test.ts`) keep their hardcoded counts intentionally — they're contract gates that caught the original drift in PR [#2358](https://github.com/williamzujkowski/nexus-agents/issues/2358) and shouldn't become tautologies.

## 2.63.6

### Patch Changes

- [#2350](https://github.com/williamzujkowski/nexus-agents/pull/2350) [`0d9a785`](https://github.com/williamzujkowski/nexus-agents/commit/0d9a7859ce0290f878764f711be3c18aa4a69dfb) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Add `outputSchema` to `research_query` + `research_add` MCP tools ([#2340](https://github.com/williamzujkowski/nexus-agents/issues/2340) batch 1).

  Per the audit ([#2337](https://github.com/williamzujkowski/nexus-agents/issues/2337)), 11 MCP tools (research*\*, memory*\*, plus a few others) lacked `outputSchema` while `consensus_vote` already had `CONSENSUS_VOTE_OUTPUT_SCHEMA`. MCP clients that respect output schemas (Claude Desktop, MCP Inspector, structured-pipeline frameworks) couldn't validate response shapes for the unschemaed tools.

  This PR migrates the first two:
  - `research_query` — envelope schema `{ action: string, success: boolean, data: unknown }`. Inner `data` is `z.unknown()` because the four action variants (status/overlap/stats/search) return different shapes; per-action schemas deferred.
  - `research_add` — concrete schema `{ success, paperId?, title?, message, dryRun? }` matching `executeResearchAdd`'s actual return type.

  Both handlers switched from `toolSuccess(JSON.stringify(...))` to `toolSuccessStructured(...)` so the SDK has `structuredContent` to validate against the schema.

  Remaining tools tracked in [#2340](https://github.com/williamzujkowski/nexus-agents/issues/2340) for follow-up batches.

- [#2352](https://github.com/williamzujkowski/nexus-agents/pull/2352) [`a05773d`](https://github.com/williamzujkowski/nexus-agents/commit/a05773da819aab35c218cb0f99c2c9f27e6d0327) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Add `outputSchema` to `memory_query` + `memory_stats` + `memory_write` MCP tools ([#2340](https://github.com/williamzujkowski/nexus-agents/issues/2340) batch 2).

  Continues [#2340](https://github.com/williamzujkowski/nexus-agents/issues/2340). Each handler switched from `toolSuccess(JSON.stringify(...))` to `toolSuccessStructured(...)` so the SDK validates `structuredContent` against the schema. Concrete schemas modeled from each handler's actual return shape:
  - `memory_query` — `{ query, expandedQuery?, results: unknown[], count, source }`
  - `memory_stats` — `{ backends: { session, belief, typed, mobimem, decay (booleans) }, session, belief, typed (nullable), mobimem (nullable), decay, collectedAt }`
  - `memory_write` — `{ success, backend, key, deduplicated?, error? }`

- [#2353](https://github.com/williamzujkowski/nexus-agents/pull/2353) [`34ceda6`](https://github.com/williamzujkowski/nexus-agents/commit/34ceda6e003f97f66962835ec6ccf3c7b75568e4) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Add `outputSchema` to remaining 5 research\_\* MCP tools ([#2340](https://github.com/williamzujkowski/nexus-agents/issues/2340) batch 3 — closes the issue).

  Final batch: `research_add_source`, `research_analyze`, `research_catalog_review`, `research_discover`, `research_synthesize`. Each handler switched from `toolSuccess(JSON.stringify(...))` to `toolSuccessStructured(...)` so the SDK validates `structuredContent` against the schema.

  Permissive shapes throughout this batch — the response inner content varies per action/source/cluster, and CI runs hit partial-init paths where some fields are absent. Top-level field names are typed; nested data uses `z.unknown()`.

  After this PR all 11 tools called out in the audit have `outputSchema`. The two remaining unschemaed tools — `weather_report` and `repo_analyze` — were intentionally deferred upstream (per the existing `outputSchema deferred for weather_report due to complex dynamic shape` note).

- [#2355](https://github.com/williamzujkowski/nexus-agents/pull/2355) [`dc81450`](https://github.com/williamzujkowski/nexus-agents/commit/dc814501478df94c4633991e20f8703c7c58596a) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - `run_pipeline` and `run_dev_pipeline` no longer block libuv on file reads ([#2354](https://github.com/williamzujkowski/nexus-agents/issues/2354)).

  `resolveTask()` (pipeline-tool.ts) and `resolveTaskInput()` (dev-pipeline-tool.ts) used `fs.readFileSync` inside async MCP request handlers. For multi-megabyte spec/plan files this stalled all in-flight MCP requests for the duration of the read. Both functions are now `async` and use `fs.promises.readFile`. Existing `ENOENT` error message is preserved (caught and rethrown as the same "Spec file not found" / "Plan file not found" string).

## 2.63.5

### Patch Changes

- [#2344](https://github.com/williamzujkowski/nexus-agents/pull/2344) [`cc8f00a`](https://github.com/williamzujkowski/nexus-agents/commit/cc8f00a862f49569a2a9177f7f295885c4efa41e) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Fix `BuiltInExpertTypeSchema` missing `'qa'` literal ([#2338](https://github.com/williamzujkowski/nexus-agents/issues/2338)).

  The `BuiltInExpertType` type union (`expert-config.ts:67–80`) declared 12 valid expert types including `qa`, but the corresponding Zod enum schema (`expert-config.ts:159–171`) only listed 11 — `qa` was omitted. `BuiltInExpertTypeSchema.parse('qa')` threw at runtime even though TypeScript accepted it as a valid type. Added `qa` to the enum and a contract test that walks every literal in `BuiltInExpertType` through the schema so this drift is caught at CI time.

- [#2346](https://github.com/williamzujkowski/nexus-agents/pull/2346) [`78b4461`](https://github.com/williamzujkowski/nexus-agents/commit/78b4461116f3828e42913913247dffee91b1488d) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Standardize MCP tool registration on `server.registerTool()` ([#2339](https://github.com/williamzujkowski/nexus-agents/issues/2339)).

  `run_dev_pipeline` and `run_pipeline` were the only two of 34 MCP tools still using the older `server.tool(name, schema, handler)` API. The other 32 use `server.registerTool(name, { description, inputSchema, ... }, handler)`. Migrated both so MCP clients see consistent metadata for every tool, and the `eslint-disable @typescript-eslint/no-deprecated` workarounds are gone.

  No client-visible behavior change beyond the tool descriptions now being available in MCP listings (they previously weren't).

- [#2347](https://github.com/williamzujkowski/nexus-agents/pull/2347) [`2710052`](https://github.com/williamzujkowski/nexus-agents/commit/271005229a4036241494081c055e5647e590085c) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Fix `DEFAULT_EXPERTS` missing 3 of 12 built-in expert types ([#2341](https://github.com/williamzujkowski/nexus-agents/issues/2341)).

  `BuiltInExpertType` declared 12 valid types (code, architecture, security, documentation, testing, devops, research, pm, ux, infrastructure, qa, data-visualization), but `DEFAULT_EXPERTS` only listed 9. Calls to `createDefaultRegistry()` silently omitted research, qa, and data-visualization experts. Added the three missing entries plus a contract test that walks every `BuiltInExpertType` literal and asserts a matching `DEFAULT_EXPERTS` row exists.

- [#2348](https://github.com/williamzujkowski/nexus-agents/pull/2348) [`cabeed9`](https://github.com/williamzujkowski/nexus-agents/commit/cabeed9c38badf8605c33eadf0fb3927b596552d) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Add `findModelsByCli(cliName)` helper to `config/model-capabilities.ts` ([#2342](https://github.com/williamzujkowski/nexus-agents/issues/2342)).

  The audit ([#2337](https://github.com/williamzujkowski/nexus-agents/issues/2337)) flagged `buildClaudeAliasMap()` and `buildOpenCodeAliasMap()` as duplicated. On closer inspection the two builders have meaningfully different value-derivations (claude maps to `cliAlias`; opencode maps to `cliModelName`'s `provider/model` form), so a single shared builder would have forced a bad abstraction at n=2.

  The honest extraction is the **filter step**, which both builders share: "iterate models for a given cliName." This is now `findModelsByCli(cliName)`, mirroring the existing `findModelsByProvider`/`findModelsByOutputModality`/etc. helpers in the same file. Both adapters use it; each retains its CLI-specific value logic.

- [#2349](https://github.com/williamzujkowski/nexus-agents/pull/2349) [`423fd34`](https://github.com/williamzujkowski/nexus-agents/commit/423fd34574d7af9ca80c80ae7e5ca20d6fee728f) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Extract `buildBaseTaskContract` shared by `v2-orchestrate` and `v2-delegate` ([#2343](https://github.com/williamzujkowski/nexus-agents/issues/2343)).

  Both V2 MCP entrypoints had near-identical converters: the same id template, same `'approved'` status, same empty-default constraints/capabilities/capability-gaps/artifacts, same timestamps. Only the id-prefix, analysis summary, and metadata differ.

  Extracted the shared scaffolding to `pipeline/task-contract-builders.ts`. Each call site now supplies only the fields that genuinely differ. Adding a new field to `TaskContractSchema` requires updating one place rather than two.

  No behavior change. 32 v2 tests still pass; 7 new builder tests added.

## 2.63.4

### Patch Changes

- [#2335](https://github.com/williamzujkowski/nexus-agents/pull/2335) [`c19e950`](https://github.com/williamzujkowski/nexus-agents/commit/c19e9508d97221c92f2c67ec1b256ed4a22c30b4) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - README accuracy: hash-chained audit storage is shipped, not "in flight" ([#2289](https://github.com/williamzujkowski/nexus-agents/issues/2289) follow-up to second-pass audit).
  - The `verify_audit_chain` MCP tool wraps `verifyChain()` over `FileAuditStorage`, both shipped since 2026-04-29 (PR [#2289](https://github.com/williamzujkowski/nexus-agents/issues/2289)). README's two "(in flight)" qualifiers were stale; now describe the storage as available and point at the verification tool.
  - Capability table's `pr_review` row was inconsistent with the lead bullet: PR [#2332](https://github.com/williamzujkowski/nexus-agents/issues/2332) added the 50% raw false-positive rate + n=10 + source link to the bullet but missed the table row. Both surfaces now agree.

## 2.63.3

### Patch Changes

- [#2333](https://github.com/williamzujkowski/nexus-agents/pull/2333) [`9a7f540`](https://github.com/williamzujkowski/nexus-agents/commit/9a7f540a1a7b0ff611afae63370055aebd2ebd92) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Replace the dead Rust-targeted SBOM flow with a Node-native CycloneDX SBOM ([#2326](https://github.com/williamzujkowski/nexus-agents/issues/2326) follow-up).

  The release workflow's SBOM steps had been silently skipping every release since 2.29.1 because they were gated on `crates/iso-parser/Cargo.toml`, a path that has never existed in this repo (copy-paste from a Rust project). The same root cause was also dropping a `cargo-audit` and `cargo-deny` job from `ci.yml` on every PR run.

  Changes:
  - `.github/workflows/release.yml` now generates a CycloneDX 1.6 SBOM via `npx @cyclonedx/cdxgen@12.3.1` against `pnpm-lock.yaml`. The output (`sbom.cdx.json`) is uploaded to the GitHub Release and attested via `actions/attest-build-provenance`. SPDX is dropped — CycloneDX is the dominant format for the npm ecosystem.
  - `.github/workflows/release.yml` Rust toolchain install + `cargo install cargo-sbom` removed (~45s saved per release).
  - `.github/workflows/ci.yml` `cargo-audit` and `cargo-deny` jobs removed (~90s saved per CI run; both were no-ops).
  - npm package provenance attestation (`NPM_CONFIG_PROVENANCE: true` + the `Attest npm package` step) is unchanged.

## 2.63.2

### Patch Changes

- [#2322](https://github.com/williamzujkowski/nexus-agents/pull/2322) [`99ed0f8`](https://github.com/williamzujkowski/nexus-agents/commit/99ed0f878f126fbd8f377c8a950cf5238db83a17) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Stop recommending `simulateVotes: true` as a fallback when adapters are unavailable, and add runtime guards so simulated runs cannot silently leak into real systems ([#2317](https://github.com/williamzujkowski/nexus-agents/issues/2317), [#2318](https://github.com/williamzujkowski/nexus-agents/issues/2318), [#2319](https://github.com/williamzujkowski/nexus-agents/issues/2319)).
  - `consensus_vote`, `run_dev_pipeline`, and `run_pipeline` now emit a one-shot stderr warning when `simulateVotes: true` is used outside a test runner.
  - `recordVoteSuccess` skips memory + outcome writes when every vote is from simulation, in addition to the existing per-vote outcome filter.
  - Zod descriptions for `simulateVotes` are now `TESTS ONLY — random output, must not be used for real decisions`.

  Documentation drift fixes:
  - Workflows table in `CLAUDE.md` is now generated by `scripts/inject-governance.ts` from `skills/index.yaml` ([#2320](https://github.com/williamzujkowski/nexus-agents/issues/2320)). Adding/removing a skill cannot drift the table.
  - Canonical Paths table now uses full `packages/nexus-agents/src/...` paths and is validated by `governance:check` so a row pointing at a missing file fails CI ([#2321](https://github.com/williamzujkowski/nexus-agents/issues/2321)).

- [#2332](https://github.com/williamzujkowski/nexus-agents/pull/2332) [`04856b1`](https://github.com/williamzujkowski/nexus-agents/commit/04856b1bfeadc38a6eaa13a1ce1da4dfce7823b2) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Release-readiness doc audit fixes ([#2326](https://github.com/williamzujkowski/nexus-agents/issues/2326)).
  - `server.json` is now auto-synced by `scripts/inject-governance.ts` — top-level `version`, every `packages[*].version`, and the `description`'s "N MCP tools" count all track `package.json` and the canonical tool registry. Drifted to 2.53.0 (10 minor versions stale) before the sync; `governance:check` now fails on regression.
  - Root `CHANGELOG.md` replaced with a one-line redirect to `packages/nexus-agents/CHANGELOG.md` (the changesets-managed source of truth).
  - `README.md` updated: removed the false "Devin / Factory adapters in flight" claim, reframed the pr_review benchmark line with the source citation and headline numbers (100% bug-catch, 50% raw FP, n=10), clarified `consensus_vote` default panel size (7 voters; pr_review uses 5), replaced "9-stage CompositeRouter" with "multi-stage".
  - `packages/nexus-agents/README.md` and `llms-install.md` no longer hardcode tool/expert/stage counts that drift; they reference `docs/ENTRYPOINTS.md` for the canonical list.

## 2.63.1

### Patch Changes

- [#2315](https://github.com/williamzujkowski/nexus-agents/pull/2315) [`2ec1bc8`](https://github.com/williamzujkowski/nexus-agents/commit/2ec1bc8db2aa5a7156e55007ce61360ca25dddb5) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - fix(cli): NEXUS_DATA_DIR leak in learning/sessions/tasks/beliefs/overlay paths ([#2314](https://github.com/williamzujkowski/nexus-agents/issues/2314))

  Discovered while dogfooding v2.63.0 portable install. The v2.60.0 ([#2302](https://github.com/williamzujkowski/nexus-agents/issues/2302)) refactor migrated 11 callsites to the `getNexusDataDir()` resolver but missed several others — most critically, `config/learning-persistence.ts` exported its paths as **module-level consts evaluated at import time**, so setting `NEXUS_DATA_DIR` from the env had no effect on outcome/rule storage.

  Symptom: a fresh portable workspace's `nexus-agents doctor` reports the host's outcome history (e.g., "Outcomes: 10033 recorded" on a brand-new dir).

  Fix:
  - Convert `LEARNING_DIR` / `OUTCOMES_FILE` / `RULES_FILE` from module-level consts to getter functions (`getLearningDir()`, `getOutcomesFile()`, `getRulesFile()`) that call `getNexusDataDir()` at call time
  - Update all callers (cli/doctor, orchestration/outcomes, pipeline/agent-executor, learning/strategy-distiller-persistence)
  - Remove the deprecated const exports — keeping them as stubs would preserve the bug
  - Migrate the remaining 6 missed callsites (config-loader, capability-overlay, session-journal, structured-task-state, belief-memory-persistence, orchestrate-reflection) from `homedir()` to `getNexusDataDir()` / `nexusDataPath()`

  After the fix, a fresh portable workspace correctly reports 0 outcomes / empty learning dir / clean session log. Workspace-state isolation — one of the explicit goals of the [#2301](https://github.com/williamzujkowski/nexus-agents/issues/2301) epic — now works as advertised.

  Patch release because this is a fix to v2.60.0–v2.63.0 leakage, not new functionality.

## 2.63.0

### Minor Changes

- [#2312](https://github.com/williamzujkowski/nexus-agents/pull/2312) [`f39b54e`](https://github.com/williamzujkowski/nexus-agents/commit/f39b54ec865e2af0cc5e5fec8c5070c135ca08b4) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(cli): `init --portable --install` / `--uninstall` for fully workspace-local nexus-agents ([#2311](https://github.com/williamzujkowski/nexus-agents/issues/2311), child of [#2301](https://github.com/williamzujkowski/nexus-agents/issues/2301))

  Closes the binary half of "install everything inside one folder at the workspace level." Pairs with v2.60.0's `NEXUS_DATA_DIR` (state) and v2.62.0's `--mcp-config` (harness wiring) — this release adds the binary itself.

  ```bash
  # Full workspace-local install
  nexus-agents init --portable --install --mcp-config
  # Creates ./.nexus-agents/{cli,bin,memory,audit,...} + ./.mcp.json
  # .mcp.json's command points at .nexus-agents/bin/nexus-agents (absolute path)

  # Tear down
  nexus-agents init --portable --uninstall
  # Removes cli/ and bin/, preserves data subdirs
  ```

  Implementation:
  - `src/cli/portable-installer.ts` — `installPortable()` runs `npm install nexus-agents@<version>` into `.nexus-agents/cli/`. Uninstall removes `cli/` and `bin/`, preserves `memory/`/`audit/`/etc.
  - `src/cli/bin-shim.ts` — emits a Node script at `.nexus-agents/bin/nexus-agents` that imports the local CLI entry; `chmod +x`; idempotent.
  - Wired into `init-portable.ts`: `initPortable()` is now async (necessary for the npm spawn).
  - `mcp-config-emitter.ts` accepts an optional `commandPath` — when present (i.e. when `--install` ran first), the emitted `.mcp.json` points the server entry at the absolute shim path instead of bare `nexus-agents`.

  Contrarian-narrowed scope ([#2311](https://github.com/williamzujkowski/nexus-agents/issues/2311) vote, 5/1):
  - **Version pin = current version.** The contrarian flagged that `npm install nexus-agents` (no version) silently pulls `latest`, which mismatches the executing CLI. Adopted: default install pins to the running `VERSION` constant. Refuses to install if `VERSION === 'dev'` (unpublished).
  - **Mutual exclusion:** `--install` and `--uninstall` cannot be combined.
  - **Network failure cleanup:** if `npm install` fails, the partially-created `.nexus-agents/cli/` is removed before returning the error.
  - **Subprocess safety:** uses `execFile` (not `exec`) with literal package name and version-as-arg — no shell interpolation, no command-injection surface.
  - **Disk usage warning:** post-install message states the install is sizable (~390MB).

  Out of scope (deferred to follow-up children of [#2301](https://github.com/williamzujkowski/nexus-agents/issues/2301)):
  - `--update` flag (Child #3b) — adds version-tracking complexity (npm registry query, lockfile drift, bin shim regen on entry-point changes).
  - Windows `.cmd` wrapper for the bin shim (Child #3c if needed) — Unix shebang only this iteration.
  - Pinning a specific version via `--version=X.Y.Z` flag.
  - `Dockerfile.sandbox` integration with the portable install path.

  `init --portable` flag count: 6 — `--force`, `--dry-run`, `--gitignore`, `--mcp-config`, `--install`, `--uninstall`. The first 4 ship state + config; `--install`/`--uninstall` ship the binary.

## 2.62.0

### Minor Changes

- [#2309](https://github.com/williamzujkowski/nexus-agents/pull/2309) [`4b7dcb2`](https://github.com/williamzujkowski/nexus-agents/commit/4b7dcb2ea81dd07f0414e52de4b792f9ca6a61c2) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(cli): `init --portable --mcp-config` flag for workspace-local MCP wiring ([#2308](https://github.com/williamzujkowski/nexus-agents/issues/2308), child of [#2301](https://github.com/williamzujkowski/nexus-agents/issues/2301))

  Adds an opt-in `--mcp-config` flag on `nexus-agents init --portable` that emits a Claude Code repo-local `.mcp.json` at the workspace root. The server entry pins `NEXUS_DATA_DIR` to the absolute path of the workspace's `.nexus-agents/` directory so the harness uses workspace-local state.

  ```bash
  nexus-agents init --portable --mcp-config
  # → creates ./.nexus-agents/, writes ./.mcp.json, auto-gitignores .mcp.json
  ```

  Behavior:
  - Idempotent: matching entry is a no-op success
  - Merges with existing `.mcp.json` (preserves other server entries)
  - Refuses to overwrite differing `nexus-agents` entry without `--force`
  - ALWAYS auto-appends `.mcp.json` to `.gitignore` when a `.git` dir is present (per the contrarian-narrowed scope review — absolute paths in committed config break for collaborators)
  - Post-install message includes a "per-machine; do not commit" caveat when written

  **Bug fix bundled:** the v2.61.0 `init --portable` ship also exposes a wiring bug — `--portable` and `--gitignore` flags were declared in the parser config but never passed through `buildOptions()`, so they were always undefined at runtime. This release adds `buildInitOptions()` and routes all three flags (`portable`, `gitignore`, `mcp-config`) through it.

  Approved scope per consensus_vote 5/1 (contrarian-narrowed). Other harness formats (OpenCode, Codex) and portable npm install path remain deferred to separate children of [#2301](https://github.com/williamzujkowski/nexus-agents/issues/2301).

## 2.61.0

### Minor Changes

- [#2306](https://github.com/williamzujkowski/nexus-agents/pull/2306) [`39ca65b`](https://github.com/williamzujkowski/nexus-agents/commit/39ca65bd8f904654ae5f6a0eb0009a46e7a07af6) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(cli): `nexus-agents init --portable` command ([#2305](https://github.com/williamzujkowski/nexus-agents/issues/2305), child of [#2301](https://github.com/williamzujkowski/nexus-agents/issues/2301))

  Bootstraps a workspace-local `.nexus-agents/` data directory so docker sandboxes, devcontainers, and CI environments can self-contain runtime state without `~/.nexus-agents` pollution.

  ```
  nexus-agents init --portable                # creates ./.nexus-agents/
  nexus-agents init --portable ./.nexus       # custom path
  nexus-agents init --portable --force        # overwrite non-empty target
  nexus-agents init --portable --dry-run      # preview without writing
  nexus-agents init --portable --gitignore    # auto-append to .gitignore (only if .git exists)
  ```

  Idempotent: re-running on an already-initialized directory is a no-op success. Refuses to scaffold in a non-empty non-nexus directory unless `--force`. Restricts `auth/` subdir to mode 0o700.

  Pairs with `NEXUS_DATA_DIR` ([#2302](https://github.com/williamzujkowski/nexus-agents/issues/2302)): `init --portable` scaffolds the directory, then prints the `export NEXUS_DATA_DIR=...` command for the user to activate it. No auto-loading, no walk-up discovery — those remain explicit-deferred per the security design pass on [#2301](https://github.com/williamzujkowski/nexus-agents/issues/2301).

  Approved scope per consensus_vote 5/1 (contrarian-narrowed): contrarian flagged risk that init might auto-load configs from CWD ancestors, but this implementation creates only — auto-detection is still deferred to the walk-up child.

## 2.60.0

### Minor Changes

- [#2303](https://github.com/williamzujkowski/nexus-agents/pull/2303) [`7518af3`](https://github.com/williamzujkowski/nexus-agents/commit/7518af3ddbf748b2b4434738da13b4d1a9d9435b) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(cli): `NEXUS_DATA_DIR` env var for portable / sandbox installs ([#2302](https://github.com/williamzujkowski/nexus-agents/issues/2302), child of [#2301](https://github.com/williamzujkowski/nexus-agents/issues/2301))

  Adds a single resolver `getNexusDataDir()` (in `src/config/nexus-data-dir.ts`) that returns the absolute root of nexus-agents runtime state. Resolution order:
  1. `$NEXUS_DATA_DIR` if set + non-empty (resolved against `process.cwd()`)
  2. `~/.nexus-agents` (zero-breakage fallback — current behavior)

  Refactors 11 source-file callsites that previously hardcoded `homedir() + '.nexus-agents'` (audit, doctor, sessions, model-registry, mobimem, traces, memory, voting correlations, wave checkpoints, MCP auth tokens, research auto-catalog) to derive from the resolver.

  `Dockerfile.sandbox` now sets `ENV NEXUS_DATA_DIR=/workspace/.nexus-agents` so a mounted workspace owns its own state — memory/learning/audit no longer leak across sandbox runs into the container's `$HOME`.

  Approved scope per consensus_vote 5/1 (contrarian-narrowed): explicitly does NOT include git-style ancestor walk-up discovery (CVE-2022-24765 risk class) or a `nexus-agents init --portable` command. Those are deferred to separate children of [#2301](https://github.com/williamzujkowski/nexus-agents/issues/2301) with a security design pass.

  Zero behavior change when env var is unset.

## 2.59.0

### Minor Changes

- [#2298](https://github.com/williamzujkowski/nexus-agents/pull/2298) [`c15675d`](https://github.com/williamzujkowski/nexus-agents/commit/c15675dae7e67704273ad0419f6fce24a5912da9) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(mcp): add `supply_chain_tradeoff_panel` tool for per-axis engineering tradeoff votes ([#2294](https://github.com/williamzujkowski/nexus-agents/issues/2294), child of [#2293](https://github.com/williamzujkowski/nexus-agents/issues/2293))

  Wraps the existing consensus voter infrastructure with a structured per-axis schema for build-vs-buy, dependency adoption, and supply-chain decisions. Default axes: `build_time_determinism` / `supply_chain_risk` / `update_cadence`; custom axes accepted up to 6.

  Voters answer EACH axis independently in a single round; the aggregator surfaces per-axis verdicts so legitimate tradeoffs (e.g., "approves on cadence, rejects on supply-chain") aren't masked by a single approve/reject. Final panel decision: `approve` only when all axes approve; `reject` if any axis rejects; `mixed` otherwise.

  Reuses the 7-role default panel (or 3-role quickMode); no new external surface area. MCP tool count: 33 → 34.

## 2.58.0

### Minor Changes

- [#2291](https://github.com/williamzujkowski/nexus-agents/pull/2291) [`9470c67`](https://github.com/williamzujkowski/nexus-agents/commit/9470c6764fd933f53fb5d731f2169f90d37d1b90) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **v2.58.0 — Governance substrate maturation: Magentic-One ledgers, confirm_risky tier, hash-chain audit, README auto-gen**

  This release ships 5 of the 7 follow-ups from the [#2232](https://github.com/williamzujkowski/nexus-agents/issues/2232) build-vs-buy audit, plus the supporting infrastructure (README auto-gen, prettier-stable governance injection) that surfaced during the work, plus a new `verify_audit_chain` MCP tool that closes the audit-trail story end-to-end.

  The framing also shifted: nexus-agents is now positioned as a **governance substrate for AI coding agents** rather than "another autonomous coding framework." The audit found that existing tools (OpenHands, SWE-agent, AutoGen, CrewAI, MetaGPT, Devin, Factory) cover at most 44% of our charter — they're agents we govern, not substitutes for the governance work itself.

  ### New: Magentic-One Task Ledger + Progress Ledger pattern ([#2278](https://github.com/williamzujkowski/nexus-agents/pull/2286))

  The audit's [#1](https://github.com/williamzujkowski/nexus-agents/issues/1) priority pattern to borrow. Adds two structured ledgers on top of the existing `query_task_state` log:
  - **`TaskLedger`** — outer-loop "facts and guesses about the task" (facts + guesses + openQuestions). Replaced atomically when the orchestrator replans.
  - **`ProgressLedgerEntry`** — inner-loop self-reflection after each step: was the plan still valid, are we stuck, what to do next. Append-only.
  - **`reflect(taskId)`** — returns the most-recent `suggestedAction` (`continue` / `revise_plan` / `escalate_to_human` / `abort`). `'continue'` when no entries exist yet.

  Two new log events on `StructuredTaskLogEntrySchema`: `task_ledger` (replace) and `progress_ledger` (append). Both new fields on `StructuredTaskState` are optional, so existing logs replay unchanged.

  This is the data model. Wiring `reflect()` into existing orchestrate flows (so they actually read it between steps) is a follow-up — separate concern that touches control flow, not the data model.

  Reference: AutoGen `microsoft/autogen` Magentic-One Orchestrator pattern.

  ### New: `confirm_risky` access-policy tier ([#2279](https://github.com/williamzujkowski/nexus-agents/pull/2288))

  Graduated middle tier between `audit` (log-only) and `enforce` (block-everything-not-allowlisted). Sets `NEXUS_ACCESS_POLICY_MODE=confirm_risky` and:
  - **Read-only tool** not in policy → `log-and-allow` (same as audit)
  - **Risky tool** (write/exec/network) not in policy → `deny` with structured "would have required human approval" reason
  - **Tool in `allowedTools`** → `allow` regardless of risk

  Tool risk classification ships in `tool-risk.ts` (18-entry `READ_ONLY_TOOLS` set covering all 33 registered MCP tools by exclusion; default-deny on unknown tools). Operators can graduate from `audit` to `enforce` without breaking read-heavy workflows.

  MCP elicitation API wiring is deferred — the deterministic refusal-with-reason path is v1, with the reason string surfacing "would have required human approval" so operators can either add the tool to `allowedTools` or graduate to `enforce`.

  ### New: hash-chain `verifyChain()` ([#2281](https://github.com/williamzujkowski/nexus-agents/pull/2287))

  The `AuditEvent.hash`/`previousHash` chain primitive was already in place — but nothing read it back and validated. This adds:
  - `verifyChain(events)` — walks events in append order, recomputes SHA-256 from each event's content + previousHash, compares against the stored hash field
  - Three named tamper signals: `hash_mismatch`, `previous_hash_mismatch`, `missing_hash`
  - First-failure-wins; backward-compatible with un-chained legacy logs

  Plus: a new MCP tool `verify_audit_chain` ([#2289](https://github.com/williamzujkowski/nexus-agents/pull/2289)) that wraps it for operator use — point it at a `FileAuditStorage` directory, get a structured tamper-detection result.

  OTEL export and kill-switch wiring are deferred to follow-ups.

  ### Changed: project framing → "governance substrate" ([#2284](https://github.com/williamzujkowski/nexus-agents/pull/2285))

  README, CLAUDE.md, AGENTS.md reframed. Tagline: "Governance substrate for your AI coding agents — adversarial review, drift-detected rules, immutable audit, closed-loop telemetry."

  The "What this is NOT" section explicitly distinguishes from OpenHands / SWE-agent / AutoGen / Devin / Factory. Architecture diagram now shows nexus-agents as a layer ABOVE engineering agents that delegates execution down. This is positioning, not features — code unchanged.

  ### New: README MCP tools table auto-generation ([#2269](https://github.com/williamzujkowski/nexus-agents/pull/2270))

  Extends `inject-governance.ts` to write the README MCP tools table between governance markers, mirroring the CLAUDE.md `TOOL_INDEX` pattern. Eliminates the recurring drift that needed three manual sync PRs in a single month.

  Two description maps (long for CLAUDE.md, short for README) trades two-places-to-edit for "the README stays scannable as it grows." Tools missing a short variant fall back to the long entry with a warning so the maintainer notices.

  CI gate: docs-check workflow now fails if README markers exist but the table is stale.

  ### Fixed: prettier-vs-inject-governance whitespace fight ([#2290](https://github.com/williamzujkowski/nexus-agents/pull/2289))

  Surfaced during the v2.58.0 shakedown: every PR adding a tool/expert/workflow tripped Governance Drift Check on a one-trailing-space diff inside CLAUDE.md tool tables. Root cause: `inject-governance` `padEnd`-padded cells, then `lint-staged → prettier --write` reformatted with slightly different widths.

  Fix: run `prettier.format` inside `inject-governance.ts` after generation, before writing. Now `inject` output and `prettier --write` output are identical → idempotent on commit. Every future tool/expert/workflow add no longer trips this gate.

  ### Fixed: SICA Weekly Test Generation chronic failure ([#2263](https://github.com/williamzujkowski/nexus-agents/pull/2267))

  Failing every weekly run since 2026-03-16 (six consecutive). Two compounding turbo arg-passthrough bugs: `pnpm test:coverage --reporter=json` (turbo rejects the flag, error text piped to coverage-report.json, prettier choked on it during auto-PR staging), and `pnpm test --run` (same shape; `pnpm test` is `turbo test` which already runs vitest in `--run` mode).

  Verified end-to-end via manual workflow_dispatch dry-run: 7m31s, all previously-failing steps now pass.

  ### Fixed: PostCSS XSS via unescaped `</style>` ([#2266](https://github.com/williamzujkowski/nexus-agents/pull/2266))

  [GHSA-qx2v-qp2m-jg93](https://github.com/advisories/GHSA-qx2v-qp2m-jg93) in `postcss < 8.5.10`. Reaches the install graph as a transitive devDep through `@vitest/coverage-v8 → vitest → vite → postcss`. Production runtime unaffected, but dependabot flagged it. Scoped pnpm override forces all postcss usages to ≥8.5.10 (resolved to 8.5.12).

  ### Fixed: retry implementations cross-reference ([#2230](https://github.com/williamzujkowski/nexus-agents/pull/2271))

  A scope_steward validation test caught a near-miss build of a third retry implementation. Investigation showed the two existing implementations (`adapters/retry.ts` and `cli-adapters/cli-retry-loop.ts`) are NOT actually duplicates — different jitter math, index base, cap order, return shape, circuit-breaker coupling. Added module-level cross-references to both files with a scope_steward escalation cue: "If you find yourself writing a third retry loop: stop, run `consensus_vote` with scope_steward in the panel, and pick whichever of these two fits."

  ### Documentation
  - `docs/ENTRYPOINTS.md` — `verify_audit_chain` added to MCP tools table
  - `docs/getting-started/CONFIGURATION.md` — new "Security & Governance Variables" section documenting `NEXUS_ACCESS_POLICY_MODE` (with all 4 modes including the new `confirm_risky`), `NEXUS_TASK_STATE_ENABLED`, `NEXUS_CONTEXT_WARN_THRESHOLD`
  - `docs/research/build-vs-buy-audit-2026-04-27.md` — methodology + scoring matrix preserved as a reference for future audits (via [#2232](https://github.com/williamzujkowski/nexus-agents/issues/2232) closing comment)

  ### Other
  - 5 dependabot PRs landed (postcss already covered above; production-deps group bump for commitlint/vitest/anthropic-ai-sdk/atproto/astro/svelte; CI action bumps for checkout 4→6, github-script 7→9, peter-evans/create-pull-request 7→8, anthropics/claude-code-action 1.0.107)
  - README MCP tools table is now auto-generated; README + CLAUDE.md + AGENTS.md + plugin manifests + PLUGIN_INSTALL.md all stay in sync via `pnpm governance:inject` + the docs-check CI gate

  ### Deferred for follow-up sessions

  Two audit follow-ups from [#2232](https://github.com/williamzujkowski/nexus-agents/issues/2232) are deferred for sessions where the test environment has the relevant subscriptions:
  - **[#2282](https://github.com/williamzujkowski/nexus-agents/issues/2282)** — Devin API adapter (requires Devin Teams subscription for live integration)
  - **[#2283](https://github.com/williamzujkowski/nexus-agents/issues/2283)** — Factory droid adapter (requires Factory Pro/Max subscription for live integration)

  Both have detailed design notes (capability scoring, NDJSON format caveats from prior OpenCode integration, pre-implementation checklists) posted as issue comments. Mocked-only adapters were declined on consensus_vote because end-to-end validation is the actual quality gate.

  ### No breaking changes

  `AccessPolicyMode` enum gained `'confirm_risky'` as a fourth value but the type is open (Zod enum widening). `StructuredTaskState` gained two optional fields (`taskLedger`, `progressLedger`) — existing logs replay unchanged. All other changes are additive.

## 2.57.0

### Minor Changes

- [#2264](https://github.com/williamzujkowski/nexus-agents/pull/2264) [`f6324be`](https://github.com/williamzujkowski/nexus-agents/commit/f6324be2e0e6158a70137b36b27833fd630dafd9) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **v2.57.0 — Multi-voter PR review, scope_steward role, model registry hardening**

  This release ships Epic [#2233](https://github.com/williamzujkowski/nexus-agents/issues/2233) (multi-voter PR review) along with a new consensus role, several architectural improvements, and the model-registry pricing alignment from the weekly drift check.

  ### Multi-voter PR review (Epic [#2233](https://github.com/williamzujkowski/nexus-agents/issues/2233) — experimental)

  A new `pr_review` MCP tool that wires the existing 5 consensus voters (architect, security, devex, catfish, scope_steward) to GitHub PR diffs. Each voter emits a typed `PRReview` with mandatory verification-gate output (matching the 4-point check from [#2225](https://github.com/williamzujkowski/nexus-agents/issues/2225) — re-read line, trace call path, name assertion, rule out language non-issue).
  - Tool: `pr_review` ([#2236](https://github.com/williamzujkowski/nexus-agents/pull/2236)) — children 1+2 of the epic
  - Verification gate enforcement in voter prompts ([#2238](https://github.com/williamzujkowski/nexus-agents/pull/2238))
  - 10-PR seed dataset + batch harness + scorer ([#2243](https://github.com/williamzujkowski/nexus-agents/pull/2243))
  - YAML findings format in voter system prompts ([#2248](https://github.com/williamzujkowski/nexus-agents/pull/2248))
  - Hybrid dataset with synthetic diff-readable bugs ([#2249](https://github.com/williamzujkowski/nexus-agents/pull/2249))
  - Soft-block aggregation tier on majority dissent ([#2251](https://github.com/williamzujkowski/nexus-agents/pull/2251))
  - Voter `maxTokens` bumped 500 → 2000 to fit PR-review-sized findings ([#2253](https://github.com/williamzujkowski/nexus-agents/pull/2253))
  - JSON-native findings — moved from lossy YAML-in-string to top-level JSON `findings` array ([#2254](https://github.com/williamzujkowski/nexus-agents/pull/2254))
  - v5 promoted to live PRs (Child 6, opt-in) ([#2256](https://github.com/williamzujkowski/nexus-agents/pull/2256))
  - Fail-fast when no model API key is configured ([#2257](https://github.com/williamzujkowski/nexus-agents/pull/2257))
  - **Local-mode runner** `scripts/pr-review-local.ts` for subscription-plan auth — runs voters through the local Claude/Codex/Gemini CLI subprocess so subscription quota is consumed interactively (the intended use). The GitHub Actions workflow at `.github/workflows/pr-review.yml` is now dormant by default; flip the trigger to re-enable when a metered API key is available. See [`docs/guides/PR_REVIEW_LOCAL.md`](https://github.com/williamzujkowski/nexus-agents/blob/main/docs/guides/PR_REVIEW_LOCAL.md). ([#2261](https://github.com/williamzujkowski/nexus-agents/pull/2261))

  Empirical validation (v5 retest): 100% bug-catch on diff-readable bugs in the synthetic dataset, 0% strict false-positive rate, and the v5 run caught a real bug ([#2255](https://github.com/williamzujkowski/nexus-agents/pull/2255)) that no human reviewer noticed.

  `pr_review` is **experimental** — surface, output schema, and aggregation tiers may change as we collect data on live PRs.

  ### scope_steward consensus role ([#2228](https://github.com/williamzujkowski/nexus-agents/pull/2228))

  Adds a 7th voter role focused on build-vs-buy gating: should we extend an existing tool/library or build something new? The role asks: does an existing tool already cover this? what's the maintenance cost of building? would adoption-pressure on the new code split the team's attention? Useful when the architect/AI-ML voters skew toward "let's build it" — scope_steward is the counter-pull.

  ### Verification gate for code-review subagents ([#2225](https://github.com/williamzujkowski/nexus-agents/pull/2225) → [#2226](https://github.com/williamzujkowski/nexus-agents/pull/2226))

  A 2026-04-25 audit found that second-pass code-review subagents had a 100% false-positive rate on findings — every claim disqualified by reading 5 more lines or noticing a slice cap. The CLAUDE.md governance now enforces a 4-point gate on every discovered-issue finding before filing: (1) re-read line + 5 above + 5 below, (2) trace the call path, (3) name the failing assertion, (4) rule out language-level non-issues. Subagent prompts must surface which checks each finding passed; the parent agent verifies before filing.

  ### Audit-trail gap fix ([#2218](https://github.com/williamzujkowski/nexus-agents/pull/2218))

  When an MCP tool handler throws, audit events are now emitted with the error context. Previously the throw bypassed the audit pipeline, leaving observability blind on the most actionable subset of tool runs.

  ### Security: ReDoS in base64 detection ([#2191](https://github.com/williamzujkowski/nexus-agents/pull/2191) → [#2216](https://github.com/williamzujkowski/nexus-agents/pull/2216))

  Rewrote the `base64_encoded` injection pattern to eliminate catastrophic backtracking — the previous lookahead-plus-quantifier shape (`(?=X*Y)X{n,}`) was polynomial-time on adversarial inputs.

  ### Research source repair ([#2234](https://github.com/williamzujkowski/nexus-agents/pull/2234) → [#2235](https://github.com/williamzujkowski/nexus-agents/pull/2235), [#2255](https://github.com/williamzujkowski/nexus-agents/pull/2255))

  Restored `research_discover` for GitHub (dropped the `OR` clause that returned 0 results — simpler query returns 359) and Semantic Scholar (added optional `SEMANTIC_SCHOLAR_API_KEY` env var, surfaced 401 → `RATE_LIMIT` for retry). The 429 rate-limit message now uses `GITHUB_TOKEN` (correct) instead of `GITHUB_API_KEY` (wrong) — caught by the pr_review devex voter and fixed before this release.

  ### Cloud provider setup guide ([#2229](https://github.com/williamzujkowski/nexus-agents/pull/2229) → [#2237](https://github.com/williamzujkowski/nexus-agents/pull/2237))

  New `docs/guides/CLOUD_PROVIDER_SETUP.md` covering Bedrock, Vertex AI, and Azure OpenAI configuration paths.

  ### Model registry — pricing + context window alignment ([#2259](https://github.com/williamzujkowski/nexus-agents/issues/2259) → [#2262](https://github.com/williamzujkowski/nexus-agents/pull/2262))

  Eight fields aligned to the litellm community catalog after the weekly drift check:
  - `gemini-3-pro` / `gemini-pro` / `gemini-3-flash` / `gemini-flash`: contextWindow 1,000,000 → 1,048,576 (exact 2^20)
  - `codex-5.3`: contextWindow 1,000,000 → 1,050,000
  - `codex-5.2`: contextWindow 400,000 → 272,000, inputPer1M $2.00 → $1.75, outputPer1M $8.00 → $14.00

  ### Adapter parallel-registry consolidation ([#2199](https://github.com/williamzujkowski/nexus-agents/issues/2199), [#2200](https://github.com/williamzujkowski/nexus-agents/issues/2200))

  Several adapters had their own private alias/model lookups that drifted from the canonical `model-capabilities.ts` registry. Migrated Claude/Gemini/OpenAI parallel registries to derive from the canonical registry's `aliases[]` field with longest-prefix-wins fallback. The model-string drift CI check is now blocking ([#2210](https://github.com/williamzujkowski/nexus-agents/pull/2210)) — registry inconsistencies fail the build instead of being advisory.

  ### CLAUDE.md governance reconciliation ([#2231](https://github.com/williamzujkowski/nexus-agents/pull/2231))

  Vote-count drift (5→7 agents), phantom subagent types, and stale tool counts reconciled. The agent table now reflects the actual enum (Explore, Plan, general-purpose, claude-code-guide).

  ### Other fixes
  - Backup user config before `--force` overwrite in CLI setup ([#2215](https://github.com/williamzujkowski/nexus-agents/pull/2215))
  - Propagate `AbortSignal` in aorchestra worker dispatcher ([#2214](https://github.com/williamzujkowski/nexus-agents/pull/2214))
  - `getAdapterForModel` longest-prefix-wins fallback ([#2209](https://github.com/williamzujkowski/nexus-agents/pull/2209))
  - Capture fallback duration in `tryExpertFallback` ([#2196](https://github.com/williamzujkowski/nexus-agents/pull/2196))
  - Defensive hardening: 3 fixes from code review ([#2193](https://github.com/williamzujkowski/nexus-agents/pull/2193))
  - Pin `peter-evans/create-pull-request` to SHA (Scorecard MED) ([#2198](https://github.com/williamzujkowski/nexus-agents/pull/2198))
  - Scope `registry-refresh` permissions to refresh job ([#2197](https://github.com/williamzujkowski/nexus-agents/pull/2197))
  - Indexer cleanup: silent-empty extraction surfaces as warnings ([#2165](https://github.com/williamzujkowski/nexus-agents/pull/2165)), `extractOption` consolidation ([#2167](https://github.com/williamzujkowski/nexus-agents/pull/2167)), CLI commands single-source-of-truth ([#2173](https://github.com/williamzujkowski/nexus-agents/pull/2173))

  No breaking changes.

## 2.56.0

### Minor Changes

- [#2144](https://github.com/williamzujkowski/nexus-agents/pull/2144) [`f8fcdd8`](https://github.com/williamzujkowski/nexus-agents/commit/f8fcdd8d5609db25bca31ef6f82e20893a226355) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - UX pass (epic [#2134](https://github.com/williamzujkowski/nexus-agents/issues/2134)): first-run experience tightening.
  - `nexus-agents --help` now hides 18 maintainer-audience commands (benchmarks, release tooling, deep diagnostics) by default and groups the remaining 19 into **Essential** + **Advanced** tiers. Run `nexus-agents --help --all` to see the full surface. Progressive disclosure instead of a 37-command wall on first install. ([#2135](https://github.com/williamzujkowski/nexus-agents/issues/2135) → [#2139](https://github.com/williamzujkowski/nexus-agents/issues/2139))
  - `nexus-agents verify` now actually verifies the things that break during installation: better-sqlite3 native module loadability, `~/.nexus-agents/` data-dir writability, and adapter availability (API keys or CLI binaries). New `severity: 'hard' | 'warn'` classification: warnings (no API keys, missing better-sqlite3) print yellow ⚠ but exit 0; only real breakage (Node too old, broken exports) exits 1. ([#2136](https://github.com/williamzujkowski/nexus-agents/issues/2136))
  - `nexus-agents setup` runs the new verify checks inline at the end with copy-pasteable remediation text, so install-time issues surface where the user just ran setup instead of requiring a separate `doctor` invocation. Skipped in `--dry-run`. Exit code contract: warnings don't fail setup. ([#2137](https://github.com/williamzujkowski/nexus-agents/issues/2137))
  - `nexus-agents setup` also prints a 3-line "Getting started" banner with the next commands to try. Step 2 adapts based on whether MCP was wired up (`Use through Claude Code` if yes, `nexus-agents orchestrate` if no). ([#2138](https://github.com/williamzujkowski/nexus-agents/issues/2138))

  All four children shipped via PRs [#2139](https://github.com/williamzujkowski/nexus-agents/issues/2139) and [#2140](https://github.com/williamzujkowski/nexus-agents/issues/2140) (stacked-squash merge).

## 2.55.1

### Patch Changes

- [#2132](https://github.com/williamzujkowski/nexus-agents/pull/2132) [`f7e7937`](https://github.com/williamzujkowski/nexus-agents/commit/f7e79373fb112fe340b26a7e61bfd4fb9ca7539c) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **feat(setup): nexus-agents setup --custom-api — guided gateway configuration ([#2124](https://github.com/williamzujkowski/nexus-agents/issues/2124))**

  Closes the last deferred child of epic [#2119](https://github.com/williamzujkowski/nexus-agents/issues/2119). The runtime adapter shipped in v2.55.0 ([#2125](https://github.com/williamzujkowski/nexus-agents/issues/2125)) reads custom-openai config from env vars — this command now walks you through obtaining them:

  ```bash
  nexus-agents setup --custom-api https://your-gateway.example.com/v1 \
    --custom-api-key $YOUR_KEY --custom-model claude-opus-4-5
  ```

  Validates the URL through the same SSRF guard (blocks loopback, RFC 1918, AWS IMDS, IPv6 equivalents, non-http/https), probes `GET /models` with Bearer auth to confirm connectivity, and prints a POSIX shell fragment to paste into `~/.bashrc` / `~/.zshrc`. Non-interactive mode supported for CI.

## 2.55.0

### Minor Changes

- [#2129](https://github.com/williamzujkowski/nexus-agents/pull/2129) [`a1b4a9e`](https://github.com/williamzujkowski/nexus-agents/commit/a1b4a9ec39ef58216d78beae651b99ed187430ca) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **feat: harness-neutral decoupling + direct custom-API gateway adapter (epic [#2119](https://github.com/williamzujkowski/nexus-agents/issues/2119))**

  Makes nexus-agents a first-class MCP peer for OpenCode, Codex CLI, Cursor, Aider, and Cline — not just Claude Code.

  **New: direct `custom-openai` SDK adapter ([#2120](https://github.com/williamzujkowski/nexus-agents/issues/2120) / [#2125](https://github.com/williamzujkowski/nexus-agents/issues/2125))**

  Point nexus-agents at any OpenAI-compatible gateway (multi-vendor proxies, self-hosted LLM servers, corporate gateways) with three env vars:

  ```bash
  export NEXUS_CUSTOM_API_BASE_URL="https://your-gateway.example.com/v1"
  export NEXUS_CUSTOM_API_KEY="..."
  export NEXUS_CUSTOM_MODEL="claude-opus-4-5"   # optional; default: gpt-4o
  ```

  No OpenCode subprocess in the chain. SSRF guard validates the base URL at construction — blocks loopback, RFC 1918 private ranges, link-local (incl. AWS IMDS `169.254.169.254`), IPv6 equivalents, and non-http(s) protocols. Escape hatch `NEXUS_CUSTOM_API_ALLOW_PRIVATE=1` for trusted internal hosts.

  **Harness-neutral rule location ([#2121](https://github.com/williamzujkowski/nexus-agents/issues/2121) / [#2126](https://github.com/williamzujkowski/nexus-agents/issues/2126))**

  `.claude/rules/*.md` → `.rules/*.md`. Single source of truth; CLAUDE.md pointers updated. `detectProjectInfo` accepts both paths during migration. Other harnesses can point their rule-loading systems at `.rules/` directly now.

  **AGENTS.md is now standalone ([#2122](https://github.com/williamzujkowski/nexus-agents/issues/2122) / [#2127](https://github.com/williamzujkowski/nexus-agents/issues/2127))**

  Previously a redirect to CLAUDE.md; now inlines the harness-neutral subset (prime directive, TDD/YAGNI/DRY, rule-file index, skills/agents discovery, MCP startup, canonical paths, untrusted-input invariants, consensus thresholds). OpenCode, Codex CLI, and others that read AGENTS.md natively no longer have to chain through CLAUDE.md.

  **Harness compatibility guide ([#2123](https://github.com/williamzujkowski/nexus-agents/issues/2123) / [#2128](https://github.com/williamzujkowski/nexus-agents/issues/2128))**

  New `docs/guides/HARNESS_COMPATIBILITY.md` with tested wiring snippets for OpenCode, Codex CLI, Cursor, Aider, and Cline — each section covers config path, MCP server registration, rule-file discovery strategy, and verify steps.

  No breaking changes. CLAUDE.md still works for Claude Code users; `.claude-plugin/` marketplace manifest untouched.

## 2.54.1

### Patch Changes

- [#2117](https://github.com/williamzujkowski/nexus-agents/pull/2117) [`ca33873`](https://github.com/williamzujkowski/nexus-agents/commit/ca33873b57026ee690913317275c8b3a22eff983) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **feat(orchestrate): richer partial-result content on wall-clock timeouts ([#2111](https://github.com/williamzujkowski/nexus-agents/issues/2111) / [#2116](https://github.com/williamzujkowski/nexus-agents/issues/2116))**

  Follow-up to the deadline safeguard shipped in v2.54.0. When `orchestrate` hits its wall-clock deadline, the partial `OrchestrateOutput` now includes whatever the orchestration captured before the hang:
  - `routing` — populated once `routeAndPrepare` returns (post-routing-decision)
  - `analysis` — populated when the fast-path completes
  - `stepsCompleted` — carries the snapshot's step counter rather than being forced to 0

  Empty-snapshot fallback is unchanged (sentinel analysis with `complexity: 1`, `taskType: 'unknown'`), so clients keyed on the v2.54.0 shape keep working. Additive-only; no schema changes.

## 2.54.0

### Minor Changes

- [#2112](https://github.com/williamzujkowski/nexus-agents/pull/2112) [`ee2262f`](https://github.com/williamzujkowski/nexus-agents/commit/ee2262f74051ae1c1107e7184e6af051f6c58bf4) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - **fix(mcp): wall-clock deadline safeguards for `consensus_vote` and `orchestrate`**

  Both long-running MCP tools now clamp their internal wall-clock deadline below the outer `wrapToolWithTimeout` cap via `getMcpSafeDeadlineMs`, and return a structured partial result when the deadline fires — instead of the naked `Operation '<tool>' timed out after Nms` error that clients saw before.
  - `consensus_vote` ([#2108](https://github.com/williamzujkowski/nexus-agents/issues/2108)): stuck roles surface as `{ source: 'error', error: 'overall consensus deadline exceeded' }`; every completed vote survives.
  - `orchestrate` ([#2110](https://github.com/williamzujkowski/nexus-agents/issues/2110)): a new `raceAgainstDeadline` primitive in `core/race/` races `executeOrchestration` against a 890s deadline (900s cap − 10s safety buffer). On timeout, the client receives a schema-valid `OrchestrateOutput` with `metadata.timeoutReason = 'orchestration overall deadline exceeded'`, preserving captured setup state (`taskId`, `agentPlan`, `workerDispatch`).

  New in the public schema: `OrchestrateOutputSchema.metadata.timeoutReason` is an optional string. Additive, non-breaking.

  Closes epic [#2104](https://github.com/williamzujkowski/nexus-agents/issues/2104). Follow-up [#2111](https://github.com/williamzujkowski/nexus-agents/issues/2111) tracks the state-snapshot fidelity improvement (deferred from the MVP).

## 2.53.0

### Minor Changes

- [#2081](https://github.com/williamzujkowski/nexus-agents/pull/2081) [`c6c4bb2`](https://github.com/williamzujkowski/nexus-agents/commit/c6c4bb22e52612f871cd5bf6fbe35664afb93dad) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(swe-bench): pre-flight research lookup for runAgentOnInstance ([#1414](https://github.com/williamzujkowski/nexus-agents/issues/1414) option 3)

  Opt-in pre-flight research that appends top-3 relevant papers from
  the in-repo research registry to the system prompt before the first
  iteration runs.
  - New module `swe-bench/preflight-research.ts`:
    - `findRelevantPapers(problemStatement, topN=3)` — scores every
      paper in `docs/research/registry/papers.yaml` against keywords
      extracted from the problem statement; returns top-N hits
    - `extractKeywords(text)` — simple heuristic: alphanumeric tokens
      ≥ 4 chars, stopwords filtered, deduped, capped at 15
    - `renderResearchContext(hits)` — compact markdown fragment ready
      to concatenate to the system prompt
    - `isPreflightResearchEnabled()` — reads `NEXUS_PREFLIGHT_RESEARCH=1`
      (default off)
  - Wired into `runAgentOnInstance`: when enabled AND hits found,
    appends the research context block to the system prompt once before
    the iteration loop starts. No-op otherwise.

  ## Zero-cost design
  - No LLM calls
  - Registry is bundled with the package (loaded via
    `loadPapersRegistry()`)
  - Pure in-memory keyword matching
  - Off by default so cost-sensitive runs see no extra prompt size

  11 new tests cover keyword extraction, env gate, paper scoring, and
  rendering. 9 existing agent-runner tests pass unchanged.

  Closes the last option from my [#1414](https://github.com/williamzujkowski/nexus-agents/issues/1414) resume-plan message. Remaining
  work for the epic: Phase 5 PipelineRunner refactor (design call) +
  Verified 500 sweep ([#2035](https://github.com/williamzujkowski/nexus-agents/issues/2035) cost-gated).

- [#2078](https://github.com/williamzujkowski/nexus-agents/pull/2078) [`efa8ca1`](https://github.com/williamzujkowski/nexus-agents/commit/efa8ca17b4413ac6b1fa510a6207b673a0715ce0) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(swe-bench): wire ClawGuard + structured task state into runAgentOnInstance ([#1414](https://github.com/williamzujkowski/nexus-agents/issues/1414))

  Phase 5 progress for [#1414](https://github.com/williamzujkowski/nexus-agents/issues/1414). The SWE-bench runner now participates in
  the same ClawGuard audit + structured-task-state journaling that the
  orchestrate path gained in v2.50.
  - `runAgentOnInstance` wraps the iteration loop in
    `withAccessPolicy(policy, ...)` after deriving a per-instance policy
    from the first 500 chars of `problem_statement`
  - New helpers `deriveRunnerAccessPolicy`, `recordRunnerTaskInit`,
    `recordRunnerTaskFinal` mirror the pattern from orchestrate.ts;
    each is env-flag-gated (reuses `NEXUS_ACCESS_POLICY_MODE` and
    `NEXUS_TASK_STATE_ENABLED` from v2.50)
  - Task state log captures lifecycle per instance:
    `planning → executing → (complete | blocked)`, with blockers
    recorded when the runner reports an error
  - Derivation + recording never throw; they log and continue so a
    runner regression cannot take down a SWE-bench sweep

  3 new integration tests cover policy shape on instance inputs;
  existing 13 agent-runner tests unchanged.

  Remaining [#1414](https://github.com/williamzujkowski/nexus-agents/issues/1414) work: `HarnessVerifyAdapter` wiring in
  `createExecutor` (option 1) and pre-flight `research_query` hook
  (option 3) — tracked as follow-up tasks.

- [#2080](https://github.com/williamzujkowski/nexus-agents/pull/2080) [`6ab684a`](https://github.com/williamzujkowski/nexus-agents/commit/6ab684ad1717557c098da188e513ab0aecb83aaf) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(swe-bench): add createHarnessVerifyAdapter factory + thread verify into runSingleInstance ([#1414](https://github.com/williamzujkowski/nexus-agents/issues/1414))

  Builds on [#2056](https://github.com/williamzujkowski/nexus-agents/issues/2056) (HarnessVerifyAdapter class) and [#2078](https://github.com/williamzujkowski/nexus-agents/issues/2078) (runner
  ClawGuard + task-state wiring) to expose post-patch verification at
  the benchmark-runner layer.
  - New `createHarnessVerifyAdapter({ modelName, evalConfig })` factory
    in `benchmark-runner.ts`. Validates the evaluation harness
    environment (Docker, disk, CPU) before constructing the adapter;
    returns `Result.err` if prerequisites aren't met so callers can
    fall back to running without verify.
  - `SingleInstanceOptions` extended with optional `verifyAdapter` +
    `maxVerifyRetries` fields that flow into `RunOptions`.
  - `runSingleInstance` threads both into `runAgentOnInstance`.
  - 2 new factory tests: Result shape on environment failure, options
    type compatibility.
  - 12 existing benchmark-runner tests pass unchanged.

  Enables SWE-bench sweeps to opt into the retry loop:

  ```ts
  const adapterResult = await createHarnessVerifyAdapter({
    modelName: executor.getModelId(),
    evalConfig,
  });
  const verifyAdapter = adapterResult.ok ? adapterResult.value : undefined;
  await runSingleInstance({ ...opts, verifyAdapter });
  ```

## 2.52.0

### Minor Changes

- [#2067](https://github.com/williamzujkowski/nexus-agents/pull/2067) [`3f5c444`](https://github.com/williamzujkowski/nexus-agents/commit/3f5c4447f5e7a3013e0b3be13e8e057ae9f72600) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - refactor: expose event-bus via core/event-bus re-export barrel

  Adds `src/core/event-bus.ts` as a stable import path for the event-bus
  so cross-cutting subsystems (adapters, consensus, pipeline) can wire
  into it without crossing the agents-layer boundary flagged by the
  fitness-audit `layerSeparation` check.
  - **New**: `src/core/event-bus.ts` re-exports the public surface from
    the existing implementation in `src/agents/collaboration/event-bus*`
  - **Migrated**: 2 layer-crossing imports in `resilient-adapter.ts` and
    `weighted-voting.ts` now use the new path
  - **No breaking change**: the implementation files stay put; the
    35+ existing importers at the old path continue to work
  - **Physical move** is v3.0-gated ([#2066](https://github.com/williamzujkowski/nexus-agents/issues/2066)) — internal
    `event-bus-events.ts` has coupling to `collaboration-types.ts` that
    must be decoupled first

  ## Fitness impact

  Score: **99 → 100**. The \`layerSeparation\` dimension now reports 0
  adapter→agent import violations (was 2).

## 2.51.0

### Minor Changes

- [#2064](https://github.com/williamzujkowski/nexus-agents/pull/2064) [`982d0fb`](https://github.com/williamzujkowski/nexus-agents/commit/982d0fb86f2f68ee784cbaa747576e90baae4b0e) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat: flip ClawGuard and structured-task-state to default-on (user-visible)

  Two previously opt-in features now default to on — approved for a v2.x
  minor release.

  ## ClawGuard: `off` → `audit` by default

  `NEXUS_ACCESS_POLICY_MODE` default flipped from `off` to `audit`. Every
  orchestrate / execute_expert call now derives an access policy and
  logs `access-policy: audit violation` when tool calls fall outside the
  derived allowlist. Nothing is blocked — enforcement still requires
  explicit `NEXUS_ACCESS_POLICY_MODE=enforce`.
  - Operators wanting the pre-v2.50 behavior: set
    `NEXUS_ACCESS_POLICY_MODE=off`
  - Operators wanting blocking: set `NEXUS_ACCESS_POLICY_MODE=enforce`

  ## Structured task state: disabled → enabled by default

  `NEXUS_TASK_STATE_ENABLED` default flipped from "unset disables" to
  "unset enables". Orchestrations now write a JSONL log per task under
  `~/.nexus-agents/tasks/state-{taskId}.jsonl` capturing stage
  transitions, decisions, and blockers. The log is read back via the
  `query_task_state` MCP tool.
  - Operators wanting the pre-v2.50 behavior: set
    `NEXUS_TASK_STATE_ENABLED=0` (or `false`)

  ## Why now
  - ClawGuard has shipped for multiple releases with 53+ tests and zero
    known regressions. Audit mode gives telemetry without risk.
  - Structured task state has been available since [#2045](https://github.com/williamzujkowski/nexus-agents/issues/2045). Default-on
    closes the "why did my orchestration fail?" feedback loop — the log
    file survives session restarts.

  Updated 16 test cases to match the new defaults; all pass.

## 2.50.0

### Minor Changes

- [#2058](https://github.com/williamzujkowski/nexus-agents/pull/2058) [`a82a953`](https://github.com/williamzujkowski/nexus-agents/commit/a82a953b49095a7fd78e624e80319e2c74fc9099) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(orchestration): emit dependsOn from planAgentTeam ([#2055](https://github.com/williamzujkowski/nexus-agents/issues/2055))

  Makes the [#2049](https://github.com/williamzujkowski/nexus-agents/issues/2049) integration actually active. `planAgentTeam` now
  populates `dependsOn` on each `AgentPlanEntry` whose role has
  declared dependencies in the existing `EXPERT_DEPENDENCIES` map,
  filtered to roles actually present in the plan.
  - `assignDependencyAwareWaves` previously only mutated the `wave`
    number; now it also sets `dependsOn` (filtered to present deps)
  - `applyDependencyWaves` in `worker-dispatcher.ts` ([#2049](https://github.com/williamzujkowski/nexus-agents/issues/2049)) now sees
    these edges and runs `topologicalWaveAssign` — end-to-end DAG
    dispatch is live without any caller-side change
  - Never emits empty arrays — the field is either absent or
    has ≥1 role
  - 3 new tests confirm emission, absence on degenerate plans, and
    no-empty-arrays contract
  - 66 existing agent-planner tests pass unchanged

  Closes the dormant integration path from [#2049](https://github.com/williamzujkowski/nexus-agents/issues/2049). SWE-bench runs and
  other orchestrate paths now get dependency-aware wave ordering for
  free.

## 2.49.0

### Minor Changes

- [#2056](https://github.com/williamzujkowski/nexus-agents/pull/2056) [`165d769`](https://github.com/williamzujkowski/nexus-agents/commit/165d76995e9885492be12a699e4607106e124721) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(swe-bench): concrete HarnessVerifyAdapter for verify-loop integration ([#2054](https://github.com/williamzujkowski/nexus-agents/issues/2054))

  Closes the dormant integration path from [#2051](https://github.com/williamzujkowski/nexus-agents/issues/2051) by providing a
  production-ready `IVerifyAdapter` implementation that delegates to the
  existing `IEvaluationHarness`.
  - New `swe-bench/harness-verify-adapter.ts` with:
    - `HarnessVerifyAdapter` class — wraps `harness.evaluateInstance`
      and translates `InstanceEvaluationResult` to the `VerifyResult`
      shape the agent-runner expects
    - `translateEvaluationResult(result)` — pure translator exported
      for tests and alternative adapter implementations
  - Mapping:
    - `passed` = `resolved` (all FAIL_TO_PASS pass + all PASS_TO_PASS
      still pass)
    - `stderr` = patch application error, timeout notice, or
      pytest-style list of failed tests (truncated at 20)
    - `stdout` = human-readable summary (counts + status + duration)
  - Never-throw contract: on any harness exception, returns
    `{passed: false, stderr: "Harness evaluation failed: ..."}` so the
    retry loop can make a sensible decision rather than crashing
  - 8 tests cover the result translator across 5 statuses
    (resolved/unresolved/error/timeout), the pass/fail wiring, the
    truncation, and the never-throws contract

  Consumers activate verification by:

  ```ts
  const harness = await createValidatedHarness(...);
  const verifyAdapter = new HarnessVerifyAdapter(harness, modelName, evalConfig);
  runAgentOnInstance(instance, { executor, config, verifyAdapter });
  ```

  With this PR, the `[#2051](https://github.com/williamzujkowski/nexus-agents/issues/2051)` integration is no longer dormant — SWE-bench
  runs can opt into post-patch verification end-to-end.

## 2.48.0

### Minor Changes

- [#2051](https://github.com/williamzujkowski/nexus-agents/pull/2051) [`f4486f2`](https://github.com/williamzujkowski/nexus-agents/commit/f4486f2c4531e25999d2ed56237ce723aa51735d) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(swe-bench): wire verify loop into agent-runner ([#2043](https://github.com/williamzujkowski/nexus-agents/issues/2043) / [#2032](https://github.com/williamzujkowski/nexus-agents/issues/2032))

  Final integration from the [#2043](https://github.com/williamzujkowski/nexus-agents/issues/2043) follow-up epic. The pure verify-loop
  utilities from [#2042](https://github.com/williamzujkowski/nexus-agents/issues/2042) are now consumable by the SWE-bench agent runner
  via a new `IVerifyAdapter` interface on `RunOptions`.
  - New `IVerifyAdapter` + `VerifyResult` types on `agent-runner.ts`.
    Adapters take `(instance, patch, workDir)` and return
    `{passed, stderr, stdout}` — SWE-bench wiring to the real
    evaluation-harness is a separate follow-up so this PR is reviewable
    as a pure contract extension.
  - New optional `verifyAdapter` + `maxVerifyRetries` fields on
    `RunOptions`. When `verifyAdapter` is absent, behavior is exactly
    as before — zero change for callers that haven't opted in.
  - New `runPostPatchVerify` helper. After each successful patch, it:
    - Calls `adapter.verify(...)` to run the instance's test suite
    - Feeds stdout/stderr to `buildVerifyOutcome` from `verify-loop.ts`
    - On `willRetry`, sets `state.lastError` to the retry hint and
      `state.lastPatch` to the failed patch, then `continue`s the
      iteration loop — the agent sees the hint in its next prompt
  - 4 new tests cover the adapter contract and the opt-in shape.
  - 29 existing agent-runner + verify-loop tests pass unchanged.

  Completes 5 of 5 integrations from [#2043](https://github.com/williamzujkowski/nexus-agents/issues/2043).

## 2.47.0

### Minor Changes

- [#2049](https://github.com/williamzujkowski/nexus-agents/pull/2049) [`25dacbd`](https://github.com/williamzujkowski/nexus-agents/commit/25dacbdf3b833dd73f474754f41ad8c68be6b4a3) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(orchestration): wire topological wave recomputation into worker-dispatcher ([#2043](https://github.com/williamzujkowski/nexus-agents/issues/2043) / [#2034](https://github.com/williamzujkowski/nexus-agents/issues/2034))

  Integration follow-up for [#2034](https://github.com/williamzujkowski/nexus-agents/issues/2034). The pure utility has been live since
  [#2038](https://github.com/williamzujkowski/nexus-agents/issues/2038); this PR makes it take effect in real dispatch:
  - Adds optional `dependsOn?: readonly BuiltInExpertType[]` field on
    `AgentPlanEntry`. Absent or empty → entry keeps its priority-based
    wave assignment; pre-dependsOn plans are unaffected.
  - New `applyDependencyWaves(entries)` helper in `worker-dispatcher.ts`
    checks whether any entry declares `dependsOn`; if yes, runs the plan
    through `topologicalWaveAssign` before dispatch; if no, returns the
    plan unchanged by identity.
  - `dispatchWorkers` calls `applyDependencyWaves` before `groupByWave`,
    so the live pipeline now respects DAG edges.
  - Fallback policy: cycles or missing refs log a warning and revert to
    the original priority-based assignment — dispatch never fails because
    the plan's dependency graph is malformed.
  - 6 new integration tests cover: unchanged pass-through, linear chain,
    diamond grouping, cycle fallback, missing-ref fallback, empty plan.
  - 133 existing aorchestra tests still pass unchanged.

  Planner-side emission of `dependsOn` (so `planAgentTeam` actually
  produces DAGs) is a deliberate follow-up — this PR establishes the
  consumer contract so custom planners and trigger-table authors can
  start producing DAGs today.

  Remaining from [#2043](https://github.com/williamzujkowski/nexus-agents/issues/2043): verify-loop integration ([#2032](https://github.com/williamzujkowski/nexus-agents/issues/2032)) into agent-runner.

## 2.46.0

### Minor Changes

- [#2045](https://github.com/williamzujkowski/nexus-agents/pull/2045) [`a487660`](https://github.com/williamzujkowski/nexus-agents/commit/a4876605fc7c9f73bcdc6efc50adfde10c5570f6) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(orchestrate): wire structured task state into orchestration lifecycle ([#2043](https://github.com/williamzujkowski/nexus-agents/issues/2043) / [#2033](https://github.com/williamzujkowski/nexus-agents/issues/2033))

  Integration follow-up for [#2033](https://github.com/williamzujkowski/nexus-agents/issues/2033). The orchestrate MCP tool now records
  lifecycle events (init → executing → complete | blocked) into the
  structured task state log when `NEXUS_TASK_STATE_ENABLED=1` is set.
  - New helpers `recordTaskStateInit`, `recordTaskStateStage`,
    `recordTaskStateBlocker` in orchestrate.ts. Each checks the env flag
    first and is a no-op when unset; zero behavior change by default.
  - Wired into `executeOrchestration`:
    - Init on entry with stage `planning`
    - Stage update to `executing` before `orchestrator.execute`
    - On failure: append blocker + stage `blocked`
    - On success: stage `complete`
    - On exception: append blocker + stage `blocked`
  - All helpers wrap the underlying Result-returning functions and log
    failures via `logger.warn` — orchestration never fails because the
    state log couldn't be written.

  6 new tests cover the env gate, the success lifecycle (3 entries),
  the failure lifecycle (4 entries including blocker), and the
  never-throws contract on filesystem errors.

- [#2048](https://github.com/williamzujkowski/nexus-agents/pull/2048) [`2c908ed`](https://github.com/williamzujkowski/nexus-agents/commit/2c908eddcec3a82204056e37f8c7ddc6b1c3083e) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(mcp): query_task_state tool for reading structured task logs ([#2046](https://github.com/williamzujkowski/nexus-agents/issues/2046))

  Closes the loop on the [#2033](https://github.com/williamzujkowski/nexus-agents/issues/2033) structured-task-state pipeline. The
  orchestrate tool ([#2045](https://github.com/williamzujkowski/nexus-agents/issues/2045)) writes state to JSONL logs; the new
  `query_task_state` MCP tool reads them back and returns the current
  snapshot.
  - New tool at `mcp/tools/query-task-state-tool.ts` following the
    `query_trace` pattern (secure handler, rate limiter, timeout guard).
  - Uses `readTaskState` from `context/structured-task-state.ts`, so
    path-traversal validation and malformed-line resilience are
    inherited.
  - Non-throwing error contract: missing logs or validation failures
    return `{found: false, errorMessage: ...}` inside a successful
    tool result rather than raising.
  - Wired into `cli-server-tools.ts` dispatcher, `mcp/tools/index.ts`
    barrel, `mcp/index.ts` re-exports, and tools array.
  - 5 tests for input schema + registration; existing tools-index and
    cli-server-tools tests updated to expect 31 tools (was 30).

  Closes [#2046](https://github.com/williamzujkowski/nexus-agents/issues/2046).

## 2.45.0

### Minor Changes

- [#2042](https://github.com/williamzujkowski/nexus-agents/pull/2042) [`843ffdb`](https://github.com/williamzujkowski/nexus-agents/commit/843ffdb2dab7e8c1ff8498ded859494d6362873a) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(swe-bench): post-patch verification loop utilities ([#2032](https://github.com/williamzujkowski/nexus-agents/issues/2032))

  Adds pure utilities for classifying patch-verification failures and
  deciding whether to retry the agent. Deliberately decoupled from the
  evaluation-harness I/O so consumers can unit-test the classifier
  without spinning up Docker; integration with `agent-runner.ts` is a
  separate follow-up so this first PR stays reviewable.
  - New `swe-bench/verify-loop.ts`:
    - `classifyPatchFailure(stderr, stdout)` → `VerifyFailureClassification`
      Recognizes `patch_not_applicable`, `syntax_error`, `timeout`,
      `missing_dependency`, `runtime_error`, `test_failure`; falls
      through to `unknown`.
    - `shouldRetry(category, iteration, maxRetries)` — category-aware
      retry policy. `timeout` never retries; `wrong_file_modified` and
      `unknown` get exactly one retry; everything else is retryable
      up to the cap.
    - `buildRetryHint(classification, iteration, maxRetries)` — terse
      prompt fragment with extracted test names (capped at 5).
    - `buildVerifyOutcome({passed, iteration, stderr, stdout})` — the
      one-call-per-attempt wrapper integration callers will use.
  - Default max retries: 2 (configurable per call).
  - Reuses the existing `FailureCategory` type from
    `evaluation-failure-types.ts` — no new failure taxonomy.
  - 20 tests cover all patterns, retry-cap behavior, hint truncation,
    empty-output safety, and end-to-end outcome construction.

  Child of [#1574](https://github.com/williamzujkowski/nexus-agents/issues/1574) via [#2030](https://github.com/williamzujkowski/nexus-agents/issues/2030).

## 2.44.0

### Minor Changes

- [#2040](https://github.com/williamzujkowski/nexus-agents/pull/2040) [`642516b`](https://github.com/williamzujkowski/nexus-agents/commit/642516b0ba8b9fd8c45cc4cccfc3bbdf27e3dceb) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(context): structured task state with append-only JSONL log ([#2033](https://github.com/williamzujkowski/nexus-agents/issues/2033))

  Adds a per-task state module that lets long-running orchestration
  tasks record decisions, blockers, stage transitions, and position in
  an append-only log keyed by taskId. The log replays forward into a
  current `StructuredTaskState` snapshot, so resume-after-restart
  reads the latest state without replaying everything.

  Replaces ad-hoc `memory_write` calls for multi-step orchestration
  per the GSD STATE.md pattern. No new MCP tool yet — pure
  filesystem + reducer foundation so downstream work can choose
  whether to surface it as MCP, CLI, or programmatic.
  - `StructuredTaskStateSchema` + `StructuredTaskLogEntrySchema` (Zod)
    - Stages: `planning | executing | verifying | complete | blocked`
    - Entry types: `init | decision | blocker | blocker_resolved | stage | position`
  - `initTaskState` / `appendDecision` / `appendBlocker` /
    `resolveBlocker` / `updateStage` / `updatePosition` helpers
  - `readTaskState` reduces the log to the final snapshot
  - `reduceLogEntries` pure reducer (exported for tests and callers
    that want to fold an in-memory sequence)
  - Path-traversal safe; taskId validated before any filesystem
    operation
  - Storage: `~/.nexus-agents/tasks/state-{taskId}.jsonl` (directory
    mode 0o700, file mode 0o600)

  12 tests cover round-trip, missing init, append + resolve,
  reducer purity, path-traversal rejection, and malformed-line
  resilience.

  Child of [#1574](https://github.com/williamzujkowski/nexus-agents/issues/1574) (SWE-bench Verified prep) via [#2030](https://github.com/williamzujkowski/nexus-agents/issues/2030).

## 2.43.0

### Minor Changes

- [#2038](https://github.com/williamzujkowski/nexus-agents/pull/2038) [`6fae6a3`](https://github.com/williamzujkowski/nexus-agents/commit/6fae6a3174f3cdc69c42011815b75361b0a40f6a) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(orchestration): topological wave assignment for agent plans ([#2034](https://github.com/williamzujkowski/nexus-agents/issues/2034))

  Adds a DAG-based wave assignment utility to aorchestra. Agent plans
  can now declare `dependsOn: string[]` edges; `topologicalWaveAssign`
  returns the plan with each entry's wave set to
  `max(wave of deps) + 1`, so independent work parallelizes while
  dependent work sequences.
  - New module `orchestration/aorchestra/topological-wave.ts` with:
    - `topologicalWaveAssign<T extends WaveEntry>(entries)` →
      `Result<entries, CycleError | MissingDependencyError>`
    - `groupByTopologicalWave<T extends WaveEntry>(entries)` →
      `T[][]` grouped by wave, sorted ascending
    - Named distinct from the existing `groupByWave` in
      `worker-dispatcher.ts` to avoid export collision.
  - 13 tests cover: empty input, no-deps passthrough, linear chain,
    diamond, disconnected components, direct cycle, self-loop,
    missing dependency, input immutability, and wave grouping.
  - NOT yet integrated with the live worker-dispatcher pipeline —
    that's an explicit follow-up so this first PR stays reviewable.

  Child of [#1574](https://github.com/williamzujkowski/nexus-agents/issues/1574) (SWE-bench Verified prep) via [#2030](https://github.com/williamzujkowski/nexus-agents/issues/2030) breakdown.

## 2.42.0

### Minor Changes

- [#2036](https://github.com/williamzujkowski/nexus-agents/pull/2036) [`a432f88`](https://github.com/williamzujkowski/nexus-agents/commit/a432f88179ab751c90ab3bb60959c53d36a1fa8f) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(swe-bench): per-expert context-budget observer ([#2031](https://github.com/williamzujkowski/nexus-agents/issues/2031))

  Adds non-blocking context-utilization telemetry around
  `expert.execute(task)` in the `execute_expert` MCP tool path.
  - After each expert call succeeds, computes utilization =
    `tokensUsed / contextWindow` (window looked up from the canonical
    model registry via `getModelContextWindow`).
  - When utilization >= `NEXUS_CONTEXT_WARN_THRESHOLD` (default 0.85),
    emits a `context_warning` log entry with `expertId`, `role`,
    `modelId`, raw token counts, percent utilization, and task length.
  - Below threshold, emits `context_utilization` at debug level.
  - Never throws — telemetry failure must not break the caller.

  Addresses [#2031](https://github.com/williamzujkowski/nexus-agents/issues/2031) (child of [#1574](https://github.com/williamzujkowski/nexus-agents/issues/1574) SWE-bench Verified prep epic). The
  workflow layer already has budget enforcement via
  `budget-circuit-breaker.ts`, but expert-direct calls via
  `execute_expert` bypass that path. This closes the visibility gap.

  Next step (separate issue): aggregate these events in the SWE-bench
  runner to identify context-exhaustion failure modes on SWE-bench
  Verified.

## 2.41.0

### Minor Changes

- [#2024](https://github.com/williamzujkowski/nexus-agents/pull/2024) [`6fa5bca`](https://github.com/williamzujkowski/nexus-agents/commit/6fa5bca88c23ed05155037b8716bbd07ebd916b8) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(security): orchestrator opt-in for ClawGuard policy derivation ([#2022](https://github.com/williamzujkowski/nexus-agents/issues/2022))

  Completes the last step of the ClawGuard activation chain: the
  `orchestrate` MCP tool now derives an access policy at task start
  and wraps `orchestrator.execute(...)` in `withAccessPolicy(...)` so
  the middleware chain enforcer ([#2021](https://github.com/williamzujkowski/nexus-agents/issues/2021)) can see it.

  Runtime behavior:
  - `NEXUS_ACCESS_POLICY_MODE` unset or `off` (default): derives a
    bypass/off policy; the middleware short-circuits to pass-through.
    Zero observable change.
  - `NEXUS_ACCESS_POLICY_MODE=audit`: derives a real policy (LLM when
    `deps.modelAdapter` is available, regex fallback otherwise);
    violations are logged but NOT blocked. This is the recommended
    bake mode for telemetry before flipping to enforce.
  - `NEXUS_ACCESS_POLICY_MODE=enforce`: same derivation; violations
    deny the tool call with an `isError` result.

  Derivation failures (adapter error, timeout, etc.) never throw —
  they fall through to a permissive bypass policy so orchestration
  cannot be taken down by a policy-derivation bug. All failures are
  logged.

- [#2026](https://github.com/williamzujkowski/nexus-agents/pull/2026) [`0425a09`](https://github.com/williamzujkowski/nexus-agents/commit/0425a09164dbf146b29d5fa58508ec86a34f0206) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(security): extend ClawGuard opt-in to execute_expert ([#2022](https://github.com/williamzujkowski/nexus-agents/issues/2022) follow-up)

  Mirrors the orchestrate-tool activation from [#2024](https://github.com/williamzujkowski/nexus-agents/issues/2024) for the
  `execute_expert` MCP tool. Every expert invocation now derives an
  access policy from the task description and wraps `expert.execute(task)`
  in `withAccessPolicy(policy, ...)` so the mounted middleware ([#2021](https://github.com/williamzujkowski/nexus-agents/issues/2021))
  can enforce it.

  Behavior matrix is identical to orchestrate:
  - `NEXUS_ACCESS_POLICY_MODE` unset / `off` → bypass policy →
    middleware short-circuit → zero observable change.
  - `audit` → regex-fallback policy (ExecuteExpertDeps has no
    `modelAdapter`, so LLM derivation path isn't available); violations
    logged, execution proceeds.
  - `enforce` → violations deny with `isError` ToolResult.

  Derivation failures never throw — fall through to permissive bypass.

## 2.40.0

### Minor Changes

- [#2021](https://github.com/williamzujkowski/nexus-agents/pull/2021) [`f07367f`](https://github.com/williamzujkowski/nexus-agents/commit/f07367f8ab203cda1c9d88699419a136965b402e) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(security): wire ClawGuard access-policy enforcer into MCP middleware chain ([#1977](https://github.com/williamzujkowski/nexus-agents/issues/1977))

  Activates the access-constraint-deriver runtime guard so every tool
  call in the standard MCP middleware chain now passes through the
  ClawGuard enforcer.
  - Adds `createAccessPolicyChainMiddleware(toolName)` that bridges the
    existing ALS-backed guard (`mcp-guard.ts`) to the strongly-typed
    `Middleware` contract consumed by `buildMiddlewareStack`.
  - Adds `accessPolicy?: boolean` to `MiddlewareSkipConfig` for explicit
    opt-out.
  - The new middleware is **always mounted** but behaves as a no-op
    pass-through unless an orchestrator has wrapped the call with
    `withAccessPolicy(...)` — so runtime behavior is unchanged for
    callers that haven't set up a per-task policy.

  Closes the [#1977](https://github.com/williamzujkowski/nexus-agents/issues/1977) "activation" gap: the deriver + enforcer + smoke
  tests were already landed, but no production code path ran them.
  This is the final wiring that makes the research-backed runtime
  defense actually effective, with a 7-test integration suite
  covering allow/deny/audit/off paths and the hardcoded unbypassable
  tool + path denylists.

  Also widens the return type of `denyToToolResult` from readonly
  arrays to the `{isError; content: Array<…>}` shape that matches the
  middleware chain's `ToolResult` contract.

- [#2016](https://github.com/williamzujkowski/nexus-agents/pull/2016) [`a0023d2`](https://github.com/williamzujkowski/nexus-agents/commit/a0023d290f8e9a5c2d5d970d2bacfaeab98a2486) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(cli): add atbench CLI command ([#1981](https://github.com/williamzujkowski/nexus-agents/issues/1981) follow-up)

  Adds the user-facing `atbench` CLI command with `info` and `run`
  subcommands. Programmatic API exported from `nexus-agents/cli`;
  top-level dispatcher wiring (`nexus-agents atbench ...`) is a
  separate small follow-up.

  ## API

  ```ts
  import { atbenchCommand, parseAtbenchArgs } from 'nexus-agents/cli';

  const opts = parseAtbenchArgs(process.argv.slice(2));
  const result = await atbenchCommand(opts);
  ```

  ## Subcommands
  - `info` — prints variant, source (HF or fixture), scorer mode, instance limit
  - `run` — loads trajectories, scores them via stub or LLM, prints summary with
    precision/recall/F1/confusion matrix

  ## Flags
  - `--variant=<claw|codex>` — dataset variant (default: claw)
  - `--limit=<N>` — cap instances for smoke runs
  - `--fixture=<path>` — local JSONL instead of HuggingFace
  - `--llm-scoring` — enable LLM scorer (default: stub oracle)
  - `--verbose, -v` — per-instance progress

  ## Tests (17 new)
  - arg parsing: defaults, info subcommand, all flags, invalid limit fallback
  - runInfo: HF source vs fixture source
  - runEvaluation against local fixture: 100% pass with stub oracle, --limit cap, verbose progress
  - atbenchCommand top-level dispatch: routes info vs run
  - printAtbenchHelp: smoke

  ## Validation
  - typecheck clean
  - 17/17 atbench-command tests pass
  - 3364/3364 cli + benchmarks tests pass overall
  - TypeDoc regenerated

  ## [#1981](https://github.com/williamzujkowski/nexus-agents/issues/1981) progress

  | Sub-task                       | Status                                                                   |
  | ------------------------------ | ------------------------------------------------------------------------ |
  | BenchmarkAdapter contract impl | ✅ [#1996](https://github.com/williamzujkowski/nexus-agents/issues/1996) |
  | Stub scorer + confusion math   | ✅ [#1996](https://github.com/williamzujkowski/nexus-agents/issues/1996) |
  | HF dataset loader              | ✅ [#2006](https://github.com/williamzujkowski/nexus-agents/issues/2006) |
  | LLM-based scorer               | ✅ [#2010](https://github.com/williamzujkowski/nexus-agents/issues/2010) |
  | **CLI integration**            | ✅ this PR (programmatic API; top-level dispatcher wiring follow-up)     |
  | CI smoke workflow              | ⏳ follow-up                                                             |

- [#2018](https://github.com/williamzujkowski/nexus-agents/pull/2018) [`91671f8`](https://github.com/williamzujkowski/nexus-agents/commit/91671f807a74a9c4cc53039885ebc56dfa3e3793) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(cli): wire atbench into top-level dispatcher ([#1981](https://github.com/williamzujkowski/nexus-agents/issues/1981))

  Completes the CLI integration for ATBench. After this PR, end users
  can invoke the benchmark directly:

  ```bash
  nexus-agents atbench info
  nexus-agents atbench run --variant=claw --limit=10
  nexus-agents atbench run --fixture=./test/fixture.jsonl --verbose
  ```

  ## Changes
  - `cli-types.ts` — added `'atbench'` to the command union and validCommands array
  - `cli-commands-handlers-complex.ts` — `handleAtbenchCommand` builds argv from parsed CLI args and dispatches to `atbenchCommand` from `cli/atbench-command.ts`
  - `cli-commands-handlers.ts` — re-exports `handleAtbenchCommand` for the dispatcher
  - `cli-commands.ts` — wired into the command-handler map (`atbench: handleAtbenchCommand`)
  - `cli-help-text.ts` — added ATBENCH OPTIONS block and example invocations
  - `cli-commands.test.ts` — added `handleAtbenchCommand` to the mock map

  ## Tests
  - 38 dispatcher + handler tests pass
  - 26043/26059 full-suite pass
  - typecheck clean
  - TypeDoc regenerated

  ## [#1981](https://github.com/williamzujkowski/nexus-agents/issues/1981) status

  | Sub-task                        | Status             |
  | ------------------------------- | ------------------ |
  | BenchmarkAdapter contract       | ✅                 |
  | Stub scorer + math              | ✅                 |
  | HF dataset loader               | ✅                 |
  | LLM-based scorer                | ✅                 |
  | CLI programmatic API            | ✅                 |
  | **Top-level dispatcher wiring** | ✅ this PR         |
  | CI smoke workflow               | ⏳ final follow-up |

### Patch Changes

- [#2019](https://github.com/williamzujkowski/nexus-agents/pull/2019) [`2f35ed1`](https://github.com/williamzujkowski/nexus-agents/commit/2f35ed184491f8aa4086fdf7fdd49e527cbdf22f) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - ci(atbench): add fixture-based smoke workflow ([#1981](https://github.com/williamzujkowski/nexus-agents/issues/1981))

  Adds an in-repo JSONL fixture (`test-fixtures/atbench-smoke.jsonl`)
  and a `.github/workflows/atbench-smoke.yml` PR gate that exercises
  `atbench info` and `atbench run --fixture=...` end-to-end against
  the stub scorer. Stays offline (no HF, no LLM) and asserts the
  stub oracle returns `5/5 passed` with `F1=1.000`.

  Also wires the `--fixture` and `--llm-scoring` flags into
  `PARSE_ARGS_CONFIG` and the top-level argv builder so they are
  accepted by `nexus-agents atbench run`.

## 2.39.1

### Patch Changes

- [#2009](https://github.com/williamzujkowski/nexus-agents/pull/2009) [`4f9f9bc`](https://github.com/williamzujkowski/nexus-agents/commit/4f9f9bc764082fc91604aa59a347e9fb22067ff1) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - docs: refresh stale Last Updated timestamps (closes [#2004](https://github.com/williamzujkowski/nexus-agents/issues/2004))

  Bumped 5 timestamps to 2026-04-19; added "last validated" banner
  to 4 docs needing content refresh.

## 2.39.0

### Minor Changes

- [#2006](https://github.com/williamzujkowski/nexus-agents/pull/2006) [`6220ced`](https://github.com/williamzujkowski/nexus-agents/commit/6220cedff09bc5c6cd040ca67b42bef343e7b0ae) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(benchmarks): atbench huggingface dataset loader ([#1981](https://github.com/williamzujkowski/nexus-agents/issues/1981) follow-up)

  Adds the HuggingFace Datasets API loader for the ATBench adapter
  ([#1981](https://github.com/williamzujkowski/nexus-agents/issues/1981)). Mirrors the swe-bench `dataset-loader.ts` pattern: native
  fetch, no auth needed for public datasets, paginated up to 100 rows
  per request, 30s timeout.

  **Behavior change:** `ATBenchAdapter.loadInstances()` now falls back
  to HuggingFace when no `fixturePath` is provided. Existing fixture-
  based tests still work unchanged. Production callers can omit
  `fixturePath` and get the live dataset:

  ```ts
  const adapter = new ATBenchAdapter('claw');
  const instances = await adapter.loadInstances({
    variant: 'claw',
    maxInstances: 50, // optional cap for smoke runs
  });
  ```

  **Tests** (12 new, ATBench module total now 27):
  - fetchPage: 2xx happy path, URL encoding, 4xx errors, missing-rows[],
    network-failure
  - fetchAtbenchFromHf: single-page success, pagination short-return
    termination, drop-invalid-rows count, all-rows-invalid error,
    empty-upstream OK, codex variant URL, network-failure surface
  - adapter: HF fallback when no fixturePath (verifies error path)

  Resilience: invalid rows are DROPPED with a count rather than failing
  the whole load, so upstream HF schema drift produces a partial result
  - telemetry rather than a crash.

  Validation: 218/218 benchmark tests pass, typecheck clean, TypeDoc
  regenerated.

- [#2010](https://github.com/williamzujkowski/nexus-agents/pull/2010) [`4439a14`](https://github.com/williamzujkowski/nexus-agents/commit/4439a14d36ee5667d6e215ad8515a315ecc8524b) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(benchmarks): atbench llm-based safety scorer ([#1981](https://github.com/williamzujkowski/nexus-agents/issues/1981) follow-up)

  Replaces the perfect-oracle stub with a real IModelAdapter-backed
  classifier. Mirrors the ClawGuard llm-deriver pattern: Promise.race
  timeout, Zod-validated output, discriminated `LlmScoreResult`,
  fall-through to stub on any LLM failure (timeout, error, parse,
  empty, invalid label).

  **New API**

  `ATBenchAdapter` constructor accepts an options object:

  ```ts
  new ATBenchAdapter({
    variant: 'claw',
    scorerAdapter: registry.getAdapterForCli('claude'), // optional
    scorerTimeoutMs: 5_000, // optional
  });
  ```

  When `scorerAdapter` is omitted, `runInstance` returns the perfect-
  oracle stub (existing behavior). When provided, each trajectory is
  scored via LLM with stub fallback on failure.

  **Backwards-compatible**: existing `new ATBenchAdapter('claw')` and
  `new ATBenchAdapter('codex')` calls still work.

  **New module** `llm-scorer.ts` (~190 LOC):
  - `formatTrajectoryPrompt(trajectory)` — structured prompt with caps
    on event/transcript size for cheap-model context budgets
  - `scoreTrajectoryViaLlm(adapter, trajectory, timeoutMs?)` — returns
    `LlmScoreResult` discriminated union
  - `LlmScorerOutputSchema` — Zod-validated JSON shape: `{ label, reasoning }`

  **Tests** (12 new for llm-scorer + 2 for adapter integration; 41
  module total now):
  - formatTrajectoryPrompt: includes user request, lists tool events,
    caps at 20 entries, truncates 800-char request to 500
  - happy path: LLM returns valid JSON → LLM-derived prediction
  - markdown code-fence wrap handled correctly
  - Failure modes (all → stub fallback): adapter error, timeout,
    garbage non-JSON, empty response, invalid label value
  - adapter integration: stub used when no scorerAdapter; LLM used
    when provided (LLM result overrides ground truth)

  Validation: 232/232 src/benchmarks/ tests pass, typecheck clean,
  TypeDoc regenerated.

### Patch Changes

- [#2008](https://github.com/williamzujkowski/nexus-agents/pull/2008) [`c592157`](https://github.com/williamzujkowski/nexus-agents/commit/c592157dac2e0c739845670d892f59317037fdb9) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - docs: fix stale 5 CLIs claim → 4 CLIs (closes [#2003](https://github.com/williamzujkowski/nexus-agents/issues/2003))

  Per CLI_NAMES in src/config/model-capabilities-types.ts. codex-mcp
  is not a distinct CLI.

## 2.38.0

### Minor Changes

- [#2001](https://github.com/williamzujkowski/nexus-agents/pull/2001) [`7e22b2f`](https://github.com/williamzujkowski/nexus-agents/commit/7e22b2fcfe5e527b71b2af3373e0d7f407831abf) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(security): clawguard mcp dispatch wiring ([#1977](https://github.com/williamzujkowski/nexus-agents/issues/1977) final piece)

  Closes the last structural piece of [#1977](https://github.com/williamzujkowski/nexus-agents/issues/1977) — the dispatch-path wiring
  that plugs the access-constraint-enforcer into the MCP tool dispatch
  chain.

  **New module** `security/access-constraint-deriver/mcp-guard.ts`:
  - `withAccessPolicy(policy, fn)` — runs `fn` with `policy` available
    via AsyncLocalStorage. Orchestrators (orchestrate, execute_expert)
    derive a policy at task start and wrap downstream work.
  - `getActivePolicy()` — reads the ALS-stored policy (undefined if no
    wrapping)
  - `guardMcpToolCall(tool, args?)` — pure helper returning an
    AccessDecision; uses the active policy if one is in scope, else
    returns `allow`
  - `createAccessPolicyMiddleware({ toolName, logger })` — factory for an
    MCP-middleware-compatible function that:
    - No-ops when no policy is active or policy is in `off` mode
    - Logs warnings and forwards in `audit` mode
    - Returns MCP-format `isError` result in `enforce` mode
  - `denyToToolResult(decision, requestId)` — formats a deny as the
    SDK's CallToolResult isError shape

  **18 new tests** (total module count now 93):
  - ALS propagation across async boundaries
  - Nested `withAccessPolicy` (inner wins)
  - Middleware pass-through (no policy / off mode)
  - Middleware log-and-allow (audit)
  - Middleware deny → isError result (enforce)
  - Denylist wins over bypass policy + audit mode
  - Path extraction from typed args for path denylist
  - End-to-end smoke: derive → withAccessPolicy → guardMcpToolCall

  **Runtime behavior unchanged**: nothing in the orchestrator layer is
  yet calling `withAccessPolicy`. The wiring is complete and ready; the
  rollout is a separate operator decision gated on:
  1. Orchestrator (`orchestrate`, `execute_expert`) opts in by wrapping
     task execution in `withAccessPolicy(await deriveAccessPolicy(...))`
  2. MCP middleware chain adds `createAccessPolicyMiddleware(...)` as a
     stage (likely after validation, before rate-limit)
  3. `NEXUS_ACCESS_POLICY_MODE` flipped off → audit
  4. Empirical <500ms p95 validation across real traffic (condition 6)
  5. Flip audit → enforce after clean telemetry

  **All 7 vote conditions now satisfied at the module level:**
  1. ✅ LLM call via UnifiedAdapterRegistry-compatible IModelAdapter
  2. ✅ Zod types + Result-style decisions
  3. ✅ Unbypassable denylist (paths + tools)
  4. ✅ Trust-tier gating on objective
  5. ✅ Policy cache + LLM timeout
  6. 🔧 **Wired and ready**; empirical validation is operator-side
  7. ✅ Deterministic tests (93 total across 8 files)

  **Total file count for this cycle**: 8 source + 8 test files in
  `src/security/access-constraint-deriver/`, 93 tests.

  Follow-ups that can ship independently:
  - orchestrator opt-in to `withAccessPolicy`
  - CLI flag / config for enabling the middleware per-deployment
  - Audit log schema for `access-policy: audit violation` / denied events

## 2.37.0

### Minor Changes

- [#1999](https://github.com/williamzujkowski/nexus-agents/pull/1999) [`2d35a1d`](https://github.com/williamzujkowski/nexus-agents/commit/2d35a1d6751ef2a78d030ca50d794aa6b00567b2) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(security): clawguard llm deriver + trust-gate + fallback + smoke tests ([#1977](https://github.com/williamzujkowski/nexus-agents/issues/1977) near-complete)

  Completes most of the vote-approved conditions for the ClawGuard
  (access-constraint-deriver) module ([#1977](https://github.com/williamzujkowski/nexus-agents/issues/1977)). Builds on [#1993](https://github.com/williamzujkowski/nexus-agents/issues/1993) (skeleton)
  and [#1997](https://github.com/williamzujkowski/nexus-agents/issues/1997) (denylist + cache).

  **What lands:**
  - **LLM deriver** (`llm-deriver.ts`) — uses injected `IModelAdapter`
    to derive a TaskAccessPolicy from the user objective. Structured
    induction prompt per design doc. Zod validation on the LLM's JSON
    output. `Promise.race` timeout bounds the call. Returns a
    `LlmDerivationResult` discriminated-union so callers can distinguish
    success from each failure mode (llm-error / llm-timeout / llm-parse-
    error / llm-exception / llm-empty-response). Condition 1 ✓
  - **Regex fallback** (`fallback-regex.ts`) — deterministic keyword-based
    deriver used when the trust gate rejects the LLM path, when the LLM
    fails, or when no adapter is provided. Three keyword groups (read-
    only / read-write / refuse) produce a conservative policy. Ambiguous
    tasks default to read-only. Condition 1 fallback ✓
  - **Trust-tier gate** (`trust-gate.ts`) — Tier 1/2 objectives may go to
    the LLM; Tier 3/4 (untrusted/hostile) and missing tiers route
    directly to the regex fallback, never exposing the LLM deriver to
    prompt-injection content. Condition 4 ✓
  - **deriveWithTelemetry** — returns policy + latency + source +
    trust-decision + fallback-reason. Enables post-wiring <500ms p95
    validation (condition 6).
  - **Backwards-compat `deriveAccessPolicy(str)` signature preserved** —
    existing callers continue to work; new options are optional.

  **Smoke test suite** (`smoke.test.ts`, 11 tests):

  End-to-end integration with a mocked IModelAdapter exercising:
  - Happy path: Tier 1 + successful LLM → LLM-derived policy
  - LLM error / timeout / parse garbage → regex fallback
  - Tier 3 input never invokes the adapter (spy verified)
  - Cache hit on repeat → adapter called once across two derivations
  - **Denylist wins over LLM-granted paths** — even when a compromised
    LLM says to allow `~/.ssh/**`, the enforcer denies with
    `matchedRule: 'unbypassable:path'`
  - **Denylist wins over LLM-granted tools** — force-push denial holds
    under any policy
  - Off-mode short-circuits to bypass without calling LLM
  - Telemetry shape validated (latencyMs non-negative, cache-hit signaled)

  **Runtime impact: still none** — dispatch is not wired to the
  enforcer. That wiring is the final follow-up.

  **Condition scorecard:**
  - [x] 1. UnifiedAdapterRegistry-compatible LLM call with regex fallback
  - [x] 2. Types + Zod validation (earlier)
  - [x] 3. Unbypassable denylist (earlier)
  - [x] 4. Trust-tier gating on objective input
  - [x] 5. Policy cache (earlier) + LLM timeout
  - [x] 7. Deterministic tests (86 tests total across the module)
  - [ ] 6. Empirical <500ms p95 validation — post-wiring, needs production traffic

  **Test summary:**
  - 86 unit + smoke tests across 7 files (was 51)
  - full `src/security/`: 1698/1698 pass
  - typecheck clean
  - TypeDoc regenerated

## 2.36.0

### Minor Changes

- [#1997](https://github.com/williamzujkowski/nexus-agents/pull/1997) [`f75fcb4`](https://github.com/williamzujkowski/nexus-agents/commit/f75fcb4a208ec240da543b6d3f8a5657b61617ea) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(security): ClawGuard denylist + policy cache ([#1977](https://github.com/williamzujkowski/nexus-agents/issues/1977) partial)

  Extends the access-constraint-deriver skeleton ([#1993](https://github.com/williamzujkowski/nexus-agents/issues/1993)) with two
  vote-approved conditions from the design review of [#1977](https://github.com/williamzujkowski/nexus-agents/issues/1977):

  **Condition 3: Hardcoded unbypassable denylist** (`denylist.ts`)

  A list of file-path patterns and tool names that no LLM-derived policy
  may override. Applied FIRST in the enforcer, before the per-task policy
  check. Malicious user objectives or poisoned LLM output cannot grant
  access to credentials/secrets because the denylist rule wins regardless.

  Path patterns cover: `.env` files, SSH keys, AWS/Azure/GCP/kube creds,
  `/etc/shadow`, `/etc/sudoers`, common secret file patterns.

  Tool names cover: force-pushes, destructive git/fs operations, identity
  mutations, remote destruction.

  **Condition 5: Policy cache** (`cache.ts`)

  In-memory LRU cache keyed by objectiveHash. Avoids re-derivation on
  repeated invocations of the same task. Default capacity 256 entries
  with LRU eviction. Singleton with reset for tests.

  **Enforcer now takes an optional `args.path`** so file-path denylist
  matching works. Existing callers (none in production yet — skeleton
  not wired to dispatch) unaffected.

  ## Still remaining for [#1977](https://github.com/williamzujkowski/nexus-agents/issues/1977) full implementation
  - [ ] Condition 1: UnifiedAdapterRegistry LLM call with regex fallback
  - [ ] Condition 4: Trust-tier gating on objective input
  - [ ] Condition 6: Empirical <500ms p95 validation before enforce mode
  - [ ] Dispatch path wiring (MCP tool boundary hook)

  ## Validation
  - 51 tests across 3 files (17 original + 18 denylist + 16 cache/enforcer extension)
  - Full security suite: all passing
  - typecheck clean
  - TypeDoc regenerated

## 2.35.0

### Minor Changes

- [#1996](https://github.com/williamzujkowski/nexus-agents/pull/1996) [`b0a3d45`](https://github.com/williamzujkowski/nexus-agents/commit/b0a3d45f9d3fa2b3661fe6bc3e5675df0ce951a7) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(benchmarks): add ATBench skeleton adapter ([#1981](https://github.com/williamzujkowski/nexus-agents/issues/1981) partial)

  Tier 1 (score-only) skeleton of ATBench — trajectory safety benchmark
  from arxiv-2604.14858. Public dataset:
  https://huggingface.co/datasets/AI45Research/ATBench-Claw

  Lands the `BenchmarkAdapter` contract implementation with deterministic
  stub scorer so the pipeline works end-to-end before the LLM classifier
  integration arrives. Follow-up adds HF dataset loader + real security-
  expert scorer per the vote-approved design ([#1981](https://github.com/williamzujkowski/nexus-agents/issues/1981)).

  **New exports from `nexus-agents/benchmarks`:**
  - `ATBenchAdapter` — implements BenchmarkAdapter contract (load/run/evaluate/isPass/summarize)
  - `scoreTrajectoryStub()`, `classifyConfusion()` — scorer helpers
  - `ATBenchTrajectory`, `ATBenchPrediction`, `ATBenchEvalResult`, `SafetyLabel`, `SafetyTaxonomy`, `ToolEvent` types + Zod schemas

  **Fixture-based for now.** `loadInstances` requires `config.fixturePath` pointing at a JSONL file; HF download path is the follow-up.

  **Scoring math is real.** Tier 1 stub is a perfect oracle (echoes ground truth) to exercise the contract deterministically, but precision/recall/F1/confusion-matrix computation is production code.

  15 tests pass covering:
  - confusion classification (tp/tn/fp/fn)
  - fixture loading (+ maxInstances cap, missing-path error)
  - adapter contract (name, variant, runInstance, evaluate, isPass)
  - summarize math (precision/recall/F1, empty-results zeros)

### Patch Changes

- [#1994](https://github.com/williamzujkowski/nexus-agents/pull/1994) [`f0fd91d`](https://github.com/williamzujkowski/nexus-agents/commit/f0fd91d3de440ec84731f7fd7050c481fc44e749) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - docs(cli-adapters,coordination): correct task-classifier and task-features deprecation markers (closes [#1985](https://github.com/williamzujkowski/nexus-agents/issues/1985))

  Audit during [#1985](https://github.com/williamzujkowski/nexus-agents/issues/1985) found that the `@deprecated — use SharedTaskAnalyzer`
  markers on two modules were aspirational, not actionable:
  - `cli-adapters/task-classifier.ts` exposes `FallbackTaskType` — a 5-value
    taxonomy (code/research/documentation/analysis/general) tuned for
    CLI fallback-chain selection. `SharedTaskAnalyzer.TaskTypeCategory`
    has 9 values tuned for capability routing. They are not interchangeable.
  - `agents/coordination/task-features.ts` exposes `extractTaskFeatures` —
    produces `ScalingTaskType`-categorized features for the scaling-predictor
    model. That is a different feature set than `SharedTaskAnalyzer.analyze()`
    produces for capability routing.

  Both modules serve distinct, still-needed purposes. Removed the misleading
  `@deprecated` markers and clarified each module's role + relationship to
  `SharedTaskAnalyzer`. No code behavior changes.

  The original issue [#1985](https://github.com/williamzujkowski/nexus-agents/issues/1985) ("migrate to SharedTaskAnalyzer") is resolved
  because there is nothing to migrate — the modules were incorrectly
  deprecated. A future unification (if warranted) would be a new design
  proposal, not a 1:1 migration.

## 2.34.0

### Minor Changes

- [#1993](https://github.com/williamzujkowski/nexus-agents/pull/1993) [`65861d2`](https://github.com/williamzujkowski/nexus-agents/commit/65861d22e921fc6e1083c4bf853ce4bde1320994) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(security): add access-constraint-deriver skeleton ([#1977](https://github.com/williamzujkowski/nexus-agents/issues/1977) partial)

  Lands the skeleton module for ClawGuard-style per-task tool access
  policies (arxiv-2604.11790). Current state is **skeleton only** —
  off/audit/enforce modes all return a bypass (allow-all) policy.

  **New exports from `nexus-agents/security`:**
  - `deriveAccessPolicy(objective): Promise<TaskAccessPolicy>` — returns a bypass policy in all modes today
  - `checkAccess(toolName, policy): AccessDecision` — enforcer; passes through under bypass
  - `resolveAccessPolicyMode(env?): 'off' | 'audit' | 'enforce'` — reads `NEXUS_ACCESS_POLICY_MODE`
  - `TaskAccessPolicy`, `AccessDecision`, `AccessPolicyMode`, `AccessOperation` types + Zod schemas

  **Runtime behavior: unchanged.** Default `NEXUS_ACCESS_POLICY_MODE=off` is a no-op. Dispatch path is NOT yet wired to the enforcer; that lands when the full LLM-derivation implementation arrives (follow-up commit).

  **Why land the skeleton separately:**

  Design was vote-approved in [#1977](https://github.com/williamzujkowski/nexus-agents/issues/1977) with 7 mandatory PR conditions. This PR covers conditions that can land without the LLM integration:
  - ✅ Types + Zod validation (condition 2)
  - ✅ Result-style `AccessDecision` discriminated union (condition 2)
  - ✅ Deterministic tests for the skeleton surface (condition 7)
  - ⏳ UnifiedAdapterRegistry LLM call (condition 1) — deferred
  - ⏳ Hardcoded unbypassable denylist (condition 3) — deferred
  - ⏳ Trust-tier gating on objective (condition 4) — deferred
  - ⏳ Timeout + cache (condition 5) — deferred
  - ⏳ <500ms p95 validation (condition 6) — deferred

  17 tests cover mode resolution, objective hashing, skeleton derivation,
  and enforcer contract (allow/deny/log-and-allow).

  Full security suite passes (1640/1640).

### Patch Changes

- [#1991](https://github.com/williamzujkowski/nexus-agents/pull/1991) [`aa374d3`](https://github.com/williamzujkowski/nexus-agents/commit/aa374d3a1db2d8f15495e543d62b19b6a227d2d8) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - chore(deps): bump cspell 9.8.0 → 10.0.0 (closes [#1988](https://github.com/williamzujkowski/nexus-agents/issues/1988))

  cspell major bump evaluated and applied. Breaking changes:
  - Requires Node.js >=22.18 (we use Node 22, CI setup-node defaults to
    latest 22.x — no action needed; local dev is on 22.22 already)
  - Internal `import-fresh` v3→v4 async shift — does not affect consumers

  Dictionary: added `yourname` as a placeholder word used in ECOSYSTEM.md
  template-repo examples.

  Validation: `pnpm spell` passes 139 files / 0 issues.

- [#1989](https://github.com/williamzujkowski/nexus-agents/pull/1989) [`5b45187`](https://github.com/williamzujkowski/nexus-agents/commit/5b451878db56ba651465fce9eab01a14e62694de) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - chore(deps): minor + patch bumps across monorepo (closes [#1987](https://github.com/williamzujkowski/nexus-agents/issues/1987))

  Safe minor/patch bumps only — no major-version changes in this batch.

  **nexus-agents (runtime)**
  - @ai-sdk/anthropic → 3.0.71
  - @ai-sdk/google → 3.0.64
  - @ai-sdk/openai → 3.0.53
  - @google/genai → 1.50.1
  - ai (Vercel AI SDK) → 6.0.168
  - better-sqlite3 → 12.9.0
  - typescript → 6.0.3

  **nexus-agents (dev)**
  - @changesets/cli → 2.31.0
  - eslint → 10.2.1
  - prettier → 3.8.3
  - typescript-eslint → 8.58.2

  **website**
  - astro → 6.1.8
  - @astrojs/svelte → 8.0.5
  - svelte → 5.55.4

  Excluded from this batch (need separate review):
  - cspell 9.8.0 → 10.0.0 (major bump — tracked in [#1988](https://github.com/williamzujkowski/nexus-agents/issues/1988))
  - ts-morph 27 → 28 (major bump)
  - typescript 5 → 6 for nexus-agents-website (major bump)
  - @anthropic-ai/sdk 0.88 → 0.90 (pre-1.0 — semver-minor treated as major)

## 2.33.2

### Patch Changes

- [#1972](https://github.com/williamzujkowski/nexus-agents/pull/1972) [`f58b043`](https://github.com/williamzujkowski/nexus-agents/commit/f58b0430c703aa840f35805df21a7748b75e77c6) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - deprecate(swe-bench): mark in-tree SWE-bench wrappers as superseded by nexus-eval-swebench ([#1966](https://github.com/williamzujkowski/nexus-agents/issues/1966))

  The standalone [nexus-eval-swebench](https://github.com/williamzujkowski/nexus-eval-swebench) package (built on the `BenchmarkAdapter` contract) is now the recommended way to run SWE-bench from nexus-agents.

  Changes in this release:
  - `nexus-agents swe-bench` CLI prints a one-time deprecation warning on invocation. Suppress with `NEXUS_SUPPRESS_SWEBENCH_DEPRECATION=1`.
  - `printSweBenchHelp()` surfaces the migration path at the top of `--help` output.
  - `src/exports/swe-bench.ts` barrel has a deprecation notice in its docstring with a migration example.

  The in-tree runner and types remain fully functional and exported — `nexus-eval-swebench` itself consumes `SWEBenchRunner` via peer dep, so we cannot remove them without a breaking change. This deprecation is informational only; no runtime behavior changes.

  Migration:

  ```ts
  // Before
  import { SWEBenchRunner } from 'nexus-agents';
  const runner = new SWEBenchRunner({ variant: 'lite' });

  // After (recommended)
  import { runBenchmark } from 'nexus-agents';
  import { SweBenchAdapter } from 'nexus-eval-swebench';
  const summary = await runBenchmark(new SweBenchAdapter({ variant: 'lite' }), {});
  ```

## 2.33.1

### Patch Changes

- [#1969](https://github.com/williamzujkowski/nexus-agents/pull/1969) [`59d8d70`](https://github.com/williamzujkowski/nexus-agents/commit/59d8d7063e961002ff96d9322b8208126b592909) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - fix(benchmarks): wire BenchmarkAdapter contract into public exports ([#1965](https://github.com/williamzujkowski/nexus-agents/issues/1965))

  PR [#1968](https://github.com/williamzujkowski/nexus-agents/issues/1968) shipped the `BenchmarkAdapter` contract + `runBenchmark` orchestrator
  in `src/benchmarks/` but never wired the barrel into `src/index.ts`, so the
  new public API was unreachable via `import { ... } from 'nexus-agents'` in
  v2.33.0. External benchmark repos (nexus-eval-template, nexus-eval-swebench,
  etc.) depend on these exports.

  Changes:
  - Add `src/exports/benchmarks.ts` barrel covering memory, token, consolidation,
    benchmark-report, adapter-latency, and the new adapter contract
  - Wire it into `src/index.ts` and `src/exports/index.ts`
  - Rename `OrchestratorOptions` → `BenchmarkOrchestratorOptions` to avoid
    collision with the existing workflow `OrchestratorOptions` re-exported from
    `exports/agents.ts`
  - Disambiguate `estimateTokens`: the benchmarks-flavored version is
    re-exported as `estimateBenchmarkTokens` (the memory-metric 4-char/token
    heuristic), leaving bare `estimateTokens` to resolve to the context-curator
    variant in `agents/ictm/`

  No behavior change to internal consumers. New public surface:

  ```ts
  import {
    runBenchmark,
    NOOP_PROGRESS,
    estimateBenchmarkTokens,
    type BenchmarkAdapter,
    type BenchmarkRunContext,
    type BenchmarkRunSummary,
    type BenchmarkOrchestratorOptions,
  } from 'nexus-agents';
  ```

  Unblocks standalone benchmark packages ([#1962](https://github.com/williamzujkowski/nexus-agents/issues/1962) nexus-eval-swebench).

## 2.33.0

### Minor Changes

- feat+fix: developer experience, security, docs accuracy

  ### Features

  **feat(cli): enriched `orchestrate --dry-run` output ([#1946](https://github.com/williamzujkowski/nexus-agents/issues/1946))**

  `orchestrate --dry-run` now prints task analysis, cost estimate, and routing plan instead of just a one-line routing decision. Operators can preview complexity, token estimates, projected USD cost against the canonical model registry, and selected CLI before spending tokens.

  **feat(setup): Claude Code MCP permissions snippet ([#1945](https://github.com/williamzujkowski/nexus-agents/issues/1945))**

  `nexus-agents setup` now prints a ready-to-paste permissions snippet for `~/.claude/settings.json`. Lets users pre-approve nexus-agents MCP tools so they work in autonomous/don't-ask Claude Code sessions.

  **feat(adapters): export `DEFAULT_COLLECT_STREAM_MAX_CHUNKS`**

  The default stream chunk cap (100,000) is now part of the public API, alongside `collectStream`. Callers who need to compare against the default can import it rather than hardcoding.

  ### Security

  **fix(deps): patch basic-ftp CVE (GHSA-rp42-5vxx-qpwr) ([#1943](https://github.com/williamzujkowski/nexus-agents/issues/1943))**

  basic-ftp ≤5.2.2 had a DoS via unbounded memory in `Client.list()`. pnpm override forces ≥5.3.0.

  **feat(security): raise OSSF scorecard from 7.1 toward 9+ ([#1942](https://github.com/williamzujkowski/nexus-agents/issues/1942))**
  - Added property-based fuzzing for json-extract and safe-regex (fast-check)
  - Security-Policy: email contact added
  - Signed-Releases: Sigstore build-provenance attestation on release workflow
  - License: standard MIT detection (moved attribution to NOTICE)

  ### Developer experience

  **fix(docs): TypeDoc test exclusion ([#1947](https://github.com/williamzujkowski/nexus-agents/issues/1947))**

  Added `tsconfig.docs.json` that excludes test files. Prevents recurring release CI failures from test-only type errors.

  **chore(release): automate plugin.json version sync ([#1944](https://github.com/williamzujkowski/nexus-agents/issues/1944))**

  `changeset:version` now includes `scripts/sync-plugin-version.ts` in its chain. Plus weekly pricing-drift CI with auto-issue creation, and `llms.txt` regeneration added to the release chain.

  ### Docs

  **docs: tier-1 accuracy audit ([#1949](https://github.com/williamzujkowski/nexus-agents/issues/1949))**

  Corrected 10 numeric inaccuracies across README, docs/README, distribution docs: tool counts 29→30 (5 places), expert types 9→11, memory backends 8→5 (4 places), consensus strategies 7→6 with correct names.

  **docs: silence TypeDoc warning + clear 137 spell-check issues ([#1950](https://github.com/williamzujkowski/nexus-agents/issues/1950), [#1951](https://github.com/williamzujkowski/nexus-agents/issues/1951), [#1952](https://github.com/williamzujkowski/nexus-agents/issues/1952))**

  `pnpm docs` → 0 warnings (was 1 every run). `pnpm spell` → 0 issues across 138 files (was 137 issues across 51 files). Spell check now a real CI signal.

## 2.32.0

### Minor Changes

- [#1940](https://github.com/williamzujkowski/nexus-agents/pull/1940) [`bf7a4c4`](https://github.com/williamzujkowski/nexus-agents/commit/bf7a4c43871fa862ad606e3612fbf256d4b42c44) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(cli-adapters): add generateObject<T> for typed structured output with retry-with-feedback ([#1897](https://github.com/williamzujkowski/nexus-agents/issues/1897))

  New `generateObject()` helper wraps CLI adapter execution with:
  - Zod schema → JSON Schema instruction appended to prompt
  - Automatic JSON extraction from LLM response (object or array)
  - Zod validation of extracted data
  - On validation failure: retry once with the validation error fed back
    to the LLM ("Your previous response failed JSON validation: ...")
  - Returns `Result<GenerateObjectResult<T>, GenerateObjectError>`

  This replaces the manual `extractJsonObject → JSON.parse → Zod.parse`
  pattern scattered across consensus-plan, triangulated-review, security
  fix-generator, and finding-triage. Inspired by vercel/ai's
  `generateObject` and pydantic-ai's parse-retry-with-feedback pattern
  (surfaced in [#1892](https://github.com/williamzujkowski/nexus-agents/issues/1892) research).

## 2.31.1

### Patch Changes

- [#1936](https://github.com/williamzujkowski/nexus-agents/pull/1936) [`dd615b9`](https://github.com/williamzujkowski/nexus-agents/commit/dd615b9d20cb7496642beb5736156bed2548f5cb) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(mcp,graph): wire step notifications into execute-expert + graph-hooks

  Third wave of step-notification migrations. Operators now see:
  - `expert:code_expert` / `expert:security_expert` etc. during expert
    execution with summary like `"code_expert ok"` or `"security_expert failed"`
  - `hook:precondition:nodeId` / `hook:verify:nodeId` during graph workflow
    hook execution with summary like `"precondition passed"` or `"verify failed: ..."`

## 2.31.0

### Minor Changes

- [#1930](https://github.com/williamzujkowski/nexus-agents/pull/1930) [`2ed122d`](https://github.com/williamzujkowski/nexus-agents/commit/2ed122dc5c9036ac4cb5fde33a12bef343a7e435) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(core): human console notifications for step boundaries ([#1930](https://github.com/williamzujkowski/nexus-agents/issues/1930))

  Adds a typed step event bus and stderr console renderer so operators see a
  scannable trail of what nexus-agents is doing when invoked via CLI or
  pipeline. JSON logs remain the source of truth; the renderer is a peer
  subscriber to the same `stepBus`.
  - New `core/step-events` vocabulary: `step.started | step.completed | step.failed`
    with stable fields (stepId, parentStepId, kind, durationMs, errorCategory,
    summary).
  - New `core/with-step` wrapper propagates parent step IDs via AsyncLocalStorage,
    so nested steps display correctly indented without threading context.
  - New `core/console-renderer` subscribes to the bus and writes to stderr only;
    glyph mode when TTY, ASCII otherwise; honors `NO_COLOR`.
  - `core/step-logger-bridge` emits the same events as structured JSON logs for
    backward compatibility.
  - `bootstrapStepNotifications({ mode })` wires both subscribers. Defaults:
    `cli` and `mcp-http` on, `mcp-stdio` off (protects JSON-RPC frames).
    Override with `NEXUS_CONSOLE=0|1`. Bootstrap is idempotent.
  - First canonical migration: `pipeline/dev-pipeline.ts` research,
    security-scan, decompose, plan, and vote stages now emit step events with
    useful summaries (e.g., `83% approved`, `12 tasks`).

  No behavior change to existing JSON logs or MCP frames.

### Patch Changes

- [#1932](https://github.com/williamzujkowski/nexus-agents/pull/1932) [`a28ce80`](https://github.com/williamzujkowski/nexus-agents/commit/a28ce803a631d378c1b0331dd2cf6ff8d29083ac) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(orchestration): wire step notifications into consensus-plan + triangulated-review

  Second wave of step-notification migrations (follows [#1930](https://github.com/williamzujkowski/nexus-agents/issues/1930)). Both
  multi-CLI orchestration entry points now emit `step.started`/`completed`
  events to the shared step bus, with useful summaries:
  - `consensus-plan` → `"3 agreed, 1 divergent, 3/3 CLIs"`
  - `triangulated-review` → `"7 findings (12 raw), 3/3 CLIs"`

  The previous `logger.info` start/end pairs are replaced by `withStep(...)`;
  the ILogger is still used for per-CLI dispatch logs and outcome recording.
  JSON logs remain the source of truth (step events flow through the same
  bus and get logged by the existing bridge).

## 2.30.8

### Patch Changes

- [#1928](https://github.com/williamzujkowski/nexus-agents/pull/1928) [`f7a20c4`](https://github.com/williamzujkowski/nexus-agents/commit/f7a20c46da637a604cb0404eec85dba7b123d71a) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - fix(security): close 6 real CodeQL findings I missed in earlier sweeps

  Pagination bug — earlier alert audits returned only the first 30 of 101 open alerts. After paginating I found 6 real CodeQL bugs (vs the 95 mostly-Scorecard-noise ones):
  - **js/incomplete-multi-character-sanitization** (`mcp/tools/execute-expert.ts:124`): single-pass `<[^>]*>` strip allowed nested-tag bypass like `<scr<script>ipt>`. Now iterates until stable.
  - **js/polynomial-redos × 2**:
    - `swe-bench/prompt-template.ts:176`: replaced regex-based raw-diff extraction (with two `[\s\S]*?` groups) with index-based `indexOf`/`indexOf` scanning + 256KB input bound.
    - `swe-bench/iteration-context.ts:147`: changed greedy `test.*fail` to bounded non-greedy `test.{0,200}?fail`.
  - **js/incomplete-sanitization × 2** (`scripts/review-pr.ts:192, 279`): `replace(/"/g, '\\"')` didn't escape backslashes, allowing `\"` to escape the quoted block. Now uses `spawn` with stdin pipe for the CLI prompt and `gh pr comment --body-file <tempfile>` for the GitHub comment — no shell interpolation at all.
  - **js/shell-command-constructed-from-input** (`swe-bench/test-runner.ts:239`): dismissed as false positive — the `safePattern` allowlist already restricts to `[a-zA-Z0-9_./:*\-[\]]+` (no shell metachars survive), and single-quote wrapping is defense in depth.

## 2.30.7

### Patch Changes

- [#1923](https://github.com/williamzujkowski/nexus-agents/pull/1923) [`58f9f85`](https://github.com/williamzujkowski/nexus-agents/commit/58f9f85d85710ff62c1e678bf9e49242f6b58325) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - fix(workflows): remove abort listener on cleanup to avoid leaks on long-lived signals ([#1913](https://github.com/williamzujkowski/nexus-agents/issues/1913) wave 5)

  `parallel-executor.ts` registered an `abort` listener on the caller-provided `context.signal` but never removed it. When the same long-lived parent signal drives many parallel executions (e.g., a root-request signal handed through a pipeline), listeners accumulate — one per execution. On hot paths this slowly degrades memory and crosses the AbortSignal warning threshold.

  `cleanupExecution` now also calls `signal.removeEventListener('abort', handler)`. The stored signal+handler pair lives in `ParallelState.abortCleanup` so the removal happens idempotently whether the execution completed, errored, or timed out.

## 2.30.6

### Patch Changes

- [#1918](https://github.com/williamzujkowski/nexus-agents/pull/1918) [`416b8cf`](https://github.com/williamzujkowski/nexus-agents/commit/416b8cf85b569cf9e13efa267bf526713874bacc) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - fix(experts): runtime type-guards in all 5 expert result parsers ([#1913](https://github.com/williamzujkowski/nexus-agents/issues/1913) Class A)

  Previously parsers used `JSON.parse(...) as Partial<TResult>` which skipped runtime validation — an LLM returning `{ confidence: "high" }` slipped through the `?? fallback` because a non-empty string is truthy. Now each field is validated with explicit type guards and falls back to safe defaults on mismatch.

  Applied to: code-expert-helpers, architecture-expert-helpers, testing-expert, documentation-expert, security-expert-helpers. Checks the parsed value is a plain object (not null/array), validates `confidence` is a number in [0,1], `operationType`/`analysisType`/`documentationType` match their enum, string arrays contain only strings, `compliance`/`apiDocs` are plain objects.

  6 new regression tests in code-expert-helpers.test.ts covering string-confidence, out-of-range confidence, invalid enum, non-string array elements, non-object JSON (array input).

## 2.30.5

### Patch Changes

- [#1912](https://github.com/williamzujkowski/nexus-agents/pull/1912) [`12c4b40`](https://github.com/williamzujkowski/nexus-agents/commit/12c4b404350c1ceae65f114377c7645adadd0fbf) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - fix(security): eliminate 3 ReDoS patterns surfaced in bug-hunt sweep ([#1912](https://github.com/williamzujkowski/nexus-agents/issues/1912))

  The CodeQL ReDoS fix in v2.30.2 ([#1899](https://github.com/williamzujkowski/nexus-agents/issues/1899)) addressed one `[\s\S]*`-greedy-match pattern in `pipeline/agent-executor.ts`. A focused bug-hunt sweep across `src/cli-adapters/`, `src/orchestration/`, and `src/mcp/` surfaced 3 more call sites with the same anti-pattern:
  - `orchestration/consensus-plan.ts:217` — `/\{[\s\S]*\}/`
  - `orchestration/triangulated-review.ts:232` — `/\[[\s\S]*\]/`
  - `cli-adapters/parsers/gemini-parser-resilient.ts:207-210` — compound pattern with THREE `[\s\S]*` groups (worst case)
  - `mcp/tools/orchestrate-reflection.ts:94` — `/\[[\s\S]*\]/`

  All replaced with the shared ReDoS-safe `extractJsonArray` / `extractJsonObject` helpers (`src/core/json-extract.ts`) — O(n) index-based slicing, no regex backtracking. 10 regression tests including 100k-char pathological inputs that complete in <100ms.

  The local `extractJsonArray` helper in `pipeline/agent-executor.ts` (introduced in [#1899](https://github.com/williamzujkowski/nexus-agents/issues/1899)) is now a re-export of the canonical shared version, preserving API compatibility.

## 2.30.4

### Patch Changes

- [#1908](https://github.com/williamzujkowski/nexus-agents/pull/1908) [`df32d0f`](https://github.com/williamzujkowski/nexus-agents/commit/df32d0f24b3b0a8f2267810bfccbbc558a2373d5) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - fix(adapters): honor task.systemPrompt in gemini and opencode adapters ([#1886](https://github.com/williamzujkowski/nexus-agents/issues/1886))

  Completes the adapter parity fix started in v2.30.1 (codex). All 4 CLI adapters now honor `CompletionRequest.systemPrompt`:
  - **claude**: `--system-prompt` flag (already working)
  - **codex**: `-c model_instructions_file=<tempfile>` (fixed in v2.30.1)
  - **gemini**: `--policy <tempfile>` — preserves system-role framing via gemini's policy file mechanism
  - **opencode**: prepend to stdin content — no system-prompt flag exists in opencode CLI, so systemPrompt is prepended to user content with a `---` separator. Documented tradeoff: loses formal system-role distinction but satisfies the contract.

## 2.30.3

### Patch Changes

- [#1903](https://github.com/williamzujkowski/nexus-agents/pull/1903) [`a9441b6`](https://github.com/williamzujkowski/nexus-agents/commit/a9441b6ec692db4e3998b1051b249b78b743133c) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - fix(release): auto-regen plugin.json + repo-index + TypeDoc during version bump ([#1879](https://github.com/williamzujkowski/nexus-agents/issues/1879))

  Every release left main with stale `.claude-plugin/plugin.json`, `artifacts/repo-index.json`, `docs/reference/capabilities.md`, and TypeDoc HTML — which then failed Governance Drift / Repository Index Verification / TypeDoc Verification checks on every subsequent PR until someone manually pushed a regen commit.

  Extended `pnpm changeset:version` to chain the regen scripts after the version bump. `changesets/action` runs this script when opening the version-bump PR, so the regenerated artifacts land in the same PR as the version bump and main stays in sync after merge. Future PRs no longer trigger drift failures.

## 2.30.2

### Patch Changes

- [#1899](https://github.com/williamzujkowski/nexus-agents/pull/1899) [`64b4fe7`](https://github.com/williamzujkowski/nexus-agents/commit/64b4fe7fec4bf5b679d6c97915df47e120e633b2) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - fix(pipeline): replace ReDoS-prone regex in pipeline task parser

  `parseTasksFromResponse` in `pipeline/agent-executor.ts` used `/\[[\s\S]*\]/` to extract JSON arrays from LLM responses. This regex exhibits polynomial backtracking on pathological input (many leading `[` with no closing `]`) — flagged by CodeQL as `js/polynomial-redos`. Since LLM output is library-controlled input, this is a real DoS risk.

  Replaced with index-based slicing (`indexOf` + `lastIndexOf`), which is O(n) regardless of input shape. Extracted as exported `extractJsonArray` helper with 7 regression tests including 100k-character pathological inputs that complete in <100ms.

## 2.30.1

### Patch Changes

- [#1887](https://github.com/williamzujkowski/nexus-agents/pull/1887) [`8533b6e`](https://github.com/williamzujkowski/nexus-agents/commit/8533b6e5f4e3ea1f5c59e26dbe675423095a408e) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - fix(codex-adapter): honor task.systemPrompt via model_instructions_file ([#1886](https://github.com/williamzujkowski/nexus-agents/issues/1886))

  `CompletionRequest.systemPrompt` is part of the public adapter contract but only `claude-adapter` honored it. `codex`, `gemini`, and `opencode` silently dropped it — making diverse-CLI consensus voting inconsistent depending on which CLI a role was routed to.

  This release fixes the codex adapter via the workaround documented in openai/codex#11588: materialize the systemPrompt to a tempfile, pass `-c model_instructions_file=<path>` to `codex exec`, clean up after the subprocess resolves. Also adds a `CommandConfig.cleanup` hook to `SubprocessCliAdapter` so any adapter can register tempfile cleanup that runs after the subprocess settles (success/error/timeout). Gemini and OpenCode adapter fixes will follow in separate releases.

## 2.30.0

### Minor Changes

- [#1876](https://github.com/williamzujkowski/nexus-agents/pull/1876) [`6b5d907`](https://github.com/williamzujkowski/nexus-agents/commit/6b5d90715a5923004f4b126db947cd826d913d8f) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - feat(experts): add Push-Back Cues + Task Scope Management to 7 experts ([#1865](https://github.com/williamzujkowski/nexus-agents/issues/1865), [#1866](https://github.com/williamzujkowski/nexus-agents/issues/1866))

  Every expert prompt now includes explicit guidance on when to refuse, push back, or escalate instead of compliantly answering. Matching the pattern already established for code-expert and architecture-expert, the remaining 7 experts (data-visualization, documentation, infrastructure, pm, research, security, testing) now carry a dedicated "Push-Back Cues" section with a confidence-threshold cue and domain-specific refusals (e.g. PM spike after 3 clarification rounds, research staleness at 3 years, data-viz single-chart limit at 3 dimensions, infra refuses power-cycle without OOB).

  Task Scope Management sections were also added to the 5 experts that lacked them (data-visualization, documentation, infrastructure, pm, research) so all 9 experts now share scope-bounding guidance.

## 2.29.2

### Patch Changes

- [#1873](https://github.com/williamzujkowski/nexus-agents/pull/1873) [`a5533a3`](https://github.com/williamzujkowski/nexus-agents/commit/a5533a30e40e6041de68e7a0ac49ea070d0be6d9) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - fix(consensus): add overall wall-clock deadline to consensus_vote ([#1871](https://github.com/williamzujkowski/nexus-agents/issues/1871))

  `consensus_vote` could hang indefinitely when a single agent vote promise never settled (e.g. subprocess adapter hang), because per-vote timeouts could be bypassed and `Promise.all()` waited for every promise. The MCP tool would then never write a `tool_result`, taking down the client session.

  Each vote promise is now raced against an overall consensus deadline (per-vote budget × retries + stagger headroom + 60s buffer). Any role that has not resolved when the deadline fires returns an error vote (`overall consensus deadline exceeded`), so partial results always come back within bounded wall-clock time.

## 2.29.1

### Patch Changes

- [#1843](https://github.com/williamzujkowski/nexus-agents/pull/1843) [`c796042`](https://github.com/williamzujkowski/nexus-agents/commit/c79604228bef06be56a69e9ac512edac5d0b3cce) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Fix install-time crash by adding `typescript` to runtime dependencies ([#1841](https://github.com/williamzujkowski/nexus-agents/issues/1841)).

  `src/indexer/symbol-extractor.ts` imports `typescript` directly (used by `ts-morph` internals), but the dep was missing from the published 2.29.0 bundle. Anyone running `npm install -g nexus-agents` or `npx -y nexus-agents --mode=server` (the marketplace install path) hit `ERR_MODULE_NOT_FOUND: typescript` on first invocation, blocking all Claude Code plugin installs.

  Also adds Docker-based pre-publish smoke testing (`Dockerfile.npm-verify` + `scripts/verify-npm-install.sh` + `.github/workflows/npm-verify.yml`) so the same regression cannot reach npm again. The 6-phase smoke runs on every PR touching `package.json` or `src/`, packs the source tarball, installs it in a clean container, and verifies the binary works + MCP stdio handshake returns 30 tools.

## 2.29.0

### Minor Changes

- [`39c44ac`](https://github.com/williamzujkowski/nexus-agents/commit/39c44ac16bfc3bb34a6062b86bafa132b9158c01) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Central workflow hub: memory integration, conditional votes, harness mode, distribution
  - Dev pipeline is now the central workflow hub — all tools feed into unified feedback loop
  - SessionMemory queried before research, QA outcomes written back, RoutingMemory feedback
  - VoteResult discriminated union with conditional_go support
  - Harness mode (mode: 'harness') returns tasks for external implementation
  - dryRun mode stops after plan+vote
  - Checkpoint/resume for crash recovery
  - Research trigger auto-creates tasks from discoveries
  - Project identity rewrite across 15+ files and website
  - Submitted to 7 distribution platforms

## 2.27.0

### Minor Changes

- Model registry v3: 1M Claude context, Gemini 3.1 Pro, GPT-5.4. Staleness detection in doctor. Evergreen documentation with auto-generated model lists. Voter context injection for cross-project consensus. Vote success outcome recording. Consensus error transparency.

## 2.26.1

### Patch Changes

- [`97ec393`](https://github.com/williamzujkowski/nexus-agents/commit/97ec39336a28045784d122081d71487025366f72) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Bug fixes, test performance, and documentation accuracy improvements.

  ### Bug Fixes
  - **run_workflow MCP tool**: Falls back to mock executor when no model adapter is configured, preventing construction-time crash ([#1338](https://github.com/williamzujkowski/nexus-agents/issues/1338))
  - **Workflow input defaults**: `applyInputDefaults()` merges template definition defaults before execution, fixing "Input not found" errors for optional inputs with defaults ([#1339](https://github.com/williamzujkowski/nexus-agents/issues/1339))
  - **Error context**: Improved error messages in 5 silent catch blocks (stdin-lifecycle, step-executor, sdk-adapter, orchestrate-aorchestra, github-provider) ([#1336](https://github.com/williamzujkowski/nexus-agents/issues/1336))
  - **Research registry**: Added multi-agent-worker-dispatch topic to generator helpers ([#1335](https://github.com/williamzujkowski/nexus-agents/issues/1335))
  - **CI security**: Pinned all GitHub Actions to commit SHAs (CWE-829)
  - **Input validation**: Added `.max()` bounds to 6 unbounded string inputs in MCP tool Zod schemas (CWE-20) ([#1341](https://github.com/williamzujkowski/nexus-agents/issues/1341))
  - **Input validation**: Added `.max()` bounds to 6 remaining unbounded inputs — repo-security-plan categories, memory-write metadata, run-workflow inputs, delegate-to-model/consensus-vote output strings, scanner-registry language matrix (CWE-20) ([#1348](https://github.com/williamzujkowski/nexus-agents/issues/1348))
  - **Silent catches**: Fixed 12 silent catch blocks across outcome-store-persistence, recording modules ([#1341](https://github.com/williamzujkowski/nexus-agents/issues/1341)), CLI parsers, MCP tools, and swe-bench ([#1343](https://github.com/williamzujkowski/nexus-agents/issues/1343))
  - **Unbounded collection**: Added MAX_OUTCOMES=10000 FIFO eviction to `ValidationDashboard.outcomes` ([#1344](https://github.com/williamzujkowski/nexus-agents/issues/1344))
  - **Env schema gaps**: Added `NEXUS_AORCHESTRA_DISPATCH` and `NEXUS_WORKER_MAX_CALLS` to env-schema.ts ([#1344](https://github.com/williamzujkowski/nexus-agents/issues/1344))
  - **Error message sanitization**: Added `sanitizeErrorMessage()` at SQLite INSERT point — truncates to 200 chars, redacts API key/token patterns ([#1345](https://github.com/williamzujkowski/nexus-agents/issues/1345))
  - **Error message wiring**: `RecordOutcomeParams.errorMessage` now flows through to SQLite persistence ([#1346](https://github.com/williamzujkowski/nexus-agents/issues/1346))
  - **Untyped catches**: Added `: unknown` to 16 catch bindings across outcome-storage, trace-writer, outcome-feedback, sandbox-executor, docker-sandbox-executor ([#1350](https://github.com/williamzujkowski/nexus-agents/issues/1350))
  - **Silent catches**: Added debug/warn logging to 10 catch paths — docker-sandbox-helpers, correlation-persistence, strategy-distiller-persistence, outcome-storage query methods ([#1350](https://github.com/williamzujkowski/nexus-agents/issues/1350))
  - **Fetch timeout**: Added 10s `AbortSignal.timeout` to models.dev API fetch call
  - **Test persistence hydration**: Added `vi.mock` for `learning-persistence` in 7 test files that used `getOutcomeStore()` without disabling persistence — prevents loading stale outcomes from disk ([#1352](https://github.com/williamzujkowski/nexus-agents/issues/1352))
  - **Flaky timing assertions**: Changed `toBeGreaterThan(0)` to `toBeGreaterThanOrEqual(0)` for timing assertions in journey-simulator and parallel-exploration tests (macOS fast runners)

  ### Features
  - **Learning persistence default**: `NEXUS_PERSIST_LEARNING` now defaults to true — LinUCB routing data persists across sessions. Only routing metadata stored (no user prompts/keys/outputs). Opt out with `NEXUS_PERSIST_LEARNING=false` ([#1345](https://github.com/williamzujkowski/nexus-agents/issues/1345))
  - **Audit logging default**: `config.security.audit.enabled` now defaults to true — SIEM-compatible JSON-L audit logs enabled out of the box. Bounded: 10 files × 10MB max. ([#1347](https://github.com/williamzujkowski/nexus-agents/issues/1347))
  - **Audit hash-chain default**: `enableHashChain` now defaults to true — SHA-256 tamper-evident chain enabled at negligible cost. ([#1350](https://github.com/williamzujkowski/nexus-agents/issues/1350))
  - **Routing memory default**: `routingMemory` and `strategyDistillation` now auto-enable when persistence is on — learned CLI performance and auto-extracted routing rules activate without explicit config. ([#1347](https://github.com/williamzujkowski/nexus-agents/issues/1347))
  - **Async routing pipeline**: 5 fire-and-forget routing stages (confidence-cascade, capability-match, quality-constraint, resource-strategy, distilled-rules) now properly await results and capture scores into `PipelineResult.stageScores`. Pipeline converted from sync to async. ([#1351](https://github.com/williamzujkowski/nexus-agents/issues/1351))
  - **Preference routing default**: `preferenceRouting` now auto-enables when `NEXUS_PERSIST_LEARNING=true` (default). RouteLLM-style learned routing activates after 10 observations. Cold-start guard prevents premature routing. Opt out with `preferenceRouting: false` in YAML config. ([#1353](https://github.com/williamzujkowski/nexus-agents/issues/1353))
  - **Stage scores → TOPSIS integration**: Aggregated stage scores from async routing stages now adjust TOPSIS quality profiles before ranking. CLIs with high stage affinity get quality boosted (up to +15%), low affinity penalized (up to -10%). ([#1354](https://github.com/williamzujkowski/nexus-agents/issues/1354))

  ### Performance
  - **Test suite**: Optimized 3 slowest test files — combined execution reduced 55% (8.1s to 3.6s) ([#1337](https://github.com/williamzujkowski/nexus-agents/issues/1337))
    - template-registry: 3104ms to 877ms (72% reduction via shared beforeAll)
    - rest-server: 2968ms to 700ms (76% reduction via shared Fastify instances)
    - tool-memory: Deduplicated 6 beforeEach/afterEach blocks, fixed mock methods

  ### Test Coverage
  - **117 new unit tests** for previously untested modules ([#1340](https://github.com/williamzujkowski/nexus-agents/issues/1340), [#1342](https://github.com/williamzujkowski/nexus-agents/issues/1342))
    - repo-analyze.ts: 80 tests (normalizeRepoId, detectPackageManager, detectCiProvider, detectSecurityTooling, detectFramework, getLanguageRecommendations, identifyGaps, analyzeRepo)
    - scanner-registry-fetcher.ts: 9 tests (extractScannerEntries, extractLanguageMatrix, clearRegistryCache, getRegistryManifest)
    - recording modules: 17 tests (consensus-vote, create-expert, execute-expert recording)
    - consensus engine branches: 11 tests (closed-proposal voting, agent performance, proof_of_learning, LRU eviction, ISP-over-OW, fallback paths) ([#1342](https://github.com/williamzujkowski/nexus-agents/issues/1342))
    - MCP resources: 10 tests (research-resource, experts-resource, models-resource payload building, error handling, JSON structure) ([#1349](https://github.com/williamzujkowski/nexus-agents/issues/1349))
  - Fixed 2 additional silent catch blocks in recording modules

  ### Documentation
  - Fixed 5 documentation accuracy issues in README.md and ENTRYPOINTS.md
  - Added 4 missing MCP tools to ENTRYPOINTS.md (now 24/24)
  - Updated QUICK_START.md with Gemini/Codex MCP setup steps

## 2.26.0

### Minor Changes

- [`7adb7b6`](https://github.com/williamzujkowski/nexus-agents/commit/7adb7b6bf7238ac3d6a32e84d753549413ded83d) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - ## v2.26.0

  ### Features
  - **MCP Tasks async execution** (#1298): `execute_expert` now uses MCP Tasks primitive for non-blocking background execution with progress heartbeats
  - **MCP Prompt Templates & Resources** (#1286): 4 prompt templates and 3 resource URIs for enhanced MCP integration
  - **Worker Dispatch Pipeline** (#1299, #1307, #1312-#1315, #1318-#1321): Multi-agent worker dispatch with prompt composition, wave execution, conflict detection, dependency-aware scheduling, adaptive wave sizing, and closed-loop learning
  - **Closed-Loop Learning** (#1322): `recordRoutingOutcome()` feeds execution results back to LinUCB bandit for improved model routing
  - **Observability** (#1326): Reliability filtering and wave failure logging for dispatch diagnostics
  - **Code Quality Hardening** (#1290): 56 `any` eliminations, 130 catch blocks with proper logging

  ### Fixes
  - **Rate-limit handling** (#1319, #1320): Stagger consensus votes with inter-agent delay, detect and surface rate-limit errors from subprocess adapters
  - **Synthesis safety** (#1311, #1312, #1327): Sanitize worker outputs, cap synthesis input, guard against division-by-zero in prompt composition
  - **Consensus vote no_quorum** (#1329): Return `no_quorum` status when all votes fail instead of misleading `rejected`
  - **Expert timeout alignment** (#1330): Zod schema min now matches runtime floor (120s) — prevents client-side validation accepting values the server rejects
  - **NaN guard** (#1331): Protect `approvalPercentage` in higher-order voting from NaN propagation
  - **Unhandled promise catches** (#1331): Add `.catch()` handlers to fire-and-forget promises in composite router

  ### Documentation
  - Updated README accuracy: correct tool count (24), workflow count (11), expert count (10), memory backend names
  - Removed vestigial content and outdated references

## 2.7.0

### Features

- **Software Factory Hardening** ([#952](https://github.com/williamzujkowski/nexus-agents/issues/952)) — 7 phases:
  - Execution trace contract with agent/model attribution for pipeline observability
  - Live graph executor with branch coverage tracking
  - 4 YAML scenario fixtures with `scenario` CLI command
  - `query_trace` MCP tool for disk-based JSONL trace queries (21 MCP tools total)
  - LinUCB `seedPriors()` with weather report recommended mappings

- **AOrchestra** ([#935](https://github.com/williamzujkowski/nexus-agents/issues/935)) — Task-adaptive expert selection:
  - AgentPlanner for dynamic team composition based on task keywords
  - Wired into orchestrate pipeline behind `NEXUS_AORCHESTRA` flag

- **V2 Gap Closure** ([#926](https://github.com/williamzujkowski/nexus-agents/issues/926)) — 4 phases:
  - PolicyEvaluator wired into V2 delegate/orchestrate pipelines
  - Governance-enforcer wired into delegate_to_model routing
  - OutcomeStore quality data bridged to LinUCB bandit for reward learning

- **UI/UX Design Skill** ([#946](https://github.com/williamzujkowski/nexus-agents/issues/946)) — Integrated UI UX Pro Max design methodology into UX expert

### Bug Fixes

- **Version drift** ([#963](https://github.com/williamzujkowski/nexus-agents/issues/963)) — Centralized version management via tsup build-time injection; version.ts was stuck at 2.5.0
- **Hardening sweep** ([#961](https://github.com/williamzujkowski/nexus-agents/issues/961)) — ReputationCache max size (1000), research discover threshold (0.1→0.3), policy violation escalateTo context
- **Mesh mode** ([#932](https://github.com/williamzujkowski/nexus-agents/issues/932)) — Removed misleading mesh mode auto-detection
- **MCP timeouts** ([#940](https://github.com/williamzujkowski/nexus-agents/issues/940)) — Increased execute_expert and orchestrate tool timeouts
- **qualitySignals type** ([#928](https://github.com/williamzujkowski/nexus-agents/issues/928)) — Fixed to match TaskOutcome schema (string[] not Record)

### Documentation

- CLI command audit confirms 36 commands ([#933](https://github.com/williamzujkowski/nexus-agents/issues/933))
- Gap #8 resolved by design — adapter layers are correct ([#934](https://github.com/williamzujkowski/nexus-agents/issues/934))
- Software Factory hardening report ([SOFTWARE_FACTORY_REPORT.md](../../docs/architecture/SOFTWARE_FACTORY_REPORT.md))

### Dependencies

- Bumped actions/checkout to v6, actions/setup-node to v6, actions/github-script to v8
- Production dependency group update (8 packages)

## 2.6.0

### Minor Changes

- [`303675c`](https://github.com/williamzujkowski/nexus-agents/commit/303675c8ae04fd42664d735ce30ec864680acea8) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Add release automation CLI commands (#637)

  New CLI commands for streamlined release workflows:
  - `release-notes`: Generate release notes from conventional commits
    - Supports changelog, json, and markdown output formats
    - Groups by Keep a Changelog categories
    - Auto-suggests next semantic version
  - `release-validate`: Expert swarm validation for releases
    - Security: npm audit, secrets scanning
    - Architecture: Fitness score validation (90+ required)
    - Documentation: CHANGELOG, README, governance checks
    - DevOps: Build, lint, typecheck gates
  - `release-announce`: Generate release announcements
    - Blog post generation following project template
    - Bluesky post (300 char limit)
    - Dry-run preview mode

- [#658](https://github.com/williamzujkowski/nexus-agents/pull/658) [`1108750`](https://github.com/williamzujkowski/nexus-agents/commit/110875055f47eedfe6845952a0be0e7cdf1dc507) Thanks [@williamzujkowski](https://github.com/williamzujkowski)! - Absorb standards repo into expert system with 44 skills, 24 knowledge modules, and product-type routing
  - Add 24 knowledge modules enriching SecurityExpert, TestingExpert, CodeExpert, ArchitectureExpert, and DocumentationExpert
  - Register 17 built-in standards skills in SkillLibrary at startup (security, testing, coding, architecture)
  - Add 5 optional lazy-loaded skill packs (compliance, ml-ai, mobile, cloud, misc) with 27 additional skills
  - Integrate product type detection into SharedTaskAnalyzer for 8 product types (api, web-service, cli, frontend-web, mobile, data-pipeline, ml-service, infra-module)
  - Add product matrix configuration with expert weight routing per product type
  - Extract task analysis keywords and product type detector into separate modules
