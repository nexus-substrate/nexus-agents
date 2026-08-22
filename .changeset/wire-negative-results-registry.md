---
'nexus-agents': patch
---

The negative-results registry is finally read, and `checkCodexDepth` is honestly marked as deferred ([#4555](https://github.com/nexus-substrate/nexus-agents/issues/4555)).

Two checks had no production consumer. Per the wire-vs-remove rule I checked intent first, and both turned out to be deliberate work rather than dead weight — but they needed opposite dispositions.

**`research/negative-results.ts` — wired.** `docs/research/registry/negative-results.yaml` says it exists to "prevent re-researching failed implementations", and the module was added in #1572 as an "enforcement module". Nothing read it, so a technique recorded as rejected was re-suggested with no warning: maintained data with no consumer. `research_query` already takes a `techniqueId`, so the `status` and `overlap` actions now attach a `rejectionNotice` when the registry holds one.

Advisory by design — the notice is attached, never used to suppress a result. A prior rejection is evidence to weigh, not a veto: the failure mode may not apply, or the record may be stale.

**`checkCodexDepth` — marked, not wired.** Its sibling `checkCodexConcurrency` is wired at `voter-agents.ts:307`, but this one needs a _planned subagent nesting depth_, and nothing in the tree tracks one. The voter fan-out is flat — voters are leaf calls — and the only other `depth` values are MCTS and reasoning-forest tree depths, unrelated concepts.

So it was written against information no caller has. Wiring it means first introducing depth tracking through the dispatch path, which is a feature and not a missing line. It now carries `@export-no-consumer-yet — see #4555` explaining exactly that, rather than being deleted: the knowledge it encodes (Codex `max_depth=1` rejects a nested spawn) is real and was added deliberately in #2689.

Verified the registry lookup end to end: `latent-space-sharing` resolves and renders its failure mode and paper; an unknown id returns undefined.
