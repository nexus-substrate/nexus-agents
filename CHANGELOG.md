# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.23.0] - 2026-02-27

### Fixed

- **OpenCode `--dir` flag** — adapter used `--cwd` (non-existent flag); now correctly uses `--dir` for working directory (#1239)
- **OpenCode `getVersion()` override** — base class used `opencode --version` (invalid); now uses `opencode version` subcommand (#1239)
- **Custom endpoint setup guide** — corrected `opencode.json` config format to match official docs (`npm` instead of `driver`, `options.baseURL` instead of top-level, `{env:VAR}` syntax, `limit.context/output`) (#1239)

### Added

- **`--variant` flag passthrough** — supports `high`, `max`, `minimal` reasoning effort levels via strict allowlist (non-allowlisted values silently dropped for security) (#1239)
- **`--thinking` flag passthrough** — enables model thinking block output when `options.thinking: true` (#1239)
- **7 new OpenCode adapter tests** — `--dir` flag, `--variant` allowlist, injection rejection, `--thinking` flag, `getVersion()` subcommand verification (28 total) (#1239)
- **Advanced options section in setup guide** — documents variant, thinking, and workDir task options (#1239)
- **Model discovery documentation** — `/v1/models` endpoint and `opencode models` commands in setup guide (#1239)

## [2.22.0] - 2026-02-27

### Added

- **Custom OpenAI-compatible endpoint support** — 2 new model profiles (`opencode-custom-opus`, `opencode-custom-sonnet`) for routing through custom API gateways via OpenCode transport (#1238)
- **`custom-openai` provider type** — new provider in model capabilities registry for custom OpenAI-compatible gateways (#1238)
- **OpenCode fallback chain expanded** — custom models prioritized: `opencode-custom-opus → opencode-custom-sonnet → opencode-default` (#1238)
- **Custom Endpoint Setup guide** — `docs/guides/CUSTOM_ENDPOINT_SETUP.md` with OpenCode configuration, routing, and troubleshooting (#1238)
- **New tests** — model registry (13 models, custom-openai provider), fallback chain (opencode custom models), CLI resolution (3 opencode models) (#1238)

### Changed

- **Model count** — 11 → 13 models in registry (added 2 custom endpoint profiles)
- **Provider count** — 3 → 4 providers (added `custom-openai`)
- **Registry import** — `custom-openai` provider maps to OpenCode CLI with 200K context window default

## [2.21.0] - 2026-02-27

### Added

- **`queryBySource()` method** on ToolMemoryManager — source-specific queries now get the full limit budget instead of being crowded out by other backends (#1237)
- **Belief auto-deduplication** — `retain()` now auto-supersedes existing non-superseded beliefs with matching `(subject, predicate)` pair, preventing duplicate accumulation (#1237)
- **25 new tests** — queryAll init guard (2), queryBySource dispatch (8), belief dedup (5), trust classification (10) (#1237)

### Fixed

- **queryAll initPromise race** — `queryAll()` now awaits `initPromise` before querying SQLite-backed backends, preventing silent empty results when backends haven't initialized (#1237)
- **Source filter crowding** — `memory_query` with specific source now dispatches directly to the requested backend instead of post-filtering queryAll results (#1237)
- **Belief duplicate accumulation** — `retain()` blindly appended new beliefs with no dedup check; now supersedes existing entries with matching `(subject, predicate)` (#1237)
- **issue_triage `new_account` false positive** — `estimateAccountAge()` used issue creation date instead of account date; now uses safe default (365 days) when real account age unavailable (#1237)
- **issue_triage `injection_patterns_detected` false positive** — benign flags like `instruction_pattern` no longer trigger the signal; only hostile flags (system_prompt_manipulation, fake_conversation, authority_claim, hidden_content) trigger it (#1237)
- **issue_triage Tier 1 contradiction** — Owner/maintainer users (trustTier=1) can no longer be simultaneously flagged as suspicious (#1237)

## [2.20.0] - 2026-02-27

### Added

- **Adaptive + typed memory write paths** — `memory_write` tool now supports `backend: 'adaptive'` and `backend: 'typed'`, making these queryable backends also writable (#1236)
- **YAML frontmatter on 9 additional docs** — UNTRUSTED_INPUT_HARDENING.md, CONTEXT_LOAD_BALANCING.md, ROUTING_SYSTEM.md, MCP_PROTOCOL.md, CONTRIBUTION_GUIDE.md, AGENT_DEVELOPMENT.md, WORKFLOW_TEMPLATES.md, DEBUGGING_OBSERVABILITY.md, RESEARCH_INDEX.md — 26 total validated (#1235)
- **8 new memory_write tests** — schema validation, write logic, unavailable backend handling for adaptive and typed backends (#1236)

### Fixed

- **4 critical silent catch blocks** — Added `logger.warn(...)` to bare catch blocks in `voter-agents.ts`, `consensus-plan.ts`, `triangulated-review.ts`, `sprint-helpers.ts` (#1234)

### Changed

- **FRONTMATTER_REQUIRED_FILES** expanded from 17 to 26 entries (#1235)
- **memory_write tool description** updated to list all 5 supported backends (#1236)

## [2.19.0] - 2026-02-27

### Fixed

- **CI type errors from AI SDK v6** — Updated 13 files for renamed `promptTokens`→`inputTokens`, `completionTokens`→`outputTokens`, and new `id`/`timestamp` requirements on `LanguageModelResponseMetadata` (#1231)
- **5 unnecessary type assertion lint errors** — Removed `as CliName` casts in `unified-registry.ts` and `topsis-stage.ts` where types already matched (#1231)
- **Stale canonical index entry** — Removed `docs-site-plan.md` from docs/README.md (#1231)
- **memory_stats description** — Changed "8 backends" to "7 backends", removed stale "promotion metrics" reference (#1233)
- **memory_query description** — Added "adaptive" to listed backends (#1233)
- **11 silent catch blocks** — Added `this.log.debug(...)` with descriptive messages to all bare catch blocks in `tool-memory.ts` (#1233)

### Changed

- **Config centralization** — Added canonical `CliNameSchema` and `DEFAULT_ROUTING_CONFIDENCE` constants to `model-capabilities-types.ts`; replaced 3 inlined `CLI_NAMES` arrays, 5 duplicated `z.enum` schemas, and 2 magic numbers across 11 files (#1232)
- **Governance version** updated to 2026-02-27

## [2.18.0] - 2026-02-27

### Added

- **Belief keyword search fallback** — queryAll() now falls back to keyword scan when exact subject match returns 0 results, making 2,257+ beliefs searchable (#1225)
- **Adaptive memory in queryAll()** — AdaptiveMemoryBackend wired into unified cross-memory search as 5th source (#1226)
- **`adaptive` source filter** — memory_query tool now accepts `source: 'adaptive'` to filter results (#1226)
- **YAML frontmatter** on 6 additional docs (docs/README.md, ENTRYPOINTS.md, INSTALLATION.md, CONFIGURATION.md, CONSENSUS_PROTOCOLS.md, MEMORY_SYSTEM.md) — 17 total validated (#1229)
- **7 new cross-memory query tests** — belief fallback, adaptive wiring, graduated scoring, phrase match bonus (#1225-#1227)

### Fixed

- **Binary relevance scoring** — Replaced binary 0/1 scoring with graduated relevance using term frequency bonus and exact phrase match bonus (#1227)
- **Dead `includePromotion` parameter** — Removed unused parameter from memory_stats tool schema and registration (#1228)
- **CLAUDE.md tier mismatch** — Changed from tier 2 to tier 1 (project instructions are tier 1) (#1229)

### Changed

- **FRONTMATTER_REQUIRED_FILES** expanded from 11 to 17 entries — added docs/README.md, ENTRYPOINTS.md, CONSENSUS_PROTOCOLS.md, MEMORY_SYSTEM.md, INSTALLATION.md, CONFIGURATION.md (#1229)
- **UnifiedMemoryResult.source** union type expanded to include `'adaptive'` (#1226)

## [2.17.0] - 2026-02-26

### Added

- **Consensus rejection categories** — 7 structured rejection categories (YAGNI, DRY_VIOLATION, OVER_ENGINEERING, SCOPE_CREEP, SECURITY_RISK, MISALIGNED, INSUFFICIENT_EVIDENCE) enable reject-refine-revote workflows (#1213)
- **Workflow-test voter criteria** — All 6 consensus voter prompts now assess testability, workflow integration, and incremental verifiability (#1212)
- **OpenCode CLI adapter** — 4th CLI adapter for multi-provider model access via OpenCode (#1124)
- **SCM provider module** — Centralized source code management module with trait interfaces, token resolution, and env sanitization (#1136)
- **Models.dev API client** — Pricing sync script for automatic model cost updates (#1125)
- **MCP SDK v1.27.1** — Upgraded from 1.26.0 with progress heartbeat, AbortSignal propagation, outputSchema support (#976, #1118, #1117, #1190)
- **CODEOWNERS** for security-critical paths (#1184)
- **CodeQL + Semgrep SAST** scanning in CI (#1180)
- **UnifiedAdapterRegistry** — Single adapter entry point replacing 4 duplicate adapter sources (#1151)
- **Multi-repo orchestration** — Research and ADR-0015 for cross-repository workflows (#1076)
- **3 development docs** — Shell testing anti-patterns, CLI UX quality gate, ADR-0016 multi-round consensus voting (#1209, #1210, #1211)
- **Simple task fast-path** — Skip LLM orchestration for trivially simple tasks (#1132)
- **YAML frontmatter** on 11 tier 1/2 docs with CI validation (#1157, #1218)

### Fixed

- **Weather report poisoning** — Adapter-unavailable errors no longer recorded as task failures (#1214)
- **Security-scan patterns** — Added exec/spawn concatenation (CWE-78) and path.join/resolve/normalize (CWE-22) detection (#1215, #1137, #1156)
- **list_experts names format** — Returns first-sentence descriptions instead of empty strings (#1216)
- **Hardened input validation** — JSON.parse guards, env var parsing, collection bounds, EventBus subscription snapshots (#1187-#1208)
- **MCP SDK vulnerability resolution** — Scoped ajv override + hono vulnerability patched (#1190)
- **CLI type canonicalization** — 3 duplicate CliName types consolidated into canonical CliNameLiteral (#1162)
- **Routing feedback loop** — Closed delegate-to-model feedback gap with recordRoutingOutcome (#1160)
- **Retry consolidation** — Unified retry defaults from config/defaults.ts (#1158)
- **Pipeline wiring** — PluginRegistry, ArtifactStore, TraceWriter, EventBus all wired to execution paths (#1167, #1168, #1173, #1179)
- **Expert timeout floor** — execute_expert minimum timeout raised and enforced (#1163)
- **Research discover reliability** — Fixed 3 root causes of source failure rate (#1121)
- **Orchestrator complexity** — Fixed misclassification for architecture tasks (#1152)

### Changed

- **Config centralization** — Codex MCP adapter timeouts, base adapter backoff, agent router timeouts, and feedback scoring thresholds derived from config/timeouts.ts (#1220)
- **Barrel exports** — RejectionCategory, RejectionCategorySchema, REJECTION_CATEGORIES exported from consensus barrel (#1219)
- **Deprecated code removed** — complexity-estimator, defaultFactory singleton, TechLead aliases, dead event schemas (#1143, #1169, #1170)
- **Codex adapters refactored** — Migrated to extend BaseCliAdapter (#1140)
- **Model registry updated** — Claude 4.6 Sonnet, Opus, and Haiku 4.5 (#1095)

## [2.16.0] - 2026-02-17

### Added

- **`repo_analyze` MCP tool** — Analyze GitHub repository structure, detect languages/frameworks, CI providers, security tooling, and identify gaps (#1074)
- **`repo_security_plan` MCP tool** — Generate security scanning pipeline recommendations with CI config snippets, powered by externalized vulnerability scanner registry (#1079)
- **`memory_write` MCP tool** — Manual memory injection for session, belief, and agentic memory backends (#1090)
- **`infrastructure_expert` role** — New expert type with skill and workflow for bare-metal server management, iDRAC, BOSH, and homelab infrastructure (#1082)
- **`docs-audit` workflow template** — Documentation verification workflow for freshness, completeness, and cross-reference validation (#1091)
- **Security-setup graph workflows** — 15 language-specific security scanning templates with CI config generation (#1077)
- **Heartbeat monitor wiring** — Liveness tracking integrated into agent execution lifecycle (#1087)
- **Centralized timeout configuration** — All hardcoded timeouts consolidated to `config/timeouts.ts` with configurable upper bounds (#1081)
- **Scanner registry externalization** — Vulnerability scanner data moved to `williamzujkowski/vulnerability-scanner-registry` with cached downloads (#1079)

### Fixed

- **`infrastructure_expert` missing from MCP tool schema** — Hardcoded 9-role enum in `registerCreateExpertTool` now includes all 10 expert roles (#1093)
- **CLI timeout propagation** — MCP server timeout now flows through adapter chain to prevent premature kills (#1081)
- **DevSecOps task categorization** — Expanded keyword matching for security-related task routing (#1073)
- **Scanner registry download optimization** — Skip full download when release tag is unchanged

### Changed

- Language-specific security gap recommendations in `repo_analyze` output (#1078)
- Infrastructure expert prompt enhanced with real-world operational patterns (#1092)
- MCP tool count: 21 → 24 (added repo_analyze, repo_security_plan, memory_write)

## [2.15.0] - 2026-02-14

### Added

- **E2E pipeline integration test** — 13 tests covering full Task→Route→Execute→Outcome→Learn feedback loop (#1070)
- **MCP tool registration index tests** — 52 tests verifying all 21 tools are properly registered and wired (#1064)

### Fixed

- **Agent state machine stuck in error state** — auto-recovery via `hasError()`/`reset()` prevents agents from becoming permanently unavailable (#1060)
- **qs DoS vulnerability** — pnpm override pins qs 6.14.1→6.14.2 (#1069)
- **BanditContext type mismatch in pipeline E2E test** — use proper typed context instead of raw features array
- **Base agent execute flow mock** — added missing `hasError`/`reset` methods to state machine mock

### Changed

- Bumped turbo 2.8.3→2.8.8, typescript-eslint 8.54→8.55 (#1063)
- Removed vestigial `predictions.jsonl`, updated `.gitignore` (#1068)

## [2.14.0] - 2026-02-13

### Added

- **E2E test projects Batch 3** (Epic #1055) — 2 multi-tool composition projects:
  - `research-to-action` — 71 tests chaining research_discover → research_add → research_analyze → consensus_vote → memory_query
  - `model-showdown` — 54 tests chaining delegate_to_model → create_expert → execute_expert → consensus_vote (5 strategies)
- **E2E test projects Batch 4** (#1058) — Final MCP tool coverage:
  - `nexus-toolkit` — 47 tests covering orchestrate, research_catalog_review, registry_import
- **Full MCP tool E2E coverage** — All 21 MCP tools now have dedicated E2E test projects (344 tests across 6 repos)

### Fixed

- **run_workflow built-in template resolution** — Fixed "Unsupported file extension" error when running built-in templates by name; added `getTemplateByName()` to `IWorkflowEngine` interface (#1057)
- **DelegateOutputSchema governance field** — Added optional `governance` field to Zod schema matching runtime enrichment (#1056)

## [2.13.0] - 2026-02-13

### Added

- **Cold-start warm-up wiring** — `CompositeRouter.warmStartBandit()` now writes synthetic outcomes to OutcomeStore during cold-start fallback, making warm-up data visible in weather report (#1023)
- **E2E test projects Batch 2** (Epic #1050) — 4 new standalone E2E projects covering 10 MCP tools:
  - `arxiv-scout` — 55 tests exercising all 5 `research_*` tools
  - `memory-bench` — 45 tests for `memory_query` and `memory_stats`
  - `issue-sentinel` — 38 tests for `issue_triage` with trust tier validation
  - `spec-factory` — 44 tests for `execute_spec`, `query_trace`, `registry_import`

### Fixed

- `execute_spec` schema description now documents required `## Requirements` and `## Acceptance Criteria` sections (#1051)
- `issue_triage` tool description now documents `GITHUB_TOKEN`/`GH_TOKEN` requirement (#1052)

### Security

- Patched `markdown-it` 14.1.0 → 14.1.1 (ReDoS, Dependabot alert #13) via pnpm override

## [2.12.0] - 2026-02-13

### Added

- **Cross-session learning loop** (Epic #1027)
  - Automatic strategy distillation to routing pipeline (#999)
  - Resource-aware strategy oscillation (#998)
  - Cross-session persistence for StrategyDistiller and OutcomeStore (#1009)
  - LinUCB bandit seeding from persisted outcomes on startup (#1015)
  - LinUCB bandit bootstrap with synthetic priors from specialization matrix (#1023)
  - Learning persistence health check in `doctor` command (#1017)
  - E2E scenario runner to validate learning loop (#1030)
  - Structured error taxonomy for task outcomes (#1025)
- **Operational hardening** (Epic #1027)
  - Agent heartbeat health monitor for liveness detection (#1032)
  - Concurrent expert admission control with semaphore pool (#1029)
  - Dynamic expert timeout based on task complexity (#1028)
  - MCP tool usage analytics in weather report (#1022)
  - Centralized Zod schema for NEXUS\_\* environment variables (#1016)
- **Observability improvements**
  - Enhanced `doctor --deep` diagnostics (#1031)
  - Routing strategy A/B comparison framework (#1033)
  - Comparative memory evaluation benchmark for MemR3 (#1034)
- **Pipeline and MCP improvements**
  - MCP tool annotations and side effects registry (#993)
  - MCP tool response honesty contract (#992)
  - Continue-on-failure mode for PipelineRunner (#995)
  - Precondition and verification hooks for graph workflows (#1000)
  - Surface rate limit errors with actionable context (#996)

### Fixed

- Centralize all timeout values into `config/timeouts.ts` — 12 scattered constants from 8 files consolidated (#1046)
- Increase expert complex timeout and reduce cold-start threshold (#1045, #1047)
- Record orchestrate and execute-expert outcomes to OutcomeStore (#1014)
- Add side-effect imports for persistence factory registration (#1011)
- Resolve 2 test failures from missing mocks and module-scope `homedir()` (#1043)

## [2.11.0] - 2026-02-11

### Added

- Enhanced status line v3 (`nexus-statusline-v3.sh`) (#990)
  - Surfaces all available Claude Code status line API data: code delta (+N/-M), cache hit ratio, API time %, token counts, agent name badge, exceeds-200k warning, extended context indicator
  - Conditional nexus-agents swarm monitoring line (health, active tool, expert/vote counters, per-CLI weather)
  - Adaptive cost formatting ($0.0012 for small, $384.89 for large costs)
  - Hours+minutes duration display for long sessions (70h1m instead of 4201m)
  - Single-jq-call pattern for performance, `printf '%b'` per official best practices
  - Graceful degradation: metrics appear only when data is available
- Updated observability guide with v3 setup instructions and field reference table

## [2.10.0] - 2026-02-11

### Added

- MemR3 reflective memory retrieval (arXiv:2512.20237) (#988, #736)
  - `ReflectiveRetriever` module with LLM-guided keyword expansion
  - Zod-validated `ReflectionCriteria` schema for structured output
  - LRU cache (50 entries, 5min TTL) for reflection results
  - Aggressive 2s timeout with graceful fallback to keyword retrieval
  - Feature flag: `NEXUS_REFLECTIVE_MEMORY` (true|shadow|unset)
  - Shadow mode for offline comparison of reflection vs keyword retrieval
  - Wired into `memory_query` MCP tool
  - 23 new tests

### Changed

- Wire parallel-executor retry delay to `WORKFLOW_TIMEOUTS.maxRetryDelayMs` (#984 follow-up)

## [2.9.0] - 2026-02-11

### Added

- Centralized timeout configuration module `config/timeouts.ts` (#984)
  - 9 typed const categories: CLI_TIMEOUTS, VOTE_TIMEOUTS, MCP_TIMEOUTS, WORKFLOW_TIMEOUTS, GRAPH_TIMEOUTS, PER_CLI_TASK_TIMEOUTS, API_TIMEOUTS, INTERNAL_TIMEOUTS, TEST_TIMEOUTS
  - Environment variable overrides (NEXUS_VOTE_TIMEOUT_MS, NEXUS_MCP_TIMEOUT_MS, etc.)
  - Accessor functions: `resolveVoteTimeout()`, `resolveEnvTimeout()`, `validateTimeout()`, `getCliTimeoutProfile()`, `getCliTimeout()`
  - 31 tests covering all categories, env var resolution, and clamping behavior
- Enhanced Claude Code status line and hooks for swarm monitoring (#982)
  - `nexus-statusline.sh` v2 with 9 tool groups, per-CLI weather tracking, vote counters
  - `nexus-hook.sh` v2 with SessionStart support, state schema v2, context gauge
- Extracted `cli-timeout-helpers.ts` with `estimateTaskComplexity()` business logic

### Fixed

- Increase agent timeouts for complex tasks (#983)
  - Gemini complex timeout: 120s → 180s (based on observed production failures)
  - Codex complex timeout: 60s → 90s
- Resolve Gemini timeout conflict between two files (Issue #366 values take precedence)

### Changed

- All timeout consumers now delegate to canonical `config/timeouts.ts` source
- Backward-compatible re-exports maintained in all existing import paths

## [2.8.0] - 2026-02-11

### Added

- MCP logging notifications for Claude Code observability (#974, Epic #973)
  - `IMcpNotifier` interface with info/debug/warn methods and fire-and-forget semantics
  - `createMcpNotifier(server)` and `NOOP_NOTIFIER` for testing
  - Declare `logging` capability in MCP server options
  - 6 tools instrumented: delegate_to_model, consensus_vote, orchestrate, execute_expert, run_workflow, run_graph_workflow
  - Events: routing_start, model_selected, vote_start/collected/complete, orchestrate/expert/workflow start/complete
- Claude Code observability guide with hooks and status line examples (#977)
  - `docs/guides/claude-code-observability/` — comprehensive 3-layer guide
  - `nexus-hook.sh` — PreToolUse/PostToolUse hook script with session stats
  - `nexus-statusline.sh` — ANSI-colored status bar showing active tools/models

### Deprecated

- `packages/nexus-tui/` package — superseded by Claude Code observability features (#979)
  - Marked deprecated in package.json
  - Scheduled for removal in v3.0

### Changed

- Updated stale MCP tool count references from 20 to 21 across 12 documentation files (#971)

## [2.7.1] - 2026-02-11

### Fixed

- Add observable warn-level logging to 12 silent best-effort catch blocks across 9 files (#966)
  - Catches in consensus-plan, triangulated-review, parallel-exploration, delegate-to-model, run-workflow, consensus-vote, composite-router-outcome, execute-expert, and research-discover now log error details

### Changed

- Replace 110+ inline `error instanceof Error ? error.message : String(error)` patterns with canonical `getErrorMessage()` utility (#968)
- Improve `getErrorMessage()` to handle primitives (number/boolean/bigint) and extract helper for ESLint complexity compliance

## [2.7.0] - 2026-02-11

### Added

- AOrchestra dynamic sub-agent creation — task-adaptive expert team composition (#935, #936, #937)
  - `planAgentTeam()` maps `TaskAnalysisResult` to 1-5 experts from 9 built-in types
  - Wired into orchestrate pipeline behind `NEXUS_AORCHESTRA` flag
- V2 Pipeline Integration — 6 phases with delegate, orchestrate, policy, and event bus (#919-#925)
  - `NEXUS_V2_MODE` umbrella flag (off/partial/full, default: full)
  - PolicyEvaluator with off/warn/block mode and 5 built-in rules
  - EventBus bridge (V2 to V1) and ArtifactStore wired
- V2 Gap Closure — governance-enforcer in routing, quality rewards in LinUCB (#926-#930)
- User Advocate Pipeline — pm_expert, ux_expert roles, requirements-gathering skill (#901)
- MCP integration tests — 28 tests covering all 21 tools via InMemoryTransport

### Fixed

- REST API server port contention in tests — use port 0 for OS-assigned ephemeral ports (#938)
- Mesh mode auto-detection — TTY now routes to orchestrator, not mesh (#932)
- CLI command audit — confirmed 36 commands with handlers (#933)

### Removed

- Dead integration test files (`test/integration/`) — excluded from vitest, used deprecated APIs

### Documentation

- Gap #8 resolved by design — adapter layers serve distinct purposes (#934)
- All 8 architectural gaps resolved (7 by implementation, 1 by design)
- Alignment roadmap and gaps.md updated

## [2.6.0] - 2026-02-03

### Added

- Release automation CLI commands: `release-notes`, `release-validate`, `release-announce` (#637)
- Standards repository absorbed into expert system with 44 skills, 24 knowledge modules (#658)
- Product-type routing with 8 product types (api, web-service, cli, frontend-web, mobile, data-pipeline, ml-service, infra-module)
- 17 built-in standards skills and 5 optional lazy-loaded skill packs (27 additional skills)
- Scaffold command for project bootstrapping (#653)
- External Skill Packs support (#654)
- Standards-review workflow template (#652)
- Per-tool MCP timeout configuration (#657)
- Changelog automation improvements with changeset validation (#634)

### Changed

- Changeset config cleaned up (removed deprecated experimental options)
- Changeset README expanded with CI workflow documentation

### Fixed

- Orchestrator timeout handling (#655)
- API key error handling improvements (#656)
- MD060 table generation in markdown linting (#659)

## [2.5.0] - 2026-02-02

### Added

#### Governance & Quality Gates

- CLI Orchestration Fitness Score with 8 architectural dimensions (#574)
- `fitness-audit` command for release gate validation (requires 90+ score)
- MCP tool index injection mechanism for CLAUDE.md auto-generation
- Zod schemas for configuration defaults validation

#### Unified Architecture (ADR-0013, ADR-0014)

- `IOrchestrator` interface for unified orchestration (#573)
- `SharedTaskAnalyzer` for unified task classification (#574)
- `CommandResult<T>` type for CLI command consolidation (#584)
- `TokenEstimator` service for unified token estimation (#574)
- `RoutingContextStore` for unified routing context (ADR-0008)
- `QuorumValidator` for unified quorum logic (#576)
- `IRegistry` interface for unified registry APIs (#596)
- `OrchestratorFactory` and `WorkflowAdapter` (#573)
- Unified router stage architecture with `CascadeRouterBase` (#574)
- ADR-0009 error class hierarchy implementation

#### Safety & Validation

- STPA safety framework integration into MCP tool registration (#530)
- MCP tools output validation (#547)
- `CapacityMonitor` integration with `CircuitBreaker` (#543)
- End-to-end validation harness (#571)

#### DocOps Automation

- Documentation Management skill and DocOps specification
- Spell checking for documentation (#631)
- Frontmatter validation for website docs (#629)
- Markdown linting to documentation gate (#627)
- Canonical index validation gate (#628)
- DocOps skill synchronization enforcement gate
- Deterministic repository capability index generator
- Website docs sync hooks and troubleshooting navigation

#### CLI & REST

- REST API server wired to CLI entry points (#524)
- Live CLI execution in demo routing command
- `--timeout` option for vote command
- `NEXUS_ALLOW_MOCK_ORCHESTRATION` env var for testing (#540)

### Changed

#### Architecture Consolidation (60+ files refactored)

- Migrated routing pipeline to `SharedTaskAnalyzer` (#586)
- Migrated REST orchestrate endpoint to `IOrchestrator` (ADR-0014)
- Migrated MCP orchestrate tool to unified `IOrchestrator` interface (ADR-0014)
- Migrated expert-selector to `SharedTaskAnalyzer`
- Wired TechLead and Puppeteer to adapters (ADR-0014)
- Wired `OrchestrationObserver` to `CompositeRouter` (#587)

#### Utility Consolidation (ADR-0013)

- Consolidated 30+ duplicate `formatPercentage` patterns
- Consolidated `formatDuration`, `formatStatus`, ANSI colors, box drawing
- Consolidated Zod helpers, truncate functions, capitalize utilities
- Consolidated sleep/delay, UUID generation, timestamp generation
- Consolidated error message extraction with `getErrorMessage` helper
- Consolidated clamp patterns across 6 batches
- Consolidated STOPWORDS and tokenize to shared utils
- Consolidated similarity utilities, memory utilities, ID generation
- Consolidated ISQLiteDatabase interfaces into database-types.ts
- Consolidated API error helpers

### Fixed

#### Determinism & Reliability

- Proposal content caching for consensus determinism (#589)
- Event listeners cleared on session finalize/cancel (memory leak) (#548)
- `maxClosedProposals` limit prevents unbounded memory growth (#549)
- Test heap OOM resolved via forks pool (#582)
- `vi.hoisted` pattern for forks pool compatibility (#582)

#### Correctness

- Mock TechLead requires explicit opt-in (#554)
- Mock workflow execution requires explicit opt-in (#551)
- Unsafe `as any` casts removed from MCP tools (#567)
- Cost model standardized across routers (#574)
- Config validation fitness check corrected
- GOOGLE_AI_API_KEY standardized in JSDoc examples (#544)
- `NEXUS_LOG_LEVEL` env var implemented (#545)
- GitHub API timeout added (#546)
- Defensive error handling in `mergeStreams` (#541)
- Discriminated union used instead of unsafe type cast in LATTS (#539)

#### CI/Documentation

- Broken links repaired in website content and TypeDoc
- SEO duplicate title and a11y contrast issues resolved
- Memory types corrected (7 not 8), consensus algorithms (5 not 11)
- Markdown tables excluded from secrets scan
- Lychee regex patterns and base path corrected

### Refactored

- Deprecated `analyzeTask` warnings suppressed pending #574
- Deprecation markers added to task analyzer implementations
- Routing interface facade added for layer separation (#588)
- `IRegistry`-compatible methods added to `TemplateRegistry` (ADR-0012)
- `IRegistry` interface implemented for `ExpertRegistry` (ADR-0012)
- Forest-engine split into modular files (#578)
- Consensus-vote tool execution flow simplified
- `dryRun` renamed to `simulateVotes` for clarity

### Documentation

- Comprehensive governance framework added to CLAUDE.md
- CLI orchestration architectural decision documented
- System mandate documentation added (#561-564)
- Research index regenerated with updated stats
- Security topic and in-progress paper status added
- Orphaned files removed, historical docs archived
- Package docs migrated to canonical locations
- TechLead/WorkflowEngine architecture consolidated

### Dependencies

- Bumped actions/upload-pages-artifact from 3 to 4 (#427)
- Bumped actions/cache from 4 to 5 (#428)
- Bumped production dependencies group with 7 updates (#585)
- Synced hono override with package dependency version

## [2.4.0] - 2026-01-25

### Added

- Comprehensive hook tests with 243 tests across 9 files (#417)
- Route tests with 71 tests across 6 files (#418)
- Doctor command validations for Node.js version, API keys, and config file (#422)

### Changed

- Setup command now merges hooks instead of overwriting existing user hooks (#420)
- Extracted doctor formatting into separate module for maintainability
- README.md simplified from 519 to 183 lines with clear value proposition
- QUICK_START.md improved with CLI tool requirements and auth steps

### Fixed

- Hook configuration now preserves existing user hooks during setup (#420)
- Removed phantom `consensus_vote` tool from MCP documentation
- Synced root package.json version

### Dependencies

- Removed deprecated `@types/uuid` (uuid v13+ includes types)
- Bumped actions/checkout from 4 to 6
- Bumped actions/setup-node from 4 to 6
- Bumped actions/upload-artifact from 4 to 6
- Bumped actions/github-script from 7 to 8
- Bumped peter-evans/create-pull-request from 6 to 8
- Updated 7 dev dependencies within semver ranges

## [2.3.0] - 2026-01-24

### Added

- RL-trained learnable orchestration policy with REINFORCE algorithm (#154)
- ExperienceBuffer for RL infrastructure with priority sampling (#379)
- PuppeteerOrchestrator CLI support with `--engine=puppeteer` (#386)
- Link validation in research index command (#396)
- Comprehensive E2E testing infrastructure with orchestrator learning tests (#154)
- Astro Starlight documentation website
- Per-tool rate limiting in MCP server for abuse prevention
- Forest-of-Thought reasoning types (#331)
- DAAO VAE-based difficulty estimation (#334)
- AFlow MCTS implementation for agent search
- STPA, ZeroRouter, SEW, and Higher-Order Voting techniques
- Agent-SafetyBench safety categories (#332)
- Custom expert loading from configuration (#300)
- Sandbox execution wrapper for CLI execSync calls
- Research paper registry integration with auto-add from arXiv fetch (#299)
- Deterministic skill loader for agents (#374)
- Config management CLI commands (#360)
- Response caching layer for CLI adapters (#358)
- Skill dependency graph with topological execution ordering (#374)
- Security controls for skill system (RBAC, provenance) (#374)

### Changed

- Eliminated all 12 circular dependency chains (#292, #392)
- 21+ files split for 400-line CODING_STANDARDS compliance (#293, #340, #352, #404)
- Merged gemini-adapter-enhanced into canonical adapter (#389)
- Magic numbers extracted to named constants (#384)
- Codex adapter model defaults refactored for consistency
- Enhanced Gemini adapter with circuit breaker (#366)

### Fixed

- Path traversal protection added to resolveFilePath (security)
- AbortSignal listener cleanup in PuppeteerOrchestrator (memory leak)
- Hardcoded routing latency replaced with actual measurement (#395)
- policyMode config now respected in PuppeteerOrchestrator (#385)
- Codex MCP tool names corrected (#388)
- Codex subprocess adapter and puppeteer transport fixes (#388)
- EnhancedGeminiCliAdapter sandbox flag removed (#387)
- Gemini timeout expectations (#366)
- Test path traversal protection in config-command tests

### Performance

- ResponseCache LRU key lookup optimized from O(n) to O(1) (#408)
- EventBus CircularBuffer for O(1) history eviction (#407)
- ExperienceBuffer sampling optimized with reservoir algorithm

### Security

- Path traversal protection in file resolution
- Sandbox execution wrapping for all execSync calls
- Per-tool rate limiting in MCP server

### Testing

- 561+ new tests added (dogfooding, sandbox, benchmarks, E2E)
- Comprehensive tests for security-critical modules (#382, #383)
- Core/MCP module test coverage (#377)
- Config-command-helpers and research-index-generator edge cases

## [2.2.0] - 2026-01-16

### Added

- SWE-Bench evaluation harness and tooling (#257)
- Deterministic RESEARCH_INDEX.md generator (#367)
- Learning-metrics dashboard command (#284)
- Auto-generation pipeline for llms.txt (#283)
- Tiered documentation infrastructure (Phases 0-2) (#283)
- CLI setup command (#363)
- CLI latency tracking with task-type fallback chains
- ConfigManager with environment validator
- Circuit breaker patterns for CLI adapters
- CLI timeout profiles (#357)
- CLI context load balancing and delegator skills
- Lychee link validation workflow

### Changed

- Split cli-commands.ts into dispatch and handlers (#285)
- Split voter-agents.ts into three modules (#285)
- Split puppeteer-orchestrator and belief-memory (#340)
- Split long functions to comply with 50-line limit (#340)
- Consolidated rules and skills to reference canonical docs (#283)
- Reduced CLAUDE.md to project context only (#283)
- Sherman-Morrison incremental inverse update for LinUCB (#254)

### Fixed

- Broken research index links
- CLI adapter factory tests to use CLI aliases
- Claude CLI model aliases for valid API requests
- Node_modules excluded from tsconfig

### Documentation

- QUICK_START.md added for onboarding
- Phase 6 validation completed (#283)
- ALIGNMENT_ROADMAP updated with SWE-bench verification
- System Review 2026-01-16 (Post-CLI Split #285)

## [2.1.0] - 2026-01-01

### Added

- Multi-agent collaboration framework
- Expert agents (Security, Performance, Documentation)
- Voyager-style skill library with skill composition
- Agentic memory system with contextual retrieval
- TOPSIS router for multi-criteria model selection
- Aegean consensus protocol implementation
- MCP server mode for Claude Desktop integration
- Standalone orchestrator mode for CI/CD

### Changed

- Modular architecture with clear separation of concerns
- Result-based error handling throughout codebase
- Zod validation at all boundaries

### Fixed

- Various type safety improvements
- Path validation for file operations

---

[unreleased]: https://github.com/williamzujkowski/nexus-agents/compare/v2.8.0...HEAD
[2.8.0]: https://github.com/williamzujkowski/nexus-agents/compare/v2.7.1...v2.8.0
[2.7.1]: https://github.com/williamzujkowski/nexus-agents/compare/v2.7.0...v2.7.1
[2.7.0]: https://github.com/williamzujkowski/nexus-agents/compare/v2.6.0...v2.7.0
[2.6.0]: https://github.com/williamzujkowski/nexus-agents/compare/v2.5.0...v2.6.0
[2.5.0]: https://github.com/williamzujkowski/nexus-agents/compare/v2.4.0...v2.5.0
[2.4.0]: https://github.com/williamzujkowski/nexus-agents/compare/v2.3.0...v2.4.0
[2.3.0]: https://github.com/williamzujkowski/nexus-agents/compare/v2.2.0...v2.3.0
[2.2.0]: https://github.com/williamzujkowski/nexus-agents/compare/v2.1.0...v2.2.0
[2.1.0]: https://github.com/williamzujkowski/nexus-agents/releases/tag/v2.1.0
