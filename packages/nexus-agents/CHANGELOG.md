# nexus-agents

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
