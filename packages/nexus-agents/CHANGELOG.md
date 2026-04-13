# nexus-agents

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
