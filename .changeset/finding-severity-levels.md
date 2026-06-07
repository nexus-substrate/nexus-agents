---
'nexus-agents': patch
---

refactor(security): single canonical FINDING_SEVERITY_LEVELS source

Extracts `FINDING_SEVERITY_LEVELS` (`['critical','high','medium','low','info'] as const`) in `security/sarif-types.ts` as the single source of truth for the 5-value finding-severity vocabulary. The five previously-inline `z.enum([...])` re-declarations (severity-consensus, finding-triage, agents/output-schemas ×2, expert-types VulnerabilitySeverity) + the pr-review `minSeverity` enum + `ReviewSeverity` type now derive from it, and both `SEVERITY_ORDER` maps derive their keys from the tuple (sarif ascending; pr-review keeps its intentionally-inverted descending direction — only the key set is unified). No behavior change; the #3570/#3579 lockstep guard stays green and now structurally can't drift. Scoped to the 5-value family only — the distinct 4-value and major/minor/suggestion vocabularies are untouched. consensus_vote 5/0.
