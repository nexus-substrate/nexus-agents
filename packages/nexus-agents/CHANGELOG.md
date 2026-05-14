# nexus-agents

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
