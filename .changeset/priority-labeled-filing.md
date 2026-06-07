---
'nexus-agents': patch
---

feat(capability-loop): p0–p4 priority labels on auto-filed issues (#3653)

improvement_review's issue filing now labels each auto-filed signal with its p0–p4
priority (via classifySignalPriority — security always p0, fail-closed) alongside
its category, so the priority that drives the auto-remediation consensus rigor is
visible on the issue. Priority is computed from typed signal fields only (never
from untrusted input), so an issue can't steer its own tag. Extends the existing
deduped, rate-limited, no-shell filing path (DRY) rather than forking.
