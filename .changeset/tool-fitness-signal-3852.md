---
'nexus-agents': minor
---

feat(observability): tool-fitness SignalCategory consumer in improvement_review (#3852)

Adds the named consumer of the #3851 tool-fitness ledger, closing the #3692
SignalCategory sequencing. `improvement_review` now reads the per-tool fitness
ledger and surfaces two suggest-tier candidate kinds:

- **Deprecation candidates** — tools with very low recent invocations
  (≤ `LOW_USAGE_MAX_INVOCATIONS`) or a poor success rate
  (≤ `POOR_SUCCESS_RATE_MAX` over ≥ `FITNESS_MIN_SAMPLE` samples).
- **Consolidation candidates** — a rarely-used member of a shared tool-name
  prefix family (e.g. `research_*`) whose usage is a tiny fraction of its
  busiest sibling.

New `SignalCategory` member: **`'tool-fitness'`** (wired through
`improvement-remediation.ts`, `remediation-research.ts`, and the remediation
capability schema).

**EPIC F INVARIANT — NEVER autonomous removal.** Output is SUGGEST-TIER ONLY:
every signal is a candidate for human review, severity is capped at `warning`
(never `critical`), and `assertNeverAutonomousRemoval` enforces this at runtime
(tests assert it throws on a removal-grade signal). Removal still requires the
Epic D human-ratification path (#3853 runbook).

**Context-poisoning fix (#3852 / #3898 dissent).** `ToolFitnessEventSchema`
gains an OPTIONAL, backward-compatible `workspace` dimension, and the ledger
exposes `statForInWorkspace`. The consumer scopes the reliability dimension by
workspace: a tool that fails in one workspace but is healthy in another is NOT
globally flagged. Concurrency of the shared `JsonlStore` append/eviction is
documented (atomic `O_APPEND` line writes; the over-cap rewrite race is a
pre-existing, suggest-tier-acceptable residual) and covered by a test.

Resolves the #3851 `@export-no-consumer-yet` marker — the ledger now has a real
in-src consumer, so the marker is removed and the producer/consumer gate (#3024)
still passes.
