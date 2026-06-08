---
'nexus-agents': patch
---

refactor(timeouts): sweep scattered literal timeouts into the central operation-class authority (#3736)

Follow-on to #3734. Moves the remaining local literal timeouts off hardcoded
values and onto central named constants derived from the operation-class
taxonomy in `config/timeouts.ts`. Punitive LLM-guarding shorts (30s/60s on AFlow
node evaluation, self-eval, and workflow mutation) are raised to the non-punitive
`single-llm` class guard (300s); scattered network/CLI literals are centralized
to `network-fetch` (120s), the existing v2-delegate/gh-command constants, and a
new `SEARCH_TREE_MAX_TIME_MS`. No new punitive values introduced.
