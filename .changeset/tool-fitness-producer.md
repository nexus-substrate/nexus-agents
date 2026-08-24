---
'nexus-agents': minor
---

feat(governance): give the tool-fitness ledger its first production writer

`report()` returned `[]` because nothing ever called `record()`, so
`detectConsolidationCandidates` and `detectDeprecationCandidates` could not
emit — while the consumer chain below them was fully wired all the way to
remediation tasks and GitHub issue filing.

Every wrapped MCP tool call now appends one fitness event at the middleware
chain's per-call completion point.

Site choice matters here. The obvious-looking site — `tool-wrapper.ts`'s
`classifyResult` — is reached only from `runMismatchedCall`, the
timeout-mismatch path. Writing there would have recorded a sample biased toward
mismatched calls and systematically mislabelled tools as unfit; a biased
producer is worse than none, because its output looks like data.

Known gap, documented in code so absence is not misread: `execute_expert`
registers via `registerToolTask` and does not pass through this chain, so it
produces no fitness events. "No data" means unmeasured, not unused.

Best-effort — a ledger write never fails a tool call — and bounded by the
ledger's existing retained-event cap.
