---
'nexus-agents': patch
---

Cross-rank the context-retriever's memory outputs (#3236). `UnifiedContext` now
carries an additive `rankedMemories: RankedMemoryItem[]` — the ~6 per-backend
lists (belief / agentic / adaptive / experience / strategy / research; the
aggregate `outcomes` summary is excluded) lexically cross-ranked into one
comparable, sorted list via the new `rankMemories` /
`topRankedWithinBudget` helpers in `context/context-retriever-helpers.ts`. The
score is `W_TEXT·textRelevance + W_RECENCY·decay(age) + W_SOURCE·sourceWeight`
with named, provisional weights. When the new default-off flag
`NEXUS_CONTEXT_RANKED=1` is set, `summarizeContextForPrompt` renders the
globally-best top-N within a token budget instead of per-backend sections;
flag-off output is byte-identical to today's. The render path still flows every
field through `oneLine` (untrusted memory backends) and is fail-soft on missing
timestamps and empty backends.
