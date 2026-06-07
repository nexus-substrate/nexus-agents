---
'nexus-agents': patch
---

fix(governance): stop improvement_review firing a spurious 0/100 fitness signal (#3621)

`fitness-audit` returns a deliberate "could not audit" sentinel (score 0, one
info finding) when run outside the source tree — e.g. from the global npm
install, where the bundled `src/` lacks `cli-adapters/`. The MCP server IS that
global install, so `improvement_review` was misreading the sentinel's meaningless
score-0 as a _critical tech-debt: fitness below floor_ signal on every run.

Adds an explicit `auditable` flag to `FitnessAudit` (false for the sentinel,
true for a real audit); `detectFitnessSignals` now skips a non-auditable result
instead of emitting a below-floor signal. Found via the capability-loop
verify-before-acting pass (#3540) — exactly the kind of detector artifact that
would otherwise pollute the improvement-signal stream.
