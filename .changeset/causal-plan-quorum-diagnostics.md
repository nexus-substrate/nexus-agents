---
'nexus-agents': patch
---

Preserve the canonical no-quorum cause in pipeline plan-vote diagnostics. Fully returned panels with insufficient absolute approvals now report the approval-floor cause instead of a missing voter. Missing, errored and unverifiable seats retain their own causes, with redacted bounded output and neutral wording when unavailable. Decisions, quorum thresholds and error-void recording remain unchanged.
