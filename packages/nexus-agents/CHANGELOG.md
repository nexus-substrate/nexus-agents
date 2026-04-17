# nexus-agents

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
