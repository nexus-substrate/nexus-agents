---
'nexus-agents': minor
---

**v2.58.0 — Governance substrate maturation: Magentic-One ledgers, confirm_risky tier, hash-chain audit, README auto-gen**

This release ships 5 of the 7 follow-ups from the #2232 build-vs-buy audit, plus the supporting infrastructure (README auto-gen, prettier-stable governance injection) that surfaced during the work, plus a new `verify_audit_chain` MCP tool that closes the audit-trail story end-to-end.

The framing also shifted: nexus-agents is now positioned as a **governance substrate for AI coding agents** rather than "another autonomous coding framework." The audit found that existing tools (OpenHands, SWE-agent, AutoGen, CrewAI, MetaGPT, Devin, Factory) cover at most 44% of our charter — they're agents we govern, not substitutes for the governance work itself.

### New: Magentic-One Task Ledger + Progress Ledger pattern ([#2278](https://github.com/williamzujkowski/nexus-agents/pull/2286))

The audit's #1 priority pattern to borrow. Adds two structured ledgers on top of the existing `query_task_state` log:

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
- `docs/research/build-vs-buy-audit-2026-04-27.md` — methodology + scoring matrix preserved as a reference for future audits (via #2232 closing comment)

### Other

- 5 dependabot PRs landed (postcss already covered above; production-deps group bump for commitlint/vitest/anthropic-ai-sdk/atproto/astro/svelte; CI action bumps for checkout 4→6, github-script 7→9, peter-evans/create-pull-request 7→8, anthropics/claude-code-action 1.0.107)
- README MCP tools table is now auto-generated; README + CLAUDE.md + AGENTS.md + plugin manifests + PLUGIN_INSTALL.md all stay in sync via `pnpm governance:inject` + the docs-check CI gate

### Deferred for follow-up sessions

Two audit follow-ups from #2232 are deferred for sessions where the test environment has the relevant subscriptions:

- **#2282** — Devin API adapter (requires Devin Teams subscription for live integration)
- **#2283** — Factory droid adapter (requires Factory Pro/Max subscription for live integration)

Both have detailed design notes (capability scoring, NDJSON format caveats from prior OpenCode integration, pre-implementation checklists) posted as issue comments. Mocked-only adapters were declined on consensus_vote because end-to-end validation is the actual quality gate.

### No breaking changes

`AccessPolicyMode` enum gained `'confirm_risky'` as a fourth value but the type is open (Zod enum widening). `StructuredTaskState` gained two optional fields (`taskLedger`, `progressLedger`) — existing logs replay unchanged. All other changes are additive.
