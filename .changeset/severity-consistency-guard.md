---
'nexus-agents': patch
---

test(security): add finding-severity vocabulary consistency guard

Adds a lockstep test pinning `FindingSeveritySchema` (security/sarif-types.ts) as the canonical 5-value finding-severity vocabulary (`critical|high|medium|low|info`) and asserting the other importable members of that family stay in sync: `VulnerabilitySeveritySchema`, and the key sets of both `SEVERITY_ORDER` maps (sarif-types + dogfooding/pr-review-types). A severity added to one but not another now fails CI instead of drifting silently. The two order maps' values are intentionally inverted (opposite sort directions) so only their key sets are compared. Distinct vocabularies (4-value no-info, major/minor/suggestion, failure/error/audit/hazard) are explicitly out of scope. Tier B (guard step) of evergreen DRY epic #3568; the extract-and-derive consolidation of inline copies is a vote-gated follow-up.
