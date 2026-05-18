# nexus-agents

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
