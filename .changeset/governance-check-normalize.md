---
'nexus-agents': patch
---

`pnpm governance:check` no longer fails permanently on AGENTS.md prose that prettier reshapes. The injector writes CLAUDE.md through prettier, but the staleness check regenerated the `GENERATED:FROM_AGENTS` block from the raw AGENTS.md slice and compared bytes, so an inline code span wrapped across a line break made `check` report the block stale forever while prescribing an `inject` that changed nothing. Both sides now go through the one prettier pass the writer uses, and a genuine mismatch reports the first differing CLAUDE.md line number with the expected and on-disk text. `checkGovernance()` is now async.
