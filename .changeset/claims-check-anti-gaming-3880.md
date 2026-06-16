---
'nexus-agents': patch
---

feat(governance): claims:check anti-gaming reverse coverage scan (#3880)

The `claims:check` gate verified the claims that ARE registered but never linked
the registered set to the claims the docs actually make, so the registry was an
allowlist the author fully controlled: silently deleting an entry (while the doc
claim remained) or masking a removed hard claim by adding an easy one kept CI
green.

This adds a reverse coverage check (`src/governance/claims-coverage.ts`, wired
into `scripts/claims-check.ts`). It scans README.md + ARCHITECTURE.md for a
closed, high-precision set of quantified-capability sentinels ("N MCP tools",
"N built-in expert types", "N strategies") and FAILS when a matched claim has no
covering registry entry — where "covered" means some entry whose `subject` is
that doc declares a `verification.subjectContains` literal the matched prose
contains (the inverse of the #3877 subject check).

This closes both gaming paths: silent registry shrink and mask-by-addition now
fail the gate. The sentinel set is deliberately narrow (anchored on
`<count> <capability-noun>`), so generic numeric prose is never flagged; a new
sentinel capability requires a registry entry (intended). Implements the #3826
deferred "undeclared doc-claim" heuristic detector. Still 8 claims, 8/8 green.
