---
'nexus-agents': minor
---

feat(context): per-call token ledger tagged by context-source (#4252, Phase 0 of epic #4251)

Adds a lightweight, queryable per-call token ledger so the token-optimization
epic's claimed savings (#4253 caps, #4254 repo-map) are falsifiable instead of
assumed.

**`TokenLedger` (`context/token-ledger.ts`)** — records, per call: input/output
tokens, a `tool` identifier, and a `contextSource` tag (`memory-backend`,
`research-synthesis`, `repo-map`, `raw`, `tool-output`, `system`, or any future
tag — the schema doesn't hard-enforce the enum so a new source never needs a
migration), plus optional `model`/`taskId`/`variant` dimensions. Persists to
`<nexus data dir>/token-ledger/ledger.jsonl` (append-only, hydrate-on-construct,
bounded retention) via the shared `JsonlStore` primitive (#3762) — the same
idiom as `governance/tool-fitness-ledger.ts` (#3851). Builds on the existing
`token-counter.ts` (estimation) and mirrors the `token-budget-tracker.ts`
`TokenUsageRecord` field vocabulary rather than forking a parallel shape.

**Query surface** — `TokenLedger.summarize({ sinceMs?, untilMs? })` aggregates
total/input/output tokens by `contextSource` and by `tool`, optionally scoped
to a time window; calling it twice with windows bracketing a change supports a
manual before/after comparison today. A dedicated fixed-sample A/B diff
harness remains a documented follow-up under epic #4251.

**Wiring** — `context/context-retriever.ts`'s `summarizeContextForPrompt` now
records one `memory-backend`-tagged ledger entry per non-empty call, tagged
`variant: 'ranked' | 'legacy'` for which rendering path (`NEXUS_CONTEXT_RANKED`)
produced it. Assembly/ranking semantics are unchanged — this is additive
telemetry only.
