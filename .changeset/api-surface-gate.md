---
'nexus-agents': patch
---

ci: derive the public API surface from the AST instead of grepping for names

Three type changes shipped or were nearly shipped mis-versioned in one day, all
from the same mistake: grepping `src/exports/*.ts` for a symbol's NAME, finding
nothing, and concluding the change was internal.

- #4736 `healthScore` widened to `number | null`, shipped as a patch.
- #4740 a `VoteDecisionStatus` enum widening proposed as semver-minor.
- #4744 `ResultMetadata` called "not public" — but `TaskResult` is exported and
  carries `metadata: ResultMetadata`, so it is reachable structurally.

A name grep answers "is this symbol re-exported?". The question that decides
semver is "is this type reachable from the entry point?", and those differ
whenever one exported type references another. The failure is also
one-directional: it always reads as "not public", i.e. as permission to proceed.

`scripts/extract-api-surface.ts` walks from `src/index.ts` and follows type
references transitively, so a type that is public only through another type's
signature is included. That transitive step is the whole point: it adds **313
symbols** the export list alone does not mention. `scripts/check-api-surface.ts`
diffs the result against the committed `api-surface.txt` and fails on any
change.

The gate reports what moved and attributes it to a symbol; it deliberately does
not classify severity, because it cannot know whether a removed symbol was
load-bearing downstream, and a gate that guessed would be trusted more than it
deserves.

Uses `ts-morph`, already a dependency. No new tooling.
